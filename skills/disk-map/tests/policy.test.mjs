import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { FLAG } from '../scripts/lib/scanner.mjs';
import { effectiveRisk, protectionReason } from '../scripts/lib/policy.mjs';
import { VIEWER, idFor, makeFixture, newSession, reviewAssessment, safeAssessment, scannedSession, writeBytes } from './helpers.mjs';

const ctx = { home: '/Users/me', stateDir: '/Users/me/Library/Application Support/disk-map', skillDir: '/opt/skills/disk-map' };

// protects: protected state wins over labels | fails_when: a parent or model label overrides protection | no_claim: full app-state compatibility
test('a folder with credentials inside stays protected even when the agent calls it safe', async () => {
  // Arrange
  const fx = await makeFixture();
  const session = await scannedSession(fx);
  const libraryGoogle = path.join(fx.home, 'Library', 'Application Support', 'Google', 'Chrome', 'Default');
  const id = idFor(session, libraryGoogle);
  // Act
  await session.assess({ scanId: session.scanId, revision: session.revision, assessments: [safeAssessment(id, 'app-cache')] });
  // Assert
  const candidate = session.candidates.get(id);
  assert.equal(candidate.risk, 'protected');
  assert.equal(candidate.selected, false);
  await fx.cleanup();
});

// protects: protection rules cover the documented classes | fails_when: credentials, broad roots or repos become actionable | no_claim: every app
test('credentials, broad folders, repository roots and app bundles are never action targets', () => {
  // Arrange
  const cases = [
    [{ path: '/Users/me/.ssh', kind: 'dir', flags: 0 }, 'Protected: credentials.'],
    [{ path: '/Users/me/Library/Caches', kind: 'dir', flags: 0 }, 'Too broad to act on; choose a specific folder inside it.'],
    [{ path: '/Users/me/Library/Application Support/Slack', kind: 'dir', flags: 0 }, "A whole application's data folder is never a cleanup target."],
    [{ path: '/Users/me/code/app', kind: 'dir', flags: FLAG.REPO_ROOT | FLAG.HAS_PROTECTED_DESC }, 'Protected: repository or worktree root.'],
    [{ path: '/Users/me/code/app/src', kind: 'dir', flags: 0, repoRoot: '/Users/me/code/app' }, 'Inside a Git work tree; source files are protected.'],
    [{ path: '/Users/me/Downloads/Tool.app', kind: 'dir', flags: 0 }, 'Protected: application bundle.'],
    [{ path: '/Users/me/VMs/disk.qcow2', kind: 'file', flags: 0 }, 'Docker/VM disk: lifecycle operations are not supported in this release.'],
    [{ path: '/Users/me/Library', kind: 'dir', flags: 0 }, 'Protected: disk-map runtime state or the skill itself.'],
    [{ path: '/opt/skills/disk-map/assets', kind: 'dir', flags: 0 }, 'Protected: disk-map runtime state or the skill itself.'],
  ];
  // Act
  const reasons = cases.map(([candidate]) => protectionReason(candidate, ctx));
  // Assert
  assert.deepEqual(reasons, cases.map(([, reason]) => reason));
  assert.equal(protectionReason({ path: '/Users/me/code/app/.next', kind: 'dir', flags: 0, repoRoot: '/Users/me/code/app' }, ctx), null);
});

// protects: managed stores stay assessable and other folders name the culprit | fails_when: a vendored protected-looking filename blocks a whole store, or the reason hides which path is protected | no_claim: package internals are safe
test('a managed package store skips descendant protection while a plain folder names the offending path', () => {
  // Arrange
  const store = { path: '/Users/me/Library/pnpm/store/v11', kind: 'dir', flags: FLAG.HAS_PROTECTED_DESC, recipe: 'pnpm-store', protectedDesc: '/Users/me/Library/pnpm/store/v11/files/ab/pkg/.git' };
  const plain = { ...store, recipe: null };
  // Act
  const reasons = [protectionReason(store, ctx), protectionReason(plain, ctx)];
  // Assert
  assert.deepEqual(reasons, [null, 'Contains protected data at "files/ab/pkg/.git" (credentials, site data or a Git repository).']);
});

// protects: scan flags reach the candidate reason | fails_when: the recorded descendant path is lost between scan and policy | no_claim: path format
test('a folder protected by a scanned descendant names the offending path', async () => {
  // Arrange
  const fx = await makeFixture();
  const dir = path.join(fx.home, 'Library', 'Caches', 'SomeApp');
  await writeBytes(path.join(dir, 'Cookies'), 100);
  const session = await scannedSession(fx);
  // Act
  const candidate = session.ensureCandidate(session.scan.tree.findByPath(dir));
  // Assert
  assert.equal(candidate.risk, 'protected');
  assert.equal(candidate.reason, 'Contains protected data at "Cookies" (credentials, site data or a Git repository).');
  await fx.cleanup();
});

// protects: a real store path reaches assessment | fails_when: the detected store recipe does not lift descendant protection | no_claim: pnpm presence on the host
test('a detected pnpm store with a vendored protected-looking name inside stays assessable', async () => {
  // Arrange
  const fx = await makeFixture();
  const store = path.join(fx.home, 'Library', 'pnpm', 'store', 'v11');
  await writeBytes(path.join(store, 'files', 'ab', 'Cookies'), 100);
  const session = await newSession(fx);
  session.cli = { pnpm: { exe: '/opt/pnpm/pnpm', version: '10.0.0', storePath: store, storeDir: path.dirname(store) } };
  await session.startScan();
  // Act
  const candidate = session.ensureCandidate(session.scan.tree.findByPath(store));
  // Assert
  assert.equal(candidate.recipe, 'pnpm-store');
  assert.equal(candidate.risk, 'unassessed');
  await fx.cleanup();
});

// protects: safe needs evidence | fails_when: a name, size or age alone enables selection | no_claim: documentation truth
test('a .next folder is not preselected until the agent supplies local and documentation evidence', async () => {
  // Arrange
  const fx = await makeFixture();
  const session = await scannedSession(fx);
  const id = idFor(session, path.join(fx.project, '.next'));
  const noDocs = { ...safeAssessment(id), evidence: [safeAssessment(id).evidence[0]] };
  // Act
  const detectedOnly = { risk: session.candidates.get(id).risk, selected: session.candidates.get(id).selected };
  await session.assess({ scanId: session.scanId, revision: session.revision, assessments: [noDocs] });
  const withoutDocs = { risk: session.candidates.get(id).risk, selected: session.candidates.get(id).selected };
  await session.assess({ scanId: session.scanId, revision: session.revision, assessments: [safeAssessment(id)] });
  // Assert
  assert.deepEqual(detectedOnly, { risk: 'unassessed', selected: false });
  assert.deepEqual(withoutDocs, { risk: 'review', selected: false });
  assert.equal(session.candidates.get(id).risk, 'safe');
  assert.equal(session.candidates.get(id).selected, true);
  await fx.cleanup();
});

// protects: executor checks gate safe | fails_when: an in-use project is preselected | no_claim: every way a process can hold files
test('a build folder whose project has an open working directory is downgraded to review', async () => {
  // Arrange
  const fx = await makeFixture();
  const { fakeExec } = await import('./helpers.mjs');
  const session = await scannedSession(fx, { exec: fakeExec({ openFiles: [path.join(fx.project, 'src')] }) });
  const id = idFor(session, path.join(fx.project, '.next'));
  // Act
  await session.assess({ scanId: session.scanId, revision: session.revision, assessments: [safeAssessment(id)] });
  // Assert
  assert.equal(session.candidates.get(id).risk, 'review');
  assert.match(session.candidates.get(id).reason, /open file/);
  await fx.cleanup();
});

// protects: manual choices persist | fails_when: reassessment rechecks an unchecked item | no_claim: browser input behavior
test('an item the user unchecked stays unchecked after the agent reassesses it as safe', async () => {
  // Arrange
  const fx = await makeFixture();
  const session = await scannedSession(fx);
  const id = idFor(session, path.join(fx.project, '.next'));
  await session.assess({ scanId: session.scanId, revision: session.revision, assessments: [safeAssessment(id)] });
  session.setSelection({ scanId: session.scanId, revision: session.revision, candidateIds: [id], selected: false });
  // Act
  await session.assess({ scanId: session.scanId, revision: session.revision, assessments: [{ ...safeAssessment(id), reason: 'Still regenerable.' }] });
  // Assert
  assert.equal(session.candidates.get(id).selected, false);
  assert.equal(session.candidates.get(id).userUnchecked, true);
  await fx.cleanup();
});

// protects: a downgrade unchecks and voids consent | fails_when: a downgraded item stays in a pending plan | no_claim: UI timing
test('downgrading a selected safe item unchecks it and invalidates the pending plan', async () => {
  // Arrange
  const fx = await makeFixture();
  const session = await scannedSession(fx);
  const id = idFor(session, path.join(fx.project, '.next'));
  await session.assess({ scanId: session.scanId, revision: session.revision, assessments: [safeAssessment(id)] });
  const plan = await session.createPlan({ scanId: session.scanId, revision: session.revision, candidateIds: [id] }, VIEWER);
  // Act
  await session.assess({ scanId: session.scanId, revision: session.revision, assessments: [{ ...safeAssessment(id), risk: 'review', recipe: 'trash' }] });
  // Assert
  assert.equal(session.candidates.get(id).selected, false);
  await assert.rejects(session.confirmPlan(plan.planId, { manifestHash: plan.manifestHash, nonce: plan.nonce }, VIEWER), { code: 'plan-stale' });
  await fx.cleanup();
});

// protects: no overlapping operations | fails_when: parent and child both enter a plan | no_claim: live filesystem races
test('selecting a folder inside an already selected folder is rejected', async () => {
  // Arrange
  const fx = await makeFixture();
  const session = await scannedSession(fx);
  const parent = idFor(session, path.join(fx.home, 'Movies', 'old-demo'));
  const child = idFor(session, path.join(fx.home, 'Movies', 'old-demo', 'take-1.mov'));
  await session.assess({ scanId: session.scanId, revision: session.revision, assessments: [reviewAssessment(parent), reviewAssessment(child)] });
  await session.decide({ candidateId: parent, revision: session.revision, choice: 'trash' });
  // Act
  const childDecision = await session.decide({ candidateId: child, revision: session.revision, choice: 'trash' });
  // Assert
  assert.equal(childDecision.selected, false);
  assert.match(childDecision.reason, /Overlaps/);
  assert.deepEqual([...session.candidates.values()].filter((candidate) => candidate.selected).map((candidate) => candidate.name), ['old-demo']);
  await fx.cleanup();
});

// protects: review items need a scoped decision | fails_when: an unanswered review item can be selected | no_claim: dialog wording
test('a review item cannot be selected before the user chooses Move to Trash', async () => {
  // Arrange
  const fx = await makeFixture();
  const session = await scannedSession(fx);
  const id = idFor(session, path.join(fx.home, 'Movies', 'old-demo'));
  await session.assess({ scanId: session.scanId, revision: session.revision, assessments: [reviewAssessment(id)] });
  // Act
  const attempt = () => session.setSelection({ scanId: session.scanId, revision: session.revision, candidateIds: [id], selected: true });
  // Assert
  assert.throws(attempt, { code: 'not-eligible' });
  assert.equal(effectiveRisk(session.candidates.get(id), session.policyCtx).risk, 'review');
  await fx.cleanup();
});
