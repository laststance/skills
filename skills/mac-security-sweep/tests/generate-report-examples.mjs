import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { runCli } from '../scripts/run-sweep.mjs';
import { matchInventory } from '../scripts/match.mjs';
import { NEWS_CATEGORIES, SOURCES } from '../scripts/source-registry.mjs';

const exampleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../references/examples');
const observedAt = '2026-11-03T00:00:00.000Z';

/**
 * Inject synthetic observations while exercising the real runner, matching, rendering and atomic writer.
 * This documentation generator never calls a real collector or external API.
 *
 * @example
 * exampleStages('positive-partial', []);
 */
function exampleStages(kind, sequence) {
  const partial = kind !== 'complete', positive = kind === 'positive-partial';
  return {
    news: async () => {
      sequence.push('news');
      return { fetchedAt: observedAt, window: { since: '2026-10-04T00:00:00.000Z', until: observedAt },
        items: positive ? [{ id: 'GHSA-fixture-positive', title: 'example 1.0.0: synthetic security advisory', source: 'GitHub Advisory reviewed', sourceId: 'ghsa-reviewed',
          categories: ['general'], severity: 'HIGH', publishedAt: '2026-11-02T00:00:00.000Z', updatedAt: '2026-11-02T12:00:00.000Z', fetchedAt: observedAt,
          url: 'https://github.com/advisories/GHSA-fixture-positive', affected: [{ name: 'example', ecosystem: 'npm', range: '<1.0.1' }] }] : [],
        sources: SOURCES.map(source => ({ name: source.name, sourceId: source.id, categories: source.categories, url: source.url, status: 'ok', itemCount: positive && source.id === 'ghsa-reviewed' ? 1 : 0,
          datedCount: positive && source.id === 'ghsa-reviewed' ? 1 : 0, datedItemCount: positive && source.id === 'ghsa-reviewed' ? 1 : 0, undatedCount: 0, pages: 1, fetchedAt: observedAt, windowComplete: true })),
        categoryCoverage: NEWS_CATEGORIES.map(category => ({ category: category.id, status: 'fresh', sourceIds: SOURCES.filter(source => source.categories.includes(category.id)).map(source => source.id), fetchedAt: observedAt,
          datedItemCount: positive && category.id === 'general' ? 1 : 0, undatedCount: 0, windowStatus: 'complete', reasonCode: 'PRIMARY_SOURCE_FETCHED' })),
        coverage: [{ area: 'synthetic-news', status: 'complete' }] };
    },
    inventory: async () => {
      sequence.push('inventory');
      assert.equal(sequence[0], 'news');
      return { generatedAt: observedAt, host: { osVersion: '26.0' }, applications: [], runtimes: [], extensions: [], lockfiles: [], projectRoots: [],
        coverage: [{ area: 'synthetic-local-scope', status: partial ? 'partial' : 'complete', reason: partial ? '合成テストで再現した読取制限' : '合成テストの対象範囲を確認' }] };
    },
    adaptive: async () => ({ coverage: [] }), mergeNews: common => common,
    packages: async () => ({ scannedAt: observedAt, packages: positive ? [{ name: 'example', version: '1.0.0', ecosystem: 'npm' }] : [],
      findings: positive ? [{ id: 'GHSA-fixture-positive', package: { name: 'example', ecosystem: 'npm' }, version: '1.0.0', evidence: [], evidenceKind: 'lock-declaration', severity: 'HIGH' }] : [],
      coverage: [{ area: 'synthetic-package-query', status: 'complete' }], continuation: { pendingLockfiles: [] } }),
    iocs: async () => ({ checks: [], coverage: [{ area: 'synthetic-ioc', status: 'complete' }] }),
    details: async () => ({ details: [], coverage: [{ area: 'synthetic-details', status: 'complete' }], continuation: { pendingIds: [], cache: [] } }),
    match: matchInventory,
  };
}

for (const [kind, language] of [['complete', 'JA'], ['partial', 'JA'], ['positive-partial', 'JA'], ['positive-partial-en', 'EN']]) {
  const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mss-example-'))), stdout = [], sequence = [];
  try {
    const actualKind = kind === 'positive-partial-en' ? 'positive-partial' : kind;
    const code = await runCli(['--language', language], { home, stages: exampleStages(actualKind, sequence), rules: {},
      wallNow: () => Date.parse(observedAt), identityProvider: async () => ({ status: 'live', start: 'synthetic-start', boot: 'synthetic-boot' }),
      stdout: value => stdout.push(value), stderr: () => {} });
    assert.equal(code, actualKind === 'complete' ? 0 : 2);
    const receipt = JSON.parse(stdout[0]);
    const evidence = JSON.parse(await fs.readFile(path.join(receipt.evidenceDirectory, 'evidence.json'), 'utf8'));
    const report = await fs.readFile(receipt.reportPath, 'utf8');
    assert.deepEqual(sequence, ['news', 'inventory']);
    assert.equal(evidence.match.findings.filter(finding => finding.status === '確定').length, 0);
    assert.equal(evidence.match.findings.filter(finding => finding.status === '可能性高').length, actualKind === 'positive-partial' ? 1 : 0);
    assert.equal(evidence.match.coverage.filter(entry => entry.area === 'synthetic-local-scope' && entry.status === 'partial').length, actualKind === 'complete' ? 0 : 1);
    const destination = path.join(exampleRoot, kind);
    await fs.mkdir(destination, { recursive: true });
    const banner = language === 'JA' ? '説明用の合成データです。実在の脆弱性・実Macの監査結果ではありません。' : 'Synthetic documentation example. This is not a real vulnerability or a real Mac audit.';
    await fs.writeFile(path.join(destination, 'report.md'), `${banner}\n\n${report.trimEnd()}\n`);
    // Publish only the explicitly synthetic collector values; runtime/store paths stay private.
    const selected = { fixture: true, sequence, schemaVersion: evidence.schemaVersion, runStatus: evidence.runStatus, collectionCoverage: evidence.collectionCoverage,
      queryCoverage: evidence.queryCoverage, locale: evidence.locale, stageStatus: evidence.stageStatus, inventory: evidence.inventory, news: evidence.news,
      packages: evidence.packages, iocs: evidence.iocs, details: evidence.details, match: evidence.match, changes: evidence.changes };
    await fs.writeFile(path.join(destination, 'evidence.json'), `${JSON.stringify(selected, null, 2)}\n`);
    console.log(`${kind}: ${receipt.runStatus}, news before inventory, ${evidence.match.findings.length} findings`);
  } finally { await fs.rm(home, { recursive: true, force: true }); }
}
