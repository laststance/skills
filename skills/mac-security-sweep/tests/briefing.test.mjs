import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveLanguage } from '../scripts/locale.mjs';
import { matchInventory } from '../scripts/match.mjs';
import { renderReport, safeSourceUrl } from '../scripts/report.mjs';
import { assessedNews, selectBriefingAdvisories } from '../scripts/briefing.mjs';
import { checkBriefing, runBriefingCli } from '../scripts/check-briefing.mjs';

const javaArticle = {
  id: '567427b15ace73d94f50', sourceId: 'hackernews', categories: ['java'], needsReview: true,
  title: 'Oracle to Patch 11 Java Flaws Today as Critical OpenJDK RCE (CVE-2026-114938) Report Emerges',
  url: 'https://thehackernews.com/2026/11/oracle-to-patch-11-java-flaws-today-as.html',
};

test('an unrated Java disclosure reaches the five headlines and an omitted CVE fails the chat check on an older snapshot', () => {
  // Arrange
  const inventory = { runtimes: [{ name: 'java', version: '17.0.21.0.3' }], host: { architecture: 'arm64' } };
  const otherNews = Array.from({ length: 8 }, (_, index) => ({
    id: `CVE-2026-510${index}`, title: `Other product ${index}`, knownExploited: true, categories: ['general'],
  }));
  const news = { items: [...otherNews, javaArticle] };
  const match = matchInventory(inventory, news);

  // Act
  const required = selectBriefingAdvisories(assessedNews(news, match));
  const report = renderReport({ locale: resolveLanguage({ explicit: 'JA' }), inventory, news, match });
  const headlines = report.split('## 重要なニュース\n')[1].split('### ')[0];

  // Assert
  assert.equal((headlines.match(/^- \*\*/gm) || []).length, 5);
  assert.match(headlines, /CVE-2026-114938/);
  assert.deepEqual(required.map(entry => entry.id), ['CVE-2026-114938']);
  assert.deepEqual(checkBriefing(required, '古いレポートの要約。').missingIds, ['CVE-2026-114938']);
  assert.deepEqual(checkBriefing(required, 'Java（CVE-2026-114938）。このJDKの対象条件は未確認。').missingIds, []);
  assert.equal(match.findings.some(finding => finding.advisoryId === 'CVE-2026-114938'), false);
  assert.doesNotMatch(headlines.split(javaArticle.title.split(' (')[0])[1].split('\n\n')[0], /悪用確認あり/);
});

test('a crowded briefing keeps every distinct local urgent advisory including co-mentioned IDs without counting syndicated copies twice', () => {
  // Arrange
  const items = [...Array.from({ length: 8 }, (_, index) => ({ id: `story-${index}`, relevance: '関係あり',
    title: `Browser zero-day CVE-2026-620${index}`, needsReview: true })),
    { id: 'duplicate', title: 'Browser RCE in CVE-2026-6200 and CVE-2026-6210', relevance: '関係あり' },
    { id: 'withdrawn', title: 'Critical Browser CVE-2026-6211', relevance: '関係あり', withdrawnAt: '2026-11-10' },
    { id: 'elsewhere', title: 'Other platform RCE CVE-2026-6212', relevance: '関係なし' },
    { id: 'routine', title: 'Browser maintenance CVE-2026-6213', relevance: '関係あり' }];
  // Act
  const required = selectBriefingAdvisories(items);
  const report = renderReport({ locale: resolveLanguage({ explicit: 'EN' }), news: { items } });
  const delivery = report.split('### Priority advisories for the chat report\n')[1].split('## Results for this Mac')[0];
  // Assert
  assert.deepEqual(required.map(entry => entry.id).sort(), ['CVE-2026-6200', 'CVE-2026-6201', 'CVE-2026-6202', 'CVE-2026-6203',
    'CVE-2026-6204', 'CVE-2026-6205', 'CVE-2026-6206', 'CVE-2026-6207', 'CVE-2026-6210']);
  assert.equal(checkBriefing(required, delivery).missingIds.length, 0);
  assert.equal(checkBriefing(required, 'CVE-2026-62001 [link](https://nvd.nist.gov/vuln/detail/CVE-2026-6200)').missingIds.length, 9);
  assert.equal(checkBriefing(required, '<!-- CVE-2026-6200 -->\n~~~\nCVE-2026-6201\n~~~\n[ref]: https://example.org/CVE-2026-6202').missingIds.length, 9);
});

test('news-only checkpoints retain a public warning and a disclosure without a CVE can be reported by its source', () => {
  // Arrange
  const unnumbered = { id: 'vendor-notice', relevance: '確認候補', matchedProducts: ['Firefox'],
    title: 'Firefox zero-day update', url: 'https://www.mozilla.org/en-US/security/advisories/mfsa2026-80/' };
  const newsOnly = { ...javaArticle, relevance: '未確認', reasonCode: 'inventory-not-started' };
  // Act
  const required = selectBriefingAdvisories([newsOnly, unnumbered]);
  // Assert
  assert.equal(required.length, 2);
  assert.deepEqual(checkBriefing(required, 'CVE-2026-114938 は未確認。'), { required: 2, missingIds: [], missingArticles: 1 });
  assert.deepEqual(checkBriefing(required, `CVE-2026-114938 は未確認。Firefox も要確認。[公式](${unnumbered.url})`),
    { required: 2, missingIds: [], missingArticles: 0 });
});

test('an installed JDK sends the dated vendor bulletin to primary review even if the secondary feed is missing', () => {
  // Arrange
  const news = { items: [{ id: 'vendor-index-link', sourceId: 'openjdk', title: 'OpenJDK security advisory 2026-11-17', products: ['Java'],
    url: 'https://openjdk.org/groups/vulnerability/advisories/2026-11-17', reasonCode: 'OFFICIAL_INDEX_REQUIRES_RANGE_REVIEW' }] };
  const inventory = { runtimes: [{ name: 'java', version: '17.0.21' }] };
  // Act
  const match = matchInventory(inventory, news);
  const [entry] = selectBriefingAdvisories(assessedNews(news, match));
  // Assert
  assert.equal(entry.signal, 'index');
  assert.equal(entry.id, null);
  assert.equal(entry.item.url, 'https://openjdk.org/groups/vulnerability/advisories/2026-11-17');
  assert.deepEqual(match.findings, []);
});

test('official CVE links accept one exact public ID and a withdrawn detail cannot be revived by a headline', () => {
  // Arrange
  const valid = 'https://www.cve.org/CVERecord?id=CVE-2026-114938';
  const withdrawn = [{ id: 'CVE-2026-114938', withdrawn: '2026-11-18' }];
  // Act / Assert
  assert.equal(safeSourceUrl(valid), valid);
  for (const unsafe of [valid + '&id=CVE-2026-1234', valid + '&token=hidden', valid + '#secret', valid.replace('CVERecord', 'other'), valid.replace('114938', 'secret')]) assert.equal(safeSourceUrl(unsafe), null);
  assert.deepEqual(selectBriefingAdvisories([{ ...javaArticle, relevance: '関係あり' }], withdrawn), []);
});

test('one shared vendor URL cannot satisfy two unnumbered critical articles that require different assessments', () => {
  // Arrange
  const url = 'https://www.mozilla.org/en-US/security/advisories/';
  const items = ['Firefox zero-day in the renderer', 'Firefox RCE in the updater'].map(title => ({ title, url, relevance: '関係あり' }));
  // Act
  const required = selectBriefingAdvisories(items);
  // Assert
  assert.deepEqual(checkBriefing(required, 'Firefox zero-day in the renderer [公式](' + url + ')'), { required: 2, missingIds: [], missingArticles: 1 });
});

test('the read-only submission check rejects an incomplete draft or a mismatched generation and accepts the corrected text', async () => {
  // Arrange
  const home = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'mss-chat-check-')));
  const dir = path.join(home, 'security-reports', 'fixture');
  const file = path.join(dir, 'evidence.json');
  const bytes = JSON.stringify({ news: { items: [javaArticle] }, match: { newsAssessment: [{ id: javaArticle.id, relevance: '関係あり' }] } });
  const marker = JSON.stringify({ evidence: { name: 'evidence.json', hash: createHash('sha256').update(bytes).digest('hex') } });
  const output = [];
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, bytes);
    await fs.writeFile(path.join(dir, 'commit.json'), marker);
    const check = draft => runBriefingCli(['--evidence', file], { home, input: [draft], output: line => output.push(line) });
    // Act / Assert
    assert.equal(await check('古い原稿。'), 2);
    assert.deepEqual(JSON.parse(output.pop()), { required: 1, missingIds: ['CVE-2026-114938'], missingArticles: 0 });
    assert.equal(await check('Java の CVE-2026-114938 はCPU未確認。'), 0);
    assert.equal(await fs.readFile(file, 'utf8'), bytes);
    assert.equal(await fs.readFile(path.join(dir, 'commit.json'), 'utf8'), marker);
    assert.deepEqual(await fs.readdir(home), ['security-reports']);
    await fs.appendFile(file, ' ');
    assert.equal(await check('CVE-2026-114938'), 2);
    assert.match(output.pop(), /MSS_BRIEFING_UNVERIFIED/);
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});
