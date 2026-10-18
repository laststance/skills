// Read-only traversal: identities, hard-link-aware accounting, explicit
// boundaries (symlink, other device, denied, depth) and incremental records.
// Bulk scanning uses readdir + lstat only; it never opens file contents.
import { randomUUID, createHash } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';

export const FLAG = {
  PROTECTED_MARK: 1, // the node itself is a protected marker (Cookies, Keychains, ...)
  REPO_ROOT: 2, // contains `.git` (repository or worktree root)
  HAS_PROTECTED_DESC: 4, // the node or a descendant contains protected state
  HAS_BOUNDARY_DESC: 8, // a mount point or depth limit lies inside
};

const PROTECTED_NAMES = new Set([
  'Cookies', 'Cookies-journal', 'Login Data', 'Login Data For Account', 'Web Data',
  'Local Storage', 'Session Storage', 'Sessions', 'IndexedDB', 'Service Worker',
  'Keychains', '.ssh', '.gnupg',
]);

/**
 * True for names that always indicate credentials or browser/site state.
 * Scanner marks containers; executor rechecks the same rule before mutation.
 *
 * @example
 * isProtectedName('Login Data'); // true
 */
export function isProtectedName(name) {
  return PROTECTED_NAMES.has(name) || name.endsWith('.keychain-db') || name.endsWith('.keychain');
}

/**
 * Read `/usr/share/firmlinks` so `/System/Volumes/Data/Users` displays as `/Users`.
 * Called by `start` when the root is the data volume.
 */
export async function readFirmlinks(file = '/usr/share/firmlinks') {
  const aliases = new Map();
  try {
    for (const line of (await fsp.readFile(file, 'utf8')).split('\n')) {
      const [alias, rel] = line.split('\t');
      if (alias && rel) aliases.set(rel.trim(), alias.trim());
    }
  } catch {
    // No firmlinks file: paths stay as scanned.
  }
  return aliases;
}

/** Query volume capacity fresh from the OS (before/after cleanup and on scan). */
export async function volumeInfo(target) {
  const stats = await fsp.statfs(target, { bigint: true });
  return {
    totalBytes: String(stats.blocks * stats.bsize),
    freeBytes: String(stats.bavail * stats.bsize),
    measuredAt: new Date().toISOString(),
  };
}

/**
 * In-memory scan tree. Node indices only grow, so children always have a
 * larger index than their parent (used for post-order finalization).
 */
export class ScanTree {
  constructor() {
    this.nodes = [];
    this.ids = [];
    this.byId = new Map();
  }

  /** Lazily assign a UUID to a node index; the UUID is the public node/candidate ID. */
  idOf(index) {
    if (!this.ids[index]) this.assignId(index, randomUUID());
    return this.ids[index];
  }

  assignId(index, id) {
    this.ids[index] = id;
    this.byId.set(id, index);
  }

  indexOf(id) {
    return this.byId.get(id);
  }

  /** Absolute path of a node; firmlinked nodes carry their alias path. */
  pathOf(index) {
    const parts = [];
    let cursor = index;
    while (cursor >= 0) {
      const node = this.nodes[cursor];
      if (node.absPath) return parts.length ? path.join(node.absPath, ...parts.reverse()) : node.absPath;
      parts.push(node.name);
      cursor = node.parent;
    }
    return path.join('/', ...parts.reverse());
  }

  /** Real (scanned) path used for filesystem calls during traversal. */
  realPathOf(index) {
    const parts = [];
    let cursor = index;
    while (cursor > 0) {
      parts.push(this.nodes[cursor].name);
      cursor = this.nodes[cursor].parent;
    }
    return path.join(this.nodes[0].realPath, ...parts.reverse());
  }

  /** Walk ancestors (nearest first), excluding the node itself. */
  *ancestors(index) {
    let cursor = this.nodes[index].parent;
    while (cursor >= 0) {
      yield cursor;
      cursor = this.nodes[cursor].parent;
    }
  }

  /** Find the node index for an absolute alias/real path, or undefined. */
  findByPath(target) {
    const rootPath = this.pathOf(0);
    if (target === rootPath || target === this.nodes[0].realPath) return 0;
    for (let index = 1; index < this.nodes.length; index += 1) {
      if (this.nodes[index].absPath === target) return index;
    }
    const base = target.startsWith(`${rootPath}/`) || rootPath === '/' ? rootPath : this.nodes[0].realPath;
    const rel = path.relative(base, target);
    if (rel.startsWith('..')) return undefined;
    let cursor = 0;
    for (const part of rel.split(path.sep)) {
      cursor = this.nodes[cursor].children.find((child) => this.nodes[child].name === part);
      if (cursor === undefined) return undefined;
    }
    return cursor;
  }

  /** Nearest ancestor flagged as a Git repository/worktree root, or -1. */
  repoRootOf(index) {
    for (const ancestor of this.ancestors(index)) {
      if (this.nodes[ancestor].flags & FLAG.REPO_ROOT) return ancestor;
    }
    return -1;
  }
}

/**
 * Create a cancellable read-only scan of `root`.
 *
 * Called by the session at start and on rescan. Results are partial until
 * `run()` resolves; `complete` flags are only set during finalization.
 *
 * @param options.root - Absolute real path to scan.
 * @param options.aliases - Map of root-relative path → display alias (firmlinks).
 * @param options.fileNodeThreshold - Files at least this large become tree nodes;
 *   smaller files are aggregated into their parent.
 * @param options.onProgress - Throttled progress callback (first call is immediate).
 * @param options.onDirectory - Called once per listed directory (incremental records).
 * @returns `{ tree, run, cancel, stats, boundaries }`.
 * @example
 * const scan = createScan({ root: '/tmp/fixture', fileNodeThreshold: 0 });
 * await scan.run();
 * scan.tree.nodes[0].alloc; // allocated bytes, hard links counted once
 */
export function createScan({
  root,
  aliases = new Map(),
  fileNodeThreshold = 1024 * 1024,
  maxDepth = 64,
  concurrency = 16,
  maxBoundaryRecords = 5000,
  onProgress = () => {},
  onDirectory = () => {},
}) {
  const tree = new ScanTree();
  const stats = { entries: 0, directories: 0, files: 0, hardLinkAliases: 0, denied: 0, symlinks: 0, mounts: 0, boundaryCount: 0 };
  const boundaries = [];
  const seenLinks = new Set();
  let cancelled = false;
  let rootDev;
  let lastProgress = 0;
  const startedAt = Date.now();

  const addBoundary = (index, kind, code) => {
    stats.boundaryCount += 1;
    if (boundaries.length < maxBoundaryRecords) boundaries.push({ path: tree.pathOf(index), kind, code: code ?? null });
  };

  const addNode = (parent, name, kind, stat, extra = {}) => {
    const index = tree.nodes.length;
    tree.nodes.push({
      parent,
      name,
      kind,
      alloc: 0,
      logical: 0,
      dev: stat ? String(stat.dev) : null,
      ino: stat ? String(stat.ino) : null,
      uid: stat ? Number(stat.uid) : null,
      mtimeNs: stat ? String(stat.mtimeNs) : null,
      ctimeNs: stat ? String(stat.ctimeNs) : null,
      depth: parent >= 0 ? tree.nodes[parent].depth + 1 : 0,
      children: [],
      flags: 0,
      boundary: null,
      denied: false,
      listed: false,
      complete: false,
      small: null,
      alias: false,
      ...extra,
    });
    if (parent >= 0) tree.nodes[parent].children.push(index);
    return index;
  };

  // Add bytes to a node and every ancestor so partial views stay consistent.
  const account = (index, alloc, logical) => {
    for (let cursor = index; cursor >= 0; cursor = tree.nodes[cursor].parent) {
      tree.nodes[cursor].alloc += alloc;
      tree.nodes[cursor].logical += logical;
    }
  };

  // Propagate a flag to a node and its ancestors; stop early when already set.
  const markUp = (index, flag) => {
    for (let cursor = index; cursor >= 0; cursor = tree.nodes[cursor].parent) {
      if (tree.nodes[cursor].flags & flag) break;
      tree.nodes[cursor].flags |= flag;
    }
  };

  const progress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastProgress < 250) return;
    lastProgress = now;
    onProgress({ ...stats, allocatedBytes: String(tree.nodes[0]?.alloc ?? 0), elapsedMs: now - startedAt });
  };

  const handleEntry = (parent, name, stat) => {
    stats.entries += 1;
    if (isProtectedName(name)) markUp(parent, FLAG.HAS_PROTECTED_DESC);
    if (name === '.git') {
      tree.nodes[parent].flags |= FLAG.REPO_ROOT;
      markUp(parent, FLAG.HAS_PROTECTED_DESC);
    }
    if (stat.isSymbolicLink()) {
      stats.symlinks += 1;
      const index = addNode(parent, name, 'symlink', stat, { boundary: 'symlink', complete: true, listed: true });
      addBoundary(index, 'symlink');
      return null;
    }
    if (stat.isDirectory()) {
      const rel = path.relative(tree.nodes[0].realPath, path.join(tree.realPathOf(parent), name));
      const index = addNode(parent, name, 'dir', stat, aliases.has(rel) ? { absPath: aliases.get(rel) } : {});
      if (isProtectedName(name)) tree.nodes[index].flags |= FLAG.PROTECTED_MARK | FLAG.HAS_PROTECTED_DESC;
      stats.directories += 1;
      // Another device: record as unmapped and never descend.
      if (String(stat.dev) !== rootDev) {
        stats.mounts += 1;
        Object.assign(tree.nodes[index], { boundary: 'mount', listed: true, complete: true });
        markUp(parent, FLAG.HAS_BOUNDARY_DESC);
        addBoundary(index, 'mount');
        return null;
      }
      if (tree.nodes[index].depth >= maxDepth) {
        tree.nodes[index].boundary = 'depth';
        markUp(parent, FLAG.HAS_BOUNDARY_DESC);
        addBoundary(index, 'depth');
        return null;
      }
      return index;
    }
    stats.files += 1;
    const alloc = Number(stat.blocks) * 512;
    const logical = Number(stat.size);
    let counted = [alloc, logical];
    let alias = false;
    // Hard links: count allocation once per (device, inode); later names stay visible.
    if (stat.isFile() && stat.nlink > 1n) {
      const key = `${stat.dev}:${stat.ino}`;
      if (seenLinks.has(key)) {
        counted = [0, 0];
        alias = true;
        stats.hardLinkAliases += 1;
      } else {
        seenLinks.add(key);
      }
    }
    if (alloc >= fileNodeThreshold || alias) {
      const index = addNode(parent, name, stat.isFile() ? 'file' : 'other', stat, { listed: true, complete: true, alias, nlink: Number(stat.nlink) });
      if (isProtectedName(name)) tree.nodes[index].flags |= FLAG.PROTECTED_MARK | FLAG.HAS_PROTECTED_DESC;
      account(index, counted[0], counted[1]);
    } else {
      const node = tree.nodes[parent];
      node.small ??= { count: 0, alloc: 0, logical: 0 };
      node.small.count += 1;
      node.small.alloc += counted[0];
      node.small.logical += counted[1];
      account(parent, counted[0], counted[1]);
    }
    return null;
  };

  const scanDirectory = async (index, queue) => {
    const dirPath = tree.realPathOf(index);
    let dir;
    try {
      dir = await fsp.opendir(dirPath, { bufferSize: 256 });
    } catch (error) {
      tree.nodes[index].denied = true;
      stats.denied += 1;
      addBoundary(index, 'denied', error.code);
      return;
    }
    const process = async (names) => {
      await Promise.all(names.map(async (name) => {
        let stat;
        try {
          stat = await fsp.lstat(path.join(dirPath, name), { bigint: true });
        } catch (error) {
          stats.denied += 1;
          tree.nodes[index].denied = true;
          if (boundaries.length < maxBoundaryRecords) boundaries.push({ path: path.join(tree.pathOf(index), name), kind: 'denied', code: error.code });
          return;
        }
        const child = handleEntry(index, name, stat);
        if (child !== null) queue.push(child);
      }));
      progress();
    };
    try {
      let batch = [];
      for await (const entry of dir) {
        if (cancelled) break;
        batch.push(entry.name);
        if (batch.length >= 128) {
          await process(batch);
          batch = [];
        }
      }
      if (!cancelled) await process(batch);
      tree.nodes[index].listed = !cancelled;
    } catch (error) {
      tree.nodes[index].denied = true;
      stats.denied += 1;
      addBoundary(index, 'denied', error.code);
    }
    if (tree.nodes[index].listed) {
      const node = tree.nodes[index];
      onDirectory({ path: tree.pathOf(index), directBytes: String(node.small?.alloc ?? 0), files: node.small?.count ?? 0, denied: node.denied });
    }
  };

  // Post-order: children have larger indices than parents.
  const finalize = () => {
    for (let index = tree.nodes.length - 1; index >= 0; index -= 1) {
      const node = tree.nodes[index];
      if (node.kind !== 'dir' || node.boundary === 'mount') continue;
      node.complete = node.listed && !node.denied && node.boundary === null && !cancelled
        && node.children.every((child) => tree.nodes[child].complete);
    }
  };

  const run = async () => {
    const rootStat = await fsp.lstat(root, { bigint: true });
    if (!rootStat.isDirectory()) throw Object.assign(new Error('Scan root is not a directory'), { code: 'ENOTDIR' });
    rootDev = String(rootStat.dev);
    addNode(-1, root, 'dir', rootStat, { absPath: aliases.get('') ?? root, realPath: root });
    progress(true);
    const queue = [0];
    let active = 0;
    await new Promise((resolve) => {
      const pump = () => {
        while (!cancelled && active < concurrency && queue.length) {
          const index = queue.pop();
          active += 1;
          scanDirectory(index, queue).finally(() => {
            active -= 1;
            pump();
          });
        }
        if (active === 0 && (queue.length === 0 || cancelled)) resolve();
      };
      pump();
    });
    finalize();
    progress(true);
    return { cancelled, stats, boundaries };
  };

  return {
    tree,
    stats,
    boundaries,
    run,
    cancel: () => {
      cancelled = true;
    },
    get cancelled() {
      return cancelled;
    },
  };
}

/**
 * Metadata-only digest of a subtree (names, kinds, device/inode, size, times).
 *
 * Called at plan creation, immediately before an operation, and after staging.
 * The root contributes only device/inode/kind: renaming it changes its ctime.
 * Never follows symlinks and never reads file contents.
 *
 * @returns `{ digest, entries, protectedFound, boundaryFound }`.
 * @example
 * const before = await subtreeDigest('/tmp/fixture/.next');
 */
export async function subtreeDigest(root, { maxEntries = 500_000 } = {}) {
  const hash = createHash('sha256');
  const rootStat = await fsp.lstat(root, { bigint: true });
  hash.update(`.\0${rootStat.isDirectory() ? 'd' : 'f'}\0${rootStat.dev}\0${rootStat.ino}\n`);
  let entries = 0;
  let protectedFound = false;
  let boundaryFound = false;
  if (rootStat.isDirectory()) {
    const stack = [''];
    while (stack.length) {
      const rel = stack.pop();
      const names = (await fsp.readdir(path.join(root, rel))).sort();
      for (const name of names) {
        const childRel = rel ? `${rel}/${name}` : name;
        const stat = await fsp.lstat(path.join(root, childRel), { bigint: true });
        entries += 1;
        if (entries > maxEntries) throw Object.assign(new Error('Subtree too large to verify'), { code: 'E2BIG' });
        if (isProtectedName(name) || name === '.git') protectedFound = true;
        const kind = stat.isSymbolicLink() ? 'l' : stat.isDirectory() ? 'd' : stat.isFile() ? 'f' : 'o';
        hash.update(`${childRel}\0${kind}\0${stat.dev}\0${stat.ino}\0${stat.size}\0${stat.mtimeNs}\0${stat.ctimeNs}\n`);
        if (kind === 'd') {
          if (stat.dev !== rootStat.dev) boundaryFound = true;
          else stack.push(childRel);
        }
      }
    }
  }
  return { digest: hash.digest('hex'), entries, protectedFound, boundaryFound };
}
