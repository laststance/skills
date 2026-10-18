// Protection rules, risk evaluation and selection reconciliation.
// Agent assessments are proposals; these rules decide what may be selected.
import path from 'node:path';
import { FLAG } from './scanner.mjs';
import { matchRecipe } from './recipes.mjs';
import { isInside, isSameOrInside } from './util.mjs';

const BROAD = [
  '', 'Library', 'Library/Application Support', 'Library/Caches', 'Library/Containers', 'Library/Group Containers',
  'Library/Developer', 'Library/Developer/Xcode', 'Library/Developer/Xcode/DerivedData', 'Desktop', 'Documents',
  'Downloads', 'Pictures', 'Movies', 'Music', 'Applications', 'Public', '.cache', '.local', '.local/share',
  '.claude', '.codex', '.cursor', '.npm',
];
const APP_DATA_PARENTS = ['Library/Application Support', 'Library/Containers', 'Library/Group Containers'];
const PROTECTED_TREES = [
  ['Library/Keychains', 'credentials'], ['Library/Preferences', 'settings'], ['Library/Cookies', 'site data'],
  ['Library/Mail', 'mail'], ['Library/Messages', 'messages'], ['Library/Safari', 'browser data'],
  ['Library/Mobile Documents', 'iCloud Drive'], ['Library/CloudStorage', 'cloud files'], ['Library/Accounts', 'accounts'],
  ['Library/Calendars', 'calendars'], ['Library/Application Support/AddressBook', 'contacts'],
  ['Library/Application Support/Google/Chrome', 'browser profile'], ['Library/Application Support/Google/Chrome Canary', 'browser profile'],
  ['Library/Containers/com.docker.docker', 'Docker data'], ['Library/Group Containers/group.com.docker', 'Docker data'],
  ['.ssh', 'credentials'], ['.gnupg', 'credentials'], ['.aws', 'credentials'], ['.kube', 'credentials'],
  ['.docker', 'Docker settings'], ['.config', 'settings'], ['.Trash', 'Trash'],
  ['.claude/settings.json', 'agent settings'], ['.claude.json', 'agent settings'], ['.codex/auth.json', 'agent credentials'],
  ['.codex/config.toml', 'agent settings'],
];
const VM_RE = /(^Docker\.raw$|\.(vmdk|qcow2|vdi|pvm|utm|vmwarevm|vhdx)$)/i;
const REPO_DISPOSABLE = new Set(['.next', '.turbo', 'node_modules']);

/**
 * Return why a path must never be cleaned, or null.
 *
 * Called when a candidate is created and again by the executor right before
 * an operation. A model label or a parent selection can never override it.
 *
 * @param candidate - `{ path, kind, flags, repoRoot }` (flags from {@link FLAG}).
 * @param ctx - `{ home, stateDir, skillDir }`.
 * @example
 * protectionReason({ path: `${home}/.ssh`, kind: 'dir', flags: 0 }, ctx);
 * // 'Protected: credentials.'
 */
export function protectionReason(candidate, ctx) {
  const target = candidate.path;
  const { home } = ctx;
  for (const own of [ctx.stateDir, ctx.skillDir].filter(Boolean)) {
    if (isSameOrInside(target, own) || isInside(own, target)) return 'Protected: disk-map runtime state or the skill itself.';
  }
  if (!isSameOrInside(target, home)) return 'Outside your home folder; not supported in this release.';
  const rel = path.relative(home, target);
  if (BROAD.includes(rel)) return 'Too broad to act on; choose a specific folder inside it.';
  if (APP_DATA_PARENTS.includes(path.dirname(rel))) return "A whole application's data folder is never a cleanup target.";
  for (const [tree, label] of PROTECTED_TREES) {
    if (isSameOrInside(rel, tree) || isInside(tree, rel)) return `Protected: ${label}.`;
  }
  const name = path.basename(target);
  if (path.dirname(rel) === '.' && name.startsWith('.') && candidate.kind !== 'dir') return 'Protected: user settings file.';
  if (name.endsWith('.app')) return 'Protected: application bundle.';
  if (/\.(photoslibrary|musiclibrary|tvlibrary)$/i.test(name)) return 'Protected: library database.';
  if (VM_RE.test(name)) return 'Docker/VM disk: lifecycle operations are not supported in this release.';
  if (candidate.kind === 'symlink') return 'Symbolic links are never followed or cleaned.';
  const flags = candidate.flags ?? 0;
  if (flags & FLAG.PROTECTED_MARK) return 'Protected: credentials or browser site data.';
  if (flags & FLAG.REPO_ROOT) return 'Protected: repository or worktree root.';
  if (flags & FLAG.HAS_PROTECTED_DESC) return 'Contains protected data (credentials, site data or a Git repository).';
  if (flags & FLAG.HAS_BOUNDARY_DESC) return 'Contains another volume or an unscanned depth.';
  if (candidate.repoRoot) {
    const parts = path.relative(candidate.repoRoot, target).split(path.sep);
    if (!parts.some((part) => REPO_DISPOSABLE.has(part))) return 'Inside a Git work tree; source files are protected.';
  }
  return null;
}

/**
 * Combine policy, scan completeness, agent assessment and executor checks
 * into the effective risk shown in the viewer.
 *
 * Called after scans, assessments and readiness checks. `safe` requires all
 * of: a permanent-cleanup recipe whose exact path rule matches, local
 * evidence, stated consequences, and a passing current readiness check.
 *
 * @returns `{ risk, reason }` where risk is a contract `Risk`.
 * @example
 * effectiveRisk({ protection: null, complete: true, assessment: null }, ctx);
 * // { risk: 'unassessed', reason: 'Not assessed yet.' }
 */
export function effectiveRisk(candidate, ctx) {
  if (candidate.protection) return { risk: 'protected', reason: candidate.protection };
  if (!candidate.complete) return { risk: 'blocked', reason: 'The scan of this folder is incomplete or denied; it cannot be cleaned.' };
  const assessment = candidate.assessment;
  if (!assessment) return { risk: 'unassessed', reason: candidate.recipe ? 'Matches a known recipe; waiting for agent evidence.' : 'Not assessed yet.' };
  if (assessment.risk === 'protected' || assessment.risk === 'blocked') return { risk: assessment.risk, reason: assessment.reason };
  if (assessment.risk === 'safe') {
    const problems = [];
    if (!assessment.recipe || assessment.recipe === 'trash') problems.push('safe needs a permanent-cleanup recipe');
    else {
      const match = matchRecipe(assessment.recipe, candidate, ctx);
      if (!match.ok) problems.push(match.reason);
      else if (!candidate.readiness?.ok) problems.push(candidate.readiness?.reason ?? 'executor checks have not passed yet');
    }
    if (!assessment.evidence.some((item) => item.kind === 'local')) problems.push('no local evidence');
    if (!assessment.evidence.some((item) => item.kind === 'documentation')) problems.push('no documentation evidence');
    if (!assessment.consequences.length) problems.push('no consequences stated');
    if (problems.length) return { risk: 'review', reason: `Needs review: ${problems.join('; ')}.` };
    return { risk: 'safe', reason: assessment.reason };
  }
  return { risk: 'review', reason: assessment.reason };
}

/**
 * Which action a candidate may currently enter a plan with, or null.
 * Review items need a Trash decision bound to the current revision.
 */
export function eligibleAction(candidate) {
  if (candidate.risk === 'safe' && candidate.recipe && candidate.recipe !== 'trash') return 'clean';
  if (candidate.risk === 'review' && candidate.decision?.choice === 'trash' && candidate.decision.revision === candidate.revision) return 'trash';
  return null;
}

/** First item whose path is the same as, above, or below `target`; else null. */
export function findOverlap(target, items) {
  for (const item of items) {
    if (isSameOrInside(item.path, target) || isInside(target, item.path)) return item;
  }
  return null;
}

/**
 * Reconcile the checkbox after a risk change.
 *
 * Called by the session after every assessment/readiness update. A manual
 * uncheck is never reversed; a downgrade from safe always unchecks; a new
 * safe item is checked only when it overlaps no selected item.
 *
 * @returns true when the selection changed (caller invalidates plans).
 * @example
 * reconcileSelection(candidate, 'unassessed', selectedOthers);
 */
export function reconcileSelection(candidate, previousRisk, selectedOthers) {
  const before = candidate.selected;
  if (candidate.risk !== 'safe' && eligibleAction(candidate) !== 'trash') candidate.selected = false;
  if (candidate.risk === 'safe' && previousRisk !== 'safe' && !candidate.userUnchecked && !findOverlap(candidate.path, selectedOthers)) {
    candidate.selected = true;
  }
  return before !== candidate.selected;
}

/** Display category (independent from risk). */
export function categoryFor(target, home) {
  const rel = isSameOrInside(target, home) ? path.relative(home, target) : null;
  const name = path.basename(target);
  if (rel !== null && /^\.(codex|claude|cursor|gemini|openclaw)(\/|$)/.test(rel)) return 'agent-history';
  if (/^(\.next|\.turbo|node_modules|DerivedData|dist|build|target)$/.test(name) || /\/DerivedData\//.test(target)) return 'build-output';
  if (/(^|\/)(docker|Docker|com\.docker\.docker|\.colima|\.orbstack|Parallels|UTM)(\/|$)/.test(target) || VM_RE.test(name)) return 'docker-vm';
  if (/(huggingface|\.ollama|lmstudio|\.lmstudio|MLX|models?)(\/|$)/i.test(target)) return 'ai-models';
  if (rel !== null && /^(\.npm|\.pnpm-store|\.cache|\.cargo|\.gradle|\.m2|go|Library\/pnpm|Library\/Caches)(\/|$)/.test(rel)) return 'dev-cache';
  if (rel === null || /^(Library|Applications)(\/|$)/.test(rel)) return 'system-apps';
  return 'your-files';
}
