import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { queryOsv, scanPackages } from '../scripts/scan-packages.mjs';
import { createRunContext } from '../scripts/runtime.mjs';
import { matchInventory } from '../scripts/match.mjs';
import { assessmentStatus } from '../scripts/assessment.mjs';

const PACKAGE_A = { name: 'first', version: '1.0.0', ecosystem: 'npm', evidence: [] };
const PACKAGE_B = { name: 'second', version: '2.0.0', ecosystem: 'npm', evidence: [] };

test('queryごとに異なるtokenを2回の巡回へ保持し前ページの陽性を失わない', async () => {
  // Arrange
  const bodies = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body); bodies.push(body);
    return new Response(JSON.stringify({ results: body.queries.map(query => query.page_token
      ? { vulns: [{ id: `GHSA-${query.package.name}-second` }, { id: `GHSA-${query.package.name}-first` }] }
      : { vulns: [{ id: `GHSA-${query.package.name}-first` }], next_page_token: `${query.package.name}-page-two` }) }));
  };
  // Act
  const first = await queryOsv([PACKAGE_A, PACKAGE_B], { fetchImpl, maxPages: 1 });
  const second = await queryOsv([PACKAGE_A, PACKAGE_B], { fetchImpl, maxPages: 1, previous: first.continuation, continuationVerified: true });
  // Assert
  assert.equal(first.coverage.at(-1).status, 'partial');
  assert.deepEqual(first.successfulKeys, []);
  assert.deepEqual(bodies[1], { queries: [
    { package: { name: 'first', ecosystem: 'npm' }, version: '1.0.0', page_token: 'first-page-two' },
    { package: { name: 'second', ecosystem: 'npm' }, version: '2.0.0', page_token: 'second-page-two' },
  ] });
  assert.deepEqual(second.findings.map(finding => finding.id), ['GHSA-first-first', 'GHSA-first-second', 'GHSA-second-first', 'GHSA-second-second']);
  assert.equal(second.coverage.at(-1).status, 'complete');
});

test('後続ページの失敗と429では成功cursorを進めず次回の待機時刻を保持する', async () => {
  // Arrange
  const first = await queryOsv([PACKAGE_A], { maxPages: 1, fetchImpl: async () => new Response('{"results":[{"vulns":[{"id":"GHSA-before"}],"next_page_token":"next"}]}') });
  const context = createRunContext({ fetchImpl: async () => new Response('{}', { status: 429, headers: { 'Retry-After': '60' } }) });
  context.continuationVerified = true;
  // Act
  const second = await queryOsv([PACKAGE_A], { context, previous: first.continuation });
  await context.close();
  // Assert
  assert.deepEqual(second.successfulKeys, []);
  assert.equal(second.findings[0].id, 'GHSA-before');
  assert.equal(second.continuation.queries[0].pageToken, 'next');
  assert.equal(second.coverage.at(-1).status, 'partial');
  assert.ok(context.transport.cooldowns['api.osv.dev'] > Date.now());
});

test('失効tokenは一度だけ先頭へ戻し永続失敗でも無限再試行しない', async () => {
  // Arrange
  const first = await queryOsv([PACKAGE_A], { maxPages: 1, fetchImpl: async () => new Response('{"results":[{"vulns":[{"id":"GHSA-before"}],"next_page_token":"expired"}]}') });
  const requests = [];
  const fetchImpl = async (_url, init) => { requests.push(JSON.parse(init.body)); return new Response('{}', { status: 400 }); };
  // Act
  const second = await queryOsv([PACKAGE_A], { fetchImpl, previous: first.continuation, continuationVerified: true });
  // Assert
  assert.equal(requests.length, 2);
  assert.equal(requests[0].queries[0].page_token, 'expired');
  assert.equal(Object.hasOwn(requests[1].queries[0], 'page_token'), false);
  assert.equal(second.findings[0].id, 'GHSA-before');
  assert.equal(second.coverage.at(-1).status, 'partial');
});

test('変更した由来・24時間期限・未検証stateのtokenやIDを新しい照会へ流用しない', async () => {
  // Arrange
  const base = { ...PACKAGE_A, occurrences: [{ recordId: 'record', sourceIdentity: '1', origin: 'public', queryEligible: true }] };
  const first = await queryOsv([base], { maxPages: 1, fetchImpl: async () => new Response('{"results":[{"vulns":[{"id":"GHSA-old"}],"next_page_token":"old-token"}]}') });
  const bodies = [];
  const fetchImpl = async (_url, init) => { bodies.push(JSON.parse(init.body)); return new Response('{"results":[{}]}'); };
  // Act
  const changed = await queryOsv([{ ...base, occurrences: [{ recordId: 'record', sourceIdentity: '2', origin: 'public', queryEligible: true }] }], { fetchImpl, previous: first.continuation, continuationVerified: true });
  const expired = await queryOsv([base], { fetchImpl, previous: { ...first.continuation, cycleStartedAt: '2000-01-01T00:00:00Z' }, continuationVerified: true });
  const unverified = await queryOsv([base], { fetchImpl, previous: first.continuation });
  // Assert
  assert.deepEqual(bodies.map(body => Object.hasOwn(body.queries[0], 'page_token')), [false, false, false]);
  assert.deepEqual([changed.findings, expired.findings, unverified.findings], [[], [], []]);
});

test('完了した陰性を次回の新しい巡回へ使い回さない', async () => {
  // Arrange
  let calls = 0;
  const fetchImpl = async () => new Response(JSON.stringify({ results: [++calls === 1 ? {} : { vulns: [{ id: 'GHSA-new' }] }] }));
  // Act
  const first = await queryOsv([PACKAGE_A], { fetchImpl });
  const second = await queryOsv([PACKAGE_A], { fetchImpl, previous: first.continuation, continuationVerified: true });
  // Assert
  assert.equal(calls, 2);
  assert.deepEqual(first.findings, []);
  assert.equal(second.findings[0].id, 'GHSA-new');
});

test('1件枠の先頭が失敗し続けても次のqueryへ処理枠を回す', async () => {
  // Arrange
  const names = [];
  const fetchImpl = async (_url, init) => { const name = JSON.parse(init.body).queries[0].package.name; names.push(name); return name === 'first' ? new Response('{}', { status: 400 }) : new Response('{"results":[{}]}'); };
  // Act
  const first = await queryOsv([PACKAGE_A, PACKAGE_B], { fetchImpl, maxPackages: 1 });
  const second = await queryOsv([PACKAGE_A, PACKAGE_B], { fetchImpl, maxPackages: 1, previous: first.continuation, continuationVerified: true });
  // Assert
  assert.deepEqual(names, ['first', 'second']);
  assert.deepEqual(second.successfulKeys, ['npm:second:2.0.0']);
  assert.deepEqual(second.continuation.pendingPackageKeys, ['npm:first:1.0.0']);
});

test('公開recordと同名同版の私有recordは統合後も別々の資格を保持する', async t => {
  // Arrange
  const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'sweep-origin-')));
  const root = path.join(home, 'Projects'); await fs.mkdir(root);
  const file = path.join(root, 'package-lock.json');
  await fs.writeFile(file, JSON.stringify({ lockfileVersion: 3, packages: {
    'node_modules/example': { version: '1.0.0', resolved: 'https://registry.npmjs.org/example/-/example-1.0.0.tgz' },
    'nested/node_modules/example': { version: '1.0.0', resolved: 'https://user:SENTINEL_SECRET@private.example/package.tgz' },
  } }));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const payloads = [];
  const fetchImpl = async (_url, init) => { payloads.push(JSON.parse(init.body)); return new Response('{"results":[{"vulns":[{"id":"GHSA-example"}]}]}'); };
  // Act
  const result = await scanPackages({ lockfiles: [{ path: file }], scanRoots: [root] }, { home, fetchImpl, noScanner: true, inspectInstallations: false });
  // Assert
  assert.deepEqual(payloads, [{ queries: [{ package: { name: 'example', ecosystem: 'npm' }, version: '1.0.0' }] }]);
  assert.deepEqual(result.findings[0].occurrences.map(record => record.queryEligible), [true, false]);
  assert.equal(new Set(result.records.map(record => record.recordId)).size, 2);
  assert.equal(JSON.stringify(result).includes('SENTINEL'), false);
});

test('同じ未知名でもglobal例外だけを既定許可しopt-out時は何も送らない', async t => {
  // Arrange
  const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'sweep-global-')));
  const root = path.join(home, 'Projects'); await fs.mkdir(root);
  const file = path.join(root, 'package-lock.json');
  await fs.writeFile(file, '{"lockfileVersion":3,"packages":{"node_modules/@internal/fixture":{"version":"1.0.0"}}}');
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const globalPackages = [{ name: '@internal/fixture', version: '1.0.0', ecosystem: 'npm', token: 'SENTINEL_SECRET' }];
  const payloads = [];
  const fetchImpl = async (_url, init) => { payloads.push(JSON.parse(init.body)); return new Response('{"results":[{}]}'); };
  const inventory = { scanRoots: [root], lockfiles: [{ path: file }], globalPackages };
  // Act
  const first = await scanPackages(inventory, { home, fetchImpl, noScanner: true });
  const second = await scanPackages(inventory, { home, fetchImpl, noScanner: true, queryUnknownGlobals: false });
  // Assert
  assert.deepEqual(payloads, [{ queries: [{ package: { name: '@internal/fixture', ecosystem: 'npm' }, version: '1.0.0' }] }]);
  assert.deepEqual(first.records.map(record => record.queryEligible), [false, true]);
  assert.equal(second.packages.length, 0);
  assert.equal(second.records[1].origin, 'unknown');
  assert.equal(second.records[1].policyExcluded, true);
  assert.equal(second.records[1].exclusion, 'unknown-global-opt-out');
  assert.equal(assessmentStatus(second.coverage), 'partial'); // 未確認lockはglobalのopt-outと別に残す。
  assert.equal(JSON.stringify([first, second, payloads]).includes('SENTINEL'), false);
});

test('未知globalだけをopt-outした巡回は由来を保って方針除外として完了する', async () => {
  // Arrange
  const inventory = { globalPackages: [{ name: 'fixture-unknown', version: '1.0.0', ecosystem: 'npm', origin: 'unknown' }] };
  const payloads = [];
  const fetchImpl = async (_url, init) => { payloads.push(JSON.parse(init.body)); return new Response('{"results":[{}]}'); };
  // Act
  const enabled = await scanPackages(inventory, { fetchImpl, noScanner: true });
  const optedOut = await scanPackages(inventory, { fetchImpl, noScanner: true, queryUnknownGlobals: false });
  // Assert
  assert.equal(assessmentStatus(enabled.coverage), 'partial');
  assert.equal(assessmentStatus(optedOut.coverage), 'complete-with-exclusions');
  assert.deepEqual(optedOut.records.map(record => [record.origin, record.queryEligible, record.policyExcluded, record.originException]), [['unknown', false, true, false]]);
  assert.deepEqual(payloads, [{ queries: [{ package: { name: 'fixture-unknown', ecosystem: 'npm' }, version: '1.0.0' }] }]);
  assert.deepEqual(optedOut.coverage.filter(item => ['global-package-origins', 'package-extraction'].includes(item.area)).map(item => item.status), ['complete-with-exclusions', 'complete-with-exclusions']);
});

test('既知の非公開globalと不正metadataを同じ除外理由へまとめない', async () => {
  // Arrange
  const globalPackages = ['private', 'git', 'local'].map(origin => ({ name: `fixture-${origin}`, version: '1.0.0', ecosystem: 'npm', origin }));
  let requests = 0;
  const fetchImpl = async () => { requests += 1; return new Response('{}'); };
  // Act
  const excluded = await scanPackages({ globalPackages }, { fetchImpl, noScanner: true });
  const invalid = await scanPackages({ globalPackages: [...globalPackages, { name: 'fixture-invalid', version: '^1.0.0', ecosystem: 'npm' }] }, { fetchImpl, noScanner: true, queryUnknownGlobals: false });
  // Assert
  assert.equal(assessmentStatus(excluded.coverage), 'complete-with-exclusions');
  assert.deepEqual(excluded.records.map(record => [record.origin, record.policyExcluded]), [['private', true], ['git', true], ['local', true]]);
  assert.equal(assessmentStatus(invalid.coverage), 'partial');
  assert.equal(invalid.coverage.find(item => item.area === 'global-package-origins').invalid, 1);
  assert.equal(invalid.coverage.find(item => item.area === 'package-extraction').invalid, 1);
  assert.equal(requests, 0);
});

test('改変したparsed cacheやscannerのsource省略で私有Composer名を送信しない', async t => {
  // Arrange
  const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'sweep-scanner-')));
  const root = path.join(home, 'Projects'); await fs.mkdir(root);
  const file = path.join(root, 'composer.lock');
  await fs.writeFile(file, '{"packages":[{"name":"private/example","version":"1.0.0","source":{"type":"git","url":"https://github.com/private/SENTINEL_SECRET.git"}}]}');
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const requests = [], commands = [];
  const context = createRunContext({ home, config: { scanRoots: [root] }, toolResolver: async operation => ({ path: `/trusted/${operation}` }),
    executeImpl: async (_file, args, options) => { if (_file.endsWith('/stat')) { const metadata = await fs.lstat(args[2]); return { code: 0, stdout: `${metadata.dev}:${metadata.ino}:0` }; }
      commands.push({ args, fd: options.inputFd }); return args[0] === '--version' ? { code: 0, stdout: 'osv-scanner version 2.7.0' }
      : { code: 1, stdout: '{"results":[{"packages":[{"package":{"name":"private/example","version":"1.0.0","ecosystem":"Packagist","purl":"pkg:composer/private/example@1.0.0"}}]}]}' }; },
    fetchImpl: async (_url, init) => { requests.push(init.body); return new Response('{"results":[]}'); } });
  context.continuationVerified = true;
  // Act
  const first = await scanPackages({ scanRoots: [root], lockfiles: [{ path: file }] }, { context, inspectInstallations: false });
  first.continuation.parsedFiles[0].records = [{ name: 'private/example', version: '1.0.0', ecosystem: 'Packagist', origin: 'public', queryEligible: true }];
  const second = await scanPackages({ scanRoots: [root], lockfiles: [{ path: file }] }, { context, previous: first.continuation, noScanner: true, inspectInstallations: false });
  await context.close();
  // Assert
  assert.deepEqual(requests, []);
  assert.deepEqual(second.packages, []);
  assert.equal(commands[1].args.at(-1), 'composer.lock:/dev/fd/3');
  assert.equal(Number.isInteger(commands[1].fd), true);
  assert.equal(JSON.stringify([first.records, second]).includes('SENTINEL'), false);
});

test('未知の応答IDやネストした秘密例外は保存しない', async () => {
  // Arrange
  const fetchImpl = async () => { const error = new Error('SENTINEL_MESSAGE'); error.cause = { secret: 'SENTINEL_CAUSE' }; throw error; };
  // Act
  const failed = await queryOsv([PACKAGE_A], { fetchImpl });
  const malformed = await queryOsv([PACKAGE_A], { fetchImpl: async () => new Response('{"results":[{"vulns":[{"id":"https://secret/SENTINEL_ID"}]}]}') });
  // Assert
  assert.equal(failed.coverage.at(-1).status, 'partial');
  assert.equal(malformed.coverage.at(-1).status, 'partial');
  assert.equal(JSON.stringify([failed, malformed]).includes('SENTINEL'), false);
});

test('独立した100件batchを2本で進めHTTP全体とhost上限を共有する', async () => {
  // Arrange
  const packages = Array.from({ length: 201 }, (_, index) => ({ name: `package-${String(index).padStart(3, '0')}`, version: '1.0.0', ecosystem: 'npm' }));
  let active = 0, peak = 0;
  const sizes = [];
  const context = createRunContext({ fetchImpl: async (_url, init) => {
    const queries = JSON.parse(init.body).queries; sizes.push(queries.length); active += 1; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 5)); active -= 1;
    return new Response(JSON.stringify({ results: queries.map(() => ({})) }));
  } });
  // Act
  const result = await queryOsv(packages, { context }); await context.close();
  // Assert
  assert.deepEqual(sizes, [100, 100, 1]);
  assert.equal(peak, 2);
  assert.equal(context.metrics.http.peak, 2);
  assert.equal(context.metrics.hosts['api.osv.dev'].peak, 2);
  assert.equal(result.successfulKeys.length, 201);
});

test('ファイルのackは全queryページ成功後だけ公開し次の探索batchを解放する', async t => {
  // Arrange
  const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'sweep-ack-')));
  const root = path.join(home, 'Projects'); await fs.mkdir(root);
  const file = path.join(root, 'package-lock.json');
  await fs.writeFile(file, '{"lockfileVersion":3,"packages":{"node_modules/example":{"version":"1.0.0","resolved":"https://registry.npmjs.org/example.tgz"}}}');
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const fetchImpl = async (_url, init) => new Response(JSON.stringify({ results: [JSON.parse(init.body).queries[0].page_token ? {} : { next_page_token: 'next' }] }));
  const inventory = { scanRoots: [root], lockfiles: [{ path: file }] };
  // Act
  const first = await scanPackages(inventory, { home, fetchImpl, noScanner: true, maxPages: 1, inspectInstallations: false });
  const second = await scanPackages(inventory, { home, fetchImpl, noScanner: true, maxPages: 1, inspectInstallations: false, previous: first.continuation, continuationVerified: true });
  // Assert
  assert.deepEqual(first.continuation.acknowledgedLockfiles, []);
  assert.equal(second.continuation.acknowledgedLockfiles.length, 1);
  assert.equal(second.continuation.acknowledgedLockfiles[0].path, file);
  assert.equal(second.continuation.acknowledgedLockfiles[0].sourceIdentity, second.records[0].sourceIdentity);
});

test('Macのglobal実物と画像SBOMを照合後も異なる影響種別として報告する', async () => {
  // Arrange
  const inventory = {
    globalPackages: [{ name: 'host-package', version: '1.0.0', ecosystem: 'npm', publicRegistry: true, evidence: '/synthetic/package.json' }],
    sbomPackages: [{ name: 'image-package', version: '1.0.0', ecosystem: 'npm', publicRegistry: true, origin: 'public', imageDigest: `sha256:${'a'.repeat(64)}`, recordId: 'component', evidence: '/synthetic/bom.json' }],
  };
  const context = createRunContext({ platform: 'darwin', fetchImpl: async (_url, init) => new Response(JSON.stringify({ results: JSON.parse(init.body).queries.map(query => ({ vulns: [{ id: `GHSA-${query.package.name}` }] })) })) });
  // Act
  const packages = await scanPackages(inventory, { context, noScanner: true, inspectInstallations: false });
  const result = matchInventory(inventory, { items: [] }, { packages }); await context.close();
  // Assert
  assert.equal(result.findings.find(finding => finding.package?.name === 'host-package').impact.kind, 'installed-affected');
  assert.equal(result.findings.find(finding => finding.package?.name === 'image-package').impact.kind, 'image-record-affected');
  assert.equal(result.findings.find(finding => finding.package?.name === 'image-package').impact.installationConfirmed, false);
  assert.equal(result.impact, 'compromise-unconfirmed');
});

test('公開lockと同名同版でもprivate globalは実物確認へ転用しない', async t => {
  // Arrange
  const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'sweep-private-impact-')));
  const root = path.join(home, 'Projects'); await fs.mkdir(root);
  const file = path.join(root, 'package-lock.json');
  await fs.writeFile(file, '{"lockfileVersion":3,"packages":{"node_modules/example":{"version":"1.0.0","resolved":"https://registry.npmjs.org/example.tgz"}}}');
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const inventory = { scanRoots: [root], lockfiles: [{ path: file }], globalPackages: [{ name: 'example', version: '1.0.0', ecosystem: 'npm', private: true }] };
  const context = createRunContext({ home, platform: 'darwin', config: { scanRoots: [root] }, fetchImpl: async () => new Response('{"results":[{"vulns":[{"id":"GHSA-example"}]}]}') });
  // Act
  const packages = await scanPackages(inventory, { context, noScanner: true, inspectInstallations: false });
  const result = matchInventory(inventory, { items: [] }, { packages }); await context.close();
  // Assert
  assert.equal(result.findings.find(finding => finding.package?.name === 'example').impact.kind, 'declared-only');
  assert.deepEqual(packages.findings[0].occurrences.map(record => record.queryEligible), [true, false]);
});
