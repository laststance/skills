#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KNOWN_BROWSERS = [
  {
    aliases: ['chrome', 'google chrome'],
    displayName: 'Google Chrome',
    appName: 'Google Chrome',
    processName: 'Google Chrome',
    appPath: '/Applications/Google Chrome.app',
    supportDir: '~/Library/Application Support/Google/Chrome',
    cacheDir: '~/Library/Caches/Google/Chrome',
  },
  {
    aliases: ['chrome canary', 'google chrome canary', 'canary'],
    displayName: 'Google Chrome Canary',
    appName: 'Google Chrome Canary',
    processName: 'Google Chrome Canary',
    appPath: '/Applications/Google Chrome Canary.app',
    supportDir: '~/Library/Application Support/Google/Chrome Canary',
    cacheDir: '~/Library/Caches/Google/Chrome Canary',
  },
  {
    aliases: ['chrome beta', 'google chrome beta', 'beta'],
    displayName: 'Google Chrome Beta',
    appName: 'Google Chrome Beta',
    processName: 'Google Chrome Beta',
    appPath: '/Applications/Google Chrome Beta.app',
    supportDir: '~/Library/Application Support/Google/Chrome Beta',
    cacheDir: '~/Library/Caches/Google/Chrome Beta',
  },
  {
    aliases: ['chrome dev', 'google chrome dev', 'dev'],
    displayName: 'Google Chrome Dev',
    appName: 'Google Chrome Dev',
    processName: 'Google Chrome Dev',
    appPath: '/Applications/Google Chrome Dev.app',
    supportDir: '~/Library/Application Support/Google/Chrome Dev',
    cacheDir: '~/Library/Caches/Google/Chrome Dev',
  },
  {
    aliases: ['chrome for testing', 'google chrome for testing', 'cft'],
    displayName: 'Google Chrome for Testing',
    appName: 'Google Chrome for Testing',
    processName: 'Google Chrome for Testing',
    appPath: '/Applications/Google Chrome for Testing.app',
    supportDir: '~/Library/Application Support/Google/Chrome for Testing',
    cacheDir: '~/Library/Caches/Google/Chrome for Testing',
  },
  {
    aliases: ['chromium'],
    displayName: 'Chromium',
    appName: 'Chromium',
    processName: 'Chromium',
    appPath: '/Applications/Chromium.app',
    supportDir: '~/Library/Application Support/Chromium',
    cacheDir: '~/Library/Caches/Chromium',
  },
  {
    aliases: ['brave', 'brave browser'],
    displayName: 'Brave Browser',
    appName: 'Brave Browser',
    processName: 'Brave Browser',
    appPath: '/Applications/Brave Browser.app',
    supportDir: '~/Library/Application Support/BraveSoftware/Brave-Browser',
    cacheDir: '~/Library/Caches/BraveSoftware/Brave-Browser',
  },
  {
    aliases: ['edge', 'microsoft edge'],
    displayName: 'Microsoft Edge',
    appName: 'Microsoft Edge',
    processName: 'Microsoft Edge',
    appPath: '/Applications/Microsoft Edge.app',
    supportDir: '~/Library/Application Support/Microsoft Edge',
    cacheDir: '~/Library/Caches/Microsoft Edge',
  },
  {
    aliases: ['arc'],
    displayName: 'Arc',
    appName: 'Arc',
    processName: 'Arc',
    appPath: '/Applications/Arc.app',
    supportDir: '~/Library/Application Support/Arc',
    cacheDir: '~/Library/Caches/Arc',
  },
  {
    aliases: ['dia'],
    displayName: 'Dia',
    appName: 'Dia',
    processName: 'Dia',
    appPath: '/Applications/Dia.app',
    supportDir: '~/Library/Application Support/Dia',
    cacheDir: '~/Library/Caches/Dia',
  },
  {
    aliases: ['vivaldi'],
    displayName: 'Vivaldi',
    appName: 'Vivaldi',
    processName: 'Vivaldi',
    appPath: '/Applications/Vivaldi.app',
    supportDir: '~/Library/Application Support/Vivaldi',
    cacheDir: '~/Library/Caches/Vivaldi',
  },
  {
    aliases: ['opera'],
    displayName: 'Opera',
    appName: 'Opera',
    processName: 'Opera',
    appPath: '/Applications/Opera.app',
    supportDir: '~/Library/Application Support/com.operasoftware.Opera',
    cacheDir: '~/Library/Caches/com.operasoftware.Opera',
  },
];

/** Parse CLI flags so the script can run backup or bookmark-only restore.
 * @param {string[]} argv Raw command arguments after node/script.
 * @returns {{command:string, options:Record<string, string|boolean>}} Parsed command and options.
 * @example parseArgs(['backup', '--browser', 'Chrome'])
 */
export function parseArgs(argv) {
  const [maybeCommand, ...rest] = argv;
  const command = maybeCommand && !maybeCommand.startsWith('--') ? maybeCommand : 'backup';
  const tokens = command === maybeCommand ? rest : argv;
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = tokens[index + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return { command, options };
}

/** Expand a path with ~ so browser profile paths are resolved for the selected user.
 * @param {string|undefined} value Path that may start with ~.
 * @param {string} homeDir Home directory used for expansion.
 * @returns {string|undefined} Absolute path or undefined.
 * @example expandHome('~/Library', '/Users/me')
 */
export function expandHome(value, homeDir = os.homedir()) {
  if (!value) return undefined;
  if (value === '~') return homeDir;
  if (value.startsWith('~/')) return path.join(homeDir, value.slice(2));
  return value;
}

/** Convert display names to filesystem-safe backup folder names.
 * @param {string} value Browser display name.
 * @returns {string} Lowercase slug.
 * @example slugify('Google Chrome Canary')
 */
export function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Format local time for human-readable backup folder names.
 * @param {Date} date Date to format.
 * @returns {string} Local timestamp as YYYYMMDDHHMMSS.
 * @example timestampNow(new Date('2026-07-02T09:30:00'))
 */
export function timestampNow(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

/** Resolve known or custom Chromium browser paths for backup/restore commands.
 * @param {Record<string, string|boolean>} options CLI options.
 * @returns {object} Browser config with expanded paths.
 * @example resolveBrowserConfig({ browser: 'Chrome Canary' })
 */
export function resolveBrowserConfig(options = {}) {
  const homeDir = String(options.home || os.homedir());
  const browserName = String(options.browser || 'Chrome');
  const normalized = browserName.trim().toLowerCase();
  const known = KNOWN_BROWSERS.find((browser) => browser.aliases.includes(normalized));
  const config = known
    ? { ...known }
    : {
        aliases: [normalized],
        displayName: browserName,
        appName: String(options['app-name'] || browserName),
        processName: String(options['process-name'] || options['app-name'] || browserName),
        appPath: String(options['app-path'] || ''),
        supportDir: options['support-dir'] ? String(options['support-dir']) : undefined,
        cacheDir: options['cache-dir'] ? String(options['cache-dir']) : undefined,
      };

  return {
    ...config,
    browserName,
    homeDir,
    profile: String(options.profile || 'Default'),
    appPath: expandHome(config.appPath, homeDir),
    supportDir: expandHome(config.supportDir, homeDir),
    cacheDir: expandHome(config.cacheDir, homeDir),
  };
}

/** Count URL bookmarks in Chrome's Bookmarks JSON file.
 * @param {string} filePath Bookmarks file path.
 * @returns {number} Number of url bookmark nodes.
 * @example countBookmarks('/tmp/Bookmarks')
 */
export function countBookmarks(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const visit = (node) => {
    if (!node) return 0;
    if (Array.isArray(node)) return node.reduce((sum, item) => sum + visit(item), 0);
    if (node.type === 'url') return 1;
    return visit(node.children || []);
  };
  return visit(Object.values(data.roots || {}));
}

/** Quit the browser before profile files move so SQLite/JSON state is not mid-write.
 * @param {object} config Browser config with appName/processName.
 * @param {boolean} dryRun Print commands without executing.
 * @param {boolean} skipQuit Skip app/process termination for tests or already-closed browsers.
 * @returns {void}
 * @example quitBrowser(config, true, false)
 */
function quitBrowser(config, dryRun, skipQuit) {
  if (skipQuit) {
    console.log('skip_quit=true');
    return;
  }
  const quitCommand = `osascript -e 'quit app "${config.appName.replace(/"/g, '\\"')}"'`;
  const killCommand = `killall "${config.processName.replace(/"/g, '\\"')}"`;
  if (dryRun) {
    console.log(`[dry-run] ${quitCommand}`);
    console.log(`[dry-run] ${killCommand}`);
    return;
  }
  childProcess.spawnSync('osascript', ['-e', `quit app "${config.appName}"`], { stdio: 'ignore' });
  childProcess.spawnSync('/bin/sleep', ['1'], { stdio: 'ignore' });
  childProcess.spawnSync('killall', [config.processName], { stdio: 'ignore' });
}

/** Move a directory into backup storage without deleting the original data.
 * @param {string|undefined} source Existing source directory.
 * @param {string} destination Destination directory under backup.
 * @param {boolean} dryRun Print action without moving.
 * @returns {boolean} True when a move would happen or happened.
 * @example moveIfExists('/tmp/profile', '/tmp/backup/profile', false)
 */
function moveIfExists(source, destination, dryRun) {
  if (!source || !fs.existsSync(source)) {
    console.log(`missing=${source || '(not configured)'}`);
    return false;
  }
  if (dryRun) {
    console.log(`[dry-run] mv "${source}" "${destination}"`);
    return true;
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.renameSync(source, destination);
  console.log(`moved=${destination}`);
  return true;
}

/** Find a backed-up Application Support directory from current and legacy backup layouts.
 * @param {string} backupDir Timestamped backup directory.
 * @returns {string} Directory containing backed-up browser user data.
 * @example findBackupSupportDir('/tmp/google-chrome-clean-backup')
 */
function findBackupSupportDir(backupDir) {
  const manifestPath = path.join(backupDir, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.moved?.supportDir && fs.existsSync(manifest.moved.supportDir)) {
      return manifest.moved.supportDir;
    }
  }
  const direct = path.join(backupDir, 'Application Support');
  if (fs.existsSync(direct)) return direct;

  // Keep compatibility with the first manual Chrome Canary cleanup layout.
  const legacy = fs
    .readdirSync(backupDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('Application Support'))
    .map((entry) => path.join(backupDir, entry.name));
  if (legacy[0]) return legacy[0];
  throw new Error(`No backed-up Application Support directory found in ${backupDir}`);
}

/** Backup browser user data and cache dirs into a timestamped Desktop folder.
 * @param {Record<string, string|boolean>} options CLI options.
 * @returns {string} Backup directory path.
 * @example backupBrowser({ browser: 'Chrome' })
 */
export function backupBrowser(options = {}) {
  const config = resolveBrowserConfig(options);
  if (!config.supportDir) {
    throw new Error('Unknown browser requires --support-dir; pass --cache-dir if available.');
  }
  const dryRun = Boolean(options['dry-run']);
  const backupRoot = expandHome(String(options['backup-root'] || '~/Desktop'), config.homeDir);
  const timestamp = String(options.timestamp || timestampNow());
  const backupDir = path.join(backupRoot, `${slugify(config.displayName)}-clean-backup-${timestamp}`);
  const moved = {
    supportDir: path.join(backupDir, 'Application Support'),
    cacheDir: path.join(backupDir, 'Caches'),
  };

  console.log(`browser=${config.displayName}`);
  console.log(`app=${config.appPath || '(custom app path not set)'}`);
  console.log(`support=${config.supportDir}`);
  console.log(`cache=${config.cacheDir || '(not configured)'}`);
  console.log(`backup=${backupDir}`);
  quitBrowser(config, dryRun, Boolean(options['skip-quit']));

  const supportMoved = moveIfExists(config.supportDir, moved.supportDir, dryRun);
  const cacheMoved = moveIfExists(config.cacheDir, moved.cacheDir, dryRun);

  // The manifest keeps enough state to restore bookmarks or manually undo later.
  if (!dryRun) {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(
      path.join(backupDir, 'manifest.json'),
      JSON.stringify({ config, moved, supportMoved, cacheMoved, createdAt: new Date().toISOString() }, null, 2),
    );
  }
  return backupDir;
}

/** Restore only bookmark files from backup into the clean regenerated profile.
 * @param {Record<string, string|boolean>} options CLI options.
 * @returns {{sourceCount:number, restoredCount:number, currentBackup:string}} Restore summary.
 * @example restoreBookmarks({ browser: 'Chrome', 'from-backup': '/tmp/backup' })
 */
export function restoreBookmarks(options = {}) {
  const config = resolveBrowserConfig(options);
  const fromBackup = expandHome(String(options['from-backup'] || ''), config.homeDir);
  if (!fromBackup) throw new Error('restore-bookmarks requires --from-backup "/path/to/backup".');
  if (!config.supportDir) throw new Error('Unknown browser requires --support-dir for restore.');

  const dryRun = Boolean(options['dry-run']);
  const backupSupportDir = findBackupSupportDir(fromBackup);
  const sourceProfile = path.join(backupSupportDir, config.profile);
  const destinationProfile = path.join(config.supportDir, config.profile);
  const sourceBookmarks = path.join(sourceProfile, 'Bookmarks');
  const sourceBookmarksBak = path.join(sourceProfile, 'Bookmarks.bak');
  const destinationBookmarks = path.join(destinationProfile, 'Bookmarks');
  const destinationBookmarksBak = path.join(destinationProfile, 'Bookmarks.bak');
  const currentBackup = path.join(
    expandHome(String(options['backup-root'] || '~/Desktop'), config.homeDir),
    `${slugify(config.displayName)}-current-bookmarks-before-restore-${timestampNow()}`,
  );

  if (!fs.existsSync(sourceBookmarks)) throw new Error(`Missing source bookmarks: ${sourceBookmarks}`);
  console.log(`browser=${config.displayName}`);
  console.log(`source=${sourceBookmarks}`);
  console.log(`destination=${destinationBookmarks}`);
  console.log(`current_backup=${currentBackup}`);
  quitBrowser(config, dryRun, Boolean(options['skip-quit']));

  if (!dryRun) {
    fs.mkdirSync(destinationProfile, { recursive: true });
    fs.mkdirSync(currentBackup, { recursive: true });
    if (fs.existsSync(destinationBookmarks)) fs.copyFileSync(destinationBookmarks, path.join(currentBackup, 'Bookmarks'));
    if (fs.existsSync(destinationBookmarksBak)) fs.copyFileSync(destinationBookmarksBak, path.join(currentBackup, 'Bookmarks.bak'));
    fs.copyFileSync(sourceBookmarks, destinationBookmarks);
    if (fs.existsSync(sourceBookmarksBak)) fs.copyFileSync(sourceBookmarksBak, destinationBookmarksBak);
  }

  const sourceCount = countBookmarks(sourceBookmarks);
  const restoredCount = dryRun ? sourceCount : countBookmarks(destinationBookmarks);
  console.log(`source_bookmark_count=${sourceCount}`);
  console.log(`restored_bookmark_count=${restoredCount}`);
  return { sourceCount, restoredCount, currentBackup };
}

/** Run the selected command and surface errors as concise CLI failures.
 * @param {string[]} argv Raw command arguments.
 * @returns {void}
 * @example main(['backup', '--browser', 'Chrome'])
 */
export function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);
  if (command === 'backup') {
    backupBrowser(options);
    return;
  }
  if (command === 'restore-bookmarks') {
    restoreBookmarks(options);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
