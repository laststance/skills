#!/usr/bin/env node
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRunContext } from './runtime.mjs';
import { within, readStatus, boundedJson } from './safe-io.mjs';
import { safeDiagnostic, SweepError } from './diagnostics.mjs';
import { validateIocRules, endpointHasIp } from './ioc-rules.mjs';

const SKILL = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** 検証期限内の宣言的IOCを安全な範囲で照合する。runnerと単独CLIが呼ぶ。 @example await checkIocs(inventory, {context, logs:false}) */
export async function checkIocs(inventory, options = {}) {
  const owned = !options.context, context = options.context || createRunContext(options), home = context.home;
  const checks = [], coverage = [], commands = [], diagnostics = [];
  const observedAt = new Date(context.wallNow()).toISOString();
  const output = { schemaVersion: 2, generatedAt: observedAt, checks, coverage, commands, diagnostics, scope: '検証済み宣言的IOCの照合。全マルウェアや過去の無侵害を保証しません。' };
  try {
    const document = options.rules || await context.io.readJson(path.join(SKILL, 'references/verified-rules.json'), { roots: [SKILL] });
    const { accepted, rejected } = validateIocRules(document, context.wallNow());
    for (const row of rejected) { coverage.push({ area: 'ioc-rules', ...row }); diagnostics.push(safeDiagnostic(new SweepError('IOC', { cause: 'unsupported', operation: 'ioc' }))); }
    for (const rule of accepted) {
      const add = data => checks.push({ ruleId: rule.id, sourceUrl: rule.sourceUrl, observedAt, ...data });
      for (const ioc of rule.iocs.filter(item => item.type === 'exact-path')) {
        const target = path.join(home, ioc.relativePath);
        try {
          const metadata = await context.io.inspect(target, { roots: [home] });
          add({ kind: 'path', value: target, matched: true, strong: false, evidenceKind: 'installed-metadata', modifiedAt: metadata.metadata.mtime.toISOString(), reason: '公式IOCのパスが存在。単独では内容・実行を確定しません。' });
          // 鍵になり得る.smtkは常にmetadata-only。互換profileの既知payloadだけを比較する。
          if (rule.legacy && ['.config/.smt', 'Library/LaunchAgents/com.apple.sysmond.plist'].includes(ioc.relativePath) && metadata.metadata.isFile()) {
            const bytes = await context.io.readBytes(target, { roots: [home], maxBytes: 2 * 1024 ** 2 });
            const matched = bytes.includes(Buffer.from(rule.legacy.ip)) && (bytes.includes(Buffer.from(rule.legacy.marker)) || bytes.includes(Buffer.from(rule.legacy.keyBasename)));
            add({ kind: 'file-content', value: target, matched, strong: matched, evidenceKind: matched ? 'specific-ioc' : 'installed-metadata', reason: '既知Cursor payloadの固定文字列の複合一致だけを保存。本文は保存しません。' });
          }
        } catch (error) { const status = readStatus(error); add({ kind: 'path', value: target, matched: false, strong: false, status, reason: status === 'absent' ? 'パスは不在。' : '対象を安全に読み取れないため未確認。' }); if (status !== 'absent') { coverage.push({ area: 'ioc-path', status: 'partial' }); diagnostics.push(safeDiagnostic(error, 'IOC', 'ioc')); } }
      }
      for (const ioc of rule.iocs.filter(item => item.type === 'process-name')) {
        const prerequisite = (inventory.coverage || []).filter(item => item.area === 'processes');
        const complete = prerequisite.length > 0 && prerequisite.every(item => item.status === 'complete');
        const matched = (inventory.processes || []).some(process => process.name === ioc.value);
        add({ kind: 'process', value: ioc.value, matched: matched ? true : complete ? false : null, status: complete ? 'complete' : 'partial', strong: false, evidenceKind: 'running-target-metadata', reason: complete ? 'process名だけでは侵害の確定根拠になりません。' : 'process棚卸しが不完全なため、不一致を確認済みにしません。' });
        coverage.push({ area: 'ioc-process', status: complete ? 'complete' : 'partial' });
      }
      const allowedExtensionRoots = [path.join(home, '.vscode/extensions'), path.join(home, '.cursor/extensions'), path.join(home, '.vscode-insiders/extensions'), ...(context.config.editorRoots || []).map(item => item.root)];
      const needsExtension = rule.iocs.some(item => item.type === 'sha256') || Boolean(rule.legacy);
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
              const matched = rule.iocs.some(item => item.type === 'sha256' && item.value === hash) || Boolean(rule.legacy && bytes.includes(Buffer.from(rule.legacy.ip)) && bytes.includes(Buffer.from(rule.legacy.marker)));
              add({ kind: 'sha256', value: file, matched, strong: matched, evidenceKind: matched ? 'specific-ioc' : 'installed-metadata', reason: '検証済みSHA-256または既存Cursorの固定複合IOCと比較。拡張は実行しません。' });
            }
          } catch (error) { incomplete = true; diagnostics.push(safeDiagnostic(error, 'IOC', 'ioc')); }
        }
        coverage.push({ area: `ioc-extension:${extension.editor}:${extension.version}`, status: incomplete || queue.length || !found ? 'partial' : 'complete', count: found, examined });
      }
      if (rule.legacy) {
        const defaultTemporary = tmpdir();
        const temporary = options.temp || (context.platform === 'darwin' && defaultTemporary.startsWith('/var/') ? `/private${defaultTemporary}` : defaultTemporary);
        try {
          const listing = await context.io.list(temporary, { roots: [temporary], limit: 3000 });
          for (const entry of listing.entries.filter(item => /^\.stk_[a-f\d]{10}$/i.test(item.name))) add({ kind: 'path', value: path.join(temporary, entry.name), matched: true, strong: false, reason: '既知の一時名と一致。鍵の可能性があるため本文は未読。' });
          coverage.push({ area: 'ioc-temp', status: listing.complete ? 'complete' : 'partial' });
        } catch (error) { coverage.push({ area: 'ioc-temp', status: 'partial' }); diagnostics.push(safeDiagnostic(error, 'IOC', 'ioc')); }
        const endpoints = [...(inventory.network?.listening || []), ...(inventory.network?.established || [])].map(item => typeof item === 'string' ? item : item.endpoint);
        add({ kind: 'network', value: rule.legacy.ip, matched: endpoints.some(endpoint => endpointHasIp(endpoint, rule.legacy.ip)), strong: false, reason: '現在の数値IP一致だけ。過去の通信・実行・窃取は未証明。' });
        if (options.logs !== false) {
          const until = Date.parse(options.until || observedAt), requestedSince = Date.parse(options.since || new Date(until - 14 * 86400000).toISOString());
          if (!Number.isFinite(until) || !Number.isFinite(requestedSince) || requestedSince > until) throw new SweepError('CONFIG', { cause: 'malformed', operation: 'ioc' });
          const since = Math.max(requestedSince, until - 14 * 86400000, Date.parse('2026-10-29T09:27:00Z'));
          try {
            const value = await context.command('log', ['show', '--style', 'json', '--start', `@${Math.floor(since / 1000)}`, '--end', `@${Math.floor(until / 1000)}`, '--timezone', 'UTC', '--predicate', 'eventMessage CONTAINS "134.209.82.225" OR eventMessage CONTAINS "svc-telemetry" OR eventMessage CONTAINS "com.apple.sysmond"'], { timeoutMs: 30000 });
            if (value.code !== 0) throw new SweepError('COMMAND', { cause: 'io', operation: 'ioc' });
            const rows = boundedJson(value.stdout);
            if (!Array.isArray(rows)) throw new SweepError('FORMAT', { cause: 'malformed', operation: 'ioc' });
            for (const row of rows.slice(0, 50)) add({ kind: 'log', value: '検証済みIOCの固定述語', matched: true, strong: false, eventAt: Number.isFinite(Date.parse(row.timestamp)) ? new Date(row.timestamp).toISOString() : null, reason: 'ログ本文は保存しません。調査操作自身の記録との区別が必要です。' });
            coverage.push({ area: 'ioc-logs', status: rows.length > 50 ? 'partial' : 'complete', count: rows.length });
            commands.push({ command: 'log show（固定Cursor IOC profile）', status: 'complete' });
          } catch (error) { coverage.push({ area: 'ioc-logs', status: 'partial' }); diagnostics.push(safeDiagnostic(error, 'IOC', 'ioc')); }
        }
      }
      await context.checkpoint({ stage: 'iocs', value: output });
    }
    coverage.push({ area: 'ioc-authorized-keys', status: 'not-read', policyExcluded: true, reason: '鍵本文は読みません。未読を無影響の根拠にしません。' });
    output.runStatus = coverage.some(item => item.status === 'partial') ? 'partial' : 'complete-with-exclusions';
    return output;
  } finally { if (owned) await context.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') process.stdout.write('使い方: node scripts/check-iocs.mjs --inventory JSON [--since ISO] [--until ISO] [--no-logs]\n実行場所: スキルroot。入力は私有証拠JSON、標準出力も私有証拠として扱ってください。読み取り専用です。\n');
  else {
    let context;
    try {
      const options = {};
      for (let index = 0; index < args.length; index += 1) {
        const flag = args[index];
        if (flag === '--no-logs') { options.logs = false; continue; }
        if (!['--inventory', '--since', '--until'].includes(flag) || !args[index + 1] || args[index + 1].startsWith('--')) throw new SweepError('CONFIG', { cause: 'malformed', operation: 'cli' });
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
