// Fixed cleanup recipes. The executor only runs what is encoded here:
// exact path rules, fixed argv built from runtime-resolved roots, and
// recipe-specific usage checks. Agent text never becomes a command.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { isSameOrInside, runFixed } from './util.mjs';

export const RECIPES = ['build-output', 'derived-data', 'app-cache', 'npm-cache', 'pnpm-store', 'uv-cache', 'trash'];

const VERIFIED_AT = '2026-10-18';
const DOC = {
  electronSession: 'https://www.electronjs.org/docs/latest/api/session',
  chromiumDiskCache: 'https://www.chromium.org/developers/design-documents/network-stack/disk-cache/',
  v8CodeCache: 'https://v8.dev/blog/code-caching-for-devs',
  chromiumGpuCache: 'https://source.chromium.org/chromium/chromium/src/+/main:gpu/ipc/common/gpu_disk_cache_type.cc',
  appleCaches: 'https://developer.apple.com/documentation/foundation/filemanager/searchpathdirectory/cachesdirectory',
  nextBuild: 'https://nextjs.org/docs/app/api-reference/cli/next',
  turboCache: 'https://turborepo.com/docs/crafting-your-repository/caching',
  xcodeDerivedData: 'https://developer.apple.com/documentation/xcode/build-system',
  npmCache: 'https://docs.npmjs.com/cli/commands/npm-cache',
  pnpmStore: 'https://pnpm.io/cli/store',
  uvCache: 'https://docs.astral.sh/uv/concepts/cache/',
};

const leaf = (app, rel, owner, docs, verified) => ({ app, rel, owner, docs, verified: verified ? VERIFIED_AT : null });
const electron = (app, base, owner, names, verified) => names.map((name) => leaf(app, `${base}/${name}`, owner, {
  Cache: [DOC.electronSession, DOC.chromiumDiskCache],
  'Code Cache': [DOC.electronSession, DOC.v8CodeCache],
  GPUCache: [DOC.chromiumGpuCache],
  DawnGraphiteCache: [DOC.chromiumGpuCache],
  DawnWebGPUCache: [DOC.chromiumGpuCache],
}[name] ?? [], verified));

/**
 * Exact application cache leaves. `verified` is set only when the leaf was
 * observed on the reference Mac AND a documentation link explains that it is
 * regenerable. Unverified leaves stay review-required (Trash only).
 */
export const APP_CACHE_LEAVES = [
  ...electron('Cursor', 'Library/Application Support/Cursor', '/Cursor.app/', ['Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache'], true),
  leaf('VS Code', 'Library/Caches/com.microsoft.VSCode.ShipIt', '/Visual Studio Code.app/', [DOC.appleCaches], true),
  ...electron('VS Code', 'Library/Application Support/Code', '/Visual Studio Code.app/', ['Cache', 'Code Cache', 'GPUCache'], false),
  leaf('Codex', 'Library/Caches/com.openai.codex', '/Codex.app/', [DOC.appleCaches], true),
  ...electron('Claude Desktop', 'Library/Application Support/Claude', '/Claude.app/', ['Cache', 'Code Cache', 'GPUCache'], false),
  leaf('Raycast', 'Library/Caches/com.raycast.macos', '/Raycast.app/', [DOC.appleCaches], false),
  leaf('Slack', 'Library/Caches/com.tinyspeck.slackmacgap', '/Slack.app/', [DOC.appleCaches], false),
  ...electron('Slack', 'Library/Application Support/Slack', '/Slack.app/', ['Cache', 'Code Cache', 'GPUCache'], false),
  leaf('Notion', 'Library/Caches/notion.id', '/Notion.app/', [DOC.appleCaches], false),
  ...electron('Notion', 'Library/Application Support/Notion', '/Notion.app/', ['Cache', 'Code Cache', 'GPUCache'], false),
  leaf('Figma', 'Library/Caches/com.figma.Desktop', '/Figma.app/', [DOC.appleCaches], false),
];

/** Google updater caches are shown as separate review candidates, never hidden. */
export const GOOGLE_UPDATER_CACHES = ['Library/Caches/com.google.GoogleUpdater', 'Library/Caches/com.google.SoftwareUpdate'];

const DERIVED_RE = /^.+-[a-z]{28}$/;
const CLI_TOOLS = { 'npm-cache': 'npm', 'pnpm-store': 'pnpm', 'uv-cache': 'uv' };
const BUSY = {
  'npm-cache': /(^|\/)(npm|npx|npm-cli\.js|npx-cli\.js)(\s|$)/,
  'pnpm-store': /(^|\/)(pnpm|pnpm\.cjs|pnpm\.js)(\s|$)/,
  'uv-cache': /(^|\/)uv(\s|$)/,
  'derived-data': /(\/Xcode\.app\/|(^|\/)(xcodebuild|XCBBuildService|swift-frontend)(\s|$))/,
};

/** Recipe documentation links, attached to evidence shown in the viewer. */
export function recipeDocs(recipe, candidatePath, home) {
  if (recipe === 'app-cache') return appCacheLeaf(candidatePath, home)?.docs ?? [];
  return {
    'build-output': [DOC.nextBuild, DOC.turboCache],
    'derived-data': [DOC.xcodeDerivedData],
    'npm-cache': [DOC.npmCache],
    'pnpm-store': [DOC.pnpmStore],
    'uv-cache': [DOC.uvCache],
  }[recipe] ?? [];
}

/** Return the exact app-cache leaf entry for a path, or undefined. */
export function appCacheLeaf(candidatePath, home) {
  return APP_CACHE_LEAVES.find((entry) => path.join(home, entry.rel) === candidatePath);
}

/** How a recipe acts: permanent removal, fixed CLI command, or Trash move. */
export function operationOf(recipe) {
  if (recipe === 'trash') return 'trash';
  if (CLI_TOOLS[recipe]) return 'cli';
  return 'remove';
}

/**
 * Resolve CLI tools and their cache roots with fixed read-only argv.
 *
 * Called once per scan by the session. Missing tools or unsupported versions
 * produce `{ blocked }` entries so matching candidates become blocked.
 *
 * @example
 * const cli = await resolveCli({ env: process.env });
 * cli.npm.cacheRoot; // e.g. "/Users/me/.npm"
 */
export async function resolveCli({ env = process.env, exec = runFixed, home } = {}) {
  const which = async (name) => {
    const dirs = [...(env.PATH ?? '').split(':'), '/opt/homebrew/bin', '/usr/local/bin', home && path.join(home, '.local/bin')].filter(Boolean);
    for (const dir of dirs) {
      const candidate = path.join(dir, name);
      try {
        await fsp.access(candidate, fsp.constants.X_OK);
        return candidate;
      } catch {
        // Try the next PATH entry.
      }
    }
    return null;
  };
  const query = async (exe, args) => {
    const result = await exec(exe, args, { timeoutMs: 15_000, env });
    return result.code === 0 ? result.stdout.trim().split('\n').pop().trim() : null;
  };
  const major = (text) => Number(/(\d+)\.\d+/.exec(text ?? '')?.[1] ?? NaN);
  const out = {};

  const npm = await which('npm');
  const npmVersion = npm && await query(npm, ['--version']);
  const npmCache = npm && await query(npm, ['config', 'get', 'cache']);
  out.npm = npm && major(npmVersion) >= 7 && path.isAbsolute(npmCache ?? '')
    ? { exe: npm, version: npmVersion, cacheRoot: npmCache }
    : { blocked: npm ? 'npm 7 or newer with a resolvable cache root is required' : 'npm was not found on PATH' };

  const pnpm = await which('pnpm');
  const pnpmVersion = pnpm && await query(pnpm, ['--version']);
  const storePath = pnpm && await query(pnpm, ['store', 'path']);
  out.pnpm = pnpm && major(pnpmVersion) >= 7 && path.isAbsolute(storePath ?? '')
    ? { exe: pnpm, version: pnpmVersion, storePath, storeDir: /^v\d+$/.test(path.basename(storePath)) ? path.dirname(storePath) : storePath }
    : { blocked: pnpm ? 'pnpm 7 or newer with a resolvable store is required' : 'pnpm was not found on PATH' };

  const uv = await which('uv');
  const uvVersion = uv && await query(uv, ['--version']);
  const uvCache = uv && await query(uv, ['cache', 'dir']);
  out.uv = uv && /^uv \d+\.\d+/.test(uvVersion ?? '') && path.isAbsolute(uvCache ?? '')
    ? { exe: uv, version: uvVersion, cacheDir: uvCache }
    : { blocked: uv ? 'uv with a resolvable cache directory is required' : 'uv was not found on PATH' };
  return out;
}

/**
 * Detect which recipe a scanned path could use (candidate discovery only).
 * Detection never makes anything safe; the agent and executor checks must agree.
 *
 * @example
 * detectRecipe('/Users/me/app/.next', { kind: 'dir' }, ctx); // 'build-output'
 */
export function detectRecipe(candidatePath, node, ctx) {
  if (node.kind !== 'dir') return null;
  const name = path.basename(candidatePath);
  if (name === '.next' || name === '.turbo') return 'build-output';
  if (path.dirname(candidatePath) === path.join(ctx.home, 'Library/Developer/Xcode/DerivedData') && DERIVED_RE.test(name)) return 'derived-data';
  if (appCacheLeaf(candidatePath, ctx.home)) return 'app-cache';
  if (ctx.cli?.npm?.cacheRoot && candidatePath === path.join(ctx.cli.npm.cacheRoot, '_cacache')) return 'npm-cache';
  if (ctx.cli?.pnpm?.storePath && candidatePath === ctx.cli.pnpm.storePath) return 'pnpm-store';
  if (ctx.cli?.uv?.cacheDir && candidatePath === ctx.cli.uv.cacheDir) return 'uv-cache';
  return null;
}

/**
 * Synchronous exact-path rule for a recipe. Policy calls this before a
 * candidate can be `safe`; the executor calls it again before acting.
 *
 * @param candidate - `{ path, kind, repoRoot }` (repoRoot: enclosing Git root or null).
 * @returns `{ ok: true }` or `{ ok: false, reason }`.
 */
export function matchRecipe(recipe, candidate, ctx) {
  const name = path.basename(candidate.path);
  const fail = (reason) => ({ ok: false, reason });
  if (!RECIPES.includes(recipe)) return fail('Unknown recipe.');
  if (recipe === 'trash') return candidate.kind === 'symlink' ? fail('Links are not moved.') : { ok: true };
  if (candidate.kind !== 'dir') return fail('This recipe acts on directories only.');
  switch (recipe) {
    case 'build-output':
      if (name !== '.next' && name !== '.turbo') return fail('Only a .next or .turbo directory matches build-output.');
      if (!candidate.repoRoot) return fail('build-output needs an enclosing Git repository to prove the folder is ignored.');
      return { ok: true };
    case 'derived-data':
      return path.dirname(candidate.path) === path.join(ctx.home, 'Library/Developer/Xcode/DerivedData') && DERIVED_RE.test(name)
        ? { ok: true } : fail('Only one project folder directly inside Xcode DerivedData matches.');
    case 'app-cache': {
      const entry = appCacheLeaf(candidate.path, ctx.home);
      if (!entry) return fail('Not an exact recognized application cache leaf.');
      if (!entry.verified) return fail(`${entry.app} cache leaf is not verified yet; it stays review-required.`);
      return { ok: true };
    }
    case 'npm-cache':
      return ctx.cli?.npm?.cacheRoot && candidate.path === path.join(ctx.cli.npm.cacheRoot, '_cacache')
        ? { ok: true } : fail(ctx.cli?.npm?.blocked ?? 'Path is not the resolved npm cache.');
    case 'pnpm-store':
      return ctx.cli?.pnpm?.storePath === candidate.path ? { ok: true } : fail(ctx.cli?.pnpm?.blocked ?? 'Path is not the resolved pnpm store.');
    case 'uv-cache':
      return ctx.cli?.uv?.cacheDir === candidate.path ? { ok: true } : fail(ctx.cli?.uv?.blocked ?? 'Path is not the resolved uv cache.');
    default:
      return fail('Unknown recipe.');
  }
}

/** List running process argv lines with a fixed `ps` call (fails closed). */
export async function listProcesses(ctx) {
  const result = await (ctx.exec ?? runFixed)(ctx.psPath ?? '/bin/ps', ['-axo', 'args='], { timeoutMs: 15_000 });
  if (result.code !== 0) return null;
  return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

/**
 * Paths currently open (including working directories) by the user's
 * processes under `target`, via one fixed `lsof` call. Null when unknown.
 */
export async function openPathsUnder(target, ctx) {
  const result = await (ctx.exec ?? runFixed)(ctx.lsofPath ?? '/usr/sbin/lsof', ['-nP', '-u', String(ctx.uid), '-Fn'], { timeoutMs: 30_000 });
  if (!result.stdout && result.code !== 0) return null;
  return result.stdout.split('\n').filter((line) => line.startsWith('n/')).map((line) => line.slice(1)).filter((p) => isSameOrInside(p, target));
}

/** `git check-ignore` with fixed argv; true only when Git says the path is ignored. */
export async function isGitIgnored(repoRoot, target, ctx) {
  const rel = path.relative(repoRoot, target);
  const result = await (ctx.exec ?? runFixed)(ctx.gitPath ?? '/usr/bin/git', ['-C', repoRoot, 'check-ignore', '-q', '--', rel], { timeoutMs: 15_000 });
  return result.code === 0;
}

/**
 * Full current readiness check: exact path rule, Git-ignore proof,
 * tool availability, and running-process/open-file checks.
 *
 * Called after an agent assessment (before safe preselection) and again by
 * the executor immediately before each operation.
 *
 * @returns `{ ok: true }` or `{ ok: false, reason, busy? }`.
 */
export async function checkRecipe(recipe, candidate, ctx) {
  const match = matchRecipe(recipe, candidate, ctx);
  if (!match.ok) return match;
  if (candidate.repoRoot && (recipe === 'build-output' || recipe === 'trash')) {
    if (!(await isGitIgnored(candidate.repoRoot, candidate.path, ctx))) {
      return { ok: false, reason: 'Git does not report this folder as ignored; it may contain source files.' };
    }
  }
  if (CLI_TOOLS[recipe] && !ctx.cli?.[CLI_TOOLS[recipe]]?.exe) return { ok: false, reason: ctx.cli?.[CLI_TOOLS[recipe]]?.blocked ?? 'Tool unavailable.' };
  const processes = await listProcesses(ctx);
  if (!processes) return { ok: false, reason: 'Could not list running processes; usage is unknown.' };
  const ownerPattern = recipe === 'app-cache' ? appCacheLeaf(candidate.path, ctx.home)?.owner : null;
  const busyPattern = BUSY[recipe];
  const busy = processes.find((line) => (ownerPattern && line.includes(ownerPattern)) || (busyPattern && busyPattern.test(line)));
  if (busy) return { ok: false, busy: true, reason: 'The owning application or tool is running. Quit it first; disk-map never stops apps.' };
  if (operationOf(recipe) !== 'cli') {
    const scope = recipe === 'build-output' ? path.dirname(candidate.path) : candidate.path;
    const open = await openPathsUnder(scope, ctx);
    if (!open) return { ok: false, reason: 'Could not check open files; usage is unknown.' };
    if (open.length) return { ok: false, busy: true, reason: `${open.length} open file(s) or working folder(s) are inside this location.` };
  }
  return { ok: true };
}

/**
 * Build the fixed argv for a CLI recipe from runtime-resolved roots only.
 * The candidate path is never interpolated into a shell.
 *
 * @example
 * buildCommand('uv-cache', { uv: { exe: '/opt/homebrew/bin/uv', cacheDir: '/Users/me/.cache/uv' } });
 * // { file: '/opt/homebrew/bin/uv', args: ['cache', 'clean', '--cache-dir', '/Users/me/.cache/uv'] }
 */
export function buildCommand(recipe, cli) {
  switch (recipe) {
    case 'npm-cache':
      return { file: cli.npm.exe, args: ['cache', 'clean', '--force', '--cache', cli.npm.cacheRoot] };
    case 'pnpm-store':
      return { file: cli.pnpm.exe, args: ['store', 'prune', '--store-dir', cli.pnpm.storeDir] };
    case 'uv-cache':
      return { file: cli.uv.exe, args: ['cache', 'clean', '--cache-dir', cli.uv.cacheDir] };
    default:
      return null;
  }
}

/** Human-readable command text for the manifest (display only). */
export function commandText(recipe, cli) {
  const command = cli && buildCommand(recipe, cli);
  if (!command) return null;
  return [path.basename(command.file), ...command.args].map((part) => (/[\s"'$`\\]/.test(part) ? JSON.stringify(part) : part)).join(' ');
}

const UNITS = { B: 1, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4, kB: 1000, KB: 1000, MB: 1000 ** 2, GB: 1000 ** 3 };

/**
 * Parse bytes a CLI says it reclaimed (uv prints `Removed N files (12.3MiB)`).
 * Returns a decimal string or null; npm and pnpm do not report bytes.
 */
export function parseCliReport(recipe, output) {
  if (recipe !== 'uv-cache') return null;
  const match = /Removed .*?\(([\d.]+)\s*(B|KiB|MiB|GiB|TiB|kB|KB|MB|GB)\)/.exec(output);
  return match ? String(Math.round(Number(match[1]) * UNITS[match[2]])) : null;
}
