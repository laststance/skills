import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFixture } from './helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(here, '..', 'scripts', 'disk-map.mjs');
const run = (...args) => {
  const result = spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' });
  return { code: result.status, json: result.stdout.trim().startsWith('{') ? JSON.parse(result.stdout) : null };
};

// protects: CLI input is validated before anything starts | fails_when: a relative path or unknown flag is accepted | no_claim: every argument combination
test('start rejects a relative root and an unknown flag with a usage error', () => {
  // Arrange
  const relative = ['start', '--root', 'relative/path'];
  const unknown = ['start', '--delete-everything'];
  // Act
  const results = [run(...relative), run(...unknown)];
  // Assert
  assert.deepEqual(results.map((result) => [result.code, result.json.error]), [[1, 'usage'], [1, 'usage']]);
});

// protects: the CLI lifecycle works end to end | fails_when: start, next, respond or stop break, or the session file is readable by others | no_claim: host process policies
test('a CLI session scans, delivers the scan event, accepts a reply, and stops with reports', async () => {
  // Arrange
  const fx = await makeFixture();
  const started = run('start', '--root', fx.home, '--home', fx.home, '--state-dir', fx.state, '--trash-dir', fx.trash, '--locale', 'ja');
  const session = started.json.session;
  // Act
  const event = run('next', '--session', session, '--timeout', '10');
  const page = run('candidates', '--session', session, '--revision', '0', '--limit', '1');
  const probe = run('probe', '--session', session, '--revision', '0', '--candidate-id', page.json.items[0].candidateId);
  const stale = run('candidates', '--session', session, '--revision', '3');
  const resumed = run('resume', '--session', session);
  const replyFile = path.join(fx.base, 'reply.json');
  await fsp.writeFile(replyFile, JSON.stringify({ messageId: event.json.messageId, revision: 0, text: 'スキャンを確認しました。' }));
  const reply = run('respond', '--session', session, '--file', replyFile);
  const duplicate = run('respond', '--session', session, '--file', replyFile);
  const mode = (await fsp.stat(session)).mode & 0o777;
  const stopped = run('stop', '--session', session);
  // Poll until the runtime has exited instead of sleeping a fixed time.
  let afterStop = run('status', '--session', session);
  for (let attempt = 0; attempt < 50 && afterStop.code !== 4; attempt += 1) afterStop = run('status', '--session', session);
  // Assert
  assert.deepEqual([started.code, started.json.locale, started.json.root], [0, 'ja', fx.home]);
  assert.deepEqual([event.json.type, event.json.kind], ['event', 'scan-complete']);
  assert.deepEqual([page.code, page.json.items.length, probe.code, stale.code, resumed.json.resumed], [0, 1, 0, 5, true]);
  assert.equal(probe.json.path.endsWith('/shop/.next'), true);
  assert.equal(stale.json.error, 'stale-revision');
  assert.deepEqual([reply.json.ok, reply.json.duplicate, duplicate.json.duplicate], [true, false, true]);
  assert.equal(mode, 0o600);
  assert.equal(stopped.json.stopped, true);
  assert.equal(await fsp.access(stopped.json.reports.operationsCsv).then(() => true, () => false), true);
  assert.deepEqual([afterStop.code, afterStop.json.error], [4, 'runtime-unreachable']);
  await fx.cleanup();
});

// protects: the lease survives between turns | fails_when: watch dies with the session running or never exits after it stops | no_claim: scheduler integration
test('watch heartbeats until the session stops, then exits on its own', async () => {
  // Arrange
  const fx = await makeFixture();
  const started = run('start', '--root', fx.home, '--home', fx.home, '--state-dir', fx.state, '--trash-dir', fx.trash);
  const session = started.json.session;
  const watcher = spawn(process.execPath, [cliPath, 'watch', '--session', session, '--interval', '1'], { stdio: 'ignore' });
  const exited = new Promise((resolve) => watcher.once('exit', resolve));
  // Act
  run('stop', '--session', session);
  const code = await Promise.race([exited, new Promise((resolve) => setTimeout(() => resolve('timeout'), 15_000))]);
  watcher.kill('SIGKILL');
  // Assert
  assert.equal(started.code, 0);
  assert.notEqual(code, 'timeout');
  await fx.cleanup();
});

test('watch exits with the pause status instead of keeping an idle session alive', async (t) => {
  // Arrange
  const fx = await makeFixture();
  const server = http.createServer((req, res) => {
    req.resume();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, paused: true, ended: false }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const file = path.join(fx.base, 'watch-session.json');
  await fsp.writeFile(file, JSON.stringify({ origin: `http://127.0.0.1:${server.address().port}`, agentToken: 'fixture' }), { mode: 0o600 });
  const watcher = spawn(process.execPath, [cliPath, 'watch', '--session', file, '--interval', '1'], { stdio: ['ignore', 'pipe', 'ignore'] });
  let output = '';
  watcher.stdout.on('data', (chunk) => { output += chunk; });
  const timeout = setTimeout(() => watcher.kill('SIGKILL'), 5000);
  t.after(async () => { clearTimeout(timeout); watcher.kill(); server.closeAllConnections(); server.close(); await fx.cleanup(); });
  // Act
  const code = await new Promise((resolve) => watcher.once('exit', resolve));
  // Assert
  assert.equal(code, 6);
  assert.deepEqual(JSON.parse(output), { ok: true, watch: 'paused' });
});
