import test from 'node:test';
import assert from 'node:assert/strict';
import { extractLockfile, queryPayload, queryOsv, validPackage, allowGlobalPackage, scanPackages, inspectInstallations } from '../scripts/scan-packages.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('単独CLIは方針除外だけなら終了0、不正metadataがあれば終了2を返す', t => {
  // Arrange
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-policy-cli-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const inventory = path.join(root, 'inventory.json');
  const script = fileURLToPath(new URL('../scripts/scan-packages.mjs', import.meta.url));
  const denyNetwork = fileURLToPath(new URL('./deny-network.mjs', import.meta.url));
  const results = [];
  // Act
  for (const version of ['1.0.0', '^1.0.0']) {
    fs.writeFileSync(inventory, JSON.stringify({ globalPackages: [{ name: 'fixture-private', version, ecosystem: 'npm', private: true }] }));
    const child = spawnSync(process.execPath, ['--import', denyNetwork, script, '--inventory', inventory, '--no-scanner'], { encoding: 'utf8', timeout: 15000 });
    results.push({ status: child.status, data: JSON.parse(child.stdout), stderr: child.stderr });
  }
  // Assert
  assert.deepEqual(results.map(result => result.status), [0, 2]);
  assert.deepEqual(results.map(result => result.stderr), ['', '']);
  assert.equal(results[0].data.records[0].policyExcluded, true);
  assert.equal(results[0].data.coverage.find(item => item.area === 'package-extraction').status, 'complete-with-exclusions');
  assert.equal(results[1].data.coverage.find(item => item.area === 'package-extraction').status, 'partial');
});

test('依存manifestのリンクがプロジェクト外へ向けば秘密ファイルを読まない', async t => {
  // Arrange
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-link-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'project/node_modules/example'), { recursive: true });
  fs.writeFileSync(path.join(root, 'credential.json'), '{"name":"example","version":"1.0.0","token":"SENTINEL_SECRET"}');
  fs.symlinkSync(path.join(root, 'credential.json'), path.join(root, 'project/node_modules/example/package.json'));
  const findings = [{ package: { name: 'example', ecosystem: 'npm' }, version: '1.0.0', evidence: [path.join(root, 'project/package-lock.json')] }];
  // Act
  const actual = await inspectInstallations(findings, {}, { home: path.dirname(root), projectRoots: [path.join(root, 'project')] });
  // Assert
  assert.deepEqual(actual.observations.get('npm:example:1.0.0'), []);
});

test('件数上限の次回は未処理ロックから再開しstate自身は書き換えない', async t => {
  // Arrange
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-resume-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = ['first', 'second'].map(name => {
    fs.mkdirSync(path.join(root, name));
    const file = path.join(root, name, 'package-lock.json');
    fs.writeFileSync(file, JSON.stringify({ packages: { [`node_modules/${name}`]: { version: '1.0.0', resolved: `https://registry.npmjs.org/${name}/-/${name}-1.0.0.tgz` } } }));
    return { path: file };
  });
  const sent = [];
  const fetchImpl = async (_url, options) => { const data = JSON.parse(options.body); sent.push(data); return new Response(JSON.stringify({ results: data.queries.map(() => ({})) })); };
  // Act
  const first = await scanPackages({ lockfiles: files }, { home: path.dirname(root), projectRoots: [root], noScanner: true, maxLockfiles: 1, fetchImpl, inspectInstallations: false });
  const second = await scanPackages({ lockfiles: files }, { home: path.dirname(root), projectRoots: [root], noScanner: true, maxLockfiles: 1, fetchImpl, inspectInstallations: false, continuation: first.continuation, continuationVerified: true });
  // Assert
  assert.deepEqual(first.continuation.pendingLockfiles, [path.join(root, 'second/package-lock.json')]);
  assert.deepEqual(second.packages.map(pkg => pkg.name), ['first', 'second']);
  assert.deepEqual(sent.map(body => body.queries.map(query => query.package.name)), [['first'], ['second']]);
  assert.deepEqual(fs.readdirSync(root).sort(), ['first', 'second']);
  assert.equal(JSON.stringify(sent).includes(root), false);
});

test('パッケージ上限を3回で消化し途中の陽性結果も最後まで保持する', async () => {
  // Arrange
  const inventory = { globalPackages: ['first', 'second', 'third'].map(name => ({ name, version: '1.0.0', ecosystem: 'npm' })) };
  const sent = [];
  const fetchImpl = async (_url, options) => { const data = JSON.parse(options.body); sent.push(data.queries[0].package.name);
    return new Response(JSON.stringify({ results: [{ vulns: data.queries[0].package.name === 'first' ? [{ id: 'GHSA-first' }] : [] }] })); };
  // Act
  const first = await scanPackages(inventory, { noScanner: true, maxPackages: 1, fetchImpl, inspectInstallations: false });
  const second = await scanPackages(inventory, { noScanner: true, maxPackages: 1, fetchImpl, inspectInstallations: false, continuation: first.continuation, continuationVerified: true });
  const third = await scanPackages(inventory, { noScanner: true, maxPackages: 1, fetchImpl, inspectInstallations: false, continuation: second.continuation, continuationVerified: true });
  // Assert
  assert.deepEqual(sent, ['first', 'second', 'third']);
  assert.deepEqual(third.continuation.pendingPackageKeys, []);
  assert.equal(third.findings[0].id, 'GHSA-first');
  assert.equal(third.coverage.find(entry => entry.area === 'osv-query').status, 'complete');
});

test('照会対象が変われば前回の成功を流用せず再照会する', async () => {
  // Arrange
  const requests = [];
  const fetchImpl = async (_url, options) => { const data = JSON.parse(options.body); requests.push(data.queries.map(query => query.version)); return new Response(JSON.stringify({ results: data.queries.map(() => ({})) })); };
  const inventory = { globalPackages: [{ name: 'example', version: '1.0.0', ecosystem: 'npm' }] };
  // Act
  const first = await scanPackages(inventory, { noScanner: true, fetchImpl });
  await scanPackages({ globalPackages: [{ name: 'example', version: '2.0.0', ecosystem: 'npm' }] }, { noScanner: true, fetchImpl, continuation: first.continuation });
  // Assert
  assert.deepEqual(requests, [['1.0.0'], ['2.0.0']]);
});

test('node_modulesの実物の版をロック記録と区別し依存コードは実行しない', async t => {
  // Arrange
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-installed-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'node_modules/example'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules/example/package.json'), JSON.stringify({ name: 'example', version: '1.0.0', scripts: { postinstall: 'SENTINEL_MUST_NOT_RUN' }, token: 'SENTINEL_SECRET' }));
  const findings = [{ package: { name: 'example', ecosystem: 'npm' }, version: '1.0.0', evidence: [path.join(root, 'package-lock.json')] }];
  // Act
  const actual = await inspectInstallations(findings, {}, { home: path.dirname(root), projectRoots: [root] });
  // Assert
  assert.deepEqual(actual.observations.get('npm:example:1.0.0'), [{ path: path.join(root, 'node_modules/example/package.json'), name: 'example', ecosystem: 'npm', version: '1.0.0', evidenceKind: 'installed-metadata' }]);
  assert.equal(JSON.stringify([...actual.observations]).includes('SENTINEL'), false);
});

test('OSV 送信内容にはローカルパスと秘密の付加フィールドが入らない', () => {
  // Arrange
  const packages = [{ name: 'lodash', version: '4.17.20', ecosystem: 'npm', evidence: ['/private/work/lock'], token: 'DO_NOT_SEND', content: 'DO_NOT_SEND' }];
  // Act
  const actual = queryPayload(packages);
  // Assert
  assert.deepEqual(actual, { queries: [{ package: { name: 'lodash', ecosystem: 'npm' }, version: '4.17.20' }] });
});

test('明示private・local・Gitの実物は同名同版の公開lockを実在確認へ昇格させない', async t => {
  // Arrange
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-private-installed-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'node_modules/example'), { recursive: true });
  const filename = path.join(root, 'node_modules/example/package.json');
  const findings = [{ package: { name: 'example', ecosystem: 'npm' }, version: '1.0.0', evidence: [path.join(root, 'package-lock.json')] }];
  // Act
  const observations = [];
  for (const metadata of [{ private: true }, { _from: 'file:../local' }, { _resolved: 'git+https://private.example/repo' }, { _resolved: 'https://user:SENTINEL_SECRET@private.example/a.tgz' }]) {
    fs.writeFileSync(filename, JSON.stringify({ name: 'example', version: '1.0.0', ...metadata }));
    const result = await inspectInstallations(findings, {}, { home: path.dirname(root), projectRoots: [root] });
    observations.push(result.observations.get('npm:example:1.0.0'));
  }
  // Assert
  assert.deepEqual(observations, [[], [], [], []]);
});

test('npm のローカルリンクと資格情報入り解決 URL を外部照合から除外する', () => {
  // Arrange
  const lock = JSON.stringify({ packages: {
    'node_modules/lodash': { version: '4.17.20', resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.20.tgz' },
    'node_modules/local': { version: '1.0.0', link: true, resolved: '../local' },
    'node_modules/private': { version: '1.0.0', resolved: 'https://user:secret@registry.npmjs.org/private.tgz' },
  } });
  // Act
  const actual = extractLockfile('package-lock.json', lock);
  // Assert
  assert.deepEqual(actual.packages, [{ name: 'lodash', version: '4.17.20', ecosystem: 'npm' }]);
  assert.equal(JSON.stringify(actual).includes('secret'), false);
});

test('pnpm の peer suffix と importers 要求範囲を取り違えない', () => {
  // Arrange
  const lock = "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      lodash:\n        version: 4.17.20\npackages:\n  '@scope/example@1.2.3':\n    resolution: {integrity: sha512-test}\nsnapshots:\n  '@scope/example@1.2.3(react@19.0.0)': {}\n";
  // Act
  const actual = extractLockfile('pnpm-lock.yaml', lock);
  // Assert
  assert.equal(actual.packages.length, 0);
  assert.equal(actual.records.length, 1);
  assert.equal(actual.records[0].name, '@scope/example');
  assert.equal(actual.records[0].version, '1.2.3');
  assert.equal(actual.records[0].origin, 'unknown');
  assert.equal(actual.packages.some(pkg => pkg.name === 'lodash'), false);
});

test('pnpm の私有 tarball が snapshots から照合対象に復活しない', () => {
  // Arrange
  const lock = "lockfileVersion: '9.0'\npackages:\n  private-example@1.2.3:\n    resolution: {tarball: https://private.example/package.tgz}\nsnapshots:\n  private-example@1.2.3: {}\n";
  // Act
  const actual = extractLockfile('pnpm-lock.yaml', lock);
  // Assert
  assert.deepEqual(actual.packages, []);
});

test('パッケージ欄にコマンド・URL・workspace 参照が混入しても受け入れない', () => {
  // Arrange
  const inputs = ['$' + '(echo secret)', 'https://example.com/x', 'workspace:*'];
  // Act
  const actual = inputs.map(name => validPackage({ name, version: '1.0.0', ecosystem: 'npm' }));
  // Assert
  assert.deepEqual(actual, [false, false, false]);
});

test('OSV の応答件数不一致を脆弱性ゼロの成功扱いにしない', async () => {
  // Arrange
  const packages = [{ name: 'lodash', version: '4.17.20', ecosystem: 'npm', evidence: ['local'] }];
  const fetchImpl = async () => new Response('{"results":[]}');
  // Act
  const actual = await queryOsv(packages, { fetchImpl });
  // Assert
  assert.equal(actual.queried, 0);
  assert.equal(actual.coverage.at(-1).status, 'partial');
});

test('OSV の追加ページが残ったら完全な照合と報告しない', async () => {
  // Arrange
  const packages = [{ name: 'lodash', version: '4.17.20', ecosystem: 'npm', evidence: ['local'] }];
  const fetchImpl = async () => new Response('{"results":[{"vulns":[{"id":"GHSA-example"}],"next_page_token":"opaque"}]}');
  // Act
  const actual = await queryOsv(packages, { fetchImpl });
  // Assert
  assert.equal(actual.findings[0].id, 'GHSA-example');
  assert.equal(actual.coverage[0].status, 'partial');
});

test('出所不明の OpenClaw グローバル版を照合しローカルパスを送信しない', () => {
  // Arrange
  const pkg = { name: 'openclaw', version: '2026.10.9', ecosystem: 'npm', evidence: '/Users/local/.vite-plus/packages/openclaw/package.json' };
  // Act
  const allowed = allowGlobalPackage(pkg);
  const payload = queryPayload([pkg]);
  // Assert
  assert.equal(allowed, true);
  assert.deepEqual(payload, { queries: [{ package: { name: 'openclaw', ecosystem: 'npm' }, version: '2026.10.9' }] });
});

test('明示的な私有・ローカル・Git 由来のグローバルパッケージは送信しない', () => {
  // Arrange
  const base = { name: '@company/example', version: '1.2.3', ecosystem: 'npm' };
  const inputs = [{ ...base, private: true }, { ...base, explicitPrivate: true }, { ...base, sourceType: 'local' }, { ...base, sourceType: 'git' }, { ...base, registry: 'https://registry.private.example' }];
  // Act
  const actual = inputs.map(allowGlobalPackage);
  // Assert
  assert.deepEqual(actual, [false, false, false, false, false]);
  assert.equal(allowGlobalPackage(base), true);
});
