import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES, NEWS_CATEGORIES } from '../scripts/source-registry.mjs';
import { SOURCE_PUBLIC_GETS, validateSourceRequest } from '../scripts/source-request-policy.mjs';
import { parseOfficialIndex, parseDockerAnnouncements, openSslPaths, parseOpenSslCve, parseRedHatList, parseAlpineSnapshot } from '../scripts/source-adapters.mjs';
import { fetchNews, parseXmlFeed, normalizeAdvisory } from '../scripts/fetch-news.mjs';
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

test('OpenJDK and Ruby indexes retain explicit calendar dates while Oracle month-only dates remain labeled as months', () => {
  // Arrange / Act
  const jdk = parseOfficialIndex('<a href="2026-10-20">2026/10/20</a>', source('openjdk'));
  const ruby = parseOfficialIndex('<a href="/en/news/2026/10/25/cve-fix/">CVE-2026-12345 fixed</a>', source('ruby-security'));
  const oracle = parseOfficialIndex('<a href="/security-alerts/cpuoct2026.html">Critical Patch Update October 2026</a><a href="/security-alerts/alert-CVE-2026-12345.html">Alert</a>', source('oracle'));
  // Assert
  assert.equal(jdk[0].publishedAt, '2026-10-20T00:00:00.000Z');
  assert.equal(ruby[0].publishedAt, '2026-10-25T00:00:00.000Z');
  assert.equal(oracle[0].datePrecision, 'month');
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
