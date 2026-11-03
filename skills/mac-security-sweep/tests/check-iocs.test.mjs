import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { checkIocs } from '../scripts/check-iocs.mjs';
import { validateIocRules } from '../scripts/ioc-rules.mjs';
import { createRunContext } from '../scripts/runtime.mjs';

test('指定ファイルのhash一致を検出し秘密鍵本文やファイル本文を保存しない', async () => {
  // Arrange: 実在の鍵ではなく専用の試験ファイルを作る。
  const home = await realpath(await mkdtemp(path.join(tmpdir(), 'sweep-ioc-test-')));
  try {
    await mkdir(path.join(home, '.config'), { recursive: true });
    await writeFile(path.join(home, '.config/credentials.json'), 'SYNTHETIC_SECRET_NEVER_OUTPUT');
    await mkdir(path.join(home, 'Library/LaunchAgents'), { recursive: true });
    await writeFile(path.join(home, 'Library/LaunchAgents/fixture-payload'), 'SYNTHETIC_PAYLOAD_NOT_RETAINED');
    const rules = { rules: [fixtureRule([{ type: 'exact-path', relativePath: '.config/credentials.json' },
      { type: 'sha256', target: 'exact-file', relativePath: 'Library/LaunchAgents/fixture-payload', value: createHash('sha256').update('SYNTHETIC_PAYLOAD_NOT_RETAINED').digest('hex') }])] };
    // Act
    const result = await checkIocs({ extensions: [] }, { home, platform: 'darwin', rules, wallNow: () => Date.parse('2026-11-03T00:00:00Z') });
    // Assert
    assert.equal(result.checks.some(check => check.strong && check.matched), true);
    assert.equal(JSON.stringify(result).includes('SYNTHETIC_SECRET_NEVER_OUTPUT'), false);
    assert.equal(JSON.stringify(result).includes('SYNTHETIC_PAYLOAD_NOT_RETAINED'), false);
    assert.equal(result.checks.find(check => check.kind === 'sha256').reasonCode, 'ioc-exact-hash-compared');
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('拡張のルートがシンボリックリンクなら範囲外の内容を読まない', async () => {
  // Arrange
  const home = await realpath(await mkdtemp(path.join(tmpdir(), 'sweep-ioc-link-')));
  try {
    await mkdir(path.join(home, '.cursor/extensions'), { recursive: true });
    await mkdir(path.join(home, 'elsewhere'));
    await writeFile(path.join(home, 'elsewhere/extension.js'), 'synthetic fixture');
    const extension = path.join(home, '.cursor/extensions/fixture.extension-1.0.0');
    await symlink(path.join(home, 'elsewhere'), extension);
    // Act
    const result = await checkIocs({ extensions: [{ editor: 'cursor', id: 'fixture.extension', path: extension }] }, { home, platform: 'darwin',
      rules: { rules: [{ ...fixtureRule([{ type: 'sha256', target: 'extension-js', value: 'a'.repeat(64) }]), extensionId: 'fixture.extension' }] }, wallNow: () => Date.parse('2026-11-03T00:00:00Z') });
    // Assert
    assert.equal(result.checks.some(check => check.strong && check.matched), false);
    assert.equal(result.coverage.find(entry => entry.area === 'ioc-extension:cursor').status, 'partial');
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('検証済みIOCがないときはネットワーク観測があっても検査完了としない', async () => {
  // Arrange
  const home = await realpath(await mkdtemp(path.join(tmpdir(), 'sweep-ioc-network-')));
  try {
    // Act
    const result = await checkIocs({ network: { established: ['203.0.113.10:22'] } }, { home, platform: 'darwin', rules: { rules: [] }, wallNow: () => Date.parse('2026-11-03T00:00:00Z') });
    // Assert
    assert.equal(result.checks.length, 0);
    assert.equal(result.runStatus, 'partial');
    assert.equal(result.coverage[0].reason, 'no-verified-ioc-rules');
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('期限切れ・未検証・任意commandのIOCルールは一切読取を開始しない', () => {
  // Arrange
  const base = { id: 'fixture-ioc', product: 'fixture', sourceUrl: 'https://www.cisa.gov/cybersecurity-advisories/fixture', platform: 'darwin', verified: true, verifiedAt: '2026-11-01', expiresAt: '2026-11-30T00:00:00Z', iocs: [{ type: 'exact-path', relativePath: 'Projects/fixture' }] };
  // Act
  const valid = validateIocRules({ rules: [base] }, Date.parse('2026-11-03T00:00:00Z'));
  const invalid = validateIocRules({ rules: [{ ...base, verified: false }, { ...base, expiresAt: '2026-11-02' }, { ...base, iocs: [{ type: 'command', value: 'SYNTHETIC_SECRET' }] }, { ...base, iocs: [{ type: 'exact-path', relativePath: '../outside' }] }] }, Date.parse('2026-11-03T00:00:00Z'));
  // Assert
  assert.equal(valid.accepted.length, 1);
  assert.equal(invalid.accepted.length, 0);
  assert.equal(invalid.rejected.length, 4);
  assert.equal(JSON.stringify(invalid).includes('SYNTHETIC_SECRET'), false);
});

test('Linux・platform不明・非公式URL・秘密ファイルhashのIOCはローカル照合へ渡さない', () => {
  // Arrange
  const base = fixtureRule([{ type: 'process-name', value: 'fixture-process' }]);
  // Act
  const actual = validateIocRules({ rules: [{ ...base, platform: 'linux' }, { ...base, platform: undefined },
    { ...base, sourceUrl: 'https://untrusted.example/notice' }, { ...base, sourceUrl: 'https://www.cisa.gov:8443/cybersecurity-advisories/example' },
    ...['.ssh/id_ed25519', '.env', '.config/credentials.json', '.config/gh/hosts.yml', 'Library/Keychains/login.keychain-db',
      '.codex/history.jsonl', '.zshrc', '.config/fixture-payload', 'Library/Application Support/Google/Chrome/Default/Preferences'].map(relativePath => ({ ...base, iocs: [{ type: 'sha256', target: 'exact-file', relativePath, value: 'a'.repeat(64) }] }))] }, Date.parse('2026-11-03T00:00:00Z'));
  // Assert
  assert.equal(actual.accepted.length, 0);
  assert.equal(actual.rejected.length, 13);
});

test('IOC対象の権限拒否と不正ルールは秘密付き例外を診断へ転載しない', async () => {
  // Arrange
  const home = await realpath(await mkdtemp(path.join(tmpdir(), 'sweep-ioc-denied-')));
  const context = createRunContext({ home, platform: 'darwin', budgetMs: 120000, wallNow: () => Date.parse('2026-11-03T00:00:00Z') });
  const originalInspect = context.io.inspect;
  context.io.inspect = async (file, options) => { if (file === path.join(home, 'Projects/fixture')) throw Object.assign(new Error('SYNTHETIC_SECRET'), { code: 'EACCES' }); return originalInspect(file, options); };
  const rules = { rules: [{ id: 'fixture-ioc', product: 'fixture', sourceUrl: 'https://www.cisa.gov/cybersecurity-advisories/fixture', platform: 'darwin', verified: true, verifiedAt: '2026-11-01', expiresAt: '2026-11-30T00:00:00Z', iocs: [{ type: 'exact-path', relativePath: 'Projects/fixture' }] }] };
  try {
    // Act
    const result = await checkIocs({ extensions: [] }, { context, rules });
    // Assert
    assert.equal(result.checks[0].status, 'denied');
    assert.equal(result.runStatus, 'partial');
    assert.equal(result.diagnostics[0].cause, 'denied');
    assert.equal(JSON.stringify(result).includes('SYNTHETIC_SECRET'), false);
  } finally { await context.close(); await rm(home, { recursive: true, force: true }); }
});

test('extensionの対象IDがないhashルールを実行済みにせずprocess部分読取も未知を保持する', async () => {
  // Arrange
  const now = Date.parse('2026-11-03T00:00:00Z');
  const base = { id: 'fixture-ioc', product: 'fixture', sourceUrl: 'https://www.cisa.gov/cybersecurity-advisories/fixture', platform: 'darwin', verified: true, verifiedAt: '2026-11-01', expiresAt: '2026-11-30T00:00:00Z' };
  const invalid = validateIocRules({ rules: [{ ...base, iocs: [{ type: 'sha256', target: 'extension-js', value: 'a'.repeat(64) }] }] }, now);
  const context = createRunContext({ platform: 'darwin', budgetMs: 120000, wallNow: () => now });
  try {
    // Act
    const partial = await checkIocs({ processes: [], coverage: [{ area: 'processes', status: 'partial' }] }, { context, rules: { rules: [{ ...base, iocs: [{ type: 'process-name', value: 'fixture-process' }] }] } });
    const complete = await checkIocs({ processes: [], coverage: [{ area: 'processes', status: 'complete' }] }, { context, rules: { rules: [{ ...base, iocs: [{ type: 'process-name', value: 'fixture-process' }] }] } });
    // Assert
    assert.equal(invalid.accepted.length, 0);
    assert.equal(invalid.rejected.length, 1);
    assert.equal(partial.checks[0].matched, null);
    assert.equal(partial.runStatus, 'partial');
    assert.equal(complete.checks[0].matched, false);
    assert.equal(complete.runStatus, 'complete-with-exclusions');
  } finally { await context.close(); }
});

/** Supply only synthetic, explicitly reviewed Mac indicators to checker fixtures.
 * @example fixtureRule([{ type: 'exact-path', relativePath: 'Projects/fixture' }])
 */
function fixtureRule(iocs) {
  return { id: 'fixture-ioc', product: 'fixture', sourceUrl: 'https://www.cisa.gov/cybersecurity-advisories/fixture', platform: 'darwin',
    verified: true, verifiedAt: '2026-11-01', expiresAt: '2026-11-30T00:00:00Z', iocs };
}

test('exact-file hashの不在・不一致・読取拒否とリンクを区別し実行しない', async () => {
  // Arrange
  const home = await realpath(await mkdtemp(path.join(tmpdir(), 'sweep-ioc-file-')));
  const context = createRunContext({ home, platform: 'darwin', budgetMs: 120000, wallNow: () => Date.parse('2026-11-03T00:00:00Z') });
  try {
    await writeFile(path.join(home, 'present'), 'synthetic mismatch');
    await symlink(path.join(home, 'present'), path.join(home, 'link'));
    const rules = { rules: [fixtureRule(['present', 'absent', 'link'].map(relativePath => ({ type: 'sha256', target: 'exact-file', relativePath, value: 'a'.repeat(64) })))] };
    // Act
    const actual = await checkIocs({}, { context, rules });
    // Assert
    assert.deepEqual(actual.checks.map(check => [path.basename(check.value), check.matched, check.strong]), [['present', false, false], ['absent', false, false], ['link', null, false]]);
    assert.equal(actual.runStatus, 'partial');
    assert.equal(actual.commands.length, 0);
  } finally { await context.close(); await rm(home, { recursive: true, force: true }); }
});

test('出典が競合する同一IDのルールと未検証候補は自動実行しない', async () => {
  // Arrange
  const context = createRunContext({ platform: 'darwin', budgetMs: 120000, wallNow: () => Date.parse('2026-11-03T00:00:00Z') });
  const rule = fixtureRule([{ type: 'process-name', value: 'fixture-process' }]);
  try {
    // Act
    const actual = await checkIocs({ processes: [{ name: 'fixture-process' }], coverage: [{ area: 'processes', status: 'complete' }] },
      { context, rules: { rules: [rule] }, discovery: { rules: [{ ...rule, product: 'different-fixture' }], candidates: [{ id: 'pending' }] } });
    // Assert
    assert.equal(actual.checks.length, 0);
    assert.equal(actual.runStatus, 'partial');
    assert.equal(actual.coverage.some(row => row.reason === 'conflicting-ioc-rules'), true);
    assert.equal(actual.coverage.some(row => row.reasonCode === 'ioc-candidates-unreviewed'), true);
  } finally { await context.close(); }
});

test('IOC情報源の取得失敗を検査完了へ変換しない', async () => {
  // Arrange
  const context = createRunContext({ platform: 'darwin', budgetMs: 120000, wallNow: () => Date.parse('2026-11-03T00:00:00Z') });
  try {
    // Act
    const result = await checkIocs({ processes: [], coverage: [{ area: 'processes', status: 'complete' }] }, { context,
      rules: { rules: [fixtureRule([{ type: 'process-name', value: 'fixture-process' }])] },
      discovery: { coverage: [{ sourceId: 'fixture-source', status: 'failed', reasonCode: 'SOURCE_UNAVAILABLE' }] } });
    // Assert
    assert.equal(result.runStatus, 'partial');
    assert.equal(result.coverage.find(row => row.area === 'ioc-discovery').status, 'failed');
  } finally { await context.close(); }
});
