import { assertMarkupBudget } from './markup-budget.mjs';
import { plain, iso, item } from './news-format.mjs';
import { boundedJson } from './safe-io.mjs';
import { SweepError } from './diagnostics.mjs';
import { normalizeSeverity } from './assessment.mjs';

/** Parse official index links without executing HTML; used by finite source adapters.
 * @example sourceLinks(html, source.url)
 */
function sourceLinks(text, base) {
  assertMarkupBudget(text);
  return [...text.matchAll(/<a\b[^>]*href=(?:["']([^"']+)["']|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi)].flatMap(match => {
    try {
      const url = new URL(match[1] || match[2], base);
      return url.origin === new URL(base).origin && !url.username && !url.password && !url.search ? [{ url, title: plain(match[3]), offset: match.index }] : [];
    } catch { return []; }
  });
}

/** Read dated official index entries; news collection calls this for reviewed HTML schemas.
 * Missing dates stay unknown; changing an index never becomes a vulnerability publication date.
 * @example parseOfficialIndex(html, source)
 */
export function parseOfficialIndex(text, source) {
  const links = sourceLinks(text, source.url);
  const result = [];
  const headings = source.kind === 'mozilla-index' ? [...text.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map(match => ({ offset: match.index, date: iso(`${plain(match[1])} UTC`) })) : [];
  const rows = source.kind === 'oracle' ? [...text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(match => ({ offset: match.index, end: match.index + match[0].length,
    cells: [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => plain(cell[1])) })) : [];
  let headingIndex = -1, rowIndex = -1;
  for (const link of links) {
    let publishedAt, publishedMonth, updatedAt, precision = 'day', title = link.title;
    if (source.kind === 'openjdk') {
      const date = /\/advisories\/(\d{4}-\d{2}-\d{2})$/.exec(link.url.pathname)?.[1];
      if (!date) continue;
      publishedAt = iso(date); title = `OpenJDK security advisory ${date}`;
    } else if (source.kind === 'ruby-security') {
      const date = /^\/en\/news\/(\d{4})\/(\d{2})\/(\d{2})\//.exec(link.url.pathname);
      if (!date) continue;
      publishedAt = iso(`${date[1]}-${date[2]}-${date[3]}`);
    } else if (source.kind === 'mozilla-index') {
      if (!/^\/en-US\/security\/advisories\/mfsa\d{4}-\d+\/$/.test(link.url.pathname)) continue;
      while (headingIndex + 1 < headings.length && headings[headingIndex + 1].offset < link.offset) headingIndex++;
      publishedAt = headings[headingIndex]?.date || null;
    } else if (source.kind === 'oracle') {
      if (!/^\/security-alerts\/(?:cpu|cspu|alert-)[a-zA-Z0-9-]+\.html$/.test(link.url.pathname)) continue;
      const date = /(?:cpu|cspu)(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(\d{4})\.html$/i.exec(link.url.pathname);
      if (date) { publishedMonth = `${date[2]}-${String(['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(date[1].toLowerCase()) + 1).padStart(2, '0')}`; precision = 'month'; }
      // Only the same table row's explicit revision date supplies an update day; the CPU month never does.
      while (rowIndex + 1 < rows.length && rows[rowIndex + 1].offset <= link.offset) rowIndex++;
      const row = rows[rowIndex], revision = row && link.offset < row.end ? /^Rev(?:ision)?\s+\d+(?:\.\d+)?,\s*(\d{1,2} [A-Za-z]+ \d{4})$/.exec(row.cells[1] || '') : null;
      if (revision) { updatedAt = iso(`${revision[1]} UTC`); if (updatedAt) precision = 'day'; }
    } else throw new SweepError('SOURCE', { cause: 'unsupported', operation: 'news' });
    result.push(item(source, { title, url: link.url.href, publishedAt, ...(publishedMonth ? { publishedMonth } : {}), updatedAt,
      datePrecision: publishedAt || publishedMonth || updatedAt ? precision : 'unknown', ...(updatedAt ? { dateSemantics: 'vendor-last-updated' } : {}),
      aliases: [...new Set(title.match(/CVE-\d{4}-\d{4,10}/g) || [])], reasonCode: 'OFFICIAL_INDEX_REQUIRES_RANGE_REVIEW' }));
  }
  // A changed or login page must not look like a successful empty security index.
  if (!result.length || result.length > 5000) throw new SweepError('SOURCE', { cause: 'malformed', operation: 'news' });
  return [...new Map(result.map(value => [value.url, value])).values()];
}

/** Read Docker's dated announcement sections when its RSS omits every article date.
 * News collection calls this only for the fixed official page; yearless release dates stay unknown.
 * @example parseDockerAnnouncements(html, source)
 */
export function parseDockerAnnouncements(text, source) {
  assertMarkupBudget(text);
  const headings = [...text.matchAll(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi)];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  if (!headings.length || headings.length > 5000) throw new SweepError('SOURCE', { cause: 'malformed', operation: 'news' });
  const entries = [];
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index], slug = /\bid=(?:["']([a-z0-9-]{1,250})["']|([a-z0-9-]{1,250})(?=\s|$))/i.exec(heading[1]);
    if (!slug) continue;
    const title = plain(heading[2]);
    const body = plain(text.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? text.length));
    // Only the section's explicit update label supplies a date; CVE years and page build times do not.
    const date = /^Last updated (January|February|March|April|May|June|July|August|September|October|November|December)(?: ([1-9]|[12]\d|3[01]),)? (\d{4})\b/.exec(body);
    let updatedAt = null, updatedMonth;
    if (date) {
      const month = `${date[3]}-${String(months.indexOf(date[1]) + 1).padStart(2, '0')}`;
      if (date[2]) {
        const calendar = `${month}-${String(date[2]).padStart(2, '0')}`, parsed = iso(calendar);
        if (parsed?.startsWith(calendar)) updatedAt = parsed;
      } else updatedMonth = month;
    }
    entries.push(item(source, { title, url: `${source.url}#${slug[1] || slug[2]}`, summary: body,
      publishedAt: null, updatedAt, ...(updatedMonth ? { updatedMonth } : {}), datePrecision: updatedMonth ? 'month' : updatedAt ? 'day' : 'unknown', dateSemantics: 'vendor-last-updated',
      aliases: [...new Set(`${title} ${body}`.match(/CVE-\d{4}-\d{4,10}/g) || [])], reasonCode: updatedAt || updatedMonth ? 'OFFICIAL_ANNOUNCEMENT_REQUIRES_RANGE_REVIEW' : 'SOURCE_UNDATED_ITEMS' }));
  }
  if (!entries.length) throw new SweepError('SOURCE', { cause: 'malformed', operation: 'news' });
  return entries;
}

/** Validate the OpenSSL CVE-file index; returned paths authorize bounded detail requests.
 * @example openSslPaths(html, source)
 */
export function openSslPaths(text, source) {
  const paths = [...new Set(sourceLinks(text, source.url).filter(link => /^\/news\/secjson\/cve-\d{4}-\d{4,10}\.json$/i.test(link.url.pathname)).map(link => link.url.pathname))];
  if (!paths.length || paths.length > 5000) throw new SweepError('SOURCE', { cause: 'malformed', operation: 'news' });
  return paths;
}

/** Keep CVE CNA ranges as attributed data; no generic version comparator runs here.
 * @example parseOpenSslCve(JSON.stringify(record), source)
 */
export function parseOpenSslCve(text, source) {
  const data = boundedJson(text);
  const cna = data?.containers?.cna;
  if (data.dataType !== 'CVE_RECORD' || !/^5\.[01](?:\.\d+)?$/.test(data.dataVersion || '') || !/^CVE-\d{4}-\d{4,10}$/.test(data.cveMetadata?.cveId || '')
    || !cna || !Array.isArray(cna.affected) || cna.affected.length > 100 || !Array.isArray(cna.descriptions)) throw new SweepError('SOURCE', { cause: 'malformed', operation: 'news' });
  const affected = cna.affected.map(product => {
    if (product.vendor !== 'OpenSSL' || product.product !== 'OpenSSL' || !Array.isArray(product.versions) || product.versions.length > 100) throw new SweepError('SOURCE', { cause: 'unsupported', operation: 'news' });
    return { name: product.product, vendor: product.vendor, defaultStatus: product.defaultStatus,
      versions: product.versions.map(version => ({ version: typeof version.version === 'string' ? version.version.slice(0, 100) : null,
        lessThan: typeof version.lessThan === 'string' ? version.lessThan.slice(0, 100) : null, status: ['affected', 'unaffected', 'unknown'].includes(version.status) ? version.status : 'unknown',
        versionType: typeof version.versionType === 'string' ? version.versionType.slice(0, 40) : null })) };
  });
  const severity = (cna.metrics || []).flatMap(value => [value.cvssV4_0?.baseScore, value.cvssV3_1?.baseScore, value.cvssV3_0?.baseScore]).find(value => typeof value === 'number');
  return item(source, { id: data.cveMetadata.cveId, title: cna.title || data.cveMetadata.cveId,
    url: `https://openssl-library.org/news/secjson/${data.cveMetadata.cveId.toLowerCase()}.json`,
    publishedAt: cna.datePublic || data.cveMetadata.datePublished, updatedAt: data.cveMetadata.dateUpdated,
    summary: cna.descriptions.find(value => value.lang === 'en')?.value || '', products: ['OpenSSL'], affected,
    fixed: affected.flatMap(value => value.versions.filter(version => version.status === 'affected' && version.lessThan).map(version => ({ name: 'OpenSSL', version: version.lessThan }))),
    aliases: [data.cveMetadata.cveId], severity: normalizeSeverity(severity === undefined ? null : { type: 'CVSS_V3', score: severity }, source.name),
    withdrawnAt: data.cveMetadata.state === 'REJECTED' ? iso(data.cveMetadata.dateUpdated) : null, needsReview: true });
}

/** Project Red Hat's public-date list without inventing other RPM distributions' status.
 * @example parseRedHatList(body, source)
 */
export function parseRedHatList(text, source) {
  const wire = boundedJson(text);
  // The official endpoint also serves one JSON-string envelope; validate both layers with the same bounds.
  const data = typeof wire === 'string' ? boundedJson(wire) : wire;
  if (!Array.isArray(data) || data.length > 100) throw new SweepError('SOURCE', { cause: 'malformed', operation: 'news' });
  return data.map(value => {
    if (!/^CVE-\d{4}-\d{4,10}$/.test(value.CVE || '') || !iso(value.public_date)) throw new SweepError('SOURCE', { cause: 'malformed', operation: 'news' });
    return item(source, { id: `RH-${value.CVE}`, aliases: [value.CVE], title: value.bugzilla_description || value.CVE,
      url: `https://access.redhat.com/security/cve/${value.CVE}`, publishedAt: value.public_date,
      severity: normalizeSeverity(value.severity, source.name), products: ['Red Hat Enterprise Linux'],
      summary: 'Red Hat public CVE record; exact release and package state require a separate check.', reasonCode: 'DISTRO_IDENTITY_REQUIRED' });
  });
}

/** Read one declared Alpine branch snapshot; undated fixes are never dated with HTTP mtime.
 * @example parseAlpineSnapshot(body, source)
 */
export function parseAlpineSnapshot(text, source) {
  const data = boundedJson(text);
  if (data.distroversion !== 'v3.22' || data.reponame !== 'main' || !Array.isArray(data.packages) || data.packages.length > 5000) throw new SweepError('SOURCE', { cause: 'malformed', operation: 'news' });
  return data.packages.flatMap(value => {
    const pkg = value.pkg;
    if (!pkg || typeof pkg.name !== 'string' || !/^[a-z0-9+_.-]{1,150}$/.test(pkg.name) || !pkg.secfixes || typeof pkg.secfixes !== 'object' || Array.isArray(pkg.secfixes)) throw new SweepError('SOURCE', { cause: 'malformed', operation: 'news' });
    return Object.entries(pkg.secfixes).map(([version, cves]) => {
      if (version.length > 100 || !Array.isArray(cves) || cves.length > 500) throw new SweepError('SOURCE', { cause: 'malformed', operation: 'news' });
      const aliases = [...new Set(cves.flatMap(value => typeof value === 'string' ? value.match(/CVE-\d{4}-\d{4,10}/g) || [] : []))];
      return item(source, { id: `ALPINE-v3.22-main-${pkg.name}-${version}`, title: `${pkg.name} ${version} — Alpine 3.22 main security fixes`,
        url: 'https://secdb.alpinelinux.org/v3.22/main.json', products: ['Alpine Linux'], aliases, fixed: [{ name: pkg.name, version }],
        publishedAt: null, updatedAt: null, datePrecision: 'unknown', distribution: 'alpine', distributionRelease: '3.22', repository: 'main', reasonCode: 'UNDATED_FIX_SNAPSHOT' });
    });
  });
}
