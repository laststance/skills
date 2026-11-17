import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { validateAssessment } from '../scripts/lib/bridge.mjs';
import { listProcesses } from '../scripts/lib/recipes.mjs';
import { translate, localizeReason } from '../assets/i18n.mjs';
import { VIEWER, fakeExec, idFor, makeFixture, newSession, reviewAssessment, safeAssessment, writeBytes } from './helpers.mjs';

/** Create an isolated session for these regressions; each test owns automatic cleanup.
 * @example
 * const { fx, session } = await setup(t, { locale: 'ja' });
 */
async function setup(t, extra = {}) {
  const fx = await makeFixture();
  const session = await newSession(fx, extra);
  t.after(async () => { clearInterval(session.timer); await session.pauseReport; await fx.cleanup(); });
  return { fx, session };
}

test('cleanup completion reaches the invoking agent with reports and is acknowledged only once', async (t) => {
  // Arrange
  const { fx, session } = await setup(t);
  await session.startScan();
  const scan = await session.nextEvent(1);
  const id = idFor(session, path.join(fx.project, '.next'));
  await session.assess({ scanId: session.scanId, revision: 0, messageId: scan.messageId, assessments: [safeAssessment(id)] });
  const plan = await session.createPlan({ scanId: session.scanId, revision: 0, candidateIds: [id] }, VIEWER);
  // Act
  await session.confirmPlan(plan.planId, plan, VIEWER);
  await session.running;
  const event = await session.nextEvent(1);
  const reply = { messageId: event.messageId, revision: event.payload.revision, text: '完了しました。' };
  await session.respond(reply);
  const duplicate = await session.respond(reply);
  // Assert
  assert.equal(event.kind, 'operation-complete');
  assert.equal(event.payload.operation, 'cleanup');
  assert.equal(event.payload.planId, plan.planId);
  assert.deepEqual(event.payload.counts, { succeeded: 1, skipped: 0, failed: 0, interrupted: 0, unknown: 0 });
  assert.equal(event.payload.metrics.trashMovedBytes, '0');
  assert.equal(session.phase, 'complete');
  assert.equal(JSON.parse(await fsp.readFile(event.payload.reports.summary)).coverage.phase, 'complete');
  assert.equal(duplicate.duplicate, true);
  assert.equal(session.chat.length, 1);
  assert.equal((await session.nextEvent(1)).type, 'idle');
});

test('a skipped cleanup and a Trash restore each produce an accurate completion event', async (t) => {
  // Arrange
  const { fx, session } = await setup(t);
  await session.startScan();
  await session.mailbox.answer((await session.nextEvent(1)).messageId);
  const id = idFor(session, path.join(fx.project, '.next'));
  await session.assess({ scanId: session.scanId, revision: 0, assessments: [safeAssessment(id)] });
  const first = await session.createPlan({ scanId: session.scanId, revision: 0, candidateIds: [id] }, VIEWER);
  await writeBytes(path.join(fx.project, '.next', 'Cookies'), 8);
  // Act
  await session.confirmPlan(first.planId, first, VIEWER);
  await session.running;
  const skipped = await session.nextEvent(1);
  await session.mailbox.answer(skipped.messageId);
  const recording = idFor(session, path.join(fx.home, 'Movies', 'old-demo'));
  await session.assess({ scanId: session.scanId, revision: session.revision, assessments: [reviewAssessment(recording)] });
  await session.decide({ candidateId: recording, revision: session.revision, choice: 'trash' });
  const trash = await session.createPlan({ scanId: session.scanId, revision: session.revision, candidateIds: [recording] }, VIEWER);
  await session.confirmPlan(trash.planId, trash, VIEWER);
  await session.running;
  await session.mailbox.answer((await session.nextEvent(1)).messageId);
  const restore = await session.createRestore({ operationId: session.outcomes.at(-1).operationId, destinationMode: 'original' }, VIEWER);
  await session.confirmPlan(restore.planId, restore, VIEWER);
  await session.running;
  const restored = await session.nextEvent(1);
  // Assert
  assert.deepEqual(skipped.payload.counts, { succeeded: 0, skipped: 1, failed: 0, interrupted: 0, unknown: 0 });
  assert.equal(restored.payload.operation, 'restore');
  assert.equal(restored.payload.metrics.planId, restore.planId);
  assert.equal(restored.payload.metrics.trashMovedBytes, '0');
  assert.equal((await fsp.stat(path.join(fx.home, 'Movies', 'old-demo', 'take-1.mov'))).size, 500_000);
});

test('idle polling pauses with saved reports and resume never revives an old cleanup confirmation', async (t) => {
  // Arrange
  const { fx, session } = await setup(t, { idleTimeoutMs: 1000 });
  await session.startScan();
  const scan = await session.nextEvent(1);
  const id = idFor(session, path.join(fx.project, '.next'));
  await session.assess({ scanId: session.scanId, revision: 0, messageId: scan.messageId, assessments: [safeAssessment(id)] });
  const plan = await session.createPlan({ scanId: session.scanId, revision: 0, candidateIds: [id] }, VIEWER);
  session.lastViewerActivity = Date.now() - 2000;
  // Act
  session.getState(); // Browser polling must not extend activity.
  session.touchAgent();
  session.tick();
  const paused = await session.nextEvent(1);
  await assert.rejects(session.confirmPlan(plan.planId, plan, VIEWER), { code: 'session-paused' });
  session.resume();
  // Assert
  assert.equal(paused.type, 'session-paused');
  assert.equal(await fsp.access(paused.reports.snapshot).then(() => true), true);
  assert.equal(session.agentStatus().connected, false);
  await assert.rejects(session.confirmPlan(plan.planId, plan, VIEWER), { code: 'plan-stale' });
  assert.equal(session.outcomes.length, 0);
  assert.equal((await fsp.stat(path.join(fx.project, '.next', 'server', 'page.js'))).size, 40_000);
  assert.equal((await session.nextEvent(1)).type, 'idle');
  assert.equal(session.agentStatus().connected, true);
});

test('pending questions and running operations prevent inactivity from interrupting work', async (t) => {
  // Arrange
  const { session } = await setup(t, { idleTimeoutMs: 1000 });
  await session.startScan();
  session.lastViewerActivity = Date.now() - 2000;
  // Act / Assert: outstanding event, including its lease, keeps investigation active.
  session.tick();
  assert.equal(session.paused, false);
  const scan = await session.nextEvent(1);
  session.tick();
  assert.equal(session.paused, false);
  await session.mailbox.answer(scan.messageId);
  session.running = Promise.resolve();
  session.tick();
  assert.equal(session.paused, false);
  session.running = null;
  session.touchViewer();
  session.tick();
  assert.equal(session.paused, false);
  session.lastViewerActivity = Date.now() - 2000;
  session.tick();
  assert.equal(session.paused, true);
  await session.pauseReport;
  assert.equal((await session.end()).ended, true);
  assert.throws(() => session.resume(), { code: 'session-ended' });
});

test('VM disks and containers stay protected through parent selection and narrow scans', async (t) => {
  // Arrange
  const { fx, session } = await setup(t);
  const targets = ['.lume/dev/disk.img', '.orbstack/data/data.img', 'Library/Group Containers/HUAQ24HBR6.dev.orbstack/store/data', 'Downloads/vm/disk.img', 'Downloads/other/data.img', 'Downloads/tart.qcow2', 'Downloads/normal/installer.img'];
  for (const target of targets) await writeBytes(path.join(fx.home, target), 64);
  await session.startScan();
  const ids = targets.map((target) => idFor(session, path.join(fx.home, target)));
  // Act
  await session.assess({ scanId: session.scanId, revision: 0, assessments: ids.map(reviewAssessment) });
  const parent = idFor(session, path.join(fx.home, 'Downloads/vm'));
  await session.assess({ scanId: session.scanId, revision: 0, assessments: [reviewAssessment(parent)] });
  const narrow = await newSession(fx, { root: path.join(fx.home, '.orbstack/data') });
  t.after(() => clearInterval(narrow.timer));
  await narrow.startScan();
  const narrowId = idFor(narrow, path.join(fx.home, '.orbstack/data/data.img'));
  await narrow.assess({ scanId: narrow.scanId, revision: 0, assessments: [reviewAssessment(narrowId)] });
  // Assert
  assert.deepEqual(ids.map((id) => session.candidates.get(id).risk), ['protected', 'protected', 'protected', 'protected', 'protected', 'protected', 'review']);
  assert.equal(session.candidates.get(parent).risk, 'protected');
  assert.equal(narrow.candidates.get(narrowId).risk, 'protected');
  await assert.rejects(session.decide({ candidateId: ids[0], revision: 0, choice: 'trash' }), { code: 'not-review' });
});

test('metadata probes expose only known process labels and never process arguments or secrets', async (t) => {
  // Arrange
  const calls = [];
  const fake = fakeExec({ processes: ['/Applications/Cursor.app/Contents/MacOS/Cursor', '/usr/local/bin/tool --token=secret-fixture-123', '/usr/bin/npm install --token=secret-fixture-123'] });
  const exec = async (file, args, options) => { calls.push([file, args]); return fake(file, args, options); };
  const { fx, session } = await setup(t, { exec });
  await writeBytes(path.join(fx.home, 'Library/Application Support/Cursor/Cache/data'), 100);
  await session.startScan();
  const id = idFor(session, path.join(fx.home, 'Library/Application Support/Cursor/Cache'));
  // Act
  const probe = await session.probeCandidate({ candidateId: id, revision: 0 });
  // Assert
  assert.deepEqual(probe.usage, { owners: ['Cursor'], recipes: ['npm-cache'] });
  assert.equal(probe.readiness.busy, true);
  assert.equal(JSON.stringify(probe).includes('secret-fixture-123'), false);
  assert.equal(JSON.stringify(probe).includes('--token'), false);
  assert.deepEqual(calls.filter(([file]) => file === '/bin/ps').map(([, args]) => args), [['-axo', 'args='], ['-axo', 'args=']]);
  assert.equal(session.candidates.get(id).assessment, null);
  assert.equal(session.candidates.get(id).selected, false);
  assert.equal(await listProcesses({ exec: async () => ({ code: 1, stdout: 'secret-fixture-123' }) }), null);
});

test('app residue and managed-store exceptions cannot make a containing VM disk cleanable', async (t) => {
  // Arrange
  const { fx, session } = await setup(t);
  const residue = path.join(fx.home, 'Library/Caches/FormerVm');
  const store = path.join(fx.home, 'Library/pnpm/store/v11');
  await writeBytes(path.join(residue, 'disk.img'), 2 * 1024 * 1024);
  await writeBytes(path.join(store, 'data.img'), 128);
  session.cli = { pnpm: { exe: '/fake/pnpm', version: '10.0.0', storePath: store, storeDir: path.dirname(store) } };
  // Act
  await session.startScan();
  const residueId = idFor(session, residue);
  const storeId = idFor(session, store);
  await session.assess({ scanId: session.scanId, revision: 0, assessments: [reviewAssessment(residueId), safeAssessment(storeId, 'pnpm-store')] });
  // Assert
  assert.ok(session.candidates.get(residueId).residue);
  assert.equal(session.candidates.get(residueId).risk, 'protected');
  assert.equal(session.candidates.get(storeId).risk, 'protected');
  await assert.rejects(session.createPlan({ scanId: session.scanId, revision: 0, candidateIds: [storeId] }, VIEWER), { code: 'not-eligible' });
});

test('mutable open-file process titles cannot leak secrets through probe evidence', async (t) => {
  // Arrange
  const { fx, session } = await setup(t);
  const fake = fakeExec();
  const exec = (file, args, options) => file === '/usr/sbin/lsof'
    ? Promise.resolve({ code: 0, stdout: `p123\ncsecret-fixture-456\nn${fx.project}/src/index.js\n`, stderr: '' })
    : fake(file, args, options);
  session.recipeCtx.exec = exec;
  await session.startScan();
  // Act
  const probe = await session.probeCandidate({ candidateId: idFor(session, path.join(fx.project, '.next')), revision: 0 });
  // Assert
  assert.equal(probe.readiness.ok, false);
  assert.match(probe.readiness.reason, /process \(pid 123\) holds index.js/);
  assert.equal(JSON.stringify(probe).includes('secret-fixture-456'), false);
});

test('container-only protection permits verified child caches and reports cascading selection changes', async (t) => {
  // Arrange
  const { fx, session } = await setup(t);
  const parentPath = path.join(fx.home, 'Library/Application Support/Cursor');
  await writeBytes(path.join(parentPath, 'Cache/data'), 100);
  await session.startScan();
  const parent = idFor(session, parentPath);
  const child = idFor(session, path.join(parentPath, 'Cache'));
  await session.assess({ scanId: session.scanId, revision: 0, assessments: [safeAssessment(child, 'app-cache')] });
  // Act
  const subtree = await session.assess({ scanId: session.scanId, revision: 0, assessments: [{ ...reviewAssessment(parent), risk: 'protected' }] });
  const container = await session.assess({ scanId: session.scanId, revision: 0, assessments: [{ ...reviewAssessment(parent), risk: 'protected', protectionScope: 'container' }] });
  // Assert
  assert.deepEqual(subtree.affected.find((item) => item.candidateId === child).previous, { risk: 'safe', selected: true });
  assert.equal(subtree.affected.find((item) => item.candidateId === child).selected, false);
  assert.equal(container.affected.find((item) => item.candidateId === child).risk, 'safe');
  assert.equal(session.candidates.get(child).selected, true);
  assert.equal(session.candidates.get(parent).risk, 'protected');
  await assert.rejects(session.createPlan({ scanId: session.scanId, revision: 0, candidateIds: [parent] }, VIEWER), { code: 'not-eligible' });
  assert.throws(() => validateAssessment({ ...safeAssessment(child), protectionScope: 'container' }), { code: 'invalid-field' });
});

test('a user Keep decision protects all descendants even when the agent later protects only the container', async (t) => {
  // Arrange
  const { fx, session } = await setup(t);
  await session.startScan();
  const parent = idFor(session, path.join(fx.home, 'Movies/old-demo'));
  const child = idFor(session, path.join(fx.home, 'Movies/old-demo/take-1.mov'));
  await session.assess({ scanId: session.scanId, revision: 0, assessments: [reviewAssessment(parent), reviewAssessment(child)] });
  await session.decide({ candidateId: parent, revision: 0, choice: 'keep' });
  // Act
  await session.assess({ scanId: session.scanId, revision: 0, assessments: [{ ...reviewAssessment(parent), risk: 'protected', protectionScope: 'container' }] });
  // Assert
  assert.equal(session.candidates.get(child).risk, 'protected');
  assert.equal(session.candidates.get(child).selected, false);
  await assert.rejects(session.decide({ candidateId: child, revision: 0, choice: 'trash' }), { code: 'not-review' });
});

test('compact size-ordered pages cover every candidate and reject stale revisions', async (t) => {
  // Arrange
  const { fx, session } = await setup(t);
  for (let index = 0; index < 35; index += 1) await writeBytes(path.join(fx.project, `project-${index}`, '.next', 'data'), (index + 1) * 4096);
  await session.startScan();
  const brief = (await session.nextEvent(1)).payload;
  const items = [];
  const initialCount = session.candidates.size;
  let cursor = 0;
  // Act
  do {
    const page = session.candidatePage({ revision: 0, cursor, limit: 7 });
    assert.ok(page.items.length <= 7);
    items.push(...page.items);
    await session.probeCandidate({ candidateId: idFor(session, path.join(fx.home, 'Movies/old-demo')), revision: 0 });
    cursor = page.nextCursor;
  } while (cursor !== null);
  // Assert
  assert.equal(brief.candidates.length, 8);
  assert.equal(brief.candidatesNextCursor, 8);
  assert.equal(brief.coverage.boundaries, undefined);
  assert.ok(Buffer.byteLength(JSON.stringify(brief)) < 16_000);
  assert.equal(items.length, initialCount);
  assert.equal(new Set(items.map((item) => item.candidateId)).size, items.length);
  assert.equal(items[0].path.endsWith('/shop/.next'), true);
  assert.equal(items.slice(1).every((item, index) => BigInt(items[index].allocatedBytes) >= BigInt(item.allocatedBytes)), true);
  assert.throws(() => session.candidatePage({ revision: 9 }), { code: 'stale-revision' });
  assert.throws(() => session.candidatePage({ revision: 0, limit: 100 }), { code: 'invalid-field' });
});

test('a safe reassessment cannot select or plan a cache the user chose to Keep', async (t) => {
  // Arrange
  const { fx, session } = await setup(t);
  await session.startScan();
  const id = idFor(session, path.join(fx.project, '.next'));
  await session.assess({ scanId: session.scanId, revision: 0, assessments: [reviewAssessment(id)] });
  await session.decide({ candidateId: id, revision: 0, choice: 'keep' });
  // Act
  await session.assess({ scanId: session.scanId, revision: 0, assessments: [safeAssessment(id)] });
  // Assert
  assert.equal(session.candidates.get(id).decision.choice, 'keep');
  assert.equal(session.candidates.get(id).selected, false);
  await assert.rejects(session.createPlan({ scanId: session.scanId, revision: 0, candidateIds: [id] }, VIEWER), { code: 'not-eligible' });
});

test('unaccounted space remains unknown for partial scans and incomparable allocated totals', async (t) => {
  // Arrange
  const { session } = await setup(t);
  await session.startScan();
  session.volume = { totalBytes: '1000', freeBytes: '600' };
  session.scan.tree.nodes[0].alloc = 400;
  session.scan.tree.nodes[0].complete = true;
  // Act
  const comparable = session.summary();
  session.scan.tree.nodes[0].alloc = 500;
  const excess = session.summary();
  session.scan.tree.nodes[0].alloc = 300;
  session.scan.tree.nodes[0].complete = false;
  const partial = session.summary();
  // Assert
  assert.deepEqual([comparable.unaccountedBytes, comparable.accountingStatus], ['0', 'comparable']);
  assert.deepEqual([excess.unaccountedBytes, excess.accountingStatus], [null, 'allocated-exceeds-volume']);
  assert.deepEqual([partial.unaccountedBytes, partial.accountingStatus], [null, 'incomplete']);
});

test('Japanese reports and runtime reasons use the viewer language without corrupting plan IDs or agent prose', async (t) => {
  // Arrange
  const { session } = await setup(t, { locale: 'ja' });
  await session.startScan();
  session.scan.tree.nodes[0].complete = false;
  session.metrics = { planId: 'fixture-plan-123', trashMovedBytes: '128', observedFreeDeltaBytes: null };
  // Act
  const reports = await session.writeAllReports();
  const html = await fsp.readFile(reports.snapshot, 'utf8');
  // Assert
  assert.equal(translate('ja', 'clear'), '質問対象を解除');
  assert.equal(localizeReason('Not assessed yet.', 'ja'), 'まだ評価されていません。');
  assert.equal(localizeReason('Needs review: Could not check open files; usage is unknown..', 'ja'), '確認が必要：使用中のファイルを確認できず、利用状況が不明です。');
  assert.equal(localizeReason('User-provided explanation.', 'ja'), 'User-provided explanation.');
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /最終計測時の空き容量/);
  assert.match(html, /読み取れなかった領域/);
  assert.match(html, /操作履歴/);
  assert.match(html, /fixture-plan-123<\/td>/);
  assert.doesNotMatch(html, /NaN|<script/);
});
