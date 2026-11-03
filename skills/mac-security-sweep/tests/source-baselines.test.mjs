import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchNews, fetchAdaptiveNews, mergeNews, parseMozillaBaseline, normalizeAdvisory } from '../scripts/fetch-news.mjs';
import { SOURCES, MOZILLA_SOURCES, NEWS_CATEGORIES, sourceRegistryCoverage } from '../scripts/source-registry.mjs';
import { createRunContext } from '../scripts/runtime.mjs';
import { matchInventory } from '../scripts/match.mjs';

const NOW = Date.parse('2026-11-03T00:00:00Z');
const FIREFOX = '<h3>Fixed in Firefox 130</h3><ul><li><a href="/en-US/security/advisories/mfsa2024-01/">Security Vulnerabilities fixed in Firefox 130</a></li></ul>';

test('source registryの30日再確認期限と各方式・baseline能力を公開する', () => {
  // Arrange / Act
  const fresh = sourceRegistryCoverage(NOW);
  const expired = sourceRegistryCoverage(Date.parse('2026-12-04T00:00:00Z'));
  // Assert
  assert.equal(fresh.status, 'complete');
  assert.equal(expired.status, 'partial');
  assert.equal(fresh.reviewDueAt, '2026-12-03T00:00:00.000Z');
  assert.ok(SOURCES.every(source => source.schema && source.identityMapping && source.channel && source.baseline && source.ttlMs));
});

test('GitHubのlabelとCVSS数値・未計算vectorを原方式付きで別々に残す', () => {
  // Arrange
  const advisory = { ghsa_id: 'GHSA-example', summary: 'Example', severity: 'high', cvss_severities: { cvss_v4: { score: 9.3, vector_string: 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N' } } };
  // Act
  const item = normalizeAdvisory(advisory, { name: 'GitHub Advisory reviewed', url: 'https://api.github.com/advisories' });
  // Assert
  assert.equal(item.severity.level, 'CRITICAL');
  assert.equal(item.severity.score, 9.3);
  assert.deepEqual(item.severityEvidence.map(entry => entry.method), ['label', 'CVSS_V4', 'CVSS_V4']);
  assert.equal(item.severityEvidence[2].evaluated, false);
});

test('固定registryは必須カテゴリの公式情報源を持ち単発Cursor記事を含まない', () => {
  // Arrange / Act
  const names = SOURCES.map(source => source.name);
  // Assert
  assert.equal(names.includes('Cursor security notice'), false);
  assert.deepEqual(NEWS_CATEGORIES.filter(value => value.required).map(value => value.id), ['macos', 'ios', 'mac-apps', 'homebrew', 'linux', 'php', 'tls', 'imagemagick', 'ruby', 'java', 'docker']);
  assert.ok(NEWS_CATEGORIES.filter(value => value.required).every(category => SOURCES.some(source => source.primary && source.categories.includes(category.id))));
  assert.ok(names.includes('CISA KEV'));
  assert.ok(names.includes('GitHub Advisory malware'));
  assert.ok(names.includes('piyolog'));
  assert.deepEqual(MOZILLA_SOURCES.map(source => source.productId), ['firefox', 'firefox-esr', 'thunderbird']);
});

test('新規導入の古いFirefoxは直近ニュース期間より古い公式修正履歴も確認する', async () => {
  // Arrange
  const requested = [];
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async url => { requested.push(String(url)); return new Response(FIREFOX); } });
  const inventory = { applications: [{ name: 'Firefox', bundleId: 'org.mozilla.firefox', channel: 'release', version: '120.0', path: '/Applications/Firefox.app' }] };
  // Act
  const adaptive = await fetchAdaptiveNews(inventory, { context, previous: { lastRunAt: '2026-11-02T00:00:00Z' } });
  const result = matchInventory(inventory, mergeNews({ window: { since: '2026-11-02T00:00:00Z' }, items: [] }, adaptive));
  await context.close();
  // Assert
  assert.deepEqual(requested, ['https://www.mozilla.org/en-US/security/known-vulnerabilities/firefox/']);
  assert.equal(adaptive.baselines.firefox.updates[0].fixedVersion, '130');
  assert.equal(adaptive.sources[0].baselineComplete, true);
  assert.equal(adaptive.productCoverage[0].status, 'partial');
  assert.equal(result.findings[0].status, '可能性あり');
  assert.equal(result.findings[0].fixed, '130');
  assert.equal(result.counts['確定'], 0);
});

test('Firefox履歴のAndroid専用修正をmacOSの修正版として採用しない', () => {
  // Arrange
  const html = '<h3>Fixed in Firefox 131.0.2</h3><a href="/en-US/security/advisories/mfsa2024-02/">Security Vulnerabilities fixed in Firefox for Android 131.0.2</a>' + FIREFOX;
  // Act
  const updates = parseMozillaBaseline(html, MOZILLA_SOURCES[0]);
  // Assert
  assert.deepEqual(updates.map(update => update.fixedVersion), ['130']);
});

test('ESRとThunderbirdは各公式channelの明示的な修正版を抽出する', () => {
  // Arrange
  const esr = '<h3>Fixed in Firefox ESR 128.1</h3><a href="/en-US/security/advisories/mfsa2024-03/">Security vulnerabilities fixed in Firefox ESR 128.1</a>';
  const thunderbird = '<h3>Fixed in Thunderbird 128.1</h3><a href="/en-US/security/advisories/mfsa2024-04/">Security vulnerabilities fixed in Thunderbird 128.1</a>';
  // Act
  const a = parseMozillaBaseline(esr, MOZILLA_SOURCES[1]);
  const b = parseMozillaBaseline(thunderbird, MOZILLA_SOURCES[2]);
  const result = matchInventory({ applications: [{ name: 'Firefox ESR', version: '115.1', channel: 'esr' }] }, { securityUpdates: a });
  // Assert
  assert.equal(a[0].channel, 'esr');
  assert.equal(b[0].product, 'Thunderbird');
  assert.equal(result.findings.length, 0);
});

test('未知アプリの導入は検出済みでも情報源対応済みとしない', async () => {
  // Arrange
  let calls = 0;
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async () => { calls++; throw new Error('unexpected'); } });
  // Act
  const result = await fetchAdaptiveNews({ applications: [{ name: 'Example Editor', version: '1.0.0' }] }, { context });
  await context.close();
  // Assert
  assert.equal(calls, 0);
  assert.equal(result.productCoverage[0].productId, 'unsupported');
  assert.equal(result.productCoverage[0].status, 'partial');
  assert.equal(result.productCoverage[0].baselineComplete, false);
});

test('期限切れbaselineの取得失敗は古い成功日時を保持し新鮮・完了へ進めない', async () => {
  // Arrange
  const stale = { schema: 'mozilla-fixed-in-html-v1', fetchedAt: '2026-10-01T00:00:00Z', updates: parseMozillaBaseline(FIREFOX, MOZILLA_SOURCES[0]), secret: 'SENTINEL_CACHE_SECRET' };
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async () => { throw new Error('SENTINEL_NETWORK_SECRET'); } });
  // Act
  const result = await fetchAdaptiveNews({ applications: [{ name: 'Firefox', channel: 'release', version: '120.0' }] }, { context, previous: { adaptiveNews: { baselines: { firefox: stale }, unknown: 'SENTINEL_STATE_SECRET' } } });
  await context.close();
  // Assert
  assert.equal(result.sources[0].freshness, 'stale');
  assert.equal(result.sources[0].baselineComplete, false);
  assert.equal(result.sources[0].lastSuccessfulAt, '2026-10-01T00:00:00Z');
  assert.deepEqual(result.continuation.pendingProductIds, ['firefox']);
  assert.equal(JSON.stringify(result).includes('SENTINEL'), false);
});

test('Mozillaの未知HTML形式は空の完了baselineへ変わらない', async () => {
  // Arrange
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async () => new Response('<html>SENTINEL_RAW_BODY</html>') });
  // Act
  const result = await fetchAdaptiveNews({ applications: [{ name: 'Firefox', channel: 'release' }] }, { context });
  await context.close();
  // Assert
  assert.equal(result.sources[0].status, 'partial');
  assert.equal(result.sources[0].diagnostic.code, 'MSS_SOURCE');
  assert.equal(result.sources[0].diagnostic.cause, 'malformed');
  assert.equal(result.sources[0].freshness, 'missing');
  assert.equal(JSON.stringify(result).includes('SENTINEL'), false);
});

test('429は成功cursorを保持しshared host予算で追加GitHub取得を止める', async () => {
  // Arrange
  const requested = [];
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async url => {
    requested.push(String(url));
    return new Response('SENTINEL_RESPONSE', { status: 429, headers: { 'retry-after': '120' } });
  } });
  // Act
  const result = await fetchNews({ context, previous: { sourceCursors: { 'GitHub Advisory reviewed': '2026-10-01T00:00:00Z' }, secret: 'SENTINEL_STATE' }, until: '2026-11-03T00:00:00Z' });
  await context.close();
  // Assert
  assert.equal(result.sourceCursors['GitHub Advisory reviewed'], '2026-10-01T00:00:00.000Z');
  assert.equal(result.sources.find(source => source.name === 'GitHub Advisory reviewed').freshness, 'stale');
  assert.ok(requested.filter(url => url.includes('api.github.com')).length <= 2);
  assert.equal(context.transport.cooldowns['api.github.com'], NOW + 120000);
  assert.equal(JSON.stringify(result).includes('SENTINEL'), false);
  assert.ok(requested.every(url => !url.includes('/Users/') && !url.includes('SENTINEL')));
});

test('転送先や例外に含まれる秘密を追跡・表示しない', async () => {
  // Arrange
  const requested = [];
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async url => {
    requested.push(String(url)); return new Response('', { status: 302, headers: { location: 'https://attacker.invalid/SENTINEL' } });
  } });
  // Act
  const result = await fetchNews({ context, previous: {}, until: '2026-11-03T00:00:00Z' });
  await context.close();
  // Assert
  assert.equal(requested.some(url => url.includes('attacker')), false);
  assert.equal(JSON.stringify(result).includes('SENTINEL'), false);
  assert.equal(result.sources.filter(source => source.status === 'ok').length, 0);
});

test('GitHubは全情報源の初回照会後に有限ページを進め次回も新着と未処理履歴を両方取得する', async () => {
  // Arrange
  const requested = [];
  const checkpoints = [];
  const fetchImpl = async address => {
    const url = new URL(address);
    if (url.hostname !== 'api.github.com' || url.pathname !== '/advisories') return new Response('', { status: 503 });
    if (url.searchParams.get('type') === 'malware') return new Response('[]');
    const page = Number(url.searchParams.get('after') || 1);
    requested.push(page);
    const next = new URL(url); next.searchParams.set('after', String(page + 1));
    return new Response(JSON.stringify([{ ghsa_id: `GHSA-page-${page}`, summary: `Page ${page}`, updated_at: '2026-11-02T00:00:00Z' }]), { headers: page < 21 ? { link: `<${next.href}>; rel="next"` } : {} });
  };
  const firstContext = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl, checkpoint: async value => { checkpoints.push(value); } });
  // Act
  const first = await fetchNews({ context: firstContext, previous: {}, until: '2026-11-03T00:00:00Z' });
  await firstContext.close();
  const secondContext = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl });
  const second = await fetchNews({ context: secondContext, previous: { sourceCursors: first.sourceCursors, sourceContinuations: first.sourceContinuations }, until: '2026-11-03T00:00:00Z' });
  await secondContext.close();
  // Assert
  assert.equal(first.sources.find(source => source.name === 'GitHub Advisory reviewed').status, 'partial');
  assert.equal(first.items.length, 3);
  assert.equal(second.items.length, 5);
  assert.deepEqual(requested, [1, 2, 3, 1, 4, 5]);
  assert.equal(new URL(second.sourceContinuations['GitHub Advisory reviewed'].url).searchParams.get('after'), '6');
  assert.equal(second.sourceCursors['GitHub Advisory reviewed'], undefined);
  assert.ok(checkpoints.some(value => value.value.sourceContinuations['GitHub Advisory reviewed']?.items.length === 3));
});

test('過去期間が未完了でも今回の30日照会を先に成功させてから履歴を再開する', async () => {
  // Arrange
  const name = 'GitHub Advisory reviewed';
  const window = { since: '2026-10-20T00:00:00.000Z', until: '2026-11-01T00:00:00.000Z' };
  const address = new URL('https://api.github.com/advisories');
  address.search = new URLSearchParams({ type: 'reviewed', modified: `${window.since}..${window.until}`, sort: 'updated', direction: 'desc', per_page: '100', after: 'last-page' }).toString();
  const requested = [];
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async url => { requested.push(String(url)); return new Response(String(url).includes('api.github.com') ? '[]' : '', { status: String(url).includes('api.github.com') ? 200 : 503 }); } });
  // Act
  const result = await fetchNews({ context, previous: { sourceCursors: { [name]: window.since }, sourceContinuations: { [name]: { url: address.href, window, items: [] } } }, until: '2026-11-03T00:00:00Z' });
  await context.close();
  const source = result.sources.find(value => value.name === name);
  // Assert
  assert.equal(source.status, 'ok');
  assert.equal(source.freshness, 'fresh');
  assert.equal(source.windowComplete, true);
  assert.equal(source.lastSuccessfulAt, '2026-11-03T00:00:00.000Z');
  assert.equal(source.missingWindow, undefined);
  const calls = requested.filter(url => url.includes('/advisories?') && url.includes('type=reviewed'));
  assert.equal(new URL(calls[0]).searchParams.get('modified'), '2026-10-04T00:00:00.000Z..2026-11-03T00:00:00.000Z');
  assert.equal(calls[1], address.href);
  assert.equal(result.sourceCursors[name], '2026-11-03T00:00:00.000Z');
  assert.equal(result.sourceContinuations[name], undefined);
});
