/** 公開取得先の固定registry。ローカルの製品名からURLを組み立てない。 */
export const SOURCE_REVIEW = Object.freeze({ verifiedAt: '2026-11-03', expiresAfterDays: 30 });

export const SOURCES = Object.freeze([
  { name: 'CISA KEV', url: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', kind: 'kev' },
  { name: 'GitHub Advisory reviewed', url: 'https://api.github.com/advisories', kind: 'github', advisoryType: 'reviewed' },
  { name: 'GitHub Advisory malware', url: 'https://api.github.com/advisories', kind: 'github', advisoryType: 'malware' },
  { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', kind: 'xml' },
  { name: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/', kind: 'xml' },
  { name: 'Socket', url: 'https://socket.dev/api/blog/feed.json', kind: 'jsonfeed' },
  { name: 'OpenSourceMalware', url: 'https://opensourcemalware.com/rss.xml', kind: 'xml' },
  { name: 'Apple Security Releases', url: 'https://support.apple.com/en-us/100100', kind: 'apple' },
  { name: 'JPCERT/CC', url: 'https://www.jpcert.or.jp/rss/jpcert.rdf', kind: 'xml' },
  { name: 'IPA', url: 'https://www.ipa.go.jp/security/rss/alert.rdf', kind: 'xml' },
  { name: 'Security NEXT', url: 'https://www.security-next.com/feed', kind: 'xml' },
  { name: 'piyolog', url: 'https://piyolog.hatenadiary.jp/feed', kind: 'xml' },
  { name: 'Cursor security notice', url: 'https://cursor.com/blog/claude-code-extension-security-notice', kind: 'cursor' },
  { name: 'Node.js Security Releases', url: 'https://nodejs.org/en/feed/vulnerability.xml', kind: 'xml' },
  { name: 'Chrome Releases', url: 'https://feeds.feedburner.com/GoogleChromeReleases', kind: 'xml' },
].map(source => Object.freeze({ ...source, schema: { kev: 'cisa-kev-v1', github: 'github-global-advisory-v1', xml: 'rss-atom-rdf-subset-v1', jsonfeed: 'jsonfeed-items-v1', apple: 'apple-security-release-table-v1', cursor: 'cursor-2026-10-incident-v1' }[source.kind],
  identityMapping: source.kind === 'kev' ? 'CVE-ID' : source.kind === 'github' ? 'ecosystem+package' : source.kind === 'apple' ? 'explicit-product-release' : source.kind === 'cursor' ? 'cursor-marketplace-extension' : 'candidate-text-only',
  channel: source.kind === 'cursor' ? 'cursor-marketplace' : 'explicit-only',
  baseline: source.kind === 'apple' ? 'security-update-index' : source.kind === 'kev' ? 'known-exploited-catalog' : source.kind === 'cursor' ? 'single-incident' : 'delta-only',
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
  { id: 'cursor', names: ['Cursor'], bundles: ['com.todesktop.230313mzl4w4u92'], source: 'Cursor security notice' },
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
