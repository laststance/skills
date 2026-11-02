import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createSafeIO, boundedJson, inspectAncestors, recheckAncestors, identity, within, LIMITS } from './safe-io.mjs';
import { projectProgress, mergePrivateState, validateConfiguration, STATE_SCHEMA } from './configuration.mjs';
import { SweepError, causeClass } from './diagnostics.mjs';
import { executeCommand, resolveTool } from './runtime.mjs';

const GENERATION = /^mss-[a-f0-9-]{36}-\d{6}$/;
const HASH = /^[a-f0-9]{64}$/;
const digest = value => createHash('sha256').update(value).digest('hex');

/** 再現可能なhashのためobject keyを整列する。保存時だけ呼び、配列の観測順は保つ。 @example stableJson({b:2,a:1}) */
export function stableJson(value) {
  return `${JSON.stringify(value, (_, entry) => entry && !Array.isArray(entry) && typeof entry === 'object' ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]])) : entry, 2)}\n`;
}

/** 私有保存先を逐次作成し、祖先・所有者・Git境界を確認する。監査対象は変更しない。 @example privateDirectory(root, {home}) */
export async function privateDirectory(directory, { home, filesystem = fs } = {}) {
  if (!within(home, directory) || directory === home) throw new SweepError('SAVE', { cause: 'boundary', operation: 'write' });
  const parts = path.resolve(directory).split(path.sep).filter(Boolean);
  let current = path.parse(directory).root;
  for (const part of parts) {
    current = path.join(current, part);
    let stat;
    try { stat = await filesystem.lstat(current); }
    catch (error) {
      if (error.code !== 'ENOENT' || !within(home, current)) throw error;
      await filesystem.mkdir(current, { mode: 0o700 });
      stat = await filesystem.lstat(current);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new SweepError('SAVE', { cause: 'boundary', operation: 'write' });
    if (within(home, current) && stat.uid !== process.getuid?.()) throw new SweepError('SAVE', { cause: 'denied', operation: 'write' });
    if (await filesystem.lstat(path.join(current, '.git')).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) throw new SweepError('SAVE', { cause: 'boundary', operation: 'write' });
  }
  // 検証した同じdirectory FDだけを私有化し、リンクへの差し替えを追わない。
  const ancestors = await inspectAncestors(directory, filesystem);
  const before = await filesystem.lstat(directory);
  const handle = await filesystem.open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isDirectory() || before.dev !== opened.dev || before.ino !== opened.ino) throw new SweepError('SAVE', { cause: 'identity', operation: 'write' });
    await recheckAncestors(ancestors, filesystem);
    await handle.chmod(0o700);
  } finally { await handle.close(); }
}

/** PID単体を信用せず固定ps/sysctlで開始・bootを確認する。lock取得/回収が呼ぶ。 @example processIdentity(process.pid) */
export async function processIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return { status: 'unknown' };
  try {
    const ps = await resolveTool('ps');
    const result = await executeCommand(ps.path, ['-p', String(pid), '-o', 'lstart='], { timeoutMs: 2000, maxBytes: 1024 });
    if (result.code === 1 && !result.stdout.trim()) {
      try { process.kill(pid, 0); return { status: 'unknown' }; }
      catch (error) { return { status: error.code === 'ESRCH' ? 'dead' : 'unknown' }; }
    }
    const start = result.stdout.trim();
    if (result.code !== 0 || !/^[A-Za-z]{3}\s+[A-Za-z]{3}\s+\d{1,2}\s+\d\d:\d\d:\d\d\s+\d{4}$/.test(start)) return { status: 'unknown' };
    const sysctl = await resolveTool('sysctl');
    const boot = await executeCommand(sysctl.path, ['-n', 'kern.boottime'], { timeoutMs: 2000, maxBytes: 1024 });
    const seconds = /sec\s*=\s*(\d+)/.exec(boot.stdout)?.[1];
    if (boot.code !== 0 || !seconds) return { status: 'unknown' };
    return { status: 'live', start, boot: seconds };
  } catch { return { status: 'unknown' }; }
}

/** 単一writerの所有権を作成する。曖昧な所有者のロックは削除しない。 @example acquireLock(root, {home,runId}) */
export async function acquireLock(stateRoot, options = {}) {
  const { filesystem = fs } = options;
  const guardPath = path.join(stateRoot, '.run.lock.acquire');
  const ancestors = await inspectAncestors(guardPath, filesystem);
  let guard;
  try { guard = await filesystem.open(guardPath, 'wx', 0o600); }
  catch { throw new SweepError('LOCK', { cause: 'busy', operation: 'lock' }); }
  const stat = await guard.stat();
  try {
    await recheckAncestors(ancestors, filesystem);
    return await acquireLockGuarded(stateRoot, options);
  } finally {
    await guard.close();
    await recheckAncestors(ancestors, filesystem);
    const current = await filesystem.lstat(guardPath);
    if (current.dev === stat.dev && current.ino === stat.ino) await filesystem.unlink(guardPath);
  }
}

/** acquire guardを持つ一つの実行だけがstaleを回収する。 @example acquireLockGuarded(root, options) */
async function acquireLockGuarded(stateRoot, { home, runId = randomUUID(), filesystem = fs, identityProvider = processIdentity } = {}) {
  const lockRoot = path.join(stateRoot, '.run.lock');
  const ownerPath = path.join(lockRoot, 'owner.json');
  const io = createSafeIO({ home, filesystem });
  const ownProcess = await identityProvider(process.pid);
  const owner = { schemaVersion: STATE_SCHEMA, runId, nonce: randomUUID(), pid: process.pid,
    start: ownProcess.status === 'live' ? ownProcess.start : null, boot: ownProcess.status === 'live' ? ownProcess.boot : null };
  const chain = await inspectAncestors(lockRoot, filesystem);
  try { await filesystem.mkdir(lockRoot, { mode: 0o700 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw new SweepError('LOCK', { operation: 'lock', cause: causeClass(error) });
    let prior, lockIdentity;
    try {
      lockIdentity = identity((await io.inspect(lockRoot, { roots: [stateRoot] })).metadata);
      prior = await io.readJson(ownerPath, { roots: [stateRoot], maxBytes: 4096 });
    } catch { throw new SweepError('LOCK', { operation: 'lock', cause: 'unknown-owner' }); }
    if (prior?.schemaVersion !== STATE_SCHEMA || !/^[a-f0-9-]{36}$/.test(prior.nonce || '') || !/^[a-f0-9-]{36}$/.test(prior.runId || '') || !prior.start || !prior.boot) throw new SweepError('LOCK', { operation: 'lock', cause: 'unknown-owner' });
    const observed = await identityProvider(prior.pid);
    // PID再利用・boot差異は自動回収しない。独立にdeadと確認した所有者だけを回収する。
    if (observed.status !== 'dead') throw new SweepError('LOCK', { operation: 'lock', cause: observed.status === 'live' && observed.start === prior.start && observed.boot === prior.boot ? 'busy' : 'unknown-owner' });
    const current = await io.readJson(ownerPath, { roots: [stateRoot], maxBytes: 4096 });
    if (current.nonce !== prior.nonce || identity(await filesystem.lstat(lockRoot)) !== lockIdentity) throw new SweepError('LOCK', { operation: 'lock', cause: 'unknown-owner' });
    // ランダム名へ隔離してから同一ownerを再確認する。新しいlockは削除しない。
    const stale = path.join(stateRoot, `.run.lock-stale-${randomUUID()}`);
    await filesystem.rename(lockRoot, stale);
    const moved = await io.readJson(path.join(stale, 'owner.json'), { roots: [stateRoot], maxBytes: 4096 });
    if (moved.nonce !== prior.nonce) throw new SweepError('LOCK', { operation: 'lock', cause: 'unknown-owner' });
    await filesystem.unlink(path.join(stale, 'owner.json'));
    await filesystem.rmdir(stale);
    try { await filesystem.mkdir(lockRoot, { mode: 0o700 }); }
    catch { throw new SweepError('LOCK', { operation: 'lock', cause: 'busy' }); }
  }
  await recheckAncestors(chain, filesystem);
  await filesystem.writeFile(ownerPath, stableJson(owner), { flag: 'wx', mode: 0o600 });
  const acquired = await filesystem.lstat(lockRoot);
  async function assertOwner() {
    const current = await io.readJson(ownerPath, { roots: [stateRoot], maxBytes: 4096 });
    const stat = await filesystem.lstat(lockRoot);
    if (current.nonce !== owner.nonce || stat.dev !== acquired.dev || stat.ino !== acquired.ino) throw new SweepError('LOCK', { operation: 'lock', cause: 'unknown-owner' });
  }
  async function release() {
    await assertOwner();
    await filesystem.unlink(ownerPath);
    await filesystem.rmdir(lockRoot);
  }
  return { owner, root: lockRoot, assertOwner, release };
}

/** report→commit→stateの順序を一箇所で所有する。runnerと耐中断テストが利用する。 @example const store = await createStateStore({home,runId}); */
export async function createStateStore({ home, runId = randomUUID(), filesystem = fs, identityProvider, onBoundary = async () => {}, checkPreflight = () => {} } = {}) {
  checkPreflight();
  const stateRoot = path.join(home, '.local/state/mac-security-sweep');
  const reportRoot = path.join(home, 'security-reports');
  const statePath = path.join(stateRoot, 'state.json');
  const io = createSafeIO({ home, filesystem });
  // 不正なstateは専用ディレクトリ・ロックの作成前に拒否する。
  let original = {}, stateIdentity = null;
  try {
    original = await io.readJson(statePath, { roots: [stateRoot], maxBytes: LIMITS.state });
    stateIdentity = identity((await io.inspect(statePath, { roots: [stateRoot] })).metadata);
  } catch (error) { if (causeClass(error) !== 'absent') throw new SweepError('STATE', { cause: causeClass(error), operation: 'state' }); }
  const config = validateConfiguration(original, home);
  checkPreflight();
  await privateDirectory(stateRoot, { home, filesystem });
  await privateDirectory(reportRoot, { home, filesystem });
  const lock = await acquireLock(stateRoot, { home, runId, filesystem, identityProvider });
  let sequence = 0, state = original, progressVerified = false;

  async function atomicWrite(filename, bytes, { replace = false, boundary = 'file' } = {}) {
    await lock.assertOwner();
    const ancestors = await inspectAncestors(filename, filesystem);
    let existing = null;
    try { existing = await filesystem.lstat(filename); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (existing && (!replace || !existing.isFile() || existing.isSymbolicLink() || existing.uid !== process.getuid?.())) throw new SweepError('SAVE', { cause: 'boundary', operation: 'write' });
    const temporary = `${filename}.${lock.owner.nonce}.tmp`;
    let handle;
    try {
      handle = await filesystem.open(temporary, 'wx', 0o600);
      const opened = await handle.stat();
      await recheckAncestors(ancestors, filesystem);
      const target = await filesystem.lstat(temporary);
      if (!opened.isFile() || opened.uid !== process.getuid?.() || opened.dev !== target.dev || opened.ino !== target.ino || target.isSymbolicLink()) throw new SweepError('SAVE', { cause: 'identity', operation: 'write' });
      await handle.writeFile(bytes);
      await onBoundary(`${boundary}:write`);
      await handle.sync();
      await handle.close(); handle = null;
      await onBoundary(`${boundary}:sync`);
      await recheckAncestors(ancestors, filesystem);
      await lock.assertOwner();
      const current = await filesystem.lstat(filename).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      if (existing ? !current || identity(existing) !== identity(current) : current) throw new SweepError('SAVE', { cause: 'identity', operation: 'write' });
      await filesystem.rename(temporary, filename);
      await onBoundary(`${boundary}:rename`);
      const parent = await filesystem.open(path.dirname(filename), 'r');
      try { await parent.sync(); } finally { await parent.close(); }
    } finally {
      await handle?.close();
      // この実行が作った未commitの一時ファイルだけを後始末する。
      await filesystem.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
  }

  async function saveState(next) {
    const current = await io.inspect(statePath, { roots: [stateRoot] }).catch(error => { if (causeClass(error) === 'absent') return null; throw error; });
    if (current?.identity !== (stateIdentity ?? undefined)) throw new SweepError('SAVE', { cause: 'identity', operation: 'state' });
    const bytes = stableJson(next);
    if (Buffer.byteLength(bytes) > LIMITS.state) throw new SweepError('CAPACITY', { cause: 'limit', operation: 'state' });
    boundedJson(bytes, { maxRecords: LIMITS.stateRecords });
    await atomicWrite(statePath, bytes, { replace: !!current, boundary: 'state' });
    stateIdentity = identity((await io.inspect(statePath, { roots: [stateRoot] })).metadata);
    state = next;
  }

  async function readCommit(directory, verify = true) {
    const commit = await io.readJson(path.join(directory, 'commit.json'), { roots: [reportRoot], maxBytes: 8192 });
    if (commit.schemaVersion !== STATE_SCHEMA || commit.id !== path.basename(directory) || !GENERATION.test(commit.id) || commit.previous !== null && !GENERATION.test(commit.previous)) throw new SweepError('STATE', { cause: 'mismatch', operation: 'checkpoint' });
    const values = {};
    for (const key of ['evidence', 'continuation', 'report']) {
      const item = commit[key];
      const expected = key === 'report' ? 'report.md' : `${key}.json`;
      if (item?.name !== expected || !HASH.test(item.hash || '')) throw new SweepError('STATE', { cause: 'mismatch', operation: 'checkpoint' });
      if (!verify) continue;
      const content = await io.readBytes(path.join(directory, expected), { roots: [reportRoot], maxBytes: LIMITS.state });
      if (digest(content) !== item.hash) throw new SweepError('STATE', { cause: 'mismatch', operation: 'checkpoint' });
      if (key === 'continuation') values.continuation = JSON.parse(content.toString('utf8'));
    }
    if (verify && (!values.continuation || Array.isArray(values.continuation) || stableJson(values.continuation) !== stableJson(projectProgress(values.continuation)))) throw new SweepError('STATE', { cause: 'mismatch', operation: 'checkpoint' });
    return { ...commit, ...values, reportPath: path.join(directory, 'report.md') };
  }

  async function reconcile() {
    checkPreflight();
    const listing = await io.list(reportRoot, { roots: [reportRoot], limit: 10000 });
    if (!listing.complete) throw new SweepError('CAPACITY', { cause: 'limit', operation: 'checkpoint' });
    const commits = [];
    for (const entry of listing.entries.filter(entry => GENERATION.test(entry.name) && entry.directory)) {
      checkPreflight();
      const directory = path.join(reportRoot, entry.name);
      // commit markerのない世代だけを未commit扱いにする。commit後の欠損は破損として停止する。
      const marker = await io.inspect(path.join(directory, 'commit.json'), { roots: [reportRoot] }).catch(error => { if (causeClass(error) === 'absent') return null; throw error; });
      if (!marker) continue;
      try { commits.push(await readCommit(directory, false)); }
      catch (error) { throw error instanceof SweepError ? error : new SweepError('STATE', { cause: 'mismatch', operation: 'checkpoint' }); }
    }
    const known = state.generation ?? null;
    if (known !== null && (!GENERATION.test(known) || !commits.some(commit => commit.id === known))) throw new SweepError('STATE', { cause: 'mismatch', operation: 'checkpoint' });
    if (known !== null) {
      const committed = await readCommit(path.join(reportRoot, known));
      if (stableJson(projectProgress(state)) !== stableJson(committed.continuation)) throw new SweepError('STATE', { cause: 'mismatch', operation: 'checkpoint' });
      progressVerified = true;
    }
    let generation = known, latest = null;
    const seen = new Set();
    while (true) {
      checkPreflight();
      const next = commits.filter(commit => commit.previous === generation && !seen.has(commit.id));
      if (next.length > 1) throw new SweepError('STATE', { cause: 'mismatch', operation: 'checkpoint' });
      if (!next.length) break;
      latest = await readCommit(path.join(reportRoot, next[0].id)); seen.add(latest.id); generation = latest.id;
    }
    if (latest) { await saveState(mergePrivateState(state, { ...projectProgress(latest.continuation), schemaVersion: STATE_SCHEMA, generation: latest.id, lastReport: latest.reportPath })); progressVerified = true; }
  }

  async function commit({ evidence, report, nextState, final = false }) {
    const id = `mss-${runId}-${String(++sequence).padStart(6, '0')}`;
    if (!GENERATION.test(id)) throw new SweepError('SAVE', { cause: 'malformed', operation: 'checkpoint' });
    const directory = path.join(reportRoot, id);
    const reportPath = path.join(directory, 'report.md');
    const continuation = projectProgress({ ...state, ...nextState, lastReport: reportPath });
    const content = { evidence: stableJson(evidence), continuation: stableJson(continuation), report: `${report}\n` };
    if (Object.values(content).some(value => Buffer.byteLength(value) > LIMITS.state)) throw new SweepError('CAPACITY', { cause: 'limit', operation: 'checkpoint' });
    boundedJson(content.evidence, { maxRecords: LIMITS.stateRecords });
    boundedJson(content.continuation, { maxRecords: LIMITS.stateRecords });
    await lock.assertOwner();
    await filesystem.mkdir(directory, { mode: 0o700 });
    const marker = { schemaVersion: STATE_SCHEMA, id, previous: state.generation ?? null, final, createdAt: new Date().toISOString() };
    for (const key of ['evidence', 'continuation', 'report']) {
      const name = key === 'report' ? 'report.md' : `${key}.json`;
      await atomicWrite(path.join(directory, name), content[key], { boundary: key });
      marker[key] = { name, hash: digest(content[key]) };
    }
    await atomicWrite(path.join(directory, 'commit.json'), stableJson(marker), { boundary: 'commit' });
    // 成功cursorを進めるのはreport/hash/commitの公開が完了した後だけ。
    await saveState(mergePrivateState(state, { ...continuation, schemaVersion: STATE_SCHEMA, generation: id, lastReport: reportPath }));
    progressVerified = true;
    return { reportPath, evidenceDirectory: directory, statePath, generation: id };
  }
  try { await reconcile(); }
  catch (error) { await lock.release().catch(() => {}); throw error; }
  return { get state() { return state; }, get progressVerified() { return progressVerified; }, config, reportRoot, stateRoot, statePath, commit, reconcile, close: lock.release };
}
