import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReport, safeSourceUrl, escapeReportText } from '../scripts/report.mjs';
import { normalizeLanguage, resolveLanguage, localizeDiagnostic } from '../scripts/locale.mjs';

test('an explicit language overrides the conversation and saved preference', () => {
  // Arrange
  const options = { explicit: 'EN', conversation: 'ja', saved: 'es' };
  // Act
  const locale = resolveLanguage(options);
  // Assert
  assert.deepEqual(locale, { requestedLanguage: 'en', canonicalLanguage: 'en', translationStatus: 'not-required' });
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
  assert.match(report, /PHP \| Retrieved in this run \| 0 \| 2026-11-03T00:00:00Z \| The successful query returned no articles/);
  assert.match(report, /Ruby \| Partial \| 0 \| Unassessed \| Current information/);
  for (const category of ['macOS', 'iOS / iPadOS', 'Mac applications', 'Homebrew', 'Linux', 'PHP', 'TLS / OpenSSL', 'ImageMagick', 'Ruby', 'Java / JDK', 'Docker / containers']) assert.ok(report.includes(`| ${category} |`), category);
});

for (const [language, categoryName, explanation, zeroMessage, missingMessage] of [
  ['JA', 'Docker / コンテナ', '公開日・更新日が不明な記事が24件あり、収集期間内の記事か判定できません。', '今回の取得期間に該当する記事は0件でした。', 'このカテゴリの最新情報を取得できていません。'],
  ['EN', 'Docker / containers', 'Publication and update dates are unavailable for 24 articles; whether they fall within the discovery window is unconfirmed.', 'The successful query returned no articles within this discovery window.', 'Current information for this category was not retrieved.'],
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
  assert.doesNotMatch(categoryRow, /successful query returned no articles/);
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

test('source links reject credentials, nonstandard ports, unsupported hosts and query strings', () => {
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
