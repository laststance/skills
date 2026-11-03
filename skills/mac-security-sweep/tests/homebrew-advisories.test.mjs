import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compareBrewVersions, parseBrewAdvisory, fetchHomebrewAdvisories, matchHomebrew } from '../scripts/homebrew-advisories.mjs';
import { createRunContext } from '../scripts/runtime.mjs';
import { aggregateAdvisories } from '../scripts/assessment.mjs';
import { HOMEBREW_RECENT_COMMITS, validateSourceRequest } from '../scripts/source-request-policy.mjs';

const NOW = Date.parse('2026-11-03T00:00:00Z');
const RECORD = {
  schema_version: '1.7.3', id: 'BREW-openssl-CVE-2026-1111', upstream: ['CVE-2026-1111'], modified: '2026-11-02T00:00:00Z',
  affected: [{ package: { ecosystem: 'Homebrew', name: 'openssl', purl: 'pkg:brew/openssl' }, ranges: [{ type: 'ECOSYSTEM', events: [{ introduced: '0' }, { fixed: '3.0.1_2' }] }], ecosystem_specific: { fix: 'patch', patches: [{ url: 'https://example.org/patch' }] } }],
};

test('Homebrewの同じupstream版でもrevision順に修正境界を比較する', () => {
  // Arrange / Act
  const lower = compareBrewVersions('3.0.1_1', '3.0.1_2');
  const higher = compareBrewVersions('3.0.2', '3.0.1_9');
  // Assert
  assert.equal(lower, -1);
  assert.equal(higher, 1);
  assert.equal(compareBrewVersions('3.0.1', '3.0.1_0'), 0);
  assert.equal(compareBrewVersions('3.0.1beta', '3.0.1_2'), null);
});

test('DBの生成時境界未到達を脆弱確定にせず到達版だけ当該記録修正済みとする', () => {
  // Arrange
  const database = { records: [parseBrewAdvisory(RECORD)], status: 'complete' };
  const inventory = { homebrew: { formulae: [{ name: 'openssl', tap: 'homebrew/core', installed: [{ version: '3.0.1', revision: 1 }, { version: '3.0.1', revision: 2 }] }] } };
  // Act
  const result = matchHomebrew(inventory, database);
  // Assert
  assert.deepEqual(result.findings.map(finding => finding.status), ['可能性あり', '影響なし']);
  assert.match(result.findings[0].reason, /最初の修正版とは限らない/);
  assert.equal(result.findings[1].version, '3.0.1_2');
  assert.equal(result.findings[1].impact.kind, 'fixed-for-record');
});

test('同じinstalled receiptで適用済みpatchがCVEを解消するときだけbackportを認める', () => {
  // Arrange
  const database = { records: [parseBrewAdvisory(RECORD)], status: 'complete' };
  const installed = { version: '3.0.1', revision: 1, patches: [{ applied: true, resolves: ['CVE-2026-1111'] }] };
  // Act
  const unverified = matchHomebrew({ homebrew: { formulae: [{ name: 'openssl', tap: 'homebrew/core', installed: [installed] }] } }, database);
  const verified = matchHomebrew({ homebrew: { formulae: [{ name: 'openssl', tap: 'homebrew/core', installed: [{ ...installed, receiptVerified: true }] }] } }, database);
  // Assert
  assert.equal(unverified.findings[0].status, '可能性あり');
  assert.equal(verified.findings[0].status, '影響なし');
  assert.match(verified.findings[0].reason, /適用済みpatch/);
});

test('custom tap・cask・未収録formulaは全件安全として扱わない', () => {
  // Arrange
  const inventory = { homebrew: { formulae: [{ name: 'openssl', tap: 'example/custom', version: '3.0.1' }, { name: 'unlisted', tap: 'homebrew/core', version: '1.0' }], casks: [{ name: 'example-browser', kind: 'cask' }] } };
  // Act
  const result = matchHomebrew(inventory, { records: [parseBrewAdvisory(RECORD)], status: 'complete' });
  // Assert
  assert.equal(result.findings.length, 0);
  assert.deepEqual(result.coverage.map(entry => entry.status), ['unsupported', 'partial', 'unsupported']);
});

test('Homebrew upstreamと元CVEをaliasとして統合しない', () => {
  // Arrange
  const brew = matchHomebrew({ homebrew: { formulae: [{ name: 'openssl', tap: 'homebrew/core', version: '3.0.0' }] } }, { records: [parseBrewAdvisory(RECORD)] }).findings;
  // Act
  const result = aggregateAdvisories([...brew, { id: 'other', advisoryId: 'CVE-2026-1111', package: { name: 'other', ecosystem: 'npm' }, version: '1.0' }]);
  // Assert
  assert.equal(result.uniqueAdvisoryCount, 2);
});

test('公開treeから取得したblobだけを受理し未取得レコードを次回へ継続する', async () => {
  // Arrange
  const records = [RECORD, { ...RECORD, id: 'BREW-openssl-CVE-2026-2222', upstream: ['CVE-2026-2222'] }];
  const payloads = new Map(records.map(record => [`advisories/${record.id}.json`, JSON.stringify(record)]));
  const tree = { sha: 'a'.repeat(40), truncated: false, tree: [...payloads].map(([path, text]) => ({ path, type: 'blob', size: Buffer.byteLength(text), sha: createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex') })) };
  const requested = [];
  const fetchImpl = async address => { requested.push(String(address)); return new Response(String(address).includes('/git/trees/') ? JSON.stringify(tree) : payloads.get(String(address).split('/main/')[1])); };
  const firstContext = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl });
  // Act
  const first = await fetchHomebrewAdvisories(firstContext, {}, { maxRecords: 1 });
  await firstContext.close();
  const secondContext = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl });
  const second = await fetchHomebrewAdvisories(secondContext, first.continuation, { maxRecords: 1 });
  await secondContext.close();
  // Assert
  assert.equal(first.status, 'partial');
  assert.equal(first.records.length, 1);
  assert.equal(first.continuation.pendingPaths.length, 1);
  assert.equal(second.status, 'complete');
  assert.equal(second.records.length, 2);
  assert.equal(second.continuation.pendingPaths.length, 0);
  assert.equal(requested.filter(url => url.includes('/git/trees/')).length, 2);
  assert.ok(requested.every(url => !url.includes('/Users/') && !url.includes('installed')));
});

test('別blob・未許可tree path・未知schemaは未取得を残し秘密の応答を保存しない', async () => {
  // Arrange
  const tree = { sha: 'a'.repeat(40), truncated: false, tree: [{ path: `advisories/${RECORD.id}.json`, type: 'blob', size: 1, sha: 'b'.repeat(40) }] };
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async url => new Response(String(url).includes('/git/trees/') ? JSON.stringify(tree) : 'SENTINEL_RAW_BODY') });
  // Act
  const result = await fetchHomebrewAdvisories(context);
  await context.close();
  // Assert
  assert.equal(result.status, 'partial');
  assert.equal(result.records.length, 0);
  assert.equal(result.continuation.pendingPaths.length, 1);
  assert.equal(result.diagnostics[0].cause, 'mismatch');
  assert.equal(JSON.stringify(result).includes('SENTINEL'), false);
  assert.throws(() => parseBrewAdvisory({ ...RECORD, schema_version: '9.0.0' }), error => error.diagnostic?.code === 'MSS_SOURCE');
});

test('Homebrew DB取得失敗を未収録製品の安全判定に変えない', async () => {
  // Arrange
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async () => new Response('', { status: 503 }) });
  // Act
  const database = await fetchHomebrewAdvisories(context);
  await context.close();
  const result = matchHomebrew({ homebrew: { formulae: [{ name: 'openssl', tap: 'homebrew/core', version: '3.0.1' }] } }, database);
  // Assert
  assert.equal(database.status, 'partial');
  assert.equal(database.freshness, 'missing');
  assert.equal(result.findings.length, 0);
  assert.equal(result.coverage.at(-1).status, 'partial');
});

test('先頭の恒久失敗を末尾へ回し次回以降に未試行のHomebrew記録を取得する', async () => {
  // Arrange
  const ids = ['BREW-a-CVE-2026-1111', 'BREW-b-CVE-2026-2222', 'BREW-c-CVE-2026-3333'];
  const paths = ids.map(id => `advisories/${id}.json`);
  const payloads = new Map(ids.map((id, index) => [paths[index], JSON.stringify(index === 0 ? { id, schema_version: '9.0.0', secret: 'SENTINEL_MALFORMED' } : { ...RECORD, id })]));
  const tree = { sha: 'a'.repeat(40), tree: [...payloads].map(([path, text]) => ({ path, type: 'blob', sha: createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex') })) };
  const requested = [], runs = [];
  const fetchImpl = async address => {
    if (String(address).includes('/git/trees/')) return new Response(JSON.stringify(tree));
    const path = String(address).split('/main/')[1]; requested.push(path);
    return new Response(payloads.get(path));
  };
  // Act
  let previous = {};
  for (let index = 0; index < 3; index++) {
    const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl });
    const result = await fetchHomebrewAdvisories(context, previous, { maxRecords: 1 });
    await context.close(); runs.push(result);
    previous = { ...result.continuation, pendingPaths: [...result.continuation.pendingPaths, 'advisories/SENTINEL_UNKNOWN.json', '../../SENTINEL_ESCAPE'] };
  }
  // Assert
  assert.deepEqual(requested, paths);
  assert.deepEqual(runs[0].continuation.pendingPaths, [paths[1], paths[2], paths[0]]);
  assert.deepEqual(runs[2].records.map(record => record.id), [ids[1], ids[2]]);
  assert.deepEqual(runs[2].continuation.pendingPaths, [paths[0]]);
  assert.equal(runs[2].status, 'partial');
  assert.equal(JSON.stringify(runs).includes('SENTINEL'), false);
});

test('一万件を超える公式Homebrew indexでも有限の本文取得と未処理履歴を保持する', async () => {
  // Arrange
  const record = { ...RECORD, id: 'BREW-example-00000' }, body = JSON.stringify(record);
  const sha = createHash('sha1').update(`blob ${Buffer.byteLength(body)}\0`).update(body).digest('hex');
  const tree = { sha: 'a'.repeat(40), truncated: false, tree: Array.from({ length: 16000 }, (_, index) => ({ path: `advisories/BREW-example-${String(index).padStart(5, '0')}.json`, type: 'blob', sha, size: 1000 })) };
  const calls = [];
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async url => { calls.push(String(url)); return new Response(String(url).includes('/git/trees/') ? JSON.stringify(tree) : body); } });
  // Act
  const result = await fetchHomebrewAdvisories(context, {}, { maxRecords: 1 });
  await context.close();
  // Assert
  assert.equal(result.freshness, 'fresh');
  assert.equal(result.status, 'partial');
  assert.equal(result.continuation.tree.length, 16000);
  assert.equal(result.continuation.pendingPaths.length, 15999);
  assert.deepEqual(result.records.map(value => value.id), ['BREW-example-00000']);
  assert.equal(calls.length, 2);
});

test('Homebrew indexが二万件を超えた場合は本文取得せず未確認として停止する', async () => {
  // Arrange
  const tree = { sha: 'a'.repeat(40), truncated: false, tree: Array.from({ length: 20001 }, (_, index) => ({ path: `advisories/BREW-example-${index}.json`, type: 'blob', sha: 'b'.repeat(40), size: 1000 })) };
  let calls = 0;
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async () => { calls++; return Response.json(tree); } });
  // Act
  const result = await fetchHomebrewAdvisories(context);
  await context.close();
  // Assert
  assert.equal(result.freshness, 'missing');
  assert.equal(result.status, 'partial');
  assert.equal(result.records.length, 0);
  assert.equal(result.diagnostics[0].code, 'MSS_CAPACITY');
  assert.equal(calls, 1);
});

test('Homebrewの最新変更を現在treeのblobで検証し名前順の古い告知より先に取得する', async () => {
  // Arrange
  const old = { ...RECORD, id: 'BREW-a-old', modified: '2020-01-01T00:00:00Z' }, latest = { ...RECORD, id: 'BREW-z-latest' };
  const bodies = new Map([old, latest].map(value => [`advisories/${value.id}.json`, JSON.stringify(value)]));
  const tree = { sha: 'a'.repeat(40), truncated: false, tree: [...bodies].map(([path, text]) => ({ path, type: 'blob', sha: createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex') })) };
  const commit = 'c'.repeat(40), latestPath = 'advisories/BREW-z-latest.json', fetched = [];
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async address => {
    const url = String(address);
    if (url.includes('/git/trees/')) return Response.json(tree);
    if (url === HOMEBREW_RECENT_COMMITS) return Response.json([{ sha: commit }]);
    if (url.includes(`/commits/${commit}`)) return Response.json({ sha: commit, commit: { tree: { sha: tree.sha } }, files: [{ filename: latestPath, sha: tree.tree[1].sha, status: 'modified' }] });
    const path = url.split('/main/')[1]; fetched.push(path); return new Response(bodies.get(path));
  } });
  // Act
  const index = await fetchHomebrewAdvisories(context, {}, { indexOnly: true, preferRecent: true });
  const result = await fetchHomebrewAdvisories(context, index.continuation, { maxRecords: 1, refresh: false, recentSnapshot: index.recentUpdates });
  await context.close();
  // Assert
  assert.deepEqual(fetched, ['advisories/BREW-z-latest.json']);
  assert.deepEqual(result.records.map(value => value.id), ['BREW-z-latest']);
  assert.deepEqual(result.continuation.pendingPaths, ['advisories/BREW-a-old.json']);
  assert.equal(index.recentUpdates.indexStatus, 'complete');
  assert.equal(index.recentUpdates.status, 'partial');
  assert.equal(index.recentUpdates.pending, 1);
  assert.equal(result.recentUpdates.status, 'complete');
  assert.equal(result.recentUpdates.contentFetched, 1);
  assert.equal(index.recentUpdates.commit, commit);
});

test('Homebrewの最新commitが現在treeと食い違う場合やファイルページが残る場合は未確認を保持する', async () => {
  // Arrange
  const path = 'advisories/BREW-example.json', commit = 'c'.repeat(40), blob = 'b'.repeat(40);
  const tree = { sha: 'a'.repeat(40), truncated: false, tree: [{ path, type: 'blob', sha: blob }] };
  const run = async ({ mismatch, next }) => {
    const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async address => {
      const url = String(address);
      if (url.includes('/git/trees/')) return Response.json(tree);
      if (url === HOMEBREW_RECENT_COMMITS) return Response.json([{ sha: commit }]);
      return Response.json({ sha: commit, commit: { tree: { sha: tree.sha } }, files: [{ filename: path, sha: mismatch ? 'd'.repeat(40) : blob }] }, { headers: next ? { link: '<https://api.github.com/next>; rel="next"' } : {} });
    } });
    try { return await fetchHomebrewAdvisories(context, {}, { indexOnly: true, preferRecent: true }); } finally { await context.close(); }
  };
  // Act
  const mismatch = await run({ mismatch: true });
  const paged = await run({ next: true });
  // Assert
  assert.equal(mismatch.recentUpdates.status, 'partial');
  assert.deepEqual(mismatch.recentUpdates.paths, []);
  assert.equal(mismatch.diagnostics[0].cause, 'mismatch');
  assert.equal(paged.recentUpdates.status, 'partial');
  assert.equal(paged.recentUpdates.reasonCode, 'LATEST_COMMIT_FILE_LIMIT');
  assert.deepEqual(paged.recentUpdates.paths, [path]);
});

test('Homebrew commit本文は直前の公式一覧のSHAだけを許可し任意repositoryや追加pageへ接続しない', () => {
  // Arrange
  const sha = 'a'.repeat(40), options = { authorizedCommits: new Set([sha]) };
  // Act / Assert
  assert.equal(validateSourceRequest(HOMEBREW_RECENT_COMMITS), true);
  assert.equal(validateSourceRequest(`https://api.github.com/repos/Homebrew/advisory-database/commits/${sha}?per_page=100`, options), true);
  assert.equal(validateSourceRequest(`https://api.github.com/repos/Homebrew/advisory-database/commits/${sha}?per_page=100`), false);
  assert.equal(validateSourceRequest(`https://api.github.com/repos/attacker/advisory-database/commits/${sha}?per_page=100`, options), false);
  assert.equal(validateSourceRequest(`https://api.github.com/repos/Homebrew/advisory-database/commits/${sha}?per_page=100&page=2`, options), false);
});

test('Homebrewの最新変更が八十本文を超える場合は最新変更全体を取得済みにしない', async () => {
  // Arrange
  const commit = 'c'.repeat(40), sha = 'b'.repeat(40);
  const tree = { sha: 'a'.repeat(40), tree: Array.from({ length: 81 }, (_, index) => ({ path: `advisories/BREW-example-${index}.json`, type: 'blob', sha })) };
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async address => {
    const url = String(address);
    if (url.includes('/git/trees/')) return Response.json(tree);
    if (url === HOMEBREW_RECENT_COMMITS) return Response.json([{ sha: commit }]);
    return Response.json({ sha: commit, commit: { tree: { sha: tree.sha } }, files: tree.tree.map(entry => ({ filename: entry.path, sha })) });
  } });
  // Act
  const result = await fetchHomebrewAdvisories(context, {}, { indexOnly: true, preferRecent: true });
  await context.close();
  // Assert
  assert.equal(result.recentUpdates.indexStatus, 'complete');
  assert.equal(result.recentUpdates.status, 'partial');
  assert.equal(result.recentUpdates.reasonCode, 'LATEST_COMMIT_RECORD_LIMIT');
  assert.equal(result.recentUpdates.pending, 81);
  assert.equal(result.coverage.find(value => value.area === 'homebrew-latest-changes').status, 'partial');
});
