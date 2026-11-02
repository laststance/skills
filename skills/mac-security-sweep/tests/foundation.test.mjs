import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns/promises';
import { createSafeIO, allowedProjectRoot, boundedJson } from '../scripts/safe-io.mjs';
import { createRunContext, executeCommand, validateCommand, validatePublicRequest, resolveTool } from '../scripts/runtime.mjs';
import { safeDiagnostic, DIAGNOSTIC_CODES, diagnostic } from '../scripts/diagnostics.mjs';
import { parseRunnerArgs, validateConfiguration, projectProgress } from '../scripts/configuration.mjs';
import { createLocalityGuard } from '../scripts/file-flags.mjs';

const execute = promisify(execFile);

/** 各試験に独立した実体homeを与える。実ホーム・認証領域は利用しない。 @example const home = await fixture(t) */
async function fixture(t) {
  const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mss-foundation-')));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  return home;
}

test('許可rootの通常JSONだけを読み、秘密・リンク・似たprefixはopen前に拒否する', async t => {
  // Arrange
  const home = await fixture(t), root = path.join(home, 'Projects');
  await fs.mkdir(root); await fs.mkdir(path.join(home, 'Projects-other'));
  await fs.writeFile(path.join(root, 'meta.json'), '{"version":"1.0.0"}');
  await fs.writeFile(path.join(root, '.env'), 'SENTINEL_SECRET');
  await fs.symlink(path.join(root, 'meta.json'), path.join(root, 'linked.json'));
  const opened = [];
  const io = createSafeIO({ home, filesystem: { ...fs, open: (...args) => { opened.push(args[0]); return fs.open(...args); } } });
  // Act
  const actual = await io.readJson(path.join(root, 'meta.json'), { roots: [root], purpose: 'project' });
  for (const filename of [path.join(root, '.env'), path.join(root, 'linked.json'), path.join(home, 'Projects-other/x.json')]) await assert.rejects(io.readText(filename, { roots: [root], purpose: 'project' }));
  // Assert
  assert.deepEqual(actual, { version: '1.0.0' });
  assert.deepEqual(opened, [path.join(root, 'meta.json')]);
});

test('祖先リンク・Libraryの大文字小文字・home全体をproject探索に使わない', async t => {
  // Arrange
  const home = await fixture(t);
  await fs.mkdir(path.join(home, 'Library')); await fs.writeFile(path.join(home, 'Library', 'meta.json'), '{}');
  await fs.symlink(path.join(home, 'Library'), path.join(home, 'Projects'));
  const io = createSafeIO({ home });
  // Act / Assert
  assert.equal(allowedProjectRoot(home, path.join(home, 'library')), false);
  assert.equal(allowedProjectRoot(home, home), false);
  await assert.rejects(io.readJson(path.join(home, 'Projects/meta.json'), { roots: [path.join(home, 'Projects')], purpose: 'project' }));
});

test('検証後に差し替えられたファイルはFD本文を読まず拒否する', async t => {
  // Arrange
  const home = await fixture(t), filename = path.join(home, 'meta.json');
  await fs.writeFile(filename, '{}');
  let reads = 0;
  const io = createSafeIO({ home, beforeRead: async () => { await fs.rename(filename, `${filename}.old`); await fs.writeFile(filename, '{"secret":"SENTINEL"}'); },
    filesystem: { ...fs, open: async (...args) => { const handle = await fs.open(...args); const read = handle.read.bind(handle); handle.read = (...values) => { reads += 1; return read(...values); }; return handle; } } });
  // Act / Assert
  await assert.rejects(io.readJson(filename, { roots: [home] }), error => error.diagnostic.cause === 'identity');
  assert.equal(reads, 0);
});

test('FIFO・大きな本文・placeholderを開かずに未確認として返せる', async t => {
  // Arrange
  const home = await fixture(t);
  await execute('/usr/bin/mkfifo', [path.join(home, 'pipe')]);
  await fs.writeFile(path.join(home, 'large.json'), '0123456789');
  await fs.writeFile(path.join(home, '.file.icloud'), 'SENTINEL');
  let opened = 0;
  const io = createSafeIO({ home, filesystem: { ...fs, open: (...args) => { opened += 1; return fs.open(...args); } } });
  // Act / Assert
  for (const filename of ['pipe', 'large.json', '.file.icloud']) await assert.rejects(io.readBytes(path.join(home, filename), { roots: [home], maxBytes: 5 }));
  assert.equal(opened, 0);
});

test('通常名のdatalessファイルと取得不能なnative flagsを本文open前に延期する', async t => {
  // Arrange
  const home = await fixture(t), filename = path.join(home, 'package-lock.json');
  await fs.writeFile(filename, '{"SENTINEL_SECRET":true}');
  let opened = 0;
  for (const failure of ['dataless', 'unavailable']) {
    const localityGuard = createLocalityGuard({ platform: 'darwin', runStat: async target => {
      const stat = await fs.lstat(target);
      return target === filename && failure === 'unavailable' ? { code: 1, stdout: 'SENTINEL_ERROR' }
        : { code: 0, stdout: `${stat.dev}:${stat.ino}:${target === filename ? 1073741824 : 0}` };
    } });
    const io = createSafeIO({ home, localityGuard, filesystem: { ...fs, open: (...args) => { opened += 1; return fs.open(...args); } } });
    // Act / Assert
    await assert.rejects(io.readJson(filename, { roots: [home] }), error => error.diagnostic.cause === 'not-local' && !JSON.stringify(error).includes('SENTINEL'));
  }
  assert.equal(opened, 0);
});

test('datalessの親を検出した後は子のstatもdirectory列挙も実行しない', async t => {
  // Arrange
  const home = await fixture(t), parent = path.join(home, 'Projects');
  await fs.mkdir(parent); await fs.writeFile(path.join(parent, 'package-lock.json'), '{}');
  let childStats = 0, listings = 0;
  const localityGuard = createLocalityGuard({ platform: 'darwin', runStat: async target => {
    const stat = await fs.lstat(target);
    return { code: 0, stdout: `${stat.dev}:${stat.ino}:${target === parent ? 1073741824 : 0}` };
  } });
  const io = createSafeIO({ home, localityGuard, filesystem: { ...fs,
    lstat: target => { if (target.startsWith(`${parent}/`)) childStats += 1; return fs.lstat(target); },
    opendir: (...args) => { listings += 1; return fs.opendir(...args); },
  } });
  // Act / Assert
  await assert.rejects(io.readJson(path.join(parent, 'package-lock.json'), { roots: [home] }));
  await assert.rejects(io.list(parent, { roots: [home] }));
  assert.equal(childStats, 0); assert.equal(listings, 0);
});

test('local判定の後でもctime変更時はnative flagsを再確認する', async () => {
  // Arrange
  let calls = 0;
  const guard = createLocalityGuard({ platform: 'darwin', runStat: async () => ({ code: 0, stdout: `1:2:${++calls === 1 ? 0 : 1073741824}` }) });
  const metadata = { dev: 1, ino: 2, mode: 33152, size: 10, mtimeMs: 1, ctimeMs: 1 };
  // Act
  await guard('/fixture/normal.json', metadata);
  await guard('/fixture/normal.json', metadata);
  // Assert
  assert.equal(calls, 1);
  await assert.rejects(guard('/fixture/normal.json', { ...metadata, ctimeMs: 2 }), error => error.diagnostic.cause === 'not-local');
  assert.equal(calls, 2);
});

test('実macOSのStatsにflagsがなくても固定statで一時localファイルを確認できる', { skip: process.platform !== 'darwin' }, async t => {
  // Arrange
  const home = await fixture(t), filename = path.join(home, 'normal.json');
  await fs.writeFile(filename, '{"count":1}');
  const context = createRunContext({ home, budgetMs: 120000 });
  // Act
  const actual = await context.io.readJson(filename, { roots: [home] });
  await context.close();
  // Assert
  assert.deepEqual(actual, { count: 1 });
  assert.ok(context.metrics.commandCount > 0); assert.ok(context.metrics.commands.peak <= 4);
});

test('directory上限から次のoffsetへ進み固定targetを取りこぼさない', async t => {
  // Arrange
  const home = await fixture(t);
  for (let index = 0; index < 17; index += 1) await fs.writeFile(path.join(home, `${index}.json`), '{}');
  const io = createSafeIO({ home }), seen = [];
  let offset = 0, complete = false;
  // Act
  while (!complete) { const part = await io.list(home, { roots: [home], limit: 4, offset }); seen.push(...part.entries.map(entry => entry.name)); offset = part.offset; complete = part.complete; }
  // Assert
  assert.equal(seen.length, 17); assert.equal(new Set(seen).size, 17);
});

test('全診断が有限の日本語復旧情報を持ちnested exception秘密を転載しない', () => {
  // Arrange
  const error = Object.assign(new Error('SENTINEL_MESSAGE'), { code: 'EACCES', cause: { token: 'SENTINEL_TOKEN' }, stdout: 'SENTINEL_STDOUT', stderr: 'SENTINEL_STDERR' });
  // Act
  const diagnostics = DIAGNOSTIC_CODES.map(code => diagnostic(code.slice(4), { operation: 'SENTINEL_OPERATION', cause: 'SENTINEL_CAUSE' }));
  diagnostics.push(safeDiagnostic(error));
  // Assert
  assert.equal(JSON.stringify(diagnostics).includes('SENTINEL'), false);
  for (const item of diagnostics) { assert.match(item.code, /^MSS_/); assert.ok(item.message); assert.ok(item.recovery); assert.equal(item.writeOutcome, 'none'); assert.equal(item.context.schema, 2); }
});

test('unknown state値は設定・証拠へ射影せずfuture schemaと危険rootを拒否する', async t => {
  // Arrange
  const home = await fixture(t), state = { secret: 'SENTINEL', queryUnknownGlobals: false, scanRoots: [{ path: '~/Projects', scope: 'work' }] };
  // Act
  const config = validateConfiguration(state, home);
  // Assert
  assert.equal(config.queryUnknownGlobals, false); assert.equal(config.scanRoots[0].scope, 'work');
  assert.equal(JSON.stringify(config).includes('SENTINEL'), false); assert.deepEqual(projectProgress(state), {});
  assert.throws(() => validateConfiguration({ schemaVersion: 99 }, home));
  assert.throws(() => validateConfiguration({ scanRoots: [{ path: '~/library' }] }, home));
  assert.throws(() => parseRunnerArgs(['--unknown', 'SENTINEL']));
  assert.deepEqual(parseRunnerArgs(['--budget-ms', '120000']), { budgetMs: 120000 });
  assert.throws(() => boundedJson('[[[[1]]]]', { maxDepth: 2 }));
});

test('通信先・queryの余分なfield・stateだけの告知IDをHTTP前に拒否する', () => {
  // Arrange
  const valid = { method: 'POST', body: JSON.stringify({ queries: [{ package: { name: 'org:artifact', ecosystem: 'Maven' }, version: '1.0.0' }] }) };
  // Act / Assert
  assert.equal(validatePublicRequest('https://api.osv.dev/v1/querybatch', valid), true);
  assert.equal(validatePublicRequest('https://api.osv.dev/v1/querybatch', { ...valid, body: JSON.stringify({ queries: [{ package: { name: 'x', ecosystem: 'npm', token: 'SENTINEL' }, version: '1.0.0' }] }) }), false);
  assert.equal(validatePublicRequest('https://api.osv.dev/v1/vulns/GHSA-example'), false);
  assert.equal(validatePublicRequest('https://api.osv.dev/v1/vulns/GHSA-example', { authorizedIds: new Set(['GHSA-example']) }), true);
  assert.equal(validatePublicRequest('https://www.cisa.gov/private?token=SENTINEL'), false);
  assert.equal(validateCommand('spctl', ['--assess', '/Applications/Test.app']), false);
  assert.equal(validateCommand('brew', ['update']), false);
});

test('HTTP全体6・host2とcommand4・scanner2を共有する', async () => {
  // Arrange
  let active = 0, commandActive = 0;
  const wait = () => new Promise(resolve => setTimeout(resolve, 5));
  const ctx = createRunContext({ budgetMs: 120000,
    fetchImpl: async () => { active += 1; await wait(); active -= 1; return new Response('{}'); },
    toolResolver: async operation => ({ path: operation }), executeImpl: async () => { commandActive += 1; await wait(); commandActive -= 1; return { code: 0, stdout: '', stderr: '' }; } });
  const urls = ['https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', 'https://www.bleepingcomputer.com/feed/', 'https://socket.dev/api/blog/feed.json'];
  // Act
  await Promise.all([...Array.from({ length: 6 }, (_, index) => ctx.request(urls[index % 3])), ...Array.from({ length: 10 }, () => ctx.command('osv-scanner', ['--version'])), ...Array.from({ length: 8 }, () => ctx.command('sw_vers', []))]);
  await ctx.close();
  // Assert
  assert.equal(ctx.metrics.http.peak, 6); assert.equal(ctx.metrics.commands.peak, 4); assert.equal(ctx.metrics.scanner.peak, 2);
  assert.deepEqual(Object.values(ctx.metrics.hosts).map(value => value.peak), [2, 2, 2]); assert.equal(active, 0); assert.equal(commandActive, 0);
});

test('429をcooldownへ保存し同一hostの再要求を起動しない', async () => {
  // Arrange
  let calls = 0;
  const ctx = createRunContext({ wallNow: () => 1000000, fetchImpl: async () => { calls += 1; return new Response('{}', { status: 429, headers: { 'Retry-After': '60' } }); } });
  // Act
  await ctx.request('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json');
  await assert.rejects(ctx.request('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'));
  await ctx.close();
  // Assert
  assert.equal(calls, 1); assert.equal(ctx.transport.cooldowns['www.cisa.gov'], 1060000);
});

test('終わらないHTTP本文を中止し未実行queueと遅延書込を残さない', async () => {
  // Arrange
  let calls = 0, cancelled = 0;
  const ctx = createRunContext({ fetchImpl: async () => { calls += 1; return new Response(new ReadableStream({ cancel() { cancelled += 1; } })); } });
  const requests = Array.from({ length: 10 }, () => ctx.request('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'));
  const settled = Promise.allSettled(requests);
  // Act
  await new Promise(resolve => setTimeout(resolve, 10));
  await ctx.close();
  const results = await settled;
  // Assert
  assert.equal(calls, 2); assert.equal(cancelled, 2); assert.equal(results.filter(result => result.status === 'rejected').length, 10);
});

test('一つの公開requestは再試行を含め二回までに留める', async () => {
  // Arrange
  let calls = 0;
  const ctx = createRunContext({ fetchImpl: async () => { calls += 1; return new Response('{}', { status: 503 }); } });
  // Act
  const result = await ctx.request('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json');
  await ctx.close();
  // Assert
  assert.equal(calls, 2); assert.equal(result.status, 503);
});

test('wall clockの変化で処理期限が伸びず中止済みqueueを起動しない', async () => {
  // Arrange
  let mono = 0, wall = 1000, calls = 0;
  const ctx = createRunContext({ budgetMs: 120000, monotonicNow: () => mono, wallNow: () => wall, fetchImpl: async () => { calls += 1; return new Response('{}'); } });
  // Act
  wall = -900000; mono = 108001;
  await assert.rejects(ctx.request('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'));
  await ctx.close();
  // Assert
  assert.equal(calls, 0); assert.equal(ctx.remainingMs(), 0);
});

test('起動した遅い子の終了を待ち停止後のファイル書込を残さない', async t => {
  // Arrange
  const home = await fixture(t), late = path.join(home, 'late');
  const script = path.join(home, 'child.mjs');
  await fs.writeFile(script, `import fs from 'node:fs'; process.on('SIGTERM',()=>{}); setTimeout(()=>fs.writeFileSync(process.argv[2],'late'),1500); setInterval(()=>{},100);`);
  // Act
  const started = Date.now();
  await assert.rejects(executeCommand(process.execPath, [script, late], { home, timeoutMs: 100 }));
  // Assert
  assert.ok(Date.now() - started >= 100); assert.ok(Date.now() - started < 1500);
  assert.equal(await fs.lstat(late).then(() => true, () => false), false);
});

test('通常のhttp・net・tls・dns・fetchの実通信をpreloadが遮断する', async () => {
  // Arrange / Act / Assert
  assert.throws(() => http.get('http://127.0.0.1:9'), /MSS_TEST_NETWORK_DENIED/);
  assert.throws(() => new net.Socket().connect(9, '127.0.0.1'), /MSS_TEST_NETWORK_DENIED/);
  assert.throws(() => tls.connect(443, 'example.com'), /MSS_TEST_NETWORK_DENIED/);
  assert.throws(() => dns.lookup('example.com'), /MSS_TEST_NETWORK_DENIED/);
  assert.throws(() => fetch('https://example.com'), /MSS_TEST_NETWORK_DENIED/);
});

test('auth設定をcustom SBOMに指定してもconfigと本文openの両方で拒否する', async t => {
  // Arrange
  const home = await fixture(t), paths = ['.npmrc', '.netrc', '.docker/config.json', '.codex/auth.json', '.config/gh/hosts.yml', '.kube/config', '.openclaw/agents/main/agent/auth-profiles.json', '.supabase/access-token'];
  let opened = 0;
  const io = createSafeIO({ home, filesystem: { ...fs, open: (...args) => { opened += 1; return fs.open(...args); } } });
  // Act / Assert
  for (const value of paths) {
    const filename = path.join(home, value); await fs.mkdir(path.dirname(filename), { recursive: true }); await fs.writeFile(filename, 'SENTINEL');
    assert.throws(() => validateConfiguration({ sbomFiles: [filename] }, home));
    await assert.rejects(io.readText(filename, { roots: [home] }));
  }
  assert.equal(opened, 0);
});

test('unexpected stage errorに安全な診断IDを付けnested messageを保存しない', () => {
  // Arrange
  const error = Object.assign(new TypeError('SENTINEL_MESSAGE'), { cause: { token: 'SENTINEL_TOKEN' } });
  // Act
  const detail = safeDiagnostic(error, 'READER', 'inventory');
  // Assert
  assert.equal(detail.code, 'MSS_INTERNAL'); assert.match(detail.trace.id, /^[a-f0-9-]{36}$/); assert.equal(detail.operation, 'inventory'); assert.equal(JSON.stringify(detail).includes('SENTINEL'), false);
});

test('子孫がstdioを保持していても専用process groupを期限で回収する', async t => {
  // Arrange
  const home = await fixture(t), filename = path.join(home, 'late-grandchild');
  const descendant = `setTimeout(()=>require('fs').writeFileSync(${JSON.stringify(filename)},'late'),300);setTimeout(()=>{},1500)`;
  const child = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:['ignore',1,2]});setTimeout(()=>{},10000)`;
  const started = Date.now();
  // Act
  await assert.rejects(executeCommand(process.execPath, ['-e', child], { timeoutMs: 60 }));
  // Assert
  assert.ok(Date.now() - started < 1000); assert.equal(await fs.lstat(filename).then(() => true, () => false), false);
});
