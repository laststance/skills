#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { packageKey, planLockfiles } from './assessment.mjs';

const ECOSYSTEMS = new Set(['npm', 'PyPI', 'crates.io', 'Go', 'Packagist', 'RubyGems', 'Maven']);
const PUBLIC_HOSTS = new Set(['registry.npmjs.org', 'registry.yarnpkg.com', 'pypi.org', 'files.pythonhosted.org', 'index.crates.io', 'github.com', 'proxy.golang.org', 'repo.packagist.org', 'packagist.org']);

/**
 * OSV に送れるパッケージ識別子だけを受け入れる。
 * {@link scanPackages} とロックファイル抽出が、URL・ローカル参照・秘密値の送信を防ぐために呼ぶ。
 * @returns 名前・版・エコシステムが許可形式なら true。
 * @example
 * validPackage({ name: 'lodash', version: '4.17.21', ecosystem: 'npm' });
 */
export function validPackage(pkg) {
  return ECOSYSTEMS.has(pkg.ecosystem) && typeof pkg.name === 'string' && pkg.name.length <= 200
    && /^(?:@[a-z0-9_.-]+\/)?[a-zA-Z0-9_.+/-]+$/.test(pkg.name)
    && !pkg.name.includes('..') && typeof pkg.version === 'string'
    && /^[v0-9][a-zA-Z0-9.+_-]{0,149}$/.test(pkg.version)
    && !/^(?:file|git|link|workspace|https?):/i.test(pkg.version);
}

/**
 * 明示的な私有・ローカル・Git 由来だけをグローバル照合から除外する。
 * {@link scanPackages} が呼ぶ。出所不明の通常パッケージは、ユーザーが許可した名前と版だけを照合する。
 * @returns 固定版の最小メタデータを OSV に照合できる場合は true。
 */
export function allowGlobalPackage(pkg) {
  // 棚卸しが非公開由来と記録した項目（例: cargo の path/git インストール）は除外する。
  if (!validPackage(pkg) || pkg.private === true || pkg.explicitPrivate === true || pkg.publicRegistry === false) return false;
  const source = typeof pkg.source === 'string' ? pkg.source : pkg.source?.type || '';
  const sourceType = pkg.sourceType || source;
  if (/(?:^|[:+/\s])(?:local|file|link|workspace|git|private)(?:[:+/\s]|$)/i.test(sourceType)) return false;
  for (const reference of [pkg.resolved, pkg.registry, /^https?:/.test(source) ? source : null]) {
    if (reference && !publicResolution(reference)) return false;
  }
  return true;
}

/**
 * 解決先が明示された場合だけ公開レジストリと照合する。
 * フォールバック抽出がローカル参照や非公開レジストリの名前を外部に送らないために呼ぶ。
 * @returns 公開レジストリの HTTP(S) URL なら true。
 */
function publicResolution(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && PUBLIC_HOSTS.has(url.hostname)
      && !url.username && !url.password && !url.search;
  } catch { return false; }
}

/**
 * osv-scanner がない環境で、対応ロック形式から確定した版だけを抽出する。
 * YAML/TOML の汎用パーサではなく限定した構文を扱うため、不完全な形式は coverage に残す。
 * @param filename - 形式判定に使うファイル名。
 * @param content - ローカルだけで処理し、出力に転載しないロック本文。
 * @returns パッケージ一覧、除外件数、形式対応の状態。
 * @example
 * extractLockfile('package-lock.json', '{"packages":{}}');
 */
export function extractLockfile(filename, content) {
  const packages = [];
  let skipped = 0;
  const add = (name, version, ecosystem, publicSource) => {
    const pkg = { name, version, ecosystem };
    if (publicSource && validPackage(pkg)) packages.push(pkg);
    else skipped++;
  };
  const base = path.basename(filename);
  // npm v2/v3 の解決 URL を使い、workspace と private registry を除外する。
  if (['package-lock.json', 'npm-shrinkwrap.json'].includes(base)) {
    const data = JSON.parse(content);
    if (data.packages) {
      for (const [location, pkg] of Object.entries(data.packages)) {
        if (!location || pkg.link) continue;
        const name = pkg.name || location.split('node_modules/').at(-1);
        add(name, pkg.version, 'npm', publicResolution(pkg.resolved));
      }
      return { packages, skipped, status: skipped ? 'partial' : 'complete' };
    }
    return { packages, skipped, status: 'unsupported', reason: 'npm v1 ロックは外部スキャナが必要' };
  }
  // pnpm の package/snapshot キーだけを抽出し、importer の要求範囲は採用しない。
  if (base === 'pnpm-lock.yaml') {
    let section = '';
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^[a-zA-Z][^ ]*:/.test(line)) section = line.split(':')[0];
      if (section !== 'packages') continue;
      const key = line.match(/^  ['"]?([^\s]+?)['"]?:\s*(?:\{\})?\s*$/)?.[1];
      if (!key) continue;
      const clean = key.replace(/^\//, '').replace(/\([^)]*\)/g, '');
      const parsed = clean.match(/^(@[^/]+\/[^@/]+|[^@/]+)@([^/]+)$/)
        || clean.match(/^(@[^/]+\/[^/]+|[^/]+)\/([^/]+)$/);
      if (!parsed) { skipped++; continue; }
      // tarball の独自 URL があれば公開性が確かでないものを除外する。
      let blockEnd = i + 1;
      while (blockEnd < lines.length && !/^(?:\S|  \S)/.test(lines[blockEnd])) blockEnd++;
      const block = lines.slice(i + 1, blockEnd).join('\n');
      const tarball = block.match(/tarball:\s*['"]?([^\s,'"}]+)/)?.[1];
      add(parsed[1], parsed[2], 'npm', !tarball || publicResolution(tarball));
    }
    return { packages, skipped, status: 'partial', reason: 'pnpm の限定構文抽出。レジストリ設定は読まないため公開性・全形式の確認には限界あり' };
  }
  // Cargo の crates.io source と uv/Poetry の公開 source だけを扱う。
  if (['Cargo.lock', 'uv.lock', 'poetry.lock'].includes(base)) {
    for (const block of content.split(/^\[\[package\]\]\s*$/m).slice(1)) {
      const name = block.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
      const version = block.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
      const source = block.match(/^source\s*=\s*"([^"]+)"/m)?.[1];
      const registry = block.match(/registry\s*=\s*"([^"]+)"/)?.[1];
      const sourceUrl = block.match(/^url\s*=\s*"([^"]+)"/m)?.[1];
      const isPublic = base === 'Cargo.lock' ? /^registry\+https:\/\/(?:github\.com\/rust-lang\/crates.io-index|index\.crates\.io\/?)/.test(source || '')
        : base === 'uv.lock' ? publicResolution(registry) : !/\[package\.source\]/.test(block) || publicResolution(sourceUrl);
      add(name, version, base === 'Cargo.lock' ? 'crates.io' : 'PyPI', isPublic);
    }
    return { packages, skipped, status: 'partial', reason: '限定 TOML 構文の抽出。未対応 source・複数行形式は未確認' };
  }
  if (base === 'Pipfile.lock') {
    const data = JSON.parse(content);
    const sources = new Map((data._meta?.sources || []).map(s => [s.name, publicResolution(s.url)]));
    for (const group of ['default', 'develop']) {
      for (const [name, pkg] of Object.entries(data[group] || {})) {
        const version = /^==(.+)$/.exec(pkg.version || '')?.[1];
        add(name, version, 'PyPI', !pkg.path && !pkg.git && sources.get(pkg.index || 'pypi') === true);
      }
    }
    return { packages, skipped, status: skipped ? 'partial' : 'complete' };
  }
  if (base === 'go.sum') {
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      const [name, rawVersion] = line.split(/\s+/);
      add(name, rawVersion?.replace(/\/go\.mod$/, ''), 'Go', /^(github\.com|golang\.org|google\.golang\.org|gopkg\.in)\//.test(name));
    }
    return { packages, skipped, status: 'partial', reason: 'go.sum は過去の取得版も含む。実際のビルド採用版は未確認' };
  }
  return { packages, skipped, status: 'unsupported', reason: 'この形式の抽出には osv-scanner が必要' };
}

/**
 * 任意のメタデータを落として OSV の最小リクエストを組み立てる。
 * {@link queryOsv} が送信直前に呼び、ローカルパスやファイル本文の混入を防ぐ。
 * @returns 名前・版・API の振り分けに必要なエコシステムだけのペイロード。
 */
export function queryPayload(packages) {
  return { queries: packages.map(pkg => ({ package: { name: pkg.name, ecosystem: pkg.ecosystem }, version: pkg.version })) };
}

/**
 * 固定 OSV エンドポイントへ最小メタデータだけを問い合わせる。
 * {@link scanPackages} が呼ぶ。応答サイズ、時間、ページ打ち切りは明示して不完全な結果を成功扱いしない。
 * @returns パッケージごとのアドバイザリ ID と coverage。
 */
export async function queryOsv(packages, { fetchImpl = fetch, deadline = Date.now() + 240_000 } = {}) {
  const findings = [], coverage = [], successfulKeys = [];
  let queried = 0;
  for (let offset = 0; offset < packages.length; offset += 100) {
    if (Date.now() >= deadline) break;
    const batch = packages.slice(offset, offset + 100);
    try {
      const response = await fetchImpl('https://api.osv.dev/v1/querybatch', { method: 'POST', redirect: 'error',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(queryPayload(batch)),
        signal: AbortSignal.timeout(Math.max(1, Math.min(25_000, deadline - Date.now()))) });
      if (!response.ok) throw new Error('HTTP');
      const body = await response.text();
      if (body.length > 8_000_000) throw new Error('SIZE');
      const json = JSON.parse(body);
      if (!Array.isArray(json.results) || json.results.length !== batch.length) throw new Error('SCHEMA');
      for (let index = 0; index < batch.length; index++) {
        const pkg = batch[index], result = json.results[index];
        for (const vuln of result.vulns || []) {
          if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(vuln.id || '')) continue;
          findings.push({ id: vuln.id, package: { name: pkg.name, ecosystem: pkg.ecosystem }, version: pkg.version,
            modified: vuln.modified || null, advisoryType: /^MAL-/.test(vuln.id) ? 'malware' : 'vulnerability', evidence: pkg.evidence, sourceUrl: `https://osv.dev/vulnerability/${encodeURIComponent(vuln.id)}` });
        }
        if (!result.next_page_token) successfulKeys.push(packageKey(pkg));
        if (result.next_page_token) coverage.push({ area: 'osv-pagination', status: 'partial', reason: 'OSV の追加ページあり。今回の結果は全件ではない', count: 1 });
      }
      queried += batch.length;
    } catch {
      coverage.push({ area: 'osv-batch', status: 'unavailable', reason: 'OSV 問い合わせに失敗、タイムアウトまたは応答形式が不正', count: batch.length });
    }
  }
  coverage.push({ area: 'osv-query', status: queried === packages.length ? 'complete' : 'partial', count: queried, total: packages.length,
    reason: queried === packages.length ? '名前・版・エコシステムだけを照合' : '未照合パッケージあり' });
  return { findings, coverage, queried, successfulKeys };
}

/**
 * 影響版の実物を限定件数で確認する。{@link scanPackages} がOSV照合後に呼び、依存コードを実行しない。
 * @returns ロック記録とは別に保存する実物の名前・版・メタデータパス。
 */
export function inspectInstallations(findings, inventory, { limit = 1200, deadline = Date.now() + 15_000 } = {}) {
  const observations = new Map();
  let examined = 0, truncated = false;
  for (const finding of findings) {
    if (finding.package?.ecosystem !== 'npm' || !validPackage({ ...finding.package, version: finding.version })) continue;
    const key = packageKey({ ...finding.package, version: finding.version });
    if (observations.has(key)) continue;
    const matches = [];
    const roots = [...new Set((finding.evidence || []).filter(file => path.isAbsolute(file) && /(?:pnpm-lock.yaml|package-lock.json|npm-shrinkwrap.json)$/.test(file))
      .flatMap(file => [path.dirname(file), ...(inventory.packageRoots || []).filter(root => root.startsWith(`${path.dirname(file)}/`)).slice(0, 25)]))];
    const canonicalRoots = roots.flatMap(root => { try { return [fs.realpathSync(root)]; } catch { return []; } });
    for (const root of roots) {
      if (examined >= limit || Date.now() >= deadline) { truncated = true; break; }
      examined++;
      const filename = path.join(root, 'node_modules', finding.package.name, 'package.json');
      try {
        const resolved = fs.realpathSync(filename);
        const allowed = canonicalRoots.some(candidate => resolved.startsWith(`${candidate}/`)) && resolved.includes('/node_modules/');
        if (!allowed) continue;
        const metadata = fs.statSync(resolved);
        if (!metadata.isFile() || metadata.size > 1024 * 1024) continue;
        const data = JSON.parse(fs.readFileSync(resolved, 'utf8'));
        if (data.name === finding.package.name && data.version === finding.version) matches.push({ path: filename, version: data.version });
      } catch { /* 不在・権限不足を「依存なし」の判定には使用しない。 */ }
    }
    observations.set(key, matches);
  }
  return { observations, coverage: { area: 'package-installations', status: truncated ? 'partial' : 'complete', count: examined,
    reason: '影響版のnpm package.jsonだけを限定確認。不一致・不在は実行依存の不在を証明しない。依存コードは未実行' } };
}

/**
 * 棚卸しで見つけたロックファイルを、実行せずに解析して OSV に照合する。
 * CLI と検証コードが呼ぶ。スキャナは offline 解析に限定し、外部送信は {@link queryPayload} を通す。
 * @returns 証拠パスを含むローカル用 JSON。秘密値やロック本文は含まない。
 */
export async function scanPackages(inventory, options = {}) {
  const started = Date.now(), budget = Math.min(options.budgetMs || 480_000, 600_000), deadline = started + budget;
  const maxLockfiles = options.maxLockfiles || 400, maxPackages = options.maxPackages || 15000;
  const coverage = [], commands = [], packageMap = new Map();
  const add = (pkg, evidence) => {
    if (!validPackage(pkg)) return;
    const key = `${pkg.ecosystem}\0${pkg.name}\0${pkg.version}`;
    const current = packageMap.get(key) || { name: pkg.name, ecosystem: pkg.ecosystem, version: pkg.version, evidence: [] };
    if (evidence && !current.evidence.includes(evidence)) current.evidence.push(evidence);
    packageMap.set(key, current);
  };
  const previous = options.continuation || {};
  const planned = planLockfiles(inventory.lockfiles || [], previous, (inventory.executionContexts || []).map(context => context.cwd).filter(Boolean));
  const lockfiles = planned.slice(0, maxLockfiles);
  const probe = options.noScanner ? { status: null } : spawnSync('osv-scanner', ['--version'], { encoding: 'utf8', timeout: 5000, maxBuffer: 4096, env: { PATH: process.env.PATH, HOME: process.env.HOME } });
  const scannerPresent = probe.status === 0 && /\b2\./.test(probe.stdout || '');
  commands.push({ command: 'osv-scanner --version', status: scannerPresent ? 'complete' : 'unavailable', exitCode: probe.status });
  let processed = 0, omitted = 0;
  const attempted = new Set(), completed = { ...(previous.completed || {}) };
  // スキャナに渡すのは明示された lockfile のみ。プロジェクト全体や Git 履歴は渡さない。
  for (const lockfile of lockfiles) {
    if (Date.now() >= deadline - 120_000) break;
    const filename = typeof lockfile === 'string' ? lockfile : lockfile.path;
    if (typeof filename !== 'string' || !path.isAbsolute(filename)) continue;
    attempted.add(filename);
    completed[filename] = `${lockfile.size ?? ''}:${lockfile.modifiedAt ?? ''}`;
    try {
      const stat = fs.lstatSync(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 25_000_000) {
        coverage.push({ area: 'lockfile', path: filename, status: 'partial', reason: '通常ファイル以外、または 25 MB 上限超過' }); continue;
      }
      let extracted = false;
      // スキャナが source 情報を省略する形式でも、ロックに明示された私有 URL を許可しない。
      const localPolicy = extractLockfile(filename, fs.readFileSync(filename, 'utf8'));
      const permitted = localPolicy.status === 'unsupported' ? null : new Set(localPolicy.packages.map(pkg => `${pkg.ecosystem}\0${pkg.name}\0${pkg.version}`));
      if (scannerPresent && !options.noScanner) {
        const argv = ['scan', 'source', '--offline', '--no-resolve', '--no-call-analysis=all', '--all-packages', '--format=json', '--config=/dev/null', '--lockfile', filename];
        const time = Date.now();
        const result = spawnSync('osv-scanner', argv, { encoding: 'utf8', timeout: 20_000, maxBuffer: 20_000_000,
          env: { PATH: process.env.PATH, HOME: process.env.HOME, NO_COLOR: '1' } });
        commands.push({ command: `osv-scanner scan source --offline --no-resolve --no-call-analysis=all --all-packages --format=json --config=/dev/null --lockfile ${JSON.stringify(filename)}`, status: result.error ? 'unavailable' : 'complete', exitCode: result.status, elapsedMs: Date.now() - time });
        try {
          const data = JSON.parse(result.stdout);
          if (Array.isArray(data.results)) {
            let count = 0, skipped = 0;
            for (const source of data.results) {
              for (const entry of source.packages || []) {
                const pkg = entry.package || {};
                // pnpm 等は source 注記を持たないため通常の registry 識別子を許容し、明示した私有・ローカル source は除外する。
                const explicitSource = /(?:[?&])source=([^&]+)/.exec(pkg.purl || '')?.[1];
                const registry = !explicitSource || explicitSource === 'PUBLIC_REGISTRY';
                const permittedByLock = !permitted || permitted.has(`${pkg.ecosystem}\0${pkg.name}\0${pkg.version}`);
                if (registry && permittedByLock && validPackage(pkg)) { add(pkg, filename); count++; }
                else skipped++;
              }
            }
            omitted += skipped;
            const unexpectedError = result.status !== 0 && result.status !== 1 && !/no offline version of the OSV database is available/.test(result.stderr || '');
            coverage.push({ area: 'lockfile', path: filename, status: skipped || result.error || unexpectedError || count === 0 ? 'partial' : 'complete', count, skipped,
              reason: 'osv-scanner を通信なしの抽出に使用。offline DB 未保存の非ゼロ終了は OSV API で別途照合' });
            extracted = true;
          }
        } catch { /* 抽出失敗は限定パーサにフォールバックし、元の出力は保存しない。 */ }
      }
      if (!extracted) {
        const result = localPolicy;
        for (const pkg of result.packages) add(pkg, filename);
        omitted += result.skipped;
        coverage.push({ area: 'lockfile', path: filename, status: result.status, reason: result.reason || '公開レジストリの固定版を抽出', count: result.packages.length, skipped: result.skipped });
      }
      processed++;
    } catch {
      coverage.push({ area: 'lockfile', path: filename, status: 'unavailable', reason: '読み取り権限、構文、またはファイルの状態により抽出できなかった' });
    }
  }
  // ユーザーが名前・版の送信を許可しているため、通常パッケージは入手元不明でも照合する。
  let unverifiedGlobals = 0;
  for (const pkg of inventory.globalPackages || []) {
    if (allowGlobalPackage(pkg)) {
      add(pkg, typeof pkg.evidence === 'string' ? pkg.evidence : 'グローバルパッケージ');
      if (pkg.publicRegistry !== true && !publicResolution(pkg.resolved || pkg.registry || '')) unverifiedGlobals++;
    } else omitted++;
  }
  coverage.push({ area: 'global-package-origins', status: unverifiedGlobals ? 'partial' : 'complete', count: unverifiedGlobals,
    reason: unverifiedGlobals ? '入手元を独立検証できない通常パッケージも名前・版だけ照合した。明示した私有・ローカル・Git 由来は除外' : '照合対象グローバルパッケージの出所不明項目なし' });
  const pendingKeys = new Set(previous.pendingPackageKeys || []);
  const allPackages = [...packageMap.values()].sort((a, b) => Number(pendingKeys.has(packageKey(b))) - Number(pendingKeys.has(packageKey(a))));
  const catalogSignature = createHash('sha256').update(JSON.stringify(allPackages.map(pkg => [packageKey(pkg), [...pkg.evidence].sort()]).sort())).digest('hex');
  const resumeCycle = previous.catalogSignature === catalogSignature && (previous.pendingPackageKeys || []).length > 0
    && Date.now() - Date.parse(previous.cycleStartedAt) < 86400000;
  const currentPackages = new Map(allPackages.map(pkg => [packageKey(pkg), pkg]));
  const completedKeys = new Set((resumeCycle ? previous.completedPackageKeys || [] : []).filter(key => currentPackages.has(key)));
  const packages = allPackages.filter(pkg => !completedKeys.has(packageKey(pkg))).slice(0, maxPackages);
  coverage.push({ area: 'lockfiles', status: processed === (inventory.lockfiles || []).length ? 'complete' : 'partial', deferred: attempted.size < planned.length, count: processed, total: planned.length, elapsedMs: Date.now() - started,
    reason: '未処理ファイルを継続情報に保存し、次回は現在の棚卸し内の残りから再開' });
  coverage.push({ area: 'package-extraction', status: omitted ? 'partial' : 'complete', count: allPackages.length, total: allPackages.length, skipped: omitted,
    reason: '明示された非公開・ローカル参照・未対応形式・件数制限を除外。通常 registry の名前と版のみ送信。source のない pnpm 等は公開性を独立検証できない' });
  const response = options.offline ? { findings: [], successfulKeys: [], coverage: [{ area: 'osv-query', status: 'skipped', reason: '検証用 offline 指定' }] } : await queryOsv(packages, { deadline, fetchImpl: options.fetchImpl });
  coverage.push(...response.coverage.filter(entry => entry.area !== 'osv-query'));
  if (!options.offline) commands.push({ command: 'POST https://api.osv.dev/v1/querybatch （名前・版・エコシステムのみ、100 件ずつ）', status: response.coverage.some(c => c.status !== 'complete') ? 'partial' : 'complete', count: response.queried });
  const success = new Set(options.offline ? packages.map(packageKey) : response.successfulKeys);
  for (const key of success) completedKeys.add(key);
  const pendingPackages = allPackages.filter(pkg => !completedKeys.has(packageKey(pkg)));
  const queriedNow = new Set(packages.map(packageKey));
  // 継続キャッシュも現在の許可対象と交差させ、未知の追加フィールドや古い証拠元を復元しない。
  const cachedFindings = (resumeCycle ? previous.findingCache || [] : []).flatMap(finding => {
    const key = packageKey({ ...finding.package, version: finding.version }), current = currentPackages.get(key);
    if (!current || queriedNow.has(key) || !/^[A-Za-z0-9_.:-]{1,160}$/.test(finding.id || '')) return [];
    return [{ id: finding.id, package: { name: current.name, ecosystem: current.ecosystem }, version: current.version,
      modified: typeof finding.modified === 'string' ? finding.modified : null, advisoryType: finding.advisoryType === 'malware' || /^MAL-/.test(finding.id) ? 'malware' : 'vulnerability',
      evidence: current.evidence, sourceUrl: `https://osv.dev/vulnerability/${encodeURIComponent(finding.id)}` }];
  });
  const findings = [...cachedFindings, ...response.findings];
  coverage.push(options.offline ? response.coverage.find(entry => entry.area === 'osv-query') : { area: 'osv-query', status: pendingPackages.length ? 'partial' : 'complete',
    deferred: pendingPackages.length > 0, count: completedKeys.size, total: allPackages.length,
    reason: '同一の抽出対象だけ、24時間以内の処理継続で成功済み照会と陽性結果を保持。対象変更・完了後は新しい巡回として再照会' });
  const deferredFiles = new Set(pendingPackages.flatMap(pkg => pkg.evidence).filter(file => planned.some(lock => (typeof lock === 'string' ? lock : lock.path) === file)));
  const pendingLockfiles = [...new Set([...planned.map(lock => typeof lock === 'string' ? lock : lock.path).filter(file => !attempted.has(file)),
    ...coverage.filter(entry => entry.area === 'lockfile' && entry.status !== 'complete').map(entry => entry.path), ...deferredFiles])];
  const material = options.inspectInstallations === false ? null : inspectInstallations(findings, inventory, { deadline: Math.min(deadline, Date.now() + 15_000) });
  if (material) {
    coverage.push(material.coverage);
    for (const finding of findings) finding.installationEvidence = material.observations.get(packageKey({ ...finding.package, version: finding.version })) || [];
  }
  return { schemaVersion: 1, scannedAt: new Date().toISOString(), elapsedMs: Date.now() - started, packages: allPackages, findings, coverage, commands,
    continuation: { pendingLockfiles, pendingPackageKeys: pendingPackages.map(packageKey), completedPackageKeys: [...completedKeys], catalogSignature,
      cycleStartedAt: resumeCycle ? previous.cycleStartedAt : new Date().toISOString(), findingCache: pendingPackages.length ? findings : [],
      completed: Object.fromEntries(planned.map(lock => typeof lock === 'string' ? lock : lock.path).filter(file => completed[file]).map(file => [file, completed[file]])) } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), index = args.indexOf('--inventory');
    if (args.includes('--help') || args.includes('-h')) {
      process.stdout.write('使い方: node scan-packages.mjs --inventory 棚卸し.json [--state 状態.json] [--offline] [--no-scanner] [--max-lockfiles 件数] [--max-packages 件数] [--budget-ms ミリ秒]\n現在の棚卸し内の未処理分から再開。継続情報を標準出力へ返し、state自体は書き換えません。外部照合は名前・版・ecosystemのみ。--offline は通信なし、--no-scanner は外部スキャナを起動しません。\n');
      process.exit(0);
    }
    if (index < 0 || !args[index + 1]) throw new Error('usage');
    const inventory = JSON.parse(fs.readFileSync(args[index + 1], 'utf8'));
    const numberOption = name => { const at = args.indexOf(name); return at >= 0 ? Number(args[at + 1]) : undefined; };
    const stateIndex = args.indexOf('--state');
    let previous = {};
    if (stateIndex >= 0) { try { previous = JSON.parse(fs.readFileSync(args[stateIndex + 1], 'utf8')); } catch { /* 無効な状態は現在の棚卸しから再開する。 */ } }
    const result = await scanPackages(inventory, { continuation: previous.packageContinuation, offline: args.includes('--offline'), noScanner: args.includes('--no-scanner'), maxLockfiles: numberOption('--max-lockfiles'), maxPackages: numberOption('--max-packages'), budgetMs: numberOption('--budget-ms') });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch {
    process.stdout.write(JSON.stringify({ schemaVersion: 1, error: '実行できません。--inventory JSON パスを指定してください。秘密値を含む例外本文は表示しません。', coverage: [{ area: 'packages', status: 'unavailable' }] }) + '\n');
    process.exitCode = 1;
  }
}
