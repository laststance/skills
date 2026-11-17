#!/usr/bin/env node
// Recorded Japanese journeys through Playwright CLI on a disposable home/Trash.
// The controller is a fixture adapter, not evidence of a live host-agent round trip.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startBridge } from '../../scripts/lib/bridge.mjs';
import { makeFixture, newSession, idFor, safeAssessment, reviewAssessment } from '../helpers.mjs';

const exec = promisify(execFile);
const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.resolve(process.argv[2] ?? await fsp.mkdtemp(path.join(os.tmpdir(), 'disk-map-ui-')));
await fsp.mkdir(out, { recursive: true });
const fx = await makeFixture();
const session = await newSession(fx, { locale: 'ja' });
const browserName = `diskmap-${path.basename(fx.base).slice(-6)}`;
const cliFile = path.join(fx.base, 'session.json');
const steps = [];
let bridge;
let recording = false;

/** Run one CLI browser command, failing when its reported action failed.
 * Used by the recorded journey; output is kept private because bootstrap URLs carry a token.
 * @example
 * await browser('resize', '1440', '1000');
 */
async function browser(...args) {
  const { stdout } = await exec(process.env.DISK_MAP_PLAYWRIGHT_CLI ?? 'playwright-cli', [`-s=${browserName}`, ...args], { cwd: fx.base, timeout: 45_000, maxBuffer: 2 * 1024 * 1024 });
  if (/### Error|Error:|TimeoutError:/.test(stdout)) throw new Error(stdout);
  return stdout;
}

/** Drive a named UI behavior and record its result for the regression report.
 * @example
 * await ui('opens the manifest', "await page.locator('#cleanup').click();");
 */
async function ui(name, code) {
  await browser('run-code', `async page => { ${code} }`);
  steps.push({ name, passed: true });
}

/** Call the real disk-map CLI against the fixture bridge, including nonzero pause status.
 * @example
 * const event = await agent('next', '--timeout', '1');
 */
async function agent(...args) {
  try {
    const result = await exec(process.execPath, [path.join(skillDir, 'scripts/disk-map.mjs'), ...args, '--session', cliFile]);
    return { code: 0, json: JSON.parse(result.stdout) };
  } catch (error) {
    if (!error.stdout) throw error;
    return { code: error.code, json: JSON.parse(error.stdout) };
  }
}

/** Acknowledge completion through the CLI so inactivity can subsequently pause.
 * @example
 * await acknowledgeCompletion('cleanup', 2);
 */
async function acknowledgeCompletion(operation, succeeded) {
  const event = await agent('next', '--timeout', '1');
  assert.equal(event.json.kind, 'operation-complete');
  assert.equal(event.json.payload.operation, operation);
  assert.equal(event.json.payload.counts.succeeded, succeeded);
  const file = path.join(fx.base, 'reply.json');
  await fsp.writeFile(file, JSON.stringify({ messageId: event.json.messageId, revision: event.json.payload.revision, text: `${succeeded}件の処理が完了しました。` }));
  assert.equal((await agent('respond', '--file', file)).json.ok, true);
}

try {
  // Arrange: only fixture files may be cleaned or restored.
  await session.startScan();
  const scan = await session.nextEvent(1);
  const build = idFor(session, path.join(fx.project, '.next'));
  const media = idFor(session, path.join(fx.home, 'Movies/old-demo'));
  await session.assess({ scanId: session.scanId, revision: 0, messageId: scan.messageId, assessments: [
    { ...safeAssessment(build), purpose: '再生成できるビルド出力', reason: 'Gitの無視対象で、次回のビルド時に再生成されます。', consequences: ['次のビルドに時間がかかります。'] },
    { ...reviewAssessment(media), purpose: '確認用の録画', reason: '利用目的を確認する必要があります。', consequences: ['ゴミ箱を空にすると復元できません。'], question: 'この録画を残しますか？' },
  ] });
  bridge = await startBridge(session, { assetsDir: path.join(skillDir, 'assets') });
  await fsp.writeFile(cliFile, JSON.stringify({ origin: bridge.origin, agentToken: bridge.agentToken }), { mode: 0o600 });
  await browser('open', bridge.viewerUrl);
  await browser('resize', '1440', '1000');
  await browser('video-start', path.join(out, 'improvements.webm'), '--size=1440x1000', '--fps=25');
  recording = true;

  // Act / Assert: clear affects question context only, never cleanup selection.
  await ui('Japanese question-clear preserves cleanup selection and files', `
    await page.locator('#status', { hasText: '読み取り専用スキャン完了' }).waitFor();
    await page.getByRole('button', { name: '再生成できるビルド出力', exact: true }).click();
    await page.getByRole('button', { name: 'チャットで質問', exact: true }).click();
    await page.getByRole('button', { name: '質問対象を解除', exact: true }).click();
    if (await page.locator('#context').isVisible()) throw new Error('Question context remains visible');
    if (!(await page.locator('#recs input[type=checkbox]').first().isChecked())) throw new Error('Cleanup selection was cleared');
  `);
  assert.equal((await fsp.stat(path.join(fx.project, '.next/server/page.js'))).size, 40_000);

  await ui('Japanese review and manifest lead to two successful cleanup outcomes', `
    await page.locator('#recs .rec', { hasText: '確認用の録画' }).getByRole('button', { name: '確認', exact: true }).click();
    await page.locator('#review-body').getByRole('button', { name: 'ゴミ箱に移動', exact: true }).click();
    await page.locator('#sel-summary', { hasText: '2 件選択' }).waitFor();
    await page.locator('#cleanup').click();
    await page.getByRole('button', { name: 'クリーンアップを確定', exact: true }).click();
    await page.locator('#completion-summary', { hasText: '成功 2件' }).waitFor();
    await page.locator('#completion-actions').scrollIntoViewIfNeeded();
    if (!(await page.getByRole('button', { name: '続けて調べる', exact: true }).isVisible())) throw new Error('Continue missing');
    if (!(await page.locator('#finish').isVisible())) throw new Error('Finish missing');
    await page.screenshot({ path: ${JSON.stringify(path.join(out, 'completed-ja.png'))} });
  `);
  await acknowledgeCompletion('cleanup', 2);

  await ui('Continue focuses search and Restore opens an exact restore manifest', `
    await page.getByRole('button', { name: '続けて調べる', exact: true }).click();
    if (!(await page.locator('#search').evaluate(el => el === document.activeElement))) throw new Error('Search not focused');
    await page.locator('#restore-trash').click();
    await page.locator('#plan-dialog').getByRole('button', { name: '復元', exact: true }).click();
    await page.locator('#completion-summary', { hasText: '成功 1件' }).waitFor();
    await page.locator('#outcomes', { hasText: '元の場所へ復元しました。' }).waitFor();
  `);
  await acknowledgeCompletion('restore', 1);
  assert.equal((await fsp.stat(path.join(fx.home, 'Movies/old-demo/take-1.mov'))).size, 500_000);

  // Advance only the fixture's activity timestamp, using the production three-minute threshold.
  session.lastViewerActivity = Date.now() - 181_000;
  session.tick();
  const paused = await agent('next', '--timeout', '1');
  assert.equal(paused.code, 6);
  assert.equal(paused.json.type, 'session-paused');
  await ui('Inactivity shows a read-only Japanese pause and explicit resume restores investigation', `
    await page.locator('#resume').waitFor();
    if (!(await page.locator('#chat-input').isDisabled())) throw new Error('Paused chat accepts input');
    if (!(await page.locator('#cleanup').isDisabled())) throw new Error('Paused cleanup enabled');
    await page.locator('#resume').scrollIntoViewIfNeeded();
    await page.screenshot({ path: ${JSON.stringify(path.join(out, 'paused-ja.png'))} });
    await page.locator('#resume').click();
    await page.locator('#resume').waitFor({ state: 'hidden' });
  `);
  assert.equal((await agent('next', '--timeout', '1')).json.type, 'idle');

  await ui('Save report and end disables live actions and retains the Japanese report', `
    await page.locator('#agent', { hasText: 'エージェント接続中' }).waitFor();
    await page.locator('#finish').click();
    await page.locator('#status', { hasText: 'セッション終了' }).waitFor();
    if (!(await page.locator('#chat-input').isDisabled())) throw new Error('Ended chat accepts input');
    await page.locator('#status').scrollIntoViewIfNeeded();
    await page.screenshot({ path: ${JSON.stringify(path.join(out, 'ended-ja.png'))} });
  `);
  assert.equal((await agent('next', '--timeout', '1')).json.kind, 'session-ended');
  const report = await fsp.readFile(session.reports.snapshot, 'utf8');
  assert.match(report, /ディスクマップのレポート/);
  assert.doesNotMatch(report, /<script|NaN/);
  await fsp.copyFile(session.reports.snapshot, path.join(out, 'fixture-report-ja.html'));
  await browser('video-stop');
  recording = false;
  const consoleOutput = await browser('console', 'error');
  assert.doesNotMatch(consoleOutput, /\[ERROR\]/);
  await fsp.writeFile(path.join(out, 'results.json'), JSON.stringify({ passed: steps.length, steps, fixtureOnly: true, video: 'improvements.webm' }, null, 2));
  console.log(JSON.stringify({ passed: steps.length, out }));
} finally {
  // Close only this fixture's browser and server, including on a failed assertion.
  if (recording) await browser('video-stop').catch(() => {});
  await browser('close').catch(() => {});
  clearInterval(session.timer);
  if (session.running) await session.running;
  if (session.pauseReport) await session.pauseReport;
  bridge?.server.closeAllConnections();
  bridge?.server.close();
  await fx.cleanup();
}
