import path from 'node:path';
import { createHash } from 'node:crypto';
import { allowedProjectRoot, within } from './safe-io.mjs';
import { readStatus } from './safe-io.mjs';
import { safeDiagnostic, SweepError } from './diagnostics.mjs';
import { LOCKFILE_NAMES } from './package-formats.mjs';

const SKIP = new Set(['node_modules', '.git', 'vendor', '.next', 'dist', 'build', '.cache', '.venv', 'venv', 'target', 'deriveddata', '.turbo', 'pods']);

/** 明示rootと既定rootを許可範囲へ写す。不正rootは結果のcoverageへ残す。 @example configuredRoots(ctx) */
export function configuredRoots(ctx) {
  const entries = ctx.config.scanRoots ?? ['Projects', 'repository', 'work'].map(name => ({ path: path.join(ctx.home, name), scope: 'personal' }));
  return (Array.isArray(entries) ? entries : []).slice(0, 20).map(entry => ({ path: typeof entry === 'string' ? entry : entry?.path, scope: entry?.scope === 'work' ? 'work' : 'personal' }));
}

/** 保存済みfrontierを同じroot実体の中だけで再開する。inventoryが環境readerより先に呼ぶ。 @example await discoverProjects(ctx, previous) */
export async function discoverProjects(ctx, previous = {}, limits = {}) {
  const maximumDirectories = limits.directories ?? 2000, maximumFiles = limits.files ?? 5000, maximumQueue = limits.queue ?? 5000;
  const perDirectory = limits.entries ?? 200, maximumDepth = limits.depth ?? 12;
  if (Array.isArray(previous.queue) && previous.queue.length > maximumQueue || Array.isArray(previous.files) && previous.files.length > maximumFiles || Array.isArray(previous.projects) && previous.projects.length > 5000) throw new SweepError('STATE', { cause: 'limit', operation: 'discovery' });
  const roots = [], rootCoverage = [], diagnostics = [];
  for (const root of configuredRoots(ctx)) {
    if (!allowedProjectRoot(ctx.home, root.path)) { rootCoverage.push({ area: 'scan-root', status: 'excluded', policyExcluded: true, reason: 'ホーム直下の認証領域・Library・リンクは探索対象にできません。' }); continue; }
    try {
      const info = await ctx.io.inspect(root.path, { roots: [root.path], purpose: 'project' });
      if (!info.metadata.isDirectory()) throw new Error('type');
      roots.push({ ...root, identity: `${info.metadata.dev}:${info.metadata.ino}` });
      rootCoverage.push({ area: 'scan-root', path: root.path, status: 'complete' });
    } catch (error) {
      const status = readStatus(error);
      rootCoverage.push({ area: 'scan-root', path: root.path, status }); diagnostics.push(safeDiagnostic(error, 'READ', 'discovery'));
      // 中断・拒否は以前のfrontierを消す理由にしない。対象は再開時に必ず再検証する。
      const saved = (Array.isArray(previous.roots) ? previous.roots : []).find(item => item?.path === root.path && item.scope === root.scope && /^\d+:\d+$/.test(item.identity || ''));
      if (saved && status !== 'absent') roots.push({ ...root, identity: saved.identity });
    }
  }
  const signature = createHash('sha256').update(JSON.stringify({ roots, maximumDepth })).digest('hex');
  const sameRoots = previous.schemaVersion === 1 && previous.signature === signature;
  // depth上限で残った未確認は継続中に保持し、frontier完走後はrootから再確認する。
  const compatible = sameRoots && !(previous.complete === true && limits.pageAcknowledged === true)
    && !(previous.depthLimited === true && previous.queue?.length === 0);
  const advancePage = compatible && limits.pageAcknowledged === true && !rootCoverage.some(item => item.status !== 'complete');
  const safeEntry = entry => entry && typeof entry.directory === 'string' && entry.directory.length <= 4096 && Number.isInteger(entry.depth) && entry.depth >= 0 && entry.depth <= maximumDepth
    && Number.isSafeInteger(entry.offset) && entry.offset >= 0 && entry.offset <= 10000000 && (entry.identity === undefined || /^[\d:.-]{1,200}$/.test(entry.identity)) && roots.some(root => root.path === entry.root && within(root.path, entry.directory));
  if (compatible && (!Array.isArray(previous.queue) || !previous.queue.every(safeEntry))) throw new SweepError('STATE', { cause: 'boundary', operation: 'discovery' });
  let queue = compatible ? previous.queue.map(item => ({ directory: item.directory, root: item.root, scope: item.scope === 'work' ? 'work' : 'personal', depth: item.depth, offset: item.offset, ...(item.identity ? { identity: item.identity } : {}) })) : roots.map(root => ({ directory: root.path, root: root.path, scope: root.scope, depth: 0, offset: 0 }));
  const retained = compatible && !advancePage && Array.isArray(previous.files) ? previous.files : [];
  if (!retained.every(item => item && typeof item.path === 'string' && roots.some(root => within(root.path, item.path)) && LOCKFILE_NAMES.has(path.basename(item.path)) && Number.isSafeInteger(item.size) && item.size >= 0 && /^[\d:.-]{1,200}$/.test(item.sourceIdentity || '') && Number.isFinite(Date.parse(item.modifiedAt)))) throw new SweepError('STATE', { cause: 'boundary', operation: 'discovery' });
  const files = new Map(retained.map(item => [item.path, { path: item.path, scope: item.scope === 'work' ? 'work' : 'personal', format: path.basename(item.path), size: item.size, modifiedAt: item.modifiedAt, sourceIdentity: item.sourceIdentity }]));
  const projectDirectories = new Set(compatible && !advancePage && Array.isArray(previous.projects) ? previous.projects.filter(file => typeof file === 'string' && roots.some(root => within(root.path, file))) : roots.map(root => root.path));
  const page = compatible ? (Number.isSafeInteger(previous.page) && previous.page >= 0 ? previous.page : 0) + Number(advancePage) : 0;
  const acknowledgedFiles = compatible ? (Number.isSafeInteger(previous.acknowledgedFiles) && previous.acknowledgedFiles >= 0 ? previous.acknowledgedFiles : 0) + (advancePage ? previous.files?.length || 0 : 0) : 0;
  const packageRoots = new Set();
  const retryDirectories = [];
  let depthLimited = compatible && previous.depthLimited === true;
  let directories = 0, incomplete = depthLimited || !roots.length || rootCoverage.some(item => item.status !== 'complete'), exhausted = false;
  while (queue.length && directories < maximumDirectories && !ctx.signal.aborted) {
    try { ctx.check(); } catch { incomplete = true; break; }
    const current = queue.shift();
    try {
      const info = await ctx.io.inspect(current.directory, { roots: [current.root], purpose: 'project' });
      const directoryIdentity = info.identity;
      // 途中でdirectoryが変化した場合は、そのdirectoryだけ先頭へ戻す。
      if (current.identity && current.identity !== directoryIdentity) current.offset = 0;
      const listing = await ctx.io.list(current.directory, { roots: [current.root], purpose: 'project', limit: perDirectory, offset: current.offset || 0 });
      directories += 1;
      let consumed = 0, blocked = false;
      for (const entry of listing.entries) {
        const file = path.join(current.directory, entry.name);
        if (entry.symlink) { consumed += 1; continue; }
        if (entry.directory && !entry.name.startsWith('.') && !SKIP.has(entry.name.toLowerCase())) {
          if (current.depth >= maximumDepth) { incomplete = true; depthLimited = true; consumed += 1; continue; }
          if (queue.length + retryDirectories.length >= maximumQueue - 1) { blocked = true; exhausted = true; break; }
          queue.push({ directory: file, root: current.root, scope: current.scope, depth: current.depth + 1, offset: 0 });
        }
        if (entry.file && ['package.json', '.mcp.json', 'pyvenv.cfg', ...LOCKFILE_NAMES].includes(entry.name)) {
          if (!projectDirectories.has(current.directory) && projectDirectories.size >= 5000) { blocked = true; exhausted = true; break; }
          projectDirectories.add(current.directory);
          if (entry.name === 'package.json') packageRoots.add(current.directory);
        }
        if (entry.file && LOCKFILE_NAMES.has(entry.name)) {
          if (!files.has(file) && files.size >= maximumFiles) { blocked = true; exhausted = true; break; }
          const metadata = await ctx.io.inspect(file, { roots: [current.root], purpose: 'project' });
          files.set(file, { path: file, scope: current.scope, format: entry.name, size: metadata.metadata.size, modifiedAt: metadata.metadata.mtime.toISOString(), sourceIdentity: metadata.identity });
        }
        consumed += 1;
      }
      if (blocked || !listing.complete) queue.push({ ...current, identity: directoryIdentity, offset: (current.offset || 0) + consumed });
      if (blocked && files.size >= maximumFiles) break;
    } catch (error) {
      if (readStatus(error) !== 'absent') { incomplete = true; retryDirectories.push(current); }
      diagnostics.push(safeDiagnostic(error, 'READ', 'discovery'));
      if (ctx.signal.aborted) break;
    }
  }
  queue.push(...retryDirectories);
  // 保存済みpathを再検証し、削除や置換を古い存在証拠へ残さない。
  for (const [file, record] of files) {
    if (ctx.signal.aborted) { incomplete = true; break; }
    const root = roots.find(item => within(item.path, file));
    try { const info = await ctx.io.inspect(file, { roots: [root.path], purpose: 'project' }); if (!info.metadata.isFile()) files.delete(file); else if (info.identity !== record.sourceIdentity) files.set(file, { ...record, size: info.metadata.size, modifiedAt: info.metadata.mtime.toISOString(), sourceIdentity: info.identity }); }
    catch (error) { if (readStatus(error) === 'absent') files.delete(file); else { incomplete = true; files.set(file, { ...record, observationStatus: 'unverified-current' }); } }
  }
  const candidates = [];
  if (!roots.length) {
    try {
      const listing = await ctx.io.list(ctx.home, { roots: [ctx.home], limit: 100 });
      for (const entry of listing.entries) if (entry.directory && !entry.symlink && allowedProjectRoot(ctx.home, path.join(ctx.home, entry.name))) candidates.push(path.join(ctx.home, entry.name));
    } catch (error) { diagnostics.push(safeDiagnostic(error, 'READ', 'discovery')); }
  }
  const complete = !queue.length && !incomplete && !exhausted;
  const lockfiles = [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
  const projects = [...projectDirectories].sort();
  return { projectRoots: roots.map(({ identity, ...root }) => root), lockfiles, packageRoots: [...new Set([...packageRoots, ...projects])], projectDirectories: projects,
    rootCandidates: candidates, diagnostics, coverage: [...rootCoverage, { area: 'lockfiles', status: complete && page === 0 ? 'complete' : 'partial', count: lockfiles.length, directories, pending: queue.length, capacityReached: exhausted, depthLimited, page, acknowledgedFiles,
      reason: depthLimited ? '探索の深さ上限より下に未確認のdirectoryがあります。後続runでも未確認を保持し、完走後は同じrootを再確認します。' : page ? '現在のpageのみ再確認。以前のpageは保存済みレポートの証拠であり、今回の全件鮮度を意味しません。' : '同じroot実体のfrontier・directory位置を保存し、通常の再実行で継続します。リンク・依存/build配下は探索しません。' }],
    continuation: { schemaVersion: 1, signature, complete, depthLimited, queue, files: lockfiles, projects, roots, page, acknowledgedFiles } };
}
