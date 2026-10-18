#!/usr/bin/env node
// disk-map CLI: start a local session, then let the invoking agent service
// viewer questions with next / respond / assess. All output is JSON.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { startBridge } from './lib/bridge.mjs';
import { reconcileJournal } from './lib/cleanup.mjs';
import { readFirmlinks } from './lib/scanner.mjs';
import { Session } from './lib/session.mjs';
import { SCHEMA_VERSION, ensurePrivateDir, newId, runFixed, sleep, writePrivateJson } from './lib/util.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const SKILL_DIR = fs.realpathSync(path.resolve(path.dirname(SCRIPT), '..'));
const EXIT = { ok: 0, usage: 1, preflight: 2, ended: 3, unreachable: 4, rejected: 5 };

const print = (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
const fail = (code, error, message, extra = {}) => {
  print({ ok: false, error, message, ...extra });
  process.exit(code);
};

const requireAbsolute = (value, flag) => {
  if (value === undefined) return undefined;
  if (!path.isAbsolute(value)) fail(EXIT.usage, 'usage', `${flag} must be an absolute path.`);
  return path.normalize(value);
};

async function preflight({ root }) {
  const checks = { platform: process.platform, arch: process.arch, node: process.versions.node, remoteShell: Boolean(process.env.SSH_CONNECTION) };
  if (process.platform !== 'darwin') fail(EXIT.preflight, 'unsupported-platform', 'disk-map runs only on macOS. This command is executing somewhere else (for example a cloud sandbox or container); run it on the Mac you want to inspect.', { checks });
  if (Number(process.versions.node.split('.')[0]) < 22) fail(EXIT.preflight, 'node-too-old', 'Node.js 22 or newer is required.', { checks });
  const version = await runFixed('/usr/bin/sw_vers', ['-productVersion'], { timeoutMs: 5000 });
  checks.macos = version.stdout.trim() || null;
  try {
    await fsp.access(root, fs.constants.R_OK | fs.constants.X_OK);
  } catch (error) {
    fail(EXIT.preflight, 'root-unreadable', `Cannot read the scan root (${error.code}).`, { checks });
  }
  return checks;
}

async function readSession(file) {
  if (!file || !path.isAbsolute(file)) fail(EXIT.usage, 'usage', '--session must be the absolute path printed by start.');
  let stat;
  try {
    stat = await fsp.lstat(file);
  } catch {
    fail(EXIT.unreachable, 'no-session', 'Session file not found. Start a new session.');
  }
  if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) fail(EXIT.rejected, 'unsafe-session-file', 'Session file must be a regular file owned by you with mode 0600.');
  return JSON.parse(await fsp.readFile(file, 'utf8'));
}

async function call(session, method, route, body, timeoutMs = 30_000) {
  let response;
  try {
    response = await fetch(`${session.origin}${route}`, {
      method,
      headers: { Authorization: `Bearer ${session.agentToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    fail(EXIT.unreachable, 'runtime-unreachable', `The disk-map runtime is not reachable (${error.cause?.code ?? error.name}). It may have stopped.`);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) fail(EXIT.rejected, data.error?.code ?? 'rejected', data.error?.message ?? `HTTP ${response.status}`, { status: response.status, ...data.error });
  return data;
}

async function readBodyFile(file) {
  if (!file || !path.isAbsolute(file)) fail(EXIT.usage, 'usage', '--file must be an absolute path to a JSON file.');
  const stat = await fsp.lstat(file).catch(() => null);
  if (!stat?.isFile() || stat.size > 1024 * 1024) fail(EXIT.usage, 'usage', '--file must be a regular JSON file up to 1 MiB.');
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch {
    fail(EXIT.usage, 'invalid-json', '--file does not contain valid JSON.');
  }
}

async function start(values) {
  const requestedHome = requireAbsolute(values.home, '--home') ?? os.homedir();
  const dataVolume = '/System/Volumes/Data';
  const requestedRoot = requireAbsolute(values.root, '--root') ?? (fs.existsSync(dataVolume) ? dataVolume : '/');
  const requestedStateDir = requireAbsolute(values['state-dir'], '--state-dir') ?? path.join(requestedHome, 'Library/Application Support/disk-map');
  const requestedTrash = requireAbsolute(values['trash-dir'], '--trash-dir') ?? path.join(requestedHome, '.Trash');
  const locale = values.locale ?? (/^ja/i.test(process.env.LANG ?? '') ? 'ja' : 'en');
  if (!['en', 'ja'].includes(locale)) fail(EXIT.usage, 'usage', '--locale must be en or ja.');
  const checks = await preflight({ root: requestedRoot });
  const root = await fsp.realpath(requestedRoot);
  await ensurePrivateDir(path.join(requestedStateDir, 'runs'));
  // Canonical paths (no /var → /private/var aliasing) so path rules compare equal.
  const home = await fsp.realpath(requestedHome);
  const stateDir = await fsp.realpath(requestedStateDir);
  const trashDir = await fsp.realpath(requestedTrash).catch(() => requestedTrash);

  // Close journals left open by an earlier crash; never replay them.
  const recovered = [];
  for (const name of await fsp.readdir(path.join(stateDir, 'runs'))) {
    const journal = path.join(stateDir, 'runs', name, 'journal.jsonl');
    if (fs.existsSync(journal)) recovered.push(...(await reconcileJournal(journal)).map((outcome) => ({ runId: name, ...outcome })));
  }

  const runId = newId();
  const runDir = path.join(stateDir, 'runs', runId);
  await ensurePrivateDir(runDir);
  await writePrivateJson(path.join(runDir, 'config.json'), {
    schemaVersion: SCHEMA_VERSION, runId, root, home, trashDir, stateDir, skillDir: SKILL_DIR, locale, recovered,
    fileNodeThreshold: values['file-node-threshold'] ? Number(values['file-node-threshold']) : 1024 * 1024, checks,
  });
  const logFd = fs.openSync(path.join(runDir, 'runtime.log'), 'a', 0o600);
  const child = spawn(process.execPath, [SCRIPT, 'serve', '--run-dir', runDir], { detached: true, stdio: ['ignore', logFd, logFd], env: process.env });
  child.unref();
  fs.closeSync(logFd);
  const sessionFile = path.join(runDir, 'session.json');
  for (let attempt = 0; attempt < 300 && !fs.existsSync(sessionFile); attempt += 1) await sleep(50);
  if (!fs.existsSync(sessionFile)) fail(EXIT.preflight, 'runtime-start-failed', `The runtime did not start. See ${path.join(runDir, 'runtime.log')}.`);
  const session = JSON.parse(await fsp.readFile(sessionFile, 'utf8'));
  if (values.open) await runFixed('/usr/bin/open', [session.viewerUrl], { timeoutMs: 10_000 });
  print({ ok: true, session: sessionFile, viewerUrl: session.viewerUrl, runId, runDir, root, locale, pid: session.pid, checks, recovered: recovered.length, next: `node ${SCRIPT} next --session ${JSON.stringify(sessionFile)} --timeout 25` });
}

async function serve(values) {
  const runDir = requireAbsolute(values['run-dir'], '--run-dir');
  const config = JSON.parse(await fsp.readFile(path.join(runDir, 'config.json'), 'utf8'));
  const aliases = config.root === '/System/Volumes/Data' ? await readFirmlinks() : new Map();
  const session = new Session({ ...config, runDir, aliases });
  const bridge = await startBridge(session, { assetsDir: path.join(SKILL_DIR, 'assets') });
  session.onStopped = () => {
    bridge.server.close();
    process.exit(0);
  };
  await writePrivateJson(path.join(runDir, 'session.json'), { schemaVersion: SCHEMA_VERSION, runId: config.runId, pid: process.pid, origin: bridge.origin, port: bridge.port, agentToken: bridge.agentToken, viewerUrl: bridge.viewerUrl, createdAt: new Date().toISOString() });
  const shutdown = () => session.stop().catch(() => {}).finally(() => session.onStopped());
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  session.startScan().catch((error) => {
    session.phase = 'failed';
    session.log(`scan failed: ${error.stack}`);
  });
}

const COMMON = { session: { type: 'string' }, timeout: { type: 'string' }, file: { type: 'string' } };
const SPECS = {
  start: { root: { type: 'string' }, 'state-dir': { type: 'string' }, locale: { type: 'string' }, home: { type: 'string' }, 'trash-dir': { type: 'string' }, open: { type: 'boolean' }, 'file-node-threshold': { type: 'string' } },
  serve: { 'run-dir': { type: 'string' } },
  next: COMMON, heartbeat: COMMON, respond: COMMON, assess: COMMON, status: COMMON, stop: COMMON,
};

const USAGE = `Usage:
  disk-map.mjs start [--root ABS_PATH] [--state-dir ABS_PATH] [--locale en|ja] [--open]
  disk-map.mjs next --session ABS_PATH --timeout 25
  disk-map.mjs heartbeat --session ABS_PATH
  disk-map.mjs respond --session ABS_PATH --file ABS_JSON
  disk-map.mjs assess --session ABS_PATH --file ABS_JSON
  disk-map.mjs status --session ABS_PATH
  disk-map.mjs stop --session ABS_PATH`;

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!SPECS[command]) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(command ? EXIT.usage : EXIT.ok);
  }
  let values;
  try {
    ({ values } = parseArgs({ args: rest, options: SPECS[command], strict: true, allowPositionals: false }));
  } catch (error) {
    fail(EXIT.usage, 'usage', error.message);
  }
  if (command === 'start') return start(values);
  if (command === 'serve') return serve(values);
  const session = await readSession(values.session);
  switch (command) {
    case 'next': {
      const timeout = Math.min(Math.max(Number(values.timeout ?? 25) || 25, 1), 25);
      const event = await call(session, 'GET', `/agent/next?timeout=${timeout}`, null, (timeout + 15) * 1000);
      print(event);
      return process.exit(event.type === 'session-ended' ? EXIT.ended : EXIT.ok);
    }
    case 'heartbeat':
      return print(await call(session, 'POST', '/agent/heartbeat', {}));
    case 'respond':
      return print(await call(session, 'POST', '/agent/responses', await readBodyFile(values.file)));
    case 'assess':
      return print(await call(session, 'POST', '/agent/assessments', await readBodyFile(values.file), 120_000));
    case 'status':
      return print(await call(session, 'GET', '/agent/status'));
    case 'stop':
      return print(await call(session, 'POST', '/agent/stop', {}, 180_000));
    default:
      return fail(EXIT.usage, 'usage', USAGE);
  }
}

main().catch((error) => fail(EXIT.rejected, 'internal', error.message));
