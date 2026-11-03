import path from 'node:path';
import { safeIdentifier } from './inventory-projections.mjs';
import { forbiddenContent } from './safe-io.mjs';

const SOURCE_PATHS = new Map([
  ['www.cisa.gov', /^\/(?:news-events\/(?:cybersecurity-advisories|analysis-reports)|cybersecurity-advisories|sites\/default\/files)\//],
  ['www.microsoft.com', /^\/en-us\/security\/blog\//],
  ['blogs.jpcert.or.jp', /^\/(?:en\/)?\d{4}\//],
  ['github.com', /^\/(?:advisories\/GHSA-[\w-]+|[^/]+\/[^/]+\/security\/advisories\/GHSA-[\w-]+)$/],
]);

/** Keep an IOC target inside one exact home-relative path. The rule validator calls this before any local I/O.
 * @example validIocPath('Library/LaunchAgents/org.example.fixture.plist')
 */
function validIocPath(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 500 && value !== '.'
    && !path.isAbsolute(value) && path.normalize(value) === value && !value.split('/').some(part => part === '..' || part === '.')
    && !/[\x00-\x1f\x7f*?\[\]{}\\]/.test(value);
}

/** Exclude settings and profile bodies even when an official article names an exact file.
 * {@link validateIocRules} uses this in addition to the shared credential boundary.
 * @example protectedIocBody('Library/Application Support/Google/Chrome/Default/Preferences')
 */
function protectedIocBody(relativePath) {
  return forbiddenContent(path.join('/ioc-home', relativePath))
    || /^(?:\.(?:config|codex|claude|agents|cursor|vscode|vscode-insiders|local\/share\/(?:op|keyrings)))(?:\/|$)/i.test(relativePath)
    || /^Library\/(?:Application Support|Containers|Group Containers|Safari|Mail|Messages|Accounts)(?:\/|$)/i.test(relativePath)
    || /(?:^|\/)(?:\.(?:bashrc|zshrc|zprofile|bash_profile|profile|npmrc|pypirc|netrc)|credentials|config)\b/i.test(relativePath);
}

/** 検証済み宣言だけを安全なIOC型へ射影する。ニュースの任意式/commandは受理しない。 @example validateIocRules(document, Date.now()) */
export function validateIocRules(document, now = Date.now()) {
  const accepted = [], rejected = [];
  if (!Array.isArray(document?.rules) || document.rules.length > 100) return { accepted, rejected: [{ status: 'partial', reason: 'malformed-or-oversized-rules' }] };
  for (const rule of Array.isArray(document?.rules) ? document.rules.slice(0, 100) : []) {
    if (!Array.isArray(rule?.iocs)) continue;
    const verifiedAt = Date.parse(rule.verifiedAt), expiresAt = Date.parse(rule.expiresAt);
    let source;
    try { source = new URL(rule.sourceUrl); } catch { source = null; }
    const valid = safeIdentifier(rule.id) && rule.verified === true && Number.isFinite(verifiedAt) && now >= verifiedAt && now - verifiedAt <= 30 * 86400000 && Number.isFinite(expiresAt) && expiresAt > now && expiresAt <= verifiedAt + 31 * 86400000
      && source?.protocol === 'https:' && !source.username && !source.password && !source.search && !source.hash && !source.port
      && SOURCE_PATHS.get(source.hostname)?.test(source.pathname)
      && safeIdentifier(rule.extensionId || rule.runtimeName || rule.product) && rule.iocs.length > 0 && rule.iocs.length <= 100;
    if (!valid) { rejected.push({ status: 'partial', reason: 'unverified-or-expired-rule' }); continue; }
    // Explicit platform attribution prevents Linux/device indicators from becoming Mac checks.
    if (rule.platform !== 'darwin') { rejected.push({ status: 'partial', reason: 'unsupported-ioc-platform' }); continue; }
    const iocs = [];
    for (const ioc of rule.iocs) {
      if (ioc?.type === 'exact-path' && validIocPath(ioc.relativePath)) iocs.push({ type: 'exact-path', relativePath: ioc.relativePath, metadataOnly: true });
      else if (ioc?.type === 'sha256' && ioc.target === 'extension-js' && /^[\w-]+\.[\w.-]+$/.test(rule.extensionId || '') && /^[a-f0-9]{64}$/.test(ioc.value || '')) iocs.push({ type: 'sha256', target: 'extension-js', value: ioc.value });
      else if (ioc?.type === 'sha256' && ioc.target === 'exact-file' && validIocPath(ioc.relativePath)
        && !protectedIocBody(ioc.relativePath) && /^[a-f0-9]{64}$/.test(ioc.value || '')) iocs.push({ type: 'sha256', target: 'exact-file', relativePath: ioc.relativePath, value: ioc.value });
      else if (ioc?.type === 'process-name' && /^[A-Za-z0-9_.-]{1,100}$/.test(ioc.value || '')) iocs.push({ type: 'process-name', value: ioc.value });
      else { rejected.push({ status: 'partial', reason: 'unsupported-rule-kind' }); iocs.length = 0; break; }
    }
    if (!iocs.length) continue;
    accepted.push({ id: rule.id, sourceUrl: source.href, verifiedAt: new Date(verifiedAt).toISOString(), expiresAt: new Date(expiresAt).toISOString(),
      platform: 'darwin', extensionId: rule.extensionId || null, product: rule.runtimeName || rule.product || null, iocs });
  }
  if (!accepted.length && !rejected.length) rejected.push({ status: 'partial', reason: 'no-verified-ioc-rules' });
  return { accepted, rejected };
}
