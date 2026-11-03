#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { packageKey, assessmentStatus } from './assessment.mjs';
import { createRunContext } from './runtime.mjs';
import { allowedProjectRoot, boundedJson, LIMITS, readStatus, within } from './safe-io.mjs';
import { SweepError, safeDiagnostic } from './diagnostics.mjs';
import { extractLockfile, validPackage, publicResolution, identifyFormat } from './package-formats.mjs';

export { extractLockfile, validPackage } from './package-formats.mjs';
const ADVISORY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,120}$/;
const DAY = 86400000;
const MAX_FINDINGS = 30000;
const MAX_METADATA_RECORDS = 1000000;
const PARSED_STATUSES = new Set(['complete', 'complete-with-exclusions', 'partial', 'unsupported']);
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** installed-global例外だけを保つ。lock/SBOM記録はこの関数を使わない。 @example allowGlobalPackage({name:'example',version:'1.0.0',ecosystem:'npm'}) */
export function allowGlobalPackage(pkg, { queryUnknownGlobals = true } = {}) {
  if (!validPackage(pkg) || /^(?:Debian|Alpine):/.test(pkg.ecosystem) || pkg.private === true || pkg.explicitPrivate === true || pkg.publicRegistry === false || ['private', 'git', 'local'].includes(pkg.origin)) return false;
  const source = typeof pkg.source === 'string' ? pkg.source : pkg.source?.type || '';
  if (/(?:^|[:+/\s])(?:local|file|link|workspace|git|private)(?:[:+/\s]|$)/i.test(pkg.sourceType || source)) return false;
  const references = [pkg.resolved, pkg.registry, /^https?:/.test(source) ? source : null].filter(Boolean);
  if (references.some(reference => !publicResolution(reference, pkg.ecosystem))) return false;
  return queryUnknownGlobals || pkg.publicRegistry === true || references.length > 0;
}

/** payloadの全追加フィールドを落とす。送信前にexact identifierを再検証する。 @example queryPayload([{name:'a',version:'1.0.0',ecosystem:'npm'}]) */
export function queryPayload(packages, tokens = new Map()) {
  if (!Array.isArray(packages) || packages.length > 100 || packages.some(pkg => !validPackage(pkg))) throw new SweepError('FORMAT', { cause: 'malformed', operation: 'packages' });
  return { queries: packages.map(pkg => ({ package: { name: pkg.name, ecosystem: pkg.ecosystem }, version: pkg.version,
    ...(tokens.get(packageKey(pkg)) ? { page_token: tokens.get(packageKey(pkg)) } : {}) })) };
}

/** 現在の許可occurrenceと再開照会を結ぶ。由来変更で古い応答を無効にする。 @example queryFingerprint(pkg) */
function queryFingerprint(pkg) {
  return digest([pkg.ecosystem, pkg.name, pkg.version, (pkg.occurrences || []).map(record => [record.recordId, record.sourceIdentity, record.origin, record.queryEligible]).sort(), [...(pkg.evidence || [])].sort()]);
}

/** API応答のID・更新日以外を落とす。継続キャッシュも同じ射影を通る。 @example projectedVuln({id:'GHSA-example'}) */
function projectedVuln(value) {
  return value && typeof value.id === 'string' && ADVISORY_ID.test(value.id) ? { id: value.id, modified: iso(value.modified) } : null;
}

/** query単位のページと部分陽性を保持する。{@link scanPackages}と試験が呼ぶ。 @example await queryOsv(packages, {context,previous}) */
export async function queryOsv(packages, options = {}) {
  const context = options.context || options.ctx || createRunContext({ fetchImpl: options.fetchImpl, budgetMs: 240000, home: options.home });
  const owned = !options.context && !options.ctx;
  const now = context.wallNow;
  const deadline = options.deadline ?? now() + 240000;
  const maxPages = options.maxPages ?? 20;
  const maxPackages = options.maxPackages ?? 15000;
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 100 || !Number.isSafeInteger(maxPackages) || maxPackages < 1 || maxPackages > 15000 || packages.length > 15000) {
    if (owned) await context.close();
    throw new SweepError('CONFIG', { cause: 'limit', operation: 'packages' });
  }
  const previous = options.previous || {};
  const age = now() - Date.parse(previous.cycleStartedAt);
  const continuationVerified = options.continuationVerified === true || context.continuationVerified === true;
  const resume = continuationVerified && age >= 0 && age < DAY && Array.isArray(previous.pendingPackageKeys) && (previous.pendingPackageKeys.length > 0 || options.holdForDetails === true);
  const cycleStartedAt = resume ? previous.cycleStartedAt : new Date(now()).toISOString();
  const oldList = resume && Array.isArray(previous.queries) ? previous.queries : [];
  if (oldList.length > 15000 || oldList.some(query => Array.isArray(query?.vulns) && query.vulns.length > 5000) || oldList.reduce((count, query) => count + (Array.isArray(query?.vulns) ? query.vulns.length : 0), 0) > MAX_FINDINGS) {
    if (owned) await context.close();
    throw new SweepError('CAPACITY', { cause: 'limit', operation: 'packages' });
  }
  const oldQueries = new Map(oldList.map(query => [query.key, query]));
  const unique = new Map(packages.filter(validPackage).map(pkg => [packageKey(pkg), pkg]));
  const states = new Map();
  for (const [key, pkg] of unique) {
    const fingerprint = queryFingerprint(pkg), old = oldQueries.get(key);
    const usable = old?.fingerprint === fingerprint;
    const vulns = (usable && Array.isArray(old.vulns) ? old.vulns : []).map(projectedVuln).filter(Boolean);
    const token = usable && typeof old.pageToken === 'string' && old.pageToken.length <= 4096 && !/[\x00-\x1f]/.test(old.pageToken) ? old.pageToken : null;
    const timestamp = usable ? Date.parse(old.queriedAt) : NaN;
    const queriedAt = Number.isFinite(timestamp) && timestamp >= Date.parse(previous.cycleStartedAt) && timestamp <= now() ? iso(old.queriedAt) : null;
    states.set(key, { key, fingerprint, pageToken: token, vulns, queriedAt, historyScope: 'osv-all-records-for-exact-version', complete: usable && old.complete === true && Boolean(queriedAt) });
  }
  const preferred = (Array.isArray(previous.pendingPackageKeys) ? previous.pendingPackageKeys : []).filter(key => states.has(key) && !states.get(key).complete);
  // 初回の有限照会枠では実物metadataとSBOMを先に確認する。再開時は保留queueの順序を維持する。
  const metadataFirst = ['installed-metadata', 'digest-bound-sbom'].flatMap(kind => [...unique]
    .filter(([key, pkg]) => !states.get(key).complete && pkg.occurrences?.some(record => record.queryEligible && record.evidenceKind === kind))
    .map(([key]) => key).sort());
  let queue = [...new Set([...preferred, ...metadataFirst, ...[...states.keys()].sort().filter(key => !states.get(key).complete)])];
  const attempted = new Set(), succeeded = new Set(), blocked = new Set(), restarted = new Set();
  const coverage = [];
  let pages = 0, overflow = false;
  const continuation = () => ({ schemaVersion: 2, queries: [...states.values()].map(state => ({ ...state, vulns: state.vulns.map(vuln => ({ ...vuln })) })).sort((a, b) => a.key.localeCompare(b.key)),
    pendingPackageKeys: queue.filter(key => !states.get(key).complete), cycleStartedAt });
  const findings = () => [...states.values()].flatMap(state => {
    const pkg = unique.get(state.key);
    return state.vulns.map(vuln => ({ ...vuln, package: { name: pkg.name, ecosystem: pkg.ecosystem }, version: pkg.version,
      evidence: [...(pkg.evidence || [])], occurrences: pkg.occurrences || [], evidenceKind: pkg.evidenceKind || 'lock-declaration',
      queriedAt: state.queriedAt, queryComplete: state.complete, historyScope: state.historyScope,
      advisoryType: /^MAL-/.test(vuln.id) ? 'malware' : 'vulnerability', sourceUrl: `https://osv.dev/vulnerability/${vuln.id}` }));
  });
  const queryAssessments = () => [...states.values()].map(state => {
    const pkg = unique.get(state.key);
    return { package: { name: pkg.name, ecosystem: pkg.ecosystem }, version: pkg.version, queriedAt: state.queriedAt,
      complete: state.complete, status: state.vulns.length ? 'affected' : state.complete ? 'no-known-match' : 'unknown',
      advisoryIds: state.vulns.map(item => item.id), historyScope: state.historyScope };
  });
  try {
    while (queue.length && pages < maxPages && now() < deadline && !context.signal.aborted) {
      const keys = [];
      for (const key of queue) {
        if (keys.length >= Math.min(200, (maxPages - pages) * 100)) break;
        if (blocked.has(key) || !attempted.has(key) && attempted.size >= maxPackages) continue;
        attempted.add(key); keys.push(key);
      }
      if (!keys.length) break;
      // 独立した100件batchを最大2本だけ送る。全体・host制限は共通contextが所有する。
      const groups = keys.length > 100 ? [keys.slice(0, 100), keys.slice(100)] : [keys];
      await Promise.all(groups.map(async groupKeys => {
      const tokens = new Map(groupKeys.map(key => [key, states.get(key).pageToken]));
      const batch = groupKeys.map(key => unique.get(key));
      pages += 1;
      try {
        context.check();
        const response = await context.request('https://api.osv.dev/v1/querybatch', { method: 'POST', body: JSON.stringify(queryPayload(batch, tokens)), maxBytes: LIMITS.http,
          timeoutMs: Math.max(1, Math.min(25000, deadline - now())) });
        if (response.status === 400 && groupKeys.some(key => tokens.get(key))) {
          // 失効tokenだけを一度先頭へ戻し、過去の陽性を消さない。
          for (const key of groupKeys) {
            if (tokens.get(key) && !restarted.has(key)) { restarted.add(key); states.get(key).pageToken = null; }
            else blocked.add(key);
          }
        } else {
          if (!response.ok) throw new SweepError('HTTP', { cause: response.status === 429 ? 'cooldown' : 'http', operation: 'packages' });
          const body = boundedJson(await response.text(), { maxRecords: 100000 });
          if (!Array.isArray(body.results) || body.results.length !== batch.length) throw new SweepError('FORMAT', { cause: 'malformed', operation: 'packages' });
          for (let index = 0; index < groupKeys.length; index += 1) {
            const key = groupKeys[index], result = body.results[index], state = states.get(key);
            if (!result || typeof result !== 'object' || Array.isArray(result) || result.vulns !== undefined && !Array.isArray(result.vulns)
              || result.next_page_token !== undefined && (typeof result.next_page_token !== 'string' || result.next_page_token.length > 4096 || /[\x00-\x1f]/.test(result.next_page_token))) {
              blocked.add(key); coverage.push({ area: 'osv-page', status: 'partial', diagnostic: safeDiagnostic(new SweepError('FORMAT', { cause: 'malformed', operation: 'packages' })) }); continue;
            }
            const projected = (result.vulns || []).map(projectedVuln);
            if (projected.some(value => !value)) { blocked.add(key); coverage.push({ area: 'osv-page', status: 'partial', diagnostic: safeDiagnostic(new SweepError('FORMAT', { cause: 'malformed', operation: 'packages' })) }); continue; }
            const merged = new Map([...state.vulns, ...projected].map(vuln => [vuln.id, vuln]));
            const total = [...states.values()].reduce((sum, item) => sum + item.vulns.length, 0) - state.vulns.length + merged.size;
            if (merged.size > 5000 || total > MAX_FINDINGS) { overflow = true; blocked.add(key); continue; }
            state.queriedAt = new Date(now()).toISOString();
            state.vulns = [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
            state.pageToken = result.next_page_token || null;
            state.complete = !state.pageToken;
            succeeded.add(key);
            // 同じtokenの反復でも無限照会しない。
            if (state.pageToken && state.pageToken === tokens.get(key)) blocked.add(key);
          }
        }
      } catch (error) {
        groupKeys.forEach(key => blocked.add(key));
        coverage.push({ area: 'osv-batch', status: 'partial', count: groupKeys.length, diagnostic: safeDiagnostic(error, 'HTTP', 'packages') });
      }
      }));
      // 処理した未完了項目を後ろへ回す。一部失敗が他のqueryを止めない。
      const selected = new Set(keys);
      queue = [...queue.filter(key => !selected.has(key) && !states.get(key).complete), ...keys.filter(key => !states.get(key).complete)];
      await options.onProgress?.({ findings: findings(), queryAssessments: queryAssessments(), continuation: continuation(), coverage: [{ area: 'osv-query', status: queue.length ? 'partial' : 'complete', count: [...states.values()].filter(state => state.complete).length, total: states.size }] });
    }
    const pendingPackageKeys = queue.filter(key => !states.get(key).complete);
    const successfulKeys = [...states.values()].filter(state => state.complete).map(state => state.key);
    if (pendingPackageKeys.some(key => states.get(key).pageToken)) coverage.push({ area: 'osv-pagination', status: 'partial', count: pendingPackageKeys.filter(key => states.get(key).pageToken).length, reason: 'queryごとの追加ページを次回へ保持' });
    if (overflow) coverage.push({ area: 'osv-capacity', status: 'partial', diagnostic: safeDiagnostic(new SweepError('CAPACITY', { cause: 'limit', operation: 'packages' })) });
    coverage.push({ area: 'osv-query', status: pendingPackageKeys.length ? 'partial' : 'complete', count: successfulKeys.length, total: states.size, deferred: pendingPackageKeys.length > 0,
      reason: '現在の由来と一致する24時間以内の未完了照会だけ再開。全ページ成功を完了とする' });
    return { findings: findings(), coverage, queried: succeeded.size, successfulKeys, queryAssessments: queryAssessments(), continuation: continuation() };
  } finally { if (owned) await context.close(); }
}

/** 現在の設定から認可済みrootを取り出す。過去のqueueから範囲を広げない。 @example approvedRoots(inventory,context) */
function approvedRoots(inventory, context) {
  return [...new Set((inventory.projectRoots || inventory.scanRoots || context.config.scanRoots || []).map(root => typeof root === 'string' ? root : root.path)
    .filter(root => allowedProjectRoot(context.home, root)))];
}

/** 影響版の実物だけを読み、宣言と実物を分ける。依存コードは実行しない。 @example await inspectInstallations(findings,inventory,{context}) */
export async function inspectInstallations(findings, inventory, options = {}) {
  const context = options.context || options.ctx || createRunContext({ home: options.home, config: { scanRoots: options.projectRoots || inventory.scanRoots || [] } });
  const owned = !options.context && !options.ctx;
  const observations = new Map(), details = [];
  const allowed = approvedRoots(inventory, context);
  let examined = 0, truncated = false;
  try {
    for (const finding of findings) {
      if (finding.package?.ecosystem !== 'npm' || !validPackage({ ...finding.package, version: finding.version })) continue;
      const key = packageKey({ ...finding.package, version: finding.version });
      if (observations.has(key)) continue;
      const matches = [];
      const roots = [...new Set((finding.evidence || []).filter(file => typeof file === 'string' && path.isAbsolute(file) && identifyFormat(file))
        .flatMap(file => [path.dirname(file), ...(inventory.packageRoots || []).filter(root => within(path.dirname(file), root)).slice(0, 25)]))];
      for (const root of roots) {
        if (examined >= (options.limit ?? 1200) || context.signal.aborted || context.wallNow() >= (options.deadline ?? Infinity)) { truncated = true; break; }
        if (!allowed.some(candidate => within(candidate, root))) { details.push({ area: 'package-installation', status: 'excluded', policyExcluded: true }); continue; }
        examined += 1;
        const filename = path.join(root, 'node_modules', finding.package.name, 'package.json');
        try {
          const data = await context.io.readJson(filename, { roots: allowed, purpose: 'project', maxBytes: 1024 * 1024 });
          const installed = { ...data, ecosystem: 'npm', resolved: data._resolved || data.resolved, sourceType: data._from || data.sourceType };
          if (data.name === finding.package.name && data.version === finding.version && allowGlobalPackage(installed)) matches.push({ path: filename, name: data.name, ecosystem: 'npm', version: data.version, evidenceKind: 'installed-metadata' });
        } catch (error) { if (readStatus(error) !== 'absent') details.push({ area: 'package-installation', status: readStatus(error), diagnostic: safeDiagnostic(error, 'READ', 'packages') }); }
      }
      observations.set(key, matches);
    }
    return { observations, coverage: { area: 'package-installations', status: truncated || details.length ? 'partial' : 'complete', count: examined,
      reason: '影響版と名前が一致する実物だけを観測。不在は未使用・未実行の証明にしない' }, details };
  } finally { if (owned) await context.close(); }
}

/** globalの許可判定とページidentityを同じ射影から作る。{@link scanPackages}が現metadataだけを渡す。
 * @example globalRecord({name:'example',version:'1.0.0',ecosystem:'npm'}, 0, true, 'darwin')
 */
function globalRecord(pkg, index, queryUnknownGlobals, platform) {
  if (!validPackage(pkg)) return null;
  const legacyEligible = allowGlobalPackage(pkg, { queryUnknownGlobals: true });
  const eligible = allowGlobalPackage(pkg, { queryUnknownGlobals });
  const publicOrigin = pkg.publicRegistry === true || [pkg.registry, pkg.resolved].some(reference => publicResolution(reference, pkg.ecosystem));
  const origin = ['private', 'git', 'local'].includes(pkg.origin) ? pkg.origin : !legacyEligible ? 'private' : publicOrigin ? 'public' : 'unknown';
  const evidence = typeof pkg.evidence === 'string' && path.isAbsolute(pkg.evidence) ? pkg.evidence : null;
  return { name: pkg.name, version: pkg.version, ecosystem: pkg.ecosystem, origin, queryEligible: eligible, policyExcluded: !eligible,
    ...(!eligible ? { exclusion: origin === 'unknown' ? 'unknown-global-opt-out' : 'non-public-origin' } : {}),
    recordId: digest(['global', index, pkg.ecosystem, pkg.name, pkg.version, evidence]), sourceIdentity: digest([pkg.ecosystem, pkg.name, pkg.version, evidence, origin, eligible]),
    evidenceKind: 'installed-metadata', evidenceScope: 'host', path: evidence, location: evidence, originException: origin === 'unknown' && eligible, optional: false, platform };
}

/** SBOMの画像・配布元を再検証し、global例外を適用しない。{@link scanPackages}のページ生成とidentity計算が呼ぶ。
 * @example sbomRecord({name:'example',version:'1.0.0',ecosystem:'npm',imageDigest:'sha256:'+'a'.repeat(64)})
 */
function sbomRecord(pkg) {
  if (!validPackage(pkg) || !/^sha256:[a-f0-9]{64}$/.test(pkg.imageDigest || '')) return null;
  const distro = /^(?:Debian|Alpine):/.test(pkg.ecosystem);
  const identityVerified = !distro || pkg.provenanceStatus === 'verified-public-record' && !pkg.distributionConflict && pkg.sourcePackage === pkg.name && pkg.sourceVersion === pkg.version
    && pkg.ecosystem === (pkg.distribution === 'debian' ? `Debian:${pkg.distributionRelease}` : pkg.distribution === 'alpine' ? `Alpine:v${pkg.distributionRelease}` : null);
  return { name: pkg.name, version: pkg.version, ecosystem: pkg.ecosystem, origin: identityVerified && pkg.origin === 'public' ? 'public' : 'unknown',
    queryEligible: identityVerified && pkg.publicRegistry === true && pkg.origin === 'public' && !pkg.explicitPrivate,
    ...(distro ? { binaryName: pkg.binaryName, binaryVersion: pkg.binaryVersion, distribution: pkg.distribution, distributionRelease: pkg.distributionRelease, architecture: pkg.architecture, sourcePackage: pkg.sourcePackage, sourceVersion: pkg.sourceVersion, provenanceStatus: pkg.provenanceStatus, distributionConflict: Boolean(pkg.distributionConflict), purlType: pkg.purlType } : {}),
    recordId: digest(['sbom', pkg.recordId, pkg.name, pkg.version]), sourceIdentity: pkg.imageDigest,
    evidenceKind: 'digest-bound-sbom', evidenceScope: 'image', digestBound: true, imageDigest: pkg.imageDigest,
    path: typeof pkg.evidence === 'string' ? pkg.evidence : null, location: typeof pkg.evidence === 'string' ? pkg.evidence : null, optional: false, platform: distro ? 'linux' : 'unknown' };
}

/** 秘密の追加fieldを除いてmetadataを束縛し、過去ページの未確認も現在の入力から集計する。{@link scanPackages}が呼ぶ。
 * @example metadataSummary([['global', [], value => value]], context)
 */
function metadataSummary(groups, context) {
  const hash = createHash('sha256');
  const counts = { unverifiedGlobals: 0, excludedGlobals: 0, unknownGlobals: 0, invalidGlobals: 0, unassessedSbomPackages: 0 };
  for (const [name, values, project] of groups) {
    hash.update(name);
    for (let index = 0; index < values.length; index += 1) {
      context.check();
      // 任意の追加fieldや生の配布URLはhash入力にも含めない。
      const record = project(values[index], index);
      hash.update(JSON.stringify(record));
      if (name === 'global') {
        if (!record) counts.invalidGlobals += 1;
        else {
          if (record.origin === 'unknown') counts.unknownGlobals += 1;
          if (record.originException) counts.unverifiedGlobals += 1;
          if (!record.queryEligible) counts.excludedGlobals += 1;
        }
      } else if (!record || !record.queryEligible) counts.unassessedSbomPackages += 1;
    }
  }
  return { signature: hash.digest('hex'), ...counts };
}

/** lock/globalの由来を維持し、最小payloadへ接続する。CLIと巡回本体が共有する。 @example await scanPackages(inventory,{context,continuation}) */
export async function scanPackages(inventory, options = {}) {
  const context = options.context || options.ctx || createRunContext({ home: options.home, config: { scanRoots: options.projectRoots || inventory.scanRoots || [], queryUnknownGlobals: options.queryUnknownGlobals ?? true },
    fetchImpl: options.fetchImpl, budgetMs: options.budgetMs ?? 480000 });
  const owned = !options.context && !options.ctx;
  const started = context.wallNow();
  const coverage = [], commands = [], records = [], parsedFiles = [];
  const roots = approvedRoots(inventory, context);
  const previous = options.continuation || options.previous || {};
  const maxLockfiles = options.maxLockfiles ?? 400, maxPackages = options.maxPackages ?? 15000, maxRecords = options.maxRecords ?? 15000;
  if (![maxLockfiles, maxPackages, maxRecords].every(number => Number.isSafeInteger(number) && number > 0 && number <= 15000)) { if (owned) await context.close(); throw new SweepError('CONFIG', { cause: 'limit', operation: 'packages' }); }
  const lockfiles = (inventory.lockfiles || []).map(lock => typeof lock === 'string' ? { path: lock } : lock).filter(lock => typeof lock.path === 'string' && path.isAbsolute(lock.path));
  const pendingFirst = new Set(previous.pendingLockfiles || []);
  lockfiles.sort((a, b) => Number(pendingFirst.has(b.path)) - Number(pendingFirst.has(a.path)) || a.path.localeCompare(b.path));
  const oldFiles = new Map((Array.isArray(previous.parsedFiles) ? previous.parsedFiles : []).map(file => [file.path, file]));
  const pendingLockfiles = [];
  let processed = 0, revalidated = 0;
  try {
    const globals = inventory.globalPackages || [], sboms = inventory.sbomPackages || [];
    if (globals.length > MAX_METADATA_RECORDS || sboms.length > MAX_METADATA_RECORDS) throw new SweepError('CAPACITY', { cause: 'limit', operation: 'packages' });
    const allowUnknownGlobals = options.queryUnknownGlobals ?? context.config.queryUnknownGlobals ?? true;
    const projectGlobal = (pkg, index) => globalRecord(pkg, index, allowUnknownGlobals, context.platform);
    const { signature, unverifiedGlobals, excludedGlobals, unknownGlobals, invalidGlobals, unassessedSbomPackages } = metadataSummary([['global', globals, projectGlobal], ['sbom', sboms, sbomRecord]], context);
    const oldPage = previous.recordPage;
    const verified = options.continuationVerified === true || context.continuationVerified === true;
    const pageAge = started - Date.parse(oldPage?.cycleStartedAt);
    const offsets = ['globalOffset', 'nextGlobalOffset', 'sbomOffset', 'nextSbomOffset', 'pendingGlobals', 'pendingSboms'];
    const pageValid = verified && oldPage?.schemaVersion === 1 && oldPage.metadataSignature === signature && pageAge >= 0 && pageAge < DAY
      && offsets.every(key => Number.isSafeInteger(oldPage[key]) && oldPage[key] >= 0 && oldPage[key] <= MAX_METADATA_RECORDS)
      && oldPage.globalOffset <= oldPage.nextGlobalOffset && oldPage.nextGlobalOffset <= globals.length
      && oldPage.sbomOffset <= oldPage.nextSbomOffset && oldPage.nextSbomOffset <= sboms.length
      && oldPage.pendingGlobals === globals.length - oldPage.nextGlobalOffset && oldPage.pendingSboms === sboms.length - oldPage.nextSbomOffset;
    const queryPending = (previous.query?.pendingPackageKeys || previous.pendingPackageKeys || []).length > 0;
    const detailPending = (options.state?.advisoryContinuation?.pendingIds || []).length > 0;
    const pageActive = pageValid && (queryPending || detailPending || previous.pendingLockfiles?.length || oldPage.pendingGlobals || oldPage.pendingSboms);
    const holdPage = pageActive && (queryPending || detailPending);
    const heldLocks = new Set(holdPage ? (previous.parsedFiles || []).map(file => file.path) : []);
    // 旧ACKのstatus欠落から完了を推測しない。現在ページの処理が終わったら再解析する。
    const carryAcknowledgements = new Map(pageActive ? (previous.acknowledgedLockfiles || []).filter(file => PARSED_STATUSES.has(file.status))
      .map(file => [file.path, { sourceIdentity: file.sourceIdentity, status: file.status }]) : []);
    const observedLockIdentities = new Map();
    const globalOffset = pageActive ? holdPage ? oldPage.globalOffset : oldPage.nextGlobalOffset : 0;
    const sbomOffset = pageActive ? holdPage ? oldPage.sbomOffset : oldPage.nextSbomOffset : 0;
    let nextGlobalOffset = globalOffset, nextSbomOffset = sbomOffset, recordLimited = Boolean(pageActive);
    // global/SBOMを先に受け入れ、巨大なlock集合で毎回未照会になることを防ぐ。
    for (; nextGlobalOffset < (holdPage ? oldPage.nextGlobalOffset : globals.length) && records.length < maxRecords; nextGlobalOffset += 1) {
      context.check();
      const record = projectGlobal(globals[nextGlobalOffset], nextGlobalOffset);
      if (!record) continue;
      records.push(record);
    }
    for (; nextSbomOffset < (holdPage ? oldPage.nextSbomOffset : sboms.length) && records.length < maxRecords; nextSbomOffset += 1) {
      context.check();
      const record = sbomRecord(sboms[nextSbomOffset]);
      if (!record) continue;
      records.push(record);
    }
    const pendingGlobals = globals.length - nextGlobalOffset, pendingSboms = sboms.length - nextSbomOffset;
    recordLimited ||= pendingGlobals > 0 || pendingSboms > 0;
    let scannerAvailable = false, invalidLockRecords = 0;
    if (!options.noScanner && lockfiles.length) {
      try {
        const probe = await context.command('osv-scanner', ['--version'], { timeoutMs: 5000, maxBytes: 4096 });
        scannerAvailable = probe.code === 0 && /\b2\.\d+/.test(probe.stdout);
        commands.push({ operation: 'osv-scanner-version', status: scannerAvailable ? 'complete' : 'unsupported' });
      } catch (error) { commands.push({ operation: 'osv-scanner-version', status: 'unavailable', diagnostic: safeDiagnostic(error, 'TOOL', 'packages') }); }
    }
    for (const lock of lockfiles) {
      if (!roots.some(root => within(root, lock.path))) { coverage.push({ area: 'lockfile', status: 'excluded', policyExcluded: true, path: lock.path, reason: '現在の認可済みproject rootの外側' }); continue; }
      try {
        context.check();
        const stat = await context.io.inspect(lock.path, { roots, purpose: 'project' });
        if (!stat.metadata.isFile()) throw new SweepError('BOUNDARY', { cause: 'boundary', operation: 'packages' });
        observedLockIdentities.set(lock.path, stat.identity);
        if (carryAcknowledgements.get(lock.path)?.sourceIdentity !== stat.identity) carryAcknowledgements.delete(lock.path);
        // 照会と詳細が未完了のページを維持し、完了済みページは現在のidentityだけ再確認する。
        if (pageActive && (holdPage ? !heldLocks.has(lock.path) : carryAcknowledgements.has(lock.path))) {
          if (!carryAcknowledgements.has(lock.path)) pendingLockfiles.push(lock.path);
          // 現在ページの照会証拠とは区別し、以前の陽性を今回の陰性として解消しない。
          else coverage.push({ area: 'lockfile-previous-page', path: lock.path, status: carryAcknowledgements.get(lock.path).status,
            reason: '前ページで解析した同一ファイル。未対応・未確認の判定も保持' });
          continue;
        }
        if (records.length >= maxRecords) { recordLimited = true; pendingLockfiles.push(lock.path); continue; }
        const old = oldFiles.get(lock.path);
        const unchanged = (options.continuationVerified === true || context.continuationVerified === true) && old?.sourceIdentity === stat.identity && old.parserVersion === 2;
        if (!unchanged && processed >= maxLockfiles) { pendingLockfiles.push(lock.path); continue; }
        // 永続cacheから公開性を復元しない。送信の根拠は毎回現在のbounded本文を再解析する。
        const extracted = await context.io.withVerifiedFile(lock.path, { roots, purpose: 'project', maxBytes: LIMITS.lock }, async ({ fd, bytes, identity }) => {
            if (identity !== stat.identity) throw new SweepError('BOUNDARY', { cause: 'identity', operation: 'packages' });
            const parsed = extractLockfile(lock.path, bytes.toString('utf8'), { sourceIdentity: identity });
            if (!unchanged && scannerAvailable && identifyFormat(lock.path)?.parsing) {
              try {
                const output = await context.command('osv-scanner', ['scan', 'source', '--offline', '--no-resolve', '--no-call-analysis=all', '--all-packages', '--format=json', '--config=/dev/null', '--lockfile', `${path.basename(lock.path)}:/dev/fd/3`],
                  { inputFd: fd, timeoutMs: 20000, maxBytes: LIMITS.lock });
                const data = boundedJson(output.stdout, { maxRecords: 100000 });
                if (!Array.isArray(data.results)) throw new SweepError('FORMAT', { cause: 'malformed', operation: 'packages' });
                const observed = new Set(data.results.flatMap(result => Array.isArray(result.packages) ? result.packages : []).map(entry => entry.package).filter(validPackage).map(packageKey));
                const confirmed = parsed.records.filter(record => record.queryEligible && observed.has(packageKey(record))).length;
                // scannerは補助証拠だけ。source省略や別recordの公開性を転用しない。
                commands.push({ operation: 'osv-scanner-offline', status: [0, 1].includes(output.code) ? 'complete' : 'partial',
                  metadataStatus: 'complete', vulnerabilityAssessment: 'not-performed', confirmed, extracted: observed.size, exitCode: output.code });
              } catch (error) { commands.push({ operation: 'osv-scanner-offline', status: 'partial', diagnostic: safeDiagnostic(error, 'COMMAND', 'packages') }); }
            }
            return parsed;
        });
        if (unchanged) revalidated += 1; else processed += 1;
        const current = extracted.records.map(record => ({ ...record, path: lock.path, location: lock.path }));
        if (current.length > maxRecords) {
          // 単一lockがページ上限を超える場合は未対応を明示し、同じファイルを無限保留しない。
          parsedFiles.push({ path: lock.path, sourceIdentity: stat.identity, parserVersion: 2, status: 'unsupported' });
          coverage.push({ area: 'lockfile', path: lock.path, status: 'unsupported', count: 0, reasonCode: 'lockfile-record-page-limit',
            diagnostic: safeDiagnostic(new SweepError('CAPACITY', { cause: 'limit', operation: 'packages' })) });
          continue;
        }
        if (records.length + current.length > maxRecords) {
          recordLimited = true; pendingLockfiles.push(lock.path);
          coverage.push({ area: 'lockfile', path: lock.path, status: 'partial', deferred: true, count: 0, reasonCode: 'record-page-capacity', reason: 'このlockの抽出済みrecordは次の有限ページで照会する' });
          continue;
        }
        invalidLockRecords += extracted.invalid || 0;
        records.push(...current);
        parsedFiles.push({ path: lock.path, sourceIdentity: stat.identity, parserVersion: 2, status: extracted.status });
        coverage.push({ area: 'lockfile', path: lock.path, status: extracted.status, count: current.length, skipped: extracted.skipped,
          excluded: extracted.excluded || 0, unknown: extracted.unknown || 0, invalid: extracted.invalid || 0, reason: extracted.reason,
          ...(extracted.diagnostic ? { diagnostic: extracted.diagnostic } : {}) });
      } catch (error) { pendingLockfiles.push(lock.path); coverage.push({ area: 'lockfile', path: lock.path, status: readStatus(error), diagnostic: safeDiagnostic(error, 'READ', 'packages') }); }
    }
    coverage.push({ area: 'sbom-packages', status: unassessedSbomPackages || pendingSboms ? 'partial' : 'complete', count: records.filter(record => record.evidenceKind === 'digest-bound-sbom').length, unsupported: unassessedSbomPackages, pending: pendingSboms, reasonCode: unassessedSbomPackages ? 'sbom-package-identity-unknown' : 'sbom-supported-records' });
    if (recordLimited) coverage.push({ area: 'package-record-page', status: pendingLockfiles.length || pendingGlobals || pendingSboms ? 'partial' : 'complete', count: records.length,
      pending: pendingLockfiles.length + pendingGlobals + pendingSboms, deferred: Boolean(pendingLockfiles.length || pendingGlobals || pendingSboms), reasonCode: 'bounded-record-page',
      reason: 'record合計15000件以内で照会。現在ページの照会・詳細完了後に保留lock/global/SBOMへ進む' });
    const packageMap = new Map();
    for (const record of records) {
      if (!validPackage(record)) continue;
      const key = packageKey(record);
      if (!packageMap.has(key)) packageMap.set(key, { name: record.name, version: record.version, ecosystem: record.ecosystem, evidence: [], occurrences: [] });
      const pkg = packageMap.get(key);
      pkg.occurrences.push(record);
      if (record.queryEligible && record.path && !pkg.evidence.includes(record.path)) pkg.evidence.push(record.path);
    }
    const packages = [...packageMap.values()].filter(pkg => pkg.occurrences.some(record => record.queryEligible)).sort((a, b) => packageKey(a).localeCompare(packageKey(b)));
    const requestPrevious = { ...(previous.query || previous), pendingPackageKeys: previous.query?.pendingPackageKeys || previous.pendingPackageKeys || [] };
    if ((previous.pendingLockfiles || []).length && !(requestPrevious.pendingPackageKeys || []).length) requestPrevious.pendingPackageKeys = ['extraction-pending'];
    const wrapContinuation = query => {
      const completedPackageKeys = query.queries.filter(item => item.complete).map(item => item.key);
      const completed = new Set(completedPackageKeys);
      const acknowledgements = new Map([...carryAcknowledgements].filter(([file, entry]) => observedLockIdentities.get(file) === entry.sourceIdentity));
      for (const file of parsedFiles) {
        acknowledgements.delete(file.path);
        if (records.filter(record => record.path === file.path && record.queryEligible).every(record => completed.has(packageKey(record)))) acknowledgements.set(file.path, { sourceIdentity: file.sourceIdentity, status: file.status });
      }
      const acknowledgedLockfiles = [...acknowledgements].map(([file, entry]) => ({ path: file, ...entry }));
      return { schemaVersion: 2, parsedFiles, pendingLockfiles, acknowledgedLockfiles, query, pendingPackageKeys: query.pendingPackageKeys,
        completedPackageKeys, cycleStartedAt: query.cycleStartedAt, catalogSignature: digest(packages.map(queryFingerprint)), findingCache: [],
        ...(recordLimited ? { recordPage: { schemaVersion: 1, cycleStartedAt: pageActive ? oldPage.cycleStartedAt : new Date(started).toISOString(), metadataSignature: signature,
          globalOffset, nextGlobalOffset, sbomOffset, nextSbomOffset, pendingGlobals, pendingSboms } } : {}) };
    };
    const onProgress = async progress => context.checkpoint({ stage: 'packages', value: { schemaVersion: 2, scannedAt: new Date(started).toISOString(),
      packages, records, findings: progress.findings, queryAssessments: progress.queryAssessments, coverage: [...coverage, ...progress.coverage], commands,
      continuation: wrapContinuation(progress.continuation) } });
    const response = options.offline ? { findings: [], coverage: [{ area: 'osv-query', status: 'partial', reason: 'offline指定のため公開照会は未実施' }], successfulKeys: [],
      continuation: { queries: [], pendingPackageKeys: packages.map(packageKey), cycleStartedAt: new Date(started).toISOString() } }
      : await queryOsv(packages, { context, previous: requestPrevious, continuationVerified: options.continuationVerified,
        holdForDetails: Array.isArray(options.state?.advisoryContinuation?.pendingIds) && options.state.advisoryContinuation.pendingIds.length > 0,
        maxPackages, maxPages: options.maxPages, deadline: options.deadline, onProgress });
    coverage.push({ area: 'lockfiles', status: pendingLockfiles.length ? 'partial' : 'complete', count: lockfiles.length - pendingLockfiles.length, total: lockfiles.length,
      extracted: processed, revalidated, deferred: pendingLockfiles.length > 0, reason: '新規/変更lockの抽出上限とは別に、以前のlockも現在のbounded本文で公開性を再確認' });
    coverage.push({ area: 'global-package-origins', status: unverifiedGlobals || invalidGlobals || pendingGlobals ? 'partial' : excludedGlobals ? 'complete-with-exclusions' : 'complete',
      count: unverifiedGlobals, unknown: unknownGlobals, invalid: invalidGlobals, excluded: excludedGlobals, pending: pendingGlobals,
      reason: '由来未検証のinstalled-global例外を明示。lock/SBOMには適用しない。queryUnknownGlobals=falseで停止可能' });
    const unknownRecords = records.filter(record => record.origin === 'unknown' && !record.policyExcluded).length;
    const excludedRecords = records.filter(record => record.policyExcluded).length;
    coverage.push({ area: 'package-extraction', status: unknownRecords || invalidLockRecords || invalidGlobals || pendingLockfiles.length || pendingGlobals || pendingSboms ? 'partial' : excludedRecords ? 'complete-with-exclusions' : 'complete', count: records.length,
      excluded: excludedRecords, unknown: unknownRecords, invalid: invalidLockRecords + invalidGlobals, reason: '同一名・版でも由来と方針除外を独立保持。未確認を除外によって隠さない' }, ...response.coverage);
    const findings = response.findings;
    if (options.inspectInstallations !== false) {
      const material = await inspectInstallations(findings, inventory, { context });
      coverage.push(material.coverage, ...material.details);
      for (const finding of findings) finding.installationEvidence = material.observations.get(packageKey({ ...finding.package, version: finding.version })) || [];
    }
    return { schemaVersion: 2, scannedAt: new Date(started).toISOString(), elapsedMs: context.wallNow() - started, packages, records, findings, queryAssessments: response.queryAssessments || [], coverage, commands,
      continuation: wrapContinuation(response.continuation) };
  } finally { if (owned) await context.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let context;
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
      process.stdout.write('使い方: node scripts/scan-packages.mjs --inventory 棚卸し.json [--state 状態.json] [--offline] [--no-scanner] [--max-lockfiles 件数] [--max-packages 件数] [--budget-ms ミリ秒]\nJSONは非公開の証拠保存先へリダイレクトしてください。既存stateは変更しません。部分結果の終了コードは2です。\n');
    } else {
      const options = {};
      for (let index = 0; index < args.length; index += 1) {
        const flag = args[index];
        if (['--offline', '--no-scanner'].includes(flag)) options[flag] = true;
        else if (['--inventory', '--state', '--max-lockfiles', '--max-packages', '--budget-ms'].includes(flag) && args[index + 1] && !args[index + 1].startsWith('--')) options[flag] = args[++index];
        else throw new SweepError('CONFIG', { cause: 'malformed', operation: 'cli' });
      }
      if (!options['--inventory'] || !path.isAbsolute(options['--inventory'])) throw new SweepError('CONFIG', { cause: 'malformed', operation: 'cli' });
      context = createRunContext({ budgetMs: options['--budget-ms'] === undefined ? 480000 : Number(options['--budget-ms']) });
      const inventory = await context.io.readJson(options['--inventory'], { roots: [path.dirname(options['--inventory'])], maxBytes: LIMITS.state });
      const previous = options['--state'] ? await context.io.readJson(options['--state'], { roots: [path.dirname(options['--state'])], maxBytes: LIMITS.state }) : {};
      if ((previous.schemaVersion || 1) > 2) throw new SweepError('STATE', { cause: 'future-schema', operation: 'state' });
      context.config.scanRoots = inventory.scanRoots || previous.scanRoots || [];
      const result = await scanPackages(inventory, { context, continuation: previous.packageContinuation, offline: options['--offline'], noScanner: options['--no-scanner'],
        maxLockfiles: options['--max-lockfiles'] === undefined ? undefined : Number(options['--max-lockfiles']), maxPackages: options['--max-packages'] === undefined ? undefined : Number(options['--max-packages']) });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.exitCode = assessmentStatus(result.coverage) === 'partial' ? 2 : 0;
    }
  } catch (error) {
    const detail = safeDiagnostic(error, 'INTERNAL', 'cli');
    process.stderr.write(`${JSON.stringify(detail)}\n`);
    process.exitCode = ['MSS_CONFIG', 'MSS_STATE'].includes(detail.code) ? 64 : 1;
  } finally { await context?.close(); }
}
