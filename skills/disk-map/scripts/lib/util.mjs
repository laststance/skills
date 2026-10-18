// Shared low-level helpers for the disk-map runtime: IDs, private files,
// JSON Lines journals, canonical hashing, identities and fixed-argv processes.
import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';

export const SCHEMA_VERSION = 1;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Random UUID used for every record ID (never a filesystem path). */
export const newId = () => randomUUID();

/** Random bearer secret for agent/viewer credentials and confirmation nonces. */
export const newSecret = () => randomBytes(32).toString('base64url');

/**
 * Constant-time string comparison for credentials, nonces and manifest hashes.
 *
 * @example
 * secretEquals(request.nonce, plan.nonce); // false for any length mismatch
 */
export function secretEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Serialize with sorted object keys so equal manifests hash equally.
 * Called by cleanup plans before hashing.
 *
 * @example
 * canonicalJson({ b: 1, a: 2 }); // '{"a":2,"b":1}'
 */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** Create a directory (and parents) and force mode 0700 on the leaf. */
export async function ensurePrivateDir(dir) {
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
  await fsp.chmod(dir, 0o700);
}

/**
 * Atomically replace a JSON file with mode 0600 (temp file + rename).
 * Used for session descriptors and state snapshots.
 *
 * @example
 * await writePrivateJson('/tmp/run/session.json', { schemaVersion: 1 });
 */
export async function writePrivateJson(file, value) {
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  await fsp.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  await fsp.rename(tmp, file);
}

/**
 * Append one JSON record to a 0600 JSONL file and fsync before returning.
 * The cleanup journal relies on this ordering: intent is durable before mutation.
 *
 * @example
 * await appendJsonl(journalFile, { type: 'intent', operationId });
 */
export async function appendJsonl(file, record) {
  const handle = await fsp.open(file, 'a', 0o600);
  try {
    await handle.write(`${JSON.stringify(record)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/** Read a JSONL file; missing file is empty and torn trailing lines are ignored. */
export async function readJsonl(file) {
  let text;
  try {
    text = await fsp.readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return text.split('\n').filter(Boolean).flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

/** Map an lstat result to the identity kind used in the data contract. */
export function kindOf(stat) {
  if (stat.isSymbolicLink()) return 'symlink';
  if (stat.isDirectory()) return 'directory';
  if (stat.isFile()) return 'file';
  return 'other';
}

/**
 * Convert a bigint lstat result into the contract `Identity`.
 * Scanner, plan creation and pre-operation rechecks compare these values.
 *
 * @example
 * identityOf(await fsp.lstat(p, { bigint: true }));
 */
export function identityOf(stat) {
  return {
    device: String(stat.dev),
    inode: String(stat.ino),
    uid: Number(stat.uid),
    mtimeNs: String(stat.mtimeNs),
    ctimeNs: String(stat.ctimeNs),
    kind: kindOf(stat),
  };
}

/** Return the first identity field that differs, or null when they match. */
export function identityMismatch(expected, actual, fields = ['device', 'inode', 'uid', 'kind', 'mtimeNs', 'ctimeNs']) {
  return fields.find((field) => String(expected[field]) !== String(actual[field])) ?? null;
}

/**
 * Run an executable with a fixed argv array and no shell.
 * Recipes and preflight use it; nothing agent-authored reaches `args`.
 *
 * @returns Exit code, signal, timeout flag and captured output; never throws.
 * @example
 * const { code, stdout } = await runFixed('/bin/ps', ['-axo', 'pid=,args=']);
 */
export function runFixed(file, args, { timeoutMs = 60_000, cwd, env, maxBuffer = 32 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { shell: false, timeout: timeoutMs, maxBuffer, cwd, env: env ?? process.env }, (error, stdout, stderr) => {
      resolve({
        code: error ? (typeof error.code === 'number' ? error.code : null) : 0,
        signal: error?.signal ?? null,
        timedOut: Boolean(error?.killed && error?.signal),
        spawnError: error && typeof error.code === 'string' ? error.code : null,
        stdout: String(stdout ?? ''),
        stderr: String(stderr ?? ''),
      });
    });
  });
}

/** True when `child` is strictly below `parent` (both absolute, normalized). */
export function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export const isSameOrInside = (child, parent) => child === parent || isInside(child, parent);

/** Sum decimal byte strings without losing precision. */
export const sumBytes = (values) => String(values.reduce((total, value) => total + BigInt(value ?? 0), 0n));

/** Promise-based sleep used by polling loops. */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
