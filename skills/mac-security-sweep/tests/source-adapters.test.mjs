import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES, NEWS_CATEGORIES } from '../scripts/source-registry.mjs';
import { SOURCE_PUBLIC_GETS, validateSourceRequest } from '../scripts/source-request-policy.mjs';
import { parseOfficialIndex, parseDockerAnnouncements, openSslPaths, parseOpenSslCve, parseRedHatList, parseAlpineSnapshot } from '../scripts/source-adapters.mjs';
import { fetchNews, parseXmlFeed, normalizeAdvisory } from '../scripts/fetch-news.mjs';
import { newsDateRange, newsWindowStatus } from '../scripts/news-format.mjs';
import { createRunContext } from '../scripts/runtime.mjs';

const source = id => SOURCES.find(value => value.id === id);
const NOW = Date.parse('2026-11-03T00:00:00Z');

test('PHP Atom selects the article link and never uses an enclosure download as the news URL', () => {
  // Arrange
  const xml = '<feed><entry><title>PHP security release</title><link rel="enclosure" href="https://www.php.net/php.tar.gz"/><link href="https://www.php.net/releases/8.5/en.php" rel="alternate"/><published>2026-11-01T00:00:00Z</published></entry></feed>';
  // Act
  const [item] = parseXmlFeed(xml, source('php'));
  // Assert
  assert.equal(item.url, 'https://www.php.net/releases/8.5/en.php');
  assert.deepEqual(item.categories, ['php']);
});

test('Repository advisories preserve branch-specific patched_versions instead of applying the global advisory schema', () => {
  // Arrange
  const data = { ghsa_id: 'GHSA-example', summary: 'Library fix', updated_at: '2026-11-01T00:00:00Z', vulnerabilities: [
    { package: { ecosystem: 'c/c++', name: 'ImageMagick' }, vulnerable_version_range: '< 7.1.2-35', patched_versions: '7.1.2-35' },
    { package: { ecosystem: 'c/c++', name: 'ImageMagick' }, vulnerable_version_range: '< 6.9.13-50', patched_versions: '6.9.13-50' },
  ] };
  // Act
  const item = normalizeAdvisory(data, source('imagemagick'));
  // Assert
  assert.deepEqual(item.affected.map(value => value.fixed), ['7.1.2-35', '6.9.13-50']);
  assert.equal(item.affected[0].ecosystem, 'c/c++');
});

test('An Electron issue explicitly limited to Windows does not count as a Mac application advisory', () => {
  // Arrange
  const data = { ghsa_id: 'GHSA-windows-only', summary: 'Electron Windows-only privilege escalation', updated_at: '2026-11-01T00:00:00Z' };
  // Act
  const article = normalizeAdvisory(data, source('electron'));
  // Assert
  assert.deepEqual(article.categories, ['general']);
  assert.equal(article.categoryStatus, 'explicit');
});

test('OpenJDK and Ruby indexes retain explicit calendar dates while Oracle month-only dates remain labeled as months', () => {
  // Arrange / Act
  const jdk = parseOfficialIndex('<a href="2026-10-20">2026/10/20</a>', source('openjdk'));
  const ruby = parseOfficialIndex('<a href="/en/news/2026/10/25/cve-fix/">CVE-2026-12345 fixed</a>', source('ruby-security'));
  const oracle = parseOfficialIndex('<a href="/security-alerts/cpuoct2026.html">Critical Patch Update October 2026</a><a href="/security-alerts/alert-CVE-2026-12345.html">Alert</a>', source('oracle'));
  // Assert
  assert.equal(jdk[0].publishedAt, '2026-10-20T00:00:00.000Z');
  assert.equal(ruby[0].publishedAt, '2026-10-25T00:00:00.000Z');
  assert.equal(oracle[0].datePrecision, 'month');
  assert.equal(oracle[0].publishedAt, null);
  assert.equal(oracle[0].publishedMonth, '2026-10');
  assert.equal(oracle[1].publishedAt, null);
});

test('Mozilla index uses each dated heading and retains an iOS advisory as global news', () => {
  // Arrange
  const html = '<h2>November 3, 2026</h2><a href="/en-US/security/advisories/mfsa2026-123/">Security Vulnerabilities fixed in Firefox for iOS 159</a>';
  // Act
  const [item] = parseOfficialIndex(html, source('mozilla'));
  // Assert
  assert.equal(item.publishedAt, '2026-11-03T00:00:00.000Z');
  assert.ok(item.products.includes('iOS'));
});

test('Each reviewed HTML index rejects schema drift instead of reporting zero security items', () => {
  // Arrange
  for (const id of ['openjdk', 'ruby-security', 'oracle', 'mozilla']) {
    // Act / Assert
    assert.throws(() => parseOfficialIndex('<html>Sign in SENTINEL</html>', source(id)), error => error.diagnostic.code === 'MSS_SOURCE');
  }
});

test('OpenSSL index admits only its exact CVE JSON paths and retains CNA range semantics', () => {
  // Arrange
  const html = '<a href="cve-2026-12345.json">CVE</a><a href="https://attacker.invalid/news/secjson/cve-2026-12345.json">bad</a>';
  const data = { dataType: 'CVE_RECORD', dataVersion: '5.1', cveMetadata: { cveId: 'CVE-2026-12345', dateUpdated: '2026-10-30T00:00:00Z' }, containers: { cna: {
    title: 'OpenSSL issue', datePublic: '2020-01-01T00:00:00Z', descriptions: [{ lang: 'en', value: 'Example' }],
    affected: [{ vendor: 'OpenSSL', product: 'OpenSSL', defaultStatus: 'unaffected', versions: [{ version: '3.5.0', lessThan: '3.5.7', status: 'affected', versionType: 'semver' }] }],
  } } };
  // Act
  const paths = openSslPaths(html, source('openssl'));
  const item = parseOpenSslCve(JSON.stringify(data), source('openssl'));
  // Assert
  assert.deepEqual(paths, ['/news/secjson/cve-2026-12345.json']);
  assert.equal(item.publishedAt, '2020-01-01T00:00:00.000Z');
  assert.equal(item.updatedAt, '2026-10-30T00:00:00.000Z');
  assert.equal(item.affected[0].defaultStatus, 'unaffected');
  assert.equal(item.affected[0].versions[0].versionType, 'semver');
});

test('Unsupported OpenSSL schema or vendor cannot be normalized as a compatible security record', () => {
  // Arrange / Act / Assert
  assert.throws(() => parseOpenSslCve('{"dataVersion":"6.0","SENTINEL":"private"}', source('openssl')), error => error.diagnostic.code === 'MSS_SOURCE');
});

test('Red Hat records keep their source distribution and malformed IDs stop that page', () => {
  // Arrange / Act
  const [item] = parseRedHatList('[{"CVE":"CVE-2026-12345","public_date":"2026-10-30","severity":"critical"}]', source('redhat'));
  // Assert
  assert.deepEqual(item.products, ['Red Hat Enterprise Linux']);
  assert.equal(item.severity.level, 'CRITICAL');
  assert.throws(() => parseRedHatList('[{"CVE":"not-a-cve"}]', source('redhat')));
});

test('Alpine fixes keep branch and APK revision and never invent CVE dates from snapshot retrieval', () => {
  // Arrange
  const data = { distroversion: 'v3.22', reponame: 'main', packages: [{ pkg: { name: 'openssl', secfixes: { '3.5.7-r1': ['CVE-2026-12345'] } } }] };
  // Act
  const [item] = parseAlpineSnapshot(JSON.stringify(data), source('alpine'));
  // Assert
  assert.equal(item.distributionRelease, '3.22');
  assert.equal(item.fixed[0].version, '3.5.7-r1');
  assert.equal(item.publishedAt, null);
  assert.equal(item.updatedAt, null);
  assert.throws(() => parseAlpineSnapshot(JSON.stringify({ ...data, distroversion: 'v3.23' }), source('alpine')));
});

test('Source URL policy binds repository numeric cursors and rejects arbitrary article paths or credentials', () => {
  // Arrange / Act / Assert
  assert.ok([...SOURCE_PUBLIC_GETS].every(url => validateSourceRequest(url)));
  assert.equal(validateSourceRequest('https://api.github.com/repositories/35780977/security-advisories?per_page=100&after=abc'), true);
  assert.equal(validateSourceRequest('https://api.github.com/repositories/99999999/security-advisories?per_page=100&after=abc'), false);
  assert.equal(validateSourceRequest('https://api.github.com/repos/php/php-src/security-advisories?per_page=100&token=SENTINEL'), false);
  const path = '/news/secjson/cve-2026-12345.json';
  assert.equal(validateSourceRequest(`https://openssl-library.org${path}`), false);
  assert.equal(validateSourceRequest(`https://openssl-library.org${path}`, { authorizedPaths: new Set([path]) }), true);
  assert.equal(validateSourceRequest(`https://user:secret@openssl-library.org${path}`, { authorizedPaths: new Set([path]) }), false);
});

test('Required current-source first queries precede optional GitHub pagination and failed sources remain explicit', async () => {
  // Arrange
  const requested = [];
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async address => {
    const url = new URL(address); requested.push(url.href);
    if (url.pathname === '/advisories' && url.searchParams.get('type') === 'reviewed') {
      const next = new URL(url); next.searchParams.set('after', 'page2');
      return new Response('[]', { headers: url.searchParams.has('after') ? {} : { link: `<${next.href}>; rel="next"` } });
    }
    return new Response('', { status: 503 });
  } });
  // Act
  const result = await fetchNews({ context, previous: { lastRunAt: '2026-11-02T23:59:59Z' } });
  await context.close();
  // Assert
  assert.equal(result.window.since, '2026-10-04T00:00:00.000Z');
  const nextIndex = requested.findIndex(url => url.includes('after=page2'));
  assert.ok(nextIndex > requested.findIndex(url => url === 'https://piyolog.hatenadiary.jp/feed'));
  assert.equal(result.sources.length, SOURCES.length);
  assert.deepEqual(result.categoryCoverage.filter(value => value.required).map(value => value.category), NEWS_CATEGORIES.filter(value => value.required).map(value => value.id));
  assert.equal(result.categoryCoverage.find(value => value.category === 'php').status, 'partial');
});

test('Unexpected 304 and malformed provider responses never count as fresh successful primary coverage', async () => {
  // Arrange
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async () => new Response(null, { status: 304 }) });
  // Act
  const result = await fetchNews({ context, previous: {} });
  await context.close();
  // Assert
  assert.equal(result.categoryCoverage.some(value => value.status === 'fresh'), false);
  assert.equal(result.sources.find(value => value.sourceId === 'php').diagnostic.context.status, 304);
  assert.equal(result.sources.find(value => value.sourceId === 'php').diagnostic.context.sourceId, 'php');
});

test('A failed Docker primary source cannot pass Docker coverage just because Linux distribution news succeeded', async () => {
  // Arrange
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async url => new Response(String(url) === 'https://www.debian.org/security/dsa-long.rdf' ? '<rdf:RDF><item><title>Linux fix</title><dc:date>2026-11-02</dc:date></item></rdf:RDF>' : '', { status: String(url) === 'https://www.debian.org/security/dsa-long.rdf' ? 200 : 503 }) });
  // Act
  const result = await fetchNews({ context, previous: {} });
  await context.close();
  // Assert
  assert.equal(result.categoryCoverage.find(value => value.category === 'linux').status, 'fresh');
  assert.equal(result.categoryCoverage.find(value => value.category === 'docker').status, 'partial');
});

test('Docker announcements use each explicit update date and never borrow a CVE year or another section date', () => {
  // Arrange
  const html = '<h2 id=desktop-fix>Docker Desktop CVE-2026-12345</h2><p>Fixed on October 26 in release 4.97.0.</p>'
    + '<h2 id="sandbox-fix">Docker Sandboxes update</h2><p><em>Last updated October 21, 2026</em></p><p>Example security update.</p>'
    + '<h2 id=older-update>Docker policy</h2><p>Last updated July 2024</p>';
  // Act
  const entries = parseDockerAnnouncements(html, source('docker'));
  // Assert
  assert.equal(entries[0].publishedAt, null);
  assert.equal(entries[0].updatedAt, null);
  assert.equal(entries[0].datePrecision, 'unknown');
  assert.equal(entries[1].updatedAt, '2026-10-21T00:00:00.000Z');
  assert.equal(entries[1].dateSemantics, 'vendor-last-updated');
  assert.equal(entries[1].url, 'https://docs.docker.com/security/security-announcements/#sandbox-fix');
  assert.equal(entries[2].datePrecision, 'month');
  assert.equal(entries[2].updatedAt, null);
  assert.equal(entries[2].updatedMonth, '2024-07');
  assert.throws(() => parseDockerAnnouncements('<h1>Login</h1>', source('docker')), error => error.diagnostic.code === 'MSS_SOURCE');
});

test('An undated Docker announcement keeps its category partial instead of proving an empty recent period', async () => {
  // Arrange
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async url => String(url) === source('docker').url
    ? new Response('<h2 id=desktop-fix>Docker Desktop CVE-2026-12345</h2><p>Fixed on October 26.</p>') : new Response('', { status: 503 }) });
  // Act
  const result = await fetchNews({ context, previous: {} });
  await context.close();
  // Assert
  const receipt = result.categoryCoverage.find(value => value.category === 'docker');
  assert.equal(receipt.status, 'partial');
  assert.equal(receipt.windowStatus, 'partial');
  assert.equal(receipt.reasonCode, 'PRIMARY_SOURCE_UNDATED_ITEMS');
  assert.equal(receipt.undatedCount, 1);
  assert.equal(receipt.datedItemCount, 0);
  assert.equal(result.sources.find(value => value.sourceId === 'docker').status, 'partial');
  assert.equal(result.sources.find(value => value.sourceId === 'docker').reasonCode, 'SOURCE_UNDATED_ITEMS');
  assert.equal(result.items.filter(value => value.sourceId === 'docker').length, 1);
});

test('Month precision uses the full calendar interval and never pretends the advisory was published on day one', () => {
  // Arrange
  const article = { publishedMonth: '2026-10', datePrecision: 'month' };
  const windows = [
    ['2026-10-04T00:00:00Z', '2026-11-03T00:00:00Z', 'possible'],
    ['2026-09-15T00:00:00Z', '2026-10-20T00:00:00Z', 'possible'],
    ['2026-10-01T00:00:00Z', '2026-10-31T23:59:59.999Z', 'confirmed'],
    ['2026-11-01T00:00:00Z', '2026-11-03T00:00:00Z', 'outside'],
    ['2026-09-01T00:00:00Z', '2026-09-30T23:59:59.999Z', 'outside'],
  ];
  // Act / Assert
  assert.deepEqual(newsDateRange(article), { start: '2026-10-01T00:00:00.000Z', endExclusive: '2026-11-01T00:00:00.000Z', precision: 'month', field: 'publishedAt' });
  for (const [since, until, expected] of windows) assert.equal(newsWindowStatus(article, { since, until }), expected);
  assert.deepEqual(newsDateRange({ updatedMonth: '2024-02', datePrecision: 'month' }), { start: '2024-02-01T00:00:00.000Z', endExclusive: '2024-03-01T00:00:00.000Z', precision: 'month', field: 'updatedAt' });
  assert.equal(newsDateRange({ publishedMonth: '2026-13' }), null);
  assert.equal(newsDateRange({ publishedAt: '+275760-09-13T00:00:00.000Z' }), null);
  assert.equal(newsWindowStatus({ publishedAt: '2026-10-04T00:00:00.000Z', datePrecision: 'day' }, { since: '2026-10-04T12:00:00Z', until: '2026-11-03T00:00:00Z' }), 'possible');
});

for (const [since, until] of [
  ['2026-10-04T00:00:00Z', '2026-11-03T00:00:00Z'],
  ['2026-09-15T00:00:00Z', '2026-10-20T00:00:00Z'],
]) test(`Oracle and Docker month-only notices remain uncertain when the discovery window is ${since} through ${until}`, async () => {
  // Arrange
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async address => {
    if (String(address) === source('oracle').url) return new Response('<a href="/security-alerts/cpuoct2026.html">Critical Patch Update October 2026</a>');
    if (String(address) === source('docker').url) return new Response('<h2 id=month-fix>Docker security update</h2><p>Last updated October 2026</p>');
    return new Response('', { status: 404 });
  } });
  // Act
  const news = await fetchNews({ context, previous: {}, since, until });
  await context.close();
  // Assert
  assert.deepEqual(news.items.map(value => value.sourceId).sort(), ['docker', 'oracle']);
  assert.equal(news.items.find(value => value.sourceId === 'oracle').publishedMonth, '2026-10');
  assert.equal(news.items.find(value => value.sourceId === 'docker').updatedMonth, '2026-10');
  for (const id of ['oracle', 'docker']) {
    const record = news.sources.find(value => value.sourceId === id);
    assert.equal(record.contentFetched, true);
    assert.equal(record.freshness, 'fresh');
    assert.equal(record.itemCount, 1);
    assert.equal(record.datedItemCount, 0);
    assert.equal(record.uncertainItemCount, 1);
    assert.equal(record.impreciseCount, 1);
    assert.equal(record.undatedCount, 0);
    assert.equal(record.newestAvailableAt, null);
    assert.equal(record.windowComplete, false);
    assert.equal(record.status, 'partial');
    assert.equal(record.reasonCode, 'SOURCE_DATE_PRECISION');
  }
  const receipt = news.categoryCoverage.find(value => value.category === 'docker');
  assert.equal(receipt.datedItemCount, 0);
  assert.equal(receipt.uncertainItemCount, 1);
  assert.equal(receipt.undatedCount, 0);
  assert.equal(receipt.windowStatus, 'partial');
  assert.equal(receipt.reasonCode, 'PRIMARY_SOURCE_DATE_PRECISION');
});

test('A whole known month can be confirmed inside the window while the exact update day stays unknown', async () => {
  // Arrange
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async address => String(address) === source('docker').url
    ? new Response('<h2 id=month-fix>Docker security update</h2><p>Last updated October 2026</p>') : new Response('', { status: 404 }) });
  // Act
  const news = await fetchNews({ context, previous: {}, since: '2026-10-01T00:00:00Z', until: '2026-11-01T00:00:00Z' });
  await context.close();
  // Assert
  const receipt = news.categoryCoverage.find(value => value.category === 'docker');
  assert.equal(news.items[0].updatedAt, null);
  assert.equal(news.items[0].updatedMonth, '2026-10');
  assert.equal(receipt.impreciseCount, 1);
  assert.equal(receipt.datedItemCount, 1);
  assert.equal(receipt.uncertainItemCount, 0);
  assert.equal(receipt.undatedCount, 0);
  assert.equal(receipt.windowStatus, 'complete');
});

test('A month interval ending exactly at the window start is excluded without inventing a current advisory', async () => {
  // Arrange
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async address => String(address) === source('docker').url
    ? new Response('<h2 id=month-fix>Docker security update</h2><p>Last updated September 2026</p>') : new Response('', { status: 404 }) });
  // Act
  const news = await fetchNews({ context, previous: {}, since: '2026-10-01T00:00:00Z' });
  await context.close();
  // Assert
  const record = news.sources.find(value => value.sourceId === 'docker');
  assert.equal(news.items.length, 0);
  assert.equal(record.datedCount, 1);
  assert.equal(record.impreciseCount, 1);
  assert.equal(record.datedItemCount, 0);
  assert.equal(record.uncertainItemCount, 0);
  assert.equal(record.undatedCount, 0);
  assert.equal(record.windowComplete, true);
});

test('Oracle uses only a same-row revision date and preserves a separate publication month', () => {
  // Arrange
  const html = '<table><tr><td><a href="/security-alerts/cpuoct2026.html">Critical Patch Update October 2026</a></td><td>Rev 2, 26 October 2026</td></tr>'
    + '<tr><td><a href="/security-alerts/cpujul2026.html">Critical Patch Update July 2026</a></td><td>No revision date</td></tr></table>'
    + '<a href="/security-alerts/cspusep2026.html">Critical Security Patch Update September 2026</a>';
  // Act
  const entries = parseOfficialIndex(html, source('oracle'));
  // Assert
  assert.equal(entries[0].publishedAt, null);
  assert.equal(entries[0].publishedMonth, '2026-10');
  assert.equal(entries[0].updatedAt, '2026-10-26T00:00:00.000Z');
  assert.equal(entries[0].datePrecision, 'day');
  assert.equal(entries[0].dateSemantics, 'vendor-last-updated');
  assert.equal(newsWindowStatus(entries[0], { since: '2026-10-04T00:00:00Z', until: '2026-11-03T00:00:00Z' }), 'confirmed');
  assert.equal(entries[1].updatedAt, null);
  assert.equal(entries[1].publishedMonth, '2026-07');
  assert.equal(entries[2].updatedAt, null);
  assert.equal(entries[2].publishedMonth, '2026-09');
});

test('Resumed pages preserve legacy month precision and recompute article categories instead of trusting cached source-wide labels', async () => {
  // Arrange
  const window = { since: '2026-10-01T00:00:00.000Z', until: '2026-10-31T23:59:59.999Z' };
  const address = new URL('https://api.github.com/advisories');
  address.search = new URLSearchParams({ type: 'reviewed', modified: `${window.since}..${window.until}`, sort: 'updated', direction: 'desc', per_page: '100', after: 'old-page' }).toString();
  const previous = { sourceContinuations: { 'GitHub Advisory reviewed': { url: address.href, window, items: [
    { id: 'GHSA-month-fixture', title: 'Docker security advisory', url: 'https://github.com/advisories/GHSA-month-fixture', publishedAt: '2026-10-01T00:00:00.000Z', datePrecision: 'month',
      products: ['Docker'], categories: ['macos', 'ios'], categoryStatus: 'explicit', fetchedAt: '2026-10-31T00:00:00Z' },
  ] } } };
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async input => {
    const url = new URL(input);
    if (url.pathname !== '/advisories' || url.searchParams.get('type') !== 'reviewed') return new Response('', { status: 404 });
    if (!url.searchParams.has('after')) return Response.json([]);
    const next = new URL(url); next.searchParams.set('after', `${url.searchParams.get('after')}-next`);
    return Response.json([], { headers: { link: `<${next.href}>; rel="next"` } });
  } });
  // Act
  const news = await fetchNews({ context, previous });
  await context.close();
  // Assert
  const article = news.items.find(value => value.id === 'GHSA-month-fixture');
  assert.equal(article.publishedAt, null);
  assert.equal(article.publishedMonth, '2026-10');
  assert.equal(article.datePrecision, 'month');
  assert.deepEqual(article.categories, ['docker']);
  assert.equal(article.categoryStatus, 'explicit');
  const cached = news.sourceContinuations['GitHub Advisory reviewed'].items[0];
  assert.equal(cached.publishedAt, null);
  assert.equal(cached.publishedMonth, '2026-10');
  assert.equal(cached.datePrecision, 'month');
  assert.deepEqual(cached.categories, ['docker']);
  assert.equal(news.categoryCoverage.find(value => value.category === 'docker').uncertainItemCount, 1);
});

test('A tvOS-only Apple response establishes no macOS or iOS article and keeps the actual release as general news', async () => {
  // Arrange
  const html = '<table><tr><td><a href="https://support.apple.com/en-us/149524">tvOS 27.2</a></td><td>Apple TV HD</td><td>26 Oct 2026</td></tr></table>';
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async address => String(address) === source('apple').url ? new Response(html) : new Response('', { status: 404 }) });
  // Act
  const news = await fetchNews({ context, previous: {} });
  await context.close();
  // Assert
  assert.deepEqual(news.items[0].categories, ['general']);
  assert.deepEqual(news.items[0].products, ['tvOS']);
  assert.equal(news.items[0].categoryStatus, 'explicit');
  for (const category of ['macos', 'ios']) {
    const receipt = news.categoryCoverage.find(value => value.category === category);
    assert.equal(receipt.status, 'fresh');
    assert.equal(receipt.datedItemCount, 0);
    assert.equal(receipt.unclassifiedCount, 0);
    assert.equal(receipt.windowStatus, 'complete');
  }
  assert.equal(news.categoryCoverage.find(value => value.category === 'mac-apps').datedItemCount, 0);
  assert.equal(news.categoryCoverage.find(value => value.category === 'general').datedItemCount, 1);
});

test('Mixed Apple releases count each actual product without copying Xcode host requirements into macOS news', async () => {
  // Arrange
  const rows = [
    ['macOS Sequoia 15.8.2', 'Mac'], ['iOS 27.2 and iPadOS 27.2', 'iPhone and iPad'], ['Xcode 27.2', 'macOS Tahoe'], ['Safari 27.2', 'macOS Sequoia'],
    ['tvOS 27.2', 'Apple TV'], ['watchOS 27.2', 'Apple Watch'], ['visionOS 27.2', 'Apple Vision Pro'], ['Unrecognized Apple release', 'Unknown'],
  ];
  const html = '<table>' + rows.map(([title, platforms], index) => `<tr><td><a href="https://support.apple.com/en-us/${150000 + index}">${title}</a></td><td>${platforms}</td><td>26 Oct 2026</td></tr>`).join('') + '</table>';
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async address => String(address) === source('apple').url ? new Response(html) : new Response('', { status: 404 }) });
  // Act
  const news = await fetchNews({ context, previous: {} });
  await context.close();
  // Assert
  assert.deepEqual(Object.fromEntries(news.items.map(value => [value.title, value.categories])), {
    'macOS Sequoia 15.8.2': ['macos'], 'iOS 27.2 and iPadOS 27.2': ['ios'], 'Xcode 27.2': ['mac-apps'], 'Safari 27.2': ['mac-apps'],
    'tvOS 27.2': ['general'], 'watchOS 27.2': ['general'], 'visionOS 27.2': ['general'], 'Unrecognized Apple release': ['general'],
  });
  assert.deepEqual(news.items.find(value => value.title === 'Xcode 27.2').products, ['Xcode']);
  assert.equal(news.items.find(value => value.title === 'Unrecognized Apple release').categoryStatus, 'unconfirmed');
  for (const [category, expected] of [['macos', 1], ['ios', 1], ['mac-apps', 2], ['general', 4]]) assert.equal(news.categoryCoverage.find(value => value.category === category).datedItemCount, expected);
  const receipt = news.categoryCoverage.find(value => value.category === 'macos');
  assert.equal(receipt.unclassifiedCount, 1);
  assert.equal(receipt.windowStatus, 'partial');
  assert.equal(receipt.reasonCode, 'PRIMARY_SOURCE_CATEGORY_UNCONFIRMED');
});

test('Mozilla iOS and Android and ChromeOS news never inflate the Mac application article count', async () => {
  // Arrange
  const mozilla = '<h2>October 26, 2026</h2>' + ['Firefox 159', 'Thunderbird 159', 'Firefox for iOS 159', 'Firefox for Android 159']
    .map((title, index) => `<a href="/en-US/security/advisories/mfsa2026-${200 + index}/">Security Vulnerabilities fixed in ${title}</a>`).join('');
  const chrome = '<rss><channel>' + ['Stable Channel Update for Desktop', 'Chrome for iOS Update', 'Dev Channel Update for ChromeOS / ChromeOS Flex', 'Chrome for Android Update']
    .map((title, index) => `<item><title>${title}</title><link>https://chromereleases.googleblog.com/2026/10/update-${index}.html</link><pubDate>26 Oct 2026</pubDate><description>Chrome also supports Mac.</description></item>`).join('') + '</channel></rss>';
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async address => String(address) === source('mozilla').url ? new Response(mozilla)
    : String(address) === source('chrome').url ? new Response(chrome) : new Response('', { status: 404 }) });
  // Act
  const news = await fetchNews({ context, previous: {} });
  await context.close();
  // Assert
  assert.equal(news.categoryCoverage.find(value => value.category === 'mac-apps').datedItemCount, 3);
  assert.equal(news.categoryCoverage.find(value => value.category === 'ios').datedItemCount, 2);
  assert.equal(news.categoryCoverage.find(value => value.category === 'general').datedItemCount, 3);
  assert.equal(news.categoryCoverage.find(value => value.category === 'ios').status, 'partial');
  assert.deepEqual(news.items.find(value => value.title === 'Dev Channel Update for ChromeOS / ChromeOS Flex').categories, ['general']);
  assert.deepEqual(news.items.find(value => value.title === 'Security Vulnerabilities fixed in Firefox for iOS 159').categories, ['ios']);
  assert.deepEqual(news.items.find(value => value.title === 'Security Vulnerabilities fixed in Firefox for Android 159').categories, ['general']);
});

test('A secondary macOS article can be listed but cannot replace a failed maintained Apple source', async () => {
  // Arrange
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async address => String(address) === source('hackernews').url
    ? new Response('<rss><channel><item><title>macOS security issue</title><pubDate>26 Oct 2026</pubDate></item></channel></rss>') : new Response('', { status: 404 }) });
  // Act
  const news = await fetchNews({ context, previous: {} });
  await context.close();
  // Assert
  const receipt = news.categoryCoverage.find(value => value.category === 'macos');
  assert.equal(receipt.datedItemCount, 1);
  assert.equal(receipt.status, 'partial');
  assert.deepEqual(receipt.sourceIds, ['apple']);
  assert.equal(receipt.reasonCode, 'PRIMARY_SOURCE_UNAVAILABLE');
});

test('Docker current dated news and undated announcements retain separate source and category counts', async () => {
  // Arrange
  const html = '<h2 id=desktop-fix>Docker Desktop fix</h2><p>Fixed on October 26.</p>'
    + '<h2 id=sandbox-fix>Docker Sandboxes update</h2><p>Last updated October 21, 2026</p>'
    + '<h2 id=old-fix>Docker older fix</h2><p>Last updated August 20, 2025</p>';
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async url => String(url) === source('docker').url ? new Response(html) : new Response('', { status: 503 }) });
  // Act
  const result = await fetchNews({ context, previous: {} });
  await context.close();
  // Assert
  const receipt = result.categoryCoverage.find(value => value.category === 'docker');
  const record = result.sources.find(value => value.sourceId === 'docker');
  assert.equal(receipt.status, 'fresh');
  assert.equal(receipt.windowStatus, 'partial');
  assert.equal(receipt.reasonCode, 'PRIMARY_SOURCE_FETCHED_WITH_UNDATED_ITEMS');
  assert.equal(receipt.undatedCount, 1);
  assert.equal(receipt.datedItemCount, 1);
  assert.equal(record.datedCount, 2);
  assert.equal(record.datedItemCount, 1);
  assert.equal(record.undatedCount, 1);
  assert.equal(result.items.filter(value => value.sourceId === 'docker').length, 2);
});

test('A dated Docker index with only older announcements can prove zero recent items without an unknown-date warning', async () => {
  // Arrange
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async url => String(url) === source('docker').url
    ? new Response('<h2 id=old-fix>Docker older fix</h2><p>Last updated August 20, 2025</p>') : new Response('', { status: 503 }) });
  // Act
  const result = await fetchNews({ context, previous: {} });
  await context.close();
  // Assert
  const receipt = result.categoryCoverage.find(value => value.category === 'docker');
  assert.equal(receipt.status, 'fresh');
  assert.equal(receipt.windowStatus, 'complete');
  assert.equal(receipt.reasonCode, 'PRIMARY_SOURCE_FETCHED');
  assert.equal(receipt.undatedCount, 0);
  assert.equal(receipt.datedItemCount, 0);
});

test('A tenfold feed workload stops at the total item budget and reports omitted source scope', async () => {
  // Arrange
  const xml = '<rss><channel>' + Array.from({ length: 1200 }, (_, index) => `<item><title>Security ${index}</title><link>https://www.php.net/item-${index}</link><pubDate>2026-11-02</pubDate></item>`).join('') + '</channel></rss>';
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async address => {
    const selected = SOURCES.find(value => value.url === String(address));
    return selected?.kind === 'xml' && !selected.iocDiscovery ? new Response(xml) : new Response('', { status: 503 });
  } });
  // Act
  const result = await fetchNews({ context, previous: {} });
  await context.close();
  // Assert
  assert.ok(result.items.length <= 10000);
  assert.ok(result.sources.some(value => value.reasonCode === 'NEWS_AGGREGATE_LIMIT' && value.status === 'partial' && value.windowComplete === false));
});

test('Cyclic GitHub pagination remains partial and never loops or silently advances its cursor', async () => {
  // Arrange
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async address => {
    const url = new URL(address);
    return url.pathname === '/advisories' && url.searchParams.get('type') === 'reviewed'
      ? new Response('[{"ghsa_id":"GHSA-cycle","summary":"Example","updated_at":"2026-11-02T00:00:00Z"}]', { headers: { link: `<${url.href}>; rel="next"` } })
      : new Response('', { status: 503 });
  } });
  // Act
  const result = await fetchNews({ context, previous: {} });
  await context.close();
  // Assert
  const record = result.sources.find(value => value.sourceId === 'ghsa-reviewed');
  assert.equal(record.status, 'partial');
  assert.equal(record.windowComplete, false);
  assert.equal(result.sourceCursors['GitHub Advisory reviewed'], undefined);
});


test('Red Hat accepts its observed single JSON-string envelope but rejects recursive string wrappers', () => {
  // Arrange
  const data = [{ CVE: 'CVE-2026-12345', public_date: '2026-11-02', severity: 'high' }];
  // Act
  const [item] = parseRedHatList(JSON.stringify(JSON.stringify(data)), source('redhat'));
  // Assert
  assert.equal(item.id, 'RH-CVE-2026-12345');
  assert.throws(() => parseRedHatList(JSON.stringify(JSON.stringify(JSON.stringify(data))), source('redhat')));
});


test('Encoded path separators and traversal cannot authorize vendor attachment retrieval', () => {
  // Arrange
  const paths = ['/sites/default/files/2026-11/a%2fb.json', '/sites/default/files/2026-11/a%2eb.json', '/sites/default/files/2026-11/a%5cb.json', '/sites/default/files/2026-11/a%252fb.json'];
  for (const path of paths) {
    // Act / Assert
    assert.equal(validateSourceRequest(`https://www.cisa.gov${path}`, { authorizedPaths: new Set([path]) }), false);
  }
});

test('An index-only OpenSSL or Homebrew success cannot pass category coverage when every advisory body fails', async () => {
  // Arrange
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async address => {
    const url = String(address);
    if (url === 'https://openssl-library.org/news/secjson/') return new Response('<a href="cve-2026-12345.json">CVE</a>');
    if (url.includes('/Homebrew/advisory-database/git/trees/')) return Response.json({ sha: 'a'.repeat(40), truncated: false, tree: [{ path: 'advisories/BREW-example-CVE-2026-12345.json', type: 'blob', sha: 'b'.repeat(40), size: 100 }] });
    return new Response('', { status: 503 });
  } });
  // Act
  const result = await fetchNews({ context, previous: { sourceCursors: { 'Homebrew Advisory Database': '2026-11-01T00:00:00Z', 'OpenSSL Security Advisories': '2026-11-01T00:00:00Z' } } });
  await context.close();
  // Assert
  assert.equal(result.categoryCoverage.find(value => value.category === 'homebrew').status, 'partial');
  assert.equal(result.categoryCoverage.find(value => value.category === 'tls').status, 'partial');
  assert.equal(result.sources.find(value => value.sourceId === 'openssl').contentFetched, false);
  assert.equal(result.sources.find(value => value.sourceId === 'homebrew').contentFetched, false);
});

test('Older repository advisories remain available for exact local checks independently of the news window', async () => {
  // Arrange
  const context = createRunContext({ budgetMs: 120000, wallNow: () => NOW, fetchImpl: async address => String(address).includes('/repos/electron/electron/security-advisories')
    ? Response.json([{ ghsa_id: 'GHSA-old-example', summary: 'Old Electron issue', published_at: '2020-01-01T00:00:00Z', updated_at: '2020-01-02T00:00:00Z', vulnerabilities: [{ package: { ecosystem: 'npm', name: 'electron' }, vulnerable_version_range: '< 2.0.0', patched_versions: '2.0.0' }] }])
    : new Response('', { status: 503 }) });
  // Act
  const result = await fetchNews({ context, previous: {} });
  await context.close();
  // Assert
  assert.equal(result.items.some(value => value.id === 'GHSA-old-example'), false);
  assert.equal(result.historicalAdvisories[0].id, 'GHSA-old-example');
  assert.equal(result.advisoryHistoryCoverage.find(value => value.sourceId === 'electron').status, 'partial');
});
