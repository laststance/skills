/** 公開取得先の固定registry。ローカルの製品名からURLを組み立てない。 */
export const SOURCE_REVIEW = Object.freeze({ verifiedAt: '2026-11-03', expiresAfterDays: 30 });

export const NEWS_CATEGORIES = Object.freeze([
  ['macos', 'macOS', 'macOS'], ['ios', 'iOS / iPadOS', 'iOS / iPadOS'], ['mac-apps', 'Macアプリ', 'Mac applications'],
  ['homebrew', 'Homebrew', 'Homebrew'], ['linux', 'Linux', 'Linux'], ['php', 'PHP', 'PHP'], ['tls', 'TLS / OpenSSL', 'TLS / OpenSSL'],
  ['imagemagick', 'ImageMagick', 'ImageMagick'], ['ruby', 'Ruby', 'Ruby'], ['java', 'Java / JDK', 'Java / JDK'],
  ['docker', 'Docker / コンテナ', 'Docker / containers'], ['incidents', '侵害・マルウェア', 'Incidents / malware'], ['general', 'その他', 'General'],
].map(([id, ja, en]) => Object.freeze({ id, labels: Object.freeze({ ja, en }), required: !['incidents', 'general'].includes(id) })));

export const SOURCES = Object.freeze([
  { id: 'apple', name: 'Apple Security Releases', url: 'https://support.apple.com/en-us/100100', kind: 'apple', categories: ['macos', 'ios', 'mac-apps'] },
  { id: 'chrome', name: 'Chrome Releases', url: 'https://feeds.feedburner.com/GoogleChromeReleases', kind: 'xml', categories: ['mac-apps'] },
  { id: 'mozilla', name: 'Mozilla Security Advisories', url: 'https://www.mozilla.org/en-US/security/advisories/', kind: 'mozilla-index', categories: ['mac-apps'] },
  { id: 'electron', name: 'Electron Security Advisories', url: 'https://api.github.com/repos/electron/electron/security-advisories', kind: 'github-repository', repositoryId: '9384267', categories: ['mac-apps'] },
  { id: 'node', name: 'Node.js Security Releases', url: 'https://nodejs.org/en/feed/vulnerability.xml', kind: 'xml', categories: ['mac-apps'] },
  { id: 'homebrew', name: 'Homebrew Advisory Database', url: 'https://api.github.com/repos/Homebrew/advisory-database/git/trees/main?recursive=1', kind: 'homebrew', categories: ['homebrew'] },
  { id: 'debian', name: 'Debian Security Advisories', url: 'https://www.debian.org/security/dsa-long.rdf', kind: 'xml', categories: ['linux'] },
  { id: 'ubuntu', name: 'Ubuntu Security Notices', url: 'https://ubuntu.com/security/notices/rss.xml', kind: 'xml', categories: ['linux'] },
  { id: 'redhat', name: 'Red Hat Security Data', url: 'https://access.redhat.com/hydra/rest/securitydata/cve.json', kind: 'redhat', categories: ['linux'] },
  { id: 'alpine', name: 'Alpine 3.22 main security fixes', url: 'https://secdb.alpinelinux.org/v3.22/main.json', kind: 'alpine', categories: ['linux'] },
  { id: 'php', name: 'PHP News', url: 'https://www.php.net/feed.atom', kind: 'xml', categories: ['php'] },
  { id: 'php-core', name: 'PHP Core Security Advisories', url: 'https://api.github.com/repos/php/php-src/security-advisories', kind: 'github-repository', repositoryId: '1903522', categories: ['php'] },
  { id: 'openssl', name: 'OpenSSL Security Advisories', url: 'https://openssl-library.org/news/secjson/', kind: 'openssl', categories: ['tls'] },
  { id: 'imagemagick', name: 'ImageMagick Security Advisories', url: 'https://api.github.com/repos/ImageMagick/ImageMagick/security-advisories', kind: 'github-repository', repositoryId: '35780977', categories: ['imagemagick'] },
  { id: 'ruby', name: 'Ruby News', url: 'https://www.ruby-lang.org/en/feeds/news.rss', kind: 'xml', categories: ['ruby'] },
  { id: 'ruby-security', name: 'Ruby Security Announcements', url: 'https://www.ruby-lang.org/en/security/', kind: 'ruby-security', categories: ['ruby'] },
  { id: 'openjdk', name: 'OpenJDK Security Advisories', url: 'https://openjdk.org/groups/vulnerability/advisories/', kind: 'openjdk', categories: ['java'] },
  { id: 'oracle', name: 'Oracle Security Alerts', url: 'https://www.oracle.com/security-alerts/', kind: 'oracle', categories: ['java'] },
  { id: 'docker', name: 'Docker Security Announcements', url: 'https://docs.docker.com/security/security-announcements/', kind: 'docker', categories: ['docker'] },
  { id: 'cisa-kev', name: 'CISA KEV', url: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', kind: 'kev', categories: ['general', 'incidents'] },
  { id: 'cisa-advisories', name: 'CISA Cybersecurity Advisories', url: 'https://www.cisa.gov/cybersecurity-advisories/cybersecurity-advisories.xml', kind: 'xml', categories: ['incidents'], iocDiscovery: true },
  { id: 'cisa-analysis', name: 'CISA Analysis Reports', url: 'https://www.cisa.gov/cybersecurity-advisories/analysis-reports.xml', kind: 'xml', categories: ['incidents'], iocDiscovery: true },
  { id: 'microsoft-security', name: 'Microsoft Security Research', url: 'https://www.microsoft.com/en-us/security/blog/feed/', kind: 'xml', categories: ['incidents'], iocDiscovery: true },
  { id: 'jpcert-analysis', name: 'JPCERT/CC Analysis', url: 'https://blogs.jpcert.or.jp/en/atom.xml', kind: 'xml', categories: ['incidents'], iocDiscovery: true },
  { id: 'ghsa-reviewed', name: 'GitHub Advisory reviewed', url: 'https://api.github.com/advisories', kind: 'github', advisoryType: 'reviewed', categories: ['general'] },
  { id: 'ghsa-malware', name: 'GitHub Advisory malware', url: 'https://api.github.com/advisories', kind: 'github', advisoryType: 'malware', categories: ['incidents'] },
  { id: 'jpcert', name: 'JPCERT/CC', url: 'https://www.jpcert.or.jp/rss/jpcert.rdf', kind: 'xml', categories: ['general'] },
  { id: 'ipa', name: 'IPA', url: 'https://www.ipa.go.jp/security/rss/alert.rdf', kind: 'xml', categories: ['general'] },
  { id: 'hackernews', name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', kind: 'xml', categories: ['general'], primary: false },
  { id: 'bleepingcomputer', name: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/', kind: 'xml', categories: ['general'], primary: false },
  { id: 'socket', name: 'Socket', url: 'https://socket.dev/api/blog/feed.json', kind: 'jsonfeed', categories: ['general'], primary: false },
  { id: 'opensourcemalware', name: 'OpenSourceMalware', url: 'https://opensourcemalware.com/rss.xml', kind: 'xml', categories: ['incidents'], primary: false },
  { id: 'securitynext', name: 'Security NEXT', url: 'https://www.security-next.com/feed', kind: 'xml', categories: ['general'], primary: false },
  { id: 'piyolog', name: 'piyolog', url: 'https://piyolog.hatenadiary.jp/feed', kind: 'xml', categories: ['general'], primary: false },
].map(source => Object.freeze({ primary: true, ...source,
  schema: ({ kev: 'cisa-kev-v1', github: 'github-global-advisory-v1', 'github-repository': 'github-repository-advisory-v1', xml: 'rss-atom-rdf-subset-v2', jsonfeed: 'jsonfeed-items-v1', apple: 'apple-security-release-table-v1', homebrew: 'homebrew-osv-v1', redhat: 'redhat-cve-list-v2', alpine: 'alpine-secdb-v1', openssl: 'openssl-cve5-v1', openjdk: 'openjdk-advisory-index-v1', oracle: 'oracle-cpu-index-v1', docker: 'docker-announcements-v1', 'ruby-security': 'ruby-security-index-v1', 'mozilla-index': 'mozilla-advisory-index-v1' })[source.kind],
  identityMapping: source.kind === 'kev' ? 'CVE-ID' : source.kind.startsWith('github') ? 'ecosystem+package' : source.kind === 'apple' ? 'explicit-product-release' : 'candidate-text-only',
  channel: 'explicit-only', baseline: source.kind === 'apple' ? 'security-update-index' : source.kind === 'kev' ? 'known-exploited-catalog' : 'delta-only',
  ttlMs: 86400000, verifiedAt: SOURCE_REVIEW.verifiedAt })));

/** source定義の再確認期限を可視化する。取得・照合で古い仕様を完全確認としない。 @example sourceRegistryCoverage(Date.now()) */
export function sourceRegistryCoverage(now) {
  const reviewed = Date.parse(`${SOURCE_REVIEW.verifiedAt}T00:00:00Z`);
  const elapsed = now - reviewed;
  return { area: 'source-registry', verifiedAt: SOURCE_REVIEW.verifiedAt, reviewDueAt: new Date(reviewed + SOURCE_REVIEW.expiresAfterDays * 86400000).toISOString(),
    status: elapsed >= 0 && elapsed <= SOURCE_REVIEW.expiresAfterDays * 86400000 ? 'complete' : 'partial',
    reason: '情報源の定義・schema・取得方法は最終確認から30日で再確認。自動登録や任意URL追加は行わない' };
}

export const MOZILLA_SOURCES = Object.freeze([
  { name: 'Mozilla Firefox historical advisories', productId: 'firefox', product: 'Firefox', channel: 'release', url: 'https://www.mozilla.org/en-US/security/known-vulnerabilities/firefox/', kind: 'mozilla', schema: 'mozilla-fixed-in-html-v1', baseline: 'security-update-index', ttlMs: 86400000 },
  { name: 'Mozilla Firefox ESR historical advisories', productId: 'firefox-esr', product: 'Firefox', channel: 'esr', url: 'https://www.mozilla.org/en-US/security/known-vulnerabilities/firefox-esr/', kind: 'mozilla', schema: 'mozilla-fixed-in-html-v1', baseline: 'security-update-index', ttlMs: 86400000 },
  { name: 'Mozilla Thunderbird historical advisories', productId: 'thunderbird', product: 'Thunderbird', channel: 'release', url: 'https://www.mozilla.org/en-US/security/known-vulnerabilities/thunderbird/', kind: 'mozilla', schema: 'mozilla-fixed-in-html-v1', baseline: 'security-update-index', ttlMs: 86400000 },
]);

const PRODUCTS = [
  { id: 'macos', names: ['macOS'], bundles: [], source: 'Apple Security Releases' },
  { id: 'safari', names: ['Safari'], bundles: ['com.apple.Safari'], source: 'Apple Security Releases' },
  { id: 'xcode', names: ['Xcode'], bundles: ['com.apple.dt.Xcode'], source: 'Apple Security Releases' },
  { id: 'chrome', names: ['Google Chrome', 'Google Chrome Canary'], bundles: ['com.google.Chrome', 'com.google.Chrome.canary'], source: 'Chrome Releases' },
  { id: 'cursor', names: ['Cursor'], bundles: ['com.todesktop.230313mzl4w4u92'], source: null },
  { id: 'node', names: ['Node.js', 'node'], bundles: [], source: 'Node.js Security Releases' },
  { id: 'firefox', names: ['Firefox', 'Firefox ESR'], bundles: ['org.mozilla.firefox'], source: 'Mozilla Firefox historical advisories' },
  { id: 'thunderbird', names: ['Thunderbird'], bundles: ['org.mozilla.thunderbird'], source: 'Mozilla Thunderbird historical advisories' },
];

/** 導入製品を固定識別子へ写す。adaptive取得が呼び、未対応製品もcoverageへ残す。 @example identifyProducts(inventory) */
export function identifyProducts(inventory) {
  const observations = [...(inventory.applications || []), ...(inventory.runtimes || []), ...(inventory.host?.osVersion ? [{ name: 'macOS', version: inventory.host.osVersion }] : [])];
  return observations.map(value => {
    const product = PRODUCTS.find(entry => entry.names.includes(value.name) || value.bundleId && entry.bundles.includes(value.bundleId));
    const channel = ['release', 'esr', 'canary', 'beta'].includes(value.channel) ? value.channel : value.name === 'Firefox ESR' ? 'esr' : 'unknown';
    return { productId: product ? product.id === 'firefox' && channel === 'esr' ? 'firefox-esr' : product.id : 'unsupported',
      name: typeof value.name === 'string' ? value.name.slice(0, 120) : '未確認', version: typeof value.version === 'string' ? value.version.slice(0, 120) : null,
      location: value.path || null, channel, source: product?.source || null };
  });
}
