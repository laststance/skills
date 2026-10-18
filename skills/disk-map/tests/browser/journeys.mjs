#!/usr/bin/env node
// Browser journeys E1–E8 on a disposable fixture with a synthetic Trash.
// The test process plays the invoking agent through the real CLI mailbox
// (next / assess / respond); this is fixture validation, not a live host check.
//
// Usage: DISK_MAP_PLAYWRIGHT=/abs/path/to/playwright-core/index.mjs node tests/browser/journeys.mjs [OUT_DIR]
// Exits 77 (skipped) when no Playwright module is available.
import { execFileSync, spawnSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFixture, writeBytes } from '../helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.resolve(here, '../../scripts/disk-map.mjs');
const out = path.resolve(process.argv[2] ?? (await fsp.mkdtemp(path.join(os.tmpdir(), 'disk-map-e2e-'))));
await fsp.mkdir(out, { recursive: true });

let playwright;
for (const specifier of [process.env.DISK_MAP_PLAYWRIGHT, 'playwright-core', 'playwright'].filter(Boolean)) {
  try {
    playwright = await import(specifier);
    break;
  } catch {
    // Try the next module specifier.
  }
}
if (!playwright) {
  console.log(JSON.stringify({ skipped: true, reason: 'Set DISK_MAP_PLAYWRIGHT to a playwright-core index.mjs path.' }));
  process.exit(77);
}
const { chromium } = playwright.default ?? playwright;

const fx = await makeFixture();
for (let index = 0; index < 1000; index += 1) await writeBytes(path.join(fx.home, 'Downloads', 'many', `file-${String(index).padStart(4, '0')}.bin`), 4096 + index);
const started = JSON.parse(execFileSync(process.execPath, [script, 'start', '--root', fx.home, '--home', fx.home, '--state-dir', fx.state, '--trash-dir', fx.trash, '--locale', 'en', '--file-node-threshold', '0'], { encoding: 'utf8' }));
const sessionFile = started.session;
const agentToken = JSON.parse(await fsp.readFile(sessionFile, 'utf8')).agentToken;

let lastAgentCall = Date.now();
const cli = (command, ...args) => {
  lastAgentCall = Date.now();
  const result = spawnSync(process.execPath, [script, command, '--session', sessionFile, ...args], { encoding: 'utf8' });
  return { code: result.status, json: JSON.parse(result.stdout || '{}') };
};
let fileCounter = 0;
const bodyFile = async (value) => {
  const file = path.join(fx.base, `agent-${(fileCounter += 1)}.json`);
  await fsp.writeFile(file, JSON.stringify(value));
  return file;
};
const nextEvent = (kind) => {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const event = cli('next', '--timeout', '5').json;
    if (event.type === 'event' && (!kind || event.kind === kind)) return event;
  }
  throw new Error(`No ${kind} event`);
};

const results = [];
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
async function step(name, run) {
  const begin = Date.now();
  try {
    const detail = await run();
    results.push({ name, ok: true, ms: Date.now() - begin, detail: detail ?? null });
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - begin, error: error.message });
    await page.screenshot({ path: path.join(out, `failed-${results.length}.png`) }).catch(() => {});
  }
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, recordVideo: { dir: out, size: { width: 1440, height: 1000 } } });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (message) => message.type() === 'error' && consoleErrors.push(message.text()));
page.on('pageerror', (error) => consoleErrors.push(error.message));
const now = () => new Date().toISOString();
const tile = (name) => page.locator('.tile[data-id]').filter({ has: page.locator('.name', { hasText: new RegExp(`^${name.replace('.', '\\.')}$`) }) }).first();
// Parent tiles are covered by their child tiles except for the header strip.
const clickTile = (name) => tile(name).click({ position: { x: 12, y: 10 } });
const openFolder = async (name) => {
  await clickTile(name);
  await page.locator('#drawer').getByRole('button', { name: 'Open folder' }).click();
  await page.locator('.crumbs [aria-current="page"]', { hasText: name }).waitFor();
};

await step('E0 viewer bootstraps and removes the one-use token from the URL', async () => {
  await page.goto(started.viewerUrl);
  await page.locator('#status', { hasText: 'Read-only scan complete' }).waitFor({ timeout: 15_000 });
  check(!page.url().includes('#'), `URL still has a fragment: ${page.url()}`);
  check(await page.evaluate(() => Boolean(sessionStorage.getItem('disk-map-viewer'))), 'viewer credential missing from sessionStorage');
});

let scanEvent;
await step('agent assesses candidates through the CLI mailbox', async () => {
  scanEvent = nextEvent('scan-complete');
  const nextCandidate = scanEvent.payload.candidates.find((candidate) => candidate.path.endsWith('/shop/.next'));
  const demo = scanEvent.payload.largest.find((item) => item.path.endsWith('/Movies/old-demo'));
  check(nextCandidate && demo, 'scan-complete lacks the .next candidate or the recording folder');
  const evidence = [{ kind: 'local', reference: 'git check-ignore -q reports .next ignored; no process uses the project', checkedAt: now() }, { kind: 'documentation', reference: 'https://nextjs.org/docs/app/api-reference/cli/next', checkedAt: now() }];
  const assessed = cli('assess', '--file', await bodyFile({ scanId: scanEvent.payload.scanId, revision: 0, messageId: scanEvent.messageId, assessments: [
    { candidateId: nextCandidate.candidateId, risk: 'safe', purpose: 'Next.js build output', reason: 'Git-ignored build output regenerated by next build.', consequences: ['The next build is slower once.'], evidence, recipe: 'build-output', question: null },
    { candidateId: demo.candidateId, risk: 'review', purpose: 'Old screen recordings', reason: 'Personal media; only you know if it is still needed.', consequences: ['Lost if the Trash is emptied.'], evidence: [{ kind: 'local', reference: 'Two .mov files, last modified long ago', checkedAt: now() }], recipe: 'trash', question: 'Do you still need these demo recordings?' },
  ] }));
  check(assessed.code === 0, JSON.stringify(assessed.json));
  return assessed.json.results.map((result) => `${result.risk}:${result.selected}`);
});

await step('E1 map drill-down and breadcrumbs show the right region and path', async () => {
  await page.locator('#recs .rec', { hasText: 'Next.js build output' }).waitFor();
  await openFolder('work');
  await openFolder('shop');
  await clickTile('.next');
  const pathText = await page.locator('#drawer code').textContent();
  check(pathText === path.join(fx.project, '.next'), `drawer path ${pathText}`);
  await page.keyboard.press('Escape');
  const crumbs = await page.locator('.crumbs button').allTextContents();
  check(crumbs.slice(-2).join('/') === 'work/shop', `crumbs ${crumbs}`);
  await page.locator('.crumbs button').first().click();
  await page.locator('.crumbs [aria-current="page"]', { hasText: fx.home }).waitFor();
  return crumbs.length;
});

await step('E2 manual checkbox changes the selected count and persists', async () => {
  const box = page.locator('#recs .rec', { hasText: 'Next.js build output' }).locator('input[type="checkbox"]');
  check(await box.isChecked(), 'safe item not preselected');
  await page.locator('#sel-summary', { hasText: '1 selected' }).waitFor();
  await box.uncheck();
  await page.locator('#sel-summary', { hasText: 'Nothing selected' }).waitFor();
  await box.check();
  await page.locator('#sel-summary', { hasText: '1 selected' }).waitFor();
  return await page.locator('#sel-summary').textContent();
});

await step('E3 review dialog scopes consent to the listed path', async () => {
  const row = page.locator('#recs .rec', { hasText: 'Old screen recordings' });
  check(await row.locator('input[type="checkbox"]').isDisabled(), 'review checkbox enabled before an answer');
  await row.getByRole('button', { name: 'Review' }).click();
  const listed = await page.locator('#review-body ul.mono li').allTextContents();
  check(listed.length === 1 && listed[0].startsWith(path.join(fx.home, 'Movies', 'old-demo')), `listed ${listed}`);
  await page.locator('#review-body').getByRole('button', { name: 'Move to Trash' }).click();
  await page.locator('#sel-summary', { hasText: '2 selected' }).waitFor();
  check(await row.locator('input[type="checkbox"]').isChecked(), 'review item not checked after Trash decision');
  return listed[0];
});

await step('E5 chat question reaches the agent with context and the reply appears', async () => {
  await page.locator('#list button.link', { hasText: /^Documents$/ }).click();
  await page.keyboard.press('Escape');
  await page.locator('#context-text', { hasText: 'About: Documents' }).waitFor();
  await page.fill('#chat-input', 'What is inside this folder?');
  await page.getByRole('button', { name: 'Send' }).click();
  const event = nextEvent('chat');
  check(event.payload.candidates[0].path === path.join(fx.home, 'Documents'), `context ${JSON.stringify(event.payload.candidates)}`);
  cli('respond', '--file', await bodyFile({ messageId: event.messageId, revision: 0, text: 'It holds one Japanese notes folder (1 KB). Keep it.', candidateIds: [event.payload.candidates[0].candidateId] }));
  await page.locator('#messages .msg.agent', { hasText: 'Japanese notes folder' }).waitFor();
  return event.payload.text;
});

await step('E6 keyboard opens a region within 200 ms and focus returns on close', async () => {
  const first = page.locator('.tile[data-id]').first();
  await first.focus();
  // Wall-clock from a real Enter key press to a visible drawer (includes driver overhead).
  const start = Date.now();
  await page.keyboard.press('Enter');
  await page.locator('#drawer').waitFor({ state: 'visible' });
  const elapsed = Date.now() - start;
  await page.keyboard.press('Escape');
  const focusReturned = await page.evaluate(() => document.activeElement?.classList.contains('tile'));
  check(elapsed < 200 && focusReturned, `elapsed ${elapsed} focusReturned ${focusReturned}`);
  return { drawerOpenMs: Number(elapsed.toFixed(1)) };
});

await step('E4 final manifest lists exactly the reviewed targets and execution matches it', async () => {
  cli('heartbeat');
  await page.locator('#agent', { hasText: 'Agent connected' }).waitFor();
  await page.getByRole('button', { name: 'Clean Up' }).click();
  const rows = page.locator('#plan-dialog tbody tr');
  await rows.first().waitFor();
  const texts = await rows.allTextContents();
  check(texts.length === 2, `manifest rows ${texts.length}`);
  check(texts.some((text) => text.includes('/shop/.next') && text.includes('Cannot be undone')), 'missing irreversible .next row');
  check(texts.some((text) => text.includes('/Movies/old-demo') && text.includes('Restorable from Trash')), 'missing Trash row');
  await page.getByRole('button', { name: 'Confirm cleanup' }).click();
  await page.locator('#outcomes .badge', { hasText: 'Succeeded' }).nth(1).waitFor({ timeout: 15_000 });
  const exists = (target) => fsp.lstat(target).then(() => true, () => false);
  check(!(await exists(path.join(fx.project, '.next'))), '.next still exists');
  check(await exists(path.join(fx.project, 'src', 'index.js')), 'source file removed');
  check(await exists(path.join(fx.home, '.ssh', 'id_test')), 'protected file removed');
  const wrappers = await fsp.readdir(fx.trash);
  check(wrappers.length === 1 && wrappers[0].startsWith('disk-map-'), `trash ${wrappers}`);
  return { manifestRows: texts.length, trash: wrappers[0] };
});

await step('E8 post-clean results show statuses and restore puts the recording back', async () => {
  const metrics = await page.locator('#metrics').textContent();
  check(metrics.includes('Moved to Trash (not freed)') && metrics.includes('Observed free-space change'), 'metrics missing');
  await page.locator('#outcomes').getByRole('button', { name: 'Restore' }).click();
  await page.locator('#plan-dialog').getByRole('button', { name: 'Restore' }).click();
  await page.locator('#outcomes .badge', { hasText: 'Succeeded' }).nth(2).waitFor({ timeout: 10_000 });
  const size = (await fsp.stat(path.join(fx.home, 'Movies', 'old-demo', 'take-1.mov'))).size;
  check(size === 500_000, `restored size ${size}`);
  return { restoredBytes: size };
});

await step('large folder renders at most 300 tiles with paginated list', async () => {
  await openFolder('Downloads');
  await openFolder('many');
  const tiles = await page.locator('.tile').count();
  const rows = await page.locator('#list tr').count();
  check(tiles <= 300 && rows === 300 && (await page.locator('#more').isVisible()), `tiles ${tiles} rows ${rows}`);
  // Each page holds 300 entries; keep paging until the cursor runs out.
  while (await page.locator('#more').isVisible()) {
    const before = await page.locator('#list tr').count();
    await page.locator('#more').click();
    await page.locator('#list tr').nth(before).waitFor();
  }
  const allRows = await page.locator('#list tr').count();
  check(allRows === 1000, `rows after more ${allRows}`);
  await page.locator('.crumbs button').first().click();
  return { tiles, rows, allRows };
});

await step('E6 small screen and reduced motion keep primary actions reachable', async () => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const button = await page.getByRole('button', { name: 'Clean Up' }).boundingBox();
  const cards = await page.locator('.card').evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().left)));
  const transition = await page.locator('.tile').first().evaluate((element) => getComputedStyle(element).transitionDuration);
  await page.screenshot({ path: path.join(out, 'mobile.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });
  check(button && button.y + button.height <= 844 && button.height >= 44, `button ${JSON.stringify(button)}`);
  check(new Set(cards).size === 1, `cards not stacked ${cards}`);
  check(transition === '0s', `transition ${transition}`);
  return { button, transition };
});

await step('E7 export is inert and contains no credentials', async () => {
  await page.getByRole('button', { name: 'Export report' }).click();
  const text = await page.locator('#banner', { hasText: 'Report written to' }).textContent();
  const snapshot = text.replace('Report written to ', '').trim();
  const html = await fsp.readFile(snapshot, 'utf8');
  const viewerToken = await page.evaluate(() => sessionStorage.getItem('disk-map-viewer'));
  const bootstrap = new URL(started.viewerUrl).hash.slice(3);
  check(![agentToken, viewerToken, bootstrap].some((secret) => html.includes(secret)), 'credential in snapshot');
  check(!/<script/i.test(html), 'script in snapshot');
  const offline = await context.newPage();
  await offline.goto(`file://${snapshot}`);
  const disabled = await offline.locator('button[disabled]').count();
  await offline.close();
  check(disabled >= 2, `disabled buttons ${disabled}`);
  return { snapshot: path.basename(snapshot), disabledButtons: disabled };
});

await step('E5 a silent agent shows as disconnected within 5 s of lease expiry and Clean Up pauses', async () => {
  const waitStart = Date.now();
  await page.locator('#agent', { hasText: 'Agent disconnected' }).waitFor({ timeout: 80_000 });
  const secondsSilent = (Date.now() - lastAgentCall) / 1000;
  check(secondsSilent <= 65.5, `disconnected after ${secondsSilent}s`);
  check(await page.getByRole('button', { name: 'Clean Up' }).isDisabled(), 'Clean Up enabled while disconnected');
  const help = await page.locator('#agent-help').textContent();
  cli('heartbeat');
  await page.locator('#agent', { hasText: 'Agent connected' }).waitFor({ timeout: 5000 });
  return { secondsSilent: Number(secondsSilent.toFixed(1)), waitedMs: Date.now() - waitStart, help };
});

await step('ending the session disables live actions and tells the agent', async () => {
  await page.getByRole('button', { name: 'End session' }).click();
  await page.locator('#status', { hasText: 'Session ended' }).waitFor();
  check(await page.locator('#chat-input').isDisabled(), 'composer still enabled');
  let event = cli('next', '--timeout', '3');
  while (event.json.type === 'event' && event.json.kind !== 'session-ended') event = cli('next', '--timeout', '3');
  check(event.json.kind === 'session-ended' || event.code === 3, `agent saw ${JSON.stringify(event.json)}`);
  const stopped = cli('stop');
  check(stopped.json.stopped === true, 'stop failed');
});

const video = await page.video().path();
await context.close();
await browser.close();
await fsp.rename(video, path.join(out, 'journeys.webm'));
const summary = { out, video: path.join(out, 'journeys.webm'), passed: results.filter((result) => result.ok).length, failed: results.filter((result) => !result.ok).length, consoleErrors, results };
await fsp.writeFile(path.join(out, 'results.json'), JSON.stringify(summary, null, 2));
await fx.cleanup();
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.failed ? 1 : 0);
