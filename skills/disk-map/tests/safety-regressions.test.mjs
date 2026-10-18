import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { validateAssessment } from '../scripts/lib/bridge.mjs';
import { VIEWER, fakeExec, idFor, makeFixture, safeAssessment, reviewAssessment, scannedSession, writeBytes } from './helpers.mjs';

// protects: protected paths remain protected at every selection depth | fails_when: a child or parent bypasses protection | no_claim: every application
test('browser state, app bundles, libraries and VM containers stay protected through their children and parents', async (t) => {
  // Arrange
  const fx = await makeFixture();
  t.after(() => fx.cleanup());
  const fixtures = [
    ['Library/Application Support/Cursor/Local Storage/leveldb/data', 'Library/Application Support/Cursor/Local Storage/leveldb'],
    ['Applications/Example.app/Contents/data', 'Applications/Example.app/Contents'],
    ['Downloads/installers/Example.app/Contents/data', 'Downloads/installers'],
    ['Pictures/Archive.photoslibrary/originals/data', 'Pictures/Archive.photoslibrary/originals'],
    ['Downloads/library-backup/Archive.photoslibrary/data', 'Downloads/library-backup'],
    ['Downloads/vm-backup/Guest.pvm/disk', 'Downloads/vm-backup'],
  ];
  for (const [file] of fixtures) await writeBytes(path.join(fx.home, file), 32);
  const session = await scannedSession(fx);
  t.after(() => clearInterval(session.timer));
  const ids = fixtures.map(([, target]) => idFor(session, path.join(fx.home, target)));
  // Act
  await session.assess({ scanId: session.scanId, revision: 0, assessments: ids.map(reviewAssessment) });
  // Assert
  assert.deepEqual(ids.map((id) => session.candidates.get(id).risk), ['protected', 'protected', 'protected', 'protected', 'protected', 'protected']);
  for (const id of ids) assert.throws(() => session.setSelection({ scanId: session.scanId, revision: 0, candidateIds: [id], selected: true }), { code: 'not-eligible' });
});

// protects: a narrow scan cannot turn source into disposable data | fails_when: Git context outside the root is lost | no_claim: all VCS tools
test('scanning a source subfolder preserves its enclosing repository protection', async (t) => {
  // Arrange
  const fx = await makeFixture();
  t.after(() => fx.cleanup());
  const session = await scannedSession(fx, { root: path.join(fx.project, 'src') });
  t.after(() => clearInterval(session.timer));
  const id = idFor(session, path.join(fx.project, 'src', 'index.js'));
  // Act
  await session.assess({ scanId: session.scanId, revision: 0, assessments: [reviewAssessment(id)] });
  // Assert
  assert.equal(session.candidates.get(id).repoRoot, fx.project);
  assert.equal(session.candidates.get(id).risk, 'protected');
  await assert.rejects(session.decide({ candidateId: id, revision: 0, choice: 'trash' }), { code: 'not-review' });
});

// protects: narrow scans retain the intended ignored-output exception | fails_when: the safety fix blocks all build outputs | no_claim: running project checks
test('a narrow project scan still permits an ignored build folder', async (t) => {
  // Arrange
  const fx = await makeFixture();
  t.after(() => fx.cleanup());
  const root = path.join(fx.project, '.next');
  const session = await scannedSession(fx, { root });
  t.after(() => clearInterval(session.timer));
  const id = idFor(session, root);
  // Act
  await session.assess({ scanId: session.scanId, revision: 0, assessments: [safeAssessment(id)] });
  // Assert
  assert.equal(session.candidates.get(id).repoRoot, fx.project);
  assert.equal(session.candidates.get(id).risk, 'safe');
});

// protects: explicit preservation applies to the entire deletion subtree | fails_when: a protected child is only counted in the manifest | no_claim: concurrent hostile local processes
test('protecting a child unselects its safe parent and prevents a cleanup plan', async (t) => {
  // Arrange
  const fx = await makeFixture();
  t.after(() => fx.cleanup());
  const folder = path.join(fx.project, '.next');
  const valuable = path.join(folder, 'valuable');
  await writeBytes(path.join(valuable, 'recording.bin'), 32);
  const session = await scannedSession(fx);
  t.after(() => clearInterval(session.timer));
  const parentId = idFor(session, folder);
  const childId = idFor(session, valuable);
  await session.assess({ scanId: session.scanId, revision: 0, assessments: [safeAssessment(parentId)] });
  // Act
  await session.assess({ scanId: session.scanId, revision: 0, assessments: [{ ...reviewAssessment(childId), risk: 'protected' }] });
  // Assert
  assert.equal(session.candidates.get(parentId).selected, false);
  await assert.rejects(session.createPlan({ scanId: session.scanId, revision: 0, candidateIds: [parentId] }, VIEWER), { code: 'not-eligible' });
  assert.equal((await fsp.stat(path.join(valuable, 'recording.bin'))).size, 32);
});

// protects: Keep cannot be bypassed via a parent | fails_when: preserving a recording still permits its containing folder | no_claim: file-manager actions
test('keeping a child prevents ancestor cleanup and the user can later change that decision', async (t) => {
  // Arrange
  const fx = await makeFixture();
  t.after(() => fx.cleanup());
  const session = await scannedSession(fx);
  t.after(() => clearInterval(session.timer));
  const parentId = idFor(session, path.join(fx.home, 'Movies', 'old-demo'));
  const childId = idFor(session, path.join(fx.home, 'Movies', 'old-demo', 'take-1.mov'));
  await session.assess({ scanId: session.scanId, revision: 0, assessments: [reviewAssessment(parentId), reviewAssessment(childId)] });
  // Act
  await session.decide({ candidateId: childId, revision: 0, choice: 'keep' });
  // Assert
  await assert.rejects(session.decide({ candidateId: parentId, revision: 0, choice: 'trash' }), { code: 'not-review' });
  assert.equal(session.candidates.get(childId).risk, 'review');
  assert.equal((await session.decide({ candidateId: childId, revision: 0, choice: 'trash' })).selected, true);
});

// protects: new consequences require fresh consent | fails_when: unchanged risk preserves an old manifest | no_claim: agent judgment quality
test('changing the consequences invalidates a pending plan even when the safe rating is unchanged', async (t) => {
  // Arrange
  const fx = await makeFixture();
  t.after(() => fx.cleanup());
  const session = await scannedSession(fx);
  t.after(() => clearInterval(session.timer));
  const id = idFor(session, path.join(fx.project, '.next'));
  await session.assess({ scanId: session.scanId, revision: 0, assessments: [safeAssessment(id)] });
  const plan = await session.createPlan({ scanId: session.scanId, revision: 0, candidateIds: [id] }, VIEWER);
  // Act
  await session.assess({ scanId: session.scanId, revision: 0, assessments: [{ ...safeAssessment(id), consequences: ['A large rebuild is required.'] }] });
  // Assert
  await assert.rejects(session.confirmPlan(plan.planId, { manifestHash: plan.manifestHash, nonce: plan.nonce }, VIEWER), { code: 'plan-stale' });
  assert.equal(session.outcomes.length, 0);
});

// protects: an answer belongs to its reviewed question | fails_when: a changed question inherits a prior Trash decision | no_claim: dialog wording
test('a changed review question requires a new Trash decision', async (t) => {
  // Arrange
  const fx = await makeFixture();
  t.after(() => fx.cleanup());
  const session = await scannedSession(fx);
  t.after(() => clearInterval(session.timer));
  const id = idFor(session, path.join(fx.home, 'Movies', 'old-demo'));
  await session.assess({ scanId: session.scanId, revision: 0, assessments: [reviewAssessment(id)] });
  await session.decide({ candidateId: id, revision: 0, choice: 'trash' });
  // Act
  await session.assess({ scanId: session.scanId, revision: 0, assessments: [{ ...reviewAssessment(id), question: 'This may be the only recording. Keep it?' }] });
  // Assert
  assert.equal(session.candidates.get(id).selected, false);
  assert.equal(session.candidates.get(id).decision, null);
});

// protects: consent changes during metadata reads cannot be sealed as current | fails_when: an async plan captures the final epoch | no_claim: kernel-level races
test('unchecking an item while its plan is being prepared prevents that plan from being sealed', async (t) => {
  // Arrange
  const fx = await makeFixture();
  t.after(() => fx.cleanup());
  const session = await scannedSession(fx);
  t.after(() => clearInterval(session.timer));
  const target = path.join(fx.project, '.next');
  const id = idFor(session, target);
  await session.assess({ scanId: session.scanId, revision: 0, assessments: [safeAssessment(id)] });
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const lstat = fsp.lstat;
  let blocked = false;
  t.mock.method(fsp, 'lstat', async (...args) => {
    if (args[0] === target && !blocked) {
      blocked = true;
      entered.resolve();
      await release.promise;
    }
    return lstat(...args);
  });
  const preparing = session.createPlan({ scanId: session.scanId, revision: 0, candidateIds: [id] }, VIEWER);
  await entered.promise;
  // Act
  session.setSelection({ scanId: session.scanId, revision: 0, candidateIds: [id], selected: false });
  release.resolve();
  // Assert
  await assert.rejects(preparing, { code: 'plan-stale' });
  assert.equal(session.plans.size, 0);
});

// protects: CLI recipes must honor protected children appearing after planning | fails_when: the tool runs against a changed cache | no_claim: installed npm behavior
test('a new protected descendant prevents a package cache cleanup command from running', async (t) => {
  // Arrange
  const fx = await makeFixture();
  t.after(() => fx.cleanup());
  const root = path.join(fx.home, '.npm');
  const cache = path.join(root, '_cacache');
  await writeBytes(path.join(cache, 'index-v5', 'entry'), 32);
  let commands = 0;
  const session = await scannedSession(fx, { exec: fakeExec({ tools: { '/fake/npm': async () => { commands += 1; return { code: 0, stdout: '', stderr: '' }; } } }) });
  t.after(() => clearInterval(session.timer));
  session.cli = { npm: { exe: '/fake/npm', version: '11.0.0', cacheRoot: root } };
  for (const ctx of [session.policyCtx, session.recipeCtx, session.cachedRecipeCtx]) ctx.cli = session.cli;
  const id = idFor(session, cache);
  await session.assess({ scanId: session.scanId, revision: 0, assessments: [safeAssessment(id, 'npm-cache')] });
  const plan = await session.createPlan({ scanId: session.scanId, revision: 0, candidateIds: [id] }, VIEWER);
  await writeBytes(path.join(cache, 'index-v5', 'Cookies'), 32);
  // Act
  await session.confirmPlan(plan.planId, { manifestHash: plan.manifestHash, nonce: plan.nonce }, VIEWER);
  await session.running;
  // Assert
  assert.equal(commands, 0);
  assert.equal(session.outcomes.at(-1).status, 'skipped');
  assert.equal((await fsp.stat(path.join(cache, 'index-v5', 'Cookies'))).size, 32);
});

// protects: restore refers to the item originally moved | fails_when: replacement content in Trash is silently adopted | no_claim: intentional edits in Finder
test('replacing a Trash item before planning restore leaves the replacement untouched', async (t) => {
  // Arrange
  const fx = await makeFixture();
  t.after(() => fx.cleanup());
  const session = await scannedSession(fx);
  t.after(() => clearInterval(session.timer));
  const original = path.join(fx.home, 'Movies', 'old-demo');
  const id = idFor(session, original);
  await session.assess({ scanId: session.scanId, revision: 0, assessments: [reviewAssessment(id)] });
  await session.decide({ candidateId: id, revision: 0, choice: 'trash' });
  const plan = await session.createPlan({ scanId: session.scanId, revision: 0, candidateIds: [id] }, VIEWER);
  await session.confirmPlan(plan.planId, { manifestHash: plan.manifestHash, nonce: plan.nonce }, VIEWER);
  await session.running;
  const moved = session.outcomes.at(-1);
  await fsp.rename(moved.trashPath, `${moved.trashPath}-original`);
  await writeBytes(path.join(moved.trashPath, 'replacement'), 32);
  // Act
  const restoring = session.createRestore({ operationId: moved.operationId, destinationMode: 'original' }, VIEWER);
  // Assert
  await assert.rejects(restoring, { code: 'changed-in-trash' });
  assert.equal((await fsp.stat(path.join(moved.trashPath, 'replacement'))).size, 32);
  assert.equal(await fsp.lstat(original).then(() => true, () => false), false);
});

// protects: malformed model evidence has a stable validation error | fails_when: null produces a TypeError | no_claim: every invalid input shape
test('a null evidence item is rejected as invalid assessment input', () => {
  // Arrange
  const input = { ...safeAssessment('11111111-1111-4111-8111-111111111111'), evidence: [null] };
  // Act / Assert
  assert.throws(() => validateAssessment(input), { code: 'invalid-field', status: 400 });
});

// protects: cleaning a narrow scan root still finishes reporting | fails_when: the removed root has no parent node | no_claim: rescanning a missing root
test('cleaning the scan root finishes with an empty map and an operation report', async (t) => {
  // Arrange
  const fx = await makeFixture();
  t.after(() => fx.cleanup());
  const root = path.join(fx.project, '.next');
  const session = await scannedSession(fx, { root });
  t.after(() => clearInterval(session.timer));
  const id = idFor(session, root);
  await session.assess({ scanId: session.scanId, revision: 0, assessments: [safeAssessment(id)] });
  const plan = await session.createPlan({ scanId: session.scanId, revision: 0, candidateIds: [id] }, VIEWER);
  // Act
  await session.confirmPlan(plan.planId, { manifestHash: plan.manifestHash, nonce: plan.nonce }, VIEWER);
  await session.running;
  // Assert
  assert.equal(session.phase, 'complete');
  assert.equal(session.summary().scannedBytes, '0');
  assert.deepEqual(session.getTree({}).entries, []);
  assert.deepEqual(session.getTree({ q: 'webpack' }).entries, []);
  const report = JSON.parse(await fsp.readFile(session.reports.summary, 'utf8'));
  assert.equal(report.counts.succeeded, 1);
});

// protects: live preservation is checked after readiness awaits | fails_when: an agent update arrives between recheck and removal | no_claim: already-started external commands
test('protecting a child during the open-file check prevents permanent deletion', async (t) => {
  // Arrange
  const fx = await makeFixture();
  t.after(() => fx.cleanup());
  const target = path.join(fx.project, '.next');
  const child = path.join(target, 'valuable');
  await writeBytes(path.join(child, 'recording'), 32);
  const delegate = fakeExec();
  let changed = false;
  let session;
  const exec = async (file, args, options) => {
    if (file === '/usr/sbin/lsof' && session?.phase === 'cleaning' && !changed) {
      changed = true;
      await session.assess({ scanId: session.scanId, revision: 0, assessments: [{ ...reviewAssessment(idFor(session, child)), risk: 'protected' }] });
    }
    return delegate(file, args, options);
  };
  session = await scannedSession(fx, { exec });
  t.after(() => clearInterval(session.timer));
  const id = idFor(session, target);
  await session.assess({ scanId: session.scanId, revision: 0, assessments: [safeAssessment(id)] });
  const plan = await session.createPlan({ scanId: session.scanId, revision: 0, candidateIds: [id] }, VIEWER);
  // Act
  await session.confirmPlan(plan.planId, { manifestHash: plan.manifestHash, nonce: plan.nonce }, VIEWER);
  await session.running;
  // Assert
  assert.equal(changed, true);
  assert.equal(session.outcomes.at(-1).status, 'skipped');
  assert.equal((await fsp.stat(path.join(child, 'recording'))).size, 32);
});

// protects: changes after staging preserve data with a recovery location | fails_when: metadata equality overrides new preservation | no_claim: automatic recovery of staged items
test('protecting a staged child keeps the staged data and reports its recovery path', async (t) => {
  // Arrange
  const fx = await makeFixture();
  t.after(() => fx.cleanup());
  const target = path.join(fx.project, '.next');
  const child = path.join(target, 'valuable');
  await writeBytes(path.join(child, 'recording'), 32);
  let session;
  const rename = async (from, to) => {
    await fsp.rename(from, to);
    await session.assess({ scanId: session.scanId, revision: 0, assessments: [{ ...reviewAssessment(idFor(session, child)), risk: 'protected' }] });
  };
  session = await scannedSession(fx, { fsOps: { rename } });
  t.after(() => clearInterval(session.timer));
  const id = idFor(session, target);
  await session.assess({ scanId: session.scanId, revision: 0, assessments: [safeAssessment(id)] });
  const plan = await session.createPlan({ scanId: session.scanId, revision: 0, candidateIds: [id] }, VIEWER);
  // Act
  await session.confirmPlan(plan.planId, { manifestHash: plan.manifestHash, nonce: plan.nonce }, VIEWER);
  await session.running;
  // Assert
  const outcome = session.outcomes.at(-1);
  assert.equal(outcome.status, 'failed');
  assert.equal((await fsp.stat(path.join(outcome.recoveryPath, 'valuable', 'recording'))).size, 32);
});
