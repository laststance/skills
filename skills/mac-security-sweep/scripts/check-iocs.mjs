#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRunContext } from './runtime.mjs';
import { within, readStatus } from './safe-io.mjs';
import { safeDiagnostic, SweepError } from './diagnostics.mjs';
import { validateIocRules } from './ioc-rules.mjs';
import { assessmentStatus } from './assessment.mjs';

const SKILL = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** 検証期限内の宣言的IOCを安全な範囲で照合する。runnerと単独CLIが呼ぶ。 @example await checkIocs(inventory, { context, discovery }) */
export async function checkIocs(inventory, options = {}) {
  const owned = !options.context, context = options.context || createRunContext(options), home = context.home;
  const checks = [], coverage = [], commands = [], diagnostics = [];
  const observedAt = new Date(context.wallNow()).toISOString();
  const output = { schemaVersion: 2, generatedAt: observedAt, checks, coverage, commands, diagnostics, scope: '検証済み宣言的IOCの照合。全マルウェアや過去の無侵害を保証しません。' };
  try {
    const document = options.rules || await context.io.readJson(path.join(SKILL, 'references/verified-rules.json'), { roots: [SKILL] });
    // Duplicate identifiers with different rules are ambiguous; never choose whichever arrived last.
    const configured = [...(Array.isArray(document?.rules) ? document.rules : []), ...(Array.isArray(options.discovery?.rules) ? options.discovery.rules : [])];
    const identities = new Map(), conflicting = new Set();
    for (const rule of configured) {
      if (identities.has(rule?.id) && JSON.stringify(identities.get(rule.id)) !== JSON.stringify(rule)) conflicting.add(rule.id);
      else identities.set(rule?.id, rule);
    }
    const merged = configured.length > 200 ? { rules: null } : { rules: [...identities.values()].filter(rule => !conflicting.has(rule?.id)) };
    const { accepted, rejected } = validateIocRules(merged, context.wallNow());
    if (conflicting.size) rejected.push({ status: 'partial', reason: 'conflicting-ioc-rules', count: conflicting.size });
    for (const row of options.discovery?.coverage || []) coverage.push({ ...row, area: 'ioc-discovery' });
    if (options.discovery?.candidates?.length) coverage.push({ area: 'ioc-discovery-review', status: 'partial', count: options.discovery.candidates.length, reasonCode: 'ioc-candidates-unreviewed' });
    for (const row of rejected) { coverage.push({ area: 'ioc-rules', ...row }); diagnostics.push(safeDiagnostic(new SweepError('IOC', { cause: 'unsupported', operation: 'ioc' }))); }
    for (const rule of accepted) {
      const add = data => checks.push({ ruleId: rule.id, sourceUrl: rule.sourceUrl, product: rule.product, platform: rule.platform, verifiedAt: rule.verifiedAt, expiresAt: rule.expiresAt, observedAt, ...data });
      // A rule for another execution platform cannot trigger local reads.
      if (context.platform !== rule.platform) { coverage.push({ area: 'ioc-platform', status: 'partial', reasonCode: 'ioc-platform-unassessed' }); continue; }
      for (const ioc of rule.iocs.filter(item => item.type === 'exact-path')) {
        const target = path.join(home, ioc.relativePath);
        try {
          const metadata = await context.io.inspect(target, { roots: [home] });
          add({ kind: 'path', value: target, matched: true, strong: false, reasonCode: 'ioc-path-present', evidenceKind: 'installed-metadata', modifiedAt: metadata.metadata.mtime.toISOString(), reason: '公式IOCのパスが存在。単独では内容・実行を確定しません。' });

        } catch (error) { const status = readStatus(error); add({ kind: 'path', value: target, matched: status === 'absent' ? false : null, strong: false, status, reasonCode: status === 'absent' ? 'ioc-path-absent' : 'ioc-target-unreadable', reason: status === 'absent' ? 'パスは不在。' : '対象を安全に読み取れないため未確認。' }); if (status !== 'absent') { coverage.push({ area: 'ioc-path', status: 'partial' }); diagnostics.push(safeDiagnostic(error, 'IOC', 'ioc')); } }
      }
      for (const ioc of rule.iocs.filter(item => item.type === 'sha256' && item.target === 'exact-file')) {
        const target = path.join(home, ioc.relativePath);
        try {
          // The shared safe reader rejects secrets, links, placeholders and nonregular files before hashing.
          const hash = await context.io.withVerifiedFile(target, { roots: [home], maxBytes: 25 * 1024 ** 2 }, ({ bytes }) => createHash('sha256').update(bytes).digest('hex'));
          const matched = hash === ioc.value;
          add({ kind: 'sha256', value: target, matched, strong: matched, status: 'complete', evidenceKind: matched ? 'specific-ioc' : 'installed-metadata',
            reasonCode: 'ioc-exact-hash-compared', reason: '指定ファイルのSHA-256だけを比較。本文・実行・窃取の履歴は保存しません。' });
          coverage.push({ area: 'ioc-exact-file', status: 'complete', count: 1 });
        } catch (error) {
          const status = readStatus(error);
          add({ kind: 'sha256', value: target, matched: status === 'absent' ? false : null, strong: false, status,
            reasonCode: status === 'absent' ? 'ioc-path-absent' : 'ioc-target-unreadable' });
          coverage.push({ area: 'ioc-exact-file', status: status === 'absent' ? 'complete' : 'partial', reasonCode: status === 'absent' ? 'ioc-path-absent' : 'ioc-target-unreadable' });
          if (status !== 'absent') diagnostics.push(safeDiagnostic(error, 'IOC', 'ioc'));
        }
      }
      for (const ioc of rule.iocs.filter(item => item.type === 'process-name')) {
        const prerequisite = (inventory.coverage || []).filter(item => item.area === 'processes');
        const complete = prerequisite.length > 0 && prerequisite.every(item => item.status === 'complete');
        const matched = (inventory.processes || []).some(process => process.name === ioc.value);
        add({ kind: 'process', value: ioc.value, matched: matched ? true : complete ? false : null, status: complete ? 'complete' : 'partial', strong: false, reasonCode: complete ? 'ioc-process-name-compared' : 'ioc-process-inventory-partial', evidenceKind: 'running-target-metadata', reason: complete ? 'process名だけでは侵害の確定根拠になりません。' : 'process棚卸しが不完全なため、不一致を確認済みにしません。' });
        coverage.push({ area: 'ioc-process', status: complete ? 'complete' : 'partial' });
      }
      const allowedExtensionRoots = [path.join(home, '.vscode/extensions'), path.join(home, '.cursor/extensions'), path.join(home, '.vscode-insiders/extensions'), ...(context.config.editorRoots || []).map(item => item.root)];
      const needsExtension = rule.iocs.some(item => item.type === 'sha256' && item.target === 'extension-js');
      const extensions = needsExtension ? (inventory.extensions || []).filter(extension => extension.id?.toLowerCase() === rule.extensionId?.toLowerCase()) : [];
      if (needsExtension && !extensions.length) coverage.push({ area: 'ioc-extension-target', status: 'partial', reason: '対象拡張の現在の実物を確認できず、hash検査を実施していません。' });
      for (const extension of extensions) {
        if (extension.id?.toLowerCase() !== rule.extensionId?.toLowerCase() || typeof extension.path !== 'string') continue;
        const root = allowedExtensionRoots.find(candidate => within(candidate, extension.path));
        if (!root) { coverage.push({ area: `ioc-extension:${extension.editor}`, status: 'partial', reason: '許可された拡張rootの外は未読です。' }); continue; }
        let found = 0, examined = 0, incomplete = false;
        const queue = [{ directory: extension.path, depth: 0 }];
        try { await context.io.inspect(extension.path, { roots: [root] }); }
        catch (error) { coverage.push({ area: `ioc-extension:${extension.editor}`, status: 'partial', reason: '拡張rootの実体を検証できません。' }); diagnostics.push(safeDiagnostic(error, 'IOC', 'ioc')); continue; }
        while (queue.length && examined < 3000 && !context.signal.aborted) {
          const { directory, depth } = queue.shift();
          try {
            const listing = await context.io.list(directory, { roots: [root], limit: Math.min(500, 3000 - examined) });
            if (!listing.complete) incomplete = true;
            for (const entry of listing.entries) {
              examined += 1;
              if (entry.symlink) { incomplete = true; continue; }
              const file = path.join(directory, entry.name);
              if (entry.directory && entry.name !== 'node_modules') { if (depth < 5) queue.push({ directory: file, depth: depth + 1 }); else incomplete = true; }
              if (!entry.file || entry.name !== 'extension.js') continue;
              found += 1;
              const bytes = await context.io.readBytes(file, { roots: [root], maxBytes: 25 * 1024 ** 2 });
              const hash = createHash('sha256').update(bytes).digest('hex');
              const matched = rule.iocs.some(item => item.type === 'sha256' && item.target === 'extension-js' && item.value === hash);
              add({ kind: 'sha256', value: file, matched, strong: matched, evidenceKind: matched ? 'specific-ioc' : 'installed-metadata', reasonCode: 'ioc-extension-hash-compared', reason: '検証済みSHA-256と比較。ファイルの実行や過去の窃取は確認しません。' });
            }
          } catch (error) { incomplete = true; diagnostics.push(safeDiagnostic(error, 'IOC', 'ioc')); }
        }
        coverage.push({ area: `ioc-extension:${extension.editor}:${extension.version}`, status: incomplete || queue.length || !found ? 'partial' : 'complete', count: found, examined });
      }
      await context.checkpoint({ stage: 'iocs', value: output });
    }
    coverage.push({ area: 'ioc-authorized-keys', status: 'not-read', policyExcluded: true, reason: '鍵本文は読みません。未読を無影響の根拠にしません。' });
    output.runStatus = assessmentStatus(coverage);
    return output;
  } finally { if (owned) await context.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') process.stdout.write('使い方: node scripts/check-iocs.mjs --inventory JSON \n実行場所: スキルroot。入力は私有証拠JSON、標準出力も私有証拠として扱ってください。読み取り専用です。\n');
  else {
    let context;
    try {
      const options = {};
      for (let index = 0; index < args.length; index += 1) {
        const flag = args[index];
        if (!['--inventory'].includes(flag) || !args[index + 1] || args[index + 1].startsWith('--')) throw new SweepError('CONFIG', { cause: 'malformed', operation: 'cli' });
        options[flag.slice(2)] = args[++index];
      }
      if (!options.inventory || !path.isAbsolute(options.inventory)) throw new SweepError('CONFIG', { cause: 'malformed', operation: 'cli' });
      context = createRunContext();
      const data = await context.io.readJson(options.inventory, { roots: [path.dirname(options.inventory)], maxBytes: 32 * 1024 ** 2 });
      const result = await checkIocs(data, { ...options, context });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); process.exitCode = result.runStatus === 'partial' ? 2 : 0;
    } catch (error) { const detail = safeDiagnostic(error); process.stderr.write(`${JSON.stringify(detail)}\n`); process.exitCode = detail.code === 'MSS_CONFIG' ? 64 : 1; }
    finally { await context?.close(); }
  }
}
