import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichAdvisories } from '../scripts/advisory-details.mjs';
import { safeDiagnostic } from '../scripts/diagnostics.mjs';

test('aliases・修正版・severityの上限超過を完了扱いせず同じ詳細IDを保留する', async () => {
  // Arrange
  const bodies = [
    { aliases: Array.from({ length: 101 }, (_, index) => `GHSA-alias-${index}`) },
    { affected: [{ package: { name: 'fixture', ecosystem: 'npm' }, ranges: [{ events: Array.from({ length: 501 }, (_, index) => ({ fixed: `1.0.${index}` })) }] }] },
    { severity: Array.from({ length: 11 }, () => ({ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' })) },
  ];
  // Act
  const results = [];
  for (const body of bodies) results.push(await enrichAdvisories([{ id: 'GHSA-current' }], Date.now() + 10000, async () => new Response(JSON.stringify({ id: 'GHSA-current', ...body }))));
  // Assert
  for (const result of results) { assert.deepEqual(result.details, []); assert.deepEqual(result.continuation.pendingIds, ['GHSA-current']); assert.equal(result.coverage[0].status, 'partial'); assert.equal(result.diagnostics[0].code, 'MSS_CAPACITY'); }
});

test('上限を超えた継続cacheを切り捨てず明示的に拒否する', async () => {
  // Arrange
  const previous = { cache: Array.from({ length: 30001 }, () => ({ id: 'GHSA-current' })) };
  let requests = 0;
  // Act / Assert
  await assert.rejects(enrichAdvisories([{ id: 'GHSA-current' }], Date.now() + 10000, async () => { requests += 1; return new Response('{}'); }, { previous, continuationVerified: true }), error => safeDiagnostic(error).code === 'MSS_CAPACITY');
  assert.equal(requests, 0);
});

test('現在の結果にないstate-only IDは詳細の送信先にならない', async () => {
  // Arrange
  const requests = [];
  const fetchImpl = async url => { requests.push(url); return new Response('{"id":"GHSA-current","affected":[]}'); };
  const previous = { pendingIds: ['GHSA-SENTINEL_SECRET'], cache: [{ id: 'GHSA-SENTINEL_SECRET', fetchedAt: new Date().toISOString() }] };
  // Act
  const result = await enrichAdvisories([{ id: 'GHSA-current', token: 'SENTINEL_LOCAL' }], Date.now() + 10000, fetchImpl, { previous, continuationVerified: true });
  // Assert
  assert.deepEqual(requests, ['https://api.osv.dev/v1/vulns/GHSA-current']);
  assert.equal(result.details[0].id, 'GHSA-current');
  assert.equal(JSON.stringify(result).includes('SENTINEL'), false);
});

test('応答ID不一致やID省略を詳細取得完了にしない', async () => {
  // Arrange
  const bodies = [{ id: 'GHSA-other', summary: 'SENTINEL_SECRET' }, { summary: 'SENTINEL_SECRET' }];
  // Act
  const results = [];
  for (const body of bodies) results.push(await enrichAdvisories([{ id: 'GHSA-current' }], Date.now() + 10000, async () => new Response(JSON.stringify(body))));
  // Assert
  assert.deepEqual(results.map(result => result.coverage[0].status), ['partial', 'partial']);
  assert.deepEqual(results.map(result => result.continuation.pendingIds), [['GHSA-current'], ['GHSA-current']]);
  assert.equal(JSON.stringify(results).includes('SENTINEL'), false);
});

test('queryページ成功後の詳細失敗を独立して部分状態に保持する', async () => {
  // Arrange
  const findings = [{ id: 'GHSA-current' }];
  // Act
  const failed = await enrichAdvisories(findings, Date.now() + 10000, async () => new Response('{}', { status: 503 }));
  const recovered = await enrichAdvisories(findings, Date.now() + 10000, async () => new Response('{"id":"GHSA-current","affected":[]}'), { previous: failed.continuation, continuationVerified: true });
  // Assert
  assert.equal(failed.coverage[0].status, 'partial');
  assert.equal(recovered.coverage[0].status, 'complete');
  assert.deepEqual(recovered.continuation.pendingIds, []);
});

test('検証済みcacheの余分な秘密フィールドを捨て未検証cacheは再取得する', async () => {
  // Arrange
  const cache = [{ id: 'GHSA-current', fetchedAt: new Date().toISOString(), token: 'SENTINEL_SECRET', nested: { secret: 'SENTINEL_NESTED' }, severity: 'SENTINEL_SEVERITY', fixed: [] }];
  let count = 0;
  const fetchImpl = async () => { count += 1; return new Response('{"id":"GHSA-current","affected":[]}'); };
  // Act
  const trusted = await enrichAdvisories([{ id: 'GHSA-current' }], Date.now() + 10000, fetchImpl, { previous: { cache }, continuationVerified: true });
  const untrusted = await enrichAdvisories([{ id: 'GHSA-current' }], Date.now() + 10000, fetchImpl, { previous: { cache } });
  // Assert
  assert.equal(count, 1);
  assert.equal(trusted.details[0].severity, '未評価');
  assert.equal(JSON.stringify([trusted, untrusted]).includes('SENTINEL'), false);
});

test('大量の新規重大告知が加わっても以前の未処理詳細を先に進める', async () => {
  // Arrange
  const requests = [];
  const fetchImpl = async url => { requests.push(url.split('/').at(-1)); return new Response(JSON.stringify({ id: url.split('/').at(-1), affected: [] })); };
  const findings = [{ id: 'GHSA-pending-low', severity: 'LOW' }, { id: 'GHSA-new-critical', severity: { level: 'CRITICAL' } }];
  // Act
  const result = await enrichAdvisories(findings, Date.now() + 10000, fetchImpl, { maxDetails: 1, previous: { pendingIds: ['GHSA-pending-low'] }, continuationVerified: true });
  // Assert
  assert.deepEqual(requests, ['GHSA-pending-low']);
  assert.deepEqual(result.continuation.pendingIds, ['GHSA-new-critical']);
});

test('期限切れ・更新済みcacheを再取得しCVSSの方式と原値を保持する', async () => {
  // Arrange
  const previous = { cache: [{ id: 'GHSA-current', modified: '2025-01-01T00:00:00Z', fetchedAt: '2025-01-01T00:00:00Z', fixed: [] }] };
  const vector = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H';
  // Act
  const result = await enrichAdvisories([{ id: 'GHSA-current', modified: '2026-11-03T00:00:00Z' }], Date.now() + 10000,
    async () => new Response(JSON.stringify({ id: 'GHSA-current', modified: '2026-11-03T00:00:00Z', severity: [{ type: 'CVSS_V3', score: vector }], affected: [] })), { previous, continuationVerified: true });
  // Assert
  assert.equal(result.details[0].severity, vector);
  assert.deepEqual(result.details[0].severityDetails, [{ method: 'CVSS_V3', raw: vector, source: 'OSV' }]);
});

test('1件枠で失敗が続く詳細を後ろへ回して残りのIDを取得する', async () => {
  // Arrange
  const findings = [{ id: 'GHSA-first', severity: 'HIGH' }, { id: 'GHSA-second', severity: 'LOW' }];
  const requested = [];
  const fetchImpl = async url => { const id = url.split('/').at(-1); requested.push(id); return id === 'GHSA-first' ? new Response('{}', { status: 400 }) : new Response(JSON.stringify({ id, affected: [] })); };
  // Act
  const first = await enrichAdvisories(findings, Date.now() + 10000, fetchImpl, { maxDetails: 1 });
  const second = await enrichAdvisories(findings, Date.now() + 10000, fetchImpl, { maxDetails: 1, previous: first.continuation, continuationVerified: true });
  // Assert
  assert.deepEqual(requested, ['GHSA-first', 'GHSA-second']);
  assert.deepEqual(second.continuation.pendingIds, ['GHSA-first']);
  assert.equal(second.details[0].id, 'GHSA-second');
});
