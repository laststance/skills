// Authoritative server-side state for one disk-map run: scan revisions,
// candidates, selections, chat, plans, execution and reports.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { HttpError, LEASE_MS, Mailbox, validateAssessment } from './bridge.mjs';
import { checkConfirmation, executeEntry, restoreEntry, sealPlan } from './cleanup.mjs';
import { categoryFor, effectiveRisk, eligibleAction, findOverlap, protectionReason, reconcileSelection } from './policy.mjs';
import { GOOGLE_UPDATER_CACHES, appCacheLeaf, checkRecipe, commandText, detectRecipe, operationOf, recipeDocs, resolveCli } from './recipes.mjs';
import { spaceMetrics as metricsImpl, writeReports } from './report.mjs';
import { createScan, subtreeDigest, volumeInfo } from './scanner.mjs';
import { formatBytes } from '../../assets/treemap.mjs';
import { identityMismatch, identityOf, newId, runFixed, sumBytes, writePrivateJson } from './util.mjs';

const MAP_PREVIEW = 40;
const PAGE = 300;

/**
 * One live disk-map session. The HTTP bridge maps routes onto its methods.
 *
 * Created by `disk-map.mjs serve`; tests construct it directly with a
 * disposable root, home and Trash.
 *
 * @example
 * const session = new Session({ runDir, root: '/tmp/fixture', home: '/tmp/fixture', trashDir: '/tmp/trash' });
 * await session.startScan();
 */
export class Session {
  constructor(config) {
    this.config = { locale: 'en', fileNodeThreshold: 1024 * 1024, aliases: new Map(), uid: process.getuid(), ...config };
    this.scanId = newId();
    this.revision = 0;
    this.seq = 0;
    this.epoch = 0;
    this.phase = 'starting';
    this.progress = null;
    this.scan = null;
    this.volume = null;
    this.cli = null;
    this.candidates = new Map();
    this.chat = [];
    this.plans = new Map();
    this.outcomes = [...(config.priorOutcomes ?? [])];
    this.metrics = null;
    this.reports = null;
    this.ended = false;
    this.stopping = false;
    this.running = null;
    this.agent = { leaseUntil: 0, lastSeenAt: null, everConnected: false, connected: false };
    this.journalFile = path.join(config.runDir, 'journal.jsonl');
    this.mailbox = new Mailbox({ file: path.join(config.runDir, 'mailbox.jsonl'), onChange: () => this.bump() });
    this.policyCtx = { home: this.config.home, stateDir: this.config.stateDir, skillDir: this.config.skillDir, cli: null };
    const exec = this.config.exec ?? runFixed;
    this.recipeCtx = { home: this.config.home, uid: this.config.uid, exec, cli: null };
    this.cachedRecipeCtx = { ...this.recipeCtx, exec: cachedExec(exec) };
    this.timer = setInterval(() => this.tick(), 1000);
    this.timer.unref?.();
  }

  log(line) {
    process.stderr.write(`[disk-map ${new Date().toISOString()}] ${line}\n`);
  }

  bump() {
    this.seq += 1;
  }

  // ---------------------------------------------------------------- agent lease

  touchAgent() {
    const now = Date.now();
    this.agent.leaseUntil = now + LEASE_MS;
    this.agent.lastSeenAt = new Date(now).toISOString();
    this.agent.everConnected = true;
    if (!this.agent.connected) {
      this.agent.connected = true;
      this.bump();
    }
  }

  tick() {
    const connected = Date.now() < this.agent.leaseUntil;
    if (connected !== this.agent.connected) {
      this.agent.connected = connected;
      this.bump();
    }
  }

  agentStatus() {
    return { connected: this.agent.connected, everConnected: this.agent.everConnected, lastSeenAt: this.agent.lastSeenAt, leaseExpiresAt: this.agent.leaseUntil ? new Date(this.agent.leaseUntil).toISOString() : null, mailbox: this.mailbox.counts() };
  }

  async nextEvent(timeoutMs) {
    const event = await this.mailbox.next(timeoutMs);
    this.touchAgent();
    if (event) return { type: 'event', ...event };
    return this.ended ? { type: 'session-ended', message: 'The user ended this session in the viewer. Run `stop`.' } : { type: 'idle' };
  }

  heartbeat() {
    this.mailbox.renew();
    return { ok: true, ...this.agentStatus() };
  }

  agentSummary() {
    return { scanId: this.scanId, revision: this.revision, phase: this.phase, ended: this.ended, progress: this.progress, agent: this.agentStatus(), summary: this.summary() };
  }

  // ---------------------------------------------------------------- scanning

  /**
   * Run (or re-run) the read-only scan as a new revision, carry unchanged
   * candidates forward, then post a `scan-complete` event for the agent.
   */
  async startScan() {
    const previous = this.scan ? [...this.candidates.values()] : [];
    if (this.scan) this.revision += 1;
    this.epoch += 1;
    this.candidates = new Map();
    this.phase = 'scanning';
    this.progress = null;
    this.volume = await volumeInfo(this.config.root).catch(() => null);
    const recordsFile = path.join(this.config.runDir, `scan-r${this.revision}.jsonl`);
    let buffer = [];
    const flush = async () => {
      if (!buffer.length) return;
      const lines = buffer.map((record) => JSON.stringify(record)).join('\n');
      buffer = [];
      await fsp.appendFile(recordsFile, `${lines}\n`, { mode: 0o600 });
    };
    const flusher = setInterval(() => flush().catch(() => {}), 500);
    this.scan = createScan({
      root: this.config.root,
      aliases: this.config.aliases,
      fileNodeThreshold: this.config.fileNodeThreshold,
      onProgress: (progress) => {
        this.progress = progress;
        this.bump();
      },
      onDirectory: (record) => buffer.push(record),
    });
    this.bump();
    const result = await this.scan.run();
    clearInterval(flusher);
    await flush();
    this.volume = await volumeInfo(this.config.root).catch(() => this.volume);
    this.cli ??= await resolveCli({ home: this.config.home, exec: this.recipeCtx.exec }).catch(() => ({}));
    this.policyCtx.cli = this.cli;
    this.recipeCtx.cli = this.cli;
    this.cachedRecipeCtx.cli = this.cli;
    this.phase = result.cancelled ? 'cancelled' : 'complete';
    const changed = this.discoverCandidates(previous);
    this.bump();
    if (!this.stopping) {
      await this.mailbox.post('scan-complete', this.scanBrief(changed));
    }
    return result;
  }

  async rescan({ scanId }) {
    this.assertLive();
    if (scanId !== this.scanId) throw new HttpError(409, 'stale-scan', 'Unknown scan.');
    if (this.phase === 'scanning' || this.running) throw new HttpError(409, 'busy', 'A scan or cleanup is running.');
    this.startScan().catch((error) => this.log(`rescan failed: ${error.stack}`));
    return { started: true, revision: this.revision + 1 };
  }

  /** Create candidates for recipe matches and carry unchanged earlier ones. */
  discoverCandidates(previous) {
    const tree = this.scan.tree;
    const home = this.config.home;
    const exact = new Set([...GOOGLE_UPDATER_CACHES.map((rel) => path.join(home, rel))]);
    const changed = [];
    // Carry earlier candidates whose identity is unchanged; others need reassessment.
    for (const old of previous) {
      const index = tree.findByPath(old.path);
      if (index === undefined) continue;
      const node = tree.nodes[index];
      const same = !identityMismatch(old.identity, nodeIdentity(node)) && String(node.alloc) === old.allocatedBytes;
      tree.assignId(index, old.id);
      const candidate = this.ensureCandidate(index);
      if (same && old.assessment) {
        candidate.assessment = old.assessment;
        candidate.readiness = old.readiness;
        candidate.userUnchecked = old.userUnchecked;
        candidate.selected = old.selected && old.risk === 'safe';
        this.evaluate(candidate);
      } else if (old.assessment) {
        changed.push(candidate.id);
      }
    }
    for (let index = 1; index < tree.nodes.length; index += 1) {
      const node = tree.nodes[index];
      if (node.kind !== 'dir' || node.boundary) continue;
      const parentName = tree.nodes[node.parent].name;
      const quick = node.name === '.next' || node.name === '.turbo' || parentName === 'DerivedData' || parentName === 'Caches'
        || node.name === '_cacache' || /Cache|^v\d+$|^uv$/.test(node.name) || node.name.startsWith('com.');
      if (!quick) continue;
      const target = tree.pathOf(index);
      if (detectRecipe(target, node, { home, cli: this.cli }) || exact.has(target)) this.ensureCandidate(index);
    }
    return changed;
  }

  scanBrief(changed) {
    const tree = this.scan.tree;
    const largest = [];
    const home = this.config.home;
    const floor = Math.min(50 * 1024 * 1024, tree.nodes[0].alloc / 100);
    // Largest folders under home (depth-limited) for the agent to consider.
    for (let index = 0; index < tree.nodes.length; index += 1) {
      const node = tree.nodes[index];
      if (node.kind === 'symlink' || node.alloc < floor) continue;
      const target = tree.pathOf(index);
      if (!target.startsWith(`${home}/`) || target.split('/').length - home.split('/').length > 4) continue;
      largest.push({ index, alloc: node.alloc, target });
    }
    largest.sort((a, b) => b.alloc - a.alloc);
    return {
      scanId: this.scanId,
      revision: this.revision,
      root: this.displayRoot(),
      phase: this.phase,
      volume: this.volume,
      coverage: this.coverage(),
      candidates: [...this.candidates.values()].map((candidate) => this.candidateContext(candidate)),
      largest: largest.slice(0, 40).map(({ index, alloc, target }) => ({ candidateId: tree.idOf(index), path: target, allocatedBytes: String(alloc), category: categoryFor(target, home) })),
      changedCandidateIds: changed,
      instructions: 'Assess candidates with `assess`. Safe requires a recipe, local + documentation evidence and consequences. Unknown ownership → review with a question. Never assess by name, size or age alone.',
    };
  }

  // ---------------------------------------------------------------- candidates

  /** Create (once) the candidate record for a tree node; the ID is the node UUID. */
  ensureCandidate(index) {
    const tree = this.scan.tree;
    const id = tree.idOf(index);
    const existing = this.candidates.get(id);
    if (existing) return existing;
    const node = tree.nodes[index];
    const target = tree.pathOf(index);
    const repoIndex = tree.repoRootOf(index);
    const kind = node.kind === 'dir' ? 'dir' : node.kind;
    const candidate = {
      id,
      scanId: this.scanId,
      revision: this.revision,
      path: target,
      name: node.name,
      kind,
      nodeIndex: index,
      allocatedBytes: String(node.alloc),
      logicalBytes: String(node.logical),
      reclaimableBytes: null,
      identity: nodeIdentity(node),
      subtreeDigest: null,
      complete: node.kind === 'dir' ? node.complete : node.boundary === null,
      flags: node.flags,
      repoRoot: repoIndex >= 0 ? tree.pathOf(repoIndex) : null,
      recipe: detectRecipe(target, node, { home: this.config.home, cli: this.cli }),
      category: categoryFor(target, this.config.home),
      assessment: null,
      readiness: null,
      decision: null,
      selected: false,
      userUnchecked: false,
      risk: 'unassessed',
      reason: '',
      purpose: appCacheLeaf(target, this.config.home) ? `${appCacheLeaf(target, this.config.home).app} cache` : '',
      consequences: [],
      evidence: [],
      question: null,
    };
    candidate.protection = protectionReason(candidate, this.policyCtx);
    this.candidates.set(id, candidate);
    this.evaluate(candidate);
    return candidate;
  }

  /** Recompute risk + selection; invalidates pending plans on any change. */
  evaluate(candidate) {
    const previousRisk = candidate.risk;
    const { risk, reason } = effectiveRisk(candidate, this.policyCtx);
    candidate.risk = risk;
    candidate.reason = reason;
    const others = [...this.candidates.values()].filter((other) => other.selected && other.id !== candidate.id);
    const selectionChanged = reconcileSelection(candidate, previousRisk, others);
    if (selectionChanged || previousRisk !== risk) this.invalidatePlans();
  }

  invalidatePlans() {
    this.epoch += 1;
  }

  candidateContext(candidate) {
    return {
      candidateId: candidate.id, path: candidate.path, kind: candidate.kind, allocatedBytes: candidate.allocatedBytes, logicalBytes: candidate.logicalBytes,
      complete: candidate.complete, risk: candidate.risk, reason: candidate.reason, recipe: candidate.assessment?.recipe ?? candidate.recipe,
      detectedRecipe: candidate.recipe, protected: Boolean(candidate.protection), repoRoot: candidate.repoRoot, revision: candidate.revision,
      purpose: candidate.purpose, question: candidate.question,
    };
  }

  /**
   * Apply agent assessments for the current revision. Safe proposals run the
   * executor readiness checks before they can be preselected.
   */
  async assess(body) {
    this.assertLive();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'invalid-body', 'Body must be a JSON object.');
    const allowed = new Set(['scanId', 'revision', 'messageId', 'assessments']);
    for (const key of Object.keys(body)) if (!allowed.has(key)) throw new HttpError(400, 'unknown-field', `Unknown field "${key.slice(0, 40)}".`);
    if (body.scanId !== this.scanId || body.revision !== this.revision) throw new HttpError(409, 'stale-revision', `Current scan revision is ${this.revision}.`, { revision: this.revision });
    if (!Array.isArray(body.assessments) || body.assessments.length === 0 || body.assessments.length > 500) throw new HttpError(400, 'invalid-field', 'assessments must be a non-empty array (max 500).');
    if (this.phase === 'scanning') throw new HttpError(409, 'scan-running', 'Wait for the scan to finish.');
    const items = body.assessments.map(validateAssessment);
    const results = [];
    for (const item of items) {
      const index = this.scan.tree.indexOf(item.candidateId);
      if (index === undefined) {
        results.push({ candidateId: item.candidateId, status: 'unknown-candidate' });
        continue;
      }
      const candidate = this.ensureCandidate(index);
      candidate.assessment = { ...item, assessedAt: new Date().toISOString(), revision: this.revision };
      candidate.purpose = item.purpose;
      candidate.consequences = item.consequences;
      candidate.question = item.question;
      candidate.evidence = item.evidence;
      const recipe = item.recipe ?? (item.risk === 'review' ? 'trash' : null);
      const operation = recipe ? operationOf(recipe) : null;
      candidate.reclaimableBytes = item.reclaimableBytes ?? (operation === 'remove' ? candidate.allocatedBytes : operation === 'trash' ? '0' : null);
      candidate.readiness = item.risk === 'safe' && item.recipe && item.recipe !== 'trash' ? await checkRecipe(item.recipe, candidate, this.cachedRecipeCtx) : null;
      this.evaluate(candidate);
      results.push({ candidateId: candidate.id, status: 'applied', risk: candidate.risk, reason: candidate.reason, selected: candidate.selected });
    }
    if (body.messageId) await this.mailbox.answer(body.messageId);
    this.bump();
    return { revision: this.revision, results };
  }

  async respond({ messageId, revision, text, candidateIds = [] }) {
    const message = this.mailbox.get(messageId);
    const status = await this.mailbox.answer(messageId);
    if (status === 'unknown') throw new HttpError(404, 'unknown-message', 'No such message.');
    if (status === 'not-delivered') throw new HttpError(409, 'not-delivered', 'Message was not delivered to the agent yet.');
    if (status === 'duplicate') return { ok: true, duplicate: true };
    const asked = this.chat.find((entry) => entry.id === messageId);
    if (asked) asked.status = 'answered';
    const stale = revision !== this.revision || (message.payload?.revision !== undefined && message.payload.revision !== revision);
    this.chat.push({ id: newId(), role: 'agent', text, candidateIds, replyTo: messageId, revision, stale, createdAt: new Date().toISOString() });
    this.bump();
    return { ok: true, duplicate: false, stale };
  }

  // ---------------------------------------------------------------- viewer actions

  assertLive() {
    if (this.ended || this.stopping) throw new HttpError(409, 'session-ended', 'This session has ended.');
  }

  assertRevision(scanId, revision) {
    if (scanId !== this.scanId || revision !== this.revision) throw new HttpError(409, 'stale-revision', 'The scan changed. Reload the current state.');
  }

  async postChat({ scanId, candidateIds, text }) {
    this.assertLive();
    if (scanId !== this.scanId) throw new HttpError(409, 'stale-scan', 'Unknown scan.');
    if (!this.scan) throw new HttpError(409, 'scan-running', 'The scan has not started yet.');
    const candidates = candidateIds.map((id) => {
      const index = this.scan.tree.indexOf(id);
      if (index === undefined) throw new HttpError(409, 'unknown-candidate', 'Selection is no longer in this scan.');
      return this.ensureCandidate(index);
    });
    const message = await this.mailbox.post('chat', { scanId, revision: this.revision, text, candidates: candidates.map((candidate) => this.candidateContext(candidate)) });
    this.chat.push({ id: message.id, role: 'user', text, candidateIds, revision: this.revision, status: 'pending', createdAt: message.createdAt });
    this.bump();
    return { id: message.id };
  }

  setSelection({ scanId, revision, candidateIds, selected }) {
    this.assertLive();
    this.assertRevision(scanId, revision);
    const items = candidateIds.map((id) => {
      const candidate = this.candidates.get(id);
      if (!candidate) throw new HttpError(404, 'unknown-candidate', 'Unknown candidate.');
      return candidate;
    });
    if (selected) {
      const chosen = [];
      for (const candidate of items) {
        if (!eligibleAction(candidate)) throw new HttpError(409, 'not-eligible', `${candidate.name} cannot be selected (${candidate.risk}).`);
        const others = [...this.candidates.values()].filter((other) => other.selected && other.id !== candidate.id);
        if (findOverlap(candidate.path, [...others, ...chosen])) throw new HttpError(409, 'overlap', `${candidate.name} overlaps another selected item.`);
        chosen.push(candidate);
      }
    }
    for (const candidate of items) {
      candidate.selected = selected;
      candidate.userUnchecked = !selected;
    }
    this.invalidatePlans();
    this.bump();
    return { ok: true, epoch: this.epoch };
  }

  async decide({ candidateId, revision, choice }) {
    this.assertLive();
    const candidate = this.candidates.get(candidateId);
    if (!candidate) throw new HttpError(404, 'unknown-candidate', 'Unknown candidate.');
    if (revision !== this.revision || candidate.revision !== revision) throw new HttpError(409, 'stale-revision', 'The scan changed. Review this item again.');
    if (candidate.risk !== 'review') throw new HttpError(409, 'not-review', 'Only review-required items take a decision.');
    candidate.decision = { choice, revision, decidedAt: new Date().toISOString() };
    let result = { ok: true, choice, selected: false };
    if (choice === 'trash') {
      const readiness = await checkRecipe('trash', candidate, this.cachedRecipeCtx);
      const others = [...this.candidates.values()].filter((other) => other.selected && other.id !== candidate.id);
      const overlap = findOverlap(candidate.path, others);
      if (!readiness.ok || overlap) {
        candidate.decision = null;
        result = { ok: false, choice, selected: false, reason: readiness.ok ? `Overlaps selected item ${overlap.name}.` : readiness.reason };
      } else {
        candidate.selected = true;
        candidate.userUnchecked = false;
        result.selected = true;
      }
    } else {
      candidate.selected = false;
    }
    if (choice === 'investigate') {
      const message = await this.mailbox.post('investigate', { scanId: this.scanId, revision: this.revision, candidates: [this.candidateContext(candidate)], text: `Investigate further: ${candidate.question ?? candidate.path}` });
      this.chat.push({ id: message.id, role: 'user', text: `Investigate further: ${candidate.name}`, candidateIds: [candidate.id], revision: this.revision, status: 'pending', createdAt: message.createdAt });
    }
    this.invalidatePlans();
    this.bump();
    return result;
  }

  /**
   * Build the exact manifest for the selected candidates, recheck identities,
   * compute metadata digests, and seal it with a single-use nonce.
   */
  async createPlan({ scanId, revision, candidateIds }, viewer) {
    this.assertLive();
    this.assertRevision(scanId, revision);
    if (this.phase !== 'complete') throw new HttpError(409, 'scan-not-complete', 'Cleanup needs a complete scan.');
    if (this.running) throw new HttpError(409, 'cleanup-running', 'A cleanup is already running.');
    if (!this.agent.connected) throw new HttpError(409, 'agent-disconnected', 'The agent is disconnected. New cleanup plans are paused until it reconnects.');
    if (!candidateIds.length) throw new HttpError(400, 'empty-plan', 'Select at least one item.');
    const items = candidateIds.map((id) => this.candidates.get(id));
    if (items.some((candidate) => !candidate || !candidate.selected || !eligibleAction(candidate))) throw new HttpError(409, 'not-eligible', 'The plan contains an item that is not selected or not eligible.');
    for (const [position, candidate] of items.entries()) {
      if (findOverlap(candidate.path, items.filter((_, other) => other !== position))) throw new HttpError(409, 'overlap', 'Parent and child items cannot both be cleaned.');
    }
    const conflicts = [];
    const ready = [];
    for (const candidate of items) {
      let current;
      try {
        current = identityOf(await fsp.lstat(candidate.path, { bigint: true }));
      } catch {
        current = null;
      }
      const action = eligibleAction(candidate);
      const operation = action === 'trash' ? 'trash' : operationOf(candidate.assessment.recipe);
      let digest = null;
      let problem = !current ? 'The item no longer exists.' : identityMismatch(candidate.identity, current) ? 'The item changed since the scan. Rescan and review again.' : null;
      if (!problem && operation !== 'cli') {
        try {
          digest = await subtreeDigest(candidate.path);
          if (digest.protectedFound) problem = 'A protected item exists inside.';
          if (digest.boundaryFound) problem = 'Another volume is mounted inside.';
        } catch (error) {
          problem = `Contents could not be verified (${error.code}).`;
        }
      }
      if (problem) {
        conflicts.push({ candidateId: candidate.id, path: candidate.path, reason: problem });
        candidate.selected = false;
        candidate.decision = null;
        continue;
      }
      ready.push({ candidate, operation, digest });
    }
    if (conflicts.length) this.invalidatePlans();
    if (!ready.length) {
      this.bump();
      throw new HttpError(409, 'nothing-to-clean', 'No selected item passed the checks.', { conflicts });
    }
    const entries = ready.map(({ candidate, operation, digest }) => {
      const recipe = operation === 'trash' ? 'trash' : candidate.assessment.recipe;
      const excluded = [...this.candidates.values()].filter((other) => other.id !== candidate.id && other.path.startsWith(`${candidate.path}/`) && other.risk === 'protected').length;
      return {
        action: 'clean', candidateId: candidate.id, recipe, identity: candidate.identity, path: candidate.path, operation,
        subtreeDigest: digest?.digest ?? null, entries: digest?.entries ?? null, allocatedBytes: candidate.allocatedBytes, reclaimableBytes: candidate.reclaimableBytes,
        reason: candidate.reason, consequences: candidate.consequences, irreversible: operation !== 'trash', repoRoot: candidate.repoRoot,
        command: operation === 'cli' ? commandText(recipe, this.cli) : null, excludedProtected: excluded,
      };
    });
    const plan = sealPlan({ scanId, revision, viewerSessionId: viewer.id, epoch: this.epoch, entries });
    this.plans.set(plan.id, plan);
    this.bump();
    return { planId: plan.id, manifestHash: plan.manifestHash, nonce: plan.nonce, expiresAt: plan.expiresAt, entries, conflicts, totals: { representedBytes: sumBytes(entries.map((entry) => entry.allocatedBytes)), irreversible: entries.filter((entry) => entry.irreversible).length } };
  }

  async confirmPlan(planId, { manifestHash, nonce }, viewer) {
    this.assertLive();
    const plan = this.plans.get(planId);
    const failure = checkConfirmation(plan, { manifestHash, nonce }, { viewerSessionId: viewer.id, epoch: this.epoch, revision: this.revision });
    if (failure) throw new HttpError(failure.status, failure.code, 'Confirmation rejected. Nothing was changed.');
    if (this.running) throw new HttpError(409, 'cleanup-running', 'A cleanup is already running.');
    plan.consumed = true;
    this.running = this.executePlan(plan).catch((error) => this.log(`plan failed: ${error.stack}`)).finally(() => {
      this.running = null;
      this.bump();
    });
    this.bump();
    return { started: true, planId };
  }

  /** Execute a confirmed plan sequentially, then measure and report. */
  async executePlan(plan) {
    this.phase = 'cleaning';
    this.bump();
    const before = await volumeInfo(this.config.root).catch(() => null);
    const env = { journalFile: this.journalFile, uid: this.config.uid, trashDir: this.config.trashDir, policy: this.policyCtx, recipeCtx: this.recipeCtx, fsOps: this.config.fsOps, cliTimeoutMs: this.config.cliTimeoutMs };
    const results = [];
    for (const entry of plan.entries) {
      const outcome = this.stopping
        ? { operationId: newId(), candidateId: entry.candidateId ?? null, path: entry.path, recipe: entry.recipe, operation: entry.operation ?? 'restore', status: 'skipped', evidenceKind: 'none', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), reason: 'The session stopped before this item.', trashPath: null, recoveryPath: null, allocatedBytes: entry.allocatedBytes ?? '0', cliReportedBytes: null }
        : entry.action === 'restore' ? await restoreEntry(entry, env) : await executeEntry({ ...entry, planId: plan.id }, env);
      results.push(outcome);
      this.outcomes.push(outcome);
      if (entry.action === 'restore' && outcome.status === 'succeeded') {
        const original = this.outcomes.find((item) => item.operationId === entry.operationId);
        if (original) original.restored = true;
      }
      this.bump();
    }
    const after = await volumeInfo(this.config.root).catch(() => null);
    this.volume = after ?? this.volume;
    if (plan.entries.some((entry) => entry.action === 'clean')) {
      this.metrics = { planId: plan.id, ...spaceMetricsFor(plan.entries, results, before, after) };
    }
    this.applyOutcomes(results);
    this.reports = await this.writeAllReports().catch((error) => {
      this.log(`report failed: ${error.stack}`);
      return null;
    });
    this.phase = 'complete';
    this.bump();
    return results;
  }

  /** Reflect finished operations in the tree as a new revision (affected regions only). */
  applyOutcomes(results) {
    const tree = this.scan.tree;
    for (const outcome of results) {
      if (outcome.status !== 'succeeded' || outcome.operation === 'restore') continue;
      const candidate = this.candidates.get(outcome.candidateId);
      if (!candidate) continue;
      const index = candidate.nodeIndex;
      const node = tree.nodes[index];
      const gone = outcome.evidenceKind === 'filesystem-operation' || outcome.evidenceKind === 'observed-missing';
      if (gone) {
        for (const ancestor of tree.ancestors(index)) {
          tree.nodes[ancestor].alloc -= node.alloc;
          tree.nodes[ancestor].logical -= node.logical;
        }
        const parent = tree.nodes[node.parent];
        parent.children = parent.children.filter((child) => child !== index);
        this.candidates.delete(candidate.id);
      }
    }
    this.revision += 1;
    this.invalidatePlans();
    for (const candidate of this.candidates.values()) {
      candidate.revision = this.revision;
      const node = tree.nodes[candidate.nodeIndex];
      candidate.allocatedBytes = String(node.alloc);
      candidate.logicalBytes = String(node.logical);
      if (candidate.selected && !eligibleAction(candidate)) candidate.selected = false;
    }
  }

  async createRestore({ operationId, destinationMode }, viewer) {
    this.assertLive();
    if (this.running) throw new HttpError(409, 'cleanup-running', 'A cleanup is already running.');
    const outcome = this.outcomes.find((item) => item.operationId === operationId && item.operation === 'trash' && item.status === 'succeeded' && item.trashPath && !item.restored);
    if (!outcome) throw new HttpError(404, 'not-restorable', 'No restorable Trash move with that ID.');
    const destinationPath = destinationMode === 'original' ? outcome.path : `${outcome.path}.restored-${newId()}`;
    const occupied = await fsp.lstat(destinationPath).then(() => true, () => false);
    if (occupied) throw new HttpError(409, 'destination-occupied', 'The original location is occupied. Restore beside it instead.', { suggestion: 'sibling' });
    let identity;
    try {
      identity = identityOf(await fsp.lstat(outcome.trashPath, { bigint: true }));
    } catch {
      throw new HttpError(409, 'missing-in-trash', 'The item is no longer in the Trash.');
    }
    const entries = [{ action: 'restore', operationId, destinationMode, destinationPath, identity, trashPath: outcome.trashPath, path: destinationPath, allocatedBytes: outcome.allocatedBytes, irreversible: false, operation: 'restore', recipe: 'trash' }];
    const plan = sealPlan({ scanId: this.scanId, revision: this.revision, viewerSessionId: viewer.id, epoch: this.epoch, entries });
    this.plans.set(plan.id, plan);
    return { planId: plan.id, manifestHash: plan.manifestHash, nonce: plan.nonce, expiresAt: plan.expiresAt, entries, conflicts: [] };
  }

  async exportSnapshot() {
    const files = await this.writeAllReports();
    this.reports = files;
    this.bump();
    return { snapshot: files.snapshot, reports: files };
  }

  async end() {
    if (this.ended) return { ended: true, reports: this.reports };
    this.ended = true;
    this.scan?.cancel();
    await this.mailbox.post('session-ended', { reason: 'The user ended the session in the viewer.' });
    this.reports = await this.writeAllReports().catch(() => null);
    this.bump();
    return { ended: true, reports: this.reports };
  }

  /**
   * Stop for the agent `stop` command: cancel scanning, wait for a running
   * cleanup to record its outcomes (remaining entries are skipped), report.
   */
  async stop() {
    this.stopping = true;
    this.scan?.cancel();
    if (this.running) {
      const finished = await Promise.race([this.running.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 120_000))]);
      if (!finished) throw new HttpError(409, 'operation-in-progress', 'An operation is still running; it will be recorded before stopping. Try again.');
    }
    this.ended = true;
    this.mailbox.close();
    this.reports = await this.writeAllReports().catch(() => this.reports);
    clearInterval(this.timer);
    this.bump();
    setTimeout(() => this.onStopped?.(), 50);
    return { stopped: true, reports: this.reports };
  }

  // ---------------------------------------------------------------- read models

  displayRoot() {
    return this.scan?.tree.nodes.length ? this.scan.tree.pathOf(0) : this.config.root;
  }

  coverage() {
    const stats = this.scan?.stats ?? {};
    const root = this.scan?.tree.nodes[0];
    return { complete: Boolean(root?.complete), phase: this.phase, entries: stats.entries ?? 0, directories: stats.directories ?? 0, denied: stats.denied ?? 0, symlinks: stats.symlinks ?? 0, mounts: stats.mounts ?? 0, hardLinkAliases: stats.hardLinkAliases ?? 0, boundaries: this.scan?.boundaries.slice(0, 200) ?? [] };
  }

  summary() {
    const totals = (risk) => {
      const list = [...this.candidates.values()].filter((candidate) => candidate.risk === risk);
      const top = list.filter((candidate) => !list.some((other) => other !== candidate && candidate.path.startsWith(`${other.path}/`)));
      return { bytes: sumBytes(top.map((candidate) => candidate.allocatedBytes)), count: list.length };
    };
    const scanned = String(this.scan?.tree.nodes[0]?.alloc ?? 0);
    const used = this.volume ? BigInt(this.volume.totalBytes) - BigInt(this.volume.freeBytes) : null;
    const selected = [...this.candidates.values()].filter((candidate) => candidate.selected);
    return {
      freeBytes: this.volume?.freeBytes ?? null,
      totalBytes: this.volume?.totalBytes ?? null,
      scannedBytes: scanned,
      unaccountedBytes: used === null ? null : String(used > BigInt(scanned) ? used - BigInt(scanned) : 0n),
      safe: totals('safe'),
      review: totals('review'),
      selected: {
        count: selected.length,
        allocatedBytes: sumBytes(selected.map((candidate) => candidate.allocatedBytes)),
        reclaimableBytes: selected.some((candidate) => candidate.reclaimableBytes === null) ? null : sumBytes(selected.map((candidate) => candidate.reclaimableBytes)),
      },
    };
  }

  viewCandidate(candidate) {
    const recipe = candidate.decision?.choice === 'trash' ? 'trash' : candidate.assessment?.recipe ?? candidate.recipe;
    const operation = candidate.risk === 'review' ? 'trash' : recipe ? operationOf(recipe) : null;
    return {
      id: candidate.id, path: candidate.path, name: candidate.name, kind: candidate.kind, revision: candidate.revision,
      allocatedBytes: candidate.allocatedBytes, logicalBytes: candidate.logicalBytes, reclaimableBytes: candidate.reclaimableBytes,
      complete: candidate.complete, risk: candidate.risk, reason: candidate.reason, purpose: candidate.purpose, consequences: candidate.consequences,
      evidence: [...candidate.evidence, ...(recipe && recipe !== 'trash' ? recipeDocs(recipe, candidate.path, this.config.home).map((reference) => ({ kind: 'documentation', reference, checkedAt: 'recipe' })) : [])],
      recipe, operation, command: operation === 'cli' ? commandText(recipe, this.cli) : null, question: candidate.question,
      decision: candidate.decision?.revision === candidate.revision ? candidate.decision.choice : null, selected: candidate.selected,
      userUnchecked: candidate.userUnchecked, category: candidate.category, assessed: Boolean(candidate.assessment),
    };
  }

  getState(after) {
    if (after === this.seq) return { seq: this.seq, unchanged: true, agent: this.agentStatus() };
    return {
      seq: this.seq, scanId: this.scanId, revision: this.revision, locale: this.config.locale, root: this.displayRoot(), home: this.config.home,
      phase: this.phase, progress: this.progress, volume: this.volume, coverage: this.coverage(), summary: this.summary(), agent: this.agentStatus(),
      candidates: [...this.candidates.values()].filter((candidate) => candidate.recipe || candidate.assessment || candidate.risk !== 'unassessed').sort((a, b) => Number(BigInt(b.allocatedBytes) - BigInt(a.allocatedBytes))).slice(0, 500).map((candidate) => this.viewCandidate(candidate)),
      chat: this.chat.slice(-200), outcomes: this.outcomes.slice(-500), metrics: this.metrics, ended: this.ended, reports: this.reports, recovered: this.config.recovered ?? [],
    };
  }

  viewNode(index, withPreview) {
    const tree = this.scan.tree;
    const node = tree.nodes[index];
    const id = tree.idOf(index);
    const candidate = this.candidates.get(id);
    const target = tree.pathOf(index);
    const entry = {
      id, name: index === 0 ? target : node.name, path: target, kind: node.kind, allocatedBytes: String(node.alloc), logicalBytes: String(node.logical),
      complete: node.kind === 'dir' ? node.complete : true, denied: node.denied, boundary: node.boundary, alias: node.alias,
      category: categoryFor(target, this.config.home), risk: candidate?.risk ?? null, selected: candidate?.selected ?? false,
      hasChildren: node.children.length > 0 || Boolean(node.small), small: node.small ? { count: node.small.count, allocatedBytes: String(node.small.alloc) } : null,
    };
    if (withPreview) {
      entry.children = [...node.children].sort((a, b) => tree.nodes[b].alloc - tree.nodes[a].alloc).slice(0, 6).map((child) => {
        const childNode = tree.nodes[child];
        const childCandidate = this.candidates.get(tree.ids[child]);
        return { id: tree.idOf(child), name: childNode.name, kind: childNode.kind, allocatedBytes: String(childNode.alloc), category: categoryFor(tree.pathOf(child), this.config.home), risk: childCandidate?.risk ?? null };
      });
    }
    return entry;
  }

  /** Paginated children (≤300) of a node with previews for the first 40, or a name search. */
  getTree({ parentId, cursor = 0, q = '' }) {
    if (!this.scan?.tree.nodes.length) return { parent: null, ancestors: [], entries: [], other: null, nextCursor: null };
    const tree = this.scan.tree;
    if (q) {
      const needle = q.toLowerCase();
      const hits = [];
      for (let index = 1; index < tree.nodes.length && hits.length < 2000; index += 1) {
        if (tree.nodes[index].name.toLowerCase().includes(needle)) hits.push(index);
      }
      hits.sort((a, b) => tree.nodes[b].alloc - tree.nodes[a].alloc);
      return { search: q, parent: null, ancestors: [], entries: hits.slice(0, PAGE).map((index) => this.viewNode(index, false)), other: null, nextCursor: null };
    }
    const parentIndex = parentId ? tree.indexOf(parentId) : 0;
    if (parentIndex === undefined) throw new HttpError(404, 'unknown-node', 'That folder is not in the current scan.');
    const node = tree.nodes[parentIndex];
    const children = [...node.children].sort((a, b) => tree.nodes[b].alloc - tree.nodes[a].alloc);
    const page = children.slice(cursor, cursor + PAGE);
    const rest = children.slice(cursor + PAGE);
    const ancestors = [...tree.ancestors(parentIndex)].reverse().map((index) => ({ id: tree.idOf(index), name: index === 0 ? tree.pathOf(0) : tree.nodes[index].name }));
    return {
      parent: this.viewNode(parentIndex, false),
      ancestors,
      entries: page.map((index, position) => this.viewNode(index, cursor === 0 && position < MAP_PREVIEW)),
      other: rest.length ? { count: rest.length, allocatedBytes: String(rest.reduce((sum, index) => sum + tree.nodes[index].alloc, 0)) } : null,
      nextCursor: rest.length ? cursor + PAGE : null,
    };
  }

  async writeAllReports() {
    const summary = this.summary();
    const locale = this.config.locale;
    const tree = this.scan?.tree;
    const tiles = tree ? [...tree.nodes[0].children].sort((a, b) => tree.nodes[b].alloc - tree.nodes[a].alloc).slice(0, 60).map((index) => ({
      name: tree.nodes[index].name, path: tree.pathOf(index), allocatedBytes: String(tree.nodes[index].alloc), category: categoryFor(tree.pathOf(index), this.config.home), risk: this.candidates.get(tree.ids[index])?.risk ?? null,
    })) : [];
    const snapshot = {
      generatedAt: new Date().toISOString(), locale, root: this.displayRoot(), revision: this.revision, coverage: this.coverage().complete ? 'complete' : 'partial',
      cards: [
        { label: 'Free right now', value: formatBytes(summary.freeBytes, locale), note: summary.totalBytes ? ` of ${formatBytes(summary.totalBytes, locale)}` : '' },
        { label: 'Verified cleanup', value: formatBytes(summary.safe.bytes, locale), note: ` ${summary.safe.count} items` },
        { label: 'Needs review', value: formatBytes(summary.review.bytes, locale), note: ` ${summary.review.count} items` },
        { label: 'Unaccounted', value: summary.unaccountedBytes === null ? 'unknown' : formatBytes(summary.unaccountedBytes, locale), note: ' outside the scanned folders' },
      ],
      tiles,
      candidates: [...this.candidates.values()].filter((candidate) => candidate.assessment || candidate.recipe).map((candidate) => ({ ...this.viewCandidate(candidate) })),
      outcomes: this.outcomes,
    };
    const files = await writeReports(this.config.runDir, { snapshot, outcomes: this.outcomes, metrics: this.metrics, summary: { scanId: this.scanId, revision: this.revision, root: this.displayRoot(), coverage: this.coverage(), space: summary } });
    await writePrivateJson(path.join(this.config.runDir, 'state.json'), { schemaVersion: 1, scanId: this.scanId, revision: this.revision, phase: this.phase, chat: this.chat, candidates: [...this.candidates.values()].map((candidate) => this.viewCandidate(candidate)) });
    return files;
  }
}

function nodeIdentity(node) {
  return { device: node.dev, inode: node.ino, uid: node.uid, mtimeNs: node.mtimeNs, ctimeNs: node.ctimeNs, kind: node.kind === 'dir' ? 'directory' : node.kind };
}

function spaceMetricsFor(entries, results, before, after) {
  return metricsImpl({ entries: entries.filter((entry) => entry.action === 'clean'), outcomes: results, freeBefore: before?.freeBytes, freeAfter: after?.freeBytes });
}


// Reuse `ps`/`lsof` output for a few seconds during assessment batches; the
// executor always uses the uncached runner.
function cachedExec(exec) {
  const cache = new Map();
  return (file, args, options) => {
    if (!['/bin/ps', '/usr/sbin/lsof'].includes(file)) return exec(file, args, options);
    const key = `${file} ${args.join(' ')}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 5000) return hit.promise;
    const promise = exec(file, args, options);
    cache.set(key, { at: Date.now(), promise });
    return promise;
  };
}
