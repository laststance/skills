import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { scanPackages } from '../scripts/scan-packages.mjs';
import { runSweep } from '../scripts/run-sweep.mjs';
import { inventory } from '../scripts/inventory.mjs';
import { enrichAdvisories } from '../scripts/advisory-details.mjs';
import { matchInventory } from '../scripts/match.mjs';
import { within } from '../scripts/safe-io.mjs';

/** 合成lockだけを作り、件数ページの回帰から同じ安全なreaderを通す。
 * @example await lockFixture(t, [['first', 3], ['second', 3]])
 */
async function lockFixture(t, entries) {
  const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mss-record-page-')));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const root = path.join(home, 'Projects');
  await fs.mkdir(root);
  const lockfiles = [];
  for (const [prefix, count] of entries) {
    const directory = path.join(root, prefix);
    await fs.mkdir(directory);
    const file = path.join(directory, 'package-lock.json');
    const packages = Object.fromEntries(Array.from({ length: count }, (_, index) => {
      const name = `${prefix}-${String(index).padStart(5, '0')}`;
      return [`node_modules/${name}`, { version: '1.0.0', resolved: `https://registry.npmjs.org/${name}/-/${name}-1.0.0.tgz` }];
    }));
    await fs.writeFile(file, JSON.stringify({ lockfileVersion: 3, packages }, null, 2));
    lockfiles.push({ path: file });
  }
  return { home, inventory: { scanRoots: [root], lockfiles }, options: { home, noScanner: true, inspectInstallations: false } };
}

test('lockの累積が15000件を超えても先行分と324件のglobalを照会して残りを次回へ保持する', async t => {
  // Arrange
  const fixture = await lockFixture(t, [['alpha', 6000], ['bravo', 6000], ['charlie', 3275]]);
  fixture.inventory.globalPackages = Array.from({ length: 324 }, (_, index) => ({ name: `z-global-${String(index).padStart(3, '0')}`, version: '1.0.0', ecosystem: 'npm', publicRegistry: true }));
  const sent = [];
  const fetchImpl = async (_url, init) => {
    const { queries } = JSON.parse(init.body); sent.push(...queries.map(query => query.package.name));
    assert.equal(init.body.includes(fixture.home), false);
    return Response.json({ results: queries.map(() => ({})) });
  };
  // Act
  const result = await scanPackages(fixture.inventory, { ...fixture.options, fetchImpl, maxPages: 4 });
  // Assert
  assert.equal(result.records.length, 12324);
  assert.equal(result.packages.length, 12324);
  assert.equal(sent.length, 400);
  assert.equal(sent.slice(0, 324).every(name => name.startsWith('z-global-')), true);
  assert.deepEqual(result.continuation.pendingLockfiles, [fixture.inventory.lockfiles[2].path]);
  assert.equal(result.continuation.recordPage.nextGlobalOffset, 324);
  assert.equal(result.continuation.recordPage.pendingGlobals, 0);
  assert.equal(result.coverage.some(item => item.diagnostic?.code === 'MSS_CAPACITY'), false);
  assert.equal(result.coverage.find(item => item.area === 'package-record-page').status, 'partial');
});

test('照会と詳細が終わるまで同じページと陽性を保持し成功済み照会を繰り返さず次のlockへ進む', async t => {
  // Arrange
  const fixture = await lockFixture(t, [['alpha', 3], ['bravo', 3], ['charlie', 3]]);
  fixture.inventory.globalPackages = [{ name: 'z-global', version: '1.0.0', ecosystem: 'npm', publicRegistry: true }];
  fixture.inventory.sbomPackages = [{ name: 'z-image', version: '1.0.0', ecosystem: 'npm', origin: 'public', publicRegistry: true, imageDigest: `sha256:${'a'.repeat(64)}` }];
  const requests = [];
  const fetchImpl = async (_url, init) => {
    const { queries } = JSON.parse(init.body); requests.push(queries.map(query => [query.package.name, query.page_token || null]));
    return Response.json({ results: queries.map(query => query.package.name === 'z-global'
      ? query.page_token ? { vulns: [{ id: 'GHSA-global-second' }] } : { vulns: [{ id: 'GHSA-global-first' }], next_page_token: 'global-page-2' }
      : query.package.name === 'alpha-00000' ? { vulns: [{ id: 'GHSA-lock-first' }] } : {}) });
  };
  const options = { ...fixture.options, maxRecords: 5, maxPages: 1, fetchImpl, continuationVerified: true };
  // Act
  const first = await scanPackages(fixture.inventory, options);
  const second = await scanPackages(fixture.inventory, { ...options, continuation: first.continuation, state: { advisoryContinuation: { pendingIds: ['GHSA-global-first'] } } });
  const waitingForDetails = await scanPackages(fixture.inventory, { ...options, continuation: second.continuation, state: { advisoryContinuation: { pendingIds: ['GHSA-global-first'] } } });
  const next = await scanPackages(fixture.inventory, { ...options, continuation: waitingForDetails.continuation });
  const last = await scanPackages(fixture.inventory, { ...options, continuation: next.continuation });
  // Assert
  assert.deepEqual(requests, [
    [['z-global', null], ['z-image', null], ['alpha-00000', null], ['alpha-00001', null], ['alpha-00002', null]],
    [['z-global', 'global-page-2']],
    [['bravo-00000', null], ['bravo-00001', null], ['bravo-00002', null]],
    [['charlie-00000', null], ['charlie-00001', null], ['charlie-00002', null]],
  ]);
  assert.equal(first.continuation.catalogSignature, second.continuation.catalogSignature);
  assert.equal(second.continuation.catalogSignature, waitingForDetails.continuation.catalogSignature);
  assert.deepEqual(waitingForDetails.findings.map(item => item.id).sort(), ['GHSA-global-first', 'GHSA-global-second', 'GHSA-lock-first']);
  assert.deepEqual([first, second, waitingForDetails, next, last].map(item => item.continuation.acknowledgedLockfiles.length), [1, 1, 1, 2, 3]);
  assert.deepEqual(last.continuation.pendingLockfiles, []);
  assert.equal(last.continuation.recordPage.globalOffset, 1);
  assert.equal(last.continuation.recordPage.sbomOffset, 1);
  assert.equal(last.continuation.recordPage.pendingGlobals, 0);
  assert.equal(last.continuation.recordPage.pendingSboms, 0);
});

test('globalとSBOMがページ上限を超えても有限のoffsetで進み保留lockまで到達する', async t => {
  // Arrange
  const fixture = await lockFixture(t, [['lock', 2]]);
  fixture.inventory.globalPackages = Array.from({ length: 7 }, (_, index) => ({ name: `global-${index}`, version: '1.0.0', ecosystem: 'npm', publicRegistry: true }));
  fixture.inventory.sbomPackages = Array.from({ length: 5 }, (_, index) => ({ name: `image-${index}`, version: '1.0.0', ecosystem: 'npm', publicRegistry: true, origin: 'public', imageDigest: `sha256:${'a'.repeat(64)}` }));
  const requests = [], pages = [];
  const fetchImpl = async (_url, init) => { const { queries } = JSON.parse(init.body); requests.push(queries.map(query => query.package.name)); return Response.json({ results: queries.map(() => ({})) }); };
  // Act
  let continuation;
  for (let run = 0; run < 4; run += 1) {
    const result = await scanPackages(fixture.inventory, { ...fixture.options, maxRecords: 4, fetchImpl, continuation, continuationVerified: true });
    continuation = result.continuation;
    pages.push([result.records.length, continuation.recordPage.nextGlobalOffset, continuation.recordPage.nextSbomOffset, continuation.pendingLockfiles.length]);
  }
  // Assert
  assert.deepEqual(pages, [[4, 4, 0, 1], [4, 7, 1, 1], [4, 7, 5, 1], [2, 7, 5, 0]]);
  assert.deepEqual(requests, [['global-0', 'global-1', 'global-2', 'global-3'], ['global-4', 'global-5', 'global-6', 'image-0'], ['image-1', 'image-2', 'image-3', 'image-4'], ['lock-00000', 'lock-00001']]);
  assert.equal(continuation.acknowledgedLockfiles.length, 1);
  assert.deepEqual(continuation.pendingPackageKeys, []);
});

test('観測日時の変化ではページを巻き戻さずmetadataの版が変わったら先頭から再確認する', async () => {
  // Arrange
  const globals = ['first', 'second', 'third'].map(name => ({ name, version: '1.0.0', ecosystem: 'npm', publicRegistry: true, observedAt: '2026-11-03T00:00:00Z' }));
  const sent = [];
  const fetchImpl = async (_url, init) => { const { queries } = JSON.parse(init.body); sent.push(queries.map(query => [query.package.name, query.version])); return Response.json({ results: queries.map(() => ({})) }); };
  const options = { noScanner: true, inspectInstallations: false, maxRecords: 1, fetchImpl, continuationVerified: true };
  // Act
  const first = await scanPackages({ globalPackages: globals }, options);
  const timestampOnly = await scanPackages({ globalPackages: globals.map(pkg => ({ ...pkg, observedAt: '2026-11-04T00:00:00Z' })) }, { ...options, continuation: first.continuation });
  const changed = await scanPackages({ globalPackages: globals.map((pkg, index) => ({ ...pkg, version: index === 0 ? '2.0.0' : pkg.version })) }, { ...options, continuation: timestampOnly.continuation });
  // Assert
  assert.deepEqual(sent, [[['first', '1.0.0']], [['second', '1.0.0']], [['first', '2.0.0']]]);
  assert.equal(first.continuation.recordPage.metadataSignature, timestampOnly.continuation.recordPage.metadataSignature);
  assert.notEqual(timestampOnly.continuation.recordPage.metadataSignature, changed.continuation.recordPage.metadataSignature);
  assert.equal(timestampOnly.continuation.recordPage.globalOffset, 1);
  assert.equal(changed.continuation.recordPage.globalOffset, 0);
});

test('前ページのglobalとSBOMの由来未確認を後続ページで確認済みに変えない', async () => {
  // Arrange
  const inventory = {
    globalPackages: [{ name: 'global-unknown', version: '1.0.0', ecosystem: 'npm' }, { name: 'global-public', version: '1.0.0', ecosystem: 'npm', publicRegistry: true }],
    sbomPackages: [{ name: 'image-unknown', version: '1.0.0', ecosystem: 'npm', imageDigest: `sha256:${'a'.repeat(64)}` },
      { name: 'image-public', version: '1.0.0', ecosystem: 'npm', publicRegistry: true, origin: 'public', imageDigest: `sha256:${'a'.repeat(64)}` }],
  };
  const fetchImpl = async (_url, init) => Response.json({ results: JSON.parse(init.body).queries.map(() => ({})) });
  const coverage = []; let continuation;
  // Act
  for (let run = 0; run < 4; run += 1) {
    const result = await scanPackages(inventory, { noScanner: true, inspectInstallations: false, maxRecords: 1, fetchImpl, continuation, continuationVerified: true });
    continuation = result.continuation;
    coverage.push([result.coverage.find(item => item.area === 'global-package-origins').status, result.coverage.find(item => item.area === 'sbom-packages').status]);
  }
  // Assert
  assert.deepEqual(coverage, [['partial', 'partial'], ['partial', 'partial'], ['partial', 'partial'], ['partial', 'partial']]);
  assert.equal(continuation.recordPage.pendingGlobals, 0);
  assert.equal(continuation.recordPage.pendingSboms, 0);
});

test('単一lockが15000件を超えたら未対応を明示し他のlockを止めず無限保留にしない', async t => {
  // Arrange
  const fixture = await lockFixture(t, [['large', 15001], ['small', 1]]);
  const sent = [];
  const fetchImpl = async (_url, init) => { const { queries } = JSON.parse(init.body); sent.push(...queries.map(query => query.package.name)); return Response.json({ results: queries.map(() => ({})) }); };
  // Act
  const result = await scanPackages(fixture.inventory, { ...fixture.options, fetchImpl });
  // Assert
  assert.deepEqual(sent, ['small-00000']);
  assert.equal(result.records.length, 1);
  assert.equal(result.coverage.find(item => item.path === fixture.inventory.lockfiles[0].path).status, 'unsupported');
  assert.equal(result.coverage.find(item => item.path === fixture.inventory.lockfiles[0].path).diagnostic.code, 'MSS_CAPACITY');
  assert.deepEqual(result.continuation.pendingLockfiles, []);
  assert.equal(result.continuation.acknowledgedLockfiles.length, 2);
});

test('完了済みページの未対応lockは次ページでも未確認として残す', async t => {
  // Arrange
  const fixture = await lockFixture(t, [['alpha', 2], ['bravo', 1], ['charlie', 1]]);
  const fetchImpl = async (_url, init) => Response.json({ results: JSON.parse(init.body).queries.map(() => ({})) });
  const options = { ...fixture.options, maxRecords: 1, fetchImpl, continuationVerified: true };
  // Act
  const first = await scanPackages(fixture.inventory, options);
  const second = await scanPackages(fixture.inventory, { ...options, continuation: first.continuation });
  // Assert
  assert.equal(first.continuation.acknowledgedLockfiles.find(item => item.path === fixture.inventory.lockfiles[0].path).status, 'unsupported');
  assert.equal(second.coverage.find(item => item.path === fixture.inventory.lockfiles[0].path).status, 'unsupported');
  assert.equal(second.continuation.acknowledgedLockfiles.length, 3);
  assert.deepEqual(second.continuation.pendingLockfiles, []);
});

test('statusのない旧ACKを完了と推定せず未確認lockを再解析する', async t => {
  // Arrange
  const fixture = await lockFixture(t, [['alpha', 1], ['bravo', 1]]);
  await fs.writeFile(fixture.inventory.lockfiles[0].path, JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/alpha-00000': { version: '1.0.0' } } }));
  const fetchImpl = async (_url, init) => Response.json({ results: JSON.parse(init.body).queries.map(() => ({})) });
  const options = { ...fixture.options, maxRecords: 1, fetchImpl, continuationVerified: true };
  // Act
  const first = await scanPackages(fixture.inventory, options);
  const legacy = structuredClone(first.continuation);
  legacy.acknowledgedLockfiles = legacy.acknowledgedLockfiles.map(({ path: file, sourceIdentity }) => ({ path: file, sourceIdentity }));
  const second = await scanPackages(fixture.inventory, { ...options, continuation: legacy });
  const third = await scanPackages(fixture.inventory, { ...options, continuation: second.continuation });
  // Assert
  assert.deepEqual(second.continuation.pendingLockfiles, [fixture.inventory.lockfiles[0].path]);
  assert.equal(third.coverage.find(item => item.path === fixture.inventory.lockfiles[0].path).status, 'partial');
  assert.equal(third.continuation.acknowledgedLockfiles.find(item => item.path === fixture.inventory.lockfiles[0].path).status, 'partial');
  assert.deepEqual(third.continuation.pendingLockfiles, []);
});

test('保存世代を跨いでも同じ照会ページを再開しACKを累積して探索を進め以前の陽性を消さない', async t => {
  // Arrange
  const fixture = await lockFixture(t, [['alpha', 1], ['bravo', 1], ['charlie', 1], ['delta', 1]]);
  const systemRoot = path.join(fixture.home, 'system'); await fs.mkdir(systemRoot);
  const stateRoot = path.join(fixture.home, '.local/state/mac-security-sweep'); await fs.mkdir(stateRoot, { recursive: true });
  await fs.writeFile(path.join(stateRoot, 'state.json'), JSON.stringify({ schemaVersion: 1, scanRoots: [{ path: '~/Projects', scope: 'personal' }] }));
  const filesystem = { ...fs,
    open: (...args) => { if (!within(fixture.home, args[0])) throw Object.assign(new Error('FIXTURE_ONLY'), { code: 'EACCES' }); return fs.open(...args); },
    opendir: async directory => {
      if (!within(fixture.home, directory)) throw Object.assign(new Error('FIXTURE_ONLY'), { code: 'EACCES' });
      // この小さな合成fixtureだけを並べ替え、OSごとのdirectory順序をテスト条件にしない。
      const entries = (await fs.readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
      return { async *[Symbol.asyncIterator]() { yield* entries; }, close: async () => {} };
    },
  };
  const requests = [], runs = [], detailed = new Set(); let run = 0;
  const fetchImpl = async (address, init) => {
    const url = new URL(address);
    if (url.pathname === '/v1/querybatch') {
      const { queries } = JSON.parse(init.body);
      assert.equal(init.body.includes(fixture.home), false);
      requests.push({ run, queries: queries.map(query => [query.package.name, query.page_token || null]) });
      return Response.json({ results: queries.map(query => ({ vulns: [{ id: `GHSA-${query.package.name}-${query.page_token ? 'second' : 'first'}` }],
        ...(query.package.name === 'z-global' && !query.page_token ? { next_page_token: 'global-page-2' } : {}) })) });
    }
    assert.equal(url.hostname, 'api.osv.dev');
    const id = url.pathname.split('/').at(-1); detailed.add(id);
    return Response.json({ id, affected: [], summary: 'Synthetic advisory' });
  };
  const stages = {
    inventory: async options => {
      const result = await inventory({ ...options, discoveryLimits: { files: 3, directories: 20, entries: 20, queue: 20 } });
      result.globalPackages = [{ name: 'z-global', version: '1.0.0', ecosystem: 'npm', publicRegistry: true, observedAt: new Date(options.context.wallNow()).toISOString() }];
      result.sbomPackages = [{ name: 'z-image', version: '1.0.0', ecosystem: 'npm', origin: 'public', publicRegistry: true, imageDigest: `sha256:${'a'.repeat(64)}` }];
      return result;
    },
    news: async () => ({ sources: [], items: [], coverage: [] }),
    adaptive: async () => ({ items: [], coverage: [] }),
    packages: (data, options) => scanPackages(data, { ...options, noScanner: true, inspectInstallations: false, maxRecords: 3, maxPages: 1 }),
    iocs: async () => ({ checks: [], coverage: [] }),
    details: (findings, deadline, fetcher, options) => enrichAdvisories(findings, deadline, fetcher, { ...options, maxDetails: 1 }),
    match: matchInventory,
  };
  // Act
  for (; run < 16; run += 1) {
    const receipt = await runSweep({ home: fixture.home, systemRoot, filesystem, stages, rules: {}, fetchImpl,
      wallNow: () => Date.parse('2026-11-04T00:00:00Z') + run * 1000,
      identityProvider: async () => ({ status: 'live', start: 'fixture', boot: 'fixture' }),
      toolResolver: async operation => ({ path: operation }), executeImpl: async () => ({ code: 1, stdout: '', stderr: '' }) });
    const evidence = JSON.parse(await fs.readFile(path.join(receipt.evidenceDirectory, 'evidence.json'), 'utf8'));
    assert.ok(evidence.packages.continuation, JSON.stringify(evidence.packages.coverage));
    runs.push(evidence);
    if (['alpha', 'bravo', 'charlie', 'delta'].every(prefix => detailed.has(`GHSA-${prefix}-00000-first`))) break;
  }
  const finalState = JSON.parse(await fs.readFile(path.join(stateRoot, 'state.json'), 'utf8'));
  // Assert
  assert.ok(run < 16);
  assert.deepEqual(requests.slice(0, 3).map(item => item.queries), [
    [['z-global', null], ['z-image', null], ['alpha-00000', null]],
    [['z-global', 'global-page-2']],
    [['bravo-00000', null], ['charlie-00000', null]],
  ]);
  const firstCatalog = runs[0].packages.continuation.catalogSignature;
  const nextRecordPage = requests[2].run;
  assert.ok(nextRecordPage > 2);
  assert.equal(runs.slice(0, nextRecordPage).every(evidence => evidence.packages.continuation.catalogSignature === firstCatalog), true);
  assert.equal(runs.some(evidence => evidence.packages.continuation.acknowledgedLockfiles.length === 3), true);
  assert.equal(runs.some(evidence => evidence.inventory.discoveryContinuation.page > 0), true);
  const retained = finalState.assessmentSnapshot.find(finding => finding.package?.name === 'alpha-00000');
  assert.ok(retained);
  assert.equal(runs.at(-1).changes.unconfirmed.some(finding => finding.package?.name === 'alpha-00000'), true);
  assert.equal(retained.queriedAt, '2026-11-04T00:00:00.000Z');
  assert.equal(retained.observedAt, '2026-11-04T00:00:03.000Z');
});
