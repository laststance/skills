import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createSafeIO, inspectAncestors, recheckAncestors, LIMITS, within } from './safe-io.mjs';
import { SweepError, safeDiagnostic } from './diagnostics.mjs';
import { createLocalityGuard } from './file-flags.mjs';

const FIXED_GETS = new Set([
  'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
  'https://feeds.feedburner.com/TheHackersNews', 'https://feeds.feedburner.com/GoogleChromeReleases',
  'https://www.bleepingcomputer.com/feed/', 'https://socket.dev/api/blog/feed.json', 'https://www.socket.dev/api/blog/feed.json',
  'https://opensourcemalware.com/rss.xml', 'https://support.apple.com/en-us/100100',
  'https://www.jpcert.or.jp/rss/jpcert.rdf', 'https://www.ipa.go.jp/security/rss/alert.rdf',
  'https://www.security-next.com/feed', 'https://piyolog.hatenadiary.jp/feed',
  'https://cursor.com/blog/claude-code-extension-security-notice', 'https://www.cursor.com/blog/claude-code-extension-security-notice',
  'https://nodejs.org/en/feed/vulnerability.xml',
  'https://www.mozilla.org/en-US/security/known-vulnerabilities/firefox/',
  'https://www.mozilla.org/en-US/security/known-vulnerabilities/firefox-esr/',
  'https://www.mozilla.org/en-US/security/known-vulnerabilities/thunderbird/',
  'https://api.github.com/repos/Homebrew/advisory-database/git/trees/main?recursive=1',
]);
const SYSTEM_TOOLS = Object.freeze({
  sw_vers: '/usr/bin/sw_vers', uname: '/usr/bin/uname', plutil: '/usr/bin/plutil', codesign: '/usr/bin/codesign',
  ps: '/bin/ps', sysctl: '/usr/sbin/sysctl', lsof: '/usr/sbin/lsof', sfltool: '/usr/bin/sfltool',
  crontab: '/usr/bin/crontab', spctl: '/usr/sbin/spctl', csrutil: '/usr/bin/csrutil', fdesetup: '/usr/bin/fdesetup',
  firewall: '/usr/libexec/ApplicationFirewall/socketfilterfw', log: '/usr/bin/log', stat: '/usr/bin/stat',
});
const OPERATIONS = new Set([...Object.keys(SYSTEM_TOOLS), 'brew', 'docker', 'osv-scanner', 'node']);

/** 全段階が共有する待ち行列。中止済み処理を起動せず、完了までslotを保持する。 @example createPool(4, signal, metric) */
function createPool(limit, signal, metric) {
  const queue = [];
  let active = 0;
  function pump() {
    while (queue.length && active < limit) {
      const item = queue.shift();
      if (signal.aborted) { item.reject(new SweepError('DEADLINE', { cause: 'aborted' })); continue; }
      active += 1;
      metric.peak = Math.max(metric.peak, active);
      Promise.resolve().then(item.work).then(item.resolve, item.reject).finally(() => { active -= 1; pump(); });
    }
  }
  signal.addEventListener('abort', pump, { once: true });
  return work => new Promise((resolve, reject) => { queue.push({ work, resolve, reject }); pump(); });
}

/** 固定候補だけから既存ツールを解決する。PATHやproject wrapperを実行しない。 @example resolveTool('brew', {home}) */
export async function resolveTool(operation, { home = homedir(), config = {}, filesystem = fs, platform = process.platform } = {}) {
  if (!OPERATIONS.has(operation)) throw new SweepError('TOOL', { cause: 'unsupported', operation: 'command' });
  const prefixes = [...new Set(['/opt/homebrew', '/usr/local', ...(config.homebrewPrefixes || [])])];
  let candidates = SYSTEM_TOOLS[operation] ? [SYSTEM_TOOLS[operation]] : [];
  if (operation === 'node') candidates = [process.execPath];
  if (operation === 'brew' || operation === 'osv-scanner') candidates = prefixes.map(prefix => path.join(prefix, 'bin', operation));
  if (operation === 'docker') candidates = [path.join(home, '.docker/bin/docker'), '/Applications/Docker.app/Contents/Resources/bin/docker', '/usr/local/bin/docker', '/opt/homebrew/bin/docker', '/Applications/OrbStack.app/Contents/MacOS/xbin/docker'];
  let denied = false;
  let untrusted = false;
  for (const candidate of candidates) {
    try {
      const resolved = await filesystem.realpath(candidate);
      const stat = await filesystem.stat(resolved);
      const ancestry = await inspectAncestors(resolved, filesystem);
      if (ancestry.some(entry => entry.metadata.mode & 0o002)) { untrusted = true; continue; }
      const trusted = SYSTEM_TOOLS[operation] ? resolved === candidate : operation === 'node' ? resolved === await filesystem.realpath(process.execPath)
        : operation === 'docker' ? ['/Applications/Docker.app', '/Applications/OrbStack.app'].some(root => within(root, resolved)) || prefixes.some(root => within(path.join(root, 'Cellar/docker'), resolved))
          : operation === 'osv-scanner' ? prefixes.some(root => within(path.join(root, 'Cellar/osv-scanner'), resolved))
            : prefixes.some(root => resolved === path.join(root, 'bin/brew') || resolved === path.join(root, 'Homebrew/bin/brew'));
      if (!trusted || !stat.isFile() || (stat.mode & 0o022) || stat.uid !== 0 && stat.uid !== process.getuid?.() || !(stat.mode & 0o111)) { untrusted = true; continue; }
      if (operation === 'brew') {
        const prefix = prefixes.find(root => within(root, resolved));
        const layout = path.join(prefix, resolved.includes('/Homebrew/bin/') ? 'Homebrew/Library/Homebrew' : 'Library/Homebrew');
        const metadata = await filesystem.lstat(layout);
        if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o022)) { untrusted = true; continue; }
      }
      await recheckAncestors(ancestry, filesystem);
      return { path: resolved, operation, platform };
    } catch (error) { if (['EACCES', 'EPERM'].includes(error.code)) denied = true; }
  }
  throw new SweepError('TOOL', { operation: 'command', cause: denied ? 'denied' : untrusted ? 'boundary' : 'absent' });
}

/** 有限の読取引数だけを受理する。collectorが任意コマンドを注入できない。 @example validateCommand('spctl', ['--status']) */
export function validateCommand(operation, args, options = {}) {
  if (!Array.isArray(args) || args.length > 32 || args.some(value => typeof value !== 'string' || value.length > 4096 || /[\x00\r\n]/.test(value))) return false;
  const joined = args.join(' ');
  if (operation === 'sw_vers') return args.length === 0 || ['-productVersion', '-buildVersion', '-productName'].includes(joined);
  if (operation === 'stat') return args.length === 3 && args[0] === '-f' && args[1] === '%d:%i:%f' && path.isAbsolute(args[2]);
  if (operation === 'uname') return ['-m', '-s', '-r'].includes(joined);
  if (operation === 'node') return ['--version', '-v'].includes(joined);
  if (operation === 'plutil') return joined === '-convert json -o - -- -' && Buffer.byteLength(options.input || '') <= LIMITS.metadata;
  if (operation === 'codesign') return args.length === 3 && args[0] === '-dv' && args[1] === '--verbose=4' && path.isAbsolute(args[2]) && args[2].endsWith('.app');
  if (operation === 'sysctl') return joined === '-n kern.boottime';
  if (operation === 'ps') return ['-axo pid=,comm=', '-axo pid,comm', '-axo pid,ppid,comm'].includes(joined) || /^-p \d+ -o lstart=$/.test(joined);
  if (operation === 'lsof') return ['-nP -iTCP -sTCP:LISTEN', '-nP -iTCP -sTCP:ESTABLISHED', '-nP -iTCP -sTCP:LISTEN -FpcnT', '-nP -iTCP -sTCP:ESTABLISHED -FpcnT', '-nP -iTCP:4444'].includes(joined) || /^-a -p \d+ -d (?:cwd,txt|cwd|txt) -Fn$/.test(joined);
  if (operation === 'brew') return joined === 'info --json=v2 --installed';
  if (operation === 'sfltool') return joined === 'dumpbtm';
  if (operation === 'crontab') return joined === '-l';
  if (operation === 'spctl') return joined === '--status';
  if (operation === 'csrutil' || operation === 'fdesetup') return joined === 'status';
  if (operation === 'firewall') return ['--getglobalstate', '--getstealthmode', '--getblockall'].includes(joined);
  if (operation === 'docker') {
    const socket = args[1]?.replace(/^unix:\/\//, '');
    return args[0] === '--host' && args[1]?.startsWith('unix://') && Array.isArray(options.allowedSockets) && options.allowedSockets.includes(socket)
      && ['image ls --no-trunc --format {{json .}}', 'ps --no-trunc --format {{json .}}'].includes(args.slice(2).join(' '));
  }
  if (operation === 'osv-scanner') return joined === '--version' || args.slice(0, 8).join(' ') === 'scan source --offline --no-resolve --no-call-analysis=all --all-packages --format=json --config=/dev/null'
    && args.length === 10 && args[8] === '--lockfile' && /^(?:[A-Za-z0-9._-]+:)?\/dev\/fd\/3$/.test(args[9]) && Number.isInteger(options.inputFd);
  if (operation === 'log') return args.length === 11 && args.slice(0, 4).join(' ') === 'show --style json --start' && args[5] === '--end'
    && /^@\d{10}$/.test(args[4]) && /^@\d{10}$/.test(args[6]) && args.slice(7, 10).join(' ') === '--timezone UTC --predicate'
    && args[10] === 'eventMessage CONTAINS "134.209.82.225" OR eventMessage CONTAINS "svc-telemetry" OR eventMessage CONTAINS "com.apple.sysmond"';
  return false;
}

/** 子プロセスの終了まで待ち、期限時はこの処理が起動した子だけ停止する。 @example executeCommand(file, args, options) */
export function executeCommand(file, args, { input, inputFd, signal, timeoutMs = 15000, maxBytes = LIMITS.metadata, home = homedir() } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new SweepError('DEADLINE', { cause: 'aborted', operation: 'command' })); return; }
    const group = process.platform !== 'win32';
    const child = spawn(file, args, { shell: false, cwd: '/', windowsHide: true, detached: group,
      stdio: ['pipe', 'pipe', 'pipe', ...(Number.isInteger(inputFd) ? [inputFd] : [])],
      env: { HOME: home, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'en_US.UTF-8', TZ: 'UTC', XDG_CONFIG_HOME: '/dev/null', XDG_CACHE_HOME: '/dev/null',
        HOMEBREW_NO_AUTO_UPDATE: '1', HOMEBREW_NO_ANALYTICS: '1', HOMEBREW_NO_INSTALL_CLEANUP: '1', HOMEBREW_NO_INSTALL_FROM_API: '1', HOMEBREW_CACHE: '/dev/null', HOMEBREW_LOGS: '/dev/null',
        DOCKER_CONFIG: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
    const stdout = [], stderr = [];
    let bytes = 0, failure = null, killTimer;
    const stop = cause => {
      if (failure) return;
      failure = new SweepError(cause === 'limit' ? 'CAPACITY' : 'COMMAND', { cause, operation: 'command' });
      // この呼出し専用に作ったprocess groupだけを停止し、stdio継承した子孫も回収する。
      const kill = signalName => { try { if (group && Number.isInteger(child.pid)) process.kill(-child.pid, signalName); else child.kill(signalName); } catch {} };
      kill('SIGTERM');
      killTimer = setTimeout(() => kill('SIGKILL'), 250);
      killTimer.unref();
    };
    const abort = () => stop('aborted');
    const timer = setTimeout(() => stop('timeout'), Math.max(1, timeoutMs));
    signal?.addEventListener('abort', abort, { once: true });
    const collect = target => chunk => { bytes += chunk.length; if (bytes > maxBytes) stop('limit'); else target.push(chunk); };
    child.stdout.on('data', collect(stdout)); child.stderr.on('data', collect(stderr));
    child.on('error', () => { failure ||= new SweepError('COMMAND', { cause: 'io', operation: 'command' }); });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    child.once('close', code => {
      clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener('abort', abort);
      if (failure) reject(failure);
      else resolve({ code, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') });
    });
  });
}

/** 固定公開エンドポイントとOSVの射影済みpayloadだけを許可する。 @example validatePublicRequest(url, init) */
export function validatePublicRequest(address, options = {}) {
  let url;
  try { url = new URL(address); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) return false;
  const method = options.method || 'GET';
  if (method === 'POST' && url.href === 'https://api.osv.dev/v1/querybatch') {
    try {
      const body = JSON.parse(options.body);
      return Object.keys(body).join() === 'queries' && Array.isArray(body.queries) && body.queries.length <= 100 && body.queries.every(query =>
        Object.keys(query).every(key => ['package', 'version', 'page_token'].includes(key)) && query.package && Object.keys(query.package).sort().join() === 'ecosystem,name'
        && /^[A-Za-z0-9@][A-Za-z0-9@._/+:\-]{0,249}$/.test(query.package.name) && /^(?:npm|PyPI|crates.io|Go|Maven|Packagist|RubyGems|NuGet|Pub|Hex|Hackage|Debian|Alpine|CRAN|VSCode|VSCode-OpenVSX)$/.test(query.package.ecosystem)
        && typeof query.version === 'string' && /^[A-Za-z0-9][A-Za-z0-9._+!:\-]{0,119}$/.test(query.version)
        && (query.page_token === undefined || typeof query.page_token === 'string' && query.page_token.length <= 4096 && !/[\x00-\x1f]/.test(query.page_token)));
    } catch { return false; }
  }
  if (method !== 'GET' || options.body !== undefined) return false;
  if (FIXED_GETS.has(url.href)) return true;
  if (url.hostname === 'api.osv.dev' && /^\/v1\/vulns\/[A-Za-z0-9][A-Za-z0-9._-]{2,120}$/.test(url.pathname) && !url.search) return options.authorizedIds?.has(url.pathname.split('/').at(-1)) === true;
  if (url.hostname === 'api.github.com' && url.pathname === '/advisories') {
    return [...url.searchParams].every(([key, value]) => ({ type: /^(reviewed|malware)$/, per_page: /^100$/, modified: /^(?:>=)?\d{4}-\d\d-\d\dT[\d:.]+Z(?:\.\.\d{4}-\d\d-\d\dT[\d:.]+Z)?$/, after: /^[A-Za-z0-9_=+\/-]{1,512}$/, before: /^[A-Za-z0-9_=+\/-]{1,512}$/, direction: /^(asc|desc)$/, sort: /^(updated|published)$/ })[key]?.test(value));
  }
  return url.hostname === 'raw.githubusercontent.com' && /^\/Homebrew\/advisory-database\/(?:main|[a-f0-9]{40})\/[A-Za-z0-9@+_./-]+\.json$/.test(url.pathname)
    && !url.pathname.includes('..') && !url.search && options.authorizedPaths?.has(url.pathname) === true;
}

/** 全collectorへ同じ期限・通信・コマンド制限を供給する。巡回開始時に一度生成する。 @example const context = createRunContext({budgetMs:120000}); await context.close(); */
export function createRunContext(options = {}) {
  const home = options.home || homedir();
  const now = options.wallNow || Date.now;
  const monotonic = options.monotonicNow || (() => performance.now());
  const start = options.monotonicStart ?? monotonic();
  const budgetMs = options.budgetMs ?? 1680000;
  if (!Number.isSafeInteger(budgetMs) || budgetMs < 1000 || budgetMs > 1680000) throw new SweepError('CONFIG', { cause: 'limit', operation: 'config' });
  const reserveMs = Math.min(budgetMs, Math.max(10000, Math.min(60000, budgetMs * 0.1)));
  const workMs = Math.max(1, budgetMs - reserveMs);
  const controller = new AbortController();
  const signal = controller.signal;
  const metrics = { commands: { peak: 0 }, scanner: { peak: 0 }, http: { peak: 0 }, hosts: {}, requests: 0, commandCount: 0 };
  const commands = createPool(4, signal, metrics.commands), scanners = createPool(2, signal, metrics.scanner), http = createPool(6, signal, metrics.http);
  const hosts = new Map(), pending = new Set(), tools = new Map(), attempts = new Map();
  const diagnostics = [];
  let githubRemaining = 50;
  const transport = { cooldowns: {} };
  for (const [host, value] of Object.entries(options.previousTransport?.cooldowns || {})) {
    if (['api.github.com', 'api.osv.dev', ...[...FIXED_GETS].map(url => new URL(url).hostname)].includes(host) && Number.isFinite(value) && value > now() && value <= now() + 86400000) transport.cooldowns[host] = value;
  }
  const timer = setTimeout(() => controller.abort(), Math.max(1, workMs - (monotonic() - start)));
  timer.unref();
  const remainingMs = () => Math.max(0, workMs - (monotonic() - start));
  function track(promise) { pending.add(promise); promise.then(() => pending.delete(promise), () => pending.delete(promise)); return promise; }
  function check() { if (signal.aborted || remainingMs() <= 0) { controller.abort(); throw new SweepError('DEADLINE', { cause: 'timeout' }); } }

  async function command(operation, args = [], commandOptions = {}) {
    check();
    if (!validateCommand(operation, args, commandOptions)) throw new SweepError('COMMAND', { cause: 'boundary', operation: 'command' });
    const run = async () => commands(async () => {
      check();
      if (!tools.has(operation)) tools.set(operation, await (operation === 'stat' ? resolveTool : options.toolResolver || resolveTool)(operation, { home, config: options.config, filesystem: options.filesystem, platform: options.platform }));
      metrics.commandCount += 1;
      return (operation === 'stat' ? options.metadataExecuteImpl || executeCommand : options.executeImpl || executeCommand)(tools.get(operation).path, args, { ...commandOptions, home: operation === 'osv-scanner' ? '/dev/null' : home, signal,
        timeoutMs: Math.min(commandOptions.timeoutMs || 15000, remainingMs()), maxBytes: Math.min(commandOptions.maxBytes || LIMITS.metadata, LIMITS.lock) });
    });
    return track(operation === 'osv-scanner' ? scanners(run) : run());
  }

  async function request(address, requestOptions = {}) {
    check();
    if (!validatePublicRequest(address, requestOptions)) throw new SweepError('HTTP', { operation: 'http', cause: 'boundary' });
    const host = new URL(address).hostname;
    if (!hosts.has(host)) { metrics.hosts[host] = { peak: 0 }; hosts.set(host, createPool(2, signal, metrics.hosts[host])); }
    return track(hosts.get(host)(() => http(async () => {
      check();
      if ((transport.cooldowns[host] || 0) > now()) throw new SweepError('HTTP', { cause: 'cooldown', operation: 'http' });
      let response;
      const requestKey = createHash('sha256').update(`${requestOptions.method || 'GET'}:${address}:${requestOptions.body || ''}`).digest('hex');
      for (let attempt = 0; attempt < 2; attempt += 1) {
        check();
        if ((attempts.get(requestKey) || 0) >= 2 || attempts.size >= 10000 && !attempts.has(requestKey)) throw new SweepError('HTTP', { cause: 'limit', operation: 'http' });
        attempts.set(requestKey, (attempts.get(requestKey) || 0) + 1);
        if (host === 'api.github.com' && githubRemaining-- <= 0) throw new SweepError('HTTP', { cause: 'limit', operation: 'http' });
        const timeout = AbortSignal.timeout(Math.max(1, Math.min(requestOptions.timeoutMs || 20000, remainingMs())));
        const combined = AbortSignal.any([signal, timeout]);
        let original;
        try {
          metrics.requests += 1;
          original = await (options.fetchImpl || globalThis.fetch)(address, { method: requestOptions.method || 'GET', body: requestOptions.body,
            redirect: 'error', signal: combined, headers: { Accept: 'application/json, text/html, application/xml;q=0.9', ...(requestOptions.method === 'POST' ? { 'Content-Type': 'application/json' } : {}) } });
          const maxBytes = Math.min(requestOptions.maxBytes || LIMITS.http, LIMITS.http);
          const chunks = []; let bytes = 0;
          const reader = original.body?.getReader?.();
          const abortBody = () => { void reader?.cancel().catch(() => {}); };
          combined.addEventListener('abort', abortBody, { once: true });
          try {
            // 応答本文の最後までslotと期限を保持する。中止時はreader自体をcancelする。
            const append = chunk => {
              bytes += chunk.length;
              if (bytes > maxBytes) throw new SweepError('CAPACITY', { cause: 'limit', operation: 'http' });
              chunks.push(Buffer.from(chunk));
            };
            if (reader) {
              while (!combined.aborted) { const part = await reader.read(); if (part.done) break; append(part.value); }
            } else {
              for await (const chunk of original.body || []) { if (combined.aborted) break; append(chunk); }
            }
            if (combined.aborted) throw new SweepError('HTTP', { cause: 'timeout', operation: 'http' });
          } finally { combined.removeEventListener('abort', abortBody); await reader?.cancel().catch(() => {}); reader?.releaseLock(); }
          const status = original.status || (original.ok === true ? 200 : 500);
          const headers = new Headers(original.headers);
          response = new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), { status, headers });
          if (host === 'api.github.com' && /^\d{1,5}$/.test(headers.get('x-ratelimit-remaining') || '')) githubRemaining = Math.min(githubRemaining, Number(headers.get('x-ratelimit-remaining')));
          if (response.status === 429 || response.status === 403 && githubRemaining <= 0) {
            const retry = headers.get('retry-after');
            const delay = /^\d{1,8}$/.test(retry || '') ? Number(retry) * 1000 : Date.parse(retry) - now();
            const reset = Number(headers.get('x-ratelimit-reset')) * 1000 - now();
            transport.cooldowns[host] = now() + Math.max(1000, Math.min(86400000, Number.isFinite(delay) && delay > 0 ? delay : reset > 0 ? reset : 60000));
            return response;
          }
          if (![502, 503, 504].includes(response.status) || attempt === 1) return response;
        } catch (error) {
          await original?.body?.cancel().catch(() => {});
          if (signal.aborted || error instanceof SweepError || attempt === 1) throw error instanceof SweepError ? error : new SweepError('HTTP', { cause: combined.aborted ? 'timeout' : 'network', operation: 'http' });
        }
      }
      return response;
    })));
  }

  async function close() { clearTimeout(timer); controller.abort(); await Promise.allSettled([...pending]); }
  return { home, platform: options.platform || process.platform, arch: options.arch || process.arch, config: options.config || {}, systemRoot: options.systemRoot,
    runId: options.runId || randomUUID(), startedAt: new Date(now()).toISOString(), wallNow: now, monotonicNow: monotonic, continuationVerified: options.continuationVerified === true,
    budgetMs, reserveMs, signal, remainingMs, check, metrics, diagnostics, transport, command, request, fetch: request,
    io: createSafeIO({ home, filesystem: options.filesystem, signal, beforeRead: options.beforeRead,
      localityGuard: options.localityGuard || createLocalityGuard({ signal, runStat: filename => command('stat', ['-f', '%d:%i:%f', filename], { timeoutMs: 1000, maxBytes: 1024 }) }) }),
    checkpoint: options.checkpoint || (async () => {}),
    record: (error, kind, operation) => { const item = safeDiagnostic(error, kind, operation); if (diagnostics.length < 1000) diagnostics.push(item); return item; },
    close, stop: () => controller.abort(), drain: async () => { await Promise.allSettled([...pending]); } };
}
