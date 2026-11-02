import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkIocs } from '../scripts/check-iocs.mjs';

test('秘密鍵の内容を出さずに固有ペイロードを検出する', async () => {
  // Arrange: 実在の鍵ではなく専用の試験ファイルを作る。
  const home = await realpath(await mkdtemp(path.join(tmpdir(), 'sweep-ioc-test-')));
  try {
    await mkdir(path.join(home, '.config'), { recursive: true });
    await writeFile(path.join(home, '.config/.smtk'), 'SYNTHETIC_SECRET_NEVER_OUTPUT');
    await writeFile(path.join(home, '.config/.smt'), '134.209.82.225 svc-telemetry');
    // Act
    const result = await checkIocs({ extensions: [], network: {} }, { home, temp: home, logs: false });
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
    const result = await checkIocs({ extensions: [{ editor: 'cursor', id: 'anthropic.claude-code', path: extension }] }, { home, temp: home, logs: false });
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
    const result = await checkIocs({ network: { established: ['134.209.82.225:22'] } }, { home, temp: home, logs: false });
    // Assert
    assert.equal(result.checks.find(check => check.kind === 'network').matched, true);
    assert.equal(result.checks.find(check => check.kind === 'network').strong, false);
  } finally { await rm(home, { recursive: true, force: true }); }
});
