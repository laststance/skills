import path from 'node:path';
import { boundedJson, readStatus, within, allowedProjectRoot } from './safe-io.mjs';
import { SweepError, safeDiagnostic } from './diagnostics.mjs';
import { cleanText, extensionSource, projectMcpServer, projectLaunchRuntimes, projectProcessFiles, parseLsof, safeVersion, safeIdentifier } from './inventory-projections.mjs';
import { publicResolution, validPackage } from './package-formats.mjs';

const systemPath = (ctx, absolute) => ctx.systemRoot ? path.join(ctx.systemRoot, absolute) : absolute;
const directoryEntries = value => value?.entries.filter(entry => entry.directory && !entry.symlink) || [];
const publicNpm = resolved => {
  if (typeof resolved !== 'string') return null;
  return publicResolution(resolved, 'npm');
};

/** 各readerの成功・不在・拒否を集約する。生の設定や例外を結果へ流さない。 @example const reader = metadataReader(ctx, result, 'firefox'); */
export function metadataReader(ctx, result, area) {
  const issues = [], started = ctx.monotonicNow();
  let observed = 0, lastStatus = 'absent';
  function checkCapacity() {
    ctx.check();
    const count = ['applications', 'extensions', 'browserExtensions', 'runtimes', 'globalPackages', 'mcpServers', 'launchItems', 'loginItems', 'processes', 'containers', 'sbomPackages'].reduce((total, key) => total + (result[key]?.length || 0), 0);
    if (count >= 25000) throw new SweepError('CAPACITY', { cause: 'limit', operation: 'inventory' });
  }
  function issue(error, kind = 'READER') {
    const status = readStatus(error);
    lastStatus = status;
    if (status !== 'absent' || kind === 'COMMAND') { if (!issues.includes(status)) issues.push(status); if (result.diagnostics.length < 1000) result.diagnostics.push(safeDiagnostic(error, kind, 'inventory')); }
    return null;
  }
  async function read(file, root, type = 'json', options = {}) {
    try {
      checkCapacity();
      const config = { roots: [root], maxBytes: options.maxBytes || 8 * 1024 ** 2, purpose: options.purpose };
      const value = type === 'json' ? await ctx.io.readJson(file, config) : type === 'bytes' ? await ctx.io.readBytes(file, config) : await ctx.io.readText(file, config);
      observed += 1; lastStatus = 'complete'; return value;
    } catch (error) { return issue(error); }
  }
  async function inspect(file, root) { try { checkCapacity(); const value = await ctx.io.inspect(file, { roots: [root] }); observed += 1; lastStatus = 'complete'; return value; } catch (error) { return issue(error); } }
  async function list(directory, root = directory, options = {}) {
    // 追跡しないリンクの存在を、対象ソフトウェアの不在・全件読取へ変換しない。
    try { checkCapacity(); const listing = await ctx.io.list(directory, { roots: [root], limit: options.limit || 2000, offset: options.offset }); observed += 1; if (!listing.complete || listing.entries.some(entry => entry.symlink)) issues.push('partial'); return listing; }
    catch (error) { return issue(error); }
  }
  async function command(operation, args, options = {}) {
    const begin = ctx.monotonicNow();
    try {
      checkCapacity();
      const value = await ctx.command(operation, args, options);
      result.commands.push({ command: operation, status: value.code === 0 ? 'complete' : 'partial', elapsedMs: ctx.monotonicNow() - begin });
      if (value.code !== 0) { issues.push('partial'); result.diagnostics.push(safeDiagnostic(new SweepError('COMMAND', { cause: 'io' }), 'COMMAND', 'command')); return null; }
      observed += 1; return value;
    } catch (error) { result.commands.push({ command: operation, status: 'partial', elapsedMs: ctx.monotonicNow() - begin }); issues.push('partial'); return issue(error, 'COMMAND'); }
  }
  async function plist(file, root) {
    const bytes = await read(file, root, 'bytes');
    if (!bytes) return null;
    const value = await command('plutil', ['-convert', 'json', '-o', '-', '--', '-'], { input: bytes });
    if (!value) return null;
    try { const object = boundedJson(value.stdout); if (!object || typeof object !== 'object' || Array.isArray(object)) throw new SweepError('FORMAT', { cause: 'malformed' }); return object; }
    catch (error) { return issue(error, 'FORMAT'); }
  }
  function malformed() { issue(new SweepError('FORMAT', { cause: 'malformed' })); }
  // 件数切捨てを成功扱いせず、readerと全体metadataの上限を可視化する。
  function limit(values, maximum) {
    const count = ['applications', 'extensions', 'browserExtensions', 'runtimes', 'globalPackages', 'mcpServers', 'launchItems', 'loginItems', 'processes', 'containers', 'sbomPackages'].reduce((total, key) => total + (result[key]?.length || 0), 0);
    const allowed = Math.max(0, Math.min(maximum, 25000 - count));
    if (values.length > allowed) issue(new SweepError('CAPACITY', { cause: 'limit', operation: 'inventory' }));
    return values.slice(0, allowed);
  }
  function finish(count = 0, extra = {}) {
    const status = issues.length ? 'partial' : observed ? 'complete' : 'absent';
    const causes = [...new Set(issues)].sort();
    result.coverage.push({ area, status, count, elapsedMs: ctx.monotonicNow() - started, ...(causes.length ? { causes } : {}), ...extra });
  }
  return { read, inspect, list, command, plist, issue, malformed, limit, finish, issues, get status() { return lastStatus; } };
}

/** OS・Homebrew・アプリを静的metadataで収集する。inventoryから一度呼ぶ。 @example await collectApplications(ctx, result); */
export async function collectApplications(ctx, result) {
  const hostReader = metadataReader(ctx, result, 'os');
  if (ctx.platform === 'darwin') {
    const [version, build] = await Promise.all([hostReader.command('sw_vers', ['-productVersion']), hostReader.command('sw_vers', ['-buildVersion'])]);
    result.host = { osVersion: safeVersion(version?.stdout.trim()), buildVersion: cleanText(build?.stdout.trim()), architecture: ctx.arch, platform: ctx.platform };
    hostReader.finish(Number(Boolean(result.host.osVersion)));
  } else { result.host = { architecture: ctx.arch, platform: ctx.platform }; hostReader.finish(0, { status: 'unsupported', reason: 'macOS以外のOS保護状態は未対応です。' }); }
  const brewReader = metadataReader(ctx, result, 'homebrew');
  const brew = await brewReader.command('brew', ['info', '--json=v2', '--installed'], { timeoutMs: 45000 });
  if (brew) {
    try {
      const data = boundedJson(brew.stdout);
      if (!Array.isArray(data.formulae) || !Array.isArray(data.casks)) throw new SweepError('FORMAT', { cause: 'malformed' });
      for (const item of data.formulae) {
        const name = safeIdentifier(item.name);
        if (!name || !Array.isArray(item.installed)) { brewReader.malformed(); continue; }
        const installed = item.installed.map(entry => {
          const suffix = typeof entry.version === 'string' ? entry.version.match(/_(\d+)$/) : null;
          return { version: safeVersion(entry.version?.replace(/_\d+$/, '')), revision: Number.isSafeInteger(entry.revision) && entry.revision >= 0 ? entry.revision : suffix ? Number(suffix[1]) : 0,
            receiptVerified: true, patches: Array.isArray(entry.patches) ? entry.patches.filter(patch => Array.isArray(patch.resolves)).map(patch => ({ resolves: patch.resolves.filter(id => /^(?:CVE-\d{4}-\d{4,}|GHSA-[a-z0-9-]+)$/.test(id)), applied: true })) : [] };
        }).filter(entry => entry.version);
        result.homebrew.formulae.push({ kind: 'formula', name, tap: /^[\w.-]+\/[\w.-]+$/.test(item.tap || '') ? item.tap : 'unknown', versions: installed.map(entry => `${entry.version}${entry.revision ? `_${entry.revision}` : ''}`), installed, evidenceKind: 'installed-metadata' });
      }
      for (const item of data.casks) {
        const name = safeIdentifier(item.token);
        if (!name) { brewReader.malformed(); continue; }
        const versions = (Array.isArray(item.installed) ? item.installed : [item.installed]).map(safeVersion).filter(Boolean);
        result.homebrew.casks.push({ kind: 'cask', name, versions, tap: /^[\w.-]+\/[\w.-]+$/.test(item.tap || '') ? item.tap : 'unknown', evidenceKind: 'installed-metadata' });
      }
    } catch (error) { brewReader.issue(error, 'FORMAT'); }
  }
  brewReader.finish(result.homebrew.formulae.length + result.homebrew.casks.length);
  const roots = [...new Set([systemPath(ctx, '/Applications'), path.join(ctx.home, 'Applications'), systemPath(ctx, '/System/Applications'), ...(ctx.config.applicationRoots || [])])];
  for (const root of roots) {
    const reader = metadataReader(ctx, result, 'applications');
    const queue = [{ directory: root, depth: 0 }];
    let count = 0;
    while (queue.length && count < 1000 && !ctx.signal.aborted) {
      const { directory, depth } = queue.shift();
      const listing = await reader.list(directory, root);
      for (const entry of directoryEntries(listing)) {
        const app = path.join(directory, entry.name);
        if (!entry.name.endsWith('.app')) { if (depth < 1) queue.push({ directory: app, depth: depth + 1 }); continue; }
        const info = await reader.plist(path.join(app, 'Contents/Info.plist'), root);
        if (!info || !safeIdentifier(info.CFBundleIdentifier)) { reader.malformed(); continue; }
        const application = { name: cleanText(info.CFBundleDisplayName || info.CFBundleName || path.basename(app, '.app')), version: safeVersion(info.CFBundleShortVersionString || info.CFBundleVersion), build: safeVersion(info.CFBundleVersion), bundleId: safeIdentifier(info.CFBundleIdentifier), path: app, evidenceKind: 'installed-metadata', components: [], signature: { status: 'unknown' }, notarization: { status: 'unknown', validity: 'unknown' }, channel: 'unknown' };
        const electron = await reader.plist(path.join(app, 'Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/Info.plist'), root)
          || await reader.plist(path.join(app, 'Contents/Frameworks/Electron Framework.framework/Resources/Info.plist'), root);
        if (electron) application.components.push({ name: 'electron', version: safeVersion(electron.CFBundleShortVersionString || electron.CFBundleVersion), evidenceKind: 'installed-metadata' });
        const versions = await reader.read(path.join(app, 'Contents/Resources/versions.json'), root);
        for (const name of ['electron', 'node', 'chrome', 'chromium']) if (safeVersion(versions?.[name])) application.components.push({ name, version: safeVersion(versions[name]), evidenceKind: 'installed-metadata' });
        // ASAR・実行ファイルは展開/実行せず、既存の限定metadataだけを見る。
        const product = await reader.read(path.join(app, 'Contents/Resources/app/package.json'), root);
        for (const name of ['electron', 'node', 'chromium']) if (safeVersion(product?.[`${name}Version`])) application.components.push({ name, version: safeVersion(product[`${name}Version`]), evidenceKind: 'installed-metadata' });
        application.componentCoverage = Object.fromEntries(['electron', 'node', 'chromium'].map(name => [name, application.components.some(item => (item.name === name || name === 'chromium' && item.name === 'chrome') && item.version) ? 'observed' : 'unknown']));
        const code = await reader.command('codesign', ['-dv', '--verbose=4', app]);
        if (code) {
          const raw = `${code.stdout}\n${code.stderr}`;
          application.signature = { status: /^Identifier=/m.test(raw) ? 'displayed' : 'unknown', identifier: safeIdentifier(raw.match(/^Identifier=(.+)$/m)?.[1]), team: /^[A-Z0-9]{10}$/.test(raw.match(/^TeamIdentifier=(.+)$/m)?.[1] || '') ? raw.match(/^TeamIdentifier=(.+)$/m)[1] : null, validity: 'not-verified' };
          if (/^Notarization Ticket=stapled\s*$/m.test(raw)) application.notarization.status = 'ticket-present';
        }
        const mozilla = /firefox|thunderbird/i.test(application.name || '');
        const ini = mozilla ? await reader.read(path.join(app, 'Contents/Resources/application.ini'), root, 'text', { maxBytes: 128000 }) : null;
        const channelFile = mozilla ? await reader.read(path.join(app, 'Contents/Resources/defaults/pref/channel-prefs.js'), root, 'text', { maxBytes: 128000 }) : null;
        const channel = channelFile?.match(/^\s*pref\(\s*["']app\.update\.channel["']\s*,\s*["'](release|esr|beta|nightly)["']\s*\);?\s*$/m)?.[1];
        // prefの固定literalだけを読む。JavaScriptは実行せず、RemotingName=firefoxからreleaseを推測しない。
        if (channel) application.channel = channel;
        else if (/^RemotingName=firefox-esr\s*$/m.test(ini || '') || /^Firefox ESR$/i.test(application.name || '')) application.channel = 'esr';
        else if (/^Google Chrome$/i.test(application.name || '')) application.channel = 'stable';
        else if (/canary/i.test(application.name || '')) application.channel = 'canary';
        result.applications.push(application); count += 1;
      }
    }
    reader.finish(count, { ...(queue.length ? { status: 'partial' } : {}), root, reason: 'Info.plist・既存の同梱版metadata・署名表示だけを確認。チケットの存在は公証の有効性を証明しません。' });
  }
}

/** Chromium系4製品のmanifestとenablementだけを読む。Cookieや認証DBは開かない。 @example await collectBrowserExtensions(ctx, result); */
export async function collectBrowserExtensions(ctx, result) {
  const browsers = [
    ['chrome', 'Library/Application Support/Google/Chrome'], ['chrome-canary', 'Library/Application Support/Google/Chrome Canary'],
    ['edge', 'Library/Application Support/Microsoft Edge'], ['brave', 'Library/Application Support/BraveSoftware/Brave-Browser'],
  ].map(([product, relative]) => ({ product, root: path.join(ctx.home, relative) }));
  browsers.push(...(ctx.config.browserProfiles || []).filter(item => ['chrome', 'chrome-canary', 'edge', 'brave'].includes(item.product)));
  for (const { product: browser, root } of browsers) {
    const reader = metadataReader(ctx, result, `${browser}-extensions`), start = result.browserExtensions.length;
    const profiles = directoryEntries(await reader.list(root));
    for (const profile of profiles) {
      const directory = path.join(root, profile.name), preference = await reader.read(path.join(directory, 'Preferences'), root);
      const securePreference = await reader.read(path.join(directory, 'Secure Preferences'), root);
      const settings = { ...preference?.extensions?.settings, ...securePreference?.extensions?.settings };
      const extensions = directoryEntries(await reader.list(path.join(directory, 'Extensions'), root));
      for (const extension of extensions.filter(entry => /^[a-p]{32}$/.test(entry.name))) {
        for (const version of directoryEntries(await reader.list(path.join(directory, 'Extensions', extension.name), root))) {
          const extensionPath = path.join(directory, 'Extensions', extension.name, version.name);
          const manifest = await reader.read(path.join(extensionPath, 'manifest.json'), root);
          if (!manifest || !safeVersion(manifest.version)) { reader.malformed(); continue; }
          const setting = settings[extension.name];
          // IDの有効状態を全残存版へ流用せず、設定中の版/pathと同じ実物だけに結び付ける。
          const configuredPath = typeof setting?.path === 'string' && setting.path.length <= 4096 ? path.resolve(path.join(directory, 'Extensions'), setting.path) : null;
          const configuredVersion = safeVersion(setting?.manifest?.version);
          const selected = configuredPath ? configuredPath === extensionPath : configuredVersion ? configuredVersion === manifest.version : null;
          const active = setting?.state === 0 || setting?.state === 2 ? false : setting?.state === 1 && selected !== null ? selected : null;
          result.browserExtensions.push({ browser, profile: cleanText(profile.name), id: extension.name, name: cleanText(manifest.name), version: safeVersion(manifest.version), path: extensionPath, active, evidenceKind: 'installed-metadata', enablementEvidence: active === null ? 'version-enablement-unconfirmed' : 'version-bound-preferences' });
        }
      }
    }
    reader.finish(result.browserExtensions.length - start, { root });
  }
  const firefoxRoots = [path.join(ctx.home, 'Library/Application Support/Firefox'), ...(ctx.config.browserProfiles || []).filter(item => item.product === 'firefox').map(item => item.root)];
  for (const root of firefoxRoots) {
    const reader = metadataReader(ctx, result, 'firefox-extensions'), start = result.browserExtensions.length;
    const ini = await reader.read(path.join(root, 'profiles.ini'), root, 'text', { maxBytes: 128000 });
    if (ini !== null) {
      if (ini.split('\n').some(line => line.length > 65536)) reader.malformed();
      else {
        const profiles = []; let current;
        for (const line of ini.split(/\r?\n/)) {
          if (/^\[Profile\d+\]$/.test(line)) { current = {}; profiles.push(current); }
          else if (/^\[/.test(line)) current = null;
          else if (current) { const match = line.match(/^(Path|IsRelative|Name)=(.*)$/); if (match) current[match[1]] = match[2]; }
        }
        for (const profile of reader.limit(profiles, 100)) {
          const target = profile.IsRelative === '1' ? path.resolve(root, profile.Path || '.') : profile.Path;
          if (!target || !path.isAbsolute(target) || !within(root, target)) { reader.issue(new SweepError('BOUNDARY', { cause: 'boundary' })); continue; }
          const data = await reader.read(path.join(target, 'extensions.json'), root);
          if (!data) continue;
          if (!Array.isArray(data.addons)) { reader.malformed(); continue; }
          for (const extension of reader.limit(data.addons, 2000)) {
            if (!safeIdentifier(extension.id) || !safeVersion(extension.version)) { reader.malformed(); continue; }
            result.browserExtensions.push({ browser: 'firefox', profile: cleanText(profile.Name), id: extension.id, name: cleanText(extension.defaultLocale?.name), version: extension.version, active: extension.userDisabled === true || extension.appDisabled === true || extension.softDisabled === true ? false : typeof extension.active === 'boolean' ? extension.active : null, path: target, evidenceKind: 'installed-metadata' });
          }
        }
        if (!profiles.length) reader.malformed();
      }
    }
    reader.finish(result.browserExtensions.length - start, { root });
  }
  const safari = metadataReader(ctx, result, 'safari-extensions'), start = result.browserExtensions.length;
  const safariRoots = result.applications.map(app => ({ directory: path.join(app.path, 'Contents/PlugIns'), root: app.path }));
  safariRoots.push(...(ctx.config.browserProfiles || []).filter(item => item.product === 'safari').map(item => ({ directory: item.root, root: item.root })));
  for (const { directory, root } of safariRoots) {
    for (const entry of directoryEntries(await safari.list(directory, root)).filter(item => item.name.endsWith('.appex'))) {
      const file = path.join(directory, entry.name, 'Contents/Info.plist');
      const data = await safari.plist(file, root);
      if (!data) continue;
      if (!/^(?:com\.apple\.Safari\.extension|com\.apple\.Safari\.web-extension)$/.test(data.NSExtension?.NSExtensionPointIdentifier || '')) continue;
      if (!safeIdentifier(data.CFBundleIdentifier) || !safeVersion(data.CFBundleShortVersionString || data.CFBundleVersion)) { safari.malformed(); continue; }
      result.browserExtensions.push({ browser: 'safari', id: data.CFBundleIdentifier, name: cleanText(data.CFBundleName), version: safeVersion(data.CFBundleShortVersionString || data.CFBundleVersion), active: null, path: path.dirname(path.dirname(file)), evidenceKind: 'installed-metadata', enablementEvidence: 'unknown' });
    }
  }
  safari.finish(result.browserExtensions.length - start, { reason: 'Safari appex metadataを確認。有効状態は安全な既存metadataで確認できないためunknownです。' });
}

/** 各エディタの拡張metadataを読む。CLIやextension codeは起動しない。 @example await collectEditorExtensions(ctx, result); */
export async function collectEditorExtensions(ctx, result) {
  const roots = [['vscode', '.vscode/extensions'], ['cursor', '.cursor/extensions'], ['vscode-insiders', '.vscode-insiders/extensions']].map(([editor, relative]) => ({ editor, root: path.join(ctx.home, relative) }));
  roots.push(...(ctx.config.editorRoots || []));
  // Portableの公式data/extensionsを、既に確認したアプリに限って追加する。
  for (const app of result.applications) if (/Visual Studio Code|Cursor/i.test(app.name || '')) roots.push({ editor: /Cursor/i.test(app.name) ? 'cursor-portable' : 'vscode-portable', root: path.join(path.dirname(app.path), 'code-portable-data/extensions') });
  for (const { editor, root } of roots) {
    const reader = metadataReader(ctx, result, `${editor}-extensions`), start = result.extensions.length;
    const registry = await reader.read(path.join(root, 'extensions.json'), root);
    if (registry !== null && !Array.isArray(registry)) reader.malformed();
    const listing = await reader.list(root);
    for (const entry of directoryEntries(listing).filter(item => !item.name.startsWith('.'))) {
      const extensionPath = path.join(root, entry.name), data = await reader.read(path.join(extensionPath, 'package.json'), root);
      const id = `${data?.publisher || ''}.${data?.name || ''}`.toLowerCase();
      if (!data || !/^[\w-]+\.[\w.-]+$/.test(id) || !safeVersion(data.version)) { reader.malformed(); continue; }
      const registration = Array.isArray(registry) ? registry.find(item => item.identifier?.id?.toLowerCase() === id && item.version === data.version) : null;
      const metadata = registration?.metadata || data.__metadata || {};
      const timestamp = Number(metadata.installedTimestamp);
      // extensions.jsonは導入登録であり、profile/workspaceのenablementを証明しない。
      result.extensions.push({ editor, id, version: data.version, source: extensionSource(metadata.source), marketplace: 'not-verified-from-registry', installedAt: Number.isFinite(timestamp) && timestamp > 0 && timestamp < 8.64e15 ? new Date(timestamp).toISOString() : null, installedAtBasis: 'registry-installedTimestamp-or-unknown', path: extensionPath, active: null, registered: Array.isArray(registry) ? Boolean(registration) : null, enablementEvidence: 'profile-enablement-unconfirmed', presentOnDisk: true, evidenceKind: 'installed-metadata' });
    }
    reader.finish(result.extensions.length - start, { root });
  }
  for (const app of result.applications.filter(item => /Zed|Sublime|IntelliJ|PyCharm|WebStorm|Emacs/i.test(item.name || ''))) result.coverage.push({ area: 'other-editor-extensions', status: 'unsupported', product: app.name, reason: 'エディタを検出しましたが、この製品の拡張metadata readerは未対応です。' });
}

/** npmの既存manifestをコード実行なしで読む。runtime readerから呼ぶ。 @example await collectNodePackages(ctx, result, reader, root); */
async function collectNodePackages(ctx, result, reader, directory, root = directory) {
  const listing = await reader.list(directory, root);
  const lock = await reader.read(path.join(directory, '.package-lock.json'), root);
  const lockUnverified = lock === null && reader.status !== 'absent';
  const candidates = [];
  for (const entry of directoryEntries(listing).filter(item => !item.name.startsWith('.'))) {
    if (entry.name.startsWith('@')) for (const child of directoryEntries(await reader.list(path.join(directory, entry.name), root))) candidates.push(path.join(directory, entry.name, child.name));
    else candidates.push(path.join(directory, entry.name));
  }
  for (const candidate of reader.limit(candidates, 5000)) {
    const data = await reader.read(path.join(candidate, 'package.json'), root);
    if (!data || !/^(@[\w.-]+\/)?[\w.-]+$/.test(data.name || '') || !safeVersion(data.version)) { reader.malformed(); continue; }
    const record = lock?.packages?.[`node_modules/${data.name}`] || lock?.packages?.[data.name];
    const references = [data._resolved, data.resolved, record?.version === data.version ? record.resolved : null].filter(value => value !== undefined && value !== null);
    const from = typeof data._from === 'string' ? data._from : '';
    const fromUrl = from.match(/(?:^|@)(https?:\/\/.+)$/i)?.[1];
    const knownPrivate = /(?:^|@)(?:file:|link:|workspace:|git(?:\+|:|@)|ssh:|github:|gitlab:|bitbucket:|\.{1,2}\/)/i.test(from)
      || Boolean(fromUrl && !publicNpm(fromUrl)) || data._from !== undefined && typeof data._from !== 'string';
    const origins = references.map(publicNpm), explicitPrivate = data.private === true || knownPrivate || origins.some(value => value !== true) || lockUnverified;
    const origin = explicitPrivate ? false : origins.length ? true : null;
    result.globalPackages.push({ ecosystem: 'npm', name: data.name, version: data.version, private: data.private === true, explicitPrivate, publicRegistry: origin, origin: origin === true ? 'public' : origin === false ? 'private' : 'unknown', evidence: path.join(candidate, 'package.json'), evidenceKind: 'installed-metadata' });
  }
}

/** Python環境のMETADATAを静的に読む。import/pip/activationを実行しない。 @example await collectPythonEnvironment(ctx, result, reader, environment, root); */
async function collectPythonEnvironment(ctx, result, reader, environment, root, manager) {
  const config = await reader.read(path.join(environment, 'pyvenv.cfg'), root, 'text', { maxBytes: 128000 });
  let version = config?.match(/^version(?:_info)?\s*=\s*([\d.]+)/m)?.[1];
  const headers = await reader.list(path.join(environment, 'include'), root);
  for (const header of directoryEntries(headers).filter(entry => /^python\d+\.\d+$/.test(entry.name))) {
    const text = await reader.read(path.join(environment, 'include', header.name, 'patchlevel.h'), root, 'text', { maxBytes: 128000 });
    const pieces = ['MAJOR', 'MINOR', 'MICRO'].map(part => text?.match(new RegExp(`^#define PY_${part}_VERSION\\s+(\\d+)`, 'm'))?.[1]);
    if (pieces.every(Boolean)) version = pieces.join('.');
  }
  const lib = await reader.list(path.join(environment, 'lib'), root);
  const sites = directoryEntries(lib).filter(entry => /^python\d+\.\d+$/.test(entry.name)).map(entry => path.join(environment, 'lib', entry.name, 'site-packages'));
  const directSite = path.join(environment, 'lib/python/site-packages');
  sites.push(directSite);
  if (config !== null || lib) {
    if (!version) reader.issues.push('partial');
    result.runtimes.push({ name: 'python', version: safeVersion(version) || null, manager, path: environment, componentStatus: version ? 'complete' : 'detected-version-unknown', evidenceKind: 'installed-metadata' });
  }
  for (const site of sites) {
    for (const entry of directoryEntries(await reader.list(site, root)).filter(item => item.name.endsWith('.dist-info'))) {
      const file = path.join(site, entry.name, 'METADATA'), text = await reader.read(file, root, 'text', { maxBytes: 2 * 1024 ** 2 });
      const name = text?.match(/^Name:\s*([\w.-]+)\s*$/m)?.[1], packageVersion = text?.match(/^Version:\s*([\w.+!:-]+)\s*$/m)?.[1];
      if (!name || !safeVersion(packageVersion)) { reader.malformed(); continue; }
      const direct = await reader.read(path.join(site, entry.name, 'direct_url.json'), root);
      // 不在だけが由来不明global例外の条件。存在・不正・拒否を不在へ変換しない。
      const explicitPrivate = direct !== null || reader.status !== 'absent';
      result.globalPackages.push({ ecosystem: 'PyPI', name, version: packageVersion, explicitPrivate, publicRegistry: explicitPrivate ? false : null, origin: explicitPrivate ? 'private' : 'unknown', evidence: file, environment, evidenceKind: 'installed-metadata' });
    }
  }
}

/** 全既知runtime managerを静的metadataで調べる。存在と版の確定を分離する。 @example await collectRuntimes(ctx, result); */
export async function collectRuntimes(ctx, result) {
  result.runtimes.push({ name: 'node', version: process.versions.node, brotli: process.versions.brotli, path: process.execPath, isCurrent: true, manager: 'audit-process', componentStatus: 'complete', evidenceKind: 'running-target-metadata' });
  const managers = [
    ['nvm', '.nvm/versions/node'], ['fnm', '.local/share/fnm/node-versions'], ['fnm', 'Library/Application Support/fnm/node-versions'], ['fnm', '.fnm/node-versions'],
    ['volta', '.volta/tools/image/node'], ['asdf', '.asdf/installs/nodejs'], ['mise', '.local/share/mise/installs/node'],
    ['vite-plus', '.vite-plus/js_runtime/node'], ['vite-plus', '.vite-plus/node'], ['vite-plus', '.vite-plus/installs/node'],
  ].map(([family, relative]) => ({ family, root: path.join(ctx.home, relative) }));
  managers.push(...(ctx.config.runtimeRoots || []).filter(item => ['nvm', 'fnm', 'volta', 'asdf', 'mise', 'vite-plus', 'homebrew', 'node'].includes(item.family)));
  for (const prefix of [...new Set(['/opt/homebrew', '/usr/local', ...(ctx.config.homebrewPrefixes || [])])]) {
    const root = systemPath(ctx, path.join(prefix, 'Cellar'));
    const reader = metadataReader(ctx, result, 'homebrew-node-discovery');
    for (const entry of directoryEntries(await reader.list(root)).filter(item => /^node(?:@\d+)?$/.test(item.name))) managers.push({ family: 'homebrew', root: path.join(root, entry.name) });
    reader.finish(managers.filter(item => item.family === 'homebrew').length);
  }
  for (const { family, root } of managers) {
    const reader = metadataReader(ctx, result, `runtime:${family}`), start = result.runtimes.length;
    for (const entry of directoryEntries(await reader.list(root)).filter(item => !item.name.startsWith('.'))) {
      const base = path.join(root, entry.name, family === 'fnm' ? 'installation' : '');
      const binary = await reader.inspect(path.join(base, 'bin/node'), root);
      if (!binary?.metadata.isFile()) continue;
      const header = await reader.read(path.join(base, 'include/node/node_version.h'), root, 'text', { maxBytes: 128000 });
      const pieces = ['MAJOR', 'MINOR', 'PATCH'].map(part => header?.match(new RegExp(`^#define NODE_${part}_VERSION\\s+(\\d+)`, 'm'))?.[1]);
      const version = pieces.every(Boolean) ? pieces.join('.') : null;
      if (!version) reader.issues.push('partial');
      result.runtimes.push({ name: 'node', path: path.join(base, 'bin/node'), version, manager: family, componentStatus: version ? 'complete' : 'detected-version-unknown', evidenceKind: 'installed-metadata' });
      await collectNodePackages(ctx, result, reader, path.join(base, 'lib/node_modules'), root);
    }
    reader.finish(result.runtimes.length - start);
  }
  const nodeGlobals = ['/opt/homebrew/lib/node_modules', '/usr/local/lib/node_modules'].map(root => systemPath(ctx, root));
  nodeGlobals.push(...['.npm-global/lib/node_modules', '.vite-plus/lib/node_modules', '.local/share/pnpm/global/5/node_modules', 'Library/pnpm/global/5/node_modules'].map(relative => path.join(ctx.home, relative)));
  for (const root of nodeGlobals) { const reader = metadataReader(ctx, result, 'global-npm'); const start = result.globalPackages.length; await collectNodePackages(ctx, result, reader, root); reader.finish(result.globalPackages.length - start); }
  const voltaReader = metadataReader(ctx, result, 'volta-packages'), voltaRoot = path.join(ctx.home, '.volta/tools/image/packages'), voltaStart = result.globalPackages.length;
  // Volta公式layoutのpackage imageごとのlib/node_modulesを読む。scoped名も同じ構造で扱う。
  for (const entry of directoryEntries(await voltaReader.list(voltaRoot))) {
    const images = entry.name.startsWith('@') ? directoryEntries(await voltaReader.list(path.join(voltaRoot, entry.name), voltaRoot)).map(child => path.join(voltaRoot, entry.name, child.name)) : [path.join(voltaRoot, entry.name)];
    for (const image of images) for (const relative of ['lib/node_modules', '5/node_modules']) await collectNodePackages(ctx, result, voltaReader, path.join(image, relative), voltaRoot);
  }
  voltaReader.finish(result.globalPackages.length - voltaStart);
  const viteReader = metadataReader(ctx, result, 'vite-plus-packages'), viteRoot = path.join(ctx.home, '.vite-plus/packages');
  const metadataFiles = [];
  for (const entry of (await viteReader.list(viteRoot))?.entries || []) {
    if (entry.file && entry.name.endsWith('.json')) metadataFiles.push(path.join(viteRoot, entry.name));
    else if (entry.directory && entry.name.startsWith('@')) for (const nested of (await viteReader.list(path.join(viteRoot, entry.name), viteRoot))?.entries || []) if (nested.file && nested.name.endsWith('.json')) metadataFiles.push(path.join(viteRoot, entry.name, nested.name));
  }
  for (const file of metadataFiles) {
    const data = await viteReader.read(file, viteRoot);
    if (/^(@[\w.-]+\/)?[\w.-]+$/.test(data?.name || '') && /^[a-f0-9-]{36}$/.test(data?.installId || '')) await collectNodePackages(ctx, result, viteReader, path.join(viteRoot, data.name, data.installId, 'lib/node_modules'), viteRoot);
    else viteReader.malformed();
  }
  viteReader.finish(metadataFiles.length);
  const pythonManagers = [['uv', '.local/share/uv/tools'], ['uv', '.local/share/uv/python'], ['pipx', '.local/share/pipx/venvs'], ['pipx', '.local/pipx/venvs'], ['conda', 'miniconda3/envs'], ['conda', 'anaconda3/envs'], ['conda', '.conda/envs'], ['user-python', 'Library/Python']].map(([family, relative]) => ({ family, root: path.join(ctx.home, relative) }));
  pythonManagers.push(...(ctx.config.runtimeRoots || []).filter(item => ['uv', 'pipx', 'conda', 'python', 'venv'].includes(item.family)));
  for (const { family, root } of pythonManagers) {
    const reader = metadataReader(ctx, result, `runtime:${family}`), start = result.runtimes.length;
    for (const entry of directoryEntries(await reader.list(root))) {
      const environment = path.join(root, entry.name);
      await collectPythonEnvironment(ctx, result, reader, environment, root, family);
      if (family === 'conda') {
        const conda = await reader.list(path.join(environment, 'conda-meta'), root);
        for (const record of conda?.entries.filter(item => item.file && item.name.endsWith('.json')) || []) {
          const file = path.join(environment, 'conda-meta', record.name), data = await reader.read(file, root);
          if (data?.name === 'python' && safeVersion(data.version)) result.runtimes.push({ name: 'python', version: data.version, manager: 'conda', path: environment, evidenceKind: 'installed-metadata' });
          if (safeIdentifier(data?.name) && safeVersion(data.version)) result.globalPackages.push({ ecosystem: 'conda', name: data.name, version: data.version, publicRegistry: null, explicitPrivate: true, evidence: file, evidenceKind: 'installed-metadata' });
          else reader.malformed();
        }
      }
    }
    reader.finish(result.runtimes.length - start);
  }
  const venvReader = metadataReader(ctx, result, 'runtime:project-venv'), venvStart = result.runtimes.length;
  for (const project of result.projectDirectories || []) for (const name of ['.venv', 'venv']) await collectPythonEnvironment(ctx, result, venvReader, path.join(project, name), project, 'project-venv');
  venvReader.finish(result.runtimes.length - venvStart);
  const javaRoots = [systemPath(ctx, '/Library/Java/JavaVirtualMachines'), path.join(ctx.home, 'Library/Java/JavaVirtualMachines'), ...(ctx.config.runtimeRoots || []).filter(item => item.family === 'java').map(item => item.root)];
  for (const root of javaRoots) {
    const reader = metadataReader(ctx, result, 'runtime:java'), start = result.runtimes.length;
    for (const entry of directoryEntries(await reader.list(root))) {
      const release = path.join(root, entry.name, 'Contents/Home/release'), text = await reader.read(release, root, 'text', { maxBytes: 128000 });
      const version = text?.match(/^JAVA_VERSION="([\w.+_-]+)"$/m)?.[1];
      if (text !== null) { if (!safeVersion(version)) reader.malformed(); result.runtimes.push({ name: 'java', version: safeVersion(version), manager: 'jdk', path: path.dirname(release), evidenceKind: 'installed-metadata', componentStatus: version ? 'complete' : 'detected-version-unknown' }); }
    }
    reader.finish(result.runtimes.length - start);
  }
  const rubyRoots = [['rbenv', '.rbenv/versions'], ['rvm', '.rvm/rubies'], ['chruby', '.rubies'], ['asdf-ruby', '.asdf/installs/ruby'], ['mise-ruby', '.local/share/mise/installs/ruby']].map(([family, relative]) => ({ family, root: path.join(ctx.home, relative) }));
  rubyRoots.push(...(ctx.config.runtimeRoots || []).filter(item => ['ruby', 'rbenv', 'rvm', 'chruby', 'asdf-ruby', 'mise-ruby'].includes(item.family)));
  for (const { family, root } of rubyRoots) {
    const reader = metadataReader(ctx, result, `runtime:${family}`), start = result.runtimes.length;
    for (const entry of directoryEntries(await reader.list(root))) {
      const environment = path.join(root, entry.name), include = await reader.list(path.join(environment, 'include'), root);
      let version = null;
      for (const header of directoryEntries(include).filter(item => /^ruby-\d/.test(item.name))) {
        const text = await reader.read(path.join(environment, 'include', header.name, 'ruby/version.h'), root, 'text', { maxBytes: 128000 });
        version = safeVersion(text?.match(/^#define\s+RUBY_VERSION\s+"([\d.]+)"/m)?.[1]) || version;
      }
      const binary = await reader.inspect(path.join(environment, 'bin/ruby'), root);
      if (!binary?.metadata.isFile()) continue;
      const staticVersions = new Set(version ? [version] : []), rubyLib = path.join(environment, 'lib/ruby');
      // installed public headerのAPI版をpatch版と誤認せず、公式rbconfig生成literalだけを静的射影する。
      for (const release of directoryEntries(await reader.list(rubyLib, root)).filter(item => /^\d+\.\d+\.\d+$/.test(item.name))) {
        const releaseRoot = path.join(rubyLib, release.name);
        const rbconfigs = [path.join(releaseRoot, 'rbconfig.rb'), ...directoryEntries(await reader.list(releaseRoot, root)).map(arch => path.join(releaseRoot, arch.name, 'rbconfig.rb'))];
        for (const file of rbconfigs) {
          const text = await reader.read(file, root, 'text', { maxBytes: 1024 * 1024 });
          if (text === null) continue;
          const parts = ['MAJOR', 'MINOR', 'TEENY'].map(part => [...text.matchAll(new RegExp(`^\\s*CONFIG\\["${part}"\\]\\s*=\\s*"(\\d+)"\\s*$`, 'gm'))]);
          if (parts.every(matches => matches.length === 1)) staticVersions.add(parts.map(matches => matches[0][1]).join('.'));
          else reader.malformed();
        }
      }
      version = staticVersions.size === 1 ? [...staticVersions][0] : null;
      if (!version) reader.issues.push('partial');
      result.runtimes.push({ name: 'ruby', version, manager: family, path: path.join(environment, 'bin/ruby'), componentStatus: version ? 'complete' : 'detected-version-unknown', evidenceKind: 'installed-metadata' });
      const gems = path.join(environment, 'lib/ruby/gems');
      for (const gemVersion of directoryEntries(await reader.list(gems, root))) for (const spec of (await reader.list(path.join(gems, gemVersion.name, 'specifications'), root))?.entries.filter(item => item.file && item.name.endsWith('.gemspec')) || []) {
        const file = path.join(gems, gemVersion.name, 'specifications', spec.name), text = await reader.read(file, root, 'text', { maxBytes: 512000 });
        const name = text?.match(/^\s*\w+\.name\s*=\s*["']([\w.-]+)["']/m)?.[1], gemVersionValue = text?.match(/^\s*\w+\.version\s*=\s*(?:Gem::Version\.new\()?\s*["']([\w.+-]+)["']/m)?.[1];
        if (name && safeVersion(gemVersionValue)) result.globalPackages.push({ ecosystem: 'RubyGems', name, version: gemVersionValue, publicRegistry: null, evidence: file, evidenceKind: 'installed-metadata' }); else reader.malformed();
      }
    }
    reader.finish(result.runtimes.length - start);
  }
  const cargoReader = metadataReader(ctx, result, 'cargo-packages'), cargoRoot = path.join(ctx.home, '.cargo');
  const cargo = await cargoReader.read(path.join(cargoRoot, '.crates2.json'), cargoRoot);
  for (const key of Object.keys(cargo?.installs || {})) { const match = key.match(/^([\w-]+) ([\w.+-]+) \((.+)\)$/); if (match) result.globalPackages.push({ ecosystem: 'crates.io', name: match[1], version: match[2], publicRegistry: match[3] === 'registry+https://github.com/rust-lang/crates.io-index', explicitPrivate: match[3] !== 'registry+https://github.com/rust-lang/crates.io-index', evidence: path.join(cargoRoot, '.crates2.json'), evidenceKind: 'installed-metadata' }); else cargoReader.malformed(); }
  cargoReader.finish(Object.keys(cargo?.installs || {}).length);
  const ghReader = metadataReader(ctx, result, 'github-cli-extensions'), ghRoot = path.join(ctx.home, '.local/share/gh/extensions');
  for (const entry of directoryEntries(await ghReader.list(ghRoot))) { const file = path.join(ghRoot, entry.name, 'manifest.json'), data = await ghReader.read(file, ghRoot); result.globalPackages.push({ ecosystem: 'github-cli-extension', name: safeIdentifier(entry.name), version: safeVersion(data?.tag || data?.version), evidence: file, explicitPrivate: true, evidenceKind: 'installed-metadata' }); }
  ghReader.finish(result.globalPackages.filter(item => item.ecosystem === 'github-cli-extension').length);
  result.globalPackages = [...new Map(result.globalPackages.map(item => [`${item.ecosystem}:${item.name}:${item.version}:${item.evidence}`, item])).values()];
}

/** JSONCを文字列の外だけ処理する。VS Code設定読取時に限定利用する。 @example parseJsonc('{"mcp":{}} // comment') */
export function parseJsonc(text) {
  let output = '', quote = false, escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) { output += char; if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quote = false; continue; }
    if (char === '"') { quote = true; output += char; }
    else if (char === '/' && text[index + 1] === '/') { while (index < text.length && text[index] !== '\n') index += 1; output += '\n'; }
    else if (char === '/' && text[index + 1] === '*') { const end = text.indexOf('*/', index + 2); if (end < 0) throw new SweepError('FORMAT', { cause: 'malformed' }); index = end + 1; output += ' '; }
    else if (char === ',') { let next = index + 1; while (/\s/.test(text[next] || '') && next < text.length) next += 1; if (!['}', ']'].includes(text[next])) output += char; }
    else output += char;
  }
  return boundedJson(output);
}

/** MCPの名前と実行basename、クラウド設定の存在だけを収集する。 @example await collectMcpAndCloud(ctx, result); */
export async function collectMcpAndCloud(ctx, result) {
  const files = ['.claude.json', '.cursor/mcp.json', '.openclaw/openclaw.json', 'Library/Application Support/Code/User/mcp.json', 'Library/Application Support/Code/User/settings.json', 'Library/Application Support/Code - Insiders/User/mcp.json'].map(relative => ({ file: path.join(ctx.home, relative), root: path.join(ctx.home, relative.split('/')[0]) }));
  for (const project of result.projectDirectories || []) for (const relative of ['.mcp.json', '.vscode/mcp.json', '.vscode/settings.json']) files.push({ file: path.join(project, relative), root: project });
  for (const { file, root } of files) {
    const reader = metadataReader(ctx, result, 'mcp-json'), start = result.mcpServers.length;
    const text = await reader.read(file, root, 'text');
    if (text !== null) {
      try {
        const data = parseJsonc(text), groups = [data.mcpServers, data.servers, data.mcp?.servers];
        if (file === path.join(ctx.home, '.claude.json')) for (const project of reader.limit(Object.values(data.projects || {}), 1000)) groups.push(project?.mcpServers);
        for (const group of groups.filter(value => value && typeof value === 'object' && !Array.isArray(value))) for (const [name, definition] of reader.limit(Object.entries(group), 2000)) if (definition && typeof definition === 'object' && (definition.command || definition.url || definition.type)) result.mcpServers.push(projectMcpServer(name, definition, file));
      } catch (error) { reader.issue(error, 'FORMAT'); }
    }
    reader.finish(result.mcpServers.length - start, { path: file });
  }
  const reader = metadataReader(ctx, result, 'mcp-toml'), codexRoot = path.join(ctx.home, '.codex'), file = path.join(codexRoot, 'config.toml');
  const text = await reader.read(file, codexRoot, 'text');
  let current;
  if (text !== null) for (const line of text.split('\n')) {
    if (line.length > 65536) { reader.malformed(); break; }
    const header = line.match(/^\s*\[mcp_servers\.([\w.-]+|"[^"\n]{1,100}")\]\s*(?:#.*)?$/);
    if (header) { current = projectMcpServer(header[1].replace(/^"|"$/g, ''), {}, file); result.mcpServers.push(current); }
    else if (/^\s*\[/.test(line)) current = null;
    else if (current) { const scalar = line.match(/^\s*(command|url)\s*=\s*["']([^"']*)["']/); if (scalar?.[1] === 'command') { current.executable = projectMcpServer('', { command: scalar[2] }, '').executable; current.transport = 'stdio'; } else if (scalar?.[1] === 'url') current.transport = 'remote-url-redacted'; }
  }
  reader.finish(result.mcpServers.filter(item => item.configPath === file).length);
  const cloud = metadataReader(ctx, result, 'cloud-config-existence');
  for (const [provider, relative] of [['aws', '.aws/config'], ['aws', '.aws/credentials'], ['azure', '.azure'], ['gcloud', '.config/gcloud'], ['vercel', '.local/share/com.vercel.cli'], ['ssh', '.ssh']]) {
    const target = path.join(ctx.home, relative), metadata = await cloud.inspect(target, path.join(ctx.home, relative.split('/')[0]));
    result.cloudConfigurations.push({ provider, path: target, present: Boolean(metadata), status: metadata ? 'present' : cloud.status, contentRead: false });
  }
  cloud.finish(result.cloudConfigurations.filter(item => item.present).length, { reason: 'クラウド設定は存在のみ。本文・認証値・利用アカウントは取得しません。' });
}

/** Launch/background/cron/shellと現在の限定process metadataを収集する。 @example await collectPersistence(ctx, result); */
export async function collectPersistence(ctx, result) {
  const reader = metadataReader(ctx, result, 'launch-items');
  for (const root of [path.join(ctx.home, 'Library/LaunchAgents'), systemPath(ctx, '/Library/LaunchAgents'), systemPath(ctx, '/Library/LaunchDaemons')]) {
    for (const entry of (await reader.list(root))?.entries.filter(item => item.file && item.name.endsWith('.plist')) || []) {
      const file = path.join(root, entry.name), data = await reader.plist(file, root);
      if (!data || !safeIdentifier(data.Label)) { reader.malformed(); continue; }
      const program = data.Program || data.ProgramArguments?.[0];
      const runtimePaths = projectLaunchRuntimes(data.ProgramArguments, ctx.home);
      const wrapperRoot = path.join(ctx.home, '.openclaw/service-env');
      for (const argument of Array.isArray(data.ProgramArguments) ? data.ProgramArguments : []) {
        if (typeof argument !== 'string' || !within(wrapperRoot, argument) || !argument.endsWith('.sh')) continue;
        const wrapper = await reader.read(argument, wrapperRoot, 'text', { maxBytes: 100000 });
        if (wrapper) runtimePaths.push(...projectLaunchRuntimes([wrapper], ctx.home));
      }
      result.launchItems.push({ path: file, label: safeIdentifier(data.Label), program: typeof program === 'string' ? safeIdentifier(path.basename(program)) : null, runAtLoad: data.RunAtLoad === true, keepAlive: Boolean(data.KeepAlive), runtimePaths: [...new Set(runtimePaths)], evidenceKind: 'installed-metadata' });
    }
  }
  reader.finish(result.launchItems.length);
  const background = metadataReader(ctx, result, 'background-items');
  const dump = await background.command('sfltool', ['dumpbtm'], { timeoutMs: 20000 });
  if (dump) for (const line of background.limit(dump.stdout.split('\n'), 30000)) { const match = line.match(/^\s*(?:Identifier|Bundle Identifier):\s*([\w.-]{1,250})\s*$/); if (match) result.loginItems.push({ id: match[1], source: 'dumpbtm', enabled: null, evidenceKind: 'installed-metadata' }); }
  // SMAppServiceの結果が権限制限されても、既存のLoginItems bundleは静的に確認する。
  for (const app of result.applications) {
    const root = path.join(app.path, 'Contents/Library/LoginItems');
    for (const entry of directoryEntries(await background.list(root, app.path)).filter(item => item.name.endsWith('.app'))) {
      const data = await background.plist(path.join(root, entry.name, 'Contents/Info.plist'), app.path);
      if (safeIdentifier(data?.CFBundleIdentifier)) result.loginItems.push({ id: data.CFBundleIdentifier, source: 'static-login-item', path: path.join(root, entry.name), enabled: null, evidenceKind: 'installed-metadata' }); else background.malformed();
    }
  }
  background.finish(result.loginItems.length, { reason: '背景項目の識別子と静的LoginItemsだけを確認。有効状態・権限制限の領域はunknownです。' });
  const hooks = metadataReader(ctx, result, 'cron-shell-hooks');
  const cron = await hooks.command('crontab', ['-l']);
  result.persistence = { cronEntries: cron ? cron.stdout.split('\n').filter(line => line.trim() && !line.trim().startsWith('#')).length : null, shellHooks: [] };
  for (const name of ['.zshrc', '.zprofile', '.zshenv', '.bashrc', '.bash_profile', '.profile']) { const file = path.join(ctx.home, name); const metadata = await hooks.inspect(file, ctx.home); result.persistence.shellHooks.push({ path: file, present: Boolean(metadata), contentRead: false }); }
  hooks.finish(result.persistence.shellHooks.filter(item => item.present).length, { reason: 'cronは行数、shell hookは存在metadataのみ。本文は保存しません。' });
  const processReader = metadataReader(ctx, result, 'processes');
  const raw = await processReader.command('ps', ['-axo', 'pid=,comm=']);
  for (const line of processReader.limit(raw?.stdout.split('\n') || [], 30000)) { const match = line.trim().match(/^(\d+)\s+(.+)$/); if (match) result.processes.push({ pid: Number(match[1]), name: cleanText(path.basename(match[2])), evidenceKind: 'running-target-metadata' }); }
  processReader.finish(result.processes.length);
  const network = metadataReader(ctx, result, 'network');
  const [listening, connected] = await Promise.all([network.command('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-FpcnT']), network.command('lsof', ['-nP', '-iTCP', '-sTCP:ESTABLISHED', '-FpcnT'])]);
  result.network = { listening: parseLsof(listening?.stdout || ''), established: parseLsof(connected?.stdout || '') };
  network.finish(result.network.listening.length + result.network.established.length, { status: 'partial', reason: '現在の利用者に見えるTCP接続のみ。UDP・過去の通信・権限制限の領域は未確認です。' });
  const execution = metadataReader(ctx, result, 'execution-contexts');
  const pids = [...new Set(result.network.listening.filter(item => item.process === 'node').map(item => item.pid))];
  for (const pid of pids.slice(0, 12)) {
    if (!Number.isSafeInteger(pid) || pid <= 0) continue;
    const value = await execution.command('lsof', ['-a', '-p', String(pid), '-d', 'cwd,txt', '-Fn'], { timeoutMs: 3000 });
    const observation = projectProcessFiles(value?.stdout || '', ctx.home, result.projectRoots);
    if (observation.cwd || observation.runtimePath) result.executionContexts.push({ pid, ...observation, observedAt: new Date(ctx.wallNow()).toISOString(), evidenceKind: 'running-target-metadata' });
  }
  execution.finish(result.executionContexts.length, { ...(pids.length > 12 ? { status: 'partial' } : {}), reason: '親processの稼働は依存のロードやデプロイ版の証拠ではありません。' });
}

/** OS保護をstatus専用コマンドとXProtect metadataで確認する。設定は変更しない。 @example await collectProtection(ctx, result); */
export async function collectProtection(ctx, result) {
  const reader = metadataReader(ctx, result, 'os-protection');
  if (ctx.platform !== 'darwin') { reader.finish(0, { status: 'unsupported' }); return; }
  const operations = [['gatekeeper', 'spctl', ['--status'], /assessments enabled/i, /assessments disabled/i], ['sip', 'csrutil', ['status'], /status:\s*enabled/i, /status:\s*disabled/i], ['filevault', 'fdesetup', ['status'], /FileVault is On/i, /FileVault is Off/i], ['firewall', 'firewall', ['--getglobalstate'], /enabled|State = 1/i, /disabled|State = 0/i]];
  for (const [name, operation, args, enabled, disabled] of operations) {
    const value = await reader.command(operation, args);
    result.protection[name] = { status: value ? enabled.test(value.stdout) ? 'enabled' : disabled.test(value.stdout) ? 'disabled' : 'unknown' : 'unknown', evidenceKind: 'installed-metadata' };
  }
  reader.finish(operations.length, { reason: 'status表示だけを使用。Gatekeeperのオンラインassess、権限変更、保護設定の修復は行いません。' });
  const xprotect = metadataReader(ctx, result, 'xprotect');
  for (const root of [systemPath(ctx, '/Library/Apple/System/Library/CoreServices/XProtect.bundle'), systemPath(ctx, '/System/Library/CoreServices/XProtect.bundle'), systemPath(ctx, '/Library/Apple/System/Library/CoreServices/XProtect.app'), systemPath(ctx, '/Library/Apple/System/Library/CoreServices/XProtectFramework.framework')]) {
    const data = await xprotect.plist(path.join(root, 'Contents/Info.plist'), root) || await xprotect.plist(path.join(root, 'Resources/Info.plist'), root);
    if (data) result.protection.xprotect.push({ path: root, version: safeVersion(data.CFBundleShortVersionString || data.CFBundleVersion), bundleId: safeIdentifier(data.CFBundleIdentifier), evidenceKind: 'installed-metadata' });
  }
  xprotect.finish(result.protection.xprotect.length, { ...(result.protection.xprotect.length ? {} : { status: 'partial' }), reason: 'OSの配置差・権限制限を保持。版metadataだけでは最新性や過去の検知を断定しません。' });
}

/** Parse one SBOM identity without turning a binary package into an assumed distro source.
 * Called by {@link projectSbom} after image binding; unknown formats/provenance remain explicit.
 * @example projectSbomComponent({purl:'pkg:deb/debian/openssl@3.0.14-1~deb12u2?arch=source&distro=debian-12', name:'openssl', version:'3.0.14-1~deb12u2', refs:[]})
 */
function projectSbomComponent(component) {
  if (typeof component.purl !== 'string' || component.purl.length > 4096 || !Array.isArray(component.refs)) return null;
  const parsed = /^pkg:([a-z]+)\/([^?#]+)@([^?#]+)(?:\?([^#]*))?$/.exec(component.purl);
  if (!parsed) return null;
  let fullName, version;
  try { fullName = decodeURIComponent(parsed[2]); version = decodeURIComponent(parsed[3]); } catch { return null; }
  if (version !== component.version || !/^[v0-9][A-Za-z0-9.+_!:~\-]{0,119}$/.test(version) || fullName.includes('..')) return null;
  const parameters = new URLSearchParams(parsed[4] || ''), qualifiers = {};
  for (const [key, value] of parameters) {
    if (Object.hasOwn(qualifiers, key) || !['arch', 'distro', 'repository_url', 'upstream'].includes(key) || value.length > 4096) return null;
    qualifiers[key] = value;
  }
  const type = parsed[1], distroType = ['deb', 'apk', 'rpm'].includes(type);
  let name = type === 'maven' ? fullName.replace(/\/(?!.*\/)/, ':') : fullName;
  let ecosystem = ({ npm: 'npm', pypi: 'PyPI', cargo: 'crates.io', gem: 'RubyGems', composer: 'Packagist', maven: 'Maven', nuget: 'NuGet', pub: 'Pub' })[type] || null;
  let distribution = null, distributionRelease = null, sourcePackage = null, sourceVersion = null, distributionConflict = false;
  const architecture = /^[A-Za-z0-9_-]{1,40}$/.test(qualifiers.arch || '') ? qualifiers.arch : null;
  if (distroType) {
    const pieces = fullName.split('/');
    if (pieces.length !== 2 || !/^[a-z0-9][a-z0-9+.-]*$/.test(pieces[1])) return null;
    [distribution, name] = pieces;
    if (!['debian', 'ubuntu', 'alpine', 'redhat', 'rhel', 'centos', 'fedora', 'rocky', 'almalinux'].includes(distribution)) return null;
    const declared = qualifiers.distro || '';
    const debian = { buster: '10', bullseye: '11', bookworm: '12', trixie: '13' };
    if (distribution === 'debian') distributionRelease = debian[declared] || /^(?:debian-)?(10|11|12|13)(?:\.\d+)?$/.exec(declared)?.[1] || null;
    if (distribution === 'alpine') distributionRelease = /^(?:alpine-)?v?(3\.(?:18|19|20|21|22|23|24))(?:\.\d+)?$/.exec(declared)?.[1] || null;
    distributionConflict = Boolean(declared && /^(?:debian|ubuntu|alpine|redhat|rhel|centos|fedora|rocky|almalinux)-/.test(declared) && !declared.startsWith(`${distribution}-`));
    if (type === 'deb' && !['debian', 'ubuntu'].includes(distribution) || type === 'apk' && distribution !== 'alpine'
      || type === 'rpm' && ['debian', 'ubuntu', 'alpine'].includes(distribution)) distributionConflict = true;
    const properties = new Map();
    for (const property of component.properties || []) {
      if (!['syft:metadata:sourceName', 'syft:metadata:sourceVersion', 'syft:metadata:originPackage'].includes(property?.name)) continue;
      if (properties.has(property.name) && properties.get(property.name) !== property.value) distributionConflict = true;
      properties.set(property.name, property.value);
    }
    const upstream = /^([a-z0-9][a-z0-9+.-]*)(?:@([0-9][A-Za-z0-9.+_!:~\-]{0,119}))?$/.exec(qualifiers.upstream || '');
    if (distribution === 'debian' && architecture === 'source') { sourcePackage = name; sourceVersion = version; }
    else if (distribution === 'debian') {
      sourcePackage = properties.get('syft:metadata:sourceName') || upstream?.[1] || null;
      sourceVersion = properties.get('syft:metadata:sourceVersion') || upstream?.[2] || null;
    } else if (distribution === 'alpine') {
      sourcePackage = properties.get('syft:metadata:originPackage') || upstream?.[1] || null;
      sourceVersion = version;
    }
    // Contradictory source names/versions cannot be resolved by taking one producer's preferred field.
    if (upstream && sourcePackage && upstream[1] !== sourcePackage || upstream?.[2] && sourceVersion && upstream[2] !== sourceVersion) distributionConflict = true;
    if (distribution === 'debian' && (properties.has('syft:metadata:sourceName') && properties.get('syft:metadata:sourceName') !== sourcePackage
      || properties.has('syft:metadata:sourceVersion') && properties.get('syft:metadata:sourceVersion') !== sourceVersion)) distributionConflict = true;
    if (!/^[a-z0-9][a-z0-9+.-]{0,199}$/.test(sourcePackage || '')) sourcePackage = null;
    if (!/^[0-9][A-Za-z0-9.+_!:~\-]{0,119}$/.test(sourceVersion || '')) sourceVersion = null;
    if (distributionRelease && sourcePackage && sourceVersion && !distributionConflict) ecosystem = distribution === 'debian' ? `Debian:${distributionRelease}` : distribution === 'alpine' ? `Alpine:v${distributionRelease}` : null;
  }
  if (!safeIdentifier(name) || name !== component.name && !(type === 'maven' && name.split(':').at(-1) === component.name)) return null;
  const queryName = distroType ? sourcePackage : name, queryVersion = distroType ? sourceVersion : version;
  const distributions = component.refs.filter(ref => ['distribution', 'distribution-intake', 'source-distribution'].includes(ref?.type));
  if (qualifiers.repository_url) distributions.push({ type: 'distribution', url: qualifiers.repository_url });
  // An explicit repository branch cannot contradict the package's declared release.
  for (const reference of distroType ? distributions : []) {
    try {
      const url = new URL(reference.url), alpineRelease = /^\/alpine\/v(3\.\d+)(?:\/|$)/.exec(url.pathname)?.[1];
      if (distribution === 'alpine' && alpineRelease && alpineRelease !== distributionRelease) distributionConflict = true;
    } catch { /* Origin validation below rejects malformed references without retaining them. */ }
  }
  if (distributionConflict) ecosystem = null;
  const supported = validPackage({ name: queryName, version: queryVersion, ecosystem });
  // Every declared download origin must belong to the exact ecosystem. A private mirror is never overridden.
  const publicOrigin = supported && distributions.length > 0 && distributions.every(ref => publicResolution(ref.url, ecosystem));
  return { ecosystem, name: queryName || name, version: queryVersion || version, binaryName: distroType ? name : undefined, binaryVersion: distroType ? version : undefined,
    publicRegistry: publicOrigin, explicitPrivate: !publicOrigin, origin: publicOrigin ? 'public' : distributions.length ? 'private' : 'unknown',
    purlType: type, distribution, distributionRelease, architecture, sourcePackage, sourceVersion, distributionConflict,
    provenanceStatus: !supported ? 'unsupported-identity' : publicOrigin ? 'verified-public-record' : 'unverified-origin',
    recordId: safeIdentifier(component.id) || null };
}

/** Bind supported package records to an observed image and retain skipped/unverified coverage.
 * The container reader calls this; a digest alone never proves complete image contents.
 * @example projectSbom(data, new Set(['sha256:' + 'a'.repeat(64)]))
 */
export function projectSbom(data, knownDigests) {
  const digestPattern = /^sha256:[a-f0-9]{64}$/;
  const components = [], binding = [];
  if (data?.bomFormat === 'CycloneDX' && ['1.4', '1.5', '1.6'].includes(data.specVersion)) {
    for (const hash of data.metadata?.component?.hashes || []) if (/^SHA-?256$/i.test(hash.alg || '') && /^[a-f0-9]{64}$/.test(hash.content || '')) binding.push(`sha256:${hash.content}`);
    for (const property of data.metadata?.properties || []) if (property.name === 'container:image:Digest' && digestPattern.test(property.value || '')) binding.push(property.value);
    if (!Array.isArray(data.components)) throw new SweepError('SBOM', { cause: 'malformed', operation: 'sbom' });
    for (const component of data.components) components.push({ purl: component.purl, name: component.name, version: component.version, refs: component.externalReferences || [], properties: component.properties || [], id: component['bom-ref'] });
  } else if (/^SPDX-2\.[23]$/.test(data?.spdxVersion || '')) {
    const documentIds = new Set(data.documentDescribes || []);
    if (!Array.isArray(data.packages)) throw new SweepError('SBOM', { cause: 'malformed', operation: 'sbom' });
    for (const component of data.packages) {
      if (documentIds.has(component.SPDXID)) {
        for (const checksum of component.checksums || []) if (checksum.algorithm === 'SHA256' && /^[a-f0-9]{64}$/.test(checksum.checksumValue || '')) binding.push(`sha256:${checksum.checksumValue}`);
        continue;
      }
      components.push({ purl: component.externalRefs?.find(ref => ref.referenceType === 'purl')?.referenceLocator, name: component.name, version: component.versionInfo, refs: [{ type: 'distribution', url: component.downloadLocation }], id: component.SPDXID });
    }
  } else throw new SweepError('SBOM', { cause: 'unsupported', operation: 'sbom' });
  const bindings = [...new Set(binding)];
  const imageDigest = bindings.length === 1 && knownDigests.has(bindings[0]) ? bindings[0] : null;
  const packages = [];
  let skippedPackages = 0, unsupportedPackages = 0, unknownOrigins = 0, distributionConflicts = 0;
  if (components.length > 15000) throw new SweepError('CAPACITY', { cause: 'limit', operation: 'sbom' });
  for (const component of components) {
    const projected = projectSbomComponent(component);
    if (!projected) { skippedPackages += 1; continue; }
    if (projected.provenanceStatus === 'unsupported-identity') unsupportedPackages += 1;
    if (!projected.publicRegistry) unknownOrigins += 1;
    if (projected.distributionConflict) distributionConflicts += 1;
    packages.push({ ...projected, evidenceKind: imageDigest ? 'digest-bound-sbom' : 'unbound-sbom', imageDigest });
  }
  return { imageDigest, packages, status: imageDigest && !skippedPackages && !unsupportedPackages && !unknownOrigins && !distributionConflicts ? 'complete' : 'partial',
    bound: Boolean(imageDigest), componentCount: components.length, skippedPackages, unsupportedPackages, unknownOrigins, distributionConflicts,
    historyScope: 'supported-records-only' };
}

/** 全既知local socketと既存SBOMを調べる。remote context・exec/pull/buildは使わない。 @example await collectContainersAndSsh(ctx, result); */
export async function collectContainersAndSsh(ctx, result) {
  const ssh = metadataReader(ctx, result, 'ssh-metadata'), sshRoot = path.join(ctx.home, '.ssh');
  result.ssh = { path: sshRoot, files: [], authorizedKeys: { status: 'not-read', lineCount: null } };
  for (const entry of (await ssh.list(sshRoot))?.entries || []) {
    const file = path.join(sshRoot, entry.name), metadata = await ssh.inspect(file, sshRoot);
    if (!metadata) continue;
    result.ssh.files.push({ name: cleanText(entry.name), mode: (metadata.metadata.mode & 0o777).toString(8).padStart(3, '0'), type: metadata.metadata.isDirectory() ? 'directory' : metadata.metadata.isFile() ? 'file' : 'other', size: metadata.metadata.size, modifiedAt: metadata.metadata.mtime.toISOString() });
    if (entry.name === 'authorized_keys') result.ssh.authorizedKeys.status = 'present-content-not-read';
  }
  ssh.finish(result.ssh.files.length, { reason: '鍵・設定本文は読まず、存在・権限・時刻だけを確認します。authorized_keysの行数は本文を開かないためunknownです。' });
  const sockets = [path.join(ctx.home, '.orbstack/run/docker.sock'), path.join(ctx.home, '.docker/run/docker.sock'), systemPath(ctx, '/private/var/run/docker.sock')];
  const knownDigests = new Set();
  for (const socket of sockets) {
    const reader = metadataReader(ctx, result, 'container-endpoint');
    const metadata = await reader.inspect(socket, path.dirname(socket));
    if (!metadata?.metadata.isSocket()) { reader.finish(0, { endpoint: socket }); continue; }
    const images = await reader.command('docker', ['--host', `unix://${socket}`, 'image', 'ls', '--no-trunc', '--format', '{{json .}}'], { allowedSockets: sockets });
    const running = await reader.command('docker', ['--host', `unix://${socket}`, 'ps', '--no-trunc', '--format', '{{json .}}'], { allowedSockets: sockets });
    const start = result.containers.length;
    for (const [kind, raw] of [['image', images], ['running-container', running]]) for (const line of reader.limit(raw?.stdout.split('\n').filter(Boolean) || [], 10000)) {
      try {
        const data = boundedJson(line), id = /^(?:sha256:)?[a-f0-9]{12,64}$/.test(data.ID || '') ? data.ID : null;
        if (!id) { reader.malformed(); continue; }
        if (kind === 'image' && /^sha256:[a-f0-9]{64}$/.test(id)) knownDigests.add(id);
        result.containers.push({ kind, id, image: kind === 'running-container' ? safeIdentifier(data.Image) : null, status: kind === 'running-container' ? /^Up\b/.test(data.Status || '') ? 'running' : 'unknown' : null, repository: kind === 'image' ? safeIdentifier(data.Repository) : null, tag: kind === 'image' ? safeIdentifier(data.Tag) : null, endpoint: socket, evidenceKind: kind === 'image' ? 'installed-metadata' : 'running-target-metadata' });
      } catch (error) { reader.issue(error, 'FORMAT'); }
    }
    reader.finish(result.containers.length - start, { endpoint: socket, imageInterior: 'unknown' });
  }
  const sbom = metadataReader(ctx, result, 'container-sbom');
  for (const file of ctx.config.sbomFiles || []) {
    const root = result.projectRoots.find(item => within(item.path, file))?.path;
    if (!root || !allowedProjectRoot(ctx.home, root)) { sbom.issue(new SweepError('BOUNDARY', { cause: 'boundary' })); continue; }
    const data = await sbom.read(file, root);
    if (!data) continue;
    try {
      const projection = projectSbom(data, knownDigests);
      result.sboms.push({ path: file, imageDigest: projection.imageDigest, bound: projection.bound, status: projection.status, packageCount: projection.packages.length, componentCount: projection.componentCount, skippedPackages: projection.skippedPackages, unsupportedPackages: projection.unsupportedPackages, unknownOrigins: projection.unknownOrigins, distributionConflicts: projection.distributionConflicts, historyScope: projection.historyScope });
      if (projection.status !== 'complete') sbom.issue(new SweepError('SBOM', { cause: 'unsupported', operation: 'sbom' }));
      if (!projection.bound) sbom.issue(new SweepError('SBOM', { cause: 'mismatch', operation: 'sbom' }));
      else result.sbomPackages.push(...projection.packages.map(item => ({ ...item, evidence: file })));
    } catch (error) { sbom.issue(error, 'SBOM'); }
  }
  // A supplied SBOM proves its listed records only; omitted image content remains a separate unknown scope.
  for (const imageDigest of knownDigests) {
    const bound = result.sboms.filter(item => item.imageDigest === imageDigest);
    result.coverage.push({ area: 'container-image-interior', status: 'partial', imageDigest, count: bound.reduce((total, item) => total + item.packageCount, 0),
      reasonCode: bound.length ? 'image-sbom-records-only' : 'image-sbom-missing', reason: bound.length ? 'SBOM掲載パッケージだけを確認。画像内部全体の完全性は未確認。' : '画像digestは観測済みだが、結合できる既存SBOMがなく内容は未確認。' });
  }
  sbom.finish(result.sboms.length, { reason: '既存のCycloneDX/SPDXを画像digestと照合。未結合SBOM・由来未確認のpackageは照会や画像内部の確認完了に使いません。' });
}
