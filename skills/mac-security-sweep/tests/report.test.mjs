import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReport, safeSourceUrl, escapeReportText, normalizeCoverageEntry } from '../scripts/report.mjs';
import { normalizeLanguage, resolveLanguage, localizeDiagnostic } from '../scripts/locale.mjs';
import { matchRule, matchSecurityReleases, matchInventory } from '../scripts/match.mjs';
import { checkIocs } from '../scripts/check-iocs.mjs';
import { createRunContext } from '../scripts/runtime.mjs';

test('denied IOC reads and incomplete process inventory stay unassessed in Japanese and English reports', async () => {
  // Arrange
  const context = createRunContext({ home: '/synthetic-report-home', platform: 'darwin', budgetMs: 120000, wallNow: () => Date.parse('2026-11-03T00:00:00Z') });
  context.io.inspect = async () => { throw Object.assign(new Error('fixture denied'), { code: 'EACCES' }); };
  context.io.withVerifiedFile = async () => { throw Object.assign(new Error('fixture denied'), { code: 'EACCES' }); };
  const rules = { rules: [{ id: 'fixture-ioc', product: 'fixture', sourceUrl: 'https://www.cisa.gov/cybersecurity-advisories/fixture', platform: 'darwin', verified: true,
    verifiedAt: '2026-11-01', expiresAt: '2026-11-30T00:00:00Z', iocs: [
      { type: 'exact-path', relativePath: 'Projects/fixture' }, { type: 'sha256', target: 'exact-file', relativePath: 'Projects/fixture', value: 'a'.repeat(64) },
      { type: 'process-name', value: 'fixture-process' },
    ] }] };
  try {
    // Act
    const iocs = await checkIocs({ processes: [], coverage: [{ area: 'processes', status: 'partial' }] }, { context, rules });
    // Assert
    assert.deepEqual(iocs.checks.map(check => [check.kind, check.matched, check.status]), [['path', null, 'denied'], ['sha256', null, 'denied'], ['process', null, 'partial']]);
    for (const language of ['JA', 'EN']) {
      const report = renderReport({ locale: resolveLanguage({ explicit: language }), iocs, status: 'partial' });
      const matches = report.split('\n').filter(line => /^\| (path|sha256|process) \|/.test(line)).map(line => line.split('|')[3].trim());
      assert.deepEqual(matches, language === 'JA' ? ['未確認', '未確認', '未確認'] : ['Unassessed', 'Unassessed', 'Unassessed']);
    }
  } finally { await context.close(); }
});

test('completed IOC observations retain an explicit match or non-match beside unknown checks', () => {
  // Arrange
  const iocs = { checks: [{ kind: 'process', value: 'present', matched: true }, { kind: 'path', value: 'absent', matched: false }, { kind: 'sha256', value: 'unread', matched: null, status: 'deferred-not-local' }] };
  // Act
  const report = renderReport({ locale: resolveLanguage({ explicit: 'EN' }), iocs });
  const matches = report.split('\n').filter(line => /^\| (path|sha256|process) \|/.test(line)).map(line => line.split('|')[3].trim());
  // Assert
  assert.deepEqual(matches, ['Matched', 'No match', 'Unassessed']);
});

test('English coverage preserves TCP, UDP, notarization and normal-resume limits using stable reason codes', () => {
  // Arrange
  const coverage = [
    { area: 'network', status: 'partial', reason: '現在の利用者に見えるTCP接続のみ。UDP・過去の通信・権限制限の領域は未確認です。' },
    { area: 'applications', status: 'partial', reason: 'Info.plist・既存の同梱版metadata・署名表示だけを確認。チケットの存在は公証の有効性を証明しません。' },
    { area: 'lockfiles', status: 'partial', reason: '同じroot実体のfrontier・directory位置を保存し、通常の再実行で継続します。リンク・依存/build配下は探索しません。' },
    { area: 'ssh-metadata', status: 'partial', reason: '鍵・設定本文は読まず、存在・権限・時刻だけを確認します。authorized_keysの行数は本文を開かないためunknownです。' },
  ];
  // Act
  const normalized = coverage.map(normalizeCoverageEntry);
  const report = renderReport({ locale: resolveLanguage({ explicit: 'EN' }), match: { coverage: normalized } });
  // Assert
  assert.deepEqual(normalized.map(entry => entry.reasonCode), ['network-current-user-tcp', 'application-metadata-only', 'discovery-resume', 'ssh-metadata-only']);
  assert.match(report, /Only current TCP connections visible to this user/);
  assert.match(report, /UDP, historical traffic and permission-restricted areas remain unassessed/);
  assert.match(report, /presence of a notarization ticket does not prove that notarization is valid/);
  assert.match(report, /saved for the next normal run/);
  assert.match(report, /Symlinks, dependency directories and build output are not explored/);
  assert.match(report, /authorized_keys line count remains unknown/);
  assert.doesNotMatch(report, /[\u3040-\u30ff\u3400-\u9fff]/);
});

test('CISA exploited-vulnerability highlights retain their public CVE source link without accepting arbitrary query values', () => {
  // Arrange
  const url = 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=CVE-2026-1234';
  const item = { id: 'CVE-2026-1234', title: 'Known exploited fixture', url, sourceId: 'cisa-kev', categories: ['incidents'], knownExploited: true };
  // Act
  const report = renderReport({ locale: resolveLanguage({ explicit: 'EN' }), news: { items: [item] }, finishedAt: '2026-11-03T00:00:00Z' });
  // Assert
  assert.ok(report.includes('[Source](https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field%5Fcve=CVE-2026-1234)'));
  assert.equal(safeSourceUrl(`${url}&token=fixture`), null);
  assert.equal(safeSourceUrl(`${url}&field_cve=CVE-2026-5678`), null);
  assert.equal(safeSourceUrl('https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=private-value'), null);
});

test('English product assessments show product names and observed versions instead of internal Japanese rule titles', () => {
  // Arrange
  const inventory = { generatedAt: '2026-11-03T00:00:00Z', host: { osVersion: '27.2' }, runtimes: [
    { name: 'node', version: '24.22.1' }, { name: 'node', version: '26.12.1' },
  ], coverage: [{ area: 'runtimes', status: 'complete' }] };
  const rule = { id: 'fixture-node-fixed', title: '内蔵ライブラリの修正確認', kind: 'runtime', runtimeName: 'node', verified: true,
    verifiedAt: '2026-11-03', supportedMajors: [24, 26], affectedRanges: ['>=24.0.0, <24.22.1', '>=26.0.0, <26.12.1'], sourceUrl: 'https://nodejs.org/en/blog/vulnerability/example' };
  // Act
  const findings = [matchRule(inventory, rule), ...matchSecurityReleases(inventory, [{ title: 'macOS 27.2', url: 'https://support.apple.com/en-us/100100' }])];
  const report = renderReport({ locale: resolveLanguage({ explicit: 'EN' }), inventory, match: { findings }, finishedAt: '2026-11-03T00:00:00Z' });
  // Assert
  assert.match(report, /node 24\.22\.1, 26\.12\.1/);
  assert.match(report, /macOS 27\.2/);
  assert.doesNotMatch(report, /内蔵ライブラリ|セキュリティ更新|を確認/);
});

test('an explicit language overrides the conversation and saved preference', () => {
  // Arrange
  const options = { explicit: 'EN', conversation: 'ja', saved: 'es' };
  // Act
  const locale = resolveLanguage(options);
  // Assert
  assert.deepEqual(locale, { requestedLanguage: 'en', canonicalLanguage: 'en', translationStatus: 'not-required' });
});

test('English findings retain mixed work and personal scope plus the exact distribution identity', () => {
  // Arrange
  const data = { locale: resolveLanguage({ explicit: 'EN' }), finishedAt: '2026-11-03T00:00:00Z', match: { findings: [{
    id: 'CVE-2026-1234', advisoryId: 'CVE-2026-1234', status: '影響なし', version: '3.0.14-1~deb12u2', scope: '仕事 / 個人・その他',
    package: { name: 'openssl', ecosystem: 'Debian:12', distribution: 'debian', distributionRelease: '12', architecture: 'arm64', sourcePackage: 'openssl', sourceVersion: '3.0.14-1~deb12u2' },
    queriedAt: '2026-11-03T00:00:00Z', reasonCode: 'fixed-version', sources: ['https://www.debian.org/security/2026/dsa-1234'],
  }] } };
  // Act
  const report = renderReport(data);
  // Assert
  assert.match(report, /Work \/ Personal \/ other/);
  assert.match(report, /Debian:12 \/ debian \/ 12 \/ arm64 \/ openssl \/ 3\.0\.14-1\\~deb12u2/);
  assert.doesNotMatch(report, /仕事|個人・その他/);
});

test('conversation language overrides a previous run and an unsupported native language requires translation', () => {
  // Arrange
  const options = { conversation: 'es-MX', saved: 'ja' };
  // Act
  const locale = resolveLanguage(options);
  // Assert
  assert.deepEqual(locale, { requestedLanguage: 'es-MX', canonicalLanguage: 'en', translationStatus: 'pending' });
  assert.deepEqual(resolveLanguage({ saved: 'EN-us' }), { requestedLanguage: 'en', canonicalLanguage: 'en', translationStatus: 'not-required' });
  assert.deepEqual(resolveLanguage(), { requestedLanguage: 'ja', canonicalLanguage: 'ja', translationStatus: 'not-required' });
  assert.equal(normalizeLanguage('JA-jp'), 'ja');
});

test('malformed language options fail with a usage diagnostic rather than becoming paths', () => {
  // Arrange
  const invalid = [undefined, '', ' en ', '../en', 'en\n', 'en_US', 'e', 'english', 'en-x', 'en-'.repeat(40)];
  // Act / Assert
  for (const value of invalid) assert.throws(() => normalizeLanguage(value), error => error.diagnostic.code === 'MSS_USAGE');
});

test('English diagnostic recovery preserves only the projected code and context', () => {
  // Arrange
  const diagnostic = { code: 'MSS_TRANSLATION_PENDING', message: '翻訳未完了', recovery: '再翻訳', operation: 'report', context: { schema: 2 } };
  // Act
  const translated = localizeDiagnostic(diagnostic, 'en');
  // Assert
  assert.equal(translated.message, 'The requested-language report has not been delivered.');
  assert.equal(translated.recovery, 'Translate the saved canonical report and commit that translation. Do not repeat the scan.');
  assert.equal(translated.code, 'MSS_TRANSLATION_PENDING');
  assert.deepEqual(translated.context, { schema: 2 });
  assert.doesNotMatch(JSON.stringify(translated), /[\u3040-\u30ff\u3400-\u9fff]/);
});

test('unrelated critical news remains ahead of local results and highlights have five deduplicated items at most', () => {
  // Arrange
  const items = [
    { id: 'CVE-2026-1000', aliases: ['GHSA-public-alias'], title: 'Unrelated critical Linux advisory', severity: 'CRITICAL', categories: ['linux'], publishedAt: '2026-11-02T23:00:00Z', url: 'https://www.debian.org/security/2026/dsa-1000' },
    { id: 'GHSA-public-alias', title: 'Duplicate Linux advisory', severity: 'CRITICAL', categories: ['linux'], publishedAt: '2026-11-02T22:00:00Z', url: 'https://github.com/advisories/GHSA-public-alias' },
    ...Array.from({ length: 7 }, (_, index) => ({ id: `CVE-2026-200${index}`, title: `Other high advisory ${index}`, severity: 'HIGH', categories: ['php'], publishedAt: '2026-11-01T00:00:00Z', url: `https://www.php.net/releases/2026/${index}` })),
  ];
  const data = { locale: resolveLanguage({ explicit: 'EN' }), finishedAt: '2026-11-03T00:00:00Z', news: { items }, match: { newsAssessment: items.map(item => ({ id: item.id, relevance: '関係なし' })) } };
  // Act
  const report = renderReport(data);
  const highlights = report.split('## Important news\n')[1].split('## Results for this Mac')[0];
  // Assert
  assert.equal((highlights.match(/^- \*\*/gm) || []).length, 5);
  assert.match(highlights, /Unrelated critical Linux advisory/);
  assert.doesNotMatch(highlights, /Duplicate Linux advisory/);
  assert.match(highlights, /No recorded relevance/);
  assert.ok(report.indexOf('Unrelated critical Linux advisory') < report.indexOf('## Results for this Mac'));
});

test('installed high-impact news ranks before equally severe unrelated news while low unrelated news stays in its category', () => {
  // Arrange
  const items = [
    { id: 'CVE-2026-3000', title: 'General high issue', severity: 'HIGH', categories: ['java'], url: 'https://openjdk.org/groups/vulnerability/advisories/2026-10-20' },
    { id: 'CVE-2026-3001', title: 'Installed OpenSSL issue', severity: 'HIGH', categories: ['tls'], url: 'https://openssl-library.org/news/vulnerabilities/' },
    { id: 'CVE-2026-3002', title: 'Low unrelated Ruby issue', severity: 'LOW', categories: ['ruby'], url: 'https://www.ruby-lang.org/en/news/2026/11/02/security/' },
  ];
  const data = { locale: resolveLanguage({ explicit: 'EN' }), news: { items }, match: { newsAssessment: [
    { id: 'CVE-2026-3000', relevance: '関係なし' }, { id: 'CVE-2026-3001', relevance: '関係あり' }, { id: 'CVE-2026-3002', relevance: '関係なし' },
  ] } };
  // Act
  const report = renderReport(data);
  const highlights = report.split('## Important news\n')[1].split('## Results for this Mac')[0];
  // Assert
  assert.ok(highlights.indexOf('Installed OpenSSL issue') < highlights.indexOf('General high issue'));
  assert.doesNotMatch(highlights, /Low unrelated Ruby issue/);
  assert.match(report.split('### Ruby')[1], /Low unrelated Ruby issue/);
});

test('withdrawn advisories stay dated in category lists and never become priority news', () => {
  // Arrange
  const items = [{ id: 'GHSA-withdrawn-fixture', title: 'Withdrawn fixture issue', severity: 'CRITICAL', knownExploited: true,
    withdrawnAt: '2026-11-02T00:00:00Z', categories: ['mac-apps'], url: 'https://github.com/advisories/GHSA-withdrawn-fixture' }];
  // Act / Assert
  for (const language of ['EN', 'JA']) {
    const report = renderReport({ locale: resolveLanguage({ explicit: language }), news: { items }, match: { newsAssessment: [{ id: items[0].id, relevance: '関係あり' }] } });
    assert.doesNotMatch(report, /\*\*Withdrawn fixture issue\*\*/);
    assert.match(report, /Withdrawn fixture issue/);
    assert.match(report, /2026-11-02T00:00:00Z/);
    assert.match(report, language === 'EN' ? /Not used to establish current exposure/ : /現在の影響判定には使用しません/);
  }
});

test('crowded highlights retain both locally relevant high-impact news and unrelated known exploitation', () => {
  // Arrange
  for (const localExploitation of [false, true]) {
    const items = [
      ...Array.from({ length: 8 }, (_, index) => ({ id: `GHSA-local-fixture${index}`, title: `Local high issue ${index}`, severity: 'HIGH', knownExploited: localExploitation, relevance: '関係あり', categories: ['mac-apps'] })),
      ...Array.from({ length: 8 }, (_, index) => ({ id: `CVE-2026-500${index}`, title: `World exploitation ${index}`, knownExploited: true, relevance: '関係なし', categories: ['linux'] })),
    ];
    // Act
    const report = renderReport({ locale: resolveLanguage({ explicit: 'EN' }), news: { items }, match: { newsAssessment: items } });
    const highlights = report.split('## Important news\n')[1].split('## Results for this Mac')[0];
    // Assert
    assert.equal((highlights.match(/^- \*\*/gm) || []).length, 5);
    assert.match(highlights, /Local high issue 0/);
    assert.match(highlights, /World exploitation 0/);
    assert.match(highlights, /Known exploitation/);
  }
});

test('English Xcode release checks describe the observed product without calling it macOS', () => {
  // Arrange
  const finding = { id: 'security-update:xcode:27.2', product: 'Xcode', version: '27.2', status: '影響なし', category: 'update-review',
    reasonCode: 'security-release-reached', historyScope: 'official-release-index', sources: ['https://support.apple.com/en-us/149589'] };
  // Act
  const report = renderReport({ locale: resolveLanguage({ explicit: 'EN' }), match: { findings: [finding] } });
  // Assert
  assert.match(report, /Xcode 27\.2/);
  assert.match(report, /The observed product version has reached this security release/);
  assert.match(report, /Product version observed/);
  assert.doesNotMatch(report, /Update advisory needs review/);
  assert.doesNotMatch(report, /The observed macOS version has reached this security release/);
});

test('Japanese affected rows preserve observed installation without claiming execution or compromise', () => {
  // Arrange
  const finding = { id: 'GHSA-installed-fixture', package: { name: 'example', ecosystem: 'npm' }, version: '1.0.0', status: '可能性高',
    reasonCode: 'package-osv-affected', reason: '実際のインストール・実行・到達可能性・攻撃 IOC は未確認', impact: { installationConfirmed: true } };
  // Act
  const report = renderReport({ locale: resolveLanguage({ explicit: 'JA' }), match: { findings: [finding] } });
  // Assert
  assert.match(report, /インストール済みのバージョンを確認しましたが、入手元・実行条件・侵害の有無は別途確認が必要/);
  assert.doesNotMatch(report, /実際のインストール・実行・到達可能性・攻撃 IOC は未確認/);
});

test('news-only checkpoints explicitly preserve unstarted local checks and a previous positive', () => {
  // Arrange
  const data = { locale: resolveLanguage({ explicit: 'EN' }), stageStatus: { inventory: 'pending' }, status: 'partial', collectionCoverage: 'partial', queryCoverage: 'partial',
    changes: { unconfirmed: [{ id: 'GHSA-old-positive', title: 'example 1.0.0', status: '可能性高', observedAt: '2026-10-01T00:00:00Z' }] } };
  // Act
  const report = renderReport(data);
  // Assert
  assert.match(report, /The local scan has not started/);
  assert.match(report, /Processing: Partial; Local collection: Partial; Queries: Partial/);
  assert.match(report, /Previously positive; not rechecked in this run/);
  assert.match(report, /2026-10-01T00:00:00Z/);
  assert.doesNotMatch(report, /No vulnerabilities|No compromise|All safe/);
});

test('a failed source, affected dependency and unsupported IOC retain independent meanings in English', () => {
  // Arrange
  const data = { locale: resolveLanguage({ explicit: 'EN' }), status: 'partial', stageStatus: { inventory: 'complete' }, collectionCoverage: 'complete', queryCoverage: 'partial',
    news: { categoryCoverage: [{ category: 'php', status: 'partial' }], sources: [{ name: 'PHP Security', status: 'failed', diagnostic: { code: 'MSS_HTTP', message: '取得失敗', recovery: '後で再試行' }, cooldownUntil: '2026-11-03T02:00:00Z', attempts: 2 }] },
    match: { findings: [{ id: 'GHSA-fixture-positive', package: { name: 'example', ecosystem: 'npm' }, version: '1.0.0', status: '可能性高', reason: '影響版です', scope: '仕事', severity: 'HIGH' }],
      coverage: [{ area: 'source:php', status: 'failed', reason: '取得失敗' }] },
    iocs: { checks: [{ kind: 'sha256', value: '/example/file', status: 'unsupported', reason: '対象外' }] } };
  // Act
  const report = renderReport(data);
  // Assert
  assert.match(report, /Local collection: Complete; Queries: Partial/);
  assert.match(report, /Likely affected \| example 1.0.0/);
  assert.match(report, /sha256 \| \/example\/file \| Unassessed/);
  assert.match(report, /MSS\\_HTTP/);
  assert.match(report, /Retry after: 2026-11-03T02:00:00Z/);
  assert.doesNotMatch(report, /[\u3040-\u30ff\u3400-\u9fff]/);
});

test('fresh empty categories are distinct from missing categories and every required category is visible', () => {
  // Arrange
  const data = { locale: resolveLanguage({ explicit: 'EN' }), news: { categoryCoverage: [{ category: 'php', status: 'fresh', fetchedAt: '2026-11-03T00:00:00Z' }, { category: 'ruby', status: 'partial' }], items: [] } };
  // Act
  const report = renderReport(data);
  // Assert
  assert.match(report, /PHP \| Retrieved in this run \| 0 \| 2026-11-03T00:00:00Z \| No in-window articles were confirmed in the retrieved records/);
  assert.match(report, /Ruby \| Partial \| 0 \| Unassessed \| Current information/);
  for (const category of ['macOS', 'iOS / iPadOS', 'Mac applications', 'Homebrew', 'Linux', 'PHP', 'TLS / OpenSSL', 'ImageMagick', 'Ruby', 'Java / JDK', 'Docker / containers']) assert.ok(report.includes(`| ${category} |`), category);
});

for (const [language, categoryName, explanation, zeroMessage, missingMessage] of [
  ['JA', 'Docker / コンテナ', '公開日・更新日が不明な記事が24件あり、収集期間内の記事か判定できません。', '取得済みの情報では、期間内と確認できた記事は0件です。', 'このカテゴリの最新情報を取得できていません。'],
  ['EN', 'Docker / containers', 'Publication and update dates are unavailable for 24 articles; whether they fall within the discovery window is unconfirmed.', 'No in-window articles were confirmed in the retrieved records.', 'Current information for this category was not retrieved.'],
]) {
  for (const status of ['fresh', 'partial']) test(`${language} categories with ${status} retrieval and undated articles do not claim an empty discovery window`, () => {
    // Arrange
    const data = { locale: resolveLanguage({ explicit: language }), news: { items: [], categoryCoverage: [
      { category: 'docker', status, datedItemCount: 0, undatedCount: 24, windowStatus: 'partial', reasonCode: status === 'fresh' ? 'PRIMARY_SOURCE_FETCHED_WITH_UNDATED_ITEMS' : 'PRIMARY_SOURCE_UNDATED_ITEMS' },
    ], sources: [{ name: 'Docker security announcements', status: 'ok', itemCount: 24, datedItemCount: 0, undatedCount: 24, reasonCode: 'SOURCE_UNDATED_ITEMS' }] } };
    // Act
    const report = renderReport(data);
    const categoryRow = report.split('\n').find(line => line.startsWith(`| ${categoryName} |`));
    const sourceRow = report.split('\n').find(line => line.startsWith('| Docker security announcements |'));
    // Assert
    assert.ok(categoryRow.includes(explanation));
    assert.ok(categoryRow.includes('| 0 |'));
    assert.ok(!categoryRow.includes(zeroMessage));
    assert.ok(!categoryRow.includes(missingMessage));
    assert.ok(sourceRow.includes(explanation));
    assert.ok(sourceRow.includes(language === 'JA' ? '期間内と確認できた記事数: 0.' : 'Confirmed in-window articles: 0.'));
    if (language === 'EN') assert.doesNotMatch(report, /[\u3040-\u30ff\u3400-\u9fff]/);
  });
}

test('mixed dated and undated category results show the confirmed count and retain the date gap', () => {
  // Arrange
  const data = { locale: resolveLanguage({ explicit: 'EN' }), news: { window: { since: '2026-10-04T00:00:00Z', until: '2026-11-03T00:00:00Z' },
    items: [{ id: 'docker-dated', title: 'Dated Docker advisory', categories: ['docker'], updatedAt: '2026-11-02T00:00:00Z' },
      { id: 'docker-undated', title: 'Undated Docker advisory', categories: ['docker'] }],
    categoryCoverage: [{ category: 'docker', status: 'fresh', datedItemCount: 1, undatedCount: 1, windowStatus: 'partial', reasonCode: 'PRIMARY_SOURCE_FETCHED_WITH_UNDATED_ITEMS' }] } };
  // Act
  const report = renderReport(data);
  const categoryRow = report.split('\n').find(line => line.startsWith('| Docker / containers |'));
  // Assert
  assert.match(categoryRow, /Retrieved in this run \| 1 \|/);
  assert.match(categoryRow, /dates are unavailable for 1 article; whether they fall within the discovery window is unconfirmed/);
  assert.match(report, /Dated Docker advisory/);
  assert.match(report, /Undated Docker advisory/);
});

test('month-only news keeps its date uncertainty through local matching and never becomes a confirmed empty category', () => {
  // Arrange
  const news = { window: { since: '2026-10-04T00:00:00Z', until: '2026-11-03T00:00:00Z' },
    items: [{ id: 'docker-month', title: 'Monthly Docker advisory', categories: ['docker'], categoryStatus: 'explicit', publishedAt: null, publishedMonth: '2026-10', datePrecision: 'month' }],
    categoryCoverage: [{ category: 'docker', status: 'fresh', datedItemCount: 0, impreciseCount: 1, uncertainItemCount: 1, undatedCount: 0, unclassifiedCount: 0, windowStatus: 'partial' }],
    sources: [{ name: 'Docker security announcements', status: 'partial', itemCount: 1, datedItemCount: 0, impreciseCount: 1, uncertainItemCount: 1 }] };
  const match = matchInventory({}, news, { now: new Date('2026-11-03T00:00:00Z') });
  // Act / Assert
  for (const language of ['JA', 'EN']) {
    const report = renderReport({ locale: resolveLanguage({ explicit: language }), news, match });
    const categoryRow = report.split('\n').find(line => line.startsWith(language === 'JA' ? '| Docker / コンテナ |' : '| Docker / containers |'));
    const sourceRow = report.split('\n').find(line => line.startsWith('| Docker security announcements |'));
    assert.match(report, language === 'JA' ? /2026-10 \(日付は月まで判明\)/ : /2026-10 \(day not provided\)/);
    assert.doesNotMatch(report, /2026-10-01/);
    assert.match(categoryRow, language === 'JA' ? /1件は日付の精度が足りず、期間内か確定できません/ : /1 article lacks enough date precision/);
    assert.match(sourceRow, language === 'JA' ? /1件は年月のみ判明/ : /1 article is dated only to the month/);
    assert.doesNotMatch(categoryRow, /期間内と確認できた記事は0件|No in-window articles were confirmed/);
  }
});

test('unclassified fetched articles remain visible without proving zero articles for the maintained product category', () => {
  // Arrange
  const news = { window: { since: '2026-10-04T00:00:00Z', until: '2026-11-03T00:00:00Z' },
    items: [{ id: 'unknown-product', title: 'Unclassified product update', categories: ['general'], categoryStatus: 'unconfirmed', publishedAt: '2026-11-02T00:00:00Z' }],
    categoryCoverage: [{ category: 'macos', status: 'fresh', datedItemCount: 0, unclassifiedCount: 1, windowStatus: 'partial', reasonCode: 'PRIMARY_SOURCE_CATEGORY_UNCONFIRMED' }] };
  // Act
  const report = renderReport({ locale: resolveLanguage({ explicit: 'EN' }), news });
  const categoryRow = report.split('\n').find(line => line.startsWith('| macOS |'));
  // Assert
  assert.match(categoryRow, /1 article has unconfirmed product or OS classification and remains in general news/);
  assert.doesNotMatch(categoryRow, /No in-window articles were confirmed/);
  assert.match(report, /Unclassified product update/);
});

test('older category receipts count only dated in-window articles and preserve undated items', () => {
  // Arrange
  const data = { locale: resolveLanguage({ explicit: 'EN' }), news: { window: { since: '2026-10-04T00:00:00Z', until: '2026-11-03T00:00:00Z' },
    items: [{ id: 'old-dated', title: 'Earlier article', categories: ['docker'], updatedAt: '2026-09-01T00:00:00Z' },
      { id: 'undated', title: 'Undated article', categories: ['docker'] }], categoryCoverage: [{ category: 'docker', status: 'fresh' }] } };
  // Act
  const report = renderReport(data);
  const categoryRow = report.split('\n').find(line => line.startsWith('| Docker / containers |'));
  // Assert
  assert.match(categoryRow, /Retrieved in this run \| 0 \|/);
  assert.match(categoryRow, /dates are unavailable for 1 article/);
  assert.doesNotMatch(categoryRow, /No in-window articles were confirmed/);
});

test('source listing counts include older entries without claiming they were all retained as general news', () => {
  // Arrange
  const news = { categoryCoverage: [{ category: 'mac-apps', status: 'fresh', datedItemCount: 20, unclassifiedCount: 0 }],
    sources: [{ name: 'Mozilla Security', status: 'ok', itemCount: 1008, unclassifiedCount: 1008 }] };
  // Act / Assert
  for (const language of ['JA', 'EN']) {
    const report = renderReport({ locale: resolveLanguage({ explicit: language }), news });
    const sourceRow = report.split('\n').find(line => line.startsWith('| Mozilla Security |'));
    assert.match(sourceRow, language === 'JA' ? /取得した一覧全体（期間外を含む）の1008件/ : /source listing includes 1008 articles/);
    if (language === 'EN') assert.match(sourceRow, /this count includes entries outside the discovery window/);
    assert.doesNotMatch(sourceRow, /その他のニュースに保持|remain in general news/);
  }
});

test('zero confirmed articles and an incomplete discovery window are explained together in the category row', () => {
  // Arrange
  const news = { categoryCoverage: [{ category: 'tls', status: 'fresh', datedItemCount: 0, undatedCount: 0, windowStatus: 'partial' }] };
  // Act / Assert
  for (const language of ['JA', 'EN']) {
    const report = renderReport({ locale: resolveLanguage({ explicit: language }), news });
    const row = report.split('\n').find(line => line.startsWith('| TLS / OpenSSL |'));
    assert.match(row, language === 'JA' ? /取得済みの情報では、期間内と確認できた記事は0件です。 収集期間全体を確認できていません。/ : /No in-window articles were confirmed in the retrieved records\. The full discovery window has not been checked\./);
  }
});

test('a requested Spanish report remains pending even after local collection finishes', () => {
  // Arrange
  const data = { locale: resolveLanguage({ explicit: 'es' }), stageStatus: { inventory: 'complete' }, collectionCoverage: 'complete', queryCoverage: 'complete', status: 'complete' };
  // Act
  const report = renderReport(data);
  // Assert
  assert.match(report, /Requested language: es; Canonical language: en/);
  assert.match(report, /The requested-language translation is pending/);
  assert.match(report, /Translate it without repeating the scan/);
  assert.doesNotMatch(report, /[\u3040-\u30ff\u3400-\u9fff]/);
});

test('advisory titles and package names cannot inject headings, images, HTML or unsafe links', () => {
  // Arrange
  const attack = 'title\\\n# Forged safe\n![pixel](https://evil.example/x)<img src=x> | **done**';
  const data = { locale: resolveLanguage({ explicit: 'EN' }), news: { items: [{ id: 'CVE-2026-4000', title: attack, severity: 'CRITICAL', url: 'javascript:alert(1)', categories: ['mac-apps'] }] },
    match: { findings: [{ id: 'GHSA-fixture-injection', package: { name: attack, ecosystem: 'npm' }, version: '1.0.0', status: '可能性高', sources: ['file:///private/secret'] }] } };
  // Act
  const report = renderReport(data);
  // Assert
  assert.doesNotMatch(report, /^# Forged/m);
  assert.doesNotMatch(report, /(?<!\\)!\[|<img|\]\((?:javascript|file|data):/);
  assert.match(report, /&lt;img src=x&gt;/);
  assert.equal(escapeReportText('a|b\n[c]'), 'a\\|b \\[c\\]');
  assert.equal(escapeReportText('https://evil.example www.evil.example person@evil.example'), 'https&#58;//evil.example www&#46;evil.example person&#64;evil.example');
});

test('source links reject credentials, nonstandard ports, unsupported hosts and unreviewed query values', () => {
  // Arrange
  const rejected = ['http://osv.dev/test', 'https://osv.dev:8443/test', 'https://user:password@osv.dev/test', 'https://evil.example/test',
    'https://osv.dev.evil.example/test', 'file:///private/file', 'javascript:alert(1)', 'data:text/html,hi', 'https://osv.dev/test?token=secret', 'https://osv.dev/\n#safe'];
  // Act / Assert
  for (const url of rejected) assert.equal(safeSourceUrl(url), null);
  assert.equal(safeSourceUrl('https://osv.dev/vulnerability/GHSA-example'), 'https://osv.dev/vulnerability/GHSA-example');
});

test('verified non-affected assessments retain version, distribution, history and retrieval scope', () => {
  // Arrange
  const data = { locale: resolveLanguage({ explicit: 'EN' }), match: { findings: [{ id: 'CVE-2020-5000', package: { name: 'example', ecosystem: 'Debian:12' },
    version: '1:2.0-3+deb12u1', distribution: 'Debian', release: '12', historyScope: 'CVE-2020-5000 full history', fetchedAt: '2026-11-03T00:00:00Z',
    status: '影響なし', reasonCode: 'fixed-version', sources: ['https://security-tracker.debian.org/tracker/CVE-2020-5000'] }] } };
  // Act
  const report = renderReport(data);
  // Assert
  assert.match(report, /Not affected within the assessed scope \| example 1:2.0-3\\\+deb12u1/);
  assert.match(report, /The observed version includes the advisory-specific fix/);
  assert.match(report, /Debian \/ 12 \/ CVE-2020-5000 full history \/ 2026-11-03T00:00:00Z/);
  assert.match(report, /It is not a safety judgment for the entire Mac/);
});

test('English update and image evidence retains its limits without untranslated explanations', () => {
  // Arrange
  const data = { locale: resolveLanguage({ explicit: 'EN' }), match: { findings: [
    { id: 'macos-security-release', product: 'macOS', version: '15.1', status: '可能性あり', reasonCode: 'security-release-review', reason: '同じメジャーの更新情報を確認' },
  ] }, packages: { coverage: [{ area: 'image-sbom', status: 'partial', reasonCode: 'image-sbom-missing', reason: '内部は未確認' }] },
  news: { window: { since: '2026-10-04T00:00:00Z' }, items: [{ id: 'CVE-2020-6000', title: 'Ongoing reviewed item', ongoing: true, categories: ['linux'] }] } };
  // Act
  const report = renderReport(data);
  // Assert
  assert.match(report, /release index alone does not establish CVE applicability/);
  assert.match(report, /No digest-bound SBOM is available; the image contents remain unassessed/);
  assert.match(report.split('## Ongoing items')[1].split('## News by category')[0], /Ongoing reviewed item/);
  assert.doesNotMatch(report, /[\u3040-\u30ff\u3400-\u9fff]/);
});
