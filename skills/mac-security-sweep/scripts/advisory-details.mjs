import { createRunContext } from './runtime.mjs';
import { boundedJson, LIMITS } from './safe-io.mjs';
import { SweepError, safeDiagnostic } from './diagnostics.mjs';
import { validPackage } from './package-formats.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,120}$/;
const LABELS = new Set(['CRITICAL', 'HIGH', 'MODERATE', 'MEDIUM', 'LOW', 'UNKNOWN', 'NONE']);
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const safeText = (value, length = 500) => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/<[^>]*>/g, '').slice(0, length) : '';

/** severityの既知形式だけを保持する。詳細・cacheの自由文字列を診断へ流さない。 @example severityValue('CVSS:3.1/AV:N/AC:L') */
function severityValue(value) {
  if (typeof value === 'object' && value) return severityValue(value.level || value.raw || value.score);
  if (typeof value === 'number' && value >= 0 && value <= 10) return value;
  if (typeof value !== 'string' || value.length > 300) return '未評価';
  if (LABELS.has(value.toUpperCase()) || /^(?:10(?:\.0)?|[0-9](?:\.\d)?)$/.test(value) || /^CVSS:[34]\.[01](?:\/[A-Za-z]{1,4}:[A-Za-z0-9]{1,4}){3,30}$/.test(value)) return value;
  return '未評価';
}

/** 詳細の許可フィールドだけを投影する。HTTP応答と過去cacheを同じ契約で扱う。 @example projectDetail(data,{id:'GHSA-example',now:Date.now()}) */
function projectDetail(data, { id, now, cached = false, news }) {
  const fixed = cached ? data.fixed : (Array.isArray(data.affected) ? data.affected : []).flatMap(affected => (Array.isArray(affected.ranges) ? affected.ranges : [])
    .flatMap(range => (Array.isArray(range.events) ? range.events : []).filter(event => typeof event.fixed === 'string')
      .map(event => ({ name: affected.package?.name, ecosystem: affected.package?.ecosystem, version: event.fixed }))));
  const severity = severityValue(data.database_specific?.severity || news?.severity || data.severity);
  const sourceVectors = Array.isArray(data.severity) ? data.severity : cached && Array.isArray(data.severityDetails) ? data.severityDetails : [];
  const aliases = [...new Set((Array.isArray(data.aliases) ? data.aliases : []).filter(alias => typeof alias === 'string' && ID.test(alias)))];
  // 上限を超えた詳細は完了cacheにせず、同じIDを次回の未処理として残す。
  if (sourceVectors.length > 10 || aliases.length > 100 || Array.isArray(fixed) && fixed.length > 500) throw new SweepError('CAPACITY', { cause: 'limit', operation: 'details' });
  const vectors = sourceVectors
    .flatMap(entry => ['CVSS_V2', 'CVSS_V3', 'CVSS_V4'].includes(entry.type || entry.method) ? [{ method: entry.type || entry.method, raw: severityValue(entry.score ?? entry.raw), source: 'OSV' }] : []);
  const label = severity === '未評価' && vectors.length ? vectors[0].raw : severity;
  return { id, summary: safeText(data.summary), aliases,
    modified: iso(data.modified), withdrawn: iso(data.withdrawn), fetchedAt: cached ? iso(data.fetchedAt) : new Date(now).toISOString(),
    severity: label, severityDetails: vectors, severityEvidence: vectors, advisoryType: /^MAL-/.test(id) || data.advisoryType === 'malware' || news?.advisoryType === 'malware' ? 'malware' : 'vulnerability',
    fixed: (Array.isArray(fixed) ? fixed : []).filter(validPackage).map(({ name, ecosystem, version }) => ({ name, ecosystem, version })) };
}

/** 現在の照会結果に含まれる公開IDだけを取得する。runnerが照会完了後に呼ぶ。 @example await enrichAdvisories(findings,deadline,fetch,{context,previous}) */
export async function enrichAdvisories(findings, deadline, fetchImpl = globalThis.fetch, options = {}) {
  const context = options.context || options.ctx || createRunContext({ fetchImpl, budgetMs: 240000 });
  const owned = !options.context && !options.ctx;
  const now = context.wallNow;
  const started = now();
  const metadata = new Map((options.news?.items || []).filter(item => ID.test(item.id || '')).map(item => [item.id, item]));
  const knownExploited = new Set((options.news?.knownExploitedIds || []).filter(id => typeof id === 'string' && ID.test(id)));
  const current = new Map();
  for (const finding of findings) if (finding && ID.test(finding.id || '')) {
    const value = current.get(finding.id) || { id: finding.id, modified: null, priority: 0 };
    const modified = iso(finding.modified);
    if (modified && (!value.modified || Date.parse(modified) > Date.parse(value.modified))) value.modified = modified;
    const severity = severityValue(finding.severity || metadata.get(finding.id)?.severity);
    value.priority = Math.max(value.priority, /^MAL-/.test(finding.id) || finding.knownExploited ? 5 : /CRITICAL/i.test(String(severity)) ? 4 : /HIGH/i.test(String(severity)) ? 3 : /LOW/i.test(String(severity)) ? 1 : 2);
    current.set(finding.id, value);
  }
  const authorizedIds = new Set(current.keys());
  const details = new Map();
  const previous = options.continuationVerified === true || context.continuationVerified === true ? options.previous || {} : {};
  if ((previous.cache?.length || 0) > 30000 || (previous.pendingIds?.length || 0) > 30000 || current.size > 30000) {
    if (owned) await context.close();
    throw new SweepError('CAPACITY', { cause: 'limit', operation: 'details' });
  }
  for (const cached of Array.isArray(previous.cache) ? previous.cache : []) {
    if (!cached || !authorizedIds.has(cached.id)) continue;
    let item;
    try { item = projectDetail(cached, { id: cached.id, now: started, cached: true, news: metadata.get(cached.id) }); }
    catch { continue; } // 不完全なcacheは現在の許可IDを再取得して置き換える。
    const age = started - Date.parse(item.fetchedAt), modified = current.get(item.id).modified;
    if (age >= 0 && age < 7 * 86400000 && (!modified || item.modified && Date.parse(item.modified) >= Date.parse(modified))) details.set(item.id, item);
  }
  const oldPending = new Map((Array.isArray(previous.pendingIds) ? previous.pendingIds : []).filter(id => authorizedIds.has(id)).map((id, index) => [id, index]));
  const needed = [...current.values()].filter(item => !details.has(item.id)).sort((a, b) => {
    // 以前の未処理を優先し、新規重大告知の連続追加でも詳細を取り残さない。
    if (oldPending.has(a.id) || oldPending.has(b.id)) return Number(oldPending.has(b.id)) - Number(oldPending.has(a.id)) || oldPending.get(a.id) - oldPending.get(b.id);
    return b.priority - a.priority || a.id.localeCompare(b.id);
  }).map(item => item.id);
  const maxDetails = options.maxDetails ?? 80;
  if (!Number.isSafeInteger(maxDetails) || maxDetails < 1 || maxDetails > 80) { if (owned) await context.close(); throw new SweepError('CONFIG', { cause: 'limit', operation: 'details' }); }
  const selected = needed.slice(0, maxDetails);
  const failures = [];
  const attemptedIds = new Set();
  let requested = 0;
  const snapshot = () => {
    const pendingIds = [...needed.filter(id => !details.has(id) && !attemptedIds.has(id)), ...needed.filter(id => !details.has(id) && attemptedIds.has(id))];
    const list = [...details.values()].sort((a, b) => a.id.localeCompare(b.id)).map(item => ({ ...item, knownExploited: [item.id, ...item.aliases].some(id => knownExploited.has(id)) }));
    return { schemaVersion: 2, details: list, continuation: { pendingIds, cache: list },
      coverage: [{ area: 'osv-details', status: pendingIds.length ? 'partial' : 'complete', count: list.length, requested, total: current.size,
        failed: failures.length, deferred: pendingIds.length > failures.length, reason: '現在の許可query結果のIDのみGET。応答ID一致を検証し、未処理詳細を保持' }], diagnostics: failures.map(item => item.diagnostic),
      commands: [{ operation: 'osv-details', status: pendingIds.length ? 'partial' : 'complete', count: requested - failures.length, elapsedMs: now() - started }] };
  };
  try {
    for (let offset = 0; offset < selected.length; offset += 6) {
      if (now() >= deadline || context.signal.aborted) break;
      await Promise.all(selected.slice(offset, offset + 6).map(async id => {
        requested += 1;
        attemptedIds.add(id);
        try {
          context.check();
          const response = await context.request(`https://api.osv.dev/v1/vulns/${id}`, { authorizedIds, maxBytes: LIMITS.detail, timeoutMs: Math.max(1, Math.min(15000, deadline - now())) });
          if (!response.ok) throw new SweepError('HTTP', { cause: response.status === 429 ? 'cooldown' : 'http', operation: 'details' });
          const data = boundedJson(await response.text(), { maxRecords: 50000 });
          if (!data || data.id !== id) throw new SweepError('FORMAT', { cause: 'mismatch', operation: 'details' });
          details.set(id, projectDetail(data, { id, now: now(), news: metadata.get(id) }));
        } catch (error) { failures.push({ id, diagnostic: safeDiagnostic(error, 'HTTP', 'details') }); }
      }));
      await context.checkpoint({ stage: 'details', value: snapshot() });
    }
    return snapshot();
  } finally { if (owned) await context.close(); }
}
