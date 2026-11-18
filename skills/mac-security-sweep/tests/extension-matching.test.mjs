import test from 'node:test';
import assert from 'node:assert/strict';
import { matchInventory } from '../scripts/match.mjs';
import { compareAssessments } from '../scripts/assessment.mjs';
import { renderReport } from '../scripts/report.mjs';

test('a disabled browser extension matches only its exact ID, affected version and browser host', () => {
  // Arrange
  const inventory = { browserExtensions: [
    { browser: 'chrome', id: 'a'.repeat(32), version: '1.2.3', active: false, path: '/synthetic/chrome/old' },
    { browser: 'edge', id: 'a'.repeat(32), version: '1.2.3', active: true, path: '/synthetic/edge/current' },
    { browser: 'chrome', id: 'b'.repeat(32), name: 'Same display name', version: '1.2.3', path: '/synthetic/chrome/other' },
  ] };
  const news = { items: [{ id: 'GHSA-fixture-browser', title: 'Extension issue', needsReview: false, url: 'https://github.com/advisories/GHSA-fixture-browser',
    affected: [{ ecosystem: 'Chrome Web Store', name: 'a'.repeat(32), range: '< 2.0.0', fixed: '2.0.0' }] }] };
  // Act
  const result = matchInventory(inventory, news);
  // Assert
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].status, '可能性高');
  assert.equal(result.findings[0].product, 'chrome: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.deepEqual(result.findings[0].localEvidence, ['/synthetic/chrome/old']);
  assert.equal(result.findings[0].impact.executionConfirmed, false);
});

test('every affected range is checked before an installed extension is classified outside the advisory', () => {
  // Arrange
  const inventory = { extensions: [{ editor: 'zed', id: 'example', version: '2.5.0', path: '/synthetic/zed' }] };
  const affected = [{ ecosystem: 'Zed', name: 'example', range: '< 1.0.0' }, { ecosystem: 'Zed', name: 'example', range: '>= 2.0.0, < 3.0.0' }];
  // Act
  const first = matchInventory(inventory, { items: [{ id: 'GHSA-fixture-ranges', needsReview: false, affected }] });
  const reversed = matchInventory(inventory, { items: [{ id: 'GHSA-fixture-ranges', needsReview: false, affected: [...affected].reverse() }] });
  // Assert
  assert.deepEqual(first.findings.map(item => item.status), ['可能性高']);
  assert.deepEqual(reversed.findings.map(item => item.status), ['可能性高']);
  assert.equal(first.findings[0].reasonCode, 'extension-advisory-affected');
});

test('unread JetBrains product profiles prevent an absent-plugin conclusion from another completed profile', () => {
  // Arrange
  const inventory = { extensions: [], coverage: [{ area: 'jetbrains-profiles', status: 'partial' }, { area: 'jetbrains-extensions', status: 'complete' }] };
  const news = { items: [{ id: 'GHSA-fixture-jetbrains', affected: [{ ecosystem: 'JetBrains', name: 'org.example.plugin', range: '< 2.0.0' }] }] };
  // Act
  const result = matchInventory(inventory, news, { packages: { coverage: [{ area: 'package-extraction', status: 'complete' }] } });
  // Assert
  assert.equal(result.newsAssessment[0].relevance, '確認候補');
});

test('a Chrome Web Store advisory remains a review candidate for the same ID installed in Brave', () => {
  // Arrange
  const inventory = { browserExtensions: [{ browser: 'brave', id: 'a'.repeat(32), version: '1.2.3', source: 'unknown', path: '/synthetic/brave' }],
    coverage: [{ area: 'chrome-extensions', status: 'absent' }, { area: 'chrome-canary-extensions', status: 'absent' }] };
  const news = { items: [{ id: 'GHSA-fixture-cross-store', needsReview: false, affected: [{ ecosystem: 'Chrome Web Store', name: 'a'.repeat(32), versions: ['1.2.3'] }] }] };
  // Act
  const result = matchInventory(inventory, news);
  // Assert
  assert.equal(result.findings.length, 0);
  assert.equal(result.newsAssessment[0].relevance, '確認候補');
  assert.deepEqual(result.newsAssessment[0].matchedProducts, ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']);
});

test('opaque JetBrains IDs with different letter case never establish the same installed identity', () => {
  // Arrange
  const inventory = { extensions: [{ editor: 'jetbrains', id: 'org.Example.Plugin', version: '1.2.3', path: '/synthetic/jetbrains' }] };
  const news = { items: [{ id: 'GHSA-fixture-case', needsReview: false, affected: [{ ecosystem: 'JetBrains', name: 'org.example.plugin', versions: ['1.2.3'] }] }] };
  // Act
  const result = matchInventory(inventory, news);
  // Assert
  assert.equal(result.findings.length, 0);
});

test('one advisory keeps separate observations for matching editor IDs in different editor profiles', () => {
  // Arrange
  const inventory = { extensions: [
    { editor: 'vscode', id: 'example.plugin', version: '1.2.3', path: '/synthetic/vscode' },
    { editor: 'cursor', id: 'example.plugin', version: '1.2.3', path: '/synthetic/cursor' },
    { editor: 'jetbrains', id: 'example.plugin', version: '1.2.3', path: '/synthetic/jetbrains' },
  ] };
  const news = { items: [{ id: 'GHSA-fixture-editors', needsReview: false, affected: [{ ecosystem: 'VSCode', name: 'example.plugin', versions: ['1.2.3'] }] }] };
  // Act
  const result = matchInventory(inventory, news);
  const previous = compareAssessments([], result.findings);
  const current = matchInventory({ extensions: inventory.extensions.slice(0, 1) }, news);
  const changes = compareAssessments(previous.snapshot, current.findings);
  // Assert
  assert.deepEqual(result.findings.map(item => item.product).sort(), ['cursor: example.plugin', 'vscode: example.plugin']);
  assert.equal(changes.continuing.length, 1);
  assert.equal(changes.resolved.length, 0);
  assert.equal(changes.unconfirmed.length, 1);
  assert.equal(changes.unconfirmed[0].product, 'cursor: example.plugin');
});

test('an editor-specific malicious distribution never transfers to another editor with the same publisher ID', () => {
  // Arrange
  const inventory = { extensions: [{ editor: 'vscode', id: 'example.plugin', version: '1.2.3', path: '/synthetic/vscode' }] };
  const news = { items: [{ id: 'GHSA-fixture-malware', needsReview: false, advisoryType: 'malware', affected: [{ ecosystem: 'VSCode', editor: 'cursor', name: 'example.plugin', versions: ['1.2.3'] }] }] };
  // Act
  const result = matchInventory(inventory, news);
  // Assert
  assert.equal(result.findings.length, 0);
});

test('unreviewed text, unsupported versions and unverified distribution sources cannot establish affected extension versions', () => {
  // Arrange
  const inventory = { extensions: [{ editor: 'zed', id: 'example', version: '1.2.3', path: '/synthetic/zed', source: 'unknown' }] };
  const news = { items: [
    { id: 'GHSA-fixture-text', needsReview: true, affected: [{ ecosystem: 'Zed', name: 'example', versions: ['1.2.3'] }] },
    { id: 'GHSA-fixture-range', needsReview: false, affected: [{ ecosystem: 'Zed', name: 'example', range: '^1.0.0' }] },
    { id: 'GHSA-fixture-source', needsReview: false, affected: [{ ecosystem: 'Zed', name: 'example', versions: ['1.2.3'], source: 'marketplace' }] },
    { id: 'GHSA-fixture-withdrawn', needsReview: false, withdrawnAt: '2026-11-01', affected: [{ ecosystem: 'Zed', name: 'example', versions: ['1.2.3'] }] },
  ] };
  // Act
  const result = matchInventory(inventory, news);
  // Assert
  assert.deepEqual(result.findings.map(item => item.status), ['可能性あり', '可能性あり']);
});

test('completed dependency queries never establish that an uninspected browser extension is absent', () => {
  // Arrange
  const inventory = { browserExtensions: [], coverage: [{ area: 'chrome-extensions', status: 'partial' }] };
  const news = { items: [{ id: 'GHSA-fixture-coverage', affected: [{ ecosystem: 'Chrome Web Store', name: 'a'.repeat(32), range: '< 2.0.0' }] }] };
  // Act
  const result = matchInventory(inventory, news, { packages: { coverage: [{ area: 'package-extraction', status: 'complete' }] } });
  // Assert
  assert.equal(result.newsAssessment[0].relevance, '確認候補');
});

test('reports show every observed extension with explicit unknown enablement and advisory coverage in both languages', () => {
  // Arrange
  const inventory = { extensions: [{ editor: 'zed', id: 'example', name: 'Example', version: '1.2.3', active: null, path: '/synthetic/zed', token: 'DO_NOT_RETAIN' }],
    browserExtensions: [{ browser: 'zen', id: 'example@extension.test', version: '2.3.4', active: false, path: '/synthetic/zen' }],
    coverage: [{ area: 'other-editor-extensions', status: 'unsupported', product: 'Unsupported editor', reasonCode: 'editor-reader-unsupported' }] };
  // Act
  const japanese = renderReport({ inventory, language: 'JA' });
  const english = renderReport({ inventory, language: 'EN' });
  // Assert
  assert.match(japanese, /エディタ拡張・プラグイン/);
  assert.match(japanese, /ブラウザ拡張/);
  assert.match(japanese, /example&#64;extension\.test/);
  assert.match(japanese, /未確認（取得済み告知にID一致なし）/);
  assert.match(english, /Unassessed; no ID match in retrieved advisories/);
  assert.match(english, /Disabled or non-selected version/);
  assert.match(english, /Unsupported editor/);
  assert.doesNotMatch(english, /[\u3040-\u30ff\u3400-\u9fff]/);
  assert.equal((japanese + english).includes('DO_NOT_RETAIN'), false);
});

test('installed editor applications remain visible when their plugin readers are unsupported or empty', () => {
  // Arrange
  const inventory = { applications: [
    { name: 'Code', bundleId: 'com.microsoft.VSCode', version: '1.117.0', path: '/synthetic/Code.app', components: [{ name: 'electron', version: '40.0.0' }] },
    { name: 'Xcode', bundleId: 'com.apple.dt.Xcode', version: '27.2', path: '/synthetic/Xcode.app' },
    { name: 'Claude Code URL Handler', bundleId: 'com.anthropic.claude-code-url-handler', version: '1.0.0' },
  ] };
  // Act
  const report = renderReport({ inventory, language: 'EN' });
  // Assert
  assert.match(report, /Editor applications/);
  assert.match(report, /Code \/ com\.microsoft\.VSCode \| 1\.117\.0 \| electron 40\.0\.0/);
  assert.match(report, /Xcode \/ com\.apple\.dt\.Xcode \| 27\.2/);
  assert.match(report, /individual CVE applicability unassessed/);
  assert.doesNotMatch(report, /Claude Code URL Handler/);
});

test('a browser advisory assessment never leaks to another extension sharing the same profile path', () => {
  // Arrange
  const inventory = { browserExtensions: [
    { browser: 'firefox', id: 'affected@extension.test', version: '1.2.3', path: '/synthetic/profile' },
    { browser: 'firefox', id: 'other@extension.test', version: '1.2.3', path: '/synthetic/profile' },
  ] };
  const news = { items: [{ id: 'GHSA-fixture-profile', needsReview: false, affected: [{ ecosystem: 'Firefox Add-ons', name: 'affected@extension.test', versions: ['1.2.3'] }] }] };
  // Act
  const match = matchInventory(inventory, news);
  const report = renderReport({ inventory, match, language: 'EN' });
  // Assert
  assert.match(report.split('\n').find(line => line.includes('| firefox | affected&#64;extension.test')), /Likely affected/);
  assert.match(report.split('\n').find(line => line.includes('| firefox | other&#64;extension.test')), /Unassessed; no ID match/);
});
