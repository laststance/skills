import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runSweep } from '../scripts/run-sweep.mjs';
import { inventory } from '../scripts/inventory.mjs';
import { fetchNews, fetchAdaptiveNews, mergeNews } from '../scripts/fetch-news.mjs';
import { scanPackages } from '../scripts/scan-packages.mjs';
import { enrichAdvisories } from '../scripts/advisory-details.mjs';
import { matchInventory } from '../scripts/match.mjs';
import { within } from '../scripts/safe-io.mjs';

test('探索page・新製品baseline・OSVページ・詳細・429が重なっても保存世代を跨いで前進する', async t => {
  // Arrange
  const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mss-compound-')));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const root = path.join(home, 'Projects'), systemRoot = path.join(home, 'system');
  await fs.mkdir(root); await fs.mkdir(systemRoot);
  for (let index = 0; index < 4; index += 1) {
    const directory = path.join(root, `project-${index}`); await fs.mkdir(directory);
    await fs.writeFile(path.join(directory, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { [`node_modules/example-${index}`]: { version: '1.0.0', resolved: `https://registry.npmjs.org/example-${index}/-/example-${index}-1.0.0.tgz` } } }));
  }
  const stateRoot = path.join(home, '.local/state/mac-security-sweep'); await fs.mkdir(stateRoot, { recursive: true });
  await fs.writeFile(path.join(stateRoot, 'state.json'), JSON.stringify({ schemaVersion: 1, scanRoots: [{ path: '~/Projects', scope: 'personal' }], privateExtension: 'SENTINEL_PRIVATE' }));
  const queried = new Set(), detailed = new Set(), pools = [], pages = [], progress = []; let run = 0, throttled = false, baselineRequests = 0;
  const filesystem = { ...fs, open: (...args) => { if (!within(home, args[0])) throw Object.assign(new Error('SENTINEL_DENIED'), { code: 'EACCES' }); return fs.open(...args); },
    opendir: (...args) => { if (!within(home, args[0])) throw Object.assign(new Error('SENTINEL_DENIED'), { code: 'EACCES' }); return fs.opendir(...args); } };
  const fetchImpl = async (address, options) => {
    const url = new URL(address);
    if (url.hostname === 'api.osv.dev' && url.pathname === '/v1/querybatch') {
      if (!throttled) { throttled = true; return new Response('{}', { status: 429, headers: { 'Retry-After': '60' } }); }
      const body = JSON.parse(options.body);
      assert.equal(options.body.includes(home), false); assert.equal(options.body.includes('SENTINEL'), false);
      return Response.json({ results: body.queries.map(query => { queried.add(query.package.name); return query.page_token
        ? { vulns: [{ id: `GHSA-${query.package.name}-second` }] }
        : { vulns: [{ id: `GHSA-${query.package.name}-first` }], next_page_token: `page-${query.package.name}` }; }) });
    }
    if (url.hostname === 'api.osv.dev') { const id = url.pathname.split('/').at(-1); detailed.add(id); return Response.json({ id, affected: [], summary: 'fixture advisory' }); }
    if (url.hostname === 'api.github.com') return Response.json([]);
    if (url.hostname === 'www.cisa.gov') return Response.json({ vulnerabilities: [] });
    if (url.hostname === 'socket.dev') return Response.json({ items: [] });
    if (url.hostname === 'www.mozilla.org') { baselineRequests += 1; return new Response('<h3>Fixed in Firefox 130</h3><a href="/en-US/security/advisories/mfsa2024-01/">Security Vulnerabilities fixed in Firefox 130</a>'); }
    return new Response('<rss><channel></channel></rss>');
  };
  const stages = {
    inventory: async options => { const result = await inventory({ ...options, discoveryLimits: { files: 2, directories: 5, entries: 2, queue: 5 } });
      if (run >= 1) result.applications.push({ name: 'Firefox', bundleId: 'org.mozilla.firefox', version: '120.0', channel: 'release', path: path.join(home, 'Applications/Firefox.app') });
      return result; },
    news: fetchNews, adaptive: fetchAdaptiveNews, mergeNews,
    packages: (data, options) => scanPackages(data, { ...options, noScanner: true, maxLockfiles: 2, maxPages: 1 }),
    iocs: async () => ({ checks: [], coverage: [] }),
    details: (findings, deadline, fetcher, options) => enrichAdvisories(findings, deadline, fetcher, { ...options, maxDetails: 1 }), match: matchInventory,
  };
  // Act
  for (; run < 16; run += 1) {
    const receipt = await runSweep({ home, systemRoot, filesystem, stages, rules: {}, fetchImpl,
      wallNow: () => Date.parse('2026-11-03T00:00:00Z') + run * 61000,
      identityProvider: async () => ({ status: 'live', start: 'fixture', boot: 'fixture' }),
      toolResolver: async operation => ({ path: operation }), executeImpl: async () => ({ code: 1, stdout: '', stderr: 'SENTINEL_TOOL' }) });
    const evidenceText = await fs.readFile(path.join(receipt.evidenceDirectory, 'evidence.json'), 'utf8');
    assert.equal(evidenceText.includes('SENTINEL'), false);
    const evidence = JSON.parse(evidenceText); pools.push(evidence.metrics); pages.push(evidence.inventory.discoveryContinuation.page);
    progress.push({ run, page: evidence.inventory.discoveryContinuation.page, pendingQueries: evidence.packages.continuation.pendingPackageKeys.length,
      pendingDetails: evidence.details.continuation.pendingIds.length, acknowledgements: evidence.packages.continuation.acknowledgedLockfiles.length,
      queuedDirectories: evidence.inventory.discoveryContinuation.queue.length, detailed: detailed.size });
    assert.ok(evidence.inventory.lockfiles.length <= 2);
    if (queried.size === 4 && detailed.size === 8) break;
  }
  // Assert
  assert.deepEqual([...queried].sort(), ['example-0', 'example-1', 'example-2', 'example-3'], JSON.stringify(progress));
  assert.equal(detailed.size, 8); assert.ok(pages.includes(1)); assert.equal(baselineRequests, 1);
  assert.ok(run < 16);
  for (const metric of pools) { assert.ok(metric.http.peak <= 6); assert.ok(metric.commands.peak <= 4); assert.ok(Object.values(metric.hosts).every(host => host.peak <= 2)); }
  const state = JSON.parse(await fs.readFile(path.join(stateRoot, 'state.json'), 'utf8'));
  assert.equal(state.privateExtension, 'SENTINEL_PRIVATE'); assert.ok(state.assessmentSnapshot.length >= 4);
});
