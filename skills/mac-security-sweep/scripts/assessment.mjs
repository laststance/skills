import path from 'node:path';
import { allowedProjectRoot } from './safe-io.mjs';
import { SweepError } from './diagnostics.mjs';

const COMPLETE = new Set(['complete', 'complete-with-exclusions', 'ok', 'absent', 'not-applicable']);
const SEVERITY = { CRITICAL: 4, HIGH: 3, MODERATE: 2, MEDIUM: 2, LOW: 1 };

/**
 * 探索対象をユーザーごとのローカルstateから復元する。{@link inventory} と実体パスの射影が呼ぶ。
 * @param entries - scanRoots。未設定時だけ汎用の既定値を使い、不正な指定は復元しない。
 * @param userHome - このMacのホーム。ホーム全体や認証ディレクトリを探索ルートとして許可しない。
 * @returns ホーム配下の絶対パスとpersonal/work区分だけ。
 */
export function normalizeScanRoots(entries, userHome) {
  const configured = entries === undefined ? [{ path: '~/Projects', scope: 'personal' }, { path: '~/repository', scope: 'personal' }, { path: '~/work', scope: 'work' }] : entries;
  if (!Array.isArray(configured)) return [];
  const roots = new Map();
  for (const entry of configured.slice(0, 20)) {
    if (!entry || typeof entry.path !== 'string' || /[\u0000-\u001f\u007f]|https?:|(?:token|password)\s*=/i.test(entry.path) || entry.path.split('/').includes('..')) continue;
    const raw = entry.path.startsWith('~/') ? path.join(userHome, entry.path.slice(2)) : entry.path;
    const expanded = path.resolve(raw);
    if (!path.isAbsolute(raw) || path.normalize(raw) !== raw || !allowedProjectRoot(userHome, expanded)) continue;
    if (entry.scope && !['personal', 'work'].includes(entry.scope)) continue;
    const scope = entry.scope === 'work' || roots.get(expanded)?.scope === 'work' ? 'work' : 'personal';
    roots.set(expanded, { path: expanded, scope });
  }
  return [...roots.values()];
}

/**
 * 所有範囲をパスの固有名ではなく棚卸しの設定と対応させる。{@link matchInventory} が報告の区分を作る。
 * @returns 明示されたworkは仕事、それ以外は個人・その他。導入・窃取の証拠とは別の区分。
 */
export function evidenceScope(locations, inventory) {
  return [...new Set(locations.map(location => {
    const lock = (inventory.lockfiles || []).find(lock => lock.path === location);
    const root = [...(inventory.projectRoots || [])].filter(root => location === root.path || location.startsWith(`${root.path}/`)).sort((a, b) => b.path.length - a.path.length)[0];
    return (lock?.scope || root?.scope) === 'work' ? '仕事' : '個人・その他';
  }))].join(' / ');
}

/**
 * 公開告知の種類を保持する。{@link matchInventory} と詳細取得が通常の脆弱性と悪性配布を分けるために呼ぶ。
 * @returns 明示された悪性配布ならmalware、それ以外はvulnerability。
 * @example
 * advisoryKind({ advisoryType: 'malware' });
 */
export function advisoryKind(value) {
  return value.advisoryType === 'malware' || value.type === 'malware' || value.source === 'GitHub Advisory malware'
    || /^MAL-\d{4}-\d+$/.test(value.advisoryId || value.id || '') ? 'malware' : 'vulnerability';
}

/**
 * 確認範囲を方針上の対象外・持越し・失敗・未確認に分ける。レポートと完了判定が呼ぶ。
 * @returns 対象外を安全判定へ変換しない分類。
 * @example
 * coverageKind({ status: 'not-read', policyExcluded: true });
 */
export function coverageKind(entry) {
  if (entry.policyExcluded === true) return 'excluded';
  if (COMPLETE.has(entry.status)) return 'complete';
  if (entry.deferred === true) return 'deferred';
  if (['error', 'failed', 'unavailable', 'timeout'].includes(entry.status)) return 'failed';
  return 'unconfirmed';
}

/**
 * 意図した対象外だけでpartialにしない。巡回完了時と回帰テストから呼ぶ。
 * @returns 未解決の検査や本文確認があればpartial、方針上の対象外のみならcomplete-with-exclusions。
 */
export function assessmentStatus(coverage, unreviewed = 0) {
  if (unreviewed || coverage.some(entry => !['complete', 'excluded'].includes(coverageKind(entry)))) return 'partial';
  return coverage.some(entry => coverageKind(entry) === 'excluded' || entry.status === 'complete-with-exclusions') ? 'complete-with-exclusions' : 'complete';
}

/**
 * 告知の新しさより悪性配布・悪用確認・深刻度を優先する。要約と詳細取得が呼ぶ。
 * @returns 入力を変更せず、重要度順に並べた配列。未評価は未評価のまま扱う。
 * @example
 * prioritizeFindings(findings, advisoryDetails);
 */
export function prioritizeFindings(findings, details = []) {
  const byId = new Map(details.map(detail => [detail.id, detail]));
  const rank = finding => {
    const detail = byId.get(finding.advisoryId || finding.id);
    return [finding.status === '確定' ? 1 : 0, advisoryKind({ ...finding, advisoryType: detail?.advisoryType || finding.advisoryType }) === 'malware' ? 1 : 0,
      finding.knownExploited || detail?.knownExploited ? 1 : 0, normalizeSeverity(detail?.severity || finding.severity).rank,
      finding.projectActive ? 1 : 0, finding.impact?.installationConfirmed === true ? 1 : 0, String(finding.scope).includes('仕事') ? 1 : 0];
  };
  return [...findings].sort((a, b) => {
    const left = rank(a), right = rank(b);
    // 同じ重要度のときだけ更新日時を使用する。
    for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) return right[index] - left[index];
    return String(byId.get(b.advisoryId || b.id)?.modified || b.modified || '').localeCompare(String(byId.get(a.advisoryId || a.id)?.modified || a.modified || ''));
  });
}

/**
 * パッケージ照会のローカル継続キーを作る。再開処理と差分判定が呼ぶ。
 * @returns 名前・版・ecosystemの組。外部リクエストには使用しない。
 */
export function packageKey(pkg) { return `${pkg.ecosystem}:${pkg.name}:${pkg.version}`; }

/**
 * 前回の未処理ファイルを先に選ぶ。{@link scanPackages} が上限到達後の取りこぼしを防ぐために呼ぶ。
 * @returns 現在の棚卸し内の対象だけから作った処理順。
 */
export function planLockfiles(lockfiles, previous = {}, activeRoots = []) {
  const pending = new Set(previous.pendingLockfiles || []);
  return [...lockfiles].sort((a, b) => {
    const fileA = typeof a === 'string' ? a : a.path, fileB = typeof b === 'string' ? b : b.path;
    const score = (file, metadata) => [pending.has(file) ? 1 : 0,
      previous.completed?.[file] !== `${metadata.size ?? ''}:${metadata.modifiedAt ?? ''}` ? 1 : 0,
      activeRoots.some(root => file === root || file.startsWith(`${root}/`)) ? 1 : 0,
      /\/(?:backup[^/]*|qa_assets|\.gstack\/tmp)\//.test(file) ? 0 : 1];
    const left = score(fileA, a), right = score(fileB, b);
    // 過去のstateにしかないパスを処理対象へ復活させない。
    for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) return right[index] - left[index];
    return 0;
  });
}

/**
 * 同じ親プロジェクトの稼働を記録する。照合処理が依存の実行そのものと混同しないために呼ぶ。
 * @returns その依存が属するプロジェクトに稼働観測がある場合だけtrue。
 */
export function projectIsActive(evidence, contexts = []) {
  return (evidence || []).some(file => contexts.some(context => context.cwd &&
    (context.cwd === path.dirname(file) || context.cwd.startsWith(`${path.dirname(file)}/`))));
}

/**
 * 前回の陽性判定を、今回の実測範囲内でだけ解消する。巡回レポート生成前に呼ぶ。
 * @returns 新規・継続・解消・確認不能の配列と、次回に残す陽性記録。
 */
export function compareAssessments(previous = [], findings = [], packages = {}, coverage = []) {
  const positive = finding => ['確定', '可能性高', '可能性あり'].includes(finding.status);
  const identities = aggregateAdvisories([...previous, ...findings]).canonicalIds;
  const key = finding => finding.advisoryId && identities[finding.advisoryId] ? `${identities[finding.advisoryId]}:${finding.package?.ecosystem || ''}:${finding.package?.name || ''}:${finding.version || ''}` : finding.id;
  const current = new Map(findings.map(finding => [key(finding), finding]));
  const prior = new Map(previous.map(finding => [key(finding), finding]));
  const excludedLocations = new Map();
  for (const record of [...(packages.records || []), ...(packages.packages || []).flatMap(record => record.occurrences || [record])]) {
    if (record.queryEligible !== false && !['private', 'git', 'local'].includes(record.origin) && !(record.origin === 'unknown' && record.queryEligible !== true)) continue;
    const name = record.name || record.package?.name, ecosystem = record.ecosystem || record.package?.ecosystem;
    for (const identity of [`${ecosystem}:${name}`, `${ecosystem}:${name}:${record.version}`]) {
      if (!excludedLocations.has(identity)) excludedLocations.set(identity, new Set());
      excludedLocations.get(identity).add(record.path || record.location || null);
    }
  }
  const changes = { new: [], continuing: [], resolved: [], unconfirmed: [] };
  const snapshot = findings.filter(positive).map(finding => ({ id: finding.id, title: finding.title, status: finding.status,
    advisoryId: finding.advisoryId, package: finding.package, version: finding.version, evidence: finding.localEvidence || [], scope: finding.scope,
    incident: finding.incident === true, advisoryType: finding.advisoryType, aliases: (finding.aliases || []).filter(validAdvisoryId), impact: finding.impact,
    observedAt: finding.observedAt, queriedAt: finding.queriedAt, verifiedAt: finding.verifiedAt, queryComplete: finding.queryComplete,
    historyScope: finding.historyScope, assessmentBasis: finding.assessmentBasis, reasonCode: finding.reasonCode,
    conflictingEvidence: finding.conflictingEvidence === true }));
  for (const finding of findings.filter(positive)) changes[prior.has(key(finding)) ? 'continuing' : 'new'].push(finding);
  for (const old of previous) {
    if (current.has(key(old)) && positive(current.get(key(old)))) continue;
    const incidentRequiresReview = old.status === '確定' || old.incident === true;
    const explicitSafe = !incidentRequiresReview && current.get(key(old))?.status === '影響なし';
    const sources = old.evidence || [];
    const queriedAll = (packages.coverage || []).some(entry => entry.area === 'osv-query' && entry.status === 'complete')
      && !(packages.coverage || []).some(entry => /^osv-/.test(entry.area) && entry.status !== 'complete');
    const scannedAllSources = sources.length > 0 && sources.every(file => (packages.coverage || []).some(entry => entry.area === 'lockfile' && entry.path === file && entry.status === 'complete'));
    const excluded = excludedLocations.get(`${old.package?.ecosystem}:${old.package?.name}${old.version ? `:${old.version}` : ''}`);
    const unqueriedOccurrence = excluded?.has(null) || sources.some(file => excluded?.has(file));
    const noStageFailure = !coverage.some(entry => ['inventory', 'match', 'scan-packages'].includes(entry.area) && coverageKind(entry) === 'failed');
    // 同じtupleが非公開・照合対象外へ変わっただけでは、以前の陽性を解消しない。
    if (!unqueriedOccurrence && (explicitSafe || !incidentRequiresReview && old.package && queriedAll && scannedAllSources && noStageFailure)) changes.resolved.push(old);
    else { changes.unconfirmed.push(old); snapshot.push(old); }
  }
  return { ...changes, snapshot };
}

/** 公開severityを計算済み数値と未評価vectorに分ける。並び順・報告が呼ぶ。 @example normalizeSeverity('CVSS:3.1/AV:N/AC:L') */
export function normalizeSeverity(value, source = 'unknown') {
  const origin = typeof source === 'string' && /^[A-Za-z0-9 ._:/-]{1,120}$/.test(source) ? source : 'unknown';
  if (Array.isArray(value)) {
    return value.map(entry => normalizeSeverity(entry, origin)).sort((a, b) => b.rank - a.rank)[0] || normalizeSeverity(null, origin);
  }
  const raw = value && typeof value === 'object' ? value.score ?? value.raw ?? value.level : value;
  const type = value && typeof value === 'object' && /^(?:CVSS_V[234]|CVSS:[234]\.[01]|label|numeric)$/.test(value.type || value.method || '') ? value.type || value.method : null;
  const label = typeof raw === 'string' ? raw.toUpperCase() : '';
  if (Object.hasOwn(SEVERITY, label)) return { level: label === 'MODERATE' ? 'MEDIUM' : label, rank: SEVERITY[label], score: null, method: 'label', raw: label, source: origin, evaluated: true };
  const number = typeof raw === 'number' ? raw : typeof raw === 'string' && /^(?:[0-9](?:\.\d)?|10(?:\.0)?)$/.test(raw) ? Number(raw) : NaN;
  if (Number.isFinite(number) && number >= 0 && number <= 10) {
    const level = number >= 9 ? 'CRITICAL' : number >= 7 ? 'HIGH' : number >= 4 ? 'MEDIUM' : 'LOW';
    return { level, rank: SEVERITY[level], score: number, method: type || 'numeric', raw: number, source: origin, evaluated: true };
  }
  const vector = typeof raw === 'string' && /^CVSS:[234]\.[01](?:\/[A-Za-z0-9]+:[A-Za-z0-9.]+){1,40}$/.test(raw) && raw.length <= 500 ? raw : null;
  // 未計算vector・未知値をLOWより低い安全側の順位へ落とさない。
  return { level: 'UNKNOWN', rank: 1, score: null, method: vector ? type || vector.split('/')[0] : 'unknown', raw: vector, source: origin, evaluated: false };
}

/** 公開告知ID以外をalias関係へ入れない。別名統合と詳細表示が呼ぶ。 @example validAdvisoryId('CVE-2026-1234') */
export function validAdvisoryId(value) { return typeof value === 'string' && /^(?:CVE-\d{4}-\d{4,}|GHSA-[a-z0-9]+(?:-[a-z0-9]+)*|(?:OSV|PYSEC|RUSTSEC|MAL|GO|MFSA)-[A-Za-z0-9][A-Za-z0-9._-]{1,160}|BREW-[A-Za-z0-9][A-Za-z0-9@+._-]{1,240})$/.test(value); }

/** 影響版の宣言・実物・稼働を分離する。照合が呼び、親projectの稼働を依存実行へ昇格させない。 @example assessPackageImpact(hit) */
export function assessPackageImpact(record) {
  const target = record.package || record;
  const version = record.version;
  const observations = Array.isArray(record.occurrences) ? record.occurrences : [];
  const identityMatches = entry => (entry.name || entry.package?.name) === target.name
    && (entry.ecosystem || entry.package?.ecosystem) === target.ecosystem && entry.version === version;
  const installation = (record.installationEvidence || []).filter(identityMatches).map(entry => ({ ...entry, evidenceKind: entry.evidenceKind || 'installed-metadata' }));
  // 同名版のprivate/git/local実物を公開lockの照合結果へ転用しない。
  const exact = [...observations, ...installation].filter(identityMatches)
    .filter(entry => entry.queryEligible !== false && !['private', 'git', 'local'].includes(entry.origin));
  const host = exact.filter(entry => entry.evidenceScope !== 'image' && (!entry.platform || ['unknown', 'darwin', 'macos', 'any'].includes(entry.platform)));
  const running = host.some(entry => entry.evidenceKind === 'running-target-metadata' && entry.targetVerified === true);
  // SBOMは画像digestへ束縛された記録であり、画像のplatformをMac実物条件へ変換しない。
  const sbom = exact.some(entry => entry.evidenceKind === 'digest-bound-sbom' && entry.digestBound === true && /^sha256:[a-f0-9]{64}$/.test(entry.imageDigest || ''));
  const installed = host.some(entry => entry.evidenceKind === 'installed-metadata');
  const declared = observations.some(entry => entry.evidenceKind === 'lock-declaration') || (record.evidence || []).length > 0;
  return { kind: running ? 'running-target-affected' : installed ? 'installed-affected' : sbom ? 'image-record-affected' : declared ? 'declared-only' : 'installation-unknown',
    compromise: 'unconfirmed', installationConfirmed: running || installed, executionConfirmed: running,
    evidenceKinds: [...new Set(exact.map(entry => entry.evidenceKind).filter(Boolean))].sort(),
    optional: observations.some(entry => entry.optional === true), platformUnconfirmed: observations.some(entry => entry.platform && !['darwin', 'macos', 'any'].includes(entry.platform)) };
}

/** aliasだけで告知を推移結合し、全対象・出典を保持する。報告と差分処理が呼ぶ。 @example aggregateAdvisories(findings, details) */
export function aggregateAdvisories(findings, details = []) {
  if (findings.length > 30000 || details.length > 30000) throw new SweepError('CAPACITY', { cause: 'limit', operation: 'assessment' });
  const parents = new Map();
  const root = id => { let current = id; while (parents.get(current) !== current) current = parents.get(current); return current; };
  const add = id => { if (!parents.has(id)) { if (parents.size >= 30000) throw new SweepError('CAPACITY', { cause: 'limit', operation: 'assessment' }); parents.set(id, id); } };
  const byId = new Map(details.filter(detail => validAdvisoryId(detail.id)).map(detail => [detail.id, detail]));
  for (const value of [...details, ...findings]) {
    const id = value.advisoryId || value.id;
    if (!validAdvisoryId(id)) continue;
    add(id);
    const aliases = [...(Array.isArray(value.aliases) ? value.aliases : []), ...(byId.get(id)?.aliases || [])];
    if (aliases.length > 100) throw new SweepError('CAPACITY', { cause: 'limit', operation: 'assessment' });
    for (const alias of aliases.filter(validAdvisoryId)) {
      add(alias);
      const a = root(id), b = root(alias);
      if (a !== b) parents.set(a, b);
    }
  }
  const members = new Map();
  for (const id of parents.keys()) { const key = root(id); if (!members.has(key)) members.set(key, []); members.get(key).push(id); }
  const canonical = new Map();
  for (const ids of members.values()) {
    ids.sort((a, b) => Number(!a.startsWith('CVE-')) - Number(!b.startsWith('CVE-')) || a.localeCompare(b));
    for (const id of ids) canonical.set(id, ids[0]);
  }
  const grouped = new Map();
  for (const finding of findings) {
    const originalId = finding.advisoryId || finding.id;
    const id = canonical.get(originalId) || originalId;
    if (!grouped.has(id)) grouped.set(id, { id, advisoryIds: members.get(parents.has(originalId) ? root(originalId) : '') || [originalId], findings: [], sources: [], affectedTargets: [], withdrawals: [] });
    const group = grouped.get(id);
    group.findings.push(finding);
    group.sources.push(...(finding.sources || []));
    const locations = finding.localEvidence || finding.evidence || [];
    const targetLocations = locations.length ? locations : [null];
    for (const location of targetLocations) group.affectedTargets.push({ ecosystem: finding.package?.ecosystem || null, name: finding.package?.name || null,
      version: finding.version || null, location, impact: finding.impact || null });
    for (const advisoryId of group.advisoryIds) if (byId.get(advisoryId)?.withdrawn) group.withdrawals.push({ id: advisoryId, withdrawnAt: byId.get(advisoryId).withdrawn });
  }
  const groups = [...grouped.values()].map(group => ({ ...group, advisoryIds: [...new Set(group.advisoryIds)].sort(), sources: [...new Set(group.sources)].sort(),
    affectedTargets: [...new Map(group.affectedTargets.map(target => [JSON.stringify([target.ecosystem, target.name, target.version, target.location]), target])).values()],
    withdrawals: [...new Map(group.withdrawals.map(value => [value.id, value])).values()],
    severity: group.findings.map(value => normalizeSeverity(value.severity)).sort((a, b) => b.rank - a.rank)[0] || normalizeSeverity(null) })).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return { groups, uniqueAdvisoryCount: groups.filter(group => group.advisoryIds.some(validAdvisoryId)).length,
    affectedTargetCount: new Set(groups.flatMap(group => group.affectedTargets.filter(target => target.name).map(target => JSON.stringify([target.ecosystem, target.name, target.version, target.location])))).size,
    advisoryTargetCount: groups.reduce((sum, group) => sum + group.affectedTargets.filter(target => target.name).length, 0), canonicalIds: Object.fromEntries(canonical) };
}
