import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAdvisory, parseApple, fetchNews } from '../scripts/fetch-news.mjs';
import { matchInventory } from '../scripts/match.mjs';
import { compareAssessments } from '../scripts/assessment.mjs';

test('同じ公式更新候補へ到達したXcodeは前回の未適用から解消へ変わる', () => {
  // Arrange
  const releases = [{ title: 'Xcode 27.2', url: 'https://support.apple.com/en-us/149589' }];
  const before = matchInventory({ applications: [{ name: 'Xcode', version: '27.1', path: '/Applications/Xcode.app' }] }, { securityReleases: releases });
  const after = matchInventory({ applications: [{ name: 'Xcode', version: '27.2', path: '/Applications/Xcode.app' }] }, { securityReleases: releases });
  // Act
  const changes = compareAssessments(before.findings, after.findings);
  // Assert
  assert.equal(after.findings[0].status, '影響なし');
  assert.equal(changes.resolved.length, 1);
  assert.equal(changes.unconfirmed.length, 0);
});

test('取得期間より古いAppleリリースも更新照合用に保持しニュース件数とは分ける', async t => {
  // Arrange
  const html = '<table><tr><td><a href="https://support.apple.com/en-us/149589">Xcode 27.2</a></td><td>macOS</td><td>29 Oct 2026</td></tr></table>';
  const requested = [];
  t.mock.method(globalThis, 'fetch', async url => {
    requested.push(String(url));
    if (String(url) === 'https://support.apple.com/en-us/100100') return new Response(html);
    if (String(url).startsWith('https://api.github.com/advisories')) return new Response('[]');
    return new Response('', { status: 503 });
  });
  // Act
  const result = await fetchNews({ since: '2026-11-01T00:00:00Z', until: '2026-11-02T00:00:00Z', state: '/nonexistent-sweep-fixture/state.json' });
  // Assert
  assert.equal(result.items.filter(item => item.title === 'Xcode 27.2').length, 0);
  assert.equal(result.securityReleases[0].title, 'Xcode 27.2');
  assert.equal(result.sources.find(source => source.name === 'Apple Security Releases').itemCount, 0);
  assert.ok(requested.every(url => !url.includes('/Users/') && !url.includes('SENTINEL')));
});

test('公開GitHubの悪性配布区分を版照合まで保持し実行や窃取は確定しない', () => {
  // Arrange
  const newsItem = normalizeAdvisory({ ghsa_id: 'GHSA-malware', summary: 'Malicious code', html_url: 'https://github.com/advisories/GHSA-malware',
    vulnerabilities: [{ package: { ecosystem: 'npm', name: 'example' }, vulnerable_version_range: '= 1.0.0' }] },
  { name: 'GitHub Advisory malware', url: 'https://api.github.com/advisories', advisoryType: 'malware' });
  // Act
  const result = matchInventory({}, { items: [newsItem] }, { packages: { packages: [{ name: 'example', ecosystem: 'npm', version: '1.0.0', evidence: ['/example/lock'] }] } });
  // Assert
  assert.equal(newsItem.advisoryType, 'malware');
  assert.equal(result.findings[0].incident, true);
  assert.equal(result.findings[0].status, '可能性高');
  assert.equal(result.counts['確定'], 0);
});

test('通常の脆弱性告知を悪性配布として扱わない', () => {
  // Arrange
  const source = { name: 'GitHub Advisory reviewed', url: 'https://api.github.com/advisories', advisoryType: 'reviewed' };
  // Act
  const item = normalizeAdvisory({ ghsa_id: 'GHSA-example', summary: 'Malicious input causes denial of service' }, source);
  // Assert
  assert.equal(item.advisoryType, 'reviewed');
});

test('Apple公式表から固定ルールのないXcodeの更新候補を拾う', () => {
  // Arrange
  const html = '<table><tr><td><a href="https://support.apple.com/en-us/149589">Xcode 27.2</a></td><td>macOS Tahoe 26.6 and later</td><td>29 Oct 2026</td></tr></table>';
  const releases = parseApple(html, { name: 'Apple Security Releases', url: 'https://support.apple.com/en-us/100100' });
  // Act
  const result = matchInventory({ applications: [{ name: 'Xcode', bundleId: 'com.apple.dt.Xcode', version: '27.1', path: '/Applications/Xcode.app' }] }, { securityReleases: releases });
  // Assert
  assert.equal(result.findings[0].fixed, '27.2');
  assert.equal(result.findings[0].status, '可能性あり');
  assert.match(result.findings[0].reason, /各CVEの影響開始版/);
});
