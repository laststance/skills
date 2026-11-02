import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkIocs } from '../scripts/check-iocs.mjs';
import { validateIocRules, endpointHasIp } from '../scripts/ioc-rules.mjs';
import { createRunContext } from '../scripts/runtime.mjs';

test('秘密鍵の内容を出さずに固有ペイロードを検出する', async () => {
  // Arrange: 実在の鍵ではなく専用の試験ファイルを作る。
  const home = await realpath(await mkdtemp(path.join(tmpdir(), 'sweep-ioc-test-')));
  try {
    await mkdir(path.join(home, '.config'), { recursive: true });
    await writeFile(path.join(home, '.config/.smtk'), 'SYNTHETIC_SECRET_NEVER_OUTPUT');
    await writeFile(path.join(home, '.config/.smt'), '134.209.82.225 svc-telemetry');
    // Act
    const result = await checkIocs({ extensions: [], network: {} }, { home, temp: home, logs: false, wallNow: () => Date.parse('2026-11-03T00:00:00Z') });
    // Assert
    assert.equal(result.checks.some(check => check.strong && check.matched), true);
    assert.equal(JSON.stringify(result).includes('SYNTHETIC_SECRET_NEVER_OUTPUT'), false);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('拡張のルートがシンボリックリンクなら範囲外の内容を読まない', async () => {
  // Arrange
  const home = await realpath(await mkdtemp(path.join(tmpdir(), 'sweep-ioc-link-')));
  try {
    await mkdir(path.join(home, '.cursor/extensions'), { recursive: true });
    await mkdir(path.join(home, 'elsewhere'));
    await writeFile(path.join(home, 'elsewhere/extension.js'), '134.209.82.225 svc-telemetry');
    const extension = path.join(home, '.cursor/extensions/anthropic.claude-code-2.1.313');
    await symlink(path.join(home, 'elsewhere'), extension);
    // Act
    const result = await checkIocs({ extensions: [{ editor: 'cursor', id: 'anthropic.claude-code', path: extension }] }, { home, temp: home, logs: false, wallNow: () => Date.parse('2026-11-03T00:00:00Z') });
    // Assert
    assert.equal(result.checks.some(check => check.strong && check.matched), false);
    assert.equal(result.coverage.find(entry => entry.area === 'ioc-extension:cursor').status, 'partial');
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('一般的なネットワーク情報を侵害の確定証拠へ格上げしない', async () => {
  // Arrange
  const home = await realpath(await mkdtemp(path.join(tmpdir(), 'sweep-ioc-network-')));
  try {
    // Act
    const result = await checkIocs({ network: { established: ['134.209.82.225:22'] } }, { home, temp: home, logs: false, wallNow: () => Date.parse('2026-11-03T00:00:00Z') });
    // Assert
    assert.equal(result.checks.find(check => check.kind === 'network').matched, true);
    assert.equal(result.checks.find(check => check.kind === 'network').strong, false);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('期限切れ・未検証・任意commandのIOCルールは一切読取を開始しない', () => {
  // Arrange
  const base = { id: 'fixture-ioc', product: 'fixture', sourceUrl: 'https://vendor.example/security/notice', verified: true, verifiedAt: '2026-11-01', expiresAt: '2026-11-30T00:00:00Z', iocs: [{ type: 'exact-path', relativePath: 'Projects/fixture' }] };
  // Act
  const valid = validateIocRules({ rules: [base] }, Date.parse('2026-11-03T00:00:00Z'));
  const invalid = validateIocRules({ rules: [{ ...base, verified: false }, { ...base, expiresAt: '2026-11-02' }, { ...base, iocs: [{ type: 'command', value: 'SYNTHETIC_SECRET' }] }, { ...base, iocs: [{ type: 'exact-path', relativePath: '../outside' }] }] }, Date.parse('2026-11-03T00:00:00Z'));
  // Assert
  assert.equal(valid.accepted.length, 1);
  assert.equal(invalid.accepted.length, 0);
  assert.equal(invalid.rejected.length, 4);
  assert.equal(JSON.stringify(invalid).includes('SYNTHETIC_SECRET'), false);
});

test('IOCはIP完全一致を使い数字prefixやドメイン名を誤検知しない', () => {
  // Arrange
  const ip = '134.209.82.225';
  // Act
  const actual = ['134.209.82.225:443', '127.0.0.1:123->134.209.82.225:443', '134.209.82.2250:443', '134.209.82.225.example.test:443'].map(value => endpointHasIp(value, ip));
  // Assert
  assert.deepEqual(actual, [true, true, false, false]);
});

test('IOC対象の権限拒否と不正ルールは秘密付き例外を診断へ転載しない', async () => {
  // Arrange
  const home = await realpath(await mkdtemp(path.join(tmpdir(), 'sweep-ioc-denied-')));
  const context = createRunContext({ home, budgetMs: 120000, wallNow: () => Date.parse('2026-11-03T00:00:00Z') });
  const originalInspect = context.io.inspect;
  context.io.inspect = async (file, options) => { if (file === path.join(home, 'Projects/fixture')) throw Object.assign(new Error('SYNTHETIC_SECRET'), { code: 'EACCES' }); return originalInspect(file, options); };
  const rules = { rules: [{ id: 'fixture-ioc', product: 'fixture', sourceUrl: 'https://vendor.example/security/notice', verified: true, verifiedAt: '2026-11-01', expiresAt: '2026-11-30T00:00:00Z', iocs: [{ type: 'exact-path', relativePath: 'Projects/fixture' }] }] };
  try {
    // Act
    const result = await checkIocs({ extensions: [] }, { context, rules, logs: false, temp: home });
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
  const base = { id: 'fixture-ioc', product: 'fixture', sourceUrl: 'https://vendor.example/security/notice', verified: true, verifiedAt: '2026-11-01', expiresAt: '2026-11-30T00:00:00Z' };
  const invalid = validateIocRules({ rules: [{ ...base, iocs: [{ type: 'sha256', target: 'extension-js', value: 'a'.repeat(64) }] }] }, now);
  const context = createRunContext({ budgetMs: 120000, wallNow: () => now });
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
