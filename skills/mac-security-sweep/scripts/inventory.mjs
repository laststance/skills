#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRunContext } from './runtime.mjs';
import { validateConfiguration } from './configuration.mjs';
import { readStatus } from './safe-io.mjs';
import { safeDiagnostic, SweepError } from './diagnostics.mjs';
import { discoverProjects } from './discovery.mjs';
import { collectApplications, collectBrowserExtensions, collectEditorExtensions, collectRuntimes, collectMcpAndCloud, collectPersistence, collectProtection, collectContainersAndSsh } from './environment-readers.mjs';
export { cleanText, extensionSource, projectMcpServer, parseLsof, projectProcessFiles, projectLaunchRuntimes } from './inventory-projections.mjs';

/** 利用者向け識別子をreader内の有限IDへ写す。設定値そのものは出力しない。 @example normalizeReaderConfig(config) */
export function normalizeReaderConfig(config) {
  const aliases = { Chrome: 'chrome', Canary: 'chrome-canary', Edge: 'edge', Brave: 'brave', Firefox: 'firefox', Safari: 'safari', 'VS Code': 'vscode', Cursor: 'cursor', Insiders: 'vscode-insiders', Portable: 'portable', Volta: 'volta', 'Vite+': 'vite-plus', Homebrew: 'homebrew', Java: 'java', Ruby: 'ruby' };
  return { ...config, browserProfiles: (config.browserProfiles || []).map(item => ({ ...item, product: aliases[item.product] || item.product })), editorRoots: (config.editorRoots || []).map(item => ({ ...item, editor: aliases[item.editor] || item.editor })), runtimeRoots: (config.runtimeRoots || []).map(item => ({ ...item, family: aliases[item.family] || item.family })) };
}

/** 同じ共有contextで再入可能な棚卸しを行う。runnerと単独CLIが呼ぶ。 @example await inventory({context, previous: state.discoveryContinuation}) */
export async function inventory(options = {}) {
  const owned = !options.context;
  const context = options.context || createRunContext(options);
  const originalConfig = context.config;
  context.config = normalizeReaderConfig(options.config || context.config);
  if (options.systemRoot) context.systemRoot = options.systemRoot;
  const started = context.monotonicNow();
  const result = { schemaVersion: 2, generatedAt: new Date(context.wallNow()).toISOString(), host: {}, homebrew: { formulae: [], casks: [] },
    applications: [], extensions: [], browserExtensions: [], runtimes: [], globalPackages: [], lockfiles: [], mcpServers: [],
    launchItems: [], loginItems: [], processes: [], network: {}, ssh: {}, containers: [], sboms: [], sbomPackages: [],
    executionContexts: [], packageRoots: [], projectRoots: [], projectDirectories: [], cloudConfigurations: [], protection: { xprotect: [] },
    coverage: [], commands: [], diagnostics: [], readOnly: true, outboundRequests: 0 };
  const stage = async (name, collect) => {
    try { await collect(); }
    catch (error) { result.diagnostics.push(safeDiagnostic(error, 'READER', 'inventory')); result.coverage.push({ area: name, status: 'partial', reason: 'この領域の収集を完了できませんでした。保存された診断コードを確認してください。' }); }
    await context.checkpoint({ stage: 'inventory', value: result });
  };
  try {
    // 発見済みのproject集合を、project MCP/venv/SBOM readerへ渡す。
    await stage('discovery', async () => {
      const previous = options.previous?.discoveryContinuation || options.previous || {};
      const packages = options.previous?.packageContinuation;
      const acknowledgements = new Map((packages?.acknowledgedLockfiles || []).map(item => [item.path, item.sourceIdentity]));
      const pageAcknowledged = context.continuationVerified === true && Array.isArray(previous.files)
        && previous.files.every(item => acknowledgements.get(item.path) === item.sourceIdentity)
        && Array.isArray(packages?.pendingLockfiles) && packages.pendingLockfiles.length === 0
        && Array.isArray(packages?.pendingPackageKeys) && packages.pendingPackageKeys.length === 0
        && (!packages?.recordPage || packages.recordPage.pendingGlobals === 0 && packages.recordPage.pendingSboms === 0)
        && Array.isArray(options.previous?.advisoryContinuation?.pendingIds) && options.previous.advisoryContinuation.pendingIds.length === 0;
      const discovery = await discoverProjects(context, previous, { ...options.discoveryLimits, pageAcknowledged });
      for (const key of ['projectRoots', 'lockfiles', 'packageRoots', 'projectDirectories', 'rootCandidates']) result[key] = discovery[key];
      result.scanRoots = result.projectRoots;
      result.discoveryContinuation = discovery.continuation;
      result.coverage.push(...discovery.coverage); result.diagnostics.push(...discovery.diagnostics);
    });
    // 共通poolの上限内で独立readerを開始する。アプリ依存readerだけ後段に置く。
    await Promise.all([
      stage('applications', () => collectApplications(context, result)),
      stage('runtimes', () => collectRuntimes(context, result)),
      stage('mcp-cloud', () => collectMcpAndCloud(context, result)),
      stage('protection', () => collectProtection(context, result)),
      stage('containers-ssh', () => collectContainersAndSsh(context, result)),
    ]);
    await Promise.all([
      stage('browser-extensions', () => collectBrowserExtensions(context, result)),
      stage('editor-extensions', () => collectEditorExtensions(context, result)),
      stage('persistence', () => collectPersistence(context, result)),
    ]);
    result.elapsedMs = context.monotonicNow() - started;
    result.collectionCoverage = result.coverage.some(item => !['complete', 'absent', 'excluded', 'not-applicable'].includes(item.status)) ? 'partial' : 'complete';
    result.runStatus = result.collectionCoverage;
    result.impact = 'not-assessed';
    return result;
  } finally { context.config = originalConfig; if (owned) await context.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) process.stdout.write('使い方: node scripts/inventory.mjs\n実行場所: スキルroot。標準出力は秘密を除いた棚卸しJSONです。私有の証拠保存先へ保存してください。\n読み取り専用。--help はスキャンも通信も行いません。部分取得は終了コード2です。\n');
  else {
    let context;
    try {
      if (args.length) throw new SweepError('CONFIG', { cause: 'malformed', operation: 'cli' });
      context = createRunContext();
      const stateRoot = path.join(context.home, '.local/state/mac-security-sweep');
      let state = {};
      try { state = await context.io.readJson(path.join(stateRoot, 'state.json'), { roots: [stateRoot], maxBytes: 32 * 1024 ** 2 }); }
      catch (error) { if (readStatus(error) !== 'absent') throw new SweepError('STATE', { cause: 'malformed', operation: 'state' }); }
      context.config = validateConfiguration(state, context.home);
      const data = await inventory({ context, previous: state });
      process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
      process.exitCode = data.runStatus === 'partial' ? 2 : 0;
    } catch (error) { const detail = safeDiagnostic(error); process.stderr.write(`${JSON.stringify(detail)}\n`); process.exitCode = ['MSS_CONFIG', 'MSS_STATE'].includes(detail.code) ? 64 : 1; }
    finally { await context?.close(); }
  }
}
