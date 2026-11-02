import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReport, buildNextState, jstDate, enrichAdvisories } from '../scripts/run-sweep.mjs';

test('悪性パッケージのロック一致でも実行や窃取を確定せず封じ込めを条件付きで提案する', () => {
  // Arrange
  const match = { findings: [{ id: 'MAL-2026-1', title: 'example 1.0.0', status: '可能性高', advisoryType: 'malware', incident: true,
    package: { name: 'example', ecosystem: 'npm' }, version: '1.0.0', sources: ['https://osv.dev/vulnerability/MAL-2026-1'] }] };
  // Act
  const report = renderReport({ match });
  // Assert
  assert.match(report.split('\n')[0], /IOCの確定 0 件/);
  assert.match(report, /悪性配布の疑い/);
  assert.match(report, /ロック一致だけで隔離・失効を必須にしない/);
  assert.match(report, /実行・窃取を確定しない/);
});

test('詳細取得へのリクエストにローカルパスや秘密の追加フィールドを送信しない', async () => {
  // Arrange
  const requests = [];
  const fetchImpl = async (url, options) => { requests.push({ url, body: options.body }); return { ok: true, body: [Buffer.from('{"affected":[]}')] }; };
  // Act
  await enrichAdvisories([{ id: 'GHSA-example', evidence: ['/private/SENTINEL_PATH'], token: 'SENTINEL_SECRET' }], Date.now() + 10000, fetchImpl);
  // Assert
  assert.deepEqual(requests, [{ url: 'https://api.osv.dev/v1/vulns/GHSA-example', body: undefined }]);
});

test('詳細の再開キャッシュから未知のフィールドをレポートへ復元しない', async () => {
  // Arrange
  const previous = { cache: [{ id: 'GHSA-example', fetchedAt: new Date().toISOString(), fixed: [], token: 'SENTINEL_SECRET', body: 'SENTINEL_RAW' }] };
  const fetchImpl = async () => { throw new Error('キャッシュを使用するため呼ばれない'); };
  // Act
  const result = await enrichAdvisories([{ id: 'GHSA-example' }], Date.now() + 10000, fetchImpl, { previous });
  // Assert
  assert.equal(result.details.length, 1);
  assert.equal(JSON.stringify(result).includes('SENTINEL'), false);
});

test('80件で打ち切った告知詳細は次回に残りから取得する', async () => {
  // Arrange
  const findings = Array.from({ length: 81 }, (_, index) => ({ id: `GHSA-${String(index).padStart(3, '0')}`, package: { name: 'example', ecosystem: 'npm' }, version: '1.0.0' }));
  const requested = [];
  const fetchImpl = async url => { requested.push(url); const id = url.split('/').at(-1); return { ok: true, body: [Buffer.from(JSON.stringify({ id, summary: 'public summary', affected: [] }))] }; };
  // Act
  const first = await enrichAdvisories(findings, Date.now() + 10000, fetchImpl);
  const second = await enrichAdvisories(findings, Date.now() + 10000, fetchImpl, { previous: first.continuation });
  // Assert
  assert.equal(first.details.length, 80);
  assert.deepEqual(first.continuation.pendingIds, ['GHSA-080']);
  assert.equal(requested.length, 81);
  assert.equal(requested[80], 'https://api.osv.dev/v1/vulns/GHSA-080');
  assert.equal(second.details.length, 81);
  assert.equal(second.coverage[0].status, 'complete');
});

test('詳細取得枠は新しい軽微告知より古い重大告知へ先に使う', async () => {
  // Arrange
  const findings = [{ id: 'GHSA-new-low', severity: 'LOW', modified: '2026-11-02' }, { id: 'GHSA-old-critical', severity: 'CRITICAL', modified: '2026-01-01' }];
  const requested = [];
  const fetchImpl = async url => { requested.push(url); return { ok: true, body: [Buffer.from('{"affected":[]}')] }; };
  // Act
  await enrichAdvisories(findings, Date.now() + 10000, fetchImpl, { maxDetails: 1 });
  // Assert
  assert.deepEqual(requested, ['https://api.osv.dev/v1/vulns/GHSA-old-critical']);
});

test('告知の更新後は7日以内のキャッシュでも再取得する', async () => {
  // Arrange
  const previous = { cache: [{ id: 'GHSA-example', modified: '2026-01-01T00:00:00Z', fetchedAt: new Date().toISOString(), fixed: [] }] };
  const requested = [];
  const fetchImpl = async url => { requested.push(url); return { ok: true, body: [Buffer.from('{"modified":"2026-11-02T00:00:00Z","affected":[]}')] }; };
  // Act
  await enrichAdvisories([{ id: 'GHSA-example', modified: '2026-11-02T00:00:00Z' }], Date.now() + 10000, fetchImpl, { previous });
  // Assert
  assert.deepEqual(requested, ['https://api.osv.dev/v1/vulns/GHSA-example']);
});

test('重大告知をレポートの最初の判定へ表示する', () => {
  // Arrange
  const findings = [{ id: 'low', advisoryId: 'low', package: { name: 'minor', ecosystem: 'npm' }, version: '1.0.0', title: 'NEW_LOW', status: '可能性高', severity: 'LOW', modified: '2026-11-02' },
    { id: 'critical', advisoryId: 'critical', package: { name: 'next', ecosystem: 'npm' }, version: '16.3.5', title: 'OLD_CRITICAL', status: '可能性高', severity: 'CRITICAL', modified: '2026-01-01' }];
  // Act
  const report = renderReport({ match: { findings } });
  // Assert
  assert.ok(report.indexOf('OLD_CRITICAL') < report.indexOf('NEW_LOW'));
  assert.match(report.split('\n')[1], /感染件数ではない/);
});

test('方針上の対象外と取得失敗を分けて表示する', () => {
  // Arrange
  const coverage = [{ area: 'keys', status: 'not-read', policyExcluded: true }, { area: 'logs', status: 'unavailable' }];
  // Act
  const report = renderReport({ match: { coverage } });
  // Assert
  assert.match(report.split('\n')[1], /未確認範囲 1 件・方針上の対象外 1 件/);
  assert.match(report, /keys \| 方針上の対象外/);
  assert.match(report, /logs \| 取得失敗/);
});

test('レポート保存後のstateに再開情報と差分の基準を引き継ぐ', () => {
  // Arrange
  const news = { sources: [{ name: 'public', status: 'ok' }], window: { since: '2026-11-01', until: '2026-11-02' } };
  const progress = { packages: { continuation: { pendingLockfiles: ['/example/lock'] } }, details: { continuation: { pendingIds: ['GHSA-example'], cache: [] } }, changes: { snapshot: [{ id: 'current' }] } };
  // Act
  const next = buildNextState({}, news, '2026-11-02T00:00:00Z', '/local/report.md', 'complete-with-exclusions', progress);
  // Assert
  assert.deepEqual(next.packageContinuation.pendingLockfiles, ['/example/lock']);
  assert.deepEqual(next.advisoryContinuation.pendingIds, ['GHSA-example']);
  assert.deepEqual(next.assessmentSnapshot, [{ id: 'current' }]);
  assert.equal(next.lastRunStatus, 'complete-with-exclusions');
});

test('依存の影響版だけでは侵害や全資格情報の漏えいと報告しない', () => {
  // Arrange
  const data = { finishedAt: '2026-10-31T01:00:00Z', match: { findings: [{ id: 'GHSA-test:npm:example:1.0.0', advisoryId: 'GHSA-test', title: 'example 1.0.0', status: '可能性高', package: { name: 'example', ecosystem: 'npm' }, version: '1.0.0', incident: false, evidence: [], sources: [] }], coverage: [], newsAssessment: [] } };
  // Act
  const report = renderReport(data);
  // Assert
  assert.match(report, /^被害の有無: 侵害を示すIOCの確定 0 件/);
  assert.match(report, /依存 1 種類／アドバイザリ 1 種類／依存と告知の一致 1 件/);
  assert.match(report, /ロック記録だけで全資格情報のローテーションを必須としない/);
  assert.doesNotMatch(report, /最優先・5分・無料/);
});

test('失敗した棚卸しを被害なしに置き換えず未確認を先頭に出す', () => {
  // Arrange
  const data = { finishedAt: '2026-10-31T01:00:00Z', extraCoverage: [{ area: 'inventory', status: 'unavailable', reason: 'タイムアウト' }], match: { findings: [], coverage: [], newsAssessment: [] } };
  // Act
  const report = renderReport(data);
  // Assert
  assert.match(report.split('\n')[1], /未確認範囲 1 件/);
  assert.match(report.split('\n')[2], /未確認の情報源・対象製品を補完/);
  assert.doesNotMatch(report.split('\n')[0], /被害なし|安全です/);
});

test('失敗した情報源の日時を進めず継続ページを保存する', () => {
  // Arrange
  const previous = { lastSuccessfulAt: '2026-10-17T00:00:00Z', sourceCursors: { good: '2026-10-17T00:00:00Z', failed: '2026-10-17T00:00:00Z' } };
  const news = { window: { since: '2026-10-17T00:00:00Z', until: '2026-10-31T00:00:00Z' }, sources: [{ name: 'good', status: 'ok' }, { name: 'failed', status: 'partial' }], sourceCursors: { good: '2026-10-31T00:00:00Z', failed: '2026-10-31T00:00:00Z' }, sourceContinuations: { failed: { url: 'https://api.github.com/advisories?after=public', window: { since: '2026-10-17T00:00:00Z', until: '2026-10-31T00:00:00Z' } } } };
  // Act
  const state = buildNextState(previous, news, '2026-10-31T01:00:00Z', '/local/report.md', false);
  // Assert
  assert.equal(state.sourceCursors.failed, '2026-10-17T00:00:00Z');
  assert.equal(state.sourceCursors.good, '2026-10-31T00:00:00Z');
  assert.equal(state.lastSuccessfulAt, '2026-10-17T00:00:00Z');
  assert.equal(state.sourceContinuations.failed.url, 'https://api.github.com/advisories?after=public');
  assert.equal(state.lastRunStatus, 'partial');
});

test('UTCの日付境界でも日本の日付でレポート名を決める', () => {
  // Arrange
  const date = new Date('2026-10-30T23:59:59Z');
  // Act
  const result = jstDate(date);
  // Assert
  assert.equal(result, '2026-10-31');
});

test('ニュース工程全体が失敗しても次回の収集開始を前へ進めない', () => {
  // Arrange
  const previous = { lastRunAt: '2026-10-17T00:00:00Z' };
  // Act
  const failed = buildNextState(previous, {}, '2026-10-31T00:00:00Z', '/local/report.md');
  const failedAgain = buildNextState(failed, {}, '2026-11-01T00:00:00Z', '/local/report2.md');
  const recovered = buildNextState(failedAgain, { sources: [{ name: 'source', status: 'ok' }], window: { since: '2026-10-17T00:00:00Z', until: '2026-11-02T00:00:00Z' } }, '2026-11-02T00:00:00Z', '/local/report3.md');
  // Assert
  assert.equal(failed.newsFallbackSince, '2026-10-17T00:00:00Z');
  assert.equal(failedAgain.newsFallbackSince, '2026-10-17T00:00:00Z');
  assert.equal(recovered.newsFallbackSince, undefined);
});

test('一致しなかったIOCと取得に成功した情報源もレポートへ残す', () => {
  // Arrange
  const data = { startedAt: '2026-10-31T00:00:00Z', finishedAt: '2026-10-31T00:00:05Z', iocs: { checks: [{ kind: 'sha256', value: '/local/extension.js', matched: false, strong: false, reason: '公式ハッシュと不一致', command: 'SHA256照合' }] }, news: { sources: [{ name: 'CISA KEV', status: 'ok', itemCount: 18, pages: 1 }] } };
  // Act
  const report = renderReport(data);
  // Assert
  assert.match(report, /公式ハッシュと不一致 SHA256照合/);
  assert.match(report, /CISA KEV \| ok \| 18 \| 1/);
  assert.match(report, /所要時間: 5\.0 秒/);
});

test('旧Nodeが保管されていても現在の修正済みNodeを影響版と表示しない', () => {
  // Arrange
  const data = { inventory: { runtimes: [{ name: 'node', path: '/runtime/current/node', version: 'v24.22.1', isCurrent: true }, { name: 'node', path: '/runtime/cache/node', version: 'v24.22.0', isCurrent: false }] }, match: { findings: [{ id: 'node-advisory', title: 'Nodeの脆弱性', status: '可能性高', incident: false, runtimeEvidence: [{ path: '/runtime/current/node', status: '影響なし' }, { path: '/runtime/cache/node', status: '可能性高' }] }] } };
  // Act
  const report = renderReport(data);
  // Assert
  assert.match(report, /v24\.22\.1 \| この棚卸しで実行した現在のNode \| node-advisory: 影響なし/);
  assert.match(report, /v24\.22\.0 \| 別用途・保管版（使用状況は未確認） \| node-advisory: 可能性高/);
});
