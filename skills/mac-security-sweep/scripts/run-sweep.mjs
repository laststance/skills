#!/usr/bin/env node
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { assessmentStatus, compareAssessments } from './assessment.mjs';
import { createRunContext } from './runtime.mjs';
import { createStateStore } from './state-store.mjs';
import { parseRunnerArgs, validateProfile } from './configuration.mjs';
import { renderReport, normalizeCoverageEntry } from './report.mjs';
import { normalizeLanguage, resolveLanguage, localizeDiagnostic } from './locale.mjs';
export { renderReport, jstDate } from './report.mjs';
import { safeDiagnostic, causeClass, SweepError } from './diagnostics.mjs';
export { enrichAdvisories } from './advisory-details.mjs';

const SKILL = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * 完了したレポートに対応する状態を組み立てる。失敗した情報源の期間は進めない。
 * @returns 次回の取りこぼしを防ぐ状態JSON。
 */
export function buildNextState(previous, news, finishedAt, reportPath, allComplete = false, progress = {}) {
  const sourceCursors = { ...(previous.sourceCursors || {}) };
  const sourceContinuations = { ...(previous.sourceContinuations || {}) };
  for (const source of news.sources || []) {
    if (source.windowComplete === true || source.status === 'ok' && source.historicalCoverage !== 'partial') sourceCursors[source.name] = news.sourceCursors?.[source.name] || source.window?.until || news.window?.until;
    else if (!sourceCursors[source.name]) sourceCursors[source.name] = source.window?.since || news.window?.since;
    if (news.sourceContinuations?.[source.name]) sourceContinuations[source.name] = news.sourceContinuations[source.name];
    else if (source.status === 'ok' || source.windowComplete === true) delete sourceContinuations[source.name];
  }
  const completeNews = (news.sources || []).length > 0 && news.sources.every(source => source.status === 'ok' && source.historicalCoverage !== 'partial');
  const runStatus = typeof allComplete === 'string' ? allComplete : allComplete ? 'complete' : 'partial';
  const newsFallbackSince = (news.sources || []).length ? undefined : previous.newsFallbackSince || news.window?.since || previous.lastRunAt || new Date(Date.parse(finishedAt) - 30 * 86400000).toISOString();
  return { schemaVersion: 1, ...previous, lastRunAt: finishedAt, lastReport: reportPath, sourceCursors, sourceContinuations,
    newsFallbackSince,
    ...(runStatus !== 'partial' && completeNews ? { lastSuccessfulAt: finishedAt } : {}), lastRunStatus: completeNews ? runStatus : 'partial',
    ...(progress.packages?.continuation ? { packageContinuation: progress.packages.continuation } : {}),
    ...(progress.details?.continuation ? { advisoryContinuation: progress.details.continuation } : {}),
    ...(progress.changes?.snapshot ? { assessmentSnapshot: progress.changes.snapshot } : {}),
    ...(progress.inventory?.discoveryContinuation ? { discoveryContinuation: progress.inventory.discoveryContinuation } : {}),
    ...(news.baselines ? { productBaselines: news.baselines } : {}),
    ...(news.adaptiveContinuation ? { adaptiveNews: news.adaptiveContinuation } : {}),
    ...(progress.transport ? { transport: progress.transport } : {}),
    ...(progress.locale ? { locale: progress.locale } : {}) };
}

/** 既存CLIと試験から同じimported stageを組み立てる。stageごとの子Nodeを起動しない。 @example await defaultStages() */
async function defaultStages() {
  const [inventoryModule, newsModule, packageModule, iocModule, matchModule, detailModule] = await Promise.all([
    import('./inventory.mjs'), import('./fetch-news.mjs'), import('./scan-packages.mjs'), import('./check-iocs.mjs'), import('./match.mjs'), import('./advisory-details.mjs'),
  ]);
  return { inventory: inventoryModule.inventory, news: newsModule.fetchNews, adaptive: newsModule.fetchAdaptiveNews, mergeNews: newsModule.mergeNews,
    packages: packageModule.scanPackages, iocs: iocModule.checkIocs, match: matchModule.matchInventory, details: detailModule.enrichAdvisories };
}

/** 全stageの観測を共有contextで集め、report-backed世代を保存する。通常CLIと隔離E2Eが呼ぶ。 @example await runSweep({budgetMs:120000}) */
export async function runSweep(options = {}) {
  const home = options.home || homedir();
  validateProfile(options.profile);
  if (options.language !== undefined) normalizeLanguage(options.language);
  if (options.conversationLanguage !== undefined) normalizeLanguage(options.conversationLanguage);
  const monotonicNow = options.monotonicNow || (() => performance.now()), preflightStarted = monotonicNow();
  const budgetMs = options.budgetMs ?? 1680000, reserve = Math.max(10000, Math.min(60000, budgetMs * 0.1));
  if (!Number.isSafeInteger(budgetMs) || budgetMs < 12000 || budgetMs > 1680000) throw new SweepError('CONFIG', { cause: 'limit', operation: 'config' });
  const checkPreflight = () => { if (monotonicNow() - preflightStarted >= budgetMs - reserve) throw new SweepError('DEADLINE', { cause: 'timeout', operation: 'state' }); };
  const store = await createStateStore({ home, profile: options.profile, runId: options.runId, filesystem: options.filesystem, identityProvider: options.identityProvider, onBoundary: options.onBoundary, checkPreflight });
  let context, closing = false, saveQueue = Promise.resolve(), lastCheckpoint = 0, startedMonotonic = 0, firstSavedMs = null, saved;
  const data = {}, previous = store.state;
  const locale = resolveLanguage({ explicit: options.language, conversation: options.conversationLanguage, saved: previous.locale?.requestedLanguage });
  const phaseTimings = {};
  const pending = new Set(['inventory', 'news', 'adaptive', 'packages', 'iocs', 'details']);
  let stages, rules = {};
  try {
    context = createRunContext({ ...options, home, monotonicNow, monotonicStart: preflightStarted, config: store.config, previousTransport: previous.transport, continuationVerified: store.progressVerified,
      checkpoint: async update => {
        if (closing || !update || !['inventory', 'news', 'adaptive', 'packages', 'iocs', 'details'].includes(update.stage)) return;
        data[update.stage] = structuredClone(update.value);
        if (context.monotonicNow() - lastCheckpoint >= 15000) await checkpoint(false);
      } });
    startedMonotonic = preflightStarted;
    stages = options.stages || await defaultStages();
    rules = options.rules || await context.io.readJson(path.join(SKILL, 'references/verified-rules.json'), { roots: [path.join(SKILL, 'references')] });

    /** 未完了・失敗をcoverageに残す。同じ結果から保存状態と冒頭件数を作る。 @example await snapshot(false) */
    function snapshot(final) {
      const inventory = data.inventory || {}, news = stages.mergeNews && data.adaptive ? stages.mergeNews(data.news || {}, data.adaptive) : data.news || {};
      const packages = data.packages || {}, iocs = data.iocs || {}, details = data.details || {};
      // No local judgment exists until the inventory has supplied actual observations.
      const match = data.inventory ? stages.match(inventory, news, { packages, iocEvidence: iocs, advisoryDetails: details, rules, now: new Date(context.wallNow()) })
        : { findings: [], counts: {}, impact: 'unconfirmed', coverage: [], newsAssessment: (news.items || []).map(item => ({ ...item, relevance: '未確認', reasonCode: 'inventory-not-started' })) };
      const sourceCoverage = (news.sources || []).map(source => ({ area: `source:${source.name}`, status: source.status === 'ok' && source.historicalCoverage !== 'partial' ? 'complete' : 'partial', reason: source.reason || source.limit || '情報源の成功と履歴範囲を確認' }));
      const productCoverage = (news.productCoverage || []).map(product => ({ ...product, area: `product:${product.productId || 'unsupported'}` }));
      const coverage = [...[inventory, news, packages, iocs, details, match].flatMap(stage => stage.coverage || []), ...sourceCoverage, ...productCoverage];
      if (!final || pending.size) coverage.push(...[...pending].map(stage => ({ area: stage, status: 'partial', deferred: true, reason: '収集は未完了。完了した観測だけを保存' })));
      const unreviewed = (match.newsAssessment || []).filter(item => item.needsReview).length;
      const pendingCoverage = names => names.filter(name => pending.has(name)).map(area => ({ area, status: 'partial', deferred: true, reasonCode: 'stage-pending' }));
      const collectionCoverage = assessmentStatus([... [inventory, iocs].flatMap(stage => stage.coverage || []), ...pendingCoverage(['inventory', 'iocs'])]);
      const queryCoverage = assessmentStatus([... [news, data.adaptive || {}, packages, details].flatMap(stage => stage.coverage || []), ...sourceCoverage, ...productCoverage, ...pendingCoverage(['news', 'adaptive', 'packages', 'details'])]);
      const changes = compareAssessments(previous.assessmentSnapshot || [], match.findings || [], packages, coverage);
      if (changes.unconfirmed.length) coverage.push({ area: 'previous-positive-evidence', status: 'partial', count: changes.unconfirmed.length, reason: '以前の陽性を今回の範囲で再確認できないため保持。消失・未走査を解消としない' });
      const status = assessmentStatus(coverage, unreviewed);
      const finishedAt = new Date(context.wallNow()).toISOString();
      const commands = [inventory, news, packages, iocs, details].flatMap(stage => stage.commands || []);
      const nextState = buildNextState(store.state, news, finishedAt, '', status, { inventory, packages, details, changes, transport: context.transport, locale });
      // 統合coverageを一度だけreportへ渡し、重複した未確認件数を避ける。
      const uniqueCoverage = [...new Map(coverage.map(normalizeCoverageEntry).map(entry => [`${entry.area}:${entry.status}:${entry.reason || ''}`, entry])).values()];
      const reportMatch = { ...match, coverage: uniqueCoverage };
      const stageStatus = Object.fromEntries(['news', 'inventory', 'adaptive', 'packages', 'iocs', 'details'].map(name => [name, pending.has(name) ? 'pending' : assessmentStatus([...(data[name]?.coverage || []), ...(name === 'news' ? sourceCoverage : name === 'adaptive' ? productCoverage : [])])]));
      const diagnostics = [...new Map([...context.diagnostics, ...coverage.map(entry => entry.diagnostic), ...(news.sources || []).map(source => source.diagnostic)].filter(Boolean).map(item => [JSON.stringify(item), item])).values()].slice(0, 1000);
      const report = renderReport({ diagnostics, locale, stageStatus, phaseTimings, status, collectionCoverage, queryCoverage, inventory, news, packages, iocs, details: { ...details, coverage: [] }, match: reportMatch, changes,
        evidenceDirectory: '.', startedAt: context.startedAt, finishedAt, commands });
      return { evidence: { schemaVersion: 2, runId: context.runId, startedAt: context.startedAt, finishedAt, locale, stageStatus, phaseTimings: structuredClone(phaseTimings), runStatus: status, collectionCoverage, queryCoverage, impact: match.impact || 'unconfirmed',
        inventory, news, packages, iocs, details, match: reportMatch, changes, metrics: context.metrics, diagnostics }, report, nextState, final };
    }

    async function checkpoint(final) {
      const captured = structuredClone(snapshot(final));
      lastCheckpoint = context.monotonicNow();
      saveQueue = saveQueue.then(async () => { saved = { ...await store.commit(captured), evidence: captured.evidence }; firstSavedMs ??= Math.max(0, context.monotonicNow() - startedMonotonic); }).catch(error => {
        context.stop();
        throw error instanceof SweepError ? error : new SweepError('SAVE', { cause: causeClass(error), operation: 'checkpoint', writeOutcome: 'unknown' });
      });
      await saveQueue;
    }

    /** stage失敗を安全な診断と部分結果に変換する。保存失敗は隠さず上位へ返す。 @example await collect('inventory', collectInventory) */
    async function collect(name, work, save = true) {
      try { data[name] = await work(); }
      catch (error) {
        if (error instanceof SweepError && ['MSS_SAVE', 'MSS_LOCK', 'MSS_STATE'].includes(error.diagnostic.code)) { context.stop(); throw error; }
        const detail = context.record(error, name === 'news' || name === 'adaptive' ? 'SOURCE' : 'READER', name === 'news' || name === 'adaptive' ? 'news' : name === 'packages' || name === 'details' ? name : 'inventory');
        data[name] = { ...data[name], coverage: [...(data[name]?.coverage || []), { area: name, status: 'partial', reason: detail.message, diagnostic: detail }] };
      }
      pending.delete(name);
      try { if (save) await checkpoint(false); } catch (error) { context.stop(); throw error; }
      return data[name];
    }

    const newsPhase = context.newsPhase();
    phaseTimings.news = { startedAt: new Date(context.wallNow()).toISOString(), budgetMs: newsPhase.budgetMs };
    try { await collect('news', () => stages.news({ context: newsPhase.context, previous, now: new Date(context.wallNow()), until: context.startedAt }), false); }
    finally { await newsPhase.close(); phaseTimings.news.finishedAt = new Date(context.wallNow()).toISOString(); }
    // The durable news boundary must succeed before the first local reader starts.
    await checkpoint(false);
    if (!context.signal.aborted && context.remainingMs() > 0) {
      phaseTimings.local = { startedAt: new Date(context.wallNow()).toISOString() };
      const inventoryTask = collect('inventory', () => stages.inventory({ context, home, config: store.config, previous }));
      const packageTask = inventoryTask.then(inventory => collect('packages', () => stages.packages(inventory, { context, previous: previous.packageContinuation, state: previous, queryUnknownGlobals: store.config.queryUnknownGlobals })));
      const iocTask = inventoryTask.then(inventory => collect('iocs', () => stages.iocs(inventory, { context, rules, discovery: data.news?.iocDiscovery, since: previous.lastRunAt, until: context.startedAt })));
      const adaptiveTask = inventoryTask.then(inventory => collect('adaptive', () => stages.adaptive
        ? stages.adaptive(inventory, { context, previous, commonNews: data.news, now: new Date(context.wallNow()) }) : Promise.resolve({ coverage: [] })));
      const detailTask = Promise.all([packageTask, adaptiveTask]).then(([packages]) => collect('details', () => stages.details(packages?.findings || [], context.wallNow() + context.remainingMs(), context.request,
        { context, previous: previous.advisoryContinuation, news: stages.mergeNews ? stages.mergeNews(data.news || {}, data.adaptive || {}) : data.news })));
      const settled = await Promise.allSettled([inventoryTask, packageTask, iocTask, adaptiveTask, detailTask]);
      const failed = settled.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
      phaseTimings.local.finishedAt = new Date(context.wallNow()).toISOString();
    }
    closing = true;
    await context.close();
    await saveQueue;
    if (locale.translationStatus === 'pending') context.record(new SweepError('TRANSLATION_PENDING', { operation: 'report' }), 'TRANSLATION_PENDING', 'report');
    await checkpoint(true);
    const evidence = saved.evidence;
    return { ...locale, profile: options.profile || null, firstSavedMs, reportPath: saved.reportPath, reportHash: saved.reportHash, evidenceDirectory: saved.evidenceDirectory, statePath: saved.statePath, generation: saved.generation,
      status: evidence.runStatus, runStatus: evidence.runStatus, collectionCoverage: evidence.collectionCoverage, queryCoverage: evidence.queryCoverage,
      impact: evidence.impact, elapsedMs: Math.max(0, context.monotonicNow() - startedMonotonic), findings: evidence.match.counts || {},
      newsItems: evidence.news.items?.length || 0, scannedPackages: evidence.packages.packages?.length || 0,
      codes: [...new Set(evidence.diagnostics.map(item => item.code))], diagnostics: evidence.diagnostics.map(item => localizeDiagnostic(item, locale.canonicalLanguage)) };
  } finally {
    closing = true;
    await context?.close();
    await saveQueue.catch(() => {});
    await store.close();
  }
}

/** CLIの終了値と秘密を含まない診断を固定する。対話入力は要求しない。 @example await runCli(['--help']) */
export async function runCli(args = process.argv.slice(2), options = {}) {
  const stdout = options.stdout || (value => process.stdout.write(`${value}\n`));
  const stderr = options.stderr || (value => process.stderr.write(`${value}\n`));
  try {
    const parsed = parseRunnerArgs(args);
    if (parsed.help) { stdout('Usage: node scripts/run-sweep.mjs [--budget-ms 120000] [--language EN|JA|es|language-tag] [--profile id]\nRead-only inspection. Reports and state are saved privately under ~/security-reports/ and ~/.local/state/mac-security-sweep/. Exit 2: saved partial result or translation pending. Budget: 12000–1680000 ms.'); return 0; }
    const result = await runSweep({ ...options, ...parsed });
    stdout(JSON.stringify(result));
    for (const item of result.diagnostics) { const detail = localizeDiagnostic(item, result.canonicalLanguage); stderr(`${detail.code} (${detail.operation}): ${detail.message} ${detail.recovery}`); }
    return result.runStatus === 'partial' || result.translationStatus === 'pending' ? 2 : 0;
  } catch (error) {
    const rejected = error instanceof SweepError && ['MSS_USAGE', 'MSS_CONFIG', 'MSS_STATE', 'MSS_LOCK'].includes(error.diagnostic.code);
    const detail = localizeDiagnostic(safeDiagnostic(error, 'INTERNAL', 'cli', rejected ? 'none' : 'unknown'), 'en');
    stderr(`${detail.code} (${detail.operation}): ${detail.message}\n${detail.recovery}`);
    stdout(JSON.stringify({ runStatus: 'failed', code: detail.code, diagnostic: detail }));
    return detail.code === 'MSS_LOCK' ? 75 : ['MSS_USAGE', 'MSS_CONFIG', 'MSS_STATE'].includes(detail.code) ? 64 : 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await runCli();
