#!/usr/bin/env node
// I12: runtime bounds on a synthetic 100,050-entry fixture (5,000 folders,
// 95,050 files). Measures peak runtime RSS, time to the first progress
// update, scan duration, and — when Playwright is available — rendered tile
// count and keyboard drawer latency. Prints a JSON record; exits 1 when a
// target is missed.
//
// Usage: [DISK_MAP_PLAYWRIGHT=/abs/playwright-core/index.mjs] node tests/perf.mjs
import { execFileSync, spawnSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/disk-map.mjs');
const base = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), 'disk-map-perf-')));
const home = path.join(base, 'home');
const payload = Buffer.alloc(64, 1);

// 50 top folders + 4,950 subfolders = 5,000 folders; 4,950 × 19 + 50 × 20 = 95,050 files.
for (let top = 0; top < 50; top += 1) {
  await Promise.all(Array.from({ length: 99 }, async (_, sub) => {
    const dir = path.join(home, `group-${top}`, `item-${sub}`);
    await fsp.mkdir(dir, { recursive: true });
    await Promise.all(Array.from({ length: 19 }, (__, file) => fsp.writeFile(path.join(dir, `f${file}.txt`), payload)));
  }));
  await Promise.all(Array.from({ length: 20 }, (_, note) => fsp.writeFile(path.join(home, `group-${top}`, `note-${note}.txt`), payload)));
}
await fsp.mkdir(path.join(base, 'trash'));

const invokedAt = Date.now();
const started = JSON.parse(execFileSync(process.execPath, [script, 'start', '--root', home, '--home', home, '--state-dir', path.join(base, 'state'), '--trash-dir', path.join(base, 'trash')], { encoding: 'utf8' }));
const status = () => JSON.parse(spawnSync(process.execPath, [script, 'status', '--session', started.session], { encoding: 'utf8' }).stdout);
const rss = () => Number(spawnSync('/bin/ps', ['-o', 'rss=', '-p', String(started.pid)], { encoding: 'utf8' }).stdout.trim()) * 1024;

let firstProgressMs = null;
let peakRss = 0;
let current;
const sampler = setInterval(() => {
  peakRss = Math.max(peakRss, rss());
}, 50);
for (;;) {
  current = status();
  if (firstProgressMs === null && current.progress) firstProgressMs = Date.now() - invokedAt;
  if (current.phase !== 'scanning' && current.phase !== 'starting') break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
const scanMs = Date.now() - invokedAt;
peakRss = Math.max(peakRss, rss());

let browser = null;
let playwright = null;
for (const specifier of [process.env.DISK_MAP_PLAYWRIGHT, 'playwright-core'].filter(Boolean)) {
  playwright = await import(specifier).catch(() => null);
  if (playwright) break;
}
if (playwright) {
  const { chromium } = playwright.default ?? playwright;
  const instance = await chromium.launch();
  const page = await instance.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(started.viewerUrl);
  await page.locator('.tile[data-id]').first().waitFor();
  const name = await page.locator('.tile[data-id] .name').first().textContent();
  await page.locator('.tile[data-id]').first().click({ position: { x: 12, y: 10 } });
  await page.locator('#drawer').getByRole('button', { name: 'Open folder' }).click();
  await page.locator('.crumbs [aria-current="page"]', { hasText: name }).waitFor();
  const tiles = await page.locator('.tile').count();
  await page.locator('.tile[data-id]').first().focus();
  const begin = Date.now();
  await page.keyboard.press('Enter');
  await page.locator('#drawer').waitFor({ state: 'visible' });
  browser = { tilesInDrilledView: tiles, keyboardDrawerMs: Date.now() - begin, peakRssDuringViewer: Math.max(peakRss, rss()) };
  peakRss = browser.peakRssDuringViewer;
  await instance.close();
}
clearInterval(sampler);
spawnSync(process.execPath, [script, 'stop', '--session', started.session]);
await fsp.rm(base, { recursive: true, force: true });

const record = {
  machine: `${os.cpus()[0].model}, ${Math.round(os.totalmem() / 1024 ** 3)} GiB RAM`,
  node: process.version,
  macos: started.checks.macos,
  entries: current.progress.entries,
  directories: current.progress.directories,
  scanPhase: current.phase,
  scanMs,
  firstProgressMs,
  peakRuntimeRssMiB: Number((peakRss / 1024 ** 2).toFixed(1)),
  browser,
  targets: { peakRuntimeRssMiB: '< 512', firstProgressMs: '< 2000', tiles: '<= 300', keyboardDrawerMs: '< 200' },
};
const pass = record.peakRuntimeRssMiB < 512 && firstProgressMs < 2000 && (!browser || (browser.tilesInDrilledView <= 300 && browser.keyboardDrawerMs < 200));
console.log(JSON.stringify({ pass, ...record }, null, 2));
process.exit(pass ? 0 : 1);
