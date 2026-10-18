// Plan confirmation checks and the serialized executor: identity rechecks,
// staged removal, fixed CLI recipes, Trash moves, restore and the journal.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { findEnclosingRepository, subtreeDigest } from './scanner.mjs';
import { protectionReason } from './policy.mjs';
import { buildCommand, checkRecipe, parseCliReport } from './recipes.mjs';
import { SCHEMA_VERSION, appendJsonl, canonicalJson, identityMismatch, identityOf, newId, newSecret, readJsonl, runFixed, secretEquals, sha256 } from './util.mjs';

export const PLAN_TTL_MS = 120_000;

/**
 * Seal a plan: hash the exact manifest and bind a single-use nonce to it.
 *
 * Called by the session when the viewer asks for a Clean Up or restore plan.
 * The hash covers plan ID, viewer session, scan revision and every entry.
 *
 * @example
 * const plan = sealPlan({ scanId, revision, viewerSessionId, epoch, entries });
 * plan.nonce; // returned to the viewer once, never logged
 */
export function sealPlan({ scanId, revision, viewerSessionId, epoch, entries, now = Date.now() }) {
  const id = newId();
  const expiresAtMs = now + PLAN_TTL_MS;
  const manifestHash = sha256(canonicalJson({ id, scanId, revision, viewerSessionId, entries }));
  return { id, scanId, revision, viewerSessionId, epoch, entries, manifestHash, nonce: newSecret(), expiresAtMs, expiresAt: new Date(expiresAtMs).toISOString(), consumed: false };
}

/**
 * Validate a confirmation. Returns null when valid, else `{ status, code }`.
 *
 * Called by the confirm endpoint before any destructive work. Wrong session,
 * expired, stale (selection/assessment/revision changed), mismatched hash,
 * wrong nonce and replay are all rejected.
 */
export function checkConfirmation(plan, input, { viewerSessionId, epoch, revision, now = Date.now() }) {
  if (!plan) return { status: 404, code: 'plan-not-found' };
  if (plan.consumed) return { status: 409, code: 'plan-already-used' };
  if (plan.viewerSessionId !== viewerSessionId) return { status: 403, code: 'wrong-viewer-session' };
  if (now > plan.expiresAtMs) return { status: 409, code: 'plan-expired' };
  if (plan.epoch !== epoch || plan.revision !== revision) return { status: 409, code: 'plan-stale' };
  if (!secretEquals(input.manifestHash, plan.manifestHash)) return { status: 409, code: 'manifest-mismatch' };
  if (!secretEquals(input.nonce, plan.nonce)) return { status: 403, code: 'nonce-mismatch' };
  return null;
}

const exists = async (target) => fsp.lstat(target).then(() => true, (error) => (error.code === 'ENOENT' ? false : true));

/**
 * Check live consent after asynchronous work and before a mutation starts.
 * {@link perform} and {@link moveToTrash} call this at their mutation boundaries.
 *
 * @returns A reason to preserve the target, or null while consent remains valid.
 * @example
 * currentPlanProblem(entry, env); // null or 'The confirmed plan changed.'
 */
function currentPlanProblem(entry, env) {
  if (env.planIsCurrent?.() === false) return 'The confirmed plan changed.';
  return protectionReason({ path: entry.path, kind: entry.identity.kind === 'directory' ? 'dir' : entry.identity.kind, flags: 0, repoRoot: entry.repoRoot }, env.policy);
}

/**
 * Recheck a planned target immediately before acting on it.
 *
 * Verifies canonical ancestors (no links), identity (device/inode/uid/kind/
 * times), ownership, protection rules, and — when the plan recorded one —
 * the metadata digest including protected descendants and other volumes.
 *
 * @returns null when unchanged, else a reason string (target is skipped).
 */
export async function recheckTarget(entry, env) {
  const parent = path.dirname(entry.path);
  try {
    if ((await fsp.realpath(parent)) !== parent) return 'A parent folder is now a link or was moved.';
  } catch {
    return 'The parent folder is missing.';
  }
  let stat;
  try {
    stat = await fsp.lstat(entry.path, { bigint: true });
  } catch (error) {
    return error.code === 'ENOENT' ? 'The target no longer exists.' : `Cannot inspect target (${error.code}).`;
  }
  if (stat.isSymbolicLink()) return 'The target is now a symbolic link.';
  const changed = identityMismatch(entry.identity, identityOf(stat));
  if (changed) return `The target changed since review (${changed}).`;
  if (Number(stat.uid) !== env.uid) return 'The target is not owned by you.';
  const repoRoot = await findEnclosingRepository(entry.path);
  if (repoRoot !== entry.repoRoot) return 'The enclosing repository changed since review.';
  const protection = currentPlanProblem(entry, env);
  if (protection) return protection;
  if (entry.subtreeDigest) {
    const digest = await subtreeDigest(entry.path);
    if (digest.protectedFound) return 'A protected item now exists inside.';
    if (digest.boundaryFound) return 'Another volume is mounted inside.';
    if (digest.digest !== entry.subtreeDigest) return 'Contents changed since review.';
  }
  return null;
}

const outcomeBase = (operationId, entry, startedAt) => ({
  schemaVersion: SCHEMA_VERSION, type: 'outcome', operationId, candidateId: entry.candidateId, path: entry.path, recipe: entry.recipe,
  status: 'failed', evidenceKind: 'none', startedAt, finishedAt: null, reason: '', trashPath: null, recoveryPath: null,
  allocatedBytes: entry.allocatedBytes ?? '0', cliReportedBytes: null, operation: entry.operation,
});

/**
 * Execute one confirmed plan entry with journal-before-mutation ordering.
 *
 * Called sequentially by the session for each entry of a confirmed plan.
 * Never throws: every path ends in a recorded Outcome.
 *
 * @param env - `{ journalFile, uid, trashDir, policy, recipeCtx, fsOps? }`
 *   (`fsOps` lets tests inject rename failures such as EXDEV).
 * @example
 * const outcome = await executeEntry(plan.entries[0], env);
 * outcome.status; // 'succeeded' | 'skipped' | 'failed' | 'unknown'
 */
export async function executeEntry(entry, env) {
  const operationId = newId();
  const startedAt = new Date().toISOString();
  const outcome = outcomeBase(operationId, entry, startedAt);
  const wrapper = entry.operation === 'trash' ? path.join(env.trashDir, `disk-map-${operationId}`) : null;
  await appendJsonl(env.journalFile, { schemaVersion: SCHEMA_VERSION, type: 'intent', operationId, planId: entry.planId, candidateId: entry.candidateId, path: entry.path, recipe: entry.recipe, operation: entry.operation, identity: entry.identity, trashWrapper: wrapper, startedAt });
  try {
    Object.assign(outcome, await perform(entry, env, operationId, wrapper));
  } catch (error) {
    Object.assign(outcome, { status: 'failed', reason: `Unexpected error (${error.code ?? error.message}). Nothing further was attempted.` });
  }
  outcome.finishedAt = new Date().toISOString();
  await appendJsonl(env.journalFile, outcome);
  return outcome;
}

async function perform(entry, env, operationId, wrapper) {
  const ops = { rename: fsp.rename, ...env.fsOps };
  const recheck = await recheckTarget(entry, env);
  if (recheck) return { status: 'skipped', reason: recheck };
  const readiness = await checkRecipe(entry.recipe, { path: entry.path, kind: entry.identity.kind === 'directory' ? 'dir' : entry.identity.kind, repoRoot: entry.repoRoot }, env.recipeCtx);
  if (!readiness.ok) return { status: 'skipped', reason: readiness.reason };
  const changed = currentPlanProblem(entry, env);
  if (changed) return { status: 'skipped', reason: changed };

  if (entry.operation === 'cli') {
    const command = buildCommand(entry.recipe, env.recipeCtx.cli);
    const existed = await exists(entry.path);
    const changed = currentPlanProblem(entry, env);
    if (changed) return { status: 'skipped', reason: changed };
    const result = await (env.recipeCtx.exec ?? runFixed)(command.file, command.args, { timeoutMs: env.cliTimeoutMs ?? 600_000 });
    const stillExists = await exists(entry.path);
    const cliReportedBytes = parseCliReport(entry.recipe, `${result.stdout}\n${result.stderr}`);
    const evidenceKind = existed && !stillExists ? 'observed-missing' : 'cli-report';
    if (result.timedOut) return { status: 'unknown', evidenceKind, cliReportedBytes, reason: 'The tool timed out; its effect is unknown.' };
    if (result.code !== 0) return { status: 'failed', evidenceKind, cliReportedBytes, reason: `The tool exited with code ${result.code ?? result.spawnError}.` };
    return { status: 'succeeded', evidenceKind, cliReportedBytes, reason: 'The tool reported success.' };
  }

  if (entry.operation === 'trash') return moveToTrash(entry, env, ops, wrapper);

  // Permanent removal: stage into an exclusive sibling, validate, then remove.
  const staging = await fsp.mkdtemp(path.join(path.dirname(entry.path), '.disk-map-staging-'));
  const staged = path.join(staging, path.basename(entry.path));
  await appendJsonl(env.journalFile, { schemaVersion: SCHEMA_VERSION, type: 'staging', operationId, stagingPath: staging });
  const beforeMove = currentPlanProblem(entry, env);
  if (beforeMove) {
    await fsp.rmdir(staging).catch(() => {});
    return { status: 'skipped', reason: beforeMove };
  }
  try {
    await ops.rename(entry.path, staged);
  } catch (error) {
    await fsp.rmdir(staging).catch(() => {});
    return { status: 'failed', reason: `Could not stage the folder (${error.code}). Nothing was deleted.` };
  }
  const moved = identityOf(await fsp.lstat(staged, { bigint: true }));
  const after = entry.subtreeDigest ? await subtreeDigest(staged) : null;
  const beforeRemoval = currentPlanProblem(entry, env);
  if (beforeRemoval) return { status: 'failed', recoveryPath: staged, reason: `${beforeRemoval} Staged data was preserved for recovery.` };
  if (identityMismatch(entry.identity, moved, ['device', 'inode', 'kind']) || (after && after.digest !== entry.subtreeDigest)) {
    return { status: 'failed', recoveryPath: staged, reason: 'The staged item differs from the reviewed item. It was kept for recovery and not deleted.' };
  }
  try {
    await fsp.rm(staging, { recursive: true });
  } catch (error) {
    return { status: 'failed', recoveryPath: staging, reason: `Removal stopped part-way (${error.code}). The remainder is kept for inspection.` };
  }
  return { status: 'succeeded', evidenceKind: 'filesystem-operation', reason: 'Removed after identity and contents were rechecked.' };
}

async function moveToTrash(entry, env, ops, wrapper) {
  let trashStat;
  try {
    trashStat = await fsp.lstat(env.trashDir, { bigint: true });
  } catch (error) {
    return { status: 'failed', reason: `Trash is not available (${error.code}). Nothing was moved.` };
  }
  if (!trashStat.isDirectory() || trashStat.isSymbolicLink() || Number(trashStat.uid) !== env.uid) {
    return { status: 'failed', reason: 'The Trash path is unsafe. Nothing was moved.' };
  }
  if (String(trashStat.dev) !== entry.identity.device) {
    return { status: 'failed', reason: 'The item is on another volume than your Trash. disk-map never copies and deletes; nothing was moved.' };
  }
  try {
    await fsp.mkdir(wrapper, { mode: 0o700 });
  } catch (error) {
    return { status: 'failed', reason: `Could not create a Trash folder (${error.code}). Nothing was moved.` };
  }
  const destination = path.join(wrapper, path.basename(entry.path));
  const changed = currentPlanProblem(entry, env);
  if (changed) {
    await fsp.rmdir(wrapper).catch(() => {});
    return { status: 'skipped', reason: changed };
  }
  try {
    await ops.rename(entry.path, destination);
  } catch (error) {
    await fsp.rmdir(wrapper).catch(() => {});
    return { status: 'failed', reason: `Move to Trash failed (${error.code}). Nothing was deleted or copied.` };
  }
  const moved = identityOf(await fsp.lstat(destination, { bigint: true }));
  if (identityMismatch(entry.identity, moved, ['device', 'inode', 'kind'])) {
    return { status: 'failed', trashPath: destination, reason: 'The moved item differs from the reviewed item. It stays in the Trash for inspection.' };
  }
  return { status: 'succeeded', evidenceKind: 'filesystem-operation', trashPath: destination, movedIdentity: moved, reason: 'Moved to the Trash. Space is not freed until the Trash is emptied.' };
}

/**
 * Restore a trashed item without overwriting anything.
 *
 * Called for a confirmed restore entry. `original` refuses an occupied path;
 * `sibling` uses the server-chosen `<basename>.restored-<uuid>` path.
 * Files use link+unlink (EEXIST-safe); directories use an exclusive mkdir
 * followed by rename onto that empty placeholder (ENOTEMPTY-safe).
 */
export async function restoreEntry(entry, env) {
  const operationId = newId();
  const startedAt = new Date().toISOString();
  const outcome = { ...outcomeBase(operationId, { ...entry, recipe: 'trash', operation: 'restore' }, startedAt), restoreOf: entry.operationId, path: entry.destinationPath, trashPath: entry.trashPath };
  await appendJsonl(env.journalFile, { schemaVersion: SCHEMA_VERSION, type: 'intent', operationId, operation: 'restore', restoreOf: entry.operationId, source: entry.trashPath, destination: entry.destinationPath, startedAt });
  const result = await (async () => {
    let stat;
    try {
      stat = await fsp.lstat(entry.trashPath, { bigint: true });
    } catch {
      return { status: 'failed', reason: 'The item is no longer in the Trash.' };
    }
    if (identityMismatch(entry.identity, identityOf(stat), ['device', 'inode', 'kind'])) return { status: 'skipped', reason: 'The Trash item changed; it was left in place.' };
    const parent = path.dirname(entry.destinationPath);
    if ((await fsp.realpath(parent).catch(() => null)) !== parent) return { status: 'skipped', reason: 'The destination folder is missing or is a link.' };
    if (env.planIsCurrent?.() === false) return { status: 'skipped', reason: 'The confirmed restore plan changed.' };
    try {
      if (stat.isDirectory()) {
        await fsp.mkdir(entry.destinationPath);
        if (env.planIsCurrent?.() === false) {
          await fsp.rmdir(entry.destinationPath).catch(() => {});
          return { status: 'skipped', reason: 'The confirmed restore plan changed.' };
        }
        try {
          await fsp.rename(entry.trashPath, entry.destinationPath);
        } catch (error) {
          await fsp.rmdir(entry.destinationPath).catch(() => {});
          throw error;
        }
      } else {
        await fsp.link(entry.trashPath, entry.destinationPath);
        await fsp.unlink(entry.trashPath);
      }
    } catch (error) {
      if (error.code === 'EEXIST' || error.code === 'ENOTEMPTY') return { status: 'skipped', reason: 'The destination is occupied. Nothing was overwritten.' };
      return { status: 'failed', reason: `Restore failed (${error.code}). The item stays in the Trash.` };
    }
    const restored = identityOf(await fsp.lstat(entry.destinationPath, { bigint: true }));
    if (restored.inode !== entry.identity.inode) return { status: 'unknown', reason: 'Restored item identity could not be confirmed.' };
    await fsp.rmdir(path.dirname(entry.trashPath)).catch(() => {});
    return { status: 'succeeded', evidenceKind: 'filesystem-operation', trashPath: null, reason: 'Restored.' };
  })();
  Object.assign(outcome, result, { finishedAt: new Date().toISOString() });
  await appendJsonl(env.journalFile, outcome);
  return outcome;
}

/**
 * Close intents that have no recorded outcome after a crash. Never replays.
 *
 * Called by `start` for every earlier run in the state directory. Each open
 * intent gets an `interrupted` (source still present) or `unknown` outcome,
 * with any staging or Trash wrapper reported as the recovery location.
 *
 * @returns The outcomes appended.
 */
export async function reconcileJournal(journalFile) {
  const records = await readJsonl(journalFile);
  const finished = new Set(records.filter((record) => record.type === 'outcome').map((record) => record.operationId));
  const staging = new Map(records.filter((record) => record.type === 'staging').map((record) => [record.operationId, record.stagingPath]));
  const appended = [];
  for (const intent of records.filter((record) => record.type === 'intent' && !finished.has(record.operationId))) {
    const target = intent.path ?? intent.destination;
    const sourcePresent = target ? await exists(target) : false;
    const recovery = staging.get(intent.operationId) ?? intent.trashWrapper ?? null;
    const recoveryPresent = recovery ? await exists(recovery) : false;
    const outcome = {
      schemaVersion: SCHEMA_VERSION, type: 'outcome', operationId: intent.operationId, candidateId: intent.candidateId ?? null, path: target ?? null,
      recipe: intent.recipe ?? 'trash', operation: intent.operation, status: sourcePresent && !recoveryPresent ? 'interrupted' : 'unknown', evidenceKind: 'none',
      startedAt: intent.startedAt, finishedAt: new Date().toISOString(), trashPath: null, recoveryPath: recoveryPresent ? recovery : null,
      reason: `The runtime stopped before recording a result. It was not replayed. Source present: ${sourcePresent ? 'yes' : 'no'}.`,
    };
    await appendJsonl(journalFile, outcome);
    appended.push(outcome);
  }
  return appended;
}

