import test from 'node:test';
import assert from 'node:assert/strict';
import { projectSbom } from '../scripts/environment-readers.mjs';
import { scanPackages, queryOsv } from '../scripts/scan-packages.mjs';
import { validPackage } from '../scripts/package-formats.mjs';
import { matchInventory, matchRule } from '../scripts/match.mjs';
import { createRunContext } from '../scripts/runtime.mjs';

const IMAGE = `sha256:${'a'.repeat(64)}`;
const NOW = Date.parse('2026-11-03T00:00:00Z');

/** Create a synthetic digest-bound SBOM without accessing an image or local configuration.
 * @example sbom([{name:'openssl',version:'3.0.14',purl:'pkg:deb/debian/openssl@3.0.14'}])
 */
function sbom(components) {
  return { bomFormat: 'CycloneDX', specVersion: '1.6', metadata: { component: { hashes: [{ alg: 'SHA-256', content: 'a'.repeat(64) }] } }, components };
}

test('Debianのepochとrevisionを保持しsource packageだけを正確なreleaseへ結び付ける', () => {
  // Arrange
  const data = sbom([{ name: 'openssl', version: '1:3.0.14-1~deb12u2', purl: 'pkg:deb/debian/openssl@1:3.0.14-1~deb12u2?arch=source&distro=debian-12',
    externalReferences: [{ type: 'distribution', url: 'https://deb.debian.org/debian/pool/main/o/openssl/openssl.dsc' }] }]);
  // Act
  const result = projectSbom(data, new Set([IMAGE]));
  // Assert
  assert.deepEqual(result.packages.map(row => [row.name, row.version, row.ecosystem, row.distribution, row.distributionRelease, row.architecture, row.provenanceStatus]),
    [['openssl', '1:3.0.14-1~deb12u2', 'Debian:12', 'debian', '12', 'source', 'verified-public-record']]);
  assert.equal(result.status, 'complete');
  assert.equal(result.historyScope, 'supported-records-only');
});

test('Alpineのbinary名をsource名と混同せず同じ記録のupstreamとbranchを使う', () => {
  // Arrange
  const data = sbom([{ name: 'libcrypto3', version: '3.3.2-r0', purl: 'pkg:apk/alpine/libcrypto3@3.3.2-r0?arch=aarch64&upstream=openssl&distro=alpine-3.22.1',
    properties: [{ name: 'syft:metadata:originPackage', value: 'openssl' }],
    externalReferences: [{ type: 'distribution', url: 'https://dl-cdn.alpinelinux.org/alpine/v3.22/main/aarch64/libcrypto3-3.3.2-r0.apk' }] }]);
  // Act
  const result = projectSbom(data, new Set([IMAGE]));
  // Assert
  assert.deepEqual(result.packages.map(row => [row.name, row.binaryName, row.version, row.ecosystem, row.sourcePackage, row.publicRegistry]),
    [['openssl', 'libcrypto3', '3.3.2-r0', 'Alpine:v3.22', 'openssl', true]]);
});

test('source不明のDebian・未対応RPM・未知形式をSBOMの確認完了へ変換しない', () => {
  // Arrange
  const data = sbom([
    { name: 'libssl3', version: '3.0.14-1', purl: 'pkg:deb/debian/libssl3@3.0.14-1?arch=amd64&distro=debian-12' },
    { name: 'openssl', version: '1:3.0.7-18.el9', purl: 'pkg:rpm/redhat/openssl@1:3.0.7-18.el9?arch=x86_64&distro=redhat-9' },
    { name: 'unknown', version: '1.0.0', purl: 'pkg:unknown/unknown@1.0.0?private_token=SYNTHETIC_SECRET' },
  ]);
  // Act
  const result = projectSbom(data, new Set([IMAGE]));
  // Assert
  assert.deepEqual([result.componentCount, result.packages.length, result.skippedPackages, result.unsupportedPackages, result.unknownOrigins], [3, 2, 1, 2, 2]);
  assert.equal(result.status, 'partial');
  assert.equal(JSON.stringify(result).includes('SYNTHETIC_SECRET'), false);
  assert.equal(result.packages.every(row => row.publicRegistry === false), true);
});

test('矛盾するdistribution・source名・私有mirrorで公開由来を成立させない', () => {
  // Arrange
  const component = { name: 'libcrypto3', version: '3.3.2-r0', purl: 'pkg:apk/alpine/libcrypto3@3.3.2-r0?upstream=openssl&distro=alpine-3.22',
    externalReferences: [{ type: 'distribution', url: 'https://dl-cdn.alpinelinux.org/alpine/v3.22/main/aarch64/libcrypto3.apk' }] };
  const data = sbom([
    { ...component, purl: component.purl.replace('distro=alpine-3.22', 'distro=debian-12') },
    { ...component, properties: [{ name: 'syft:metadata:originPackage', value: 'different-source' }] },
    { ...component, externalReferences: [...component.externalReferences, { type: 'distribution', url: 'https://private.example/package.apk' }] },
  ]);
  // Act
  const result = projectSbom(data, new Set([IMAGE]));
  // Assert
  assert.equal(result.distributionConflicts, 2);
  assert.deepEqual(result.packages.map(row => row.publicRegistry), [false, false, false]);
  assert.equal(result.status, 'partial');
});

test('release・source・公開由来が揃ったSBOMだけを最小OSV payloadへ送る', async () => {
  // Arrange
  const sent = [];
  const data = projectSbom(sbom([{ name: 'openssl', version: '1:3.0.14-1~deb12u2', purl: 'pkg:deb/debian/openssl@1:3.0.14-1~deb12u2?arch=source&distro=debian-12',
    externalReferences: [{ type: 'distribution', url: 'https://deb.debian.org/debian/pool/main/o/openssl/openssl.dsc' }] }]), new Set([IMAGE]));
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async (_url, init) => {
    sent.push(JSON.parse(init.body)); return new Response('{"results":[{}]}');
  } });
  try {
    // Act
    const result = await scanPackages({ sbomPackages: [...data.packages, { ...data.packages[0], name: 'private-fixture', sourcePackage: 'private-fixture', publicRegistry: false, origin: 'private' }] }, { context, noScanner: true, inspectInstallations: false });
    // Assert
    assert.deepEqual(sent, [{ queries: [{ package: { name: 'openssl', ecosystem: 'Debian:12' }, version: '1:3.0.14-1~deb12u2' }] }]);
    assert.deepEqual(result.queryAssessments.map(row => [row.status, row.complete, row.queriedAt, row.historyScope]),
      [['no-known-match', true, '2026-11-03T00:00:00.000Z', 'osv-all-records-for-exact-version']]);
    assert.equal(result.records[0].platform, 'linux');
    assert.equal(result.coverage.find(row => row.area === 'package-extraction').status, 'partial');
  } finally { await context.close(); }
});

test('ニュース期間外の古い脆弱性もexact-version照会で検出し取得時刻を残す', async () => {
  // Arrange
  const sent = [];
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async (_url, init) => {
    sent.push(JSON.parse(init.body)); return new Response('{"results":[{"vulns":[{"id":"CVE-2018-1000000","modified":"2018-01-01T00:00:00Z"}]}]}');
  } });
  try {
    // Act
    const result = await queryOsv([{ name: 'fixture', ecosystem: 'npm', version: '1.0.0' }], { context });
    // Assert
    assert.deepEqual(sent, [{ queries: [{ package: { name: 'fixture', ecosystem: 'npm' }, version: '1.0.0' }] }]);
    assert.equal(result.findings[0].id, 'CVE-2018-1000000');
    assert.equal(result.findings[0].queryComplete, true);
    assert.equal(result.findings[0].queriedAt, '2026-11-03T00:00:00.000Z');
    assert.equal(result.queryAssessments[0].status, 'affected');
  } finally { await context.close(); }
});

test('OSVの失敗や未対応releaseを無影響の証拠として扱わない', async () => {
  // Arrange
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async () => new Response('{}', { status: 403 }) });
  try {
    // Act
    const result = await queryOsv([{ name: 'fixture', ecosystem: 'npm', version: '1.0.0' }], { context });
    // Assert
    assert.deepEqual(result.queryAssessments.map(row => [row.status, row.complete, row.queriedAt]), [['unknown', false, null]]);
    assert.equal(validPackage({ name: 'openssl', ecosystem: 'Debian:99', version: '1.2.3' }), false);
    assert.equal(validPackage({ name: 'openssl', ecosystem: 'Alpine', version: '1.2.3-r0' }), false);
  } finally { await context.close(); }
});

test('HomebrewとJava・Rubyの観測をニュース関連性へ反映し上流runtimeをlibraryと混同しない', () => {
  // Arrange
  const inventory = { homebrew: { formulae: [{ name: 'php@8.4' }, { name: 'openssl@3' }, { name: 'imagemagick' }] }, runtimes: [{ name: 'java' }, { name: 'ruby' }] };
  const news = { items: ['PHP', 'OpenSSL', 'ImageMagick', 'Java', 'Ruby'].map(product => ({ id: product, title: `${product} security update` })) };
  // Act
  const result = matchInventory(inventory, news);
  // Assert
  assert.deepEqual(result.newsAssessment.map(row => row.relevance), ['関係あり', '関係あり', '関係あり', '関係あり', '関係あり']);
  assert.equal(result.findings.filter(row => row.status === '可能性高').length, 0);
});

test('Mac対象外の重要iOSニュースも日付・深刻度・悪用情報を失わない', () => {
  // Arrange
  const news = { knownExploitedIds: ['CVE-2026-12345'], items: [{ id: 'apple-ios', aliases: ['CVE-2026-12345'], title: 'iOS 20 security update', category: 'apple', sourceId: 'apple', severity: 'CRITICAL',
    publishedAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-03T00:00:00Z', fetchedAt: '2026-11-03T01:00:00Z' }] };
  // Act
  const result = matchInventory({ host: { osVersion: '27.2' } }, news);
  // Assert
  assert.deepEqual(result.newsAssessment.map(row => [row.relevance, row.reasonCode, row.severity, row.knownExploited, row.updatedAt, row.fetchedAt]),
    [['関係なし', 'news-other-platform', 'CRITICAL', true, '2026-11-03T00:00:00Z', '2026-11-03T01:00:00Z']]);
});

test('棚卸し未開始時の対象未検出は関連なしへ変換しない', () => {
  // Arrange
  const news = { items: [{ id: 'GHSA-fixture', title: 'fixture vulnerability', affected: [{ ecosystem: 'npm', name: 'fixture', range: '<2.0.0' }] }] };
  // Act
  const result = matchInventory({}, news);
  // Assert
  assert.equal(result.newsAssessment[0].relevance, '確認候補');
  assert.equal(result.newsAssessment[0].reasonCode, 'news-inventory-incomplete');
});

test('Linuxの数値だけの版でもnpm用比較を流用せずJDK buildも未確認を維持する', () => {
  // Arrange
  const packages = { packages: [{ name: 'openssl', ecosystem: 'Debian:12', version: '3.0.14' }] };
  const news = { items: [{ id: 'DEBIAN-fixture', needsReview: false, affected: [{ ecosystem: 'Debian:12', name: 'openssl', range: '<3.0.10' }] }] };
  // Act
  const distro = matchInventory({}, news, { packages });
  const jdk = matchRule({ runtimes: [{ name: 'java', version: '17.0.16+8', path: '/fixture/jdk' }], coverage: [{ area: 'runtimes', status: 'complete' }] },
    { id: 'jdk-fixture', kind: 'runtime', runtimeName: 'java', verified: true, supportedMajors: [17], affectedRange: '<17.0.16' });
  // Assert
  assert.equal(distro.findings[0].status, '可能性あり');
  assert.equal(distro.findings[0].reasonCode, 'package-range-unsupported');
  assert.equal(jdk.status, '可能性あり');
});

test('同一告知の影響版と対象外判定が競合すれば陽性の根拠を保持し未確認とする', () => {
  // Arrange
  const packages = { packages: [{ name: 'fixture', ecosystem: 'npm', version: '2.0.0' }], findings: [{ id: 'GHSA-fixture', package: { name: 'fixture', ecosystem: 'npm' }, version: '2.0.0', sourceUrl: 'https://osv.dev/vulnerability/GHSA-fixture' }] };
  const news = { items: [{ id: 'GHSA-fixture', needsReview: false, url: 'https://github.com/advisories/GHSA-fixture', affected: [{ ecosystem: 'npm', name: 'fixture', range: '<2.0.0' }] }] };
  // Act
  const result = matchInventory({}, news, { packages });
  // Assert
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].status, '可能性あり');
  assert.equal(result.findings[0].conflictingEvidence, true);
  assert.equal(result.findings[0].reasonCode, 'advisory-conflict');
  assert.deepEqual(result.findings[0].sources, ['https://osv.dev/vulnerability/GHSA-fixture', 'https://github.com/advisories/GHSA-fixture']);
});

test('永続ルールにない新規hash一致も侵害指標として報告し実行・窃取を断定しない', () => {
  // Arrange
  const checks = [{ ruleId: 'new-fixture', product: 'Fixture malware', kind: 'path', value: '/fixture/path', matched: true, strong: false, sourceUrl: 'https://www.cisa.gov/cybersecurity-advisories/fixture' },
    { ruleId: 'new-fixture', product: 'Fixture malware', kind: 'sha256', value: '/fixture/payload', matched: true, strong: true, sourceUrl: 'https://www.cisa.gov/cybersecurity-advisories/fixture' }];
  // Act
  const result = matchInventory({}, {}, { iocEvidence: { checks } });
  // Assert
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].status, '確定');
  assert.equal(result.findings[0].reasonCode, 'ioc-file-match');
  assert.equal(result.findings[0].impact.executionConfirmed, false);
  assert.deepEqual(result.findings[0].evidence, ['/fixture/path', '/fixture/payload']);
});

test('macOSの更新候補は同じメジャーの公式履歴に限定し日時と判定範囲を残す', () => {
  // Arrange
  const news = { items: [], securityReleases: [
    { title: 'macOS Sequoia 15.7.2', url: 'https://support.apple.com/en-us/fixture-15', publishedAt: '2026-01-01T00:00:00Z' },
    { title: 'macOS Tahoe 26.1', url: 'https://support.apple.com/en-us/fixture-26', publishedAt: '2026-11-01T00:00:00Z' },
  ] };
  // Act
  const older = matchInventory({ host: { osVersion: '15.6.0' } }, news, { now: new Date(NOW) });
  const updated = matchInventory({ host: { osVersion: '15.7.2' } }, news, { now: new Date(NOW) });
  // Assert
  assert.deepEqual(older.findings.map(row => [row.status, row.version, row.fixed, row.assessmentBasis, row.observedAt]),
    [['可能性あり', '15.6.0', '15.7.2', 'same-major-security-release', '2026-11-03T00:00:00.000Z']]);
  assert.deepEqual(updated.findings.map(row => [row.status, row.reasonCode, row.historyScope]),
    [['影響なし', 'security-release-reached', 'official-release-index']]);
});

test('PURL型とdistribution・公開repositoryのbranchが矛盾すればOSV対象にしない', () => {
  // Arrange
  const data = sbom([
    { name: 'openssl', version: '1:3.0-1', purl: 'pkg:rpm/debian/openssl@1:3.0-1?arch=source&distro=debian-12', externalReferences: [{ type: 'distribution', url: 'https://deb.debian.org/debian/pool/main/o/openssl/openssl.dsc' }] },
    { name: 'openssl', version: '1:3.0-1', purl: 'pkg:deb/debian/openssl@1:3.0-1?arch=source&distro=debian-12', properties: [{ name: 'syft:metadata:sourceName', value: 'other-source' }], externalReferences: [{ type: 'distribution', url: 'https://deb.debian.org/debian/pool/main/o/openssl/openssl.dsc' }] },
    { name: 'openssl', version: '3.3.2-r0', purl: 'pkg:apk/alpine/openssl@3.3.2-r0?upstream=openssl&distro=alpine-3.22', externalReferences: [{ type: 'distribution', url: 'https://dl-cdn.alpinelinux.org/alpine/v3.19/main/aarch64/openssl.apk' }] },
  ]);
  // Act
  const result = projectSbom(data, new Set([IMAGE]));
  // Assert
  assert.deepEqual(result.packages.map(row => [row.ecosystem, row.publicRegistry, row.distributionConflict]), [[null, false, true], [null, false, true], [null, false, true]]);
  assert.equal(result.distributionConflicts, 3);
  assert.equal(result.status, 'partial');
});

test('一つのSBOMが異なる画像digestを宣言したら観測済みdigestだけを選んで結合しない', () => {
  // Arrange
  const data = sbom([]);
  data.metadata.properties = [{ name: 'container:image:Digest', value: 'sha256:' + 'b'.repeat(64) }];
  // Act
  const result = projectSbom(data, new Set([IMAGE]));
  // Assert
  assert.equal(result.bound, false);
  assert.equal(result.imageDigest, null);
  assert.equal(result.status, 'partial');
});

test('未来日付の照会済み記録を陰性証拠に使わず正確な版を再照会する', async () => {
  // Arrange
  let calls = 0;
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async () => {
    calls += 1;
    return new Response(calls === 1 ? '{"results":[{}]}' : '{"results":[{"vulns":[{"id":"CVE-2018-1000000"}]}]}');
  } });
  try {
    const pkg = { name: 'fixture', ecosystem: 'npm', version: '1.0.0' };
    const first = await queryOsv([pkg], { context });
    const previous = { ...first.continuation, queries: first.continuation.queries.map(row => ({ ...row, queriedAt: '2026-11-04T00:00:00.000Z' })) };
    // Act
    const second = await queryOsv([pkg], { context, previous, continuationVerified: true, holdForDetails: true });
    // Assert
    assert.equal(calls, 2);
    assert.deepEqual(second.queryAssessments.map(row => [row.status, row.queriedAt]), [['affected', '2026-11-03T00:00:00.000Z']]);
  } finally { await context.close(); }
});

test('単なるパス一致をstrongと指定されても侵害確定へ昇格しない', () => {
  // Arrange
  const rule = { id: 'fixture-rule', kind: 'extension', extensionId: 'fixture.extension', editor: 'cursor', verified: true, affectedVersions: ['1.0.0'] };
  // Act
  const result = matchRule({ extensions: [], coverage: [{ area: 'extensions:cursor', status: 'complete' }] }, rule,
    { checks: [{ ruleId: 'fixture-rule', kind: 'path', matched: true, strong: true, value: '/fixture/payload' }] });
  // Assert
  assert.equal(result.status, '可能性あり');
  assert.equal(result.impact.compromise, 'unconfirmed');
});

test('Linux配布版の告知を同名Homebrewへ結び付けず同じreleaseのSBOMだけと関連付ける', () => {
  // Arrange
  const news = { items: [{ id: 'alpine-fixture', title: 'OpenSSL security update', distribution: 'Alpine', distributionRelease: '3.22', fixed: [{ name: 'openssl', version: '3.3.3-r0' }] }] };
  const inventory = { homebrew: { formulae: [{ name: 'openssl@3' }] } };
  // Act
  const hostOnly = matchInventory(inventory, news);
  const sameRelease = matchInventory({ ...inventory, sbomPackages: [{ name: 'openssl', sourcePackage: 'openssl', distribution: 'alpine', distributionRelease: '3.22' }] }, news);
  const otherRelease = matchInventory({ ...inventory, sbomPackages: [{ name: 'openssl', sourcePackage: 'openssl', distribution: 'alpine', distributionRelease: '3.19' }] }, news);
  // Assert
  assert.deepEqual([hostOnly, sameRelease, otherRelease].map(result => result.newsAssessment[0].relevance), ['確認候補', '関係あり', '確認候補']);
  assert.deepEqual(hostOnly.newsAssessment[0].matchedProducts, []);
  assert.deepEqual(sameRelease.newsAssessment[0].matchedProducts, ['openssl']);
});

test('30日のニュース一覧に含まれない取得済みの構造化告知も同じpackageの版と照合する', () => {
  // Arrange
  const news = { items: [], historicalAdvisories: [{ id: 'GHSA-old-history-fixture', title: 'Old package advisory', url: 'https://github.com/advisories/GHSA-old-history-fixture',
    publishedAt: '2018-01-01T00:00:00Z', needsReview: false, affected: [{ ecosystem: 'npm', name: 'fixture', range: '<2.0.0' }] }] };
  const packages = { packages: [{ name: 'fixture', ecosystem: 'npm', version: '1.0.0', evidence: ['/fixture/package-lock.json'] }] };
  // Act
  const result = matchInventory({}, news, { packages, now: new Date(NOW) });
  // Assert
  assert.deepEqual(result.newsAssessment, []);
  assert.deepEqual(result.findings.map(row => [row.advisoryId, row.status, row.historyScope]),
    [['GHSA-old-history-fixture', '可能性高', 'fetched-structured-advisories']]);
});

test('対象外の告知を先に処理しても同じ告知の影響ありとの競合を失わない', () => {
  // Arrange
  const entry = { id: 'GHSA-source-conflict-fixture', aliases: ['CVE-2026-12345'], needsReview: false };
  const news = { items: [
    { ...entry, url: 'https://github.com/advisories/GHSA-source-conflict-fixture', affected: [{ ecosystem: 'npm', name: 'fixture', range: '>=2.0.0' }] },
    { ...entry, id: 'CVE-2026-12345', url: 'https://osv.dev/vulnerability/CVE-2026-12345', affected: [{ ecosystem: 'npm', name: 'fixture', range: '<2.0.0' }] },
  ] };
  // Act
  const result = matchInventory({}, news, { packages: { packages: [{ name: 'fixture', ecosystem: 'npm', version: '1.0.0' }] } });
  // Assert
  assert.deepEqual(result.findings.map(row => [row.status, row.reasonCode, row.conflictingEvidence, row.sources.length]), [['可能性あり', 'advisory-conflict', true, 2]]);
});

test('整数精度を超える版を丸めて修正版と同一扱いしない', () => {
  // Arrange
  const rule = { id: 'oversized-version-fixture', kind: 'application', applicationNames: ['Fixture'], verified: true, affectedRange: '<9007199254740993.0', fixedVersion: '9007199254740993.0' };
  // Act
  const result = matchRule({ applications: [{ name: 'Fixture', version: '9007199254740992.0' }], coverage: [{ area: 'applications', status: 'complete' }] }, rule);
  // Assert
  assert.equal(result.status, '可能性あり');
  assert.equal(result.reasonCode, 'rule-version-unsupported');
});
