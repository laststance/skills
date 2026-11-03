import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runCli, renderReport } from '../scripts/run-sweep.mjs';
import { matchInventory } from '../scripts/match.mjs';

const identityProvider = async () => ({ status: 'live', start: 'fixture-start', boot: 'fixture-boot' });

/** 実際にreport/stateまで保存するため隔離homeだけを作る。 @example const home = await fixture(t) */
async function fixture(t) {
  const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mss-e2e-')));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  return home;
}

/** 公開結果とローカル観測だけを固定し、実assessment/renderer/保存を通す。 @example stages('positive-partial') */
function stages(kind) {
  const partial = kind !== 'complete';
  const positive = kind === 'positive-partial';
  return {
    inventory: async () => ({ applications: [], runtimes: [], extensions: [], lockfiles: [], projectRoots: [],
      coverage: [{ area: 'fixture-collection', status: partial ? 'partial' : 'complete', reason: partial ? '読取制限の架空fixture' : '架空の対象範囲を確認' }] }),
    news: async () => ({ items: [], sources: [{ name: 'CISA KEV', status: 'ok' }], window: { since: '2026-11-01T00:00:00Z', until: '2026-11-03T00:00:00Z' }, coverage: [{ area: 'fixture-news', status: 'complete' }] }),
    adaptive: async () => ({ coverage: [] }), mergeNews: common => common,
    packages: async () => ({ packages: positive ? [{ name: 'example', version: '1.0.0', ecosystem: 'npm' }] : [],
      findings: positive ? [{ id: 'GHSA-fixture-positive', package: { name: 'example', ecosystem: 'npm' }, version: '1.0.0', evidence: [], evidenceKind: 'lock-declaration' }] : [],
      coverage: [{ area: 'fixture-query', status: 'complete' }], continuation: { pendingLockfiles: [] } }),
    iocs: async () => ({ checks: [], coverage: [{ area: 'fixture-ioc', status: 'complete' }] }),
    details: async () => ({ details: [], coverage: [{ area: 'fixture-details', status: 'complete' }], continuation: { pendingIds: [], cache: [] } }),
    match: matchInventory,
  };
}

for (const [kind, exit, status, findings] of [['complete', 0, 'complete', 0], ['partial', 2, 'partial', 0], ['positive-partial', 2, 'partial', 1]]) {
  test(`${kind}のreport・件数・coverage・終了値が同じ保存世代を指す`, async t => {
    // Arrange
    const home = await fixture(t), stdout = [], stderr = [];
    // Act
    const code = await runCli([], { home, stages: stages(kind), rules: {}, identityProvider, stdout: value => stdout.push(value), stderr: value => stderr.push(value) });
    const receipt = JSON.parse(stdout[0]);
    const report = await fs.readFile(receipt.reportPath, 'utf8');
    const evidence = JSON.parse(await fs.readFile(path.join(receipt.evidenceDirectory, 'evidence.json'), 'utf8'));
    const state = JSON.parse(await fs.readFile(receipt.statePath, 'utf8'));
    // Assert
    assert.equal(code, exit); assert.equal(receipt.runStatus, status); assert.equal(evidence.runStatus, status);
    assert.equal(evidence.match.findings.length, findings); assert.equal(evidence.queryCoverage, 'complete');
    assert.equal(evidence.collectionCoverage, kind === 'complete' ? 'complete' : 'partial');
    assert.equal(state.generation, receipt.generation); assert.equal(state.lastReport, receipt.reportPath);
    assert.match(report, /セキュリティ/); assert.match(report, /重要/);
    assert.equal(stderr.length, 0); assert.equal(report.includes('[object Object]'), false);
    assert.equal(report.includes('inventory.json'), false);
    for (const [, target] of report.matchAll(/\]\(([^)]+)\)/g)) if (!/^https?:/.test(target)) assert.equal((await fs.stat(path.join(receipt.evidenceDirectory, target))).isFile(), true);
    assert.equal(await fs.lstat(path.join(home, '.local/state/mac-security-sweep/.run.lock')).then(() => true, () => false), false);
  });
}

test('不正CLIはstateを作らず64、helpは閉じたstdinでもscanせず0', async t => {
  // Arrange
  const home = await fixture(t), out = [], err = [];
  // Act
  const code = await runCli(['--unknown', 'SENTINEL'], { home, stdout: value => out.push(value), stderr: value => err.push(value) });
  const help = spawnSync(process.execPath, ['--import', fileURLToPath(new URL('./deny-network.mjs', import.meta.url)), fileURLToPath(new URL('../scripts/run-sweep.mjs', import.meta.url)), '--help'], { input: '', encoding: 'utf8', timeout: 5000 });
  // Assert
  assert.equal(code, 64); assert.equal(JSON.parse(out[0]).diagnostic.writeOutcome, 'none'); assert.equal(out.join('').includes('SENTINEL'), false); assert.equal(err.join('').includes('SENTINEL'), false);
  assert.deepEqual(await fs.readdir(home), []); assert.equal(help.status, 0); assert.match(help.stdout, /Usage:/); assert.equal(help.stderr, '');
});

test('保存失敗は秘密例外を出さず1で終了し未commit stateを作らない', async t => {
  // Arrange
  const home = await fixture(t), out = [], err = [];
  // Act
  const code = await runCli([], { home, stages: stages('complete'), rules: {}, identityProvider,
    onBoundary: async point => { if (point === 'report:write') throw Object.assign(new Error('SENTINEL_SECRET'), { code: 'ENOSPC', stderr: 'SENTINEL_LOG' }); },
    stdout: value => out.push(value), stderr: value => err.push(value) });
  // Assert
  assert.equal(code, 1); assert.equal(out.join('').includes('SENTINEL'), false); assert.equal(err.join('').includes('SENTINEL'), false);
  assert.equal(await fs.lstat(path.join(home, '.local/state/mac-security-sweep/state.json')).then(() => true, () => false), false);
});

test('通常の二回目は検証済み世代だけをcontextへ渡して継続する', async t => {
  // Arrange
  const home = await fixture(t), observed = [], fixtureStages = stages('partial');
  const original = fixtureStages.inventory;
  fixtureStages.inventory = async options => { observed.push(options.context.continuationVerified); return original(options); };
  // Act
  await runCli([], { home, stages: fixtureStages, rules: {}, identityProvider, stdout: () => {}, stderr: () => {} });
  await runCli([], { home, stages: fixtureStages, rules: {}, identityProvider, stdout: () => {}, stderr: () => {} });
  // Assert
  assert.deepEqual(observed, [false, true]);
});

test('source失敗・製品未対応をquery completeや全体completeへ変換しない', async t => {
  // Arrange
  const home = await fixture(t), fixtureStages = stages('complete'), out = [];
  fixtureStages.news = async () => ({ sources: [{ name: 'CISA KEV', status: 'error' }], productCoverage: [{ productId: 'unsupported', status: 'partial' }], items: [] });
  // Act
  const code = await runCli([], { home, stages: fixtureStages, rules: {}, identityProvider, stdout: value => out.push(value), stderr: () => {} });
  // Assert
  assert.equal(code, 2); assert.equal(JSON.parse(out[0]).queryCoverage, 'partial'); assert.equal(JSON.parse(out[0]).runStatus, 'partial');
  const evidence = JSON.parse(await fs.readFile(path.join(JSON.parse(out[0]).evidenceDirectory, 'evidence.json'), 'utf8'));
  assert.equal(evidence.stageStatus.news, 'partial');
});

test('newsとその保存が完了するまでinventoryを開始せず詳細へ全ニュースを渡す', async t => {
  // Arrange
  const home = await fixture(t), fixtureStages = stages('complete'), events = [];
  const originalInventory = fixtureStages.inventory;
  fixtureStages.news = async () => { events.push('news-start'); await new Promise(resolve => setTimeout(resolve, 20)); events.push('news-end'); return { sources: [{ name: 'CISA KEV', status: 'ok' }], items: [{ id: 'CVE-2026-1234' }] }; };
  fixtureStages.inventory = async options => {
    const folders = (await fs.readdir(path.join(home, 'security-reports'))).filter(name => name.startsWith('mss-'));
    const evidence = JSON.parse(await fs.readFile(path.join(home, 'security-reports', folders[0], 'evidence.json'), 'utf8'));
    assert.equal(evidence.collectionCoverage, 'partial'); assert.equal(evidence.queryCoverage, 'partial');
    assert.equal(evidence.stageStatus.inventory, 'pending'); assert.deepEqual(evidence.match.findings, []);
    events.push('inventory'); return originalInventory(options);
  };
  fixtureStages.adaptive = async () => { events.push('adaptive'); return { items: [{ id: 'CVE-2026-5678' }], coverage: [] }; };
  fixtureStages.mergeNews = (common, adaptive) => ({ ...common, items: [...(common.items || []), ...(adaptive.items || [])] });
  fixtureStages.details = async (findings, deadline, request, options) => { events.push('details'); assert.deepEqual(options.news.items.map(item => item.id), ['CVE-2026-1234', 'CVE-2026-5678']); return { details: [], coverage: [] }; };
  // Act
  await runCli([], { home, stages: fixtureStages, rules: {}, identityProvider, stdout: () => {}, stderr: () => {} });
  // Assert
  assert.deepEqual(events, ['news-start', 'news-end', 'inventory', 'adaptive', 'details']);
});

test('newsの途中保存が失敗すると保留本文を中止しinventoryを始めない', async t => {
  // Arrange
  const home = await fixture(t), fixtureStages = stages('complete'); let cancelled = false, localStarted = false, clock = 0;
  fixtureStages.inventory = async () => { localStarted = true; return {}; };
  fixtureStages.news = async ({ context }) => {
    const request = context.request('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json').catch(() => {});
    await new Promise(resolve => setImmediate(resolve)); clock = 16000;
    try { await context.checkpoint({ stage: 'news', value: { items: [], coverage: [] } }); }
    finally { await request; }
    return {};
  };
  // Act
  const code = await runCli([], { home, stages: fixtureStages, rules: {}, identityProvider, monotonicNow: () => clock,
    fetchImpl: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } })),
    onBoundary: async point => { if (point === 'report:write') throw Object.assign(new Error('SENTINEL'), { code: 'ENOSPC' }); }, stdout: () => {}, stderr: () => {} });
  // Assert
  assert.equal(code, 1); assert.equal(cancelled, true); assert.equal(localStarted, false);
});

test('状態の起動照合も同じmonotonic予算を消費し収集前の超過を拒否する', async t => {
  // Arrange
  const home = await fixture(t), out = []; let clock = 0, collected = false;
  const fixtureStages = stages('complete'); fixtureStages.inventory = async () => { collected = true; return {}; };
  // Act
  const code = await runCli(['--budget-ms', '12000'], { home, stages: fixtureStages, rules: {}, identityProvider, monotonicNow: () => { clock += 5000; return clock; }, stdout: value => out.push(value), stderr: () => {} });
  // Assert
  assert.equal(code, 1); assert.equal(JSON.parse(out[0]).code, 'MSS_DEADLINE'); assert.equal(collected, false); assert.deepEqual(await fs.readdir(home), []);
});

test('news uses the remaining global budget and saves an honest news-only final result', async t => {
  // Arrange
  const home = await fixture(t), fixtureStages = stages('complete'), out = []; let clock = 0, localStarted = false;
  fixtureStages.news = async () => { clock = 120000; return { sources: [{ name: 'CISA KEV', status: 'ok' }], items: [] }; };
  fixtureStages.inventory = async () => { localStarted = true; return {}; };
  // Act
  const exit = await runCli(['--budget-ms', '120000', '--language', 'EN'], { home, stages: fixtureStages, rules: {}, identityProvider, monotonicNow: () => clock, stdout: value => out.push(value), stderr: () => {} });
  const receipt = JSON.parse(out[0]);
  const evidence = JSON.parse(await fs.readFile(path.join(receipt.evidenceDirectory, 'evidence.json'), 'utf8'));
  // Assert
  assert.equal(exit, 2); assert.equal(localStarted, false);
  assert.equal(receipt.collectionCoverage, 'partial'); assert.equal(receipt.queryCoverage, 'partial');
  assert.equal(evidence.stageStatus.inventory, 'pending'); assert.deepEqual(evidence.match.findings, []);
  assert.equal(receipt.canonicalLanguage, 'en'); assert.equal(receipt.translationStatus, 'not-required');
});

test('a failed news attempt is saved before inventory and remains a visible source failure', async t => {
  // Arrange
  const home = await fixture(t), fixtureStages = stages('complete'), events = [], out = [], err = [];
  fixtureStages.news = async () => { events.push('news'); throw new Error('SENTINEL_SECRET'); };
  const originalInventory = fixtureStages.inventory;
  fixtureStages.inventory = async options => { events.push('inventory'); return originalInventory(options); };
  // Act
  const exit = await runCli(['--language', 'EN'], { home, stages: fixtureStages, rules: {}, identityProvider, stdout: value => out.push(value), stderr: value => err.push(value) });
  const receipt = JSON.parse(out[0]);
  // Assert
  assert.equal(exit, 2); assert.deepEqual(events, ['news', 'inventory']);
  assert.equal(receipt.queryCoverage, 'partial'); assert.equal(receipt.collectionCoverage, 'complete');
  assert.equal(receipt.diagnostics[0].operation, 'news'); assert.equal(receipt.diagnostics[0].trace.module, 'sources');
  assert.doesNotMatch(receipt.diagnostics.map(item => `${item.message} ${item.recovery}`).join('\n'), /[\u3040-\u30ff\u3400-\u9fff]/);
  assert.equal(out.join('').includes('SENTINEL'), false); assert.equal(err.join('').includes('SENTINEL'), false);
  assert.match(err.join(''), /MSS_INTERNAL \(news\)/);
});

test('reportは別版の実物を昇格せずalias側の修正版を維持する', () => {
  // Arrange
  const finding = { id: 'CVE-2026-1111:npm:example:1.0.0', advisoryId: 'CVE-2026-1111', aliases: ['GHSA-example'], title: 'fixture', status: '可能性高', package: { name: 'example', ecosystem: 'npm' }, version: '1.0.0',
    impact: { kind: 'declared-only', installationConfirmed: false }, installationEvidence: [{ name: 'example', ecosystem: 'npm', version: '2.0.0' }] };
  // Act
  const report = renderReport({ match: { findings: [finding] }, details: { details: [{ id: 'GHSA-example', aliases: ['CVE-2026-1111'], fixed: [{ name: 'example', ecosystem: 'npm', version: '1.0.1' }] }] } });
  // Assert
  assert.equal(report.includes('実物の版確認あり'), false); assert.equal(report.includes('1.0.1'), true);
});
