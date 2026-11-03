import path from 'node:path';
import { allowedProjectRoot, forbiddenContent, within } from './safe-io.mjs';
import { SweepError } from './diagnostics.mjs';
import { normalizeLanguage } from './locale.mjs';
import { SOURCES, MOZILLA_SOURCES } from './source-registry.mjs';

export const STATE_SCHEMA = 2;
export const CONFIG_KEYS = Object.freeze(['scanRoots', 'queryUnknownGlobals', 'homebrewPrefixes', 'applicationRoots', 'browserProfiles', 'editorRoots', 'runtimeRoots', 'sbomFiles']);
export const PROGRESS_KEYS = Object.freeze(['sourceCursors', 'sourceContinuations', 'newsFallbackSince', 'packageContinuation', 'advisoryContinuation', 'assessmentSnapshot', 'discoveryContinuation', 'productBaselines', 'adaptiveNews', 'transport', 'lastRunAt', 'lastSuccessfulAt', 'lastRunStatus', 'lastReport', 'locale']);
const BROWSERS = new Set(['Chrome', 'Canary', 'Edge', 'Brave', 'Firefox', 'Safari']);
const EDITORS = new Set(['VS Code', 'Cursor', 'Insiders', 'Portable']);
const RUNTIMES = new Set(['nvm', 'fnm', 'Volta', 'volta', 'asdf', 'mise', 'Vite+', 'vite-plus', 'Homebrew', 'homebrew', 'node', 'uv', 'pipx', 'conda', 'venv', 'python', 'Java', 'java', 'Ruby', 'ruby', 'rbenv', 'rvm', 'chruby', 'asdf-ruby', 'mise-ruby']);
// Recognize retired cursor keys only to read old committed generations; collectors never fetch them.
const SOURCE_NAMES = new Set([...SOURCES, ...MOZILLA_SOURCES].map(source => source.name).concat('Cursor security notice'));
const IMPACT_FIELDS = ['compromise', 'installationConfirmed', 'executionConfirmed', 'optional', 'platformUnconfirmed'];
const PROGRESS_FIELDS = new Set(`schemaVersion parsedFiles pendingLockfiles acknowledgedLockfiles query queries pendingPackageKeys completedPackageKeys cycleStartedAt catalogSignature findingCache path sourceIdentity parserVersion status key fingerprint pageToken vulns complete id modified fetchedAt pendingIds cache summary severity severityDetails method raw level rank score source evaluated aliases withdrawn advisoryType fixed name ecosystem version knownExploited signature queue files projects directory root scope depth offset identity format size modifiedAt observationStatus page pages pageNumber pageAcknowledged pageCount previousPages count pending capacityReached recordId origin queryEligible evidenceKind sourceIdentity evidence localEvidence title incident advisoryId package impact kind installed running compromised declared digestBound imageDigest evidenceKinds targetVerified confirmed reason schema baselines pendingProductIds homebrew snapshotId tree records pendingPaths sha affected upstream fix urls sourceUrl sourceName productId product channel fixedVersion advisoryIds updates platform vulnerabilityRangeCoverage url window since until items products description publishedAt updatedAt needsReview references type ranges events introduced last_affected affects knownExploitedIds vendor dateAdded dueDate requiredAction cveID cve aliases severityEvidence database_specific cvss cwe_ids ghsa_id html_url lastSuccessfulAt coverage freshness baselineComplete fetchedAt expiresAt completeWithExclusions`.split(/\s+/));
for (const key of [...IMPACT_FIELDS, 'range', 'versions', 'editor', 'installationWindow', 'iocs', 'value', 'specificity', 'context', 'roots', 'processedPages', 'rootIdentities', 'acknowledgedFiles', 'withdrawnAt', 'depthLimited', 'registered', 'enablementEvidence']) PROGRESS_FIELDS.add(key);
for (const key of 'sourceId categories datePrecision dateSemantics reasonCode ongoing distribution distributionRelease repository architecture sourcePackage sourceVersion binaryName binaryVersion purlType provenanceStatus distributionConflict componentCount skippedPackages unsupportedPackages unknownOrigins distributionConflicts historyScope queriedAt queryComplete queryAssessments conflictingEvidence verifiedAt observedAt assessmentBasis published'.split(' ')) PROGRESS_FIELDS.add(key);
const STRUCTURES = Object.fromEntries(Object.entries({
  packageContinuation: 'schemaVersion parsedFiles pendingLockfiles acknowledgedLockfiles query pendingPackageKeys completedPackageKeys cycleStartedAt catalogSignature findingCache',
  parsedFiles: 'path sourceIdentity parserVersion status', acknowledgedLockfiles: 'path sourceIdentity',
  query: 'schemaVersion queries pendingPackageKeys cycleStartedAt', queries: 'key fingerprint pageToken vulns complete queriedAt historyScope', vulns: 'id modified',
  advisoryContinuation: 'pendingIds cache', cache: 'id summary aliases modified withdrawn fetchedAt severity severityDetails advisoryType fixed knownExploited',
  discoveryContinuation: 'schemaVersion signature complete queue files projects roots page acknowledgedFiles depthLimited',
  queue: 'directory root scope depth offset identity', files: 'path scope format size modifiedAt sourceIdentity observationStatus', roots: 'path scope identity',
  adaptiveNews: 'baselines pendingProductIds homebrew', homebrew: 'schemaVersion snapshotId fetchedAt tree records pendingPaths', tree: 'path sha',
  assessmentSnapshot: 'id title status advisoryId package version evidence scope incident advisoryType aliases impact reasonCode queriedAt queryComplete historyScope conflictingEvidence verifiedAt observedAt assessmentBasis',
  locale: 'requestedLanguage canonicalLanguage translationStatus',
  queryAssessments: 'package version queriedAt complete status advisoryIds historyScope',
  package: 'name ecosystem distribution distributionRelease architecture sourcePackage sourceVersion binaryName binaryVersion purlType provenanceStatus distributionConflict', severity: 'level rank score method raw source evaluated', severityDetails: 'method raw source type score',
  severityEvidence: 'level rank score method raw source evaluated', impact: 'kind compromise installationConfirmed executionConfirmed evidenceKinds optional platformUnconfirmed',
  backlog: 'url window items',
  window: 'since until', installationWindow: 'since until',
}).map(([key, value]) => [key, new Set(value.split(' '))]));

/** 継続objectの未知fieldを入れ子でも除外する。元stateでは保持し証拠に複製しない。 @example projectProgressTree(value, 'packageContinuation') */
function projectProgressTree(value, parent) {
  if (Array.isArray(value)) return value.map(entry => projectProgressTree(entry, parent));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => progressFieldAllowed(parent, key)).map(([key, entry]) => [key, projectProgressTree(entry, key)]));
}

/** 射影と私有mergeで同じschema判定を使う。既知fieldの削除を未知拡張の保護と混同しない。 @example progressFieldAllowed('query','pageToken') */
function progressFieldAllowed(parent, key) {
  return parent === 'state' ? PROGRESS_KEYS.includes(key) || ['schemaVersion', 'generation'].includes(key)
    : STRUCTURES[parent] ? STRUCTURES[parent].has(key)
    : SOURCE_NAMES.has(parent) ? ['url', 'window', 'items', 'backlog'].includes(key)
    : parent === 'sourceCursors' || parent === 'sourceContinuations' ? SOURCE_NAMES.has(key)
    : parent === 'baselines' ? ['macos', 'safari', 'xcode', 'chrome', 'cursor', 'node', 'firefox', 'firefox-esr', 'thunderbird'].includes(key)
      : parent === 'transport' ? key === 'cooldowns'
        : parent === 'cooldowns' ? ['api.osv.dev', 'api.github.com', ...[...SOURCES, ...MOZILLA_SOURCES].map(source => new URL(source.url).hostname)].includes(key)
          : PROGRESS_FIELDS.has(key);
}

const OBJECT_PROGRESS = new Set('packageContinuation advisoryContinuation discoveryContinuation adaptiveNews sourceCursors sourceContinuations productBaselines baselines homebrew query transport cooldowns window installationWindow package impact locale'.split(' '));
const ARRAY_PROGRESS = new Set('queryAssessments categories backlog assessmentSnapshot parsedFiles pendingLockfiles acknowledgedLockfiles queries pendingPackageKeys completedPackageKeys findingCache vulns pendingIds cache queue files projects roots pendingProductIds tree records pendingPaths updates aliases affected evidence evidenceKinds items products urls advisoryIds severityDetails severityEvidence iocs'.split(' '));
const RECORD_ARRAYS = new Set('queryAssessments backlog assessmentSnapshot parsedFiles acknowledgedLockfiles queries vulns cache queue files roots tree records updates items affected severityDetails severityEvidence iocs'.split(' '));
const DATES = new Set('queriedAt verifiedAt observedAt lastRunAt lastSuccessfulAt newsFallbackSince cycleStartedAt modified fetchedAt modifiedAt publishedAt updatedAt withdrawnAt withdrawn since until'.split(' '));

/** 認識した継続schemaの型をwork前に検証する。未知拡張の値は読まず私有stateに残す。 @example validateProgress(state) */
export function validateProgress(state) {
  const pending = PROGRESS_KEYS.filter(key => state[key] !== undefined).map(key => [key, state[key]]);
  const reject = () => { throw new SweepError('STATE', { cause: 'malformed', operation: 'state' }); };
  while (pending.length) {
    const [key, value] = pending.pop();
    if (OBJECT_PROGRESS.has(key) && (!value || typeof value !== 'object' || Array.isArray(value))) reject();
    if (ARRAY_PROGRESS.has(key) && !Array.isArray(value)) reject();
    // GitHubの修正版は文字列、Homebrew/OSVの修正版一覧は配列になる。
    if (key === 'fixed' && value !== null && typeof value !== 'string' && (!Array.isArray(value) || value.some(item => typeof item !== 'string' && (!item || typeof item !== 'object' || Array.isArray(item))))) reject();
    if (DATES.has(key) && value !== null && (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d(?:T[\d:.]+Z)?$/.test(value) || !Number.isFinite(Date.parse(value)))) reject();
    if (key === 'requestedLanguage') { try { if (typeof value !== 'string' || normalizeLanguage(value) !== value) reject(); } catch { reject(); } }
    if (key === 'canonicalLanguage' && !['ja', 'en'].includes(value)) reject();
    if (key === 'translationStatus' && !['not-required', 'pending', 'complete'].includes(value)) reject();
    if (key === 'lastRunStatus' && !['complete', 'complete-with-exclusions', 'partial'].includes(value)) reject();
    if (key === 'lastReport' && (typeof value !== 'string' || !path.isAbsolute(value))) reject();
    if (key === 'sourceCursors') {
      for (const [source, date] of Object.entries(value)) if (SOURCE_NAMES.has(source) && (typeof date !== 'string' || !/^\d{4}-\d\d-\d\d/.test(date) || !Number.isFinite(Date.parse(date)))) reject();
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (RECORD_ARRAYS.has(key) && (!item || typeof item !== 'object' || Array.isArray(item))) reject();
        if (item && typeof item === 'object' && !Array.isArray(item)) for (const [field, entry] of Object.entries(item)) if (progressFieldAllowed(key, field)) pending.push([field, entry]);
      }
    } else if (value && typeof value === 'object') {
      for (const [field, entry] of Object.entries(value)) if (progressFieldAllowed(key, field)) {
        if ((key === 'sourceContinuations' || key === 'baselines' || key === 'productBaselines') && (!entry || typeof entry !== 'object' || Array.isArray(entry))) reject();
        pending.push([field, entry]);
      }
    }
  }
}

/** ローカルパスの型だけを確認する。設定検証から呼び、値を診断へ転載しない。 @example configPath('~/Projects', home) */
function configPath(value, home) {
  if (typeof value !== 'string' || value.length > 4096 || /[\x00-\x1f\x7f]/.test(value) || value.split('/').includes('..')) throw new SweepError('CONFIG', { cause: 'malformed', operation: 'config' });
  const expanded = value.startsWith('~/') ? path.join(home, value.slice(2)) : value;
  if (!path.isAbsolute(expanded) || path.normalize(expanded) !== expanded || forbiddenContent(expanded)) throw new SweepError('CONFIG', { cause: 'boundary', operation: 'config' });
  return expanded;
}

/** 既知設定だけを厳格に検証・射影する。未知キーは元stateだけに保持する。 @example validateConfiguration({scanRoots:[]}, home) */
export function validateConfiguration(state, home) {
  if (!state || Array.isArray(state) || typeof state !== 'object') throw new SweepError('STATE', { cause: 'malformed', operation: 'state' });
  if (state.schemaVersion !== undefined && (!Number.isInteger(state.schemaVersion) || state.schemaVersion < 1 || state.schemaVersion > STATE_SCHEMA)) throw new SweepError('STATE', { cause: state.schemaVersion > STATE_SCHEMA ? 'future-schema' : 'malformed', operation: 'state' });
  validateProgress(state);
  const config = { queryUnknownGlobals: state.queryUnknownGlobals ?? true };
  if (typeof config.queryUnknownGlobals !== 'boolean') throw new SweepError('CONFIG', { cause: 'malformed', operation: 'config' });
  const roots = state.scanRoots ?? [{ path: '~/Projects', scope: 'personal' }, { path: '~/repository', scope: 'personal' }, { path: '~/work', scope: 'work' }];
  if (!Array.isArray(roots) || roots.length > 20) throw new SweepError('CONFIG', { cause: 'limit', operation: 'config' });
  config.scanRoots = roots.map(root => {
    if (!root || Array.isArray(root) || typeof root !== 'object') throw new SweepError('CONFIG', { cause: 'malformed', operation: 'config' });
    const expanded = configPath(root.path, home);
    if (!allowedProjectRoot(home, expanded) || root.scope !== undefined && !['personal', 'work'].includes(root.scope)) throw new SweepError('CONFIG', { cause: 'boundary', operation: 'config' });
    return { path: expanded, scope: root.scope || 'personal' };
  });
  for (const key of ['homebrewPrefixes', 'applicationRoots', 'sbomFiles']) {
    const values = state[key] ?? [];
    if (!Array.isArray(values) || values.length > 20) throw new SweepError('CONFIG', { cause: 'limit', operation: 'config' });
    config[key] = values.map(value => {
      const expanded = configPath(value, home);
      if (key === 'homebrewPrefixes' && !['/opt', '/usr/local', path.join(home, 'homebrew')].some(root => within(root, expanded)) || key !== 'homebrewPrefixes' && !within(home, expanded) && !within('/Applications', expanded)) throw new SweepError('CONFIG', { cause: 'boundary', operation: 'config' });
      return expanded;
    });
  }
  for (const [key, id, allowed] of [['browserProfiles', 'product', BROWSERS], ['editorRoots', 'editor', EDITORS], ['runtimeRoots', 'family', RUNTIMES]]) {
    const values = state[key] ?? [];
    if (!Array.isArray(values) || values.length > 30) throw new SweepError('CONFIG', { cause: 'limit', operation: 'config' });
    config[key] = values.map(value => {
      if (!value || !allowed.has(value[id])) throw new SweepError('CONFIG', { cause: 'unsupported', operation: 'config' });
      const root = configPath(value.root, home);
      if (!within(home, root) || root === home) throw new SweepError('CONFIG', { cause: 'boundary', operation: 'config' });
      return { [id]: value[id], root };
    });
  }
  return config;
}

/** 元stateの未知値を証拠へ複製しない。世代commitが認識済み継続情報だけを保存する。 @example projectProgress(nextState) */
export function projectProgress(state) {
  return Object.fromEntries(PROGRESS_KEYS.filter(key => state[key] !== undefined).map(key => [key, projectProgressTree(state[key], key)]));
}

/** 私有stateだけに未知のobject keyを保持し、既知配列は新しい射影で置換する。 @example mergePrivateState(previous, progress) */
export function mergePrivateState(previous, progress, parent = 'state') {
  const result = Object.fromEntries(Object.entries(previous).filter(([key]) => !progressFieldAllowed(parent, key) || Object.hasOwn(progress, key)));
  for (const [key, value] of Object.entries(progress)) result[key] = value && typeof value === 'object' && !Array.isArray(value) && previous?.[key] && typeof previous[key] === 'object' && !Array.isArray(previous[key])
    ? mergePrivateState(previous[key], value, key) : value;
  return result;
}

/** Validate an output namespace before any directory is created. State-store and CLI share this boundary.
 * @example validateProfile('evaluation-en')
 */
export function validateProfile(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(value)) throw new SweepError('USAGE', { cause: 'malformed', operation: 'cli' });
  return value;
}

/** Parse the noninteractive runner options before inspecting the Mac or creating output directories.
 * @example parseRunnerArgs(['--language', 'EN', '--profile', 'evaluation-en'])
 */
export function parseRunnerArgs(args) {
  const options = {};
  const keys = { '--budget-ms': 'budgetMs', '--language': 'language', '--profile': 'profile' };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' && args.length === 1) return { help: true };
    const key = keys[arg];
    if (!key || options[key] !== undefined || !args[index + 1] || args[index + 1].startsWith('--')) throw new SweepError('USAGE', { cause: 'malformed', operation: 'cli' });
    const value = args[++index];
    if (key === 'language') options.language = normalizeLanguage(value);
    else if (key === 'profile') options.profile = validateProfile(value);
    else {
      options.budgetMs = /^\d+$/.test(value) ? Number(value) : NaN;
      if (!Number.isSafeInteger(options.budgetMs) || options.budgetMs < 12000 || options.budgetMs > 1680000) throw new SweepError('USAGE', { cause: 'limit', operation: 'cli' });
    }
  }
  return options;
}
