import path from 'node:path';

const COMPLETE = new Set(['complete', 'ok', 'absent', 'not-applicable']);
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
    if (!path.isAbsolute(raw) || path.normalize(raw) !== raw || !expanded.startsWith(`${userHome}/`)) continue;
    const first = path.relative(userHome, expanded).split(path.sep)[0];
    if (first.startsWith('.') || ['Library', 'Applications'].includes(first)) continue;
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
  return coverage.some(entry => coverageKind(entry) === 'excluded') ? 'complete-with-exclusions' : 'complete';
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
      finding.knownExploited || detail?.knownExploited ? 1 : 0, SEVERITY[String(detail?.severity || finding.severity).toUpperCase()] || 0,
      finding.projectActive ? 1 : 0, finding.installationEvidence?.length ? 1 : 0, String(finding.scope).includes('仕事') ? 1 : 0];
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
  const current = new Map(findings.map(finding => [finding.id, finding]));
  const prior = new Map(previous.map(finding => [finding.id, finding]));
  const changes = { new: [], continuing: [], resolved: [], unconfirmed: [] };
  const snapshot = findings.filter(positive).map(finding => ({ id: finding.id, title: finding.title, status: finding.status,
    advisoryId: finding.advisoryId, package: finding.package, version: finding.version, evidence: finding.localEvidence || [], scope: finding.scope,
    incident: finding.incident === true, advisoryType: finding.advisoryType }));
  for (const finding of findings.filter(positive)) changes[prior.has(finding.id) ? 'continuing' : 'new'].push(finding);
  for (const old of previous) {
    if (current.has(old.id) && positive(current.get(old.id))) continue;
    const incidentRequiresReview = old.status === '確定' || old.incident === true;
    const explicitSafe = !incidentRequiresReview && current.get(old.id)?.status === '影響なし';
    const sources = old.evidence || [];
    const queriedAll = (packages.coverage || []).some(entry => entry.area === 'osv-query' && entry.status === 'complete')
      && !(packages.coverage || []).some(entry => /^osv-/.test(entry.area) && entry.status !== 'complete');
    const scannedAllSources = sources.length > 0 && sources.every(file => (packages.coverage || []).some(entry => entry.area === 'lockfile' && entry.path === file && entry.status === 'complete'));
    const noStageFailure = !coverage.some(entry => ['inventory', 'match', 'scan-packages'].includes(entry.area) && coverageKind(entry) === 'failed');
    // 未処理・読み取り失敗・消えただけのパスを解消としない。
    if (explicitSafe || !incidentRequiresReview && old.package && queriedAll && scannedAllSources && noStageFailure) changes.resolved.push(old);
    else { changes.unconfirmed.push(old); snapshot.push(old); }
  }
  return { ...changes, snapshot };
}
