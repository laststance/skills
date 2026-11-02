import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { acquireLock, createStateStore, privateDirectory } from '../scripts/state-store.mjs';
import { fetchNews } from '../scripts/fetch-news.mjs';
import { createRunContext } from '../scripts/runtime.mjs';

const childFixture = fileURLToPath(new URL('./fixtures/state-child.mjs', import.meta.url));

test('GitHubの修正版文字列を含む実際のページ継続を保存して再開できる', async t => {
  // Arrange
  const home = await fixture(t), name = 'GitHub Advisory reviewed';
  const context = createRunContext({ home, budgetMs: 120000, fetchImpl: async address => {
    const url = new URL(address);
    if (url.hostname !== 'api.github.com') return new Response('', { status: 503 });
    if (url.searchParams.get('type') === 'malware') return new Response('[]');
    const page = Number(url.searchParams.get('after') || 1), next = new URL(url);
    next.searchParams.set('after', String(page + 1));
    return new Response(JSON.stringify([{ ghsa_id: `GHSA-page-${page}`, summary: 'Example', updated_at: '2026-11-02T00:00:00Z', vulnerabilities: [{ package: { name: 'example', ecosystem: 'npm' }, vulnerable_version_range: '< 2.0.0', first_patched_version: '2.0.0' }] }]), { headers: { link: `<${next.href}>; rel="next"` } });
  } });
  // Act
  const news = await fetchNews({ context, previous: {}, until: '2026-11-03T00:00:00Z' });
  await context.close();
  const store = await createStateStore({ home, identityProvider });
  await store.commit({ evidence: {}, report: 'partial', nextState: { sourceContinuations: news.sourceContinuations } });
  await store.close();
  const resumed = await createStateStore({ home, identityProvider });
  // Assert
  assert.equal(resumed.progressVerified, true);
  assert.equal(resumed.state.sourceContinuations[name].items.length, 20);
  assert.equal(resumed.state.sourceContinuations[name].items[0].affected[0].fixed, '2.0.0');
  assert.deepEqual(resumed.state.sourceContinuations[name].items[0].fixed, [{ name: 'example', version: '2.0.0' }]);
  await resumed.close();
});
const identityProvider = async pid => {
  try { process.kill(pid, 0); return { status: 'live', start: 'fixture-start', boot: 'fixture-boot' }; }
  catch (error) { return { status: error.code === 'ESRCH' ? 'dead' : 'unknown' }; }
};

/** state試験専用homeを隔離する。 @example const home = await fixture(t) */
async function fixture(t) {
  const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mss-state-')));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  return home;
}

/** 実際の終了・中断を観測するため小さな子だけを起動する。 @example runChild(home, 'commit:rename') */
function runChild(home, boundary) {
  const child = spawn(process.execPath, [childFixture, home, boundary], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  return { child, done: new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }))) };
}

test('reportとcommitの成功後にstateを進め未知の元stateを証拠へ複製しない', async t => {
  // Arrange
  const home = await fixture(t), root = path.join(home, '.local/state/mac-security-sweep');
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, 'state.json'), JSON.stringify({ schemaVersion: 1, scanRoots: [], privateExtension: { token: 'SENTINEL_SECRET' } }));
  const boundaries = [];
  const store = await createStateStore({ home, identityProvider, onBoundary: async point => boundaries.push(point) });
  // Act
  const saved = await store.commit({ evidence: { count: 1 }, report: 'report', nextState: { ...store.state, lastRunStatus: 'partial', packageContinuation: { pendingKeys: ['npm:example:1.0.0'] } } });
  await store.close();
  const state = JSON.parse(await fs.readFile(saved.statePath, 'utf8'));
  const evidence = await fs.readFile(path.join(saved.evidenceDirectory, 'continuation.json'), 'utf8');
  // Assert
  assert.equal(state.schemaVersion, 2); assert.equal(state.privateExtension.token, 'SENTINEL_SECRET'); assert.equal(evidence.includes('SENTINEL'), false);
  assert.ok(boundaries.indexOf('report:rename') < boundaries.indexOf('commit:rename'));
  assert.ok(boundaries.indexOf('commit:rename') < boundaries.indexOf('state:rename'));
  assert.equal((await fs.stat(saved.statePath)).mode & 0o777, 0o600);
});

test('同じrunの複数checkpointがreport-backed generation鎖として再開される', async t => {
  // Arrange
  const home = await fixture(t), store = await createStateStore({ home, identityProvider });
  // Act
  const first = await store.commit({ evidence: {}, report: 'first', nextState: { lastRunStatus: 'partial' } });
  const second = await store.commit({ evidence: { count: 2 }, report: 'second', nextState: { lastRunStatus: 'complete' }, final: true });
  await store.close();
  const resumed = await createStateStore({ home, identityProvider });
  // Assert
  assert.notEqual(first.generation, second.generation); assert.equal(resumed.state.generation, second.generation); assert.equal(resumed.state.lastRunStatus, 'complete');
  assert.equal(JSON.parse(await fs.readFile(path.join(second.evidenceDirectory, 'commit.json'))).previous, first.generation);
  await resumed.close();
});

test('不正JSONとfuture stateを変更せずwork前に拒否する', async t => {
  // Arrange
  const home = await fixture(t), root = path.join(home, '.local/state/mac-security-sweep');
  await fs.mkdir(root, { recursive: true });
  // Act / Assert
  for (const text of ['{"secret":"SENTINEL",', '{"schemaVersion":99,"secret":"SENTINEL"}']) {
    await fs.writeFile(path.join(root, 'state.json'), text);
    await assert.rejects(createStateStore({ home, identityProvider }));
    assert.equal(await fs.readFile(path.join(root, 'state.json'), 'utf8'), text);
    assert.equal(await fs.lstat(path.join(root, '.run.lock')).then(() => true, () => false), false);
  }
});

test('report保存後のstate書込失敗は次の起動でhashを確認して再開できる', async t => {
  // Arrange
  const home = await fixture(t);
  let failed = false;
  const store = await createStateStore({ home, identityProvider, onBoundary: async point => { if (point === 'state:write' && !failed) { failed = true; throw Object.assign(new Error('SENTINEL_ENOSPC'), { code: 'ENOSPC' }); } } });
  // Act
  await assert.rejects(store.commit({ evidence: { positive: true }, report: 'partial', nextState: { lastRunStatus: 'partial', advisoryContinuation: { pendingIds: ['GHSA-example'] } } }));
  await store.close();
  const recovered = await createStateStore({ home, identityProvider });
  // Assert
  assert.deepEqual(recovered.state.advisoryContinuation.pendingIds, ['GHSA-example']);
  assert.equal(await fs.readFile(recovered.state.lastReport, 'utf8'), 'partial\n');
  await recovered.close();
});

test('commit済み証拠のhash不一致はstateを上書きせず停止する', async t => {
  // Arrange
  const home = await fixture(t), store = await createStateStore({ home, identityProvider });
  const saved = await store.commit({ evidence: {}, report: 'partial', nextState: { lastRunStatus: 'partial' } });
  await store.close(); const before = await fs.readFile(saved.statePath, 'utf8');
  await fs.writeFile(path.join(saved.evidenceDirectory, 'evidence.json'), '{"changed":true}');
  // Act / Assert
  await assert.rejects(createStateStore({ home, identityProvider }), error => error.diagnostic.cause === 'mismatch');
  assert.equal(await fs.readFile(saved.statePath, 'utf8'), before);
});

test('有効owner・PID再利用・不正ownerを即座に拒否し別runのlockを消さない', async t => {
  // Arrange
  const home = await fixture(t), root = path.join(home, 'state'); await fs.mkdir(root);
  const first = await acquireLock(root, { home, identityProvider });
  // Act / Assert
  await assert.rejects(acquireLock(root, { home, identityProvider }), error => error.diagnostic.cause === 'busy');
  await assert.rejects(acquireLock(root, { home, identityProvider: async () => ({ status: 'live', start: 'different', boot: 'fixture-boot' }) }), error => error.diagnostic.cause === 'unknown-owner');
  const current = JSON.parse(await fs.readFile(path.join(first.root, 'owner.json')));
  await fs.writeFile(path.join(first.root, 'owner.json'), JSON.stringify({ ...current, nonce: randomUUID() }));
  await assert.rejects(first.release()); assert.equal((await fs.stat(first.root)).isDirectory(), true);
});

test('ownerなしlockを推測で削除せず所有者確認を要求する', async t => {
  // Arrange
  const home = await fixture(t), root = path.join(home, 'state'); await fs.mkdir(path.join(root, '.run.lock'), { recursive: true });
  // Act / Assert
  await assert.rejects(acquireLock(root, { home, identityProvider }), error => error.diagnostic.cause === 'unknown-owner');
  assert.equal((await fs.stat(path.join(root, '.run.lock'))).isDirectory(), true);
});

test('Git配下・writer祖先symlinkを保存先として許可しない', async t => {
  // Arrange
  const home = await fixture(t); await fs.mkdir(path.join(home, 'repo/.git'), { recursive: true }); await fs.symlink(path.join(home, 'repo'), path.join(home, 'alias'));
  // Act / Assert
  await assert.rejects(privateDirectory(path.join(home, 'repo/output'), { home }));
  await assert.rejects(privateDirectory(path.join(home, 'alias/output'), { home }));
  assert.equal(await fs.lstat(path.join(home, 'repo/output')).then(() => true, () => false), false);
});

test('実際のwrite・sync・rename中断で未commit成功cursorを進めない', async t => {
  // Arrange
  const home = await fixture(t);
  const boundaries = ['evidence:write', 'evidence:sync', 'evidence:rename', 'continuation:write', 'continuation:sync', 'continuation:rename', 'report:write', 'report:sync', 'report:rename', 'commit:write', 'commit:sync', 'commit:rename', 'state:write', 'state:sync', 'state:rename'];
  // Act / Assert
  for (const [index, boundary] of boundaries.entries()) {
    const isolated = path.join(home, String(index)); await fs.mkdir(isolated);
    const result = await runChild(isolated, boundary).done;
    assert.equal(result.signal, 'SIGKILL', boundary); assert.equal(result.stderr, '');
    const resumed = await createStateStore({ home: isolated, identityProvider });
    if (index >= 11) assert.deepEqual(resumed.state.advisoryContinuation.pendingIds, ['GHSA-fixture'], boundary);
    else assert.equal(resumed.state.lastRunStatus, undefined, boundary);
    await resumed.close();
  }
});

test('二つの実プロセスが同じstateを同時更新せず二番目が75で終了する', async t => {
  // Arrange
  const home = await fixture(t), first = runChild(home, 'hold');
  t.after(() => first.child.kill('SIGKILL'));
  await new Promise((resolve, reject) => { first.child.stdout.once('data', resolve); first.child.once('error', reject); });
  // Act
  const second = await runChild(home, 'none').done;
  first.child.kill('SIGKILL'); await first.done;
  // Assert
  assert.equal(second.code, 75); assert.equal(second.stdout, '{"code":"MSS_LOCK"}'); assert.equal(second.stderr, '');
});

test('入れ子の未知state値を私有stateにだけ保持し継続snapshotへ複製しない', async t => {
  // Arrange
  const home = await fixture(t), root = path.join(home, '.local/state/mac-security-sweep');
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, 'state.json'), JSON.stringify({ schemaVersion: 1, packageContinuation: { extraPrivateExtension: 'SENTINEL_NESTED', pendingLockfiles: [] } }));
  const store = await createStateStore({ home, identityProvider });
  // Act
  const saved = await store.commit({ evidence: {}, report: 'partial', nextState: { lastRunStatus: 'partial' } });
  await store.close();
  const resumed = await createStateStore({ home, identityProvider });
  // Assert
  assert.equal(resumed.state.packageContinuation.extraPrivateExtension, 'SENTINEL_NESTED');
  assert.equal((await fs.readFile(path.join(saved.evidenceDirectory, 'continuation.json'), 'utf8')).includes('SENTINEL'), false);
  assert.equal(resumed.progressVerified, true); await resumed.close();
});

test('5000判定の合法サイズstateを保存した次回も同じ構造上限で再開する', async t => {
  // Arrange
  const home = await fixture(t), store = await createStateStore({ home, identityProvider });
  const snapshot = Array.from({ length: 5000 }, (_, index) => ({ id: `GHSA-example-${index}`, status: '可能性高', title: 'fixture', package: { ecosystem: 'npm', name: 'example' }, version: '1.0.0', evidence: [] }));
  // Act
  await store.commit({ evidence: {}, report: 'partial', nextState: { assessmentSnapshot: snapshot } }); await store.close();
  const resumed = await createStateStore({ home, identityProvider });
  // Assert
  assert.equal(resumed.state.assessmentSnapshot.length, 5000); await resumed.close();
});

test('writerのopen時に祖先が置換されても範囲外へ最初のbytesを書かない', async t => {
  // Arrange
  const home = await fixture(t), outside = path.join(home, 'outside'); await fs.mkdir(outside);
  let replaced = false, bytesWritten = 0;
  const filesystem = { ...fs, open: async (filename, ...args) => {
    if (!replaced && String(filename).includes('/evidence.json.') && String(filename).endsWith('.tmp')) {
      const directory = path.dirname(filename); await fs.rename(directory, `${directory}.held`); await fs.symlink(outside, directory); replaced = true;
      const handle = await fs.open(filename, ...args); const write = handle.writeFile.bind(handle);
      handle.writeFile = (...values) => { bytesWritten += Buffer.byteLength(values[0]); return write(...values); }; return handle;
    }
    return fs.open(filename, ...args);
  } };
  const store = await createStateStore({ home, identityProvider, filesystem });
  // Act / Assert
  await assert.rejects(store.commit({ evidence: { secret: 'SENTINEL' }, report: 'partial', nextState: {} }));
  assert.equal(bytesWritten, 0); await store.close();
});

test('stale回収中の次のacquirerがguardで拒否されlive lockを移動しない', async t => {
  // Arrange
  const home = await fixture(t), root = path.join(home, 'state'); await fs.mkdir(path.join(root, '.run.lock'), { recursive: true });
  await fs.writeFile(path.join(root, '.run.lock/owner.json'), JSON.stringify({ schemaVersion: 2, nonce: randomUUID(), runId: randomUUID(), pid: 999999, start: 'old', boot: 'old' }));
  let attempts = 0;
  const filesystem = { ...fs, rename: async (from, to) => {
    if (from === path.join(root, '.run.lock')) { attempts += 1; await assert.rejects(acquireLock(root, { home, identityProvider }), error => error.diagnostic.code === 'MSS_LOCK'); }
    return fs.rename(from, to);
  } };
  // Act
  const owner = await acquireLock(root, { home, filesystem, identityProvider: async pid => pid === 999999 ? { status: 'dead' } : identityProvider(pid) });
  // Assert
  assert.equal(attempts, 1); assert.equal(JSON.parse(await fs.readFile(path.join(root, '.run.lock/owner.json'))).nonce, owner.owner.nonce);
  await owner.release();
});

test('履歴世代の大きなevidenceを毎起動再読込せず現在と後続世代だけhash検証する', async t => {
  // Arrange
  const home = await fixture(t), store = await createStateStore({ home, identityProvider });
  const first = await store.commit({ evidence: { count: 1 }, report: 'one', nextState: {} });
  const last = await store.commit({ evidence: { count: 2 }, report: 'two', nextState: {} }); await store.close();
  const reads = [];
  const filesystem = { ...fs, open: (...args) => { reads.push(args[0]); return fs.open(...args); } };
  // Act
  const resumed = await createStateStore({ home, filesystem, identityProvider });
  // Assert
  assert.equal(reads.includes(path.join(first.evidenceDirectory, 'evidence.json')), false);
  assert.equal(reads.includes(path.join(last.evidenceDirectory, 'evidence.json')), true); await resumed.close();
});

test('既知progressの不正containerや日時を証拠へ複製せずwork前に拒否する', async t => {
  // Arrange
  const home = await fixture(t), root = path.join(home, '.local/state/mac-security-sweep'); await fs.mkdir(root, { recursive: true });
  const invalid = [{ packageContinuation: { query: 'SENTINEL' } }, { sourceCursors: { 'CISA KEV': 'SENTINEL' } }, { advisoryContinuation: { cache: ['SENTINEL'] } }];
  // Act / Assert
  for (const fields of invalid) {
    const original = JSON.stringify({ schemaVersion: 1, ...fields }); await fs.writeFile(path.join(root, 'state.json'), original);
    await assert.rejects(createStateStore({ home, identityProvider }), error => error.diagnostic.code === 'MSS_STATE');
    assert.equal(await fs.readFile(path.join(root, 'state.json'), 'utf8'), original);
    assert.equal(await fs.lstat(path.join(home, 'security-reports')).then(() => true, () => false), false);
  }
});
