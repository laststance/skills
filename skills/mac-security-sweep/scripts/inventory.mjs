#!/usr/bin/env node
/** 読み取り専用のMac棚卸し。選別したメタデータだけをJSONへ出力する。 */
import { promises as fs, createReadStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { normalizeScanRoots } from './assessment.mjs';

const execFileAsync = promisify(execFile);
const home = os.homedir();
const started = Date.now();
const deadline = started + 8 * 60_000;
const result = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), host: {}, homebrew: { formulae: [], casks: [] },
  applications: [], extensions: [], browserExtensions: [], runtimes: [], globalPackages: [], lockfiles: [],
  mcpServers: [], launchItems: [], loginItems: [], processes: [], network: {}, ssh: {}, containers: [], executionContexts: [], packageRoots: [], projectRoots: [],
  coverage: [], commands: [],
};

/**
 * 棚卸しへ保存する外部メタデータを、長さ制限付きの一行へ整える。
 * 各収集処理が識別子や表示名をレポートへ追加するときに呼ぶ。
 * @returns 認証値と制御文字を除いた表示値。
 * @example
 * cleanText('Chrome');
 */
export function cleanText(value, maximum = 240) {
  if (typeof value !== 'string') return null;
  if (/https?:\/\/|(?:bearer\s|gh[pousr]_|sk-[A-Za-z0-9]|password\s*[=:]|token\s*[=:])/i.test(value)) return '[非表示]';
  return value.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, maximum);
}

/**
 * サイズ制限内のJSONを読み、生の本文をレポートへ渡さない。
 * 呼び出し元の収集処理が、メモリ上のオブジェクトから許可した項目だけを選ぶ。
 * @returns 解析済みデータと、確認範囲を説明するための読取状態。
 * @example
 * await readJson('/tmp/package.json');
 */
async function readJson(file, maxBytes = 8 * 1024 * 1024) {
  try {
    const stat = await fs.stat(file);
    if (stat.size > maxBytes) return { data: null, status: 'too-large' };
    return { data: JSON.parse(await fs.readFile(file, 'utf8')), status: 'complete' };
  } catch (error) {
    return { data: null, status: error.code === 'ENOENT' ? 'absent' : error.code === 'EACCES' || error.code === 'EPERM' ? 'permission-denied' : 'unparseable' };
  }
}

/**
 * ディレクトリを列挙し、不在とアクセス拒否を区別する。
 * @returns 項目一覧と状態。ファイルシステムの生のエラー本文は保持しない。
 * @example
 * await listDirectory('/Applications');
 */
async function listDirectory(directory) {
  try { return { entries: await fs.readdir(directory, { withFileTypes: true }), status: 'complete' }; }
  catch (error) { return { entries: [], status: error.code === 'ENOENT' ? 'absent' : 'permission-denied' }; }
}

/**
 * 固定の読み取り専用コマンドを時間制限付きで実行し、実行根拠を残す。
 * 生の出力はメモリに留め、収集処理が許可したメタデータへ変換する。
 * @param label - 認証値や設定本文を含めない、公開可能な実行コマンドの根拠。
 * @returns 内部解析用のコマンド出力。失敗時は空文字。
 * @example
 * await command('/usr/bin/sw_vers', ['-productVersion']);
 */
async function command(binary, args, label = [binary, ...args].join(' '), timeout = 20_000) {
  const begin = Date.now();
  if (begin >= deadline) { result.commands.push({ command: label, status: 'budget-exhausted', elapsedMs: 0 }); return ''; }
  try {
    const { stdout } = await execFileAsync(binary, args, {
      timeout: Math.min(timeout, deadline - begin), maxBuffer: 12 * 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '', HOMEBREW_NO_AUTO_UPDATE: '1', HOMEBREW_NO_ANALYTICS: '1', GH_NO_UPDATE_NOTIFIER: '1', GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0', PIP_DISABLE_PIP_VERSION_CHECK: '1' },
    });
    result.commands.push({ command: label, status: 'complete', exitCode: 0, elapsedMs: Date.now() - begin });
    return stdout;
  } catch (error) {
    result.commands.push({ command: label, status: error.killed ? 'timeout' : error.code === 'ENOENT' ? 'unavailable' : 'failed', exitCode: typeof error.code === 'number' ? error.code : null, elapsedMs: Date.now() - begin });
    return '';
  }
}

/**
 * 各収集処理の確認範囲を記録し、後続の判定で確度を評価できるようにする。
 * @example
 * coverage('applications', 'complete', 20);
 */
function coverage(area, status, count = 0, reason = undefined, begin = started) {
  result.coverage.push({ area, status, count, ...(reason ? { reason } : {}), elapsedMs: Date.now() - begin });
}

/**
 * 既知のplistをOS標準パーサーで読む。呼び出し元が出力項目を限定する。
 * @returns メモリ上のplistオブジェクト。丸ごとの保存は禁止する。
 * @example
 * await plist('/Applications/Safari.app/Contents/Info.plist');
 */
async function plist(file) {
  const raw = await command('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file]);
  try { return JSON.parse(raw); } catch { return {}; }
}

/**
 * 影響バージョンとの照合に使う、実際のOS・Homebrew・アプリの版を収集する。
 * {@link inventory}から一度呼ぶ。インストールや更新は実行しない。
 * @example
 * await collectApplications();
 */
async function collectApplications() {
  const begin = Date.now();
  const [version, build, brew] = await Promise.all([
    command('/usr/bin/sw_vers', ['-productVersion']), command('/usr/bin/sw_vers', ['-buildVersion']),
    command('/opt/homebrew/bin/brew', ['info', '--json=v2', '--installed'], undefined, 45_000),
  ]);
  result.host = { osVersion: cleanText(version.trim()), buildVersion: cleanText(build.trim()), architecture: os.arch() };
  try {
    const data = JSON.parse(brew);
    result.homebrew.formulae = (data.formulae || []).map(item => ({ name: cleanText(item.name), versions: (item.installed || []).map(entry => cleanText(entry.version)).filter(Boolean) }));
    result.homebrew.casks = (data.casks || []).map(item => ({ name: cleanText(item.token), versions: Array.isArray(item.installed) ? item.installed.map(value => cleanText(String(value))) : [cleanText(String(item.installed ?? item.version ?? 'unknown'))] }));
    coverage('homebrew', 'complete', result.homebrew.formulae.length + result.homebrew.casks.length, undefined, begin);
  } catch { coverage('homebrew', 'unavailable', 0, 'HomebrewのJSONを取得できなかった。', begin); }
  let incomplete = false;
  // アプリを起動せず、Info.plistだけでバンドル情報を確認する。
  for (const directory of ['/Applications', path.join(home, 'Applications'), '/System/Applications']) {
    const listing = await listDirectory(directory);
    if (!['complete', 'absent'].includes(listing.status)) incomplete = true;
    const queue = listing.entries.filter(entry => entry.isDirectory()).map(entry => ({ file: path.join(directory, entry.name), depth: 0 }));
    while (queue.length && Date.now() < deadline) {
      const { file, depth } = queue.shift();
      if (file.endsWith('.app')) {
        const data = await plist(path.join(file, 'Contents', 'Info.plist'));
        if (!data.CFBundleIdentifier) incomplete = true;
        result.applications.push({ name: cleanText(data.CFBundleDisplayName || data.CFBundleName || path.basename(file, '.app')), version: cleanText(data.CFBundleShortVersionString || data.CFBundleVersion || 'unknown'), build: cleanText(data.CFBundleVersion), bundleId: cleanText(data.CFBundleIdentifier), path: file });
      } else if (depth < 1) {
        const nested = await listDirectory(file);
        for (const entry of nested.entries.filter(item => item.isDirectory())) queue.push({ file: path.join(file, entry.name), depth: depth + 1 });
      }
    }
    if (queue.length) incomplete = true;
  }
  coverage('applications', incomplete ? 'partial' : 'complete', result.applications.length, incomplete ? '一部ディレクトリまたはInfo.plistを確認できなかったか、制限時間に達した。失敗コマンドを参照。' : undefined, begin);
}

/**
 * 入手元メタデータを正規化する。値の欠落を信頼できる入手元と扱わない。
 * {@link collectEditorExtensions}から呼ぶ。不明な文字列から入手元を推測しない。
 * @example
 * extensionSource('gallery');
 */
export function extensionSource(value) {
  if (typeof value !== 'string') return 'unknown';
  if (/open.?vsx/i.test(value)) return 'open-vsx';
  if (/^(gallery|marketplace|vsix|local|system)$/i.test(value)) return value.toLowerCase();
  return 'unknown';
}

/**
 * 拡張のID、有効登録、入手元、インストール日時を収集する。
 * この読み取り専用巡回では拡張コードや起動フックを実行しない。
 * @example
 * await collectEditorExtensions();
 */
async function collectEditorExtensions() {
  for (const [editor, relative] of [['vscode', '.vscode/extensions'], ['cursor', '.cursor/extensions']]) {
    const begin = Date.now();
    const directory = path.join(home, relative);
    const listing = await listDirectory(directory);
    const registry = await readJson(path.join(directory, 'extensions.json'));
    const registered = Array.isArray(registry.data) ? registry.data : null;
    const startCount = result.extensions.length;
    let incomplete = !['complete', 'absent'].includes(listing.status);
    // 旧版のディスク残存と、現在登録されている拡張を区別して保持する。
    for (const entry of listing.entries.filter(item => !item.name.startsWith('.') && (item.isDirectory() || item.isSymbolicLink()))) {
      const extensionPath = path.join(directory, entry.name);
      const manifest = await readJson(path.join(extensionPath, 'package.json'));
      if (!manifest.data) { incomplete = true; continue; }
      const data = manifest.data;
      const id = `${data.publisher || ''}.${data.name || ''}`.toLowerCase();
      if (!/^[\w-]+\.[\w.-]+$/.test(id) || !/^[\w.+-]+$/.test(data.version || '')) { incomplete = true; continue; }
      const registration = registered?.find(item => item.identifier?.id?.toLowerCase() === id.toLowerCase() && item.version === data.version);
      const metadata = registration?.metadata || data.__metadata || {};
      const stat = await fs.stat(extensionPath).catch(() => null);
      const timestamp = Number(metadata.installedTimestamp);
      const validTimestamp = Number.isFinite(timestamp) && timestamp > 0 && timestamp < 8.64e15;
      result.extensions.push({ editor, id, version: data.version, source: extensionSource(metadata.source || data.__metadata?.source), marketplace: 'not-verified-from-registry', installedAt: validTimestamp ? new Date(timestamp).toISOString() : stat?.birthtime.toISOString() || null, installedAtBasis: validTimestamp ? 'registry-installedTimestamp' : 'filesystem-birthtime-estimate', modifiedAt: stat?.mtime.toISOString() || null, path: extensionPath, active: registered ? Boolean(registration) : null, presentOnDisk: true });
    }
    coverage(`${editor}-extensions`, incomplete ? 'partial' : listing.status === 'absent' ? 'absent' : 'complete', result.extensions.length - startCount, registry.status !== 'complete' ? `拡張登録メタデータの状態: ${registry.status}。` : undefined, begin);
  }
}

/**
 * ブラウザのセッションを読まず、全プロファイルのChrome拡張マニフェストを調べる。
 * 名前が翻訳キーの場合は、そのキーを保持して表示名の推測を避ける。
 * @example
 * await collectBrowserExtensions();
 */
async function collectBrowserExtensions() {
  for (const [browser, relative] of [['chrome', 'Library/Application Support/Google/Chrome'], ['chrome-canary', 'Library/Application Support/Google/Chrome Canary']]) {
    const begin = Date.now();
    const root = path.join(home, relative);
    const profiles = await listDirectory(root);
    const countBefore = result.browserExtensions.length;
    let incomplete = !['complete', 'absent'].includes(profiles.status);
    // Extensionsの有無で探索し、標準名以外のプロファイルも対象にする。
    for (const profile of profiles.entries.filter(entry => entry.isDirectory())) {
      const directory = path.join(root, profile.name, 'Extensions');
      const extensions = await listDirectory(directory);
      if (!['complete', 'absent'].includes(extensions.status)) incomplete = true;
      for (const extension of extensions.entries.filter(entry => /^[a-p]{32}$/.test(entry.name) && entry.isDirectory())) {
        const versions = await listDirectory(path.join(directory, extension.name));
        for (const version of versions.entries.filter(entry => entry.isDirectory())) {
          const extensionPath = path.join(directory, extension.name, version.name);
          const manifest = await readJson(path.join(extensionPath, 'manifest.json'));
          if (!manifest.data) { incomplete = true; continue; }
          result.browserExtensions.push({ browser, profile: cleanText(profile.name), id: extension.name, name: cleanText(manifest.data.name), version: cleanText(manifest.data.version), path: extensionPath, active: null, evidence: 'manifest.jsonを確認。ファイルの存在だけでは有効状態を断定できない。' });
        }
      }
    }
    coverage(`${browser}-extensions`, incomplete ? 'partial' : profiles.status === 'absent' ? 'absent' : 'complete', result.browserExtensions.length - countBefore, undefined, begin);
  }
}

/**
 * npmフックを起動せず、既知のグローバルnode_modules配下のマニフェストを読む。
 * @returns 有効なパッケージ名と版を取得できた件数。
 * @example
 * await collectNodePackages('/opt/homebrew/lib/node_modules');
 */
async function collectNodePackages(directory) {
  const listing = await listDirectory(directory);
  const hiddenLock = await readJson(path.join(directory, '.package-lock.json'));
  let count = 0;
  const candidates = [];
  for (const entry of listing.entries.filter(item => !item.name.startsWith('.'))) {
    if (entry.name.startsWith('@')) {
      const scoped = await listDirectory(path.join(directory, entry.name));
      for (const child of scoped.entries) candidates.push(path.join(directory, entry.name, child.name));
    } else candidates.push(path.join(directory, entry.name));
  }
  for (const candidate of candidates) {
    const { data } = await readJson(path.join(candidate, 'package.json'));
    if (data && /^(@[\w.-]+\/)?[\w.-]+$/.test(data.name || '') && /^[\w.+-]+$/.test(data.version || '')) {
      const lockEntry = hiddenLock.data?.packages?.[`node_modules/${data.name}`] || hiddenLock.data?.packages?.[data.name];
      const resolved = data._resolved || (lockEntry?.version === data.version ? lockEntry.resolved : null);
      let publicRegistry = null, explicitPrivate = data.private === true;
      // 解決URLはメモリだけで確認し、認証付きURLや非公開ホストを保存しない。
      if (typeof resolved === 'string') {
        try {
          const url = new URL(resolved);
          publicRegistry = url.protocol === 'https:' && ['registry.npmjs.org', 'registry.yarnpkg.com'].includes(url.hostname) && !url.username && !url.password && !url.search;
          explicitPrivate ||= !publicRegistry;
        } catch { explicitPrivate = true; }
      }
      result.globalPackages.push({ ecosystem: 'npm', name: data.name, version: data.version, private: data.private === true, publicRegistry, explicitPrivate, evidence: path.join(candidate, 'package.json') });
      count++;
    }
  }
  return count;
}

/**
 * 既知のインストール先にあるNode本体から、組み込みBrotliの版だけを取得する。
 * {@link collectPackages}が呼び、ニュースのNode本体と同梱ライブラリの版を混同しないようにする。
 * @param executable - シンボリックリンクを解決済みの絶対パス。
 * @returns NodeとBrotliの版。既知の保存先外やラッパーは未確認として扱う。
 * @example
 * await readRuntimeVersions(process.execPath);
 */
async function readRuntimeVersions(executable) {
  const roots = ['/opt/homebrew/Cellar/node/', '/opt/homebrew/Cellar/node@', path.join(home, '.vite-plus/js_runtime/node/'), path.join(home, '.local/share/mise/installs/node/')];
  const trusted = executable === process.execPath || (path.basename(executable) === 'node' && roots.some(root => executable.startsWith(root)));
  if (!trusted) return { node: null, brotli: null, status: 'unverified-executable' };
  // 固定式以外を実行せず、プリロード環境変数とネイティブアドオンを無効にする。
  const raw = await command(executable, ['--no-addons', '-p', 'JSON.stringify(process.versions)']);
  try {
    const data = JSON.parse(raw);
    return { node: /^[\d.]+$/.test(data.node || '') ? data.node : null, brotli: /^[\d.]+$/.test(data.brotli || '') ? data.brotli : null, status: 'complete' };
  } catch { return { node: null, brotli: null, status: 'unavailable' }; }
}

/**
 * 過去のmiseも含む複数の管理先から、ランタイムとグローバルパッケージを確認する。
 * メタデータを直接読む。パッケージ管理プラグインやインストール処理は実行しない。
 * @example
 * await collectPackages();
 */
async function collectPackages() {
  const begin = Date.now();
  const runtimePaths = new Set([process.execPath, '/opt/homebrew/bin/node', path.join(home, '.vite-plus/bin/node'), path.join(home, '.local/share/mise/installs/node/24/bin/node'), path.join(home, '.local/share/mise/installs/node/24/node')]);
  const nodeRoots = new Set(['/opt/homebrew/lib/node_modules', '/usr/local/lib/node_modules', path.join(home, '.npm-global/lib/node_modules'), path.join(home, '.vite-plus/lib/node_modules'), path.join(home, '.local/share/pnpm/global/5/node_modules'), path.join(home, 'Library/pnpm/global/5/node_modules')]);
  const vitePackages = path.join(home, '.vite-plus/packages');
  const viteEntries = await listDirectory(vitePackages);
  const viteMetadata = [];
  // Vite+の独立したglobal保存先も確認し、ランタイム配下の旧版だけを現行と誤認しない。
  for (const entry of viteEntries.entries) {
    if (entry.isFile() && entry.name.endsWith('.json')) viteMetadata.push(path.join(vitePackages, entry.name));
    else if (entry.isDirectory() && entry.name.startsWith('@')) {
      const scoped = await listDirectory(path.join(vitePackages, entry.name));
      for (const item of scoped.entries.filter(item => item.isFile() && item.name.endsWith('.json'))) viteMetadata.push(path.join(vitePackages, entry.name, item.name));
    }
  }
  for (const metadataPath of viteMetadata) {
    const { data } = await readJson(metadataPath);
    if (data && /^(@[\w.-]+\/)?[\w.-]+$/.test(data.name || '') && /^[a-f0-9-]{36}$/.test(data.installId || '')) nodeRoots.add(path.join(vitePackages, data.name, data.installId, 'lib/node_modules'));
  }
  for (const root of [path.join(home, '.local/share/mise/installs/node'), path.join(home, '.vite-plus/node'), path.join(home, '.vite-plus/installs/node'), path.join(home, '.vite-plus/js_runtime/node')]) {
    const listing = await listDirectory(root);
    for (const entry of listing.entries.filter(item => item.isDirectory())) {
      runtimePaths.add(path.join(root, entry.name, 'bin/node'));
      nodeRoots.add(path.join(root, entry.name, 'lib/node_modules'));
    }
  }
  for (const runtimePath of runtimePaths) {
    const resolved = await fs.realpath(runtimePath).catch(() => null);
    if (!resolved) continue;
    nodeRoots.add(path.join(path.dirname(path.dirname(resolved)), 'lib/node_modules'));
    const components = await readRuntimeVersions(resolved);
    const knownWrapper = runtimePath === path.join(home, '.vite-plus/bin/node') && resolved.startsWith(path.join(home, '.vite-plus/')) && path.basename(resolved) === 'vp';
    // 既知のVite+ラッパー以外は、保存先外へ向いたリンクを実行しない。
    const version = components.node ? `v${components.node}` : runtimePath === process.execPath ? process.version : knownWrapper ? (await command(runtimePath, ['--version'])).trim() : 'unknown';
    result.runtimes.push({ name: 'node', path: runtimePath, resolvedPath: resolved, version: /^v\d[\w.+-]*$/.test(version) ? version : 'unknown', brotli: components.brotli, componentStatus: components.status, isCurrent: knownWrapper ? null : resolved === process.execPath, currentEvidence: knownWrapper ? 'ラッパーの選択先は未確認' : '棚卸し実行中のprocess.execPathとの実体パス比較', manager: /mise/.test(runtimePath) ? 'mise' : /vite-plus/.test(runtimePath) ? 'vite-plus' : /homebrew/.test(runtimePath) ? 'homebrew' : 'other' });
  }
  for (const root of nodeRoots) await collectNodePackages(root);
  const componentCount = result.runtimes.filter(runtime => runtime.componentStatus === 'complete').length;
  coverage('runtime-components', componentCount === result.runtimes.length ? 'complete' : 'partial', componentCount, '既知のNode本体だけから組み込みBrotli版を取得。ラッパーや保存先外リンクは未確認。同梱版は修正のバックポートを表さないため、脆弱性はNode公式リリース版と照合する。', begin);
  const claudePath = path.join(home, '.local/bin/claude');
  const claudeResolved = await fs.realpath(claudePath).catch(() => null);
  if (claudeResolved?.startsWith(path.join(home, '.local/share/claude/versions/')) && /^\d+\.\d+\.\d+$/.test(path.basename(claudeResolved))) result.runtimes.push({ name: 'Claude Code', path: claudePath, resolvedPath: claudeResolved, version: path.basename(claudeResolved), distribution: 'native-binary', evidence: '既知のnativeインストール先のシンボリックリンク。npm版と同一成果物とは仮定しない。' });
  const cargo = await readJson(path.join(home, '.cargo/.crates2.json'));
  for (const key of Object.keys(cargo.data?.installs || {})) {
    const match = key.match(/^([\w-]+) ([\w.+-]+) /);
    if (match) result.globalPackages.push({ ecosystem: 'crates.io', name: match[1], version: match[2], publicRegistry: /\(registry\+https:\/\/github\.com\/rust-lang\/crates\.io-index\)$/.test(key), evidence: '~/.cargo/.crates2.json' });
  }
  const pythonRoot = path.join(home, 'Library/Python');
  const pythonVersions = await listDirectory(pythonRoot);
  for (const version of pythonVersions.entries.filter(entry => entry.isDirectory())) {
    const site = path.join(pythonRoot, version.name, 'lib/python/site-packages');
    const entries = await listDirectory(site);
    for (const entry of entries.entries.filter(item => item.name.endsWith('.dist-info'))) {
      const metadataPath = path.join(site, entry.name, 'METADATA');
      const stat = await fs.stat(metadataPath).catch(() => null);
      const metadata = stat?.size < 2 * 1024 * 1024 ? await fs.readFile(metadataPath, 'utf8').catch(() => '') : '';
      const name = metadata.match(/^Name: ([\w.-]+)$/m)?.[1];
      const pkgVersion = metadata.match(/^Version: ([\w.+-]+)$/m)?.[1];
      if (name && pkgVersion) result.globalPackages.push({ ecosystem: 'PyPI', name, version: pkgVersion, evidence: metadataPath });
    }
  }
  const ghRoot = path.join(home, '.local/share/gh/extensions');
  const ghEntries = await listDirectory(ghRoot);
  for (const entry of ghEntries.entries.filter(item => item.isDirectory())) {
    // 安全なマニフェスト項目だけを保持し、Gitリモートや認証ファイルは調べない。
    const manifest = await readJson(path.join(ghRoot, entry.name, 'manifest.json'));
    result.globalPackages.push({ ecosystem: 'github-cli-extension', name: cleanText(entry.name), version: cleanText(manifest.data?.tag || manifest.data?.version || 'unknown'), evidence: path.join(ghRoot, entry.name) });
  }
  result.globalPackages = [...new Map(result.globalPackages.map(item => [`${item.ecosystem}:${item.name}:${item.version}:${item.evidence}`, item])).values()];
  coverage('global-packages', 'partial', result.globalPackages.length, '既知の保存先を確認した。独自のnpm/pnpm/pip保存先とPython仮想環境は網羅していない。gh拡張は認証・ネットワークへの接触を避けるためローカルメタデータで確認した。', begin);
  result.commands.push({ command: '既知のグローバルnode_modulesのpackage.json、cargoの.crates2.json、ユーザーPythonのdist-info METADATA、ローカルgh拡張マニフェストを読む（許可項目のみ）', status: 'complete', elapsedMs: Date.now() - begin });
}

/**
 * MCP定義を、安全な通信種別と実行ファイル情報へ絞り込む。
 * URL全文、環境変数の値、引数は保存しない。
 * @returns 認証値を含まないサーバー情報。
 * @example
 * projectMcpServer('filesystem', { command: 'node', args: ['secret'] }, '~/.claude.json');
 */
export function projectMcpServer(name, definition, configPath) {
  const executable = typeof definition?.command === 'string' ? path.basename(definition.command.split(/\s/)[0]) : null;
  return { name: cleanText(name), configPath, transport: definition?.url ? 'remote-url-redacted' : executable ? 'stdio' : cleanText(definition?.type || 'unknown'), executable: executable && /^[\w.+-]+$/.test(executable) ? executable : null, configured: true };
}

/**
 * 指定されたMCP部分を棚卸しし、無関係な設定を出力しない。
 * TOMLはサーバー見出しとcommand/typeキーだけを限定的に読む。
 * @example
 * await collectMcp();
 */
async function collectMcp() {
  const begin = Date.now();
  for (const relative of ['.claude.json', '.cursor/mcp.json', '.openclaw/openclaw.json']) {
    const file = path.join(home, relative);
    const { data, status } = await readJson(file);
    if (data) {
      const groups = [data.mcpServers, data.mcp?.servers, data.mcp];
      if (relative === '.claude.json') for (const project of Object.values(data.projects || {})) groups.push(project?.mcpServers);
      for (const group of groups.filter(value => value && typeof value === 'object' && !Array.isArray(value))) {
        for (const [name, definition] of Object.entries(group)) {
          if (definition && typeof definition === 'object' && (definition.command || definition.url || definition.type)) result.mcpServers.push(projectMcpServer(name, definition, file));
        }
      }
    }
    coverage(`mcp:${relative}`, status, result.mcpServers.filter(item => item.configPath === file).length, status === 'unparseable' ? '標準JSONパーサーを使用。JSON5やコメント付きJSONは未対応。' : undefined, begin);
  }
  const codexPath = path.join(home, '.codex/config.toml');
  try {
    const stat = await fs.stat(codexPath);
    if (stat.size > 2 * 1024 * 1024) throw new Error('oversized');
    const text = await fs.readFile(codexPath, 'utf8');
    let current = null;
    for (const line of text.split('\n')) {
      const header = line.match(/^\s*\[mcp_servers\.([^\]]+)\]\s*(?:#.*)?$/);
      if (header) {
        current = projectMcpServer(header[1].replace(/^["']|["']$/g, ''), {}, codexPath);
        result.mcpServers.push(current);
      } else if (/^\s*\[/.test(line)) current = null;
      else if (current) {
        const scalar = line.match(/^\s*(command|url|type)\s*=\s*["']([^"']*)["']/);
        if (scalar?.[1] === 'command') {
          current.executable = projectMcpServer('', { command: scalar[2] }, '').executable;
          current.transport = 'stdio';
        } else if (scalar?.[1] === 'url') current.transport = 'remote-url-redacted';
      }
    }
    coverage('mcp:.codex/config.toml', 'complete', result.mcpServers.filter(item => item.configPath === codexPath).length, '単純なTOMLサーバー見出しとcommand/url項目だけを確認した。', begin);
  } catch (error) { coverage('mcp:.codex/config.toml', error.code === 'ENOENT' ? 'absent' : 'unavailable', 0, '制限内でTOMLメタデータを確認できなかった。', begin); }
  result.mcpServers = [...new Map(result.mcpServers.map(item => [JSON.stringify(item), item])).values()];
  result.commands.push({ command: '~/.claude.json、~/.cursor/mcp.json、~/.openclaw/openclaw.json、~/.codex/config.tomlのMCP定義を読む。サーバー名・通信種別・実行ファイル名のみ保存', status: 'complete', elapsedMs: Date.now() - begin });
}

/**
 * コマンド引数を取得せず、自動起動設定・プロセス名・TCP接続先を収集する。
 * ログイン項目には非対話的なsystem_profilerを使い、自動操作権限の要求を避ける。
 * @example
 * await collectPersistenceAndNetwork();
 */
async function collectPersistenceAndNetwork() {
  const begin = Date.now();
  let incomplete = false;
  for (const directory of [path.join(home, 'Library/LaunchAgents'), '/Library/LaunchAgents', '/Library/LaunchDaemons']) {
    const listing = await listDirectory(directory);
    if (!['complete', 'absent'].includes(listing.status)) incomplete = true;
    for (const entry of listing.entries.filter(item => item.name.endsWith('.plist'))) {
      const file = path.join(directory, entry.name);
      const data = await plist(file);
      const stat = await fs.stat(file).catch(() => null);
      const program = data.Program || data.ProgramArguments?.[0];
      const launch = { path: file, label: cleanText(data.Label), program: typeof program === 'string' && !/\s--|https?:|token|password/i.test(program) ? cleanText(program, 1000) : null, runAtLoad: data.RunAtLoad === true, keepAlive: typeof data.KeepAlive === 'boolean' ? data.KeepAlive : Boolean(data.KeepAlive), modifiedAt: stat?.mtime.toISOString() || null };
      const argumentsList = Array.isArray(data.ProgramArguments) ? data.ProgramArguments : [];
      launch.runtimePaths = projectLaunchRuntimes(argumentsList);
      // 既知のOpenClawラッパーだけを読み、固定Nodeパス以外は破棄する。
      const wrapperRoot = path.join(home, '.openclaw/service-env/');
      for (const argument of argumentsList.filter(value => typeof value === 'string' && value.startsWith(wrapperRoot) && value.endsWith('.sh'))) {
        const wrapper = await fs.lstat(argument).catch(() => null);
        if (!wrapper?.isFile() || wrapper.isSymbolicLink() || wrapper.size > 100_000 || await fs.realpath(argument).catch(() => null) !== argument) continue;
        const content = await fs.readFile(argument, 'utf8').catch(() => '');
        launch.runtimePaths.push(...projectLaunchRuntimes([content]));
      }
      launch.runtimePaths = [...new Set(launch.runtimePaths)];
      result.launchItems.push(launch);
    }
  }
  coverage('launch-items', incomplete ? 'partial' : 'complete', result.launchItems.length, undefined, begin);
  const [loginRaw, processRaw, listening, connected] = await Promise.all([
    command('/usr/sbin/system_profiler', ['SPLoginItemDataType', '-json'], undefined, 25_000),
    command('/bin/ps', ['-axo', 'pid=,comm=']),
    command('/usr/sbin/lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-FpcnT']),
    command('/usr/sbin/lsof', ['-nP', '-iTCP', '-sTCP:ESTABLISHED', '-FpcnT']),
  ]);
  try {
    const data = JSON.parse(loginRaw);
    for (const item of data.SPLoginItemDataType || []) result.loginItems.push({ name: cleanText(item._name), path: cleanText(item.path || item.login_item_path), hidden: item.hidden === 'yes' });
    coverage('login-items', 'partial', result.loginItems.length, 'SPLoginItemDataTypeを確認。空の応答を未登録とは断定できない。System Settings > General > Login Items & Extensionsでバックグラウンド項目も確認する。', begin);
  } catch { coverage('login-items', 'unavailable', 0, 'system_profilerでログイン項目を取得できなかった。System Settings > General > Login Items & Extensionsでの確認が必要。', begin); }
  for (const line of processRaw.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (match) result.processes.push({ pid: Number(match[1]), name: cleanText(path.basename(match[2])) });
  }
  result.network = { listening: parseLsof(listening), established: parseLsof(connected) };
  coverage('processes', processRaw ? 'complete' : 'unavailable', result.processes.length, '実行ファイル名だけを取得。プロセス引数は収集しない。', begin);
  coverage('network', 'partial', result.network.listening.length + result.network.established.length, '現在のユーザーが見えるTCPソケットだけを確認。UDP、終了済みプロセス、管理者権限が必要な通信、過去の通信は未確認。sudo が要る領域は未確認。', begin);
}

/**
 * lsofのフィールド出力を、プロセス名と数値TCPエンドポイントへ変換する。
 * @returns ユーザー名、引数、ファイル本文を含まないソケット情報。
 * @example
 * parseLsof('p12\ncnode\nn127.0.0.1:3000\nTST=LISTEN\n');
 */
export function parseLsof(raw) {
  const rows = [];
  let pid = null, name = null, socket = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('p')) { pid = Number(line.slice(1)); name = null; socket = null; }
    else if (line.startsWith('c')) name = cleanText(line.slice(1));
    else if (line.startsWith('n')) { socket = { pid, process: name, endpoint: cleanText(line.slice(1), 500), state: null }; rows.push(socket); }
    else if (line.startsWith('TST=') && socket) socket.state = cleanText(line.slice(4));
  }
  return rows;
}

/**
 * lsofのcwd/txtから許可した実体パスだけを残す。{@link collectExecutionContexts} が引数・環境変数を保存しないために呼ぶ。
 * @returns プロジェクトのcwdと既知のNode実体。未知の文字列・他フィールドは破棄する。
 */
export function projectProcessFiles(raw, userHome = home, configuredRoots) {
  const projectRoots = [...normalizeScanRoots(configuredRoots, userHome).map(root => root.path), path.join(userHome, '.openclaw')];
  const runtimeRoots = [path.join(userHome, '.vite-plus/js_runtime/node/'), path.join(userHome, '.local/share/mise/installs/node/'), '/opt/homebrew/Cellar/node/'];
  let descriptor = '', cwd = null, runtimePath = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('f')) descriptor = line.slice(1);
    if (!line.startsWith('n')) continue;
    const value = line.slice(1);
    // 認証値らしい表記・制御文字・親参照があるパスを保存しない。
    if (cleanText(value, 4000) !== value || path.normalize(value) !== value) continue;
    if (descriptor === 'cwd' && projectRoots.some(root => value === root || value.startsWith(`${root}/`))) cwd = value;
    if (descriptor === 'txt' && runtimeRoots.some(root => value.startsWith(root)) && value.endsWith('/bin/node')) runtimePath = value;
  }
  return { cwd, runtimePath, purpose: cwd && (cwd === path.join(userHome, '.openclaw') || cwd.startsWith(path.join(userHome, '.openclaw/'))) ? 'OpenClaw' : 'プロジェクト（依存自体の実行は未確認）' };
}

/**
 * 起動設定の引数から既知のNode実体パスだけを抽出する。永続化棚卸しが設定と稼働実体を区別するために呼ぶ。
 * @returns 引数本文・環境変数・未知のパスを含まない固定パスの配列。
 */
export function projectLaunchRuntimes(argumentsList, userHome = home) {
  const candidates = [];
  if (!Array.isArray(argumentsList)) return candidates;
  for (const value of argumentsList) {
    if (typeof value !== 'string') continue;
    for (const match of value.matchAll(/(?:^|[\s"'])(\/[^\s"';|&<>]+\/bin\/node)(?=$|[\s"';|&<>])/g)) {
      const projected = projectProcessFiles(`ftxt\nn${match[1]}`, userHome);
      if (projected.runtimePath) candidates.push(projected.runtimePath);
    }
  }
  return [...new Set(candidates)];
}

/**
 * 既に棚卸ししたNode待受PIDの実体を最大12件確認する。{@link inventory} が他の収集完了後に呼ぶ。
 * @returns 引数・環境変数を含まない稼働観測を棚卸しへ追加する。
 */
async function collectExecutionContexts() {
  const begin = Date.now();
  const pids = [...new Set((result.network.listening || []).filter(socket => socket.process === 'node').map(socket => socket.pid))];
  let incomplete = pids.length > 12;
  for (const pid of pids.slice(0, 12)) {
    if (!Number.isSafeInteger(pid) || pid <= 0 || Date.now() - begin > 30_000) { incomplete = true; continue; }
    const raw = await command('/usr/sbin/lsof', ['-a', '-p', String(pid), '-d', 'cwd,txt', '-Fn'], `lsof -a -p ${pid} -d cwd,txt -Fn（許可した実体パスのみ保存）`, 3000);
    const context = projectProcessFiles(raw, home, result.projectRoots);
    if (!raw || !context.cwd && !context.runtimePath) incomplete = true;
    if (context.cwd || context.runtimePath) {
      result.executionContexts.push({ pid, ...context, observedAt: new Date().toISOString() });
      for (const runtime of result.runtimes.filter(runtime => runtime.resolvedPath === context.runtimePath)) {
        runtime.usageEvidence = [...(runtime.usageEvidence || []), { pid, purpose: context.purpose }];
      }
    }
  }
  coverage('execution-contexts', incomplete ? 'partial' : 'complete', result.executionContexts.length, '現在のNode待受PIDだけ。cwdはプロジェクトの稼働観測で、特定依存のロードやデプロイ版の証拠ではない。', begin);
}

/**
 * 鍵データを保持・保存せず、authorized_keysの行数だけを数える。
 * @returns 物理行数と状態。他のSSH鍵ファイルは開かない。
 * @example
 * await countLines('/tmp/authorized_keys');
 */
async function countLines(file) {
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.size > 8 * 1024 * 1024) return { status: 'skipped-nonregular-or-oversized', lineCount: null };
    let count = 0, length = 0, last = null;
    for await (const chunk of createReadStream(file)) {
      for (const byte of chunk) if (byte === 10) count++;
      length += chunk.length;
      last = chunk.at(-1);
    }
    return { status: 'complete', lineCount: count + (length && last !== 10 ? 1 : 0) };
  } catch (error) { return { status: error.code === 'ENOENT' ? 'absent' : 'permission-denied', lineCount: null }; }
}

/**
 * 秘密鍵を読まず、SSHの権限とローカルコンテナイメージを確認する。
 * Dockerは検出したローカルUnixソケットに固定し、リモートコンテキストへ接続しない。
 * @example
 * await collectSshAndContainers();
 */
async function collectSshAndContainers() {
  const begin = Date.now();
  const directory = path.join(home, '.ssh');
  const listing = await listDirectory(directory);
  result.ssh = { path: directory, files: [], authorizedKeys: await countLines(path.join(directory, 'authorized_keys')) };
  for (const entry of listing.entries) {
    const file = path.join(directory, entry.name);
    const stat = await fs.lstat(file).catch(() => null);
    if (stat) result.ssh.files.push({ name: cleanText(entry.name), mode: (stat.mode & 0o777).toString(8).padStart(3, '0'), type: stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : 'file', size: stat.size, modifiedAt: stat.mtime.toISOString() });
  }
  coverage('ssh', listing.status, result.ssh.files.length, 'ファイル名・権限・日時とauthorized_keys行数のみ。鍵や設定の本文は取得しない。', begin);
  let socket = null;
  for (const candidate of [path.join(home, '.orbstack/run/docker.sock'), path.join(home, '.docker/run/docker.sock'), '/var/run/docker.sock']) {
    const stat = await fs.stat(candidate).catch(() => null);
    if (stat?.isSocket()) { socket = candidate; break; }
  }
  if (socket) {
    const docker = await command('/usr/local/bin/docker', ['--host', `unix://${socket}`, 'image', 'ls', '--no-trunc', '--format', '{{json .}}'], `docker --host unix://${socket} image ls --no-trunc --format '{{json .}}'`);
    for (const line of docker.split('\n').filter(Boolean)) {
      try { const item = JSON.parse(line); result.containers.push({ repository: cleanText(item.Repository), tag: cleanText(item.Tag), id: cleanText(item.ID), createdAt: cleanText(item.CreatedAt), size: cleanText(item.Size), endpoint: socket }); } catch { /* 不正なレコードを除外し、出力がない場合は確認範囲へ反映する。 */ }
    }
    coverage('container-images', docker ? 'complete' : 'unavailable', result.containers.length, docker ? undefined : 'ローカルソケットは存在するが、docker CLIから読めるイメージ情報を取得できなかった。', begin);
  } else coverage('container-images', 'unavailable', 0, 'アクセスできるローカルDocker/OrbStackソケットがない。リモートコンテキストには接続していない。', begin);
}

/**
 * 依存パッケージ配下を除外し、明示的な上限内でロックファイルを探索する。
 * {@link inventory}から呼ぶ。後続のOSV照会へ渡せるのはパッケージ名と版だけ。
 * @example
 * await collectLockfiles();
 */
async function collectLockfiles() {
  const begin = Date.now();
  const names = new Set(['pnpm-lock.yaml', 'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'Cargo.lock', 'go.sum', 'poetry.lock', 'Pipfile.lock', 'uv.lock', 'requirements.txt', 'composer.lock', 'Gemfile.lock']);
  const skip = new Set(['node_modules', '.git', 'vendor', '.next', 'dist', 'build', '.cache', '.venv', 'venv', 'target', 'DerivedData', '.turbo', 'Pods']);
  let directories = 0, inaccessible = 0, depthSkipped = 0, incomplete = false;
  const limit = Math.min(deadline, begin + 90_000);
  const queue = result.projectRoots.map(root => ({ directory: root.path, scope: root.scope, depth: 0 }));
  while (queue.length && Date.now() < limit && directories < 50_000 && result.lockfiles.length < 5000) {
    const { directory, scope, depth } = queue.shift();
    const listing = await listDirectory(directory);
    directories++;
    if (!['complete', 'absent'].includes(listing.status)) inaccessible++;
    for (const entry of listing.entries) {
      const file = path.join(directory, entry.name);
      if (entry.isFile() && entry.name === 'package.json' && result.packageRoots.length < 5000) result.packageRoots.push(directory);
      if (entry.isFile() && names.has(entry.name)) {
        const stat = await fs.stat(file).catch(() => null);
        result.lockfiles.push({ path: file, scope, format: entry.name, size: stat?.size ?? null, modifiedAt: stat?.mtime.toISOString() || null });
      } else if (entry.isDirectory() && !skip.has(entry.name)) {
        if (depth < 12) queue.push({ directory: file, scope, depth: depth + 1 });
        else { incomplete = true; depthSkipped++; }
      }
    }
  }
  incomplete ||= queue.length > 0 || inaccessible > 0;
  coverage('lockfiles', incomplete ? 'partial' : 'complete', result.lockfiles.length, `探索${directories}ディレクトリ、アクセス不可${inaccessible}、深さ上限による除外${depthSkipped}、停止時未処理${queue.length}。深さ12・5万ディレクトリ・5000ファイル・90秒が上限。シンボリックリンクと依存/build配下は除外。`, begin);
  result.commands.push({ command: 'ローカルstateのscanRoots（未設定時は既定のプロジェクト領域）を上限付きで読み取り専用探索。依存パッケージ本文や.envは開かない', status: incomplete ? 'partial' : 'complete', elapsedMs: Date.now() - begin });
}

/**
 * ホストを変更せず、スキルCLI用に上限付きの棚卸しを作成する。
 * 各収集処理を独立させ、一箇所のアクセス拒否でレポート全体が欠落するのを防ぐ。
 * @returns 認証値を含まない棚卸しJSONと、明示した確認範囲の制約。
 * @example
 * const data = await inventory();
 */
export async function inventory() {
  const state = await readJson(path.join(home, '.local/state/mac-security-sweep/state.json'), 32 * 1024 * 1024);
  result.projectRoots = normalizeScanRoots(state.data?.scanRoots, home);
  const validConfiguration = state.data?.scanRoots === undefined || Array.isArray(state.data.scanRoots) && state.data.scanRoots.length === result.projectRoots.length;
  coverage('scan-roots', result.projectRoots.length && validConfiguration && ['complete', 'absent'].includes(state.status) ? 'complete' : 'partial', result.projectRoots.length,
    'ローカルstateのパスとpersonal/work区分のみ使用。未設定時は~/Projects・~/repository・~/work。無効・上限超過のルートは未確認。');
  const collectors = [collectApplications, collectEditorExtensions, collectBrowserExtensions, collectPackages, collectMcp, collectPersistenceAndNetwork, collectSshAndContainers, collectLockfiles];
  const settled = await Promise.allSettled(collectors.map(collect => collect()));
  await collectExecutionContexts();
  for (let index = 0; index < settled.length; index++) {
    if (settled[index].status === 'rejected') coverage(collectors[index].name, 'failed', 0, '収集処理に失敗した。設定値の漏えいを避けるため生のエラーは保存していない。');
  }
  result.elapsedMs = Date.now() - started;
  result.readOnly = true;
  result.outboundRequests = 0;
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write('使い方: node inventory.mjs > inventory.json\nMacの設定を変更せず、秘密値を除外した棚卸しJSONを標準出力へ出します。\n--help / -h は説明だけを表示し、棚卸しを実行しません。\n');
  } else inventory().then(data => process.stdout.write(`${JSON.stringify(data, null, 2)}\n`)).catch(() => {
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, error: 'inventory-failed', coverage: result.coverage })}\n`);
    process.exitCode = 1;
  });
}
