import { SOURCES, MOZILLA_SOURCES } from './source-registry.mjs';

export const SOURCE_PUBLIC_GETS = new Set([...SOURCES, ...MOZILLA_SOURCES].map(source => source.url));
export const SOURCE_REFERENCE_HOSTS = new Set([
  ...[...SOURCES, ...MOZILLA_SOURCES].map(source => new URL(source.url).hostname),
  'github.com', 'osv.dev', 'nvd.nist.gov', 'www.cve.org', 'chromereleases.googleblog.com',
  'blog.chromium.org', 'security-tracker.debian.org', 'security.alpinelinux.org', 'www.openssl.org',
  'www.libressl.org', 'gnutls.org', 'www.kernel.org', 'lore.kernel.org', 'thehackernews.com', 'www.socket.dev',
]);

/** Enforce source-owned request grammars; runtime calls this before anonymous GETs.
 * Dynamic paths additionally require the current index's exact authorization set.
 * @example validateSourceRequest('https://www.php.net/feed.atom')
 */
export function validateSourceRequest(address, options = {}) {
  if (/[\\]/.test(String(address)) || /%(?:2e|2f|5c|25)/i.test(String(address).split('?')[0])) return false;
  let url;
  try { url = new URL(address); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || url.hash || url.href.length > 8192) return false;
  if (SOURCE_PUBLIC_GETS.has(url.href)) return true;
  if (url.origin === 'https://api.github.com') {
    const source = SOURCES.find(entry => entry.kind === 'github-repository' &&
      [new URL(entry.url).pathname, `/repositories/${entry.repositoryId}/security-advisories`].includes(url.pathname));
    if (!source) return false;
    const allowed = new Set(['state', 'sort', 'direction', 'per_page', 'after', 'before']);
    if ([...url.searchParams.keys()].some(key => !allowed.has(key) || url.searchParams.getAll(key).length !== 1)) return false;
    return (!url.searchParams.has('state') || url.searchParams.get('state') === 'published')
      && (!url.searchParams.has('sort') || url.searchParams.get('sort') === 'updated')
      && (!url.searchParams.has('direction') || url.searchParams.get('direction') === 'desc')
      && /^(?:[1-9]|[1-9][0-9]|100)$/.test(url.searchParams.get('per_page') || '')
      && ['after', 'before'].every(key => !url.searchParams.has(key) || /^[A-Za-z0-9_+\/=:-]{1,2048}$/.test(url.searchParams.get(key)));
  }
  if (url.origin === 'https://access.redhat.com' && url.pathname === '/hydra/rest/securitydata/cve.json') {
    const allowed = new Set(['after', 'before', 'page', 'per_page']);
    return [...url.searchParams.keys()].every(key => allowed.has(key) && url.searchParams.getAll(key).length === 1)
      && /^(?:[1-9]|[1-9][0-9]|100)$/.test(url.searchParams.get('per_page') || '')
      && /^\d{1,3}$/.test(url.searchParams.get('page') || '1')
      && ['after', 'before'].every(key => !url.searchParams.has(key) || /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get(key)));
  }
  // Index-controlled article and attachment paths never authorize an arbitrary host.
  if (url.search || !(options.authorizedPaths instanceof Set) || !options.authorizedPaths.has(url.pathname)) return false;
  const rules = {
    'openssl-library.org': /^\/news\/secjson\/cve-\d{4}-\d{4,10}\.json$/i,
    'www.cisa.gov': /^(?:\/news-events\/(?:cybersecurity-advisories|analysis-reports)\/[a-z0-9-]+|\/sites\/default\/files\/\d{4}-\d{2}\/[A-Za-z0-9_%+., -]{1,220}\.json)$/i,
    'www.microsoft.com': /^\/en-us\/security\/blog\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9-]+\/$/,
    'blogs.jpcert.or.jp': /^\/en\/\d{4}\/\d{2}\/[a-zA-Z0-9_-]+\.html$/,
  };
  return rules[url.hostname]?.test(url.pathname) === true;
}
