#!/usr/bin/env node
import { readFile, lstat, readdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const RULE = 'cursor-claude-code-2026-10';
const SOURCE = 'https://cursor.com/blog/claude-code-extension-security-notice';
const HASH = 'ecb58cb29078d9646ad1dcdbe51526f2d9cfea06be5fb2ab183e8ecc3ab6bf15';
const IP = '134.209.82.225';
const MARKER = 'svc-telemetry';

/**
 * 公式通知で裏付けたIOCだけを照合する。巡回から呼び、対象コードは実行しない。
 * @param inventory - 同じ巡回で採取した棚卸し。秘密値を含まない形式に限る。
 * @param options - ログの期間と、テスト用のホームディレクトリ。
 * @returns 生の内容を含まず、一致・時刻・確認範囲だけを返す。
 * @example
 * const evidence = await checkIocs(inventory, { since: '2026-10-29T00:00:00Z' });
 */
export async function checkIocs(inventory, options = {}) {
  const home = options.home ?? homedir();
  const checks = [], coverage = [], commands = [];
  const observedAt = new Date().toISOString();
  const deadline = Date.now() + 90_000;
  const add = (data) => checks.push({ ruleId: RULE, observedAt, sourceUrl: SOURCE, ...data });
  // 秘密鍵になり得る.smtkは存在・時刻だけを扱う。
  for (const relative of ['.config/.smt', '.config/.smtk', 'Library/LaunchAgents/com.apple.sysmond.plist']) {
    const target = path.join(home, relative);
    const command = `fs.lstat(${target})`;
    try {
      const metadata = await lstat(target);
      add({ kind: 'path', value: target, matched: true, strong: false, command, modifiedAt: metadata.mtime.toISOString(), createdAt: metadata.birthtime.toISOString(), reason: '公式IOCとパスが一致。単独では内容や実行を確定できない。' });
      // 本文を表示せず、実行スクリプトとLaunchAgentだけを固定文字列で照合する。
      if (!relative.endsWith('.smtk') && metadata.isFile() && metadata.size <= 2 * 1024 * 1024) {
        const bytes = await readFile(target);
        const text = bytes.toString('utf8');
        const specific = text.includes(IP) && (text.includes(MARKER) || text.includes('.smtk'));
        add({ kind: 'file-content', value: target, matched: specific, strong: specific, command: `fs.readFile(${target}): 固定IOCの真偽のみ出力`, reason: specific ? '攻撃先IPとペイロード固有の文字列が同じファイルで一致。' : '固有文字列の組み合わせは未検出。' });
      }
    } catch (error) {
      // 読み取り失敗を不在へ置き換えない。
      add({ kind: 'path', value: target, matched: false, strong: false, command, status: error.code === 'ENOENT' ? 'absent' : 'unavailable', reason: error.code === 'ENOENT' ? 'パスは存在しない。' : `未確認（${error.code ?? 'READ_ERROR'}）。` });
    }
  }
  // 正規配布を含め、残存する対象拡張をハッシュで検査する。
  for (const extension of inventory.extensions ?? []) {
    if (extension.id?.toLowerCase() !== 'anthropic.claude-code' || !extension.path) continue;
    const root = path.resolve(extension.path);
    if (![path.join(home, '.vscode/extensions/'), path.join(home, '.cursor/extensions/')].some(prefix => `${root}/`.startsWith(prefix))) continue;
    // 探索開始ディレクトリのリンクによる範囲外アクセスも拒否する。
    try {
      if ((await lstat(root)).isSymbolicLink() || await realpath(root) !== root) {
        coverage.push({ area: `ioc-extension:${extension.editor}`, status: 'partial', reason: 'リンク経由の拡張ルートは未読。' });
        continue;
      }
    } catch { coverage.push({ area: `ioc-extension:${extension.editor}`, status: 'unavailable', reason: '拡張ルートを検証できない。' }); continue; }
    const queue = [[root, 0]];
    let examined = 0, found = 0, incomplete = false;
    while (queue.length && examined < 3000 && Date.now() < deadline) {
      const [directory, depth] = queue.shift();
      let entries;
      try { entries = await readdir(directory, { withFileTypes: true }); } catch { incomplete = true; continue; }
      for (const entry of entries) {
        if (examined >= 3000 || Date.now() >= deadline) { incomplete = true; break; }
        examined++;
        if (entry.isSymbolicLink()) { incomplete = true; continue; }
        const file = path.join(directory, entry.name);
        if (entry.isDirectory() && depth < 5 && entry.name !== 'node_modules') queue.push([file, depth + 1]);
        if (!entry.isFile() || entry.name !== 'extension.js') continue;
        found++;
        try {
          const metadata = await lstat(file);
          if (metadata.size > 32 * 1024 * 1024) { incomplete = true; continue; }
          const bytes = await readFile(file);
          const hashMatch = createHash('sha256').update(bytes).digest('hex') === HASH;
          const markerMatch = bytes.includes(Buffer.from(IP)) && bytes.includes(Buffer.from(MARKER));
          add({ kind: 'sha256', value: file, matched: hashMatch || markerMatch, strong: hashMatch || markerMatch, command: `SHA256/固定文字列照合 ${file}`, modifiedAt: metadata.mtime.toISOString(), reason: hashMatch ? '公式ペイロードのSHA-256が一致。' : markerMatch ? '公式の攻撃先IPと識別文字列の両方が一致。' : '公式ハッシュ・識別文字列の組み合わせは不一致。' });
        } catch { incomplete = true; }
      }
    }
    coverage.push({ area: `ioc-extension:${extension.editor}:${extension.version}`, status: incomplete || queue.length || !found ? 'partial' : 'complete', count: found, reason: `確認したエントリー${examined}件。拡張は実行していない。` });
  }
  // 一時ファイルの内容は鍵の可能性があるため読まない。
  try {
    const temporary = options.temp ?? tmpdir();
    const entries = await readdir(temporary);
    for (const entry of entries.filter(name => /^\.stk_[a-f\d]{10}$/i.test(name))) add({ kind: 'path', value: path.join(temporary, entry), matched: true, strong: false, command: `fs.readdir(${temporary})`, reason: '公式の一時ファイル名パターンと一致。内容は未読。' });
    coverage.push({ area: 'ioc-temp', status: 'complete', reason: '現在の利用者の一時ディレクトリのみ。' });
  } catch { coverage.push({ area: 'ioc-temp', status: 'unavailable', reason: '一時ディレクトリを読めない。' }); }
  // 棚卸しのソケット情報をローカルで検査し、IOC宛て通信は行わない。
  const liveMatch = JSON.stringify(inventory.network ?? {}).includes(IP);
  add({ kind: 'network', value: IP, matched: liveMatch, strong: false, command: '棚卸しのlsof結果をローカル固定IP照合', reason: liveMatch ? 'IOCのIPと現在の接続が一致。利用プロセスの追加確認が必要。' : '採取時の接続一覧にはIOCのIPがない。過去の通信は未証明。' });
  // ログは固定述語・有限期間で取得し、メッセージ本文を保存しない。
  if (options.logs !== false) {
    const until = new Date(options.until ?? observedAt);
    const since = new Date(Math.max(new Date(options.since ?? until.getTime() - 14 * 86400000).getTime(), until.getTime() - 14 * 86400000, Date.parse('2026-10-29T09:27:00Z')));
    // log showはISOのT/Z表記を受け付けないため、OSが対応するUNIX秒を渡す。
    const startArg = `@${Math.floor(since.getTime() / 1000)}`;
    const endArg = `@${Math.floor(until.getTime() / 1000)}`;
    const args = ['show', '--style', 'json', '--start', startArg, '--end', endArg, '--timezone', 'UTC', '--predicate', `eventMessage CONTAINS "${IP}" OR eventMessage CONTAINS "${MARKER}" OR eventMessage CONTAINS "com.apple.sysmond"`];
    const command = `/usr/bin/log show --style json --start ${startArg} --end ${endArg} --timezone UTC --predicate <検証済みIOC固定述語>`;
    const started = Date.now();
    try {
      const { stdout } = await execute('/usr/bin/log', args, { timeout: 30000, maxBuffer: 8 * 1024 * 1024, env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: home, TZ: 'UTC' } });
      const rows = JSON.parse(stdout);
      // 自分の走査コマンドや記事の表示記録は実行・侵害の確定証拠にしない。
      for (const row of rows.slice(0, 50)) add({ kind: 'log', value: '公式IOCに合致するログ', matched: true, strong: false, command, eventAt: row.timestamp ?? null, reason: '固定述語に一致。ログ本文は非保存。操作自身の記録との区別が必要。' });
      coverage.push({ area: 'ioc-logs', status: rows.length > 50 ? 'partial' : 'complete', count: rows.length, reason: '保存期間・非公開領域・ログ欠落により過去の不在は証明できない。' });
      commands.push({ command, status: 'complete', elapsedMs: Date.now() - started });
    } catch (error) {
      coverage.push({ area: 'ioc-logs', status: 'unavailable', reason: error.killed ? 'log showが30秒上限に達したため打ち切った。ログは未確認。sudoは使わない。' : `log showを取得できない（${error.code ?? 'LOG_ERROR'}）。sudoは使わない。` });
      commands.push({ command, status: 'unavailable', elapsedMs: Date.now() - started });
    }
  }
  coverage.push({ area: 'ioc-authorized-keys', status: 'not-read', policyExcluded: true, reason: '依頼の制約により鍵内容は読まず、棚卸しの有無・行数だけを使用。公式の鍵文字列チェックは未実施。対象外を無影響の根拠には使用しない。' });
  return { schemaVersion: 1, generatedAt: observedAt, checks, coverage, commands, scope: 'Cursor公式通知のIOC。全マルウェアの検査ではない。' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    process.stdout.write('使い方: node check-iocs.mjs --inventory JSON [--since ISO] [--until ISO] [--no-logs]\n検証済みIOCを読み取り専用で照合します。鍵本文は読みません。\n');
    process.exit(0);
  }
  const value = flag => args[args.indexOf(flag) + 1];
  if (!args.includes('--inventory')) {
    process.stdout.write(JSON.stringify({ error: '使い方: node check-iocs.mjs --inventory inventory.json [--since ISO] [--until ISO] [--no-logs]' }) + '\n');
    process.exitCode = 1;
  } else {
    try {
      const inventory = JSON.parse(await readFile(value('--inventory'), 'utf8'));
      const result = await checkIocs(inventory, { since: args.includes('--since') ? value('--since') : undefined, until: args.includes('--until') ? value('--until') : undefined, logs: !args.includes('--no-logs') });
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } catch { process.stdout.write(JSON.stringify({ error: 'IOC照合に失敗。入力JSONと読み取り権限を確認してください。' }) + '\n'); process.exitCode = 1; }
  }
}
