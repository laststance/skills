import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { SweepError, causeClass } from './diagnostics.mjs';
import { createLocalityGuard } from './file-flags.mjs';

export const LIMITS = Object.freeze({ metadata: 8 * 1024 ** 2, lock: 25 * 1024 ** 2, state: 32 * 1024 ** 2, stateRecords: 2000000, http: 6 * 1024 ** 2, detail: 2 * 1024 ** 2, entries: 5000, depth: 48, records: 30000, line: 65536 });
const AUTH_PART = /^(?:\.ssh|\.aws|\.azure|\.gnupg|\.config\/gcloud|keychains?|cookies?|login data|web data|local storage|session storage|indexeddb)$/i;
const SECRET_FILE = /^(?:\.env(?:\..*)?|\.(?:npmrc|netrc|pypirc|credentials\.json)|auth(?:-profiles)?\.json|(?:access|refresh|session)-token|credentials(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|authorized_keys|known_hosts|.*\.(?:key|pem|p12|pfx|sqlite|sqlite3|db))$/i;

/** prefix一致による範囲逸脱を防ぐ。安全な読取・設定検証が呼ぶ。 @example within('/a/b', '/a/b/c') */
export function within(root, filename) {
  const relative = path.relative(path.resolve(root), path.resolve(filename));
  return relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** project rootの認証/Library禁止をcase-insensitiveで評価する。 @example allowedProjectRoot(home, root) */
export function allowedProjectRoot(home, root) {
  if (typeof root !== 'string' || !path.isAbsolute(root) || !within(home, root) || path.resolve(home) === path.resolve(root)) return false;
  const parts = path.relative(home, root).split(path.sep);
  return parts.every(part => !part.startsWith('.') && !/^(?:library|applications|system|private)$/i.test(part));
}

/** 認証・DB本文はカスタムrootでも禁止する。存在確認には本文を読まないstatを使う。 @example forbiddenContent('/home/user/.env') */
export function forbiddenContent(filename) {
  const parts = path.resolve(filename).split(path.sep);
  const folded = parts.map(part => part.toLowerCase());
  return parts.some(part => AUTH_PART.test(part))
    || folded.some((part, index) => ['gcloud', 'gh', 'op', 'rclone', 'neonctl'].includes(part) && folded[index - 1] === '.config')
    || folded.some((part, index) => ['.docker', '.kube', '.supabase', '.vercel'].includes(part) && folded[index + 1] === 'config.json')
    || folded.some((part, index) => part === '.kube' && folded[index + 1] === 'config')
    || SECRET_FILE.test(path.basename(filename));
}

/** 同じ対象を開いたか確認する。FD読取・世代保存・探索が共有する。 @example identity(stat) */
export function identity(stat) { return `${stat.dev}:${stat.ino}:${stat.mode}:${stat.size}:${stat.mtimeMs}`; }
const sameNode = (a, b) => a.dev === b.dev && a.ino === b.ino && a.isDirectory() === b.isDirectory() && a.isFile() === b.isFile();

/** 祖先をlstatし、リンクを辿る前に拒否する。安全読取の内部で呼ぶ。 @example inspectAncestors('/Users/a/Projects/file') */
export async function inspectAncestors(filename, io = fs, checkLocal) {
  const absolute = path.resolve(filename);
  const parts = absolute.split(path.sep).filter(Boolean);
  let current = path.parse(absolute).root;
  const chain = [];
  if (checkLocal) await checkLocal(current, await io.lstat(current));
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    const metadata = await io.lstat(current);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new SweepError('BOUNDARY', { operation: 'read', cause: 'boundary' });
    if (checkLocal) await checkLocal(current, metadata);
    chain.push({ filename: current, metadata });
  }
  return chain;
}

/** 祖先の観測可能な置換を検出する。Nodeにはopenatによる原子的探索がないため前後確認する。 @example recheckAncestors(chain) */
export async function recheckAncestors(chain, io = fs) {
  for (const { filename, metadata } of chain) {
    const current = await io.lstat(filename);
    if (current.isSymbolicLink() || !sameNode(metadata, current)) throw new SweepError('BOUNDARY', { operation: 'read', cause: 'identity' });
  }
}

/** 読取条件とFD同一性をまとめる。readerはこの入口からのみ本文を読む。 @example createSafeIO({home}).readJson(file, {roots:[root]}) */
export function createSafeIO({ home, filesystem = fs, signal, beforeRead, localityGuard } = {}) {
  const io = filesystem;
  const checkLocal = localityGuard || createLocalityGuard({ signal });
  const check = () => { if (signal?.aborted) throw new SweepError('DEADLINE', { cause: 'aborted', operation: 'read' }); };

  async function inspect(filename, options = {}) {
    check();
    if (!path.isAbsolute(filename) || !Array.isArray(options.roots) || !options.roots.some(root => within(root, filename))) throw new SweepError('BOUNDARY', { cause: 'boundary', operation: 'read' });
    if (options.purpose === 'project' && !options.roots.every(root => allowedProjectRoot(home, root))) throw new SweepError('BOUNDARY', { cause: 'boundary', operation: 'read' });
    const ancestors = await inspectAncestors(filename, io, checkLocal);
    const metadata = await io.lstat(filename);
    if (metadata.isSymbolicLink()) throw new SweepError('BOUNDARY', { cause: 'boundary', operation: 'read' });
    await checkLocal(filename, metadata);
    await recheckAncestors(ancestors, io);
    return { metadata, ancestors, identity: identity(metadata) };
  }

  async function withVerifiedFile(filename, options = {}, consume = ({ bytes }) => bytes) {
    check();
    if (forbiddenContent(filename)) throw new SweepError('BOUNDARY', { cause: 'boundary', operation: 'read' });
    const { metadata, ancestors } = await inspect(filename, options);
    if (!metadata.isFile()) throw new SweepError('BOUNDARY', { cause: 'boundary', operation: 'read' });
    // 明示的なplaceholder/evicted metadataは本文を開かない。
    if (/\.icloud$/i.test(filename) || metadata.isPlaceholder || metadata.isEvicted || metadata.flags && (metadata.flags & 0x40000000)) throw new SweepError('READ', { cause: 'not-local', operation: 'read' });
    const maxBytes = Math.min(options.maxBytes ?? LIMITS.metadata, LIMITS.state);
    if (metadata.size > maxBytes) throw new SweepError('CAPACITY', { cause: 'limit', operation: 'read' });
    await beforeRead?.(filename);
    let handle;
    try {
      handle = await io.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
      const opened = await handle.stat();
      if (!opened.isFile() || !sameNode(metadata, opened) || identity(metadata) !== identity(opened)) throw new SweepError('BOUNDARY', { cause: 'identity', operation: 'read' });
      await recheckAncestors(ancestors, io);
      const chunks = [];
      let size = 0;
      while (true) {
        check();
        const buffer = Buffer.alloc(Math.min(65536, maxBytes + 1 - size));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, size);
        if (!bytesRead) break;
        size += bytesRead;
        if (size > maxBytes) throw new SweepError('CAPACITY', { cause: 'limit', operation: 'read' });
        chunks.push(buffer.subarray(0, bytesRead));
      }
      if (identity(opened) !== identity(await handle.stat())) throw new SweepError('BOUNDARY', { cause: 'identity', operation: 'read' });
      await recheckAncestors(ancestors, io);
      const result = await consume({ fd: handle.fd, bytes: Buffer.concat(chunks), metadata: opened, identity: identity(opened) });
      if (identity(opened) !== identity(await handle.stat())) throw new SweepError('BOUNDARY', { cause: 'identity', operation: 'read' });
      await recheckAncestors(ancestors, io);
      return result;
    } finally { await handle?.close(); }
  }

  async function readBytes(filename, options = {}) { return withVerifiedFile(filename, options); }
  async function readText(filename, options = {}) { return (await readBytes(filename, options)).toString('utf8'); }
  async function readJson(filename, options = {}) {
    try { return boundedJson(await readText(filename, options), { maxRecords: options.maxBytes === LIMITS.state ? LIMITS.stateRecords : LIMITS.records }); }
    catch (error) { if (error instanceof SweepError || error?.code) throw error; throw new SweepError('FORMAT', { operation: 'read', cause: 'malformed' }); }
  }

  async function list(filename, options = {}) {
    const { metadata, ancestors } = await inspect(filename, options);
    if (!metadata.isDirectory()) throw new SweepError('BOUNDARY', { cause: 'boundary', operation: 'list' });
    const handle = await io.opendir(filename);
    const entries = [];
    let skipped = 0;
    const limit = Math.min(options.limit ?? LIMITS.entries, 30000);
    const offset = Number.isSafeInteger(options.offset) && options.offset >= 0 ? options.offset : 0;
    let complete = true;
    try {
      // Iterator順とdirectory identityを継続情報に保持し、無制限readdirを避ける。
      for await (const entry of handle) {
        check();
        if (skipped++ < offset) continue;
        if (entries.length >= limit) { complete = false; break; }
        entries.push({ name: entry.name, directory: entry.isDirectory(), file: entry.isFile(), symlink: entry.isSymbolicLink() });
      }
    } finally { await handle.close().catch(() => {}); }
    await recheckAncestors(ancestors, io);
    const current = await io.lstat(filename);
    if (identity(current) !== identity(metadata)) throw new SweepError('BOUNDARY', { cause: 'identity', operation: 'list' });
    return { entries, complete, offset: offset + entries.length, identity: identity(metadata) };
  }
  return { inspect, readBytes, readText, readJson, withVerifiedFile, list, filesystem: io };
}

/** JSONの深さ/件数/文字列を有限にする。ローカル・公開応答のparse後に呼ぶ。 @example boundedJson('{"schemaVersion":2}') */
export function boundedJson(text, { maxDepth = LIMITS.depth, maxRecords = LIMITS.records, maxString = 1024 * 1024 } = {}) {
  let value;
  try { value = JSON.parse(text); } catch { throw new SweepError('FORMAT', { cause: 'malformed', operation: 'read' }); }
  const pending = [[value, 0]];
  let count = 0;
  while (pending.length) {
    const [entry, depth] = pending.pop();
    if (++count > maxRecords || depth > maxDepth || typeof entry === 'string' && entry.length > maxString) throw new SweepError('CAPACITY', { cause: 'limit', operation: 'read' });
    if (entry && typeof entry === 'object') {
      for (const child of Object.values(entry)) pending.push([child, depth + 1]);
    }
  }
  return value;
}

/** 正常な不在と失敗を区別する収集用分類。 @example readStatus(error) */
export function readStatus(error) {
  const cause = causeClass(error);
  return ({ absent: 'absent', denied: 'denied', 'not-local': 'deferred-not-local', limit: 'partial', boundary: 'excluded', identity: 'partial', unsupported: 'unsupported' })[cause] || 'partial';
}
