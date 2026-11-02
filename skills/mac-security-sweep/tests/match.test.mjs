import test from 'node:test';
import assert from 'node:assert/strict';

test('threeやconnectの依存名だけでIvantiの記事を関連扱いしない', () => {
  // Arrange
  const packages = { packages: [{ name: 'three', ecosystem: 'npm', version: '1.0.0' }, { name: 'connect', ecosystem: 'npm', version: '1.0.0' }] };
  // Act
  const result = matchInventory({}, { items: [{ id: 'news', title: 'Attackers Chain Three Ivanti Connect Secure Flaws' }] }, { packages });
  // Assert
  assert.equal(result.newsAssessment[0].relevance, '関係なし');
  assert.equal(result.newsAssessment[0].needsReview, false);
});

test('ブラウザ拡張があればSearchjackedの記事をID未確認の候補として残す', () => {
  // Arrange
  const inventory = { browserExtensions: [{ id: 'example' }] };
  // Act
  const result = matchInventory(inventory, { items: [{ id: 'news', title: 'Searchjacked: Hidden Browser Extensions Hijack Searches' }] });
  // Assert
  assert.equal(result.newsAssessment[0].relevance, '確認候補');
  assert.equal(result.newsAssessment[0].needsReview, true);
});

test('MacのChromeがあってもAndroid版の更新を影響候補に混ぜない', () => {
  // Arrange
  const inventory = { applications: [{ name: 'Google Chrome' }] };
  // Act
  const result = matchInventory(inventory, { items: [{ id: 'news', title: 'Chrome for Android Update' }] });
  // Assert
  assert.equal(result.newsAssessment[0].relevance, '関係なし');
  assert.match(result.newsAssessment[0].reason, /OS・配布チャネル/);
});

test('Chromeの正式アプリ名と記事のChrome表記を対応させる', () => {
  // Arrange
  const inventory = { applications: [{ name: 'Google Chrome' }] };
  // Act
  const result = matchInventory(inventory, { items: [{ id: 'news', title: 'Chrome fixes critical vulnerability' }] });
  // Assert
  assert.equal(result.newsAssessment[0].relevance, '関係あり');
});

test('OSVと悪性告知が同じ対象なら二重計上せず悪性配布の区分を保持する', () => {
  // Arrange
  const pkg = { name: 'example', ecosystem: 'npm', version: '1.0.0', evidence: ['/example/lock'] };
  const packages = { packages: [pkg], findings: [{ id: 'GHSA-malware', package: { name: 'example', ecosystem: 'npm' }, version: '1.0.0', evidence: ['/example/lock'] }] };
  const news = { items: [{ id: 'GHSA-malware', advisoryType: 'malware', needsReview: false, affected: [{ name: 'example', ecosystem: 'npm', range: '= 1.0.0' }] }] };
  // Act
  const result = matchInventory({}, news, { packages });
  // Assert
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].incident, true);
  assert.equal(result.counts['確定'], 0);
});

test('出典確認から30日を超えたルールだけで最新の影響なしを断定しない', () => {
  // Arrange
  const rules = [{ id: 'app', kind: 'application', verified: true, verifiedAt: '2026-09-01', applicationNames: ['Example'], affectedRange: '<2.0', fixedVersion: '2.0' }];
  // Act
  const result = matchInventory({ applications: [{ name: 'Example', version: '2.0' }] }, {}, { rules, now: new Date('2026-11-02T00:00:00Z') });
  // Assert
  assert.equal(result.findings[0].status, '可能性あり');
  assert.equal(result.coverage[0].area, 'rule-freshness:app');
});

test('公開詳細で撤回を確認したOSV一致を陽性判定へ復活させない', () => {
  // Arrange
  const packages = { findings: [{ id: 'GHSA-withdrawn', package: { name: 'example', ecosystem: 'npm' }, version: '1.0.0' }] };
  // Act
  const result = matchInventory({}, {}, { packages, advisoryDetails: { details: [{ id: 'GHSA-withdrawn', withdrawn: '2026-11-01' }] } });
  // Assert
  assert.equal(result.findings.length, 0);
});
import { matchRule, matchInventory, satisfiesRange } from '../scripts/match.mjs';

const rule = { id: 'cursor-claude-fixture', title: 'Cursor 経由の拡張回帰テスト', kind: 'extension', editor: 'cursor',
  extensionId: 'anthropic.claude-code', affectedVersions: ['2.1.312', '2.1.313'], verified: true, incident: true,
  sourceUrl: 'https://cursor.com/blog/claude-code-extension-security-notice' };

test('VS Code 2.1.314 があり Cursor にはない端末を当該攻撃の影響なしと判定する', () => {
  // Arrange: ユーザーが指定した既知事例を独立した合成データで表す。
  const inventory = { extensions: [{ editor: 'vscode', id: 'anthropic.claude-code', version: '2.1.314' }], coverage: [{ area: 'extensions', status: 'complete' }] };
  // Act
  const actual = matchRule(inventory, rule);
  // Assert
  assert.equal(actual.status, '影響なし');
});

test('Cursor の影響版が無効な残骸でも過去の影響可能性を見逃さない', () => {
  // Arrange
  const inventory = { extensions: [{ editor: 'cursor', id: 'anthropic.claude-code', version: '2.1.313', active: false }], coverage: [{ area: 'extensions', status: 'complete' }] };
  // Act
  const actual = matchRule(inventory, rule);
  // Assert
  assert.equal(actual.status, '可能性高');
});

test('Cursor 領域の権限不足を拡張不在として安全判定しない', () => {
  // Arrange
  const inventory = { extensions: [], coverage: [{ area: 'extensions:cursor', status: 'unavailable' }] };
  // Act
  const actual = matchRule(inventory, rule);
  // Assert
  assert.equal(actual.status, '可能性あり');
});

test('通常Cursor不在でもPortableの影響版を同じ製品の観測として照合する', () => {
  // Arrange
  const inventory = { extensions: [{ id: 'anthropic.claude-code', version: '2.1.312', editor: 'cursor-portable' }],
    coverage: [{ area: 'cursor-extensions', status: 'absent' }, { area: 'cursor-portable-extensions', status: 'complete' }] };
  // Act
  const actual = matchRule(inventory, rule);
  const structured = matchInventory(inventory, { items: [{ id: 'portable-news', title: 'Extension incident', affected: [{ name: 'anthropic.claude-code', ecosystem: 'VSCode', editor: 'cursor' }] }] });
  const titleOnly = matchInventory(inventory, { items: [{ id: 'cursor-news', title: 'Cursor extension incident' }] });
  // Assert
  assert.equal(actual.status, '可能性高');
  assert.equal(structured.newsAssessment[0].relevance, '関係あり');
  assert.equal(titleOnly.newsAssessment[0].relevance, '関係あり');
});

test('Portable領域の未読・製品不明は拡張不在を阻止しInsidersを安定版へ統合しない', () => {
  // Arrange
  const targetRule = { ...rule, editor: 'vscode' };
  const baseCoverage = [{ area: 'vscode-extensions', status: 'absent' }];
  // Act
  const unread = matchRule({ extensions: [], coverage: [...baseCoverage, { area: 'vscode-portable-extensions', status: 'partial' }] }, targetRule);
  const ambiguousInventory = { extensions: [{ editor: 'portable', id: rule.extensionId, version: '2.1.312' }], coverage: [...baseCoverage, { area: 'portable-extensions', status: 'complete' }] };
  const ambiguous = matchRule(ambiguousInventory, targetRule);
  const insiders = matchRule({ extensions: [{ editor: 'vscode-insiders', id: rule.extensionId, version: '2.1.312' }], coverage: [...baseCoverage, { area: 'vscode-insiders-extensions', status: 'complete' }] }, targetRule);
  const news = matchInventory(ambiguousInventory, { items: [{ id: 'portable-news', title: 'Extension incident', affected: [{ name: rule.extensionId, ecosystem: 'VSCode', editor: 'vscode' }] }] });
  // Assert
  assert.equal(unread.status, '可能性あり');
  assert.equal(ambiguous.status, '可能性あり');
  assert.equal(insiders.status, '影響なし');
  assert.equal(news.newsAssessment[0].relevance, '確認候補');
});

test('VS Code の同じ版を Cursor 配布経路の被害と混同しない', () => {
  // Arrange
  const inventory = { extensions: [{ editor: 'vscode', id: 'anthropic.claude-code', version: '2.1.313' }], coverage: [{ area: 'extensions:cursor', status: 'complete' }] };
  // Act
  const actual = matchRule(inventory, rule);
  // Assert
  assert.equal(actual.status, '影響なし');
});

test('一般的な authorized_keys の存在だけで侵害を確定しない', () => {
  // Arrange
  const inventory = { extensions: [], coverage: [{ area: 'extensions', status: 'complete' }] };
  const evidence = { checks: [{ ruleId: rule.id, kind: 'path', value: '~/.ssh/authorized_keys', matched: true, strong: false }] };
  // Act
  const actual = matchRule(inventory, rule, evidence);
  // Assert
  assert.equal(actual.status, '可能性あり');
});

test('公式 IOC の強い一致があれば拡張削除済みでも確定にする', () => {
  // Arrange
  const inventory = { extensions: [], coverage: [{ area: 'extensions', status: 'complete' }] };
  const evidence = { checks: [{ ruleId: rule.id, kind: 'sha256', matched: true, strong: true, command: 'SHA-256' }] };
  // Act
  const actual = matchRule(inventory, rule, evidence);
  // Assert
  assert.equal(actual.status, '確定');
});

test('影響範囲の修正版境界を含めず prerelease は未確認として扱う', () => {
  // Arrange
  const range = '>= 1.0.0, < 2.1.314';
  // Act
  const vulnerable = satisfiesRange('2.1.313', range);
  const fixed = satisfiesRange('2.1.314', range);
  const ambiguous = satisfiesRange('2.1.314-beta.1', range);
  // Assert
  assert.equal(vulnerable, true);
  assert.equal(fixed, false);
  assert.equal(ambiguous, null);
});

test('OSV の影響版一致を窃取確定にせず仕事側の依存として示す', () => {
  // Arrange
  const packages = { findings: [{ id: 'GHSA-test', package: { name: 'example', ecosystem: 'npm' }, version: '1.0.0', evidence: ['/Users/test/work/example/package-lock.json'] }] };
  // Act
  const actual = matchInventory({ projectRoots: [{ path: '/Users/test/work', scope: 'work' }] }, {}, { packages });
  // Assert
  assert.equal(actual.findings[0].status, '可能性高');
  assert.equal(actual.findings[0].incident, false);
  assert.equal(actual.findings[0].scope, '仕事');
});

test('Node 内蔵 Brotli 版だけではバックポートの有無が分からず要確認とする', () => {
  // Arrange
  const inventory = { runtimes: [{ name: 'node', path: '/test/node', version: 'v26.13.0', brotli: '1.2.0', componentStatus: 'complete' }] };
  const componentRule = { id: 'brotli', kind: 'runtime-component', runtimeName: 'node', component: 'brotli', affectedRanges: ['>=1.2.0, <1.2.1'], verified: true };
  // Act
  const actual = matchRule(inventory, componentRule);
  // Assert
  assert.equal(actual.status, '可能性あり');
});

test('Node の内蔵 Brotli 版を取得できない場合は影響なしにしない', () => {
  // Arrange
  const inventory = { runtimes: [{ name: 'node', path: '/test/shim', version: 'v26.13.0', brotli: null }] };
  const componentRule = { id: 'brotli', kind: 'runtime-component', runtimeName: 'node', component: 'brotli', affectedRanges: ['>=1.2.0, <1.2.1'], verified: true };
  // Act
  const actual = matchRule(inventory, componentRule);
  // Assert
  assert.equal(actual.status, '可能性あり');
});

test('Chrome 安定版の修正境界と Canary の配布チャネルを混同しない', () => {
  // Arrange
  const inventory = { applications: [{ name: 'Google Chrome', version: '156.0.8078.80', path: '/Applications/Google Chrome.app' },
    { name: 'Google Chrome Canary', version: '155.0.0.0', path: '/Applications/Google Chrome Canary.app' }], coverage: [{ area: 'applications', status: 'complete' }] };
  const chromeRule = { id: 'chrome', kind: 'application', applicationNames: ['Google Chrome'], fixedVersion: '156.0.8078.79', affectedRange: '<156.0.8078.79', verified: true };
  // Act
  const actual = matchRule(inventory, chromeRule);
  // Assert
  assert.equal(actual.status, '影響なし');
  assert.equal(actual.evidence.length, 1);
});

test('Chrome の比較不能な版は修正済みとみなさない', () => {
  // Arrange
  const inventory = { applications: [{ name: 'Google Chrome', version: '156.0.8078.79-beta' }] };
  const chromeRule = { id: 'chrome', kind: 'application', applicationNames: ['Google Chrome'], fixedVersion: '156.0.8078.79', affectedRange: '<156.0.8078.79', verified: true };
  // Act
  const actual = matchRule(inventory, chromeRule);
  // Assert
  assert.equal(actual.status, '可能性あり');
});

test('一部のアプリroot未読を別rootの完了で覆い隠して不在・全版修正済みとしない', () => {
  // Arrange
  const appRule = { id: 'example-app', kind: 'application', applicationNames: ['Example'], affectedRange: '<2.0', fixedVersion: '2.0', verified: true };
  const coverage = [{ area: 'applications', path: '/Applications', status: 'complete' }, { area: 'applications', path: '/CustomApps', status: 'partial' }];
  // Act
  const absent = matchRule({ applications: [], coverage }, appRule);
  const fixed = matchRule({ applications: [{ name: 'Example', version: '2.0', path: '/Applications/Example.app' }], coverage }, appRule);
  const complete = matchRule({ applications: [], coverage: coverage.map(entry => ({ ...entry, status: 'complete' })) }, appRule);
  // Assert
  assert.equal(absent.status, '可能性あり');
  assert.equal(fixed.status, '可能性あり');
  assert.match(fixed.reason, /確認した版は当該影響範囲外/);
  assert.equal(fixed.evidence.length, 1);
  assert.equal(complete.status, '影響なし');
});

test('runtime managerの未読範囲が残るとき修正済み実物の個別事実だけを保持する', () => {
  // Arrange
  const runtimeRule = { id: 'node-security', kind: 'runtime', runtimeName: 'node', affectedRanges: ['>=24.0.0, <24.22.1'], supportedMajors: [24], verified: true };
  const coverage = [{ area: 'runtime:system', status: 'complete' }, { area: 'runtime:volta', status: 'partial' }];
  const runtimes = [{ name: 'node', path: '/current/node', version: 'v24.22.1', isCurrent: true }];
  // Act
  const missing = matchRule({ runtimes: [], coverage }, runtimeRule);
  const fixed = matchRule({ runtimes, coverage }, runtimeRule);
  const complete = matchRule({ runtimes, coverage: coverage.map(entry => ({ ...entry, status: 'complete' })) }, runtimeRule);
  // Assert
  assert.equal(missing.status, '可能性あり');
  assert.equal(fixed.status, '可能性あり');
  assert.equal(fixed.runtimeEvidence[0].status, '影響なし');
  assert.equal(complete.status, '影響なし');
});

test('macOS の修正バージョンそのものは影響範囲外と判定する', () => {
  // Arrange
  const inventory = { host: { osVersion: '27.2', buildVersion: '26B123' } };
  // Act
  const actual = matchRule(inventory, { id: 'macos', kind: 'os', affectedRange: '<27.2', fixedVersion: '27.2', verified: true });
  // Assert
  assert.equal(actual.status, '影響なし');
});

test('構造化 Advisory の一致は OSV と二重計上せず両方の所有範囲を示す', () => {
  // Arrange
  const packages = { packages: [{ name: 'example', ecosystem: 'npm', version: '1.0.0', evidence: ['/Users/test/Projects/x/package-lock.json', '/Users/test/work/x/package-lock.json'] }],
    findings: [{ id: 'GHSA-test', package: { name: 'example', ecosystem: 'npm' }, version: '1.0.0', evidence: ['/Users/test/Projects/x/package-lock.json', '/Users/test/work/x/package-lock.json'] }] };
  const news = { items: [{ id: 'GHSA-test', title: 'example', needsReview: false, affected: [{ ecosystem: 'npm', name: 'example', range: '<2.0.0' }] }] };
  // Act
  const actual = matchInventory({ projectRoots: [{ path: '/Users/test/Projects', scope: 'personal' }, { path: '/Users/test/work', scope: 'work' }] }, news, { packages });
  // Assert
  assert.equal(actual.findings.length, 1);
  assert.equal(actual.findings[0].scope, '個人・その他 / 仕事');
});

test('撤回済み Advisory を新規の脆弱性として追加しない', () => {
  // Arrange
  const packages = { packages: [{ name: 'example', ecosystem: 'npm', version: '1.0.0', evidence: ['local'] }] };
  const news = { items: [{ id: 'GHSA-withdrawn', title: 'example', needsReview: false, withdrawnAt: '2026-10-30T00:00:00Z', affected: [{ ecosystem: 'npm', name: 'example', range: '<2.0.0' }] }] };
  // Act
  const actual = matchInventory({}, news, { packages });
  // Assert
  assert.equal(actual.findings.length, 0);
});

test('Cursor の版が unknown なら影響版一覧にないことだけで安全扱いしない', () => {
  // Arrange
  const inventory = { extensions: [{ editor: 'cursor', id: 'anthropic.claude-code', version: 'unknown' }], coverage: [{ area: 'cursor-extensions', status: 'complete' }] };
  // Act
  const actual = matchRule(inventory, rule);
  // Assert
  assert.equal(actual.status, '可能性あり');
});

test('バックポート修正済み Node は内蔵 Brotli の古い版文字列だけで脆弱と判定しない', () => {
  // Arrange
  const inventory = { runtimes: [{ name: 'node', path: '/test/node', version: 'v24.22.1', brotli: '1.2.0', isCurrent: true }], coverage: [{ area: 'runtime:system', status: 'complete' }] };
  const componentRule = { id: 'brotli', kind: 'runtime-component', runtimeName: 'node', component: 'brotli', affectedRanges: ['>=1.2.0, <1.2.1'],
    patchedRuntimeRanges: ['>=24.22.1, <25.0.0'], supportedMajors: [24], verified: true };
  // Act
  const actual = matchRule(inventory, componentRule);
  // Assert
  assert.equal(actual.status, '影響なし');
  assert.equal(actual.runtimeEvidence[0].isCurrent, true);
});

test('サポート外 Node メジャーを既知の影響範囲外という理由で安全扱いしない', () => {
  // Arrange
  const inventory = { runtimes: [{ name: 'node', path: '/test/node', version: 'v20.0.0' }] };
  const runtimeRule = { id: 'node-security', kind: 'runtime', runtimeName: 'node', affectedRanges: ['>=24.0.0, <24.22.1'], supportedMajors: [22, 24, 26], verified: true };
  // Act
  const actual = matchRule(inventory, runtimeRule);
  // Assert
  assert.equal(actual.status, '可能性あり');
});

test('現行 Node 修正済みと旧キャッシュ脆弱版を別々の証拠として残す', () => {
  // Arrange
  const inventory = { runtimes: [{ name: 'node', path: '/current/node', version: 'v24.22.1', isCurrent: true }, { name: 'node', path: '/cache/node', version: 'v24.14.0', isCurrent: false }] };
  const runtimeRule = { id: 'node-security', kind: 'runtime', runtimeName: 'node', affectedRanges: ['>=24.0.0, <24.22.1'], supportedMajors: [24], verified: true };
  // Act
  const actual = matchRule(inventory, runtimeRule);
  // Assert
  assert.equal(actual.status, '可能性高');
  assert.deepEqual(actual.runtimeEvidence.map(entry => entry.status), ['影響なし', '可能性高']);
});

test('公式 Cursor ルールは影響版だけでは配布元不明の被害可能性を高としない', () => {
  // Arrange
  const inventory = { extensions: [{ editor: 'cursor', id: 'anthropic.claude-code', version: '2.1.313', installedAt: '2026-10-29T10:00:00Z' }], coverage: [{ area: 'cursor-extensions', status: 'complete' }] };
  const official = { ...rule, acceptedSources: ['gallery', 'Cursor marketplace'], installationWindow: { since: '2026-10-29T09:27:00Z', until: '2026-10-29T20:35:00Z' } };
  // Act
  const actual = matchRule(inventory, official);
  // Assert
  assert.equal(actual.status, '可能性あり');
});

test('公式 Cursor ルールの配布元と期間が一致する影響版は可能性高となる', () => {
  // Arrange
  const inventory = { extensions: [{ editor: 'cursor', id: 'anthropic.claude-code', version: '2.1.313', source: 'gallery', installedAt: '2026-10-29T10:00:00Z' }], coverage: [{ area: 'cursor-extensions', status: 'complete' }] };
  const official = { ...rule, acceptedSources: ['gallery', 'Cursor marketplace'], installationWindow: { since: '2026-10-29T09:27:00Z', until: '2026-10-29T20:35:00Z' } };
  // Act
  const actual = matchRule(inventory, official);
  // Assert
  assert.equal(actual.status, '可能性高');
});

test('Cursor のインストール日が攻撃期間外でもコピーや再導入を否定して安全扱いしない', () => {
  // Arrange
  const inventory = { extensions: [{ editor: 'cursor', id: 'anthropic.claude-code', version: '2.1.313', source: 'gallery', installedAt: '2026-10-31T10:00:00Z' }], coverage: [{ area: 'cursor-extensions', status: 'complete' }] };
  const official = { ...rule, acceptedSources: ['gallery'], installationWindow: { since: '2026-10-29T09:27:00Z', until: '2026-10-29T20:35:00Z' } };
  // Act
  const actual = matchRule(inventory, official);
  // Assert
  assert.equal(actual.status, '可能性あり');
});

test('拡張削除後も既知キャンペーンの補助 IOC があれば調査対象として残す', () => {
  // Arrange
  const inventory = { extensions: [], coverage: [{ area: 'extensions', status: 'complete' }] };
  const evidence = { checks: [{ ruleId: rule.id, kind: 'path', value: '~/.config/.smt', matched: true, strong: false }] };
  // Act
  const actual = matchRule(inventory, rule, evidence);
  // Assert
  assert.equal(actual.status, '可能性あり');
});

test('macOS の別メジャーを当該リリースの範囲外というだけで修正済みにしない', () => {
  // Arrange
  const inventory = { host: { osVersion: '26.6', buildVersion: 'test' } };
  // Act
  const actual = matchRule(inventory, { id: 'macos', kind: 'os', affectedRange: '>=27.0, <27.2', fixedVersion: '27.2', supportedMajors: [27], verified: true });
  // Assert
  assert.equal(actual.status, '可能性あり');
});

test('未導入の悪意ある npm パッケージを npm 利用だけで関連ニュースにしない', () => {
  // Arrange
  const inventory = { globalPackages: [{ name: 'typescript', ecosystem: 'npm', version: '6.0.0' }] };
  const news = { items: [{ id: 'GHSA-absent', title: 'Malware in absent-example (npm)', affected: [{ name: 'absent-example', ecosystem: 'npm', range: '=1.0.0' }], needsReview: false }] };
  // Act
  const actual = matchInventory(inventory, news);
  // Assert
  assert.equal(actual.newsAssessment[0].relevance, '関係なし');
  assert.equal(actual.newsAssessment[0].needsReview, false);
});

test('ロック抽出一覧があっても別のグローバル対象パッケージとの一致を見落とさない', () => {
  // Arrange
  const inventory = { globalPackages: [{ name: 'openclaw', ecosystem: 'npm', version: '2026.10.9' }] };
  const packages = { packages: [{ name: 'typescript', ecosystem: 'npm', version: '6.0.0' }] };
  const news = { items: [{ id: 'GHSA-global', title: 'openclaw advisory', affected: [{ name: 'openclaw', ecosystem: 'npm', range: '<2026.10.10' }], needsReview: false }] };
  // Act
  const actual = matchInventory(inventory, news, { packages });
  // Assert
  assert.equal(actual.newsAssessment[0].relevance, '関係あり');
  assert.deepEqual(actual.newsAssessment[0].matchedProducts, ['openclaw']);
});

test('Cursor があれば拡張未導入でも公式事件ニュースを IOC 確認対象に残す', () => {
  // Arrange
  const inventory = { applications: [{ name: 'Cursor', version: '3.0.0' }], extensions: [] };
  const news = { items: [{ id: 'CURSOR-INCIDENT', title: 'Cursor extension notice', affected: [{ name: 'anthropic.claude-code', ecosystem: 'VSCode', editor: 'cursor', versions: ['2.1.313'] }] }] };
  // Act
  const actual = matchInventory(inventory, news);
  // Assert
  assert.equal(actual.newsAssessment[0].relevance, '関係あり');
  assert.deepEqual(actual.newsAssessment[0].matchedProducts, ['cursor（IOC 確認対象）']);
});
