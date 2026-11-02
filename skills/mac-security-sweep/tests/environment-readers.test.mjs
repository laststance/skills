import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRunContext } from '../scripts/runtime.mjs';
import { SweepError } from '../scripts/diagnostics.mjs';
import { collectApplications, collectBrowserExtensions, collectEditorExtensions, collectRuntimes, collectMcpAndCloud, collectPersistence, collectProtection, collectContainersAndSsh, projectSbom, parseJsonc } from '../scripts/environment-readers.mjs';
import { inventory } from '../scripts/inventory.mjs';
import { allowGlobalPackage } from '../scripts/scan-packages.mjs';

const SECRET = 'SYNTHETIC_SECRET_CANARY_NEVER_RETAIN';
const CHROME_ID = 'a'.repeat(32);

/** 架空home・OS・command providerを作る。実Macの設定や通信を使わない。 @example const fixture = await environmentFixture(); */
async function environmentFixture(overrides = {}) {
  const home = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'sweep-environment-')));
  const denied = new Set(), commands = [], readPaths = [];
  const filesystem = { ...fs, lstat: async file => { if ([...denied].some(root => file === root || file.startsWith(`${root}/`))) throw Object.assign(new Error(SECRET), { code: 'EACCES' }); return fs.lstat(file); }, open: async (...args) => { readPaths.push(args[0]); return fs.open(...args); } };
  const context = createRunContext({ home, budgetMs: 120000, platform: 'darwin', arch: 'arm64', filesystem,
    config: { scanRoots: [{ path: path.join(home, 'Projects'), scope: 'personal' }], applicationRoots: [], browserProfiles: [], editorRoots: [], runtimeRoots: [], homebrewPrefixes: [], sbomFiles: [] },
    toolResolver: async operation => ({ path: operation }),
    executeImpl: async (operation, args, options) => {
      commands.push({ operation, args });
      if (overrides.execute) return overrides.execute(operation, args, options);
      if (operation === 'plutil') return { code: 0, stdout: options.input.toString(), stderr: '' };
      if (operation === 'brew') return { code: 0, stdout: '{"formulae":[],"casks":[]}', stderr: '' };
      if (operation === 'codesign') return { code: 0, stdout: '', stderr: 'Identifier=com.example.app\nTeamIdentifier=ABCDEFGHIJ\nNotarization Ticket=stapled\n' };
      return { code: 0, stdout: '', stderr: '' };
    },
  });
  context.systemRoot = path.join(home, 'fake-system');
  const result = { host: {}, homebrew: { formulae: [], casks: [] }, applications: [], browserExtensions: [], extensions: [], runtimes: [], globalPackages: [], mcpServers: [], cloudConfigurations: [], launchItems: [], loginItems: [], processes: [], executionContexts: [], containers: [], sboms: [], sbomPackages: [], protection: { xprotect: [] }, projectRoots: [{ path: path.join(home, 'Projects'), scope: 'personal' }], projectDirectories: [path.join(home, 'Projects/example')], coverage: [], commands: [], diagnostics: [] };
  async function write(relative, data) { const file = path.join(home, relative); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data)); return file; }
  async function close() { await context.close(); await fs.rm(home, { recursive: true, force: true }); }
  return { home, context, result, write, close, denied, commands, readPaths };
}

test('Chromium四製品はmanifestと有効状態だけを射影し認証設定を残さない', async () => {
  // Arrange
  const fixture = await environmentFixture();
  try {
    const roots = ['Google/Chrome', 'Google/Chrome Canary', 'Microsoft Edge', 'BraveSoftware/Brave-Browser'];
    for (const root of roots) {
      await fixture.write(`Library/Application Support/${root}/Default/Extensions/${CHROME_ID}/1/manifest.json`, { name: 'Fixture', version: '1.2.3', key: SECRET });
      await fixture.write(`Library/Application Support/${root}/Default/Preferences`, { extensions: { settings: { [CHROME_ID]: { state: 1, manifest: { version: '1.2.3' }, secret: SECRET } } }, auth: SECRET });
    }
    // Act
    await collectBrowserExtensions(fixture.context, fixture.result);
    // Assert
    assert.deepEqual(fixture.result.browserExtensions.map(item => [item.browser, item.version, item.active]), [['chrome', '1.2.3', true], ['chrome-canary', '1.2.3', true], ['edge', '1.2.3', true], ['brave', '1.2.3', true]]);
    assert.equal(JSON.stringify(fixture.result).includes(SECRET), false);
    assert.equal(fixture.readPaths.some(file => /Cookies|Login Data/.test(file)), false);
  } finally { await fixture.close(); }
});

test('Chromiumの有効状態は選択版だけに結び付き旧版残骸や版不明を有効と断定しない', async () => {
  // Arrange
  const fixture = await environmentFixture();
  try {
    const root = 'Library/Application Support/Google/Chrome/Default', unknownId = 'b'.repeat(32);
    for (const version of ['1.0.0', '2.0.0']) await fixture.write(`${root}/Extensions/${CHROME_ID}/${version}_0/manifest.json`, { name: 'Fixture', version });
    await fixture.write(`${root}/Extensions/${unknownId}/1.0.0_0/manifest.json`, { name: 'Unknown', version: '1.0.0' });
    await fixture.write(`${root}/Preferences`, { extensions: { settings: { [CHROME_ID]: { state: 1, path: `${CHROME_ID}/2.0.0_0` }, [unknownId]: { state: 1 } } } });
    // Act
    await collectBrowserExtensions(fixture.context, fixture.result);
    // Assert
    const known = fixture.result.browserExtensions.filter(item => item.id === CHROME_ID).sort((a, b) => a.version.localeCompare(b.version));
    assert.deepEqual(known.map(item => [item.version, item.active]), [['1.0.0', false], ['2.0.0', true]]);
    assert.equal(fixture.result.browserExtensions.find(item => item.id === unknownId).active, null);
  } finally { await fixture.close(); }
});

test('Firefoxは無効化情報を保持しSafariはappexから存在だけを確認する', async () => {
  // Arrange
  const fixture = await environmentFixture();
  try {
    await fixture.write('Library/Application Support/Firefox/profiles.ini', '[Profile0]\nName=default\nIsRelative=1\nPath=Profiles/one\n');
    await fixture.write('Library/Application Support/Firefox/Profiles/one/extensions.json', { addons: [{ id: 'fixture@example.test', version: '2.0.0', userDisabled: true, active: true, token: SECRET }] });
    const app = path.join(fixture.home, 'Applications/Fixture.app'); fixture.result.applications.push({ path: app });
    await fixture.write('Applications/Fixture.app/Contents/PlugIns/Extension.appex/Contents/Info.plist', { CFBundleIdentifier: 'org.example.extension', CFBundleVersion: '3.0.0', NSExtension: { NSExtensionPointIdentifier: 'com.apple.Safari.web-extension' }, secret: SECRET });
    // Act
    await collectBrowserExtensions(fixture.context, fixture.result);
    // Assert
    assert.deepEqual(fixture.result.browserExtensions.map(item => [item.browser, item.version, item.active]), [['firefox', '2.0.0', false], ['safari', '3.0.0', null]]);
    assert.equal(JSON.stringify(fixture.result).includes(SECRET), false);
  } finally { await fixture.close(); }
});

test('ブラウザの不在・不正metadata・権限拒否はそれぞれ保持される', async () => {
  // Arrange
  const fixture = await environmentFixture();
  try {
    for (const root of ['Google/Chrome', 'Google/Chrome Canary', 'Microsoft Edge', 'BraveSoftware/Brave-Browser']) await fixture.write(`Library/Application Support/${root}/Default/Extensions/${CHROME_ID}/1/manifest.json`, '{invalid');
    await fixture.write('Library/Application Support/Firefox/profiles.ini', 'not a profile');
    const app = path.join(fixture.home, 'Applications/Fixture.app'); fixture.result.applications.push({ path: app });
    await fixture.write('Applications/Fixture.app/Contents/PlugIns/Extension.appex/Contents/Info.plist', '{bad');
    // Act
    await collectBrowserExtensions(fixture.context, fixture.result);
    // Assert
    assert.deepEqual(['chrome', 'chrome-canary', 'edge', 'brave', 'firefox', 'safari'].map(name => fixture.result.coverage.find(item => item.area === `${name}-extensions`).status), ['partial', 'partial', 'partial', 'partial', 'partial', 'partial']);
    fixture.result.coverage.length = 0;
    for (const root of ['Google/Chrome', 'Google/Chrome Canary', 'Microsoft Edge', 'BraveSoftware/Brave-Browser', 'Firefox']) fixture.denied.add(path.join(fixture.home, 'Library/Application Support', root));
    fixture.denied.add(app);
    await collectBrowserExtensions(fixture.context, fixture.result);
    assert.equal(fixture.result.coverage.every(item => item.status === 'partial'), true);
    assert.equal(JSON.stringify(fixture.result).includes(SECRET), false);
  } finally { await fixture.close(); }
});

test('VSCode・Cursor・Insiders・Portable/customは登録版と残存版を分ける', async () => {
  // Arrange
  const fixture = await environmentFixture();
  try {
    fixture.context.config.editorRoots = [{ editor: 'portable', root: path.join(fixture.home, 'Portable/extensions') }];
    for (const root of ['.vscode/extensions', '.cursor/extensions', '.vscode-insiders/extensions', 'Portable/extensions']) {
      await fixture.write(`${root}/fixture.one-1.0.0/package.json`, { publisher: 'fixture', name: 'one', version: '1.0.0', scripts: { postinstall: SECRET } });
      await fixture.write(`${root}/fixture.one-0.9.0/package.json`, { publisher: 'fixture', name: 'one', version: '0.9.0' });
      await fixture.write(`${root}/extensions.json`, [{ identifier: { id: 'fixture.one' }, version: '1.0.0', metadata: { source: 'gallery', secret: SECRET } }]);
    }
    // Act
    await collectEditorExtensions(fixture.context, fixture.result);
    // Assert
    assert.deepEqual(fixture.result.extensions.filter(item => item.version === '1.0.0').map(item => [item.editor, item.registered, item.source]), [['vscode', true, 'gallery'], ['cursor', true, 'gallery'], ['vscode-insiders', true, 'gallery'], ['portable', true, 'gallery']]);
    assert.deepEqual(fixture.result.extensions.filter(item => item.version === '0.9.0').map(item => item.registered), [false, false, false, false]);
    assert.equal(fixture.result.extensions.every(item => item.active === null && item.enablementEvidence === 'profile-enablement-unconfirmed'), true);
    assert.equal(JSON.stringify(fixture.result).includes(SECRET), false);
    assert.equal(fixture.commands.length, 0);
  } finally { await fixture.close(); }
});

test('エディタ拡張のmanifest不正と拒否は不在へ置き換わらない', async () => {
  // Arrange
  const fixture = await environmentFixture();
  try {
    for (const root of ['.vscode/extensions', '.cursor/extensions', '.vscode-insiders/extensions']) await fixture.write(`${root}/fixture/package.json`, '{bad');
    // Act
    await collectEditorExtensions(fixture.context, fixture.result);
    // Assert
    assert.deepEqual(fixture.result.coverage.map(item => item.status), ['partial', 'partial', 'partial']);
    fixture.result.coverage.length = 0;
    for (const root of ['.vscode', '.cursor', '.vscode-insiders']) fixture.denied.add(path.join(fixture.home, root));
    await collectEditorExtensions(fixture.context, fixture.result);
    assert.equal(fixture.result.coverage.every(item => item.causes.includes('denied')), true);
    assert.equal(JSON.stringify(fixture.result).includes(SECRET), false);
  } finally { await fixture.close(); }
});

test('アプリ同梱版・署名表示・チケット存在とHomebrew revisionを独立に保持する', async () => {
  // Arrange
  const fixture = await environmentFixture({ execute: async (operation, args, options) => {
    if (operation === 'plutil') return { code: 0, stdout: options.input.toString(), stderr: '' };
    if (operation === 'brew') return { code: 0, stdout: JSON.stringify({ formulae: [{ name: 'openssl@3', tap: 'homebrew/core', installed: [{ version: '3.0.0_2', patches: [{ resolves: ['CVE-2026-12345'], token: SECRET }] }] }], casks: [] }), stderr: '' };
    if (operation === 'codesign') return { code: 0, stdout: '', stderr: `Identifier=org.example.fixture\nTeamIdentifier=ABCDEFGHIJ\nNotarization Ticket=stapled\nsecret=${SECRET}` };
    return { code: 0, stdout: args[0] === '-productVersion' ? '13.0.0' : '22A123', stderr: '' };
  } });
  try {
    await fixture.write('Applications/Fixture.app/Contents/Info.plist', { CFBundleIdentifier: 'org.example.fixture', CFBundleName: 'Fixture', CFBundleShortVersionString: '1.2.3', secret: SECRET });
    await fixture.write('Applications/Fixture.app/Contents/Frameworks/Electron Framework.framework/Resources/Info.plist', { CFBundleShortVersionString: '25.0.0' });
    await fixture.write('Applications/Fixture.app/Contents/Resources/versions.json', { node: '20.0.0', chromium: '120.0.0', token: SECRET });
    // Act
    await collectApplications(fixture.context, fixture.result);
    // Assert
    assert.deepEqual(fixture.result.applications[0].components.map(item => [item.name, item.version]), [['electron', '25.0.0'], ['node', '20.0.0'], ['chromium', '120.0.0']]);
    assert.deepEqual(fixture.result.applications[0].notarization, { status: 'ticket-present', validity: 'unknown' });
    assert.equal(fixture.result.homebrew.formulae[0].installed[0].revision, 2);
    assert.equal(fixture.result.homebrew.formulae[0].installed[0].patches[0].applied, true);
    assert.equal(JSON.stringify(fixture.result).includes(SECRET), false);
    assert.equal(fixture.commands.some(item => item.args.includes('--assess')), false);
  } finally { await fixture.close(); }
});

test('Node全managerはheaderの版とglobal manifestを読みバイナリを実行しない', async () => {
  // Arrange
  const fixture = await environmentFixture();
  try {
    const roots = ['.nvm/versions/node/22.0.0', '.local/share/fnm/node-versions/v22.0.0/installation', '.volta/tools/image/node/22.0.0', '.asdf/installs/nodejs/22.0.0', '.local/share/mise/installs/node/22.0.0', '.vite-plus/js_runtime/node/22.0.0', 'fake-system/opt/homebrew/Cellar/node/22.0.0'];
    for (const root of roots) {
      await fixture.write(`${root}/bin/node`, SECRET);
      await fixture.write(`${root}/include/node/node_version.h`, '#define NODE_MAJOR_VERSION 22\n#define NODE_MINOR_VERSION 0\n#define NODE_PATCH_VERSION 0\n');
      await fixture.write(`${root}/lib/node_modules/fixture/package.json`, { name: 'fixture', version: '1.2.3', private: true, env: SECRET });
    }
    // Act
    await collectRuntimes(fixture.context, fixture.result);
    // Assert
    assert.deepEqual(fixture.result.runtimes.filter(item => item.manager !== 'audit-process').map(item => [item.manager, item.version]), [['nvm', '22.0.0'], ['fnm', '22.0.0'], ['volta', '22.0.0'], ['asdf', '22.0.0'], ['mise', '22.0.0'], ['vite-plus', '22.0.0'], ['homebrew', '22.0.0']]);
    assert.equal(fixture.result.globalPackages.length, 7);
    assert.equal(fixture.result.globalPackages.every(item => item.explicitPrivate), true);
    assert.equal(fixture.commands.length, 0);
    assert.equal(fixture.readPaths.some(file => file.endsWith('/bin/node')), false);
    assert.equal(JSON.stringify(fixture.result).includes(SECRET), false);
  } finally { await fixture.close(); }
});

test('uv・pipx・conda・project venvとJava/Rubyは静的版とpackageだけを収集する', async () => {
  // Arrange
  const fixture = await environmentFixture();
  try {
    const roots = ['.local/share/uv/tools/example', '.local/share/pipx/venvs/example', '.conda/envs/example', 'Projects/example/.venv'];
    for (const root of roots) {
      await fixture.write(`${root}/pyvenv.cfg`, `version = 3.12.1\nsecret = ${SECRET}\n`);
      await fixture.write(`${root}/lib/python3.12/site-packages/fixture-1.0.0.dist-info/METADATA`, `Name: fixture\nVersion: 1.0.0\nSecret: ${SECRET}\n`);
    }
    await fixture.write('Library/Java/JavaVirtualMachines/fixture.jdk/Contents/Home/release', `JAVA_VERSION="21.0.1"\nSECRET="${SECRET}"\n`);
    for (const root of ['.rbenv/versions/3.3.0', '.rvm/rubies/ruby-3.3.0', '.rubies/ruby-3.3.0', '.asdf/installs/ruby/3.3.0', '.local/share/mise/installs/ruby/3.3.0']) {
      await fixture.write(`${root}/bin/ruby`, SECRET);
      await fixture.write(`${root}/include/ruby-3.3.0/ruby/version.h`, '#define RUBY_API_VERSION_MAJOR 3\n#define RUBY_API_VERSION_MINOR 3\n#define RUBY_API_VERSION_TEENY 0\n');
      await fixture.write(`${root}/lib/ruby/3.3.0/arm64-darwin23/rbconfig.rb`, `module RbConfig\n  CONFIG["MAJOR"] = "3"\n  CONFIG["MINOR"] = "3"\n  CONFIG["TEENY"] = "6"\n  raise "${SECRET}"\nend\n`);
      await fixture.write(`${root}/lib/ruby/gems/3.3.0/specifications/fixture.gemspec`, `s.name = "fixture"\ns.version = "1.0.0"\nraise "${SECRET}"\n`);
    }
    // Act
    await collectRuntimes(fixture.context, fixture.result);
    // Assert
    assert.deepEqual(fixture.result.runtimes.filter(item => item.name === 'python').map(item => [item.manager, item.version]), [['uv', '3.12.1'], ['pipx', '3.12.1'], ['conda', '3.12.1'], ['project-venv', '3.12.1']]);
    assert.equal(fixture.result.runtimes.find(item => item.name === 'java').version, '21.0.1');
    assert.deepEqual(fixture.result.runtimes.filter(item => item.name === 'ruby').map(item => item.manager), ['rbenv', 'rvm', 'chruby', 'asdf-ruby', 'mise-ruby']);
    assert.deepEqual(fixture.result.runtimes.filter(item => item.name === 'ruby').map(item => item.version), ['3.3.6', '3.3.6', '3.3.6', '3.3.6', '3.3.6']);
    assert.equal(fixture.result.globalPackages.filter(item => item.ecosystem === 'PyPI').length, 4);
    assert.equal(fixture.result.globalPackages.filter(item => item.ecosystem === 'RubyGems').length, 5);
    assert.equal(fixture.commands.length, 0);
    assert.equal(JSON.stringify(fixture.result).includes(SECRET), false);
  } finally { await fixture.close(); }
});

test('Volta公式package imageの通常名とscoped名をコード実行なしで発見する', async () => {
  // Arrange
  const fixture = await environmentFixture();
  try {
    for (const name of ['fixture', '@scope/fixture']) await fixture.write(`.volta/tools/image/packages/${name}/lib/node_modules/${name}/package.json`, { name, version: '1.2.3', _resolved: 'https://registry.npmjs.org/fixture/-/fixture-1.2.3.tgz', scripts: { install: SECRET } });
    await fixture.write('.volta/tools/image/packages/pnpm-fixture/5/node_modules/pnpm-fixture/package.json', { name: 'pnpm-fixture', version: '1.2.3', _resolved: 'https://registry.npmjs.org/pnpm-fixture/-/pnpm-fixture-1.2.3.tgz' });
    // Act
    await collectRuntimes(fixture.context, fixture.result);
    // Assert
    assert.deepEqual(fixture.result.globalPackages.map(item => [item.name, item.version, item.publicRegistry]).sort(), [['@scope/fixture', '1.2.3', true], ['fixture', '1.2.3', true], ['pnpm-fixture', '1.2.3', true]]);
    assert.equal(fixture.commands.length, 0);
    assert.equal(JSON.stringify(fixture.result).includes(SECRET), false);
  } finally { await fixture.close(); }
});

test('global packageのリンクを追わず未確認として残し0件completeへ変換しない', async () => {
  // Arrange
  const fixture = await environmentFixture();
  try {
    const target = await fixture.write('Projects/private/package.json', { name: 'fixture-private', version: '1.0.0', secret: SECRET });
    const root = path.join(fixture.home, '.npm-global/lib/node_modules');
    await fs.mkdir(root, { recursive: true });
    await fs.symlink(path.dirname(target), path.join(root, 'fixture-private'));
    // Act
    await collectRuntimes(fixture.context, fixture.result);
    // Assert
    assert.equal(fixture.result.globalPackages.length, 0);
    assert.equal(fixture.result.coverage.some(item => item.area === 'global-npm' && item.status === 'partial'), true);
    assert.equal(fixture.readPaths.includes(target), false);
    assert.equal(JSON.stringify(fixture.result).includes(SECRET), false);
  } finally { await fixture.close(); }
});

test('Python由来metadataの不正や拒否とnpmの明示local/Git由来をglobal例外へ流さない', async () => {
  // Arrange
  const fixture = await environmentFixture();
  try {
    const site = '.local/share/uv/tools/fixture/lib/python3.12/site-packages';
    await fixture.write('.local/share/uv/tools/fixture/pyvenv.cfg', 'version = 3.12.1\n');
    for (const name of ['absent', 'malformed', 'denied']) await fixture.write(`${site}/${name}-1.0.0.dist-info/METADATA`, `Name: ${name}\nVersion: 1.0.0\n`);
    await fixture.write(`${site}/malformed-1.0.0.dist-info/direct_url.json`, '{bad');
    fixture.denied.add(await fixture.write(`${site}/denied-1.0.0.dist-info/direct_url.json`, { url: `https://private.example/${SECRET}` }));
    for (const [name, metadata] of [['local', { _from: 'file:../local' }], ['git', { _from: 'git+https://private.example/repo.git' }], ['named-local', { _from: 'named-local@file:../local' }], ['named-git', { _from: '@scope/named-git@git+https://private.example/repo.git' }], ['port', { _resolved: 'https://registry.npmjs.org:8443/fixture.tgz' }]]) await fixture.write(`.npm-global/lib/node_modules/${name}/package.json`, { name, version: '1.0.0', ...metadata });
    // Act
    await collectRuntimes(fixture.context, fixture.result);
    // Assert
    assert.deepEqual(fixture.result.globalPackages.map(item => [item.name, allowGlobalPackage(item)]).sort(), [['absent', true], ['denied', false], ['git', false], ['local', false], ['malformed', false], ['named-git', false], ['named-local', false], ['port', false]]);
    assert.equal(fixture.result.coverage.some(item => item.area === 'runtime:uv' && item.status === 'partial'), true);
    assert.equal(JSON.stringify(fixture.result).includes(SECRET), false);
  } finally { await fixture.close(); }
});

test('FirefoxとMCPの件数上限を超えた未処理分をcompleteへ変換しない', async () => {
  // Arrange
  const fixture = await environmentFixture();
  try {
    await fixture.write('Library/Application Support/Firefox/profiles.ini', '[Profile0]\nName=default\nIsRelative=1\nPath=Profiles/one\n');
    await fixture.write('Library/Application Support/Firefox/Profiles/one/extensions.json', { addons: Array.from({ length: 2001 }, (_, index) => ({ id: `fixture-${index}@example.test`, version: '1.0.0', active: false })) });
    await fixture.write('.cursor/mcp.json', { mcpServers: Object.fromEntries(Array.from({ length: 2001 }, (_, index) => [`fixture-${index}`, { command: '/usr/bin/node', args: [SECRET] }])) });
    // Act
    await collectBrowserExtensions(fixture.context, fixture.result);
    await collectMcpAndCloud(fixture.context, fixture.result);
    // Assert
    assert.equal(fixture.result.browserExtensions.length, 2000);
    assert.equal(fixture.result.coverage.find(item => item.area === 'firefox-extensions').status, 'partial');
    assert.equal(fixture.result.mcpServers.length, 2000);
    assert.equal(fixture.result.coverage.some(item => item.area === 'mcp-json' && item.status === 'partial'), true);
    assert.equal(fixture.result.diagnostics.filter(item => item.code === 'MSS_CAPACITY').length, 2);
    assert.equal(JSON.stringify(fixture.result).includes(SECRET), false);
  } finally { await fixture.close(); }
});

test('project/VSCode MCPはJSONCに対応しクラウド本文と秘密引数を読取結果に残さない', async () => {
  // Arrange
  const fixture = await environmentFixture();
  try {
    await fixture.write('Projects/example/.mcp.json', { mcpServers: { fixture: { command: '/usr/bin/node', args: [SECRET], env: { KEY: SECRET } } } });
    await fixture.write('Projects/example/.vscode/settings.json', `// note\n{"mcp":{"servers":{"remote":{"url":"https://${SECRET}@example.test"}}},}`);
    await fixture.write('.codex/config.toml', `[mcp_servers.fixture]\ncommand="node"\nargs=["${SECRET}"]\n`);
    await fixture.write('.aws/credentials', SECRET);
    // Act
    await collectMcpAndCloud(fixture.context, fixture.result);
    // Assert
    assert.deepEqual(fixture.result.mcpServers.map(item => [item.name, item.transport, item.executable]), [['fixture', 'stdio', 'node'], ['remote', 'remote-url-redacted', null], ['fixture', 'stdio', 'node']]);
    assert.equal(fixture.result.cloudConfigurations.find(item => item.path.endsWith('/.aws/credentials')).present, true);
    assert.equal(fixture.readPaths.some(file => file.endsWith('/.aws/credentials')), false);
    assert.equal(JSON.stringify(fixture.result).includes(SECRET), false);
  } finally { await fixture.close(); }
});

test('Launch読取失敗を集約しbackground fallback・cron行数・shell存在だけを保持する', async () => {
  // Arrange
  const fixture = await environmentFixture({ execute: async (operation, args, options) => {
    if (operation === 'plutil') return { code: 0, stdout: options.input.toString(), stderr: '' };
    if (operation === 'sfltool') throw Object.assign(new Error(SECRET), { code: 'EACCES' });
    if (operation === 'crontab') return { code: 0, stdout: `# comment\n* * * * * echo ${SECRET}\n`, stderr: '' };
    return { code: 0, stdout: '', stderr: '' };
  } });
  try {
    await fixture.write('Library/LaunchAgents/org.example.plist', { Label: 'org.example', ProgramArguments: ['/usr/bin/node', '--token', SECRET], EnvironmentVariables: { SECRET }, RunAtLoad: true });
    await fixture.write('Library/LaunchAgents/broken.plist', '{bad');
    const app = path.join(fixture.home, 'Applications/Fixture.app'); fixture.result.applications.push({ path: app });
    await fixture.write('Applications/Fixture.app/Contents/Library/LoginItems/Helper.app/Contents/Info.plist', { CFBundleIdentifier: 'org.example.helper' });
    await fixture.write('.zshrc', SECRET);
    // Act
    await collectPersistence(fixture.context, fixture.result);
    // Assert
    assert.equal(fixture.result.coverage.find(item => item.area === 'launch-items').status, 'partial');
    assert.deepEqual(fixture.result.loginItems.map(item => [item.id, item.source]), [['org.example.helper', 'static-login-item']]);
    assert.equal(fixture.result.persistence.cronEntries, 1);
    assert.equal(fixture.readPaths.some(file => file.endsWith('/.zshrc')), false);
    assert.equal(JSON.stringify(fixture.result).includes(SECRET), false);
  } finally { await fixture.close(); }
});

test('OS保護の無効と未確認を分けXProtectの版だけを保持する', async () => {
  // Arrange
  const fixture = await environmentFixture({ execute: async (operation, args, options) => {
    if (operation === 'plutil') return { code: 0, stdout: options.input.toString(), stderr: '' };
    if (operation === 'fdesetup') throw Object.assign(new Error(SECRET), { code: 'EACCES' });
    return { code: 0, stdout: ({ spctl: 'assessments disabled', csrutil: 'System Integrity Protection status: enabled.', firewall: 'Firewall is enabled. (State = 1)' })[operation] || '', stderr: SECRET };
  } });
  try {
    await fixture.write('fake-system/Library/Apple/System/Library/CoreServices/XProtect.bundle/Contents/Info.plist', { CFBundleVersion: '2199', token: SECRET });
    // Act
    await collectProtection(fixture.context, fixture.result);
    // Assert
    assert.deepEqual(['gatekeeper', 'sip', 'filevault', 'firewall'].map(name => fixture.result.protection[name].status), ['disabled', 'enabled', 'unknown', 'enabled']);
    assert.equal(fixture.result.protection.xprotect[0].version, '2199');
    assert.equal(JSON.stringify(fixture.result).includes(SECRET), false);
  } finally { await fixture.close(); }
});

test('CycloneDXとSPDXは画像digestの結合とrecord毎の公開由来を要求する', () => {
  // Arrange
  const digest = 'sha256:' + 'a'.repeat(64), known = new Set([digest]);
  const cyclonedx = { bomFormat: 'CycloneDX', specVersion: '1.6', metadata: { component: { hashes: [{ alg: 'SHA-256', content: 'a'.repeat(64) }] } }, components: [{ name: 'fixture', version: '1.0.0', purl: 'pkg:npm/fixture@1.0.0', externalReferences: [{ type: 'distribution', url: 'https://registry.npmjs.org/fixture/-/fixture-1.0.0.tgz' }], properties: [{ name: 'secret', value: SECRET }] }] };
  const spdx = { spdxVersion: 'SPDX-2.3', documentDescribes: ['SPDXRef-Image'], packages: [{ SPDXID: 'SPDXRef-Image', checksums: [{ algorithm: 'SHA256', checksumValue: 'a'.repeat(64) }] }, { SPDXID: 'SPDXRef-Dependency', name: 'fixture', versionInfo: '1.0.0', downloadLocation: 'https://registry.npmjs.org/fixture/-/fixture-1.0.0.tgz', externalRefs: [{ referenceType: 'purl', referenceLocator: 'pkg:npm/fixture@1.0.0' }] }] };
  // Act
  const actual = [projectSbom(cyclonedx, known), projectSbom(spdx, known), projectSbom(cyclonedx, new Set())];
  // Assert
  assert.deepEqual(actual.map(item => [item.bound, item.packages[0].publicRegistry, item.packages[0].evidenceKind]), [[true, true, 'digest-bound-sbom'], [true, true, 'digest-bound-sbom'], [false, true, 'unbound-sbom']]);
  assert.equal(JSON.stringify(actual).includes(SECRET), false);
  assert.throws(() => projectSbom({ bomFormat: 'CycloneDX', specVersion: '99' }, known), error => error.diagnostic.code === 'MSS_SBOM');
});

test('SBOMの混在配布元と非標準portは公開由来へ格上げせず上限超過は明示拒否する', () => {
  // Arrange
  const binding = { component: { hashes: [{ alg: 'SHA-256', content: 'a'.repeat(64) }] } };
  const component = { name: 'fixture', version: '1.0.0', purl: 'pkg:npm/fixture@1.0.0' };
  const references = [
    [{ type: 'distribution', url: 'https://registry.npmjs.org/fixture.tgz' }, { type: 'distribution', url: 'https://private.example/fixture.tgz' }],
    [{ type: 'distribution', url: 'https://registry.npmjs.org:8443/fixture.tgz' }],
  ];
  const make = components => ({ bomFormat: 'CycloneDX', specVersion: '1.6', metadata: binding, components });
  // Act
  const results = references.map(externalReferences => projectSbom(make([{ ...component, externalReferences }]), new Set(['sha256:' + 'a'.repeat(64)])));
  // Assert
  assert.deepEqual(results.map(result => [result.packages[0].publicRegistry, result.packages[0].explicitPrivate]), [[false, true], [false, true]]);
  assert.throws(() => projectSbom(make(Array.from({ length: 15001 }, () => component)), new Set()), error => error.diagnostic.code === 'MSS_CAPACITY');
});

test('全readerの不在fixtureを実行しても実homeや外部ネットワークを使わない', async () => {
  // Arrange
  const fixture = await environmentFixture();
  try {
    // Act
    const first = await inventory({ context: fixture.context, systemRoot: fixture.context.systemRoot });
    const second = await inventory({ context: fixture.context, systemRoot: fixture.context.systemRoot });
    // Assert
    assert.equal(first.applications.length, 0);
    assert.equal(first.extensions.length, 0);
    assert.equal(first.browserExtensions.length, 0);
    assert.equal(first.globalPackages.length, 0);
    assert.equal(first.runStatus, 'partial');
    assert.equal(second.runtimes.length, first.runtimes.length);
    assert.equal(second.commands.length, first.commands.length);
    assert.equal(fixture.readPaths.every(file => file.startsWith(fixture.home)), true);
    assert.equal(JSON.stringify(first).includes(SECRET), false);
  } finally { await fixture.close(); }
});

test('JSONC内のURLとescaped quoteを壊さずコメントと末尾commaだけを処理する', () => {
  // Arrange
  const text = '{"url":"https://example.test/a//b",/* comment */"quoted":"\\\"",}';
  // Act
  const actual = parseJsonc(text);
  // Assert
  assert.deepEqual(actual, { url: 'https://example.test/a//b', quoted: '"' });
});

test('全local container endpointを調べ名前・環境変数を保存せずSBOMを画像に結合する', async () => {
  // Arrange
  const digest = 'sha256:' + 'a'.repeat(64);
  const fixture = await environmentFixture({ execute: async (operation, args) => {
    assert.equal(operation, 'docker');
    return { code: 0, stdout: JSON.stringify(args[2] === 'image' ? { ID: digest, Repository: 'fixture', Tag: 'latest', Secret: SECRET } : { ID: 'b'.repeat(64), Image: 'fixture:latest', Status: 'Up 1 minute', Names: SECRET, Command: SECRET, Env: [SECRET] }) + '\n', stderr: '' };
  } });
  try {
    const sockets = [await fixture.write('.orbstack/run/docker.sock', ''), await fixture.write('.docker/run/docker.sock', '')];
    const inspect = fixture.context.io.inspect;
    fixture.context.io.inspect = async (...args) => { const value = await inspect(...args); if (sockets.includes(args[0])) value.metadata.isSocket = () => true; return value; };
    const file = await fixture.write('Projects/image.cdx.json', { bomFormat: 'CycloneDX', specVersion: '1.6', metadata: { component: { hashes: [{ alg: 'SHA-256', content: 'a'.repeat(64) }] } }, components: [{ name: 'fixture', version: '1.0.0', purl: 'pkg:npm/fixture@1.0.0', externalReferences: [{ type: 'distribution', url: 'https://registry.npmjs.org/fixture/-/fixture-1.0.0.tgz' }] }] });
    fixture.context.config.sbomFiles = [file];
    // Act
    await collectContainersAndSsh(fixture.context, fixture.result);
    // Assert
    assert.equal(fixture.result.containers.length, 4);
    assert.deepEqual([...new Set(fixture.result.containers.map(item => item.endpoint))].sort(), [...sockets].sort());
    assert.equal(fixture.result.sbomPackages[0].evidenceKind, 'digest-bound-sbom');
    assert.equal(fixture.commands.every(item => item.args[0] === '--host' && item.args[1].startsWith('unix://')), true);
    assert.equal(JSON.stringify(fixture.result).includes(SECRET), false);
  } finally { await fixture.close(); }
});

test('Node全manager・Python環境・Java/Rubyの版不正と権限拒否をunknownで保持する', async () => {
  // Arrange
  const fixture = await environmentFixture();
  try {
    const nodes = ['.nvm/versions/node/v1', '.local/share/fnm/node-versions/v1/installation', '.volta/tools/image/node/v1', '.asdf/installs/nodejs/v1', '.local/share/mise/installs/node/v1', '.vite-plus/js_runtime/node/v1', 'fake-system/opt/homebrew/Cellar/node/v1'];
    for (const root of nodes) { await fixture.write(`${root}/bin/node`, SECRET); await fixture.write(`${root}/include/node/node_version.h`, 'malformed'); }
    const pythons = ['.local/share/uv/tools/example', '.local/share/pipx/venvs/example', '.conda/envs/example', 'Projects/example/.venv'];
    for (const root of pythons) await fixture.write(`${root}/pyvenv.cfg`, 'malformed');
    await fixture.write('Library/Java/JavaVirtualMachines/fixture.jdk/Contents/Home/release', 'malformed');
    const rubies = ['.rbenv/versions/v1', '.rvm/rubies/v1', '.rubies/v1', '.asdf/installs/ruby/v1', '.local/share/mise/installs/ruby/v1'];
    for (const root of rubies) { await fixture.write(`${root}/bin/ruby`, SECRET); await fixture.write(`${root}/include/ruby-1/ruby/version.h`, 'malformed'); }
    // Act
    await collectRuntimes(fixture.context, fixture.result);
    // Assert
    assert.equal(fixture.result.runtimes.filter(item => item.manager !== 'audit-process').every(item => item.version === null), true);
    for (const family of ['nvm', 'fnm', 'volta', 'asdf', 'mise', 'vite-plus', 'homebrew', 'uv', 'pipx', 'conda', 'project-venv', 'java', 'rbenv', 'rvm', 'chruby', 'asdf-ruby', 'mise-ruby']) assert.equal(fixture.result.coverage.some(item => item.area === `runtime:${family}` && item.status === 'partial'), true, family);
    fixture.result.coverage.length = 0;
    for (const root of [...nodes, ...pythons, ...rubies]) fixture.denied.add(path.join(fixture.home, root));
    fixture.denied.add(path.join(fixture.home, 'Library/Java/JavaVirtualMachines'));
    await collectRuntimes(fixture.context, fixture.result);
    assert.equal(fixture.result.coverage.filter(item => item.causes?.includes('denied')).length >= 15, true);
    assert.equal(JSON.stringify(fixture.result).includes(SECRET), false);
  } finally { await fixture.close(); }
});

test('app・MCP・Launch・XProtect・SBOMの不正と拒否は機密付き例外を転載しない', async () => {
  // Arrange
  const fixture = await environmentFixture();
  try {
    await fixture.write('Applications/Broken.app/Contents/Info.plist', '{bad');
    await fixture.write('Projects/example/.mcp.json', '{bad');
    await fixture.write('Library/LaunchAgents/broken.plist', '{bad');
    await fixture.write('fake-system/Library/Apple/System/Library/CoreServices/XProtect.bundle/Contents/Info.plist', '{bad');
    const sbom = await fixture.write('Projects/broken.json', '{bad'); fixture.context.config.sbomFiles = [sbom];
    // Act
    await collectApplications(fixture.context, fixture.result);
    await collectMcpAndCloud(fixture.context, fixture.result);
    await collectPersistence(fixture.context, fixture.result);
    await collectProtection(fixture.context, fixture.result);
    await collectContainersAndSsh(fixture.context, fixture.result);
    // Assert
    for (const area of ['applications', 'mcp-json', 'launch-items', 'xprotect', 'container-sbom']) assert.equal(fixture.result.coverage.some(item => item.area === area && item.status === 'partial'), true, area);
    fixture.result.coverage.length = 0;
    for (const relative of ['Applications', 'Projects', 'Library/LaunchAgents', 'fake-system/Library/Apple', '.docker', '.orbstack']) fixture.denied.add(path.join(fixture.home, relative));
    await collectApplications(fixture.context, fixture.result); await collectMcpAndCloud(fixture.context, fixture.result); await collectPersistence(fixture.context, fixture.result); await collectProtection(fixture.context, fixture.result); await collectContainersAndSsh(fixture.context, fixture.result);
    for (const area of ['applications', 'mcp-json', 'launch-items', 'xprotect', 'container-sbom', 'container-endpoint']) assert.equal(fixture.result.coverage.some(item => item.area === area && item.causes?.includes('denied')), true, area);
    assert.equal(JSON.stringify(fixture.result).includes(SECRET), false);
  } finally { await fixture.close(); }
});

test('Firefoxは静的channel literalだけからESRを判定しappを起動しない', async () => {
  // Arrange
  const fixture = await environmentFixture();
  try {
    await fixture.write('Applications/Firefox.app/Contents/Info.plist', { CFBundleIdentifier: 'org.mozilla.firefox', CFBundleName: 'Firefox', CFBundleShortVersionString: '115.0.0' });
    await fixture.write('Applications/Firefox.app/Contents/Resources/application.ini', 'RemotingName=firefox');
    await fixture.write('Applications/Firefox.app/Contents/Resources/defaults/pref/channel-prefs.js', `pref("app.update.channel", "esr");\nthrow "${SECRET}";`);
    // Act
    await collectApplications(fixture.context, fixture.result);
    // Assert
    assert.equal(fixture.result.applications[0].channel, 'esr');
    assert.equal(fixture.commands.every(item => ['sw_vers', 'brew', 'plutil', 'codesign'].includes(item.operation)), true);
    assert.equal(JSON.stringify(fixture.result).includes(SECRET), false);
  } finally { await fixture.close(); }
});

test('このMacのplutilは検証済みFD由来の実binary plistをstdinから読み取れる', { skip: process.platform !== 'darwin' }, async () => {
  // Arrange: 生成も読取も専用temp内。実appや利用者設定には触れない。
  const execute = promisify(execFile);
  const fixture = await environmentFixture({ execute: async (operation, args, options) => {
    if (operation !== 'plutil') return { code: 0, stdout: operation === 'brew' ? '{"formulae":[],"casks":[]}' : '', stderr: '' };
    const child = execFile('/usr/bin/plutil', args, { env: { PATH: '/usr/bin:/bin' }, timeout: 3000, maxBuffer: 1024 ** 2 });
    const output = await new Promise((resolve, reject) => { let stdout = '', stderr = ''; child.stdout.on('data', part => { stdout += part; }); child.stderr.on('data', part => { stderr += part; }); child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr })); child.stdin.end(options.input); });
    return output;
  } });
  try {
    const file = await fixture.write('Applications/Fixture.app/Contents/Info.plist', `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>org.example.binary</string><key>CFBundleShortVersionString</key><string>1.2.3</string><key>Secret</key><string>${SECRET}</string></dict></plist>`);
    await execute('/usr/bin/plutil', ['-convert', 'binary1', file], { env: { PATH: '/usr/bin:/bin' }, timeout: 3000 });
    assert.equal((await fs.readFile(file)).subarray(0, 8).toString(), 'bplist00');
    // Act
    await collectApplications(fixture.context, fixture.result);
    // Assert
    assert.equal(fixture.result.applications[0].bundleId, 'org.example.binary');
    assert.equal(fixture.result.applications[0].version, '1.2.3');
    assert.equal(JSON.stringify(fixture.result).includes(SECRET), false);
  } finally { await fixture.close(); }
});
