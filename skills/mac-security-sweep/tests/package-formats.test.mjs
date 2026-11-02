import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FORMAT_CAPABILITIES, LOCKFILE_NAMES, extractLockfile, validPackage, parseJsonc } from '../scripts/package-formats.mjs';
import { scanPackages } from '../scripts/scan-packages.mjs';

const PUBLIC_CASES = [
  { label: 'npm v1', file: 'package-lock.json', name: 'example', version: '1.2.3', ecosystem: 'npm', body: JSON.stringify({ lockfileVersion: 1, dependencies: { example: { version: '1.2.3', resolved: 'https://registry.npmjs.org/example/-/example-1.2.3.tgz' } } }) },
  { label: 'npm v2', file: 'package-lock.json', name: 'example', version: '1.2.3', ecosystem: 'npm', body: JSON.stringify({ lockfileVersion: 2, packages: { 'node_modules/example': { version: '1.2.3', resolved: 'https://registry.npmjs.org/example/-/example-1.2.3.tgz' } } }) },
  { label: 'npm v3 shrinkwrap', file: 'npm-shrinkwrap.json', name: 'example', version: '1.2.3', ecosystem: 'npm', body: JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/example': { version: '1.2.3', resolved: 'https://registry.npmjs.org/example/-/example-1.2.3.tgz' } } }) },
  { label: 'pnpm 9', file: 'pnpm-lock.yaml', name: '@scope/example', version: '1.2.3', ecosystem: 'npm', body: "lockfileVersion: '9.0'\npackages:\n  '@scope/example@1.2.3':\n    resolution: {tarball: https://registry.npmjs.org/@scope/example/-/example-1.2.3.tgz}\n" },
  { label: 'Yarn classic', file: 'yarn.lock', name: 'example', version: '1.2.3', ecosystem: 'npm', body: '# yarn lockfile v1\n"example@^1", "example@~1":\n  version "1.2.3"\n  resolved "https://registry.yarnpkg.com/example/-/example-1.2.3.tgz#abcd"\n' },
  { label: 'Yarn Berry archive', file: 'yarn.lock', name: 'example', version: '1.2.3', ecosystem: 'npm', body: '__metadata:\n  version: 8\n"example@npm:1.2.3":\n  version: 1.2.3\n  resolution: "example@npm:1.2.3::__archiveUrl=https%3A%2F%2Fregistry.npmjs.org%2Fexample%2F-%2Fexample-1.2.3.tgz"\n' },
  { label: 'Bun JSONC', file: 'bun.lock', name: 'example', version: '1.2.3', ecosystem: 'npm', body: '{\n// pinned text schema\n"lockfileVersion": 1, "packages": {"example": ["example@1.2.3", "https://registry.npmjs.org/example/-/example-1.2.3.tgz", {}, "sha512-public"],}, /* comment */\n}' },
  { label: 'Cargo', file: 'Cargo.lock', name: 'example', version: '1.2.3', ecosystem: 'crates.io', body: 'version = 4\n[[package]]\nname = "example"\nversion = "1.2.3"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n' },
  { label: 'Poetry explicit source', file: 'poetry.lock', name: 'example', version: '1.2.3', ecosystem: 'PyPI', body: '[[package]]\nname = "example"\nversion = "1.2.3"\n[package.source]\ntype = "legacy"\nurl = "https://pypi.org/simple"\n[metadata]\nlock-version = "2.1"\n' },
  { label: 'uv explicit registry', file: 'uv.lock', name: 'example', version: '1.2.3', ecosystem: 'PyPI', body: 'version = 1\n[[package]]\nname = "example"\nversion = "1.2.3"\nsource = { registry = "https://pypi.org/simple" }\n' },
  { label: 'Pipfile named source', file: 'Pipfile.lock', name: 'example', version: '1.2.3', ecosystem: 'PyPI', body: JSON.stringify({ _meta: { 'pipfile-spec': 6, sources: [{ name: 'pypi', url: 'https://pypi.org/simple' }] }, default: { example: { version: '==1.2.3', index: 'pypi' } } }) },
  { label: 'requirements direct wheel', file: 'requirements.txt', name: 'example', version: '1.2.3', ecosystem: 'PyPI', body: 'example @ https://files.pythonhosted.org/packages/example-1.2.3-py3-none-any.whl\n' },
  { label: 'Composer public dist', file: 'composer.lock', name: 'vendor/example', version: '1.2.3', ecosystem: 'Packagist', body: JSON.stringify({ packages: [{ name: 'vendor/example', version: '1.2.3', dist: { type: 'zip', url: 'https://repo.packagist.org/example-1.2.3.zip' } }] }) },
  { label: 'Bundler GEM', file: 'Gemfile.lock', name: 'example', version: '1.2.3', ecosystem: 'RubyGems', body: 'GEM\n  remote: https://rubygems.org/\n  specs:\n    example (1.2.3)\n\nPLATFORMS\n  ruby\n' },
  { label: 'Dart hosted', file: 'pubspec.lock', name: 'example', version: '1.2.3', ecosystem: 'Pub', body: 'packages:\n  example:\n    description:\n      name: example\n      url: "https://pub.dev"\n      sha256: public\n    source: hosted\n    version: "1.2.3"\nsdks:\n  dart: ">=3.0.0"\n' },
];

for (const fixture of PUBLIC_CASES) {
  test(`${fixture.label}の固定版とrecord由来を解析し最小payloadだけを送信する`, async t => {
    // Arrange
    const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'sweep-format-')));
    const project = path.join(home, 'Projects');
    await fs.mkdir(project);
    const file = path.join(project, fixture.file);
    await fs.writeFile(file, fixture.body);
    t.after(() => fs.rm(home, { recursive: true, force: true }));
    const payloads = [];
    const fetchImpl = async (_url, init) => { payloads.push(JSON.parse(init.body)); return new Response('{"results":[{}]}'); };
    // Act
    const result = await scanPackages({ scanRoots: [project], lockfiles: [{ path: file }] }, { home, fetchImpl, noScanner: true, inspectInstallations: false });
    // Assert
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].origin, 'public');
    assert.equal(result.records[0].evidenceKind, 'lock-declaration');
    assert.deepEqual(payloads, [{ queries: [{ package: { name: fixture.name, ecosystem: fixture.ecosystem }, version: fixture.version }] }]);
    assert.equal(JSON.stringify(payloads).includes(home), false);
  });
  test(`${fixture.label}の資格情報付き配布先はrecord本文を残さず送信除外する`, () => {
    // Arrange
    const content = fixture.body.replace(/https:\/\/[^/\s"']+/g, 'https://user:SENTINEL_SECRET@private.example')
      .replace(/https%3A%2F%2Fregistry.npmjs.org/g, 'https%3A%2F%2Fuser%3ASENTINEL_SECRET%40private.example');
    // Act
    const result = extractLockfile(fixture.file, content);
    // Assert
    assert.deepEqual(result.packages, []);
    assert.equal(result.records.every(record => record.queryEligible === false), true);
    assert.equal(result.status, 'complete-with-exclusions');
    assert.equal(result.excluded, 1);
    assert.equal(result.unknown, 0);
    assert.equal(JSON.stringify(result).includes('SENTINEL'), false);
  });
}

const UNKNOWN_CASES = [
  ['go.sum', 'github.com/example/lib v1.2.3 h1:YWJjZA==\n', 'github.com/example/lib', 'v1.2.3', 'Go'],
  ['gradle.lockfile', '# Gradle dependency locking\norg.example:core:1.2.3=compileClasspath,runtimeClasspath\nempty=\n', 'org.example:core', '1.2.3', 'Maven'],
  ['packages.lock.json', '{"version":1,"dependencies":{"net8.0":{"Example.Core":{"type":"Direct","resolved":"1.2.3","contentHash":"public"}}}}', 'Example.Core', '1.2.3', 'NuGet'],
  ['packages.config', '<?xml version="1.0"?><packages><package id="Example.Core" version="1.2.3" targetFramework="net48" /></packages>', 'Example.Core', '1.2.3', 'NuGet'],
  ['requirements.txt', 'example==1.2.3\n', 'example', '1.2.3', 'PyPI'],
  ['poetry.lock', '[[package]]\nname = "example"\nversion = "1.2.3"\n[metadata]\nlock-version = "2.1"\n', 'example', '1.2.3', 'PyPI'],
  ['yarn.lock', '__metadata:\n  version: 8\n"example@npm:1.2.3":\n  version: 1.2.3\n  resolution: "example@npm:1.2.3"\n', 'example', '1.2.3', 'npm'],
  ['bun.lock', '{"lockfileVersion":1,"packages":{"example":["example@1.2.3","",{},"sha512-public"]}}', 'example', '1.2.3', 'npm'],
];

test('引用keyと空白keyで重複する由来を別表現にしても公開送信を許可しない', () => {
  // Arrange
  const uv = 'version = 1\n[[package]]\nname = "fixture-private"\nversion = "1.0.0"\nsource = { registry = "https://pypi.org/simple" }\n';
  const cases = [
    ['uv.lock', `${uv}"source" = { registry = "https://private.example/simple" }\n`],
    ['uv.lock', `${uv}  source = { registry = "https://private.example/simple" }\n`],
    ['uv.lock', `${uv}source.registry = "https://private.example/simple"\n`],
    ['uv.lock', `${uv}[package."source"]\nregistry = "https://private.example/simple"\n`],
    ['pnpm-lock.yaml', 'lockfileVersion: 9\npackages:\n  fixture-private@1.0.0:\n    resolution: {tarball: https://registry.npmjs.org/example.tgz, "tarball": https://private.example/a.tgz}\n'],
    ['pnpm-lock.yaml', 'lockfileVersion: 9\npackages:\n  fixture-private@1.0.0:\n    resolution: {tarball: https://registry.npmjs.org/example.tgz, "tar\\u0062all": https://private.example/a.tgz}\n'],
    ['yarn.lock', '"fixture-private@1.0.0":\n  version "1.0.0"\n  resolved "https://registry.npmjs.org/fixture-private/-/fixture-private-1.0.0.tgz"\n  "resolved" "https://private.example/a.tgz"\n'],
  ];
  // Act
  const results = cases.map(([filename, content]) => extractLockfile(filename, content));
  // Assert
  for (const result of results) { assert.equal(result.status, 'unsupported'); assert.deepEqual(result.packages, []); assert.deepEqual(result.records, []); }
});

test('別mappingのtarballやurlをそのrecordの配布元として誤結合しない', () => {
  // Arrange
  const cases = [
    ['pnpm-lock.yaml', 'lockfileVersion: 6\npackages:\n  /fixture-private@1.0.0:\n    resolution: {integrity: sha512-synthetic}\n    dependencies:\n      tarball: https://registry.npmjs.org/another/-/another-1.0.0.tgz\n'],
    ['pnpm-lock.yaml', 'lockfileVersion: 6\npackages:\n  /fixture-private@1.0.0:\n    resolution: {integrity: sha512-synthetic, note: "{tarball: https://registry.npmjs.org/another/-/another-1.0.0.tgz}"}\n'],
    ['pubspec.lock', 'packages:\n  fixture_private:\n    description: fixture_private\n    source: hosted\n    other:\n      name: fixture_private\n      url: https://pub.dev\n    version: "1.0.0"\n'],
  ];
  // Act
  const results = cases.map(([filename, content]) => extractLockfile(filename, content));
  // Assert
  for (const result of results) { assert.deepEqual(result.packages, []); assert.equal(result.records[0].origin, 'unknown'); assert.equal(result.status, 'partial'); }
});

test('pnpmの非対応な入れ子flowを解析成功や公開tarballへ変換しない', () => {
  // Arrange
  const content = 'lockfileVersion: 6\npackages:\n  /fixture-private@1.0.0:\n    resolution: {integrity: sha512-synthetic, other: {tarball: https://registry.npmjs.org/another/-/another-1.0.0.tgz}}\n';
  // Act
  const result = extractLockfile('pnpm-lock.yaml', content);
  // Assert
  assert.equal(result.status, 'unsupported'); assert.deepEqual(result.packages, []);
});

test('TOMLの子array tableにあるsourceを親packageの由来にしない', () => {
  // Arrange
  const cases = [
    ['Cargo.lock', 'version=3\n[[package]]\nname="fixture-private"\nversion="1.0.0"\n[[package.extra]]\nsource="registry+https://github.com/rust-lang/crates.io-index"\n'],
    ['uv.lock', 'version=1\n[[package]]\nname="fixture-private"\nversion="1.0.0"\n[[package.extra]]\nsource={ registry="https://pypi.org/simple" }\n'],
  ];
  // Act
  const results = cases.map(([filename, content]) => extractLockfile(filename, content));
  // Assert
  for (const result of results) { assert.equal(result.status, 'partial'); assert.equal(result.records[0].origin, 'unknown'); assert.deepEqual(result.packages, []); }
});

for (const [file, content, name, version, ecosystem] of UNKNOWN_CASES) {
  test(`${file}のregistry既定値を推測せず識別子と未確認由来を保持する`, () => {
    // Arrange / Act
    const result = extractLockfile(file, content);
    // Assert
    assert.deepEqual(result.packages, []);
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].name, name);
    assert.equal(result.records[0].version, version);
    assert.equal(result.records[0].ecosystem, ecosystem);
    assert.equal(result.records[0].origin, 'unknown');
    assert.equal(result.status, 'partial');
    assert.equal(result.excluded, 0);
    assert.equal(result.unknown, 1);
    assert.equal(result.records[0].policyExcluded, false);
  });
}

test('既知private・Git・localだけのlockを方針除外として未確認と区別する', () => {
  // Arrange
  const lock = JSON.stringify({ lockfileVersion: 3, packages: {
    'node_modules/private-package': { version: '1.0.0', resolved: 'https://private.example/package.tgz' },
    'node_modules/git-package': { version: '1.0.0', resolved: 'git+https://github.com/private/package.git' },
    'node_modules/local-package': { version: '1.0.0', resolved: 'file:../local-package' },
  } });
  // Act
  const result = extractLockfile('package-lock.json', lock);
  // Assert
  assert.equal(result.status, 'complete-with-exclusions');
  assert.deepEqual(result.records.map(record => [record.origin, record.policyExcluded]), [['private', true], ['git', true], ['local', true]]);
  assert.deepEqual([result.excluded, result.unknown, result.invalid, result.skipped], [3, 0, 0, 3]);
  assert.deepEqual(result.packages, []);
});

test('方針除外に混ざった未知由来や不正な固定版を除外件数へ隠さない', () => {
  // Arrange
  const lock = JSON.stringify({ lockfileVersion: 3, packages: {
    'node_modules/private-package': { version: '1.0.0', resolved: 'https://private.example/package.tgz' },
    'node_modules/unknown-package': { version: '1.0.0' },
    'node_modules/invalid-package': { version: '^1.0.0', resolved: 'https://registry.npmjs.org/invalid-package.tgz' },
  } });
  // Act
  const result = extractLockfile('package-lock.json', lock);
  // Assert
  assert.equal(result.status, 'partial');
  assert.deepEqual([result.excluded, result.unknown, result.invalid, result.skipped], [1, 1, 1, 3]);
  assert.deepEqual(result.packages, []);
});

test('Swift v1/v2/v3のexact版は解析するがGit URLを外部照会へ変換しない', () => {
  // Arrange
  const inputs = [
    { version: 1, object: { pins: [{ package: 'Example', repositoryURL: 'https://github.com/private/SENTINEL_SECRET', state: { version: '1.2.3' } }] } },
    { version: 2, pins: [{ identity: 'example', location: 'https://github.com/private/SENTINEL_SECRET', state: { version: '1.2.3' } }] },
    { version: 3, pins: [{ identity: 'example', location: 'https://github.com/private/SENTINEL_SECRET', state: { version: '1.2.3' } }] },
  ];
  // Act
  const results = inputs.map(input => extractLockfile('Package.resolved', JSON.stringify(input)));
  // Assert
  assert.deepEqual(results.map(result => result.records.length), [1, 1, 1]);
  assert.deepEqual(results.map(result => result.packages), [[], [], []]);
  assert.deepEqual(results.map(result => result.records[0].exclusion), ['git-url-privacy', 'git-url-privacy', 'git-url-privacy']);
  assert.equal(JSON.stringify(results).includes('SENTINEL'), false);
});

test('ComposerのGitHub private sourceやsourceなしscanner名を公開扱いにしない', () => {
  // Arrange
  const content = JSON.stringify({ packages: [{ name: 'private/fixture', version: '1.0.0', source: { type: 'git', url: 'https://user:SENTINEL_SECRET@github.com/private/project.git' }, dist: { type: 'zip', url: 'https://api.github.com/repos/private/project/zipball/ref' } }] });
  // Act
  const result = extractLockfile('composer.lock', content);
  // Assert
  assert.deepEqual(result.packages, []);
  assert.equal(result.records[0].origin, 'private');
  assert.equal(JSON.stringify(result).includes('SENTINEL'), false);
});

test('YAML alias・未知schema・深すぎるJSON・巨大lineは公開性を一部だけ許可しない', () => {
  // Arrange
  const nested = '['.repeat(60) + '0' + ']'.repeat(60);
  const cases = [
    ['pnpm-lock.yaml', "lockfileVersion: '9.0'\npackages:\n  example@1.0.0:\n    <<: *SENTINEL_SECRET\n"],
    ['package-lock.json', '{"lockfileVersion":99,"packages":{}}'],
    ['bun.lock', '{"lockfileVersion":99,"packages":{}}'],
    ['packages.lock.json', '{"version":99,"dependencies":{}}'],
    ['Package.resolved', '{"version":99,"pins":[]}'],
    ['package-lock.json', nested],
    ['requirements.txt', 'x'.repeat(65537)],
  ];
  // Act
  const results = cases.map(([file, text]) => extractLockfile(file, text));
  // Assert
  assert.deepEqual(results.map(result => result.status), ['unsupported', 'unsupported', 'unsupported', 'unsupported', 'unsupported', 'unsupported', 'unsupported']);
  assert.equal(results.every(result => result.packages.length === 0), true);
  assert.equal(JSON.stringify(results).includes('SENTINEL'), false);
});

test('Bun binaryは検出未対応であり対象形式表から黙って消えない', () => {
  // Arrange / Act
  const result = extractLockfile('bun.lockb', Buffer.from([0, 1, 2]));
  // Assert
  assert.equal(LOCKFILE_NAMES.has('bun.lockb'), true);
  assert.equal(FORMAT_CAPABILITIES.find(row => row.id === 'bun-binary').parsing, false);
  assert.equal(result.status, 'unsupported');
});

test('JSONCの文字列URL・comma・コメントを混同せず、Maven colonを受理する', () => {
  // Arrange / Act
  const parsed = parseJsonc('{"url":"https://example.com/a,}", "version":1, /* comment */ }');
  // Assert
  assert.deepEqual(parsed, { url: 'https://example.com/a,}', version: 1 });
  assert.equal(validPackage({ name: 'org.example:core', version: '1.2.3', ecosystem: 'Maven' }), true);
  assert.equal(validPackage({ name: 'https://example.com', version: '1.2.3', ecosystem: 'Maven' }), false);
});

test('全対応形式の不正な本文を0件completeへ置き換えない', () => {
  // Arrange
  const files = [...LOCKFILE_NAMES].filter(file => file !== 'bun.lockb');
  // Act
  const results = files.map(file => extractLockfile(file, 'SENTINEL_MALFORMED [!invalid'));
  // Assert
  assert.equal(results.every(result => result.status !== 'complete'), true);
  assert.equal(results.every(result => result.packages.length === 0), true);
  assert.equal(JSON.stringify(results).includes('SENTINEL'), false);
});

test('重複recordやsource keyの順序でprivate宣言を公開へ上書きしない', () => {
  // Arrange
  const cases = [
    ['package-lock.json', '{"lockfileVersion":3,"packages":{"node_modules/example":{"version":"1.0.0","resolved":"https://private.example/a","resolved":"https://registry.npmjs.org/a"}}}'],
    ['pnpm-lock.yaml', "lockfileVersion: '9.0'\npackages:\n  example@1.0.0:\n    resolution: {tarball: https://private.example/a, tarball: https://registry.npmjs.org/a}\n"],
    ['yarn.lock', 'example@1:\n  version "1.0.0"\n  resolved "https://private.example/a"\n  resolved "https://registry.npmjs.org/a"\n'],
    ['bun.lock', '{"lockfileVersion":1,"packages":{"example":["example@1.0.0","https://private.example/a",{}],"example":["example@1.0.0","https://registry.npmjs.org/a",{}]}}'],
  ];
  // Act
  const results = cases.map(([file, text]) => extractLockfile(file, text));
  // Assert
  assert.deepEqual(results.map(result => result.status), ['unsupported', 'unsupported', 'unsupported', 'unsupported']);
  assert.equal(results.every(result => result.packages.length === 0), true);
});

test('Git型と公開archive URLを混在させてもregistry由来へ変更しない', () => {
  // Arrange
  const cases = [
    ['pnpm-lock.yaml', "lockfileVersion: '9.0'\npackages:\n  example@1.0.0:\n    resolution: {type: git, tarball: https://registry.npmjs.org/example.tgz}\n"],
    ['yarn.lock', '__metadata:\n  version: 8\n"example@git:ref":\n  version: 1.0.0\n  resolution: "example@git:ref::__archiveUrl=https%3A%2F%2Fregistry.npmjs.org%2Fexample.tgz"\n'],
    ['poetry.lock', '[[package]]\nname = "example"\nversion = "1.0.0"\n[package.source]\ntype = "git"\nurl = "https://pypi.org/simple"\n'],
  ];
  // Act
  const results = cases.map(([file, text]) => extractLockfile(file, text));
  // Assert
  assert.equal(results.every(result => result.packages.length === 0), true);
  assert.equal(results.every(result => result.records[0].origin === 'private'), true);
});

test('uv・Dart・Poetry・Pipfileの重複由来を最初の公開値だけで許可しない', () => {
  // Arrange
  const cases = [
    ['uv.lock', 'version = 1\n[[package]]\nname = "example"\nversion = "1.0.0"\nsource = { registry = "https://pypi.org/simple" }\nsource = { registry = "https://private.example/SENTINEL_SECRET" }\n'],
    ['pubspec.lock', 'packages:\n  example:\n    description:\n      name: example\n      url: "https://pub.dev"\n      url: "https://private.example/SENTINEL_SECRET"\n    source: hosted\n    version: "1.0.0"\n'],
    ['pubspec.lock', 'packages:\n  example:\n    description:\n      name: example\n      url: "https://pub.dev"\n      "url": "https://private.example/SENTINEL_SECRET"\n    source: hosted\n    version: "1.0.0"\n'],
    ['poetry.lock', '[[package]]\nname = "example"\nversion = "1.0.0"\n[package.source]\ntype = "legacy"\nurl = "https://pypi.org/simple"\n[package.source]\ntype = "git"\nurl = "https://private.example/SENTINEL_SECRET"\n'],
    ['Pipfile.lock', JSON.stringify({ _meta: { sources: [{ name: 'index', url: 'https://private.example/SENTINEL_SECRET' }, { name: 'index', url: 'https://pypi.org/simple' }] }, default: { example: { version: '==1.0.0', index: 'index' } } })],
    ['pnpm-lock.yaml', "lockfileVersion: '9.0'\npackages:\n  example@1.0.0:\n    resolution: {tarball: https://registry.npmjs.org/example.tgz}\n    resolution: {integrity: SENTINEL_SECRET}\n"],
  ];
  // Act
  const results = cases.map(([file, text]) => extractLockfile(file, text));
  // Assert
  assert.deepEqual(results.map(result => result.status), ['unsupported', 'unsupported', 'unsupported', 'unsupported', 'unsupported', 'unsupported']);
  assert.equal(results.every(result => result.packages.length === 0), true);
  assert.equal(JSON.stringify(results).includes('SENTINEL'), false);
});
