import { assertMarkupBudget } from './markup-budget.mjs';
import { createHash } from 'node:crypto';
import { plain, iso } from './news-format.mjs';
import { boundedJson } from './safe-io.mjs';
import { SweepError, safeDiagnostic } from './diagnostics.mjs';
import { SOURCES } from './source-registry.mjs';
import { validateSourceRequest } from './source-request-policy.mjs';

/** Retain exact home-relative targets only as review candidates; never execute a rule here.
 * @example candidatePath('/Users/<user>/Library/LaunchAgents/example.plist')
 */
function candidatePath(value) {
  const path = value.replace(/^\/Users\/<(?:user|username)>\//i, '').replace(/^~\//, '');
  if (path === value || path.length > 300 || path.split('/').some(part => !part || part === '.' || part === '..') || /[\x00-\x1f\\*?]/.test(path)
    || /(?:^|\/)(?:\.ssh|\.aws|\.gnupg|\.env(?:\.[^/]*)?|Cookies|Login Data|Keychains|authorized_keys|id_rsa|id_ed25519|credentials|tokens?|secrets?)(?:\/|$)/i.test(path)) return null;
  return path;
}

/** Extract typed candidate facts, not executable patterns or verified malware judgments.
 * Called only for fixed-provider articles directly linked from current recurring feeds.
 * @example parseIocCandidates(html, {sourceId:'microsoft-security',sourceUrl:article, publishedAt:date})
 */
export function parseIocCandidates(text, metadata, format = 'html') {
  const candidates = [], unsupported = {};
  const skip = reason => { unsupported[reason] = (unsupported[reason] || 0) + 1; };
  const add = fields => {
    if (candidates.length >= 1000) { skip('candidate-cap'); return; }
    const id = createHash('sha256').update(`${metadata.sourceUrl}:${fields.type}:${fields.value}:${fields.relativePath || ''}`).digest('hex').slice(0, 24);
    candidates.push({ ...metadata, id: `IOC-CANDIDATE-${id}`, ...fields, verified: false, reasonCode: 'IOC_CONTEXT_REVIEW_REQUIRED' });
  };
  if (format === 'stix') {
    const data = boundedJson(text);
    if (data?.type !== 'bundle' || !Array.isArray(data.objects) || data.objects.length > 5000) throw new SweepError('SOURCE', { cause: 'malformed', operation: 'news' });
    for (const object of data.objects) {
      // Compound STIX/YARA expressions are counted, never interpreted or retained.
      if (!object || typeof object.type !== 'string' || typeof object.id !== 'string' || object.id.length > 250 || object.spec_version !== '2.1') { skip('unsupported-object-schema'); continue; }
      if (object.type === 'indicator') { skip(object.pattern_type === 'yara' ? 'unsupported-yara' : 'unsupported-stix-pattern'); continue; }
      if (object.type !== 'file') continue;
      const hash = object.hashes?.['SHA-256'];
      if (typeof hash !== 'string' || !/^[a-fA-F0-9]{64}$/.test(hash)) { skip('unsupported-file-hash'); continue; }
      const path = typeof object.name === 'string' ? candidatePath(object.name) : null;
      add({ type: 'sha256', value: hash.toLowerCase(), ...(path ? { relativePath: path } : {}), platform: 'unknown' });
      if (!path) skip('unknown-exact-file-target');
    }
  } else {
    assertMarkupBudget(text);
    const body = plain(text);
    // An OS mention only labels a candidate. It cannot establish malicious attribution.
    const platform = /\bmacOS\b|\bMac OS\b/i.test(body) ? 'darwin' : /\bLinux\b/i.test(body) ? 'linux' : 'unknown';
    for (const [, row] of text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(match => plain(match[1]));
      const hashes = cells.filter(value => /^[a-fA-F0-9]{64}$/.test(value));
      if (!hashes.length) continue;
      const path = cells.map(candidatePath).find(Boolean);
      for (const hash of hashes) add({ type: 'sha256', value: hash.toLowerCase(), ...(path ? { relativePath: path } : {}), platform });
      if (!path) skip('unknown-exact-file-target');
    }
  }
  return { candidates: [...new Map(candidates.map(value => [value.id, value])).values()], unsupported, rules: format === 'html' ? verifiedMicrosoftTable(text, metadata) : [] };
}

/** Recognize a reviewed vendor IOC table only when its context binds exact targets to macOS malware.
 * The collector calls this after schema parsing; free-form prose and unbound hashes never create rules.
 * @example verifiedMicrosoftTable(html, metadata)
 */
function verifiedMicrosoftTable(text, metadata) {
  let url;
  try { url = new URL(metadata.sourceUrl); } catch { return []; }
  const publishedAt = iso(metadata.publishedAt), fetchedAt = iso(metadata.fetchedAt);
  if (metadata.sourceId !== 'microsoft-security' || url.hostname !== 'www.microsoft.com' || !validateSourceRequest(url.href, { authorizedPaths: new Set([url.pathname]) })
    || !publishedAt || !fetchedAt || publishedAt > fetchedAt || !/\bmacOS\b/i.test(plain(text.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || ''))) return [];
  const section = [...text.matchAll(/<h([2-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].find(match => /^Indicators of compromise$/i.test(plain(match[2])));
  if (!section) return [];
  const tail = text.slice(section.index + section[0].length);
  const end = tail.search(new RegExp(`<h[2-${section[1]}]\\b`, 'i'));
  const sectionText = end >= 0 ? tail.slice(0, end) : tail;
  const iocs = [];
  for (const [, table] of sectionText.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(match => [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => plain(cell[1])));
    const header = rows[0] || [], hashIndex = header.findIndex(value => /^SHA[- ]?256$/i.test(value)), fileIndex = header.findIndex(value => /^(?:File(?: name| path)?|Path)$/i.test(value));
    if (hashIndex < 0 || fileIndex < 0 || hashIndex === fileIndex) continue;
    for (const row of rows.slice(1)) {
      const value = row[hashIndex], relativePath = typeof row[fileIndex] === 'string' ? candidatePath(row[fileIndex]) : null;
      if (!relativePath || typeof value !== 'string' || !/^[a-fA-F0-9]{64}$/.test(value)) continue;
      if (iocs.length < 100) iocs.push({ type: 'sha256', target: 'exact-file', relativePath, value: value.toLowerCase(), strong: true });
    }
  }
  if (!iocs.length) return [];
  const id = createHash('sha256').update(metadata.sourceUrl).digest('hex').slice(0, 24);
  return [{ id: `IOC-MS-${id}`, product: 'macOS', platform: 'darwin', sourceUrl: metadata.sourceUrl, verified: true,
    verifiedAt: fetchedAt, expiresAt: new Date(Date.parse(fetchedAt) + 7 * 86400000).toISOString(), iocs,
    verificationMethod: 'microsoft-macos-explicit-ioc-table-v1', publishedAt }];
}

/** Discover current attributed IOC candidates under the shared deadline and fixed URL policy.
 * The host must review context before supplying separately validated rules to the scanner.
 * @example discoverIocs(newsItems, context)
 */
export async function discoverIocs(items, context) {
  const candidates = [], rules = [], coverage = [], pendingArticles = [];
  let attachments = 0;
  const sourceSet = SOURCES.filter(source => source.iocDiscovery);
  for (const source of sourceSet) {
    const available = items.filter(value => value.sourceId === source.id).sort((a, b) => String(b.updatedAt || b.publishedAt).localeCompare(String(a.updatedAt || a.publishedAt)));
    const eligible = [];
    for (const entry of available) {
      try {
        const url = new URL(entry.url); url.hash = '';
        if (!validateSourceRequest(url.href, { authorizedPaths: new Set([url.pathname]) })) continue;
        eligible.push({ entry, url });
      } catch { /* Malformed source links are never fetched. */ }
    }
    pendingArticles.push(...eligible.slice(3).map(({ url }) => ({ sourceId: source.id, url: url.href })));
    let count = 0, unsupported = 0, fetched = 0;
    for (const { entry, url } of eligible.slice(0, 3)) {
      try {
        context.check();
        const options = { maxBytes: 2 * 1024 ** 2, authorizedPaths: new Set([url.pathname]), sourceId: source.id, schema: 'ioc-article-v1' };
        const response = await context.request(url.href, options);
        if (!response.ok) throw new SweepError('HTTP', { cause: 'http', operation: 'news' });
        const text = await response.text(); fetched++;
        const metadata = { sourceId: source.id, sourceUrl: url.href, publishedAt: iso(entry.publishedAt), updatedAt: iso(entry.updatedAt), fetchedAt: new Date(context.wallNow()).toISOString() };
        const parsed = parseIocCandidates(text, metadata);
        candidates.push(...parsed.candidates); rules.push(...parsed.rules); count += parsed.candidates.length; unsupported += Object.values(parsed.unsupported).reduce((sum, value) => sum + value, 0);
        // Only CISA's same-provider JSON attachments are eligible; payload archives/C2 are excluded.
        const paths = source.id.startsWith('cisa-') ? [...new Set([...text.matchAll(/href=["']([^"']+\.json)["']/gi)].flatMap(match => {
          try { const linked = new URL(match[1], url); return validateSourceRequest(linked.href, { authorizedPaths: new Set([linked.pathname]) }) && linked.hostname === 'www.cisa.gov' ? [linked.pathname] : []; } catch { return []; }
        }))] : [];
        for (const path of paths.slice(0, 2)) {
          if (attachments >= 16) { unsupported++; break; }
          attachments++;
          const attachment = await context.request(`https://www.cisa.gov${path}`, { maxBytes: 2 * 1024 ** 2, authorizedPaths: new Set([path]), sourceId: source.id, schema: 'stix-2.1-subset' });
          if (!attachment.ok) throw new SweepError('HTTP', { cause: 'http', operation: 'news' });
          const parsedAttachment = parseIocCandidates(await attachment.text(), { ...metadata, sourceUrl: `https://www.cisa.gov${path}` }, 'stix');
          candidates.push(...parsedAttachment.candidates); count += parsedAttachment.candidates.length; unsupported += Object.values(parsedAttachment.unsupported).reduce((sum, value) => sum + value, 0);
        }
      } catch (error) {
        pendingArticles.push({ sourceId: source.id, url: url.href });
        coverage.push({ area: 'ioc-discovery', sourceId: source.id, status: 'partial', reasonCode: 'IOC_SOURCE_UNAVAILABLE', diagnostic: safeDiagnostic(error, 'SOURCE', 'news') });
      }
    }
    coverage.push({ area: 'ioc-discovery', sourceId: source.id, status: 'partial', count, fetched, unsupported, pending: pendingArticles.filter(value => value.sourceId === source.id).length,
      reasonCode: count ? 'IOC_CONTEXT_REVIEW_REQUIRED' : 'NO_VERIFIED_APPLICABLE_IOC' });
  }
  if (candidates.length > 1000) coverage.push({ area: 'ioc-discovery', status: 'partial', reasonCode: 'IOC_CANDIDATE_LIMIT', omitted: candidates.length - 1000 });
  return { rules, candidates: candidates.slice(0, 1000), coverage, pendingArticles: pendingArticles.slice(0, 1000), attachmentCount: attachments,
    status: 'partial', reasonCode: 'IOC_CONTEXT_REVIEW_REQUIRED' };
}
