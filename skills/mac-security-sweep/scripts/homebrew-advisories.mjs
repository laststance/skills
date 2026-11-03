import { createHash } from 'node:crypto';
import { boundedJson } from './safe-io.mjs';
import { SweepError, safeDiagnostic } from './diagnostics.mjs';
import { normalizeSeverity, validAdvisoryId } from './assessment.mjs';
import { HOMEBREW_RECENT_COMMITS } from './source-request-policy.mjs';

const TREE = 'https://api.github.com/repos/Homebrew/advisory-database/git/trees/main?recursive=1';
const RAW = 'https://raw.githubusercontent.com/Homebrew/advisory-database/main/';
const PATH = /^advisories\/BREW-[A-Za-z0-9@+_.-]{1,240}\.json$/;
const VERSION = /^\d+(?:\.\d+){0,5}(?:_\d+)?$/;
const MAX_TREE_RECORDS = 20000;

/** 最新の公式変更に含まれるpathを現在treeのblobへ束縛する。ニュース取得が名前順より先に読む対象を決める。
 * @example await recentBrewPaths(context, tree)
 */
async function recentBrewPaths(context, tree, maxRecords) {
  const response = await context.request(HOMEBREW_RECENT_COMMITS, { sourceId: 'homebrew', maxBytes: 512 * 1024 });
  if (!response.ok) throw new SweepError('HTTP', { cause: 'http', operation: 'baseline' });
  const commits = boundedJson(await response.text());
  if (!Array.isArray(commits) || commits.length !== 1 || !/^[a-f0-9]{40}$/.test(commits[0]?.sha || '')) throw new SweepError('SOURCE', { cause: 'malformed', operation: 'baseline' });
  const sha = commits[0].sha;
  const detail = await context.request(`https://api.github.com/repos/Homebrew/advisory-database/commits/${sha}?per_page=100`, { sourceId: 'homebrew', authorizedCommits: new Set([sha]) });
  if (!detail.ok) throw new SweepError('HTTP', { cause: 'http', operation: 'baseline' });
  const data = boundedJson(await detail.text());
  if (data.sha !== sha || !/^[a-f0-9]{40}$/.test(data.commit?.tree?.sha || '') || !Array.isArray(data.files) || data.files.length > 100) throw new SweepError('SOURCE', { cause: 'malformed', operation: 'baseline' });
  const current = new Map(tree.map(entry => [entry.path, entry.sha])), paths = [];
  for (const file of data.files) {
    // 削除済み・告知以外は本文の取得対象にしない。
    if (file.status === 'removed' || !PATH.test(file.filename || '')) continue;
    if (!/^[a-f0-9]{40}$/.test(file.sha || '') || current.get(file.filename) !== file.sha) throw new SweepError('SOURCE', { cause: 'mismatch', operation: 'baseline' });
    paths.push(file.filename);
  }
  const limited = /rel="next"/.test(detail.headers.get('link') || '');
  return { commit: sha, checkedAt: new Date(context.wallNow()).toISOString(), paths,
    indexStatus: paths.length && !limited ? 'complete' : 'partial', status: 'partial',
    reasonCode: limited ? 'LATEST_COMMIT_FILE_LIMIT' : paths.length > maxRecords ? 'LATEST_COMMIT_RECORD_LIMIT' : paths.length ? 'LATEST_COMMIT_BOUND_TO_TREE' : 'LATEST_COMMIT_WITHOUT_CURRENT_RECORD' };
}

/** 公式DBのversion_revisionを比較する。曖昧なupstream版は未評価にする。 @example compareBrewVersions('3.0.1_1', '3.0.1_2') */
export function compareBrewVersions(left, right) {
  if (![left, right].every(value => typeof value === 'string' && VERSION.test(value))) return null;
  const parse = value => { const [version, revision] = value.split('_'); return { parts: version.split('.').map(Number), revision: Number(revision || 0) }; };
  const a = parse(left), b = parse(right);
  for (let i = 0; i < Math.max(a.parts.length, b.parts.length); i++) {
    const x = a.parts[i] || 0, y = b.parts[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return a.revision === b.revision ? 0 : a.revision < b.revision ? -1 : 1;
}

/** 公式OSVレコードからHomebrew比較に必要な項目だけ採用する。取得とcache復元が呼ぶ。 @example parseBrewAdvisory(data) */
export function parseBrewAdvisory(data) {
  if (!data || !/^1\.[567]\.\d+$/.test(data.schema_version || '') || !/^BREW-[A-Za-z0-9@+_.-]{3,240}$/.test(data.id || '') || !Array.isArray(data.affected) || data.affected.length > 100) throw new SweepError('SOURCE', { cause: 'malformed', operation: 'baseline' });
  const affected = data.affected.map(entry => {
    const name = entry.package?.name;
    if (entry.package?.ecosystem !== 'Homebrew' || typeof name !== 'string' || !/^[a-z0-9][a-z0-9@+_.-]{0,100}$/.test(name)
      || entry.package.purl && ![`pkg:brew/${name}`, `pkg:brew/${encodeURIComponent(name)}`].includes(entry.package.purl) || !Array.isArray(entry.ranges) || entry.ranges.length > 20) throw new SweepError('SOURCE', { cause: 'malformed', operation: 'baseline' });
    const fixed = entry.ranges.flatMap(range => {
      if (range.type !== 'ECOSYSTEM' || !Array.isArray(range.events) || range.events.length > 100) throw new SweepError('SOURCE', { cause: 'unsupported', operation: 'baseline' });
      return range.events.filter(event => event.fixed).map(event => { if (!VERSION.test(event.fixed)) throw new SweepError('SOURCE', { cause: 'unsupported', operation: 'baseline' }); return event.fixed; });
    });
    if (!fixed.length) throw new SweepError('SOURCE', { cause: 'unsupported', operation: 'baseline' });
    return { name, fixed, fix: entry.ecosystem_specific?.fix === 'patch' ? 'patch' : 'unknown' };
  });
  return { id: data.id, affected, upstream: (Array.isArray(data.upstream) ? data.upstream : []).filter(validAdvisoryId).slice(0, 50),
    aliases: (Array.isArray(data.aliases) ? data.aliases : []).filter(validAdvisoryId).slice(0, 50),
    severity: normalizeSeverity(data.severity || data.database_specific?.severity, 'Homebrew Advisory Database'),
    published: Number.isFinite(Date.parse(data.published)) ? data.published : null,
    modified: Number.isFinite(Date.parse(data.modified)) ? data.modified : null,
    withdrawn: Number.isFinite(Date.parse(data.withdrawn)) ? data.withdrawn : null,
    sourceUrl: `https://github.com/Homebrew/advisory-database/blob/main/advisories/${data.id}.json` };
}

/** 射影済みcacheを再検証する。unknownフィールドやsecretを新しい証拠に転載しない。 @example restoreBrewRecord(cached) */
function restoreBrewRecord(value) {
  if (!value || !/^BREW-[A-Za-z0-9@+_.-]{3,240}$/.test(value.id || '') || !Array.isArray(value.affected) || value.affected.length > 100) return null;
  if (value.affected.some(entry => !/^[a-z0-9][a-z0-9@+_.-]{0,100}$/.test(entry.name || '') || !Array.isArray(entry.fixed) || entry.fixed.length > 100 || entry.fixed.some(version => !VERSION.test(version)))) return null;
  return { id: value.id, affected: value.affected.map(entry => ({ name: entry.name, fixed: entry.fixed, fix: entry.fix === 'patch' ? 'patch' : 'unknown' })),
    upstream: (Array.isArray(value.upstream) ? value.upstream : []).filter(validAdvisoryId).slice(0, 50), aliases: (Array.isArray(value.aliases) ? value.aliases : []).filter(validAdvisoryId).slice(0, 50),
    severity: normalizeSeverity(value.severity, 'Homebrew Advisory Database'), published: Number.isFinite(Date.parse(value.published)) ? value.published : null, modified: Number.isFinite(Date.parse(value.modified)) ? value.modified : null,
    withdrawn: Number.isFinite(Date.parse(value.withdrawn)) ? value.withdrawn : null,
    sourceUrl: `https://github.com/Homebrew/advisory-database/blob/main/advisories/${value.id}.json` };
}

/** 端末構成を送らず固定repository全体の公開snapshotを有限に取得する。adaptive段階が呼ぶ。 @example fetchHomebrewAdvisories(context, previous) */
export async function fetchHomebrewAdvisories(context, previous = {}, { maxRecords = 80, refresh = true, indexOnly = false, preferRecent = false, recentSnapshot, preferredFormulae = [], onProgress = async () => {} } = {}) {
  if (!Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > 80) throw new SweepError('CONFIG', { cause: 'limit', operation: 'baseline' });
  const now = context.wallNow();
  let tree = [], records = [], snapshotId = null, fetchedAt = null, pendingOrder = [], verifiedThisRun = false, recentUpdates = recentSnapshot;
  const attempted = new Set();
  const diagnostics = [];
  const fresh = previous.schemaVersion === 1 && Number.isFinite(Date.parse(previous.fetchedAt)) && now - Date.parse(previous.fetchedAt) >= 0 && now - Date.parse(previous.fetchedAt) < 86400000;
  if (fresh && /^[a-f0-9]{40}$/.test(previous.snapshotId || '') && Array.isArray(previous.tree) && previous.tree.length <= MAX_TREE_RECORDS
    && previous.tree.every(entry => PATH.test(entry.path || '') && /^[a-f0-9]{40}$/.test(entry.sha || ''))) {
    tree = previous.tree.map(entry => ({ path: entry.path, sha: entry.sha }));
    records = (Array.isArray(previous.records) ? previous.records : []).map(restoreBrewRecord).filter(Boolean).filter(value => tree.some(entry => entry.path === `advisories/${value.id}.json`));
    snapshotId = previous.snapshotId; fetchedAt = previous.fetchedAt;
    // 継続順序は同じ検証済みtreeのpathだけ復元し、秘密や任意URLを採用しない。
    const known = new Set(tree.map(entry => entry.path));
    if (Array.isArray(previous.pendingPaths) && previous.pendingPaths.length <= MAX_TREE_RECORDS) pendingOrder = previous.pendingPaths.filter(value => typeof value === 'string' && known.has(value));
  }
  try {
    if (refresh || !snapshotId) {
      const response = await context.request(TREE);
      if (!response.ok) throw new SweepError('HTTP', { cause: 'http', operation: 'baseline' });
      const data = boundedJson(await response.text(), { maxRecords: 200000 });
      if (!/^[a-f0-9]{40}$/.test(data.sha || '') || !Array.isArray(data.tree) || data.truncated === true) throw new SweepError('SOURCE', { cause: 'malformed', operation: 'baseline' });
      const candidates = data.tree.filter(entry => entry.type === 'blob' && entry.path?.startsWith('advisories/') && entry.path.endsWith('.json'));
      if (candidates.length > MAX_TREE_RECORDS || candidates.some(entry => !PATH.test(entry.path) || !/^[a-f0-9]{40}$/.test(entry.sha || '') || entry.size > 2 * 1024 ** 2)) throw new SweepError('CAPACITY', { cause: 'limit', operation: 'baseline' });
      // Cached records are reusable only when the freshly fetched tree has the same immutable identity.
      if (snapshotId !== data.sha) records = [];
      tree = candidates.map(entry => ({ path: entry.path, sha: entry.sha })).sort((a, b) => a.path.localeCompare(b.path));
      snapshotId = data.sha; fetchedAt = new Date(now).toISOString(); verifiedThisRun = true;
    }
    if (preferRecent) {
      try {
        recentUpdates = await recentBrewPaths(context, tree, maxRecords);
        pendingOrder = [...recentUpdates.paths, ...pendingOrder];
      } catch (error) {
        diagnostics.push(safeDiagnostic(error, 'SOURCE', 'baseline'));
        recentUpdates = { indexStatus: 'partial', status: 'partial', checkedAt: new Date(context.wallNow()).toISOString(), paths: [], reasonCode: 'LATEST_COMMIT_UNAVAILABLE' };
      }
    }
    const completed = new Set(records.map(record => `advisories/${record.id}.json`));
    const byPath = new Map(tree.map(entry => [entry.path, entry]));
    pendingOrder = [...new Set([...pendingOrder, ...byPath.keys()])].filter(path => !completed.has(path));
    const preferred = new Set(preferredFormulae.filter(value => typeof value === 'string' && /^[a-z0-9][a-z0-9@+_.-]{0,100}$/.test(value)));
    pendingOrder.sort((a, b) => Number([...preferred].some(name => b.startsWith(`advisories/BREW-${name}-`))) - Number([...preferred].some(name => a.startsWith(`advisories/BREW-${name}-`))));
    const pending = pendingOrder.map(path => byPath.get(path));
    // 永続失敗を末尾へ回し、未試行の公開レコードが次回も先頭に進めるようにする。
    const remainingPaths = () => {
      const done = new Set(records.map(record => `advisories/${record.id}.json`));
      return [...pendingOrder.filter(path => !attempted.has(path)), ...pendingOrder.filter(path => attempted.has(path))].filter(path => !done.has(path));
    };
    let serializedBytes = Buffer.byteLength(JSON.stringify({ tree, records }));
    let cursor = 0;
    await Promise.all(Array.from({ length: 2 }, async () => {
      while (!indexOnly && cursor < Math.min(pending.length, maxRecords)) {
        const entry = pending[cursor++];
        attempted.add(entry.path);
        try {
          context.check();
          const address = `${RAW}${entry.path}`;
          const response = await context.request(address, { maxBytes: 2 * 1024 ** 2, authorizedPaths: new Set([new URL(address).pathname]) });
          if (!response.ok) throw new SweepError('HTTP', { cause: 'http', operation: 'baseline' });
          const bytes = Buffer.from(await response.arrayBuffer());
          // main移動中の別blobを採用せず、公開treeで得たGit blob digestへ束縛する。
          const digest = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
          if (digest !== entry.sha) throw new SweepError('SOURCE', { cause: 'mismatch', operation: 'baseline' });
          const record = parseBrewAdvisory(boundedJson(bytes.toString('utf8')));
          if (entry.path !== `advisories/${record.id}.json`) throw new SweepError('SOURCE', { cause: 'mismatch', operation: 'baseline' });
          const recordBytes = Buffer.byteLength(JSON.stringify(record));
          if (serializedBytes + recordBytes > 16 * 1024 ** 2) throw new SweepError('CAPACITY', { cause: 'limit', operation: 'baseline' });
          serializedBytes += recordBytes;
          records.push(record);
          await onProgress({ records: [...records], status: 'partial', freshness: 'fresh', fetchedAt,
            coverage: [{ area: 'homebrew-advisory-database', status: 'partial', count: records.length, reason: '公開snapshotの取得を継続中' }],
            continuation: { schemaVersion: 1, snapshotId, fetchedAt, tree, records: [...records], pendingPaths: remainingPaths() } });
        } catch (error) { diagnostics.push(safeDiagnostic(error, 'SOURCE', 'baseline')); }
      }
    }));
  } catch (error) { diagnostics.push(safeDiagnostic(error, 'SOURCE', 'baseline')); }
  records.sort((a, b) => a.id.localeCompare(b.id));
  const completed = new Set(records.map(record => `advisories/${record.id}.json`));
  const queue = [...new Set([...pendingOrder, ...tree.map(entry => entry.path)])];
  const pendingPaths = [...queue.filter(path => !attempted.has(path)), ...queue.filter(path => attempted.has(path))].filter(path => !completed.has(path));
  const complete = snapshotId !== null && pendingPaths.length === 0 && diagnostics.length === 0;
  // 最新変更のmetadataと本文取得を別々に確認し、indexだけの成功を全件取得としない。
  if (recentUpdates) {
    const contentPending = recentUpdates.paths.filter(path => !completed.has(path)).length;
    const verifiedIndex = recentUpdates.indexStatus === 'complete';
    recentUpdates = { ...recentUpdates, contentFetched: recentUpdates.paths.length - contentPending, pending: contentPending,
      status: verifiedIndex && contentPending === 0 ? 'complete' : 'partial',
      reasonCode: !verifiedIndex ? recentUpdates.reasonCode : contentPending ? recentUpdates.paths.length > maxRecords ? 'LATEST_COMMIT_RECORD_LIMIT' : 'LATEST_COMMIT_BODIES_PENDING' : 'LATEST_COMMIT_BOUND_TO_TREE' };
  }
  return { records, diagnostics, status: complete ? 'complete' : 'partial', freshness: verifiedThisRun || !refresh && fresh ? 'fresh' : fetchedAt || previous.fetchedAt ? 'stale' : 'missing',
    fetchedAt, recentUpdates, coverage: [{ area: 'homebrew-advisory-database', status: complete ? 'complete' : 'partial', count: records.length, pending: pendingPaths.length,
      reason: '公式DBの収録済みpatch修正だけを比較。未収録・cask・custom tapを無脆弱性と判定しない' },
    ...(recentUpdates?.status === 'partial' ? [{ area: 'homebrew-latest-changes', status: 'partial', reasonCode: recentUpdates.reasonCode, count: recentUpdates.contentFetched, pending: recentUpdates.pending,
      reason: '公式の直近変更と本文を現在のtreeで全件確認できない。取得済みの告知だけを保持' }] : [])],
    continuation: { schemaVersion: 1, snapshotId, fetchedAt, tree, records, pendingPaths } };
}

/** installed formulaの版/revisionと適用済みpatchを公式DBへ照合する。中央判定が呼ぶ。 @example matchHomebrew(inventory, database) */
export function matchHomebrew(inventory, database = {}) {
  const formulae = inventory.homebrew?.formulae || inventory.homebrewFormulae || [];
  const casks = inventory.homebrew?.casks || inventory.homebrewCasks || [];
  const findings = [], coverage = [...(database.coverage || [])];
  for (const formula of [...formulae, ...casks]) {
    const name = formula.name || formula.token;
    if (formula.kind === 'cask' || casks.includes(formula) || formula.tap !== 'homebrew/core') {
      coverage.push({ area: 'homebrew-package', name, status: 'unsupported', reason: 'caskまたはcustom tap。公式core向けpatch記録を転用しない' });
      continue;
    }
    const records = (database.records || []).filter(record => !record.withdrawn && record.affected?.some(entry => entry.name === name));
    if (!records.length) { coverage.push({ area: 'homebrew-package', name, status: 'partial', reason: '公式DB未取得または未収録。無影響の根拠ではない' }); continue; }
    const installations = Array.isArray(formula.installed) && formula.installed.length ? formula.installed : [formula];
    for (const installed of installations) {
      const version = typeof installed.version === 'string' && installed.version.includes('_') ? installed.version : `${installed.version || ''}${Number.isSafeInteger(installed.revision) && installed.revision > 0 ? `_${installed.revision}` : ''}`;
      for (const record of records) {
        const fixed = record.affected.filter(entry => entry.name === name).flatMap(entry => entry.fixed);
        const patched = installed.receiptVerified === true && (installed.patches || []).some(patch => patch.applied === true
          && Array.isArray(patch.resolves) && record.upstream.length > 0 && record.upstream.every(id => patch.resolves.includes(id)));
        const atBoundary = fixed.some(boundary => compareBrewVersions(version, boundary) !== null && compareBrewVersions(version, boundary) >= 0);
        const confirmedFixed = patched || atBoundary;
        findings.push({ id: `${record.id}:Homebrew:${name}:${version}`, advisoryId: record.id, aliases: record.aliases, upstream: record.upstream,
          title: `${name} ${version} — ${record.id}`, status: confirmedFixed ? '影響なし' : '可能性あり', category: 'homebrew-patch-review',
          package: { ecosystem: 'Homebrew', name }, version, fixed: fixed.join(', '), severity: record.severity,
          impact: { kind: confirmedFixed ? 'fixed-for-record' : 'installed-version-review', compromise: 'unconfirmed', installationConfirmed: true },
          reason: patched ? '同じinstalled receiptの適用済みpatchが当該upstream告知の修正を明示'
            : atBoundary ? '当該公式DB記録のversion_revision修正境界に到達。未収録の脆弱性は別途未確認'
              : 'DB境界は生成時点の版で最初の修正版とは限らない。境界未到達だけでは脆弱と断定せずpatch履歴を確認',
          sources: [record.sourceUrl], localEvidence: [installed.path || formula.path].filter(Boolean), evidence: [installed.path || formula.path].filter(Boolean), incident: false });
      }
    }
    coverage.push({ area: 'homebrew-package', name, status: database.status === 'complete' ? 'complete-with-exclusions' : 'partial', reason: '比較は収録済みpatch記録のみ。upstreamはaliasとして統合しない' });
  }
  return { findings, coverage };
}
