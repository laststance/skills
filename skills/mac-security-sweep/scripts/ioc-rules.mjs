import path from 'node:path';
import { isIP } from 'node:net';
import { safeIdentifier } from './inventory-projections.mjs';

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
      && source?.protocol === 'https:' && !source.username && !source.password && !source.search && !source.hash
      && safeIdentifier(rule.extensionId || rule.runtimeName || rule.product) && rule.iocs.length > 0 && rule.iocs.length <= 100;
    if (!valid) { rejected.push({ status: 'partial', reason: 'unverified-or-expired-rule' }); continue; }
    const iocs = [];
    for (const ioc of rule.iocs) {
      if (ioc?.type === 'exact-path' && typeof ioc.relativePath === 'string' && ioc.relativePath.length <= 500 && !path.isAbsolute(ioc.relativePath) && path.normalize(ioc.relativePath) === ioc.relativePath && !ioc.relativePath.split('/').includes('..') && !/[\x00-\x1f]/.test(ioc.relativePath)) iocs.push({ type: 'exact-path', relativePath: ioc.relativePath, metadataOnly: true });
      else if (ioc?.type === 'sha256' && ioc.target === 'extension-js' && /^[\w-]+\.[\w.-]+$/.test(rule.extensionId || '') && /^[a-f0-9]{64}$/.test(ioc.value || '')) iocs.push({ type: 'sha256', target: 'extension-js', value: ioc.value });
      else if (ioc?.type === 'process-name' && /^[A-Za-z0-9_.-]{1,100}$/.test(ioc.value || '')) iocs.push({ type: 'process-name', value: ioc.value });
      else { rejected.push({ status: 'partial', reason: 'unsupported-rule-kind' }); iocs.length = 0; break; }
    }
    if (!iocs.length) continue;
    let legacy = null;
    // 既存Cursor事例の複合一致だけを互換profileとして保持する。新ルールから式は生成しない。
    if (rule.id === 'cursor-claude-code-2026-10' && rule.iocProfile === 'cursor-2026-10' && source.href === 'https://cursor.com/blog/claude-code-extension-security-notice'
      && rule.legacyCursorEvidence?.ip === '134.209.82.225' && rule.legacyCursorEvidence.marker === 'svc-telemetry' && rule.legacyCursorEvidence.keyBasename === '.smtk') legacy = { ...rule.legacyCursorEvidence };
    accepted.push({ id: rule.id, sourceUrl: source.href, extensionId: rule.extensionId || null, product: rule.runtimeName || rule.product || null, iocs, legacy });
  }
  if (!accepted.length && !rejected.length) rejected.push({ status: 'partial', reason: 'no-verified-ioc-rules' });
  return { accepted, rejected };
}

/** 数値IPの完全一致だけを比較する。一般接続情報は強いIOCにしない。 @example endpointHasIp('134.209.82.225:443', '134.209.82.225') */
export function endpointHasIp(endpoint, ip) {
  if (typeof endpoint !== 'string' || !isIP(ip)) return false;
  return endpoint.split('->').some(value => value.replace(/^\[([^\]]+)\](?::\d+)?$/, '$1').replace(/:\d+$/, '') === ip);
}
