import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFixture } from './helpers.mjs';

const cliPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'disk-map.mjs');
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
  const replyFile = path.join(fx.base, 'reply.json');
  await fsp.writeFile(replyFile, JSON.stringify({ messageId: event.json.messageId, revision: 0, text: 'スキャンを確認しました。' }));
  const reply = run('respond', '--session', session, '--file', replyFile);
  const duplicate = run('respond', '--session', session, '--file', replyFile);
  const mode = (await fsp.stat(session)).mode & 0o777;
  const stopped = run('stop', '--session', session);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const afterStop = run('status', '--session', session);
  // Assert
  assert.deepEqual([started.code, started.json.locale, started.json.root], [0, 'ja', fx.home]);
  assert.deepEqual([event.json.type, event.json.kind], ['event', 'scan-complete']);
  assert.deepEqual([reply.json.ok, reply.json.duplicate, duplicate.json.duplicate], [true, false, true]);
  assert.equal(mode, 0o600);
  assert.equal(stopped.json.stopped, true);
  assert.equal(await fsp.access(stopped.json.reports.operationsCsv).then(() => true, () => false), true);
  assert.deepEqual([afterStop.code, afterStop.json.error], [4, 'runtime-unreachable']);
  await fx.cleanup();
});
