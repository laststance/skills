import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { APP_CACHE_LEAVES, buildCommand, matchRecipe, parseCliReport } from '../scripts/lib/recipes.mjs';
import { csvField, outcomesCsv, renderSnapshot } from '../scripts/lib/report.mjs';
import { VIEWER, idFor, makeFixture, scannedSession } from './helpers.mjs';

// protects: recipe argv is fixed | fails_when: path text becomes shell or extra argv | no_claim: installed CLI correctness
test('a cache path containing shell syntax stays a single argv element', () => {
  // Arrange
  const hostile = '/Users/me/.cache/uv; rm -rf ~ $(touch /tmp/pwned)';
  // Act
  const command = buildCommand('uv-cache', { uv: { exe: '/opt/homebrew/bin/uv', cacheDir: hostile } });
  // Assert
  assert.deepEqual(command, { file: '/opt/homebrew/bin/uv', args: ['cache', 'clean', '--cache-dir', hostile] });
  assert.equal(buildCommand('trash', {}), null);
});

// protects: unverified app-cache leaves cannot be permanently deleted | fails_when: an unverified leaf matches app-cache | no_claim: app behavior after updates
test('only verified exact application cache leaves match the app-cache recipe', () => {
  // Arrange
  const home = '/Users/me';
  const ctx = { home, cli: {} };
  // Act
  const verified = matchRecipe('app-cache', { path: `${home}/Library/Application Support/Cursor/Cache`, kind: 'dir' }, ctx);
  const unverified = matchRecipe('app-cache', { path: `${home}/Library/Caches/com.tinyspeck.slackmacgap`, kind: 'dir' }, ctx);
  const parent = matchRecipe('app-cache', { path: `${home}/Library/Application Support/Cursor`, kind: 'dir' }, ctx);
  const chrome = matchRecipe('app-cache', { path: `${home}/Library/Application Support/Google/Chrome/Default/Cache`, kind: 'dir' }, ctx);
  // Assert
  assert.deepEqual(verified, { ok: true });
  assert.deepEqual(unverified, { ok: false, reason: 'Slack cache leaf is not verified yet; it stays review-required.' });
  assert.equal(parent.ok, false);
  assert.equal(chrome.ok, false);
  assert.equal(APP_CACHE_LEAVES.every((leaf) => !leaf.verified || leaf.docs.every((url) => url.startsWith('https://'))), true);
});

// protects: tool receipts are parsed, not invented | fails_when: npm/pnpm output yields bytes | no_claim: future CLI output formats
test('only uv output yields a tool-reported byte count', () => {
  // Arrange
  const uv = 'Clearing cache at: /Users/me/.cache/uv\nRemoved 1520 files (12.5MiB)';
  // Act
  const results = [parseCliReport('uv-cache', uv), parseCliReport('npm-cache', 'npm warn using --force'), parseCliReport('pnpm-store', 'Removed 12 packages')];
  // Assert
  assert.deepEqual(results, ['13107200', null, null]);
});

// protects: display data is inert | fails_when: HTML or a spreadsheet formula in a name becomes executable | no_claim: entire browser security
test('file names with HTML or formula prefixes are escaped in the CSV and the snapshot', () => {
  // Arrange
  const name = '=HYPERLINK("http://x")<img src=x onerror=alert(1)>';
  const outcome = { operationId: 'op', candidateId: 'c', path: `/Users/me/${name}`, recipe: 'trash', operation: 'trash', status: 'failed', evidenceKind: 'none', reason: '+SUM(A1)', allocatedBytes: '1' };
  // Act
  const csv = outcomesCsv([outcome]);
  const html = renderSnapshot({ generatedAt: 'now', root: '/Users/me', revision: 0, coverage: 'complete', cards: [], tiles: [{ name, path: `/Users/me/${name}`, allocatedBytes: '10', category: 'your-files', risk: null }], candidates: [], outcomes: [outcome], metrics: null });
  // Assert
  assert.equal(csvField('=1+1'), "'=1+1");
  assert.match(csv, /,'\+SUM\(A1\),/);
  assert.equal(html.includes('<img'), false);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

// protects: exports are inert and private | fails_when: a snapshot has credentials, scripts or live controls | no_claim: deliberate file sharing
test('an exported snapshot has no script, no credentials and disabled live controls', async () => {
  // Arrange
  const fx = await makeFixture();
  const session = await scannedSession(fx);
  idFor(session, path.join(fx.project, '.next'));
  // Act
  const { snapshot } = await session.exportSnapshot();
  const html = await fsp.readFile(snapshot, 'utf8');
  const mode = (await fsp.stat(snapshot)).mode & 0o777;
  // Assert
  assert.equal(/<script|fetch\(|<form/i.test(html), false);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /<button type="button" disabled>Clean Up \(disabled in snapshot\)<\/button>/);
  assert.equal(mode, 0o600);
  assert.equal(html.includes(VIEWER.id), false);
  clearInterval(session.timer);
  await fx.cleanup();
});
