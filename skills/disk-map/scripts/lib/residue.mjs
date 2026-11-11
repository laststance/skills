// Detect directories left behind by apps that are no longer installed.
// Hits only mark candidates for review — the user still decides Trash.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { isInside } from './util.mjs';

const APP_STATE_PARENTS = ['Library/Application Support', 'Library/Caches', 'Library/Logs'];
// Names that never map to an installable app (system-managed state); without
// this list, absent Spotlight hits would flag e.g. iOS backups as residue.
const SKIP_NAME = /^(DiagnosticReports|CrashReporter|MobileSync|SyncServices|system\.log|asl|nsurlsessiond|knowledge-agent|CloudKit|Metadata|com\.apple\.|Apple$|Adobe$|Google$|Microsoft$|JetBrains$)/i;
const MIN_BYTES = 1024 * 1024; // trivial residue is not worth a review round
const MAX_PROBES = 40; // mdfind is fast but not free; largest dirs probe first

// Package managers whose payloads outlive their registry entries.
const ORPHAN_SPECS = [
  {
    packagesRoot: '.vite-plus/packages',
    commands: (home) => [[path.join(home, '.vite-plus/bin/vp'), 'list'], ['vp', 'list']],
  },
];

/** True when no `.app` bundle or Spotlight bundle id matches `name`. */
async function appMissing(name, { appDirs, exec, probes }) {
  const key = name.toLowerCase();
  if (probes.has(key)) return probes.get(key);
  if (probes.size >= MAX_PROBES) return false; // fail closed: unverifiable → not residue
  let missing = true;
  for (const dir of appDirs) {
    try {
      if ((await fsp.lstat(path.join(dir, `${name}.app`))).isDirectory()) { missing = false; break; }
    } catch { /* not here; try the next directory */ }
  }
  if (missing && exec) {
    const query = `kMDItemCFBundleIdentifier == "*${name.replaceAll('"', '')}*"c`;
    const found = await exec('/usr/bin/mdfind', [query], { timeoutMs: 15_000 }).catch(() => null);
    if (found && found.code === 0 && found.stdout.trim()) missing = false;
  }
  probes.set(key, missing);
  return missing;
}

/** Package payload dirs under a manager root that its registry no longer lists. */
async function orphanPayloads(home, tree, spec, exec) {
  if (!exec) return [];
  let listed = null;
  for (const command of spec.commands(home)) {
    const result = await exec(command[0], command.slice(1), { timeoutMs: 15_000 }).catch(() => null);
    if (result && result.code === 0) { listed = result.stdout; break; }
  }
  if (listed === null) return [];
  const root = path.join(home, spec.packagesRoot);
  const hits = [];
  for (let index = 1; index < tree.nodes.length; index += 1) {
    const node = tree.nodes[index];
    if (node.kind !== 'dir' || node.boundary || node.alloc < MIN_BYTES) continue;
    const target = tree.pathOf(index);
    // Scoped payloads live one level deeper (`@scope/name`).
    const rel = path.relative(root, target);
    const depth = rel.split(path.sep).length;
    if (rel.startsWith('..') || depth > 2 || (depth === 2 && !rel.startsWith('@'))) continue;
    const pkg = depth === 2 ? rel.split(path.sep).join('/') : rel;
    if (depth === 1 && rel.startsWith('@')) continue;
    if (!listed.includes(node.name) && !listed.includes(pkg)) hits.push({ path: target, note: `Package "${pkg}" is not in the package manager's list; likely leftover.` });
  }
  return hits;
}

/**
 * Find directories whose owning app is gone.
 *
 * Called once per (re)scan by {@link Session.discoverCandidates}. A hit marks
 * the candidate `residue`, which relaxes only the app-data-parent and
 * protected-descendant rules — the review → Trash flow still applies.
 *
 * @param opts.home - scanned home directory.
 * @param opts.tree - finished scan tree (only real dirs are nodes).
 * @param opts.exec - command runner (ps/lsof-style injected in tests).
 * @param opts.appDirs - folders holding `.app` bundles; injectable for tests.
 * @returns `{ path, note }[]` — note explains the hit for the agent.
 * @example
 * await detectResidue({ home: '/Users/me', tree, exec: runFixed });
 * // [{ path: '/Users/me/Library/Logs/openclaw', note: 'No installed app matches "openclaw"; likely residue.' }]
 */
export async function detectResidue({ home, tree, exec, appDirs = ['/Applications', path.join(home, 'Applications')] }) {
  const hits = [];
  const probes = new Map();
  const missing = (name) => appMissing(name, { appDirs, exec, probes });
  // App-state dirs are probed largest-first so big residue wins the probe cap.
  const dirs = [];
  for (let index = 1; index < tree.nodes.length; index += 1) {
    const node = tree.nodes[index];
    if (node.kind !== 'dir' || node.boundary || node.alloc < MIN_BYTES) continue;
    const target = tree.pathOf(index);
    if (!isInside(target, home)) continue;
    const parts = path.relative(home, target).split(path.sep);
    if (parts.length === 3 && APP_STATE_PARENTS.includes(parts.slice(0, 2).join('/')) && !SKIP_NAME.test(parts[2])) {
      dirs.push({ index, target, name: parts[2], alloc: node.alloc });
    }
  }
  dirs.sort((a, b) => Number(b.alloc - a.alloc));
  for (const dir of dirs) {
    if (await missing(dir.name)) hits.push({ path: dir.target, note: `No installed app matches "${dir.name}"; likely residue.` });
  }
  // A dot-dir is residue only when the same app name is residue elsewhere —
  // plain CLI configs (~/.tool) must not be flagged on their own.
  const residueNames = new Set(hits.map((hit) => path.basename(hit.path).toLowerCase()));
  for (let index = 1; index < tree.nodes.length; index += 1) {
    const node = tree.nodes[index];
    if (node.kind !== 'dir' || node.boundary || node.alloc < MIN_BYTES || !node.name.startsWith('.')) continue;
    const target = tree.pathOf(index);
    if (path.dirname(target) !== home || path.relative(home, target).split(path.sep).length !== 1) continue;
    const bare = node.name.slice(1).toLowerCase();
    if (residueNames.has(bare)) hits.push({ path: target, note: `Leftover data of the uninstalled "${bare}" app.` });
  }
  for (const spec of ORPHAN_SPECS) hits.push(...await orphanPayloads(home, tree, spec, exec));
  return hits;
}
