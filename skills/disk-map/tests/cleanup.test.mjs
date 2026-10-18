import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { checkConfirmation, reconcileJournal, sealPlan } from '../scripts/lib/cleanup.mjs';
import { spaceMetrics } from '../scripts/lib/report.mjs';
import { appendJsonl, readJsonl } from '../scripts/lib/util.mjs';
import { VIEWER, fakeExec, idFor, makeFixture, reviewAssessment, safeAssessment, scannedSession, writeBytes } from './helpers.mjs';

const exists = (target) => fsp.lstat(target).then(() => true, () => false);
const settle = async (session) => {
  while (session.running) await session.running;
};

async function plannedNext(fx, extra) {
  const session = await scannedSession(fx, extra);
  const id = idFor(session, path.join(fx.project, '.next'));
  await session.assess({ scanId: session.scanId, revision: session.revision, assessments: [safeAssessment(id)] });
  const plan = await session.createPlan({ scanId: session.scanId, revision: session.revision, candidateIds: [id] }, VIEWER);
  return { session, id, plan };
}

// protects: expiring exact confirmation | fails_when: a wrong hash, nonce, revision, session or late confirmation passes | no_claim: browser provenance
test('confirmation rejects a wrong hash, nonce, session, revision or an expired plan', () => {
  // Arrange
  const plan = sealPlan({ scanId: 's', revision: 2, viewerSessionId: 'v1', epoch: 5, entries: [{ path: '/x' }], now: 1_000 });
  const ok = { manifestHash: plan.manifestHash, nonce: plan.nonce };
  const context = { viewerSessionId: 'v1', epoch: 5, revision: 2, now: 2_000 };
  // Act
  const codes = [
    checkConfirmation(plan, { ...ok, manifestHash: 'f'.repeat(64) }, context),
    checkConfirmation(plan, { ...ok, nonce: 'wrong-nonce-value-000000000000' }, context),
    checkConfirmation(plan, ok, { ...context, viewerSessionId: 'v2' }),
    checkConfirmation(plan, ok, { ...context, revision: 3 }),
    checkConfirmation(plan, ok, { ...context, epoch: 6 }),
    checkConfirmation(plan, ok, { ...context, now: 1_000 + 120_001 }),
  ].map((failure) => failure.code);
  // Assert
  assert.deepEqual(codes, ['manifest-mismatch', 'nonce-mismatch', 'wrong-viewer-session', 'plan-stale', 'plan-stale', 'plan-expired']);
  assert.equal(checkConfirmation(plan, ok, context), null);
});

// protects: no replay | fails_when: a consumed confirmation starts another operation | no_claim: crash durability
test('replaying a used confirmation performs no second operation', async () => {
  // Arrange
  const fx = await makeFixture();
  const { session, plan } = await plannedNext(fx);
  await session.confirmPlan(plan.planId, { manifestHash: plan.manifestHash, nonce: plan.nonce }, VIEWER);
  await settle(session);
  // Act
  const replay = session.confirmPlan(plan.planId, { manifestHash: plan.manifestHash, nonce: plan.nonce }, VIEWER);
  // Assert
  await assert.rejects(replay, { code: 'plan-already-used' });
  assert.equal((await readJsonl(session.journalFile)).filter((record) => record.type === 'intent').length, 1);
  assert.equal(await exists(path.join(fx.project, '.next')), false);
  assert.equal(await exists(path.join(fx.project, 'src', 'index.js')), true);
  await fx.cleanup();
});

// protects: identity is rechecked | fails_when: a swapped target is removed | no_claim: hostile same-user software
test('a folder replaced after confirmation planning is skipped and the replacement survives', async () => {
  // Arrange
  const fx = await makeFixture();
  const { session, plan } = await plannedNext(fx);
  await fsp.rename(path.join(fx.project, '.next'), path.join(fx.project, '.next-old'));
  await writeBytes(path.join(fx.project, '.next', 'replacement.txt'), 10);
  // Act
  await session.confirmPlan(plan.planId, { manifestHash: plan.manifestHash, nonce: plan.nonce }, VIEWER);
  await settle(session);
  // Assert
  assert.equal(session.outcomes.at(-1).status, 'skipped');
  assert.match(session.outcomes.at(-1).reason, /changed since review/);
  assert.equal(await exists(path.join(fx.project, '.next', 'replacement.txt')), true);
  await fx.cleanup();
});

// protects: a changed subtree survives | fails_when: a new or protected child is removed | no_claim: arbitrary kernel-level races
test('a credential file added inside a planned folder stops its removal', async () => {
  // Arrange
  const fx = await makeFixture();
  const { session, plan } = await plannedNext(fx);
  await writeBytes(path.join(fx.project, '.next', 'cache', 'Cookies'), 10);
  // Act
  await session.confirmPlan(plan.planId, { manifestHash: plan.manifestHash, nonce: plan.nonce }, VIEWER);
  await settle(session);
  // Assert
  assert.deepEqual([session.outcomes.at(-1).status, session.outcomes.at(-1).reason], ['skipped', 'A protected item now exists inside.']);
  assert.equal(await exists(path.join(fx.project, '.next', 'cache', 'Cookies')), true);
  await fx.cleanup();
});

// protects: Trash is reversible and restore never overwrites | fails_when: a file is lost or an occupant is replaced | no_claim: Finder Put Back metadata
test('a trashed recording restores to its original place, and an occupied place is preserved', async () => {
  // Arrange
  const fx = await makeFixture();
  const session = await scannedSession(fx);
  const folder = path.join(fx.home, 'Movies', 'old-demo');
  const id = idFor(session, folder);
  await session.assess({ scanId: session.scanId, revision: session.revision, assessments: [reviewAssessment(id)] });
  await session.decide({ candidateId: id, revision: session.revision, choice: 'trash' });
  const plan = await session.createPlan({ scanId: session.scanId, revision: session.revision, candidateIds: [id] }, VIEWER);
  await session.confirmPlan(plan.planId, { manifestHash: plan.manifestHash, nonce: plan.nonce }, VIEWER);
  await settle(session);
  const trashed = session.outcomes.at(-1);
  // Act
  await writeBytes(path.join(folder, 'new-take.mov'), 5);
  const occupied = session.createRestore({ operationId: trashed.operationId, destinationMode: 'original' }, VIEWER);
  await assert.rejects(occupied, { code: 'destination-occupied' });
  const restore = await session.createRestore({ operationId: trashed.operationId, destinationMode: 'sibling' }, VIEWER);
  await session.confirmPlan(restore.planId, { manifestHash: restore.manifestHash, nonce: restore.nonce }, VIEWER);
  await settle(session);
  // Assert
  assert.equal(trashed.status, 'succeeded');
  assert.equal(trashed.trashPath.startsWith(fx.trash), true);
  assert.equal(session.outcomes.at(-1).status, 'succeeded');
  assert.match(restore.entries[0].destinationPath, /old-demo\.restored-[0-9a-f-]{36}$/);
  assert.equal((await fsp.readFile(path.join(restore.entries[0].destinationPath, 'take-1.mov'))).length, 500_000);
  assert.equal((await fsp.readFile(path.join(folder, 'new-take.mov'))).length, 5);
  await fx.cleanup();
});

// protects: a failed move stays a failure | fails_when: EXDEV or EPERM falls back to deletion | no_claim: every volume format
test('a cross-device rename error and an unwritable Trash both leave the item in place', async () => {
  // Arrange
  const fx = await makeFixture();
  const exdev = async () => {
    throw Object.assign(new Error('cross-device'), { code: 'EXDEV' });
  };
  const runTrash = async (extra) => {
    const session = await scannedSession(fx, extra);
    const id = idFor(session, path.join(fx.home, 'Movies', 'old-demo'));
    await session.assess({ scanId: session.scanId, revision: session.revision, assessments: [reviewAssessment(id)] });
    await session.decide({ candidateId: id, revision: session.revision, choice: 'trash' });
    const plan = await session.createPlan({ scanId: session.scanId, revision: session.revision, candidateIds: [id] }, VIEWER);
    await session.confirmPlan(plan.planId, { manifestHash: plan.manifestHash, nonce: plan.nonce }, VIEWER);
    await settle(session);
    return session.outcomes.at(-1);
  };
  // Act
  const crossDevice = await runTrash({ fsOps: { rename: exdev } });
  await fsp.chmod(fx.trash, 0o500);
  const readOnly = await runTrash();
  await fsp.chmod(fx.trash, 0o700);
  // Assert
  assert.deepEqual([crossDevice.status, crossDevice.reason], ['failed', 'Move to Trash failed (EXDEV). Nothing was deleted or copied.']);
  assert.deepEqual([readOnly.status, readOnly.reason], ['failed', 'Could not create a Trash folder (EACCES). Nothing was moved.']);
  assert.equal((await fsp.readFile(path.join(fx.home, 'Movies', 'old-demo', 'take-1.mov'))).length, 500_000);
  assert.deepEqual(await fsp.readdir(fx.trash), []);
  await fx.cleanup();
});

// protects: the journal precedes mutation and is never replayed | fails_when: an interrupted run auto-replays | no_claim: durability after hardware loss
test('an intent without an outcome is closed as interrupted and the target is untouched', async () => {
  // Arrange
  const fx = await makeFixture();
  const journal = path.join(fx.state, 'journal.jsonl');
  const target = path.join(fx.project, '.next');
  await appendJsonl(journal, { type: 'intent', operationId: '11111111-1111-4111-8111-111111111111', path: target, recipe: 'build-output', operation: 'remove', startedAt: '2026-10-18T00:00:00.000Z' });
  // Act
  const first = await reconcileJournal(journal);
  const second = await reconcileJournal(journal);
  // Assert
  assert.deepEqual(first.map((outcome) => [outcome.status, outcome.evidenceKind]), [['interrupted', 'none']]);
  assert.deepEqual(second, []);
  assert.equal(await exists(path.join(target, 'cache', 'webpack.pack')), true);
  await fx.cleanup();
});

// protects: CLI receipts are honest | fails_when: a vanished path is reported as a direct deletion | no_claim: live package-manager reclamation
test('an npm cache cleaned by the tool is reported as observed-missing, not a direct deletion', async () => {
  // Arrange
  const fx = await makeFixture();
  const npmRoot = path.join(fx.home, '.npm');
  await writeBytes(path.join(npmRoot, '_cacache', 'index-v5', 'a'), 2000);
  const tools = { '/fake/npm': async (args) => {
    assert.deepEqual(args, ['cache', 'clean', '--force', '--cache', npmRoot]);
    await fsp.rm(path.join(npmRoot, '_cacache'), { recursive: true });
    return { code: 0, stdout: '', stderr: '', timedOut: false };
  } };
  const session = await scannedSession(fx, { exec: fakeExec({ tools }) });
  session.cli = { npm: { exe: '/fake/npm', version: '11.0.0', cacheRoot: npmRoot } };
  Object.assign(session.policyCtx, { cli: session.cli });
  Object.assign(session.recipeCtx, { cli: session.cli });
  Object.assign(session.cachedRecipeCtx, { cli: session.cli });
  const id = idFor(session, path.join(npmRoot, '_cacache'));
  await session.assess({ scanId: session.scanId, revision: session.revision, assessments: [{ ...safeAssessment(id, 'npm-cache'), purpose: 'npm cache' }] });
  const plan = await session.createPlan({ scanId: session.scanId, revision: session.revision, candidateIds: [id] }, VIEWER);
  // Act
  await session.confirmPlan(plan.planId, { manifestHash: plan.manifestHash, nonce: plan.nonce }, VIEWER);
  await settle(session);
  // Assert
  const outcome = session.outcomes.at(-1);
  assert.deepEqual([outcome.status, outcome.evidenceKind, outcome.operation, outcome.cliReportedBytes], ['succeeded', 'observed-missing', 'cli', null]);
  assert.equal(plan.entries[0].command, `npm cache clean --force --cache ${npmRoot}`);
  await fx.cleanup();
});

// protects: space metrics stay distinct | fails_when: a Trash move or an estimate is reported as reclaimed | no_claim: exclusive attribution of the volume delta
test('space metrics keep Trash moves, estimates, tool receipts and the volume delta separate', () => {
  // Arrange
  const entries = [{ allocatedBytes: '1000', reclaimableBytes: '1000' }, { allocatedBytes: '500', reclaimableBytes: '0' }, { allocatedBytes: '700', reclaimableBytes: null }];
  const outcomes = [
    { status: 'succeeded', operation: 'remove', allocatedBytes: '1000', cliReportedBytes: null },
    { status: 'succeeded', operation: 'trash', allocatedBytes: '500', cliReportedBytes: null },
    { status: 'succeeded', operation: 'cli', allocatedBytes: '700', cliReportedBytes: '650' },
    { status: 'failed', operation: 'remove', allocatedBytes: '9000', cliReportedBytes: null },
  ];
  // Act
  const metrics = spaceMetrics({ entries, outcomes, freeBefore: '10000', freeAfter: '11200' });
  // Assert
  assert.deepEqual(metrics, {
    representedBytes: '2200', estimatedReclaimableBytes: null, permanentCleanupBytes: '1000', trashMovedBytes: '500',
    cliReportedBytes: '650', observedFreeDeltaBytes: '1200', freeBeforeBytes: '10000', freeAfterBytes: '11200',
  });
});

// protects: plans pause while the agent is away | fails_when: a disconnected session creates a new plan | no_claim: host auto-resume
test('a new cleanup plan is refused while the agent is disconnected', async () => {
  // Arrange
  const fx = await makeFixture();
  const session = await scannedSession(fx);
  const id = idFor(session, path.join(fx.project, '.next'));
  await session.assess({ scanId: session.scanId, revision: session.revision, assessments: [safeAssessment(id)] });
  session.agent.leaseUntil = Date.now() - 1;
  session.tick();
  // Act
  const attempt = session.createPlan({ scanId: session.scanId, revision: session.revision, candidateIds: [id] }, VIEWER);
  // Assert
  await assert.rejects(attempt, { code: 'agent-disconnected' });
  assert.equal(await exists(path.join(fx.project, '.next')), true);
  await fx.cleanup();
});
