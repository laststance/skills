import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIocCandidates, discoverIocs } from '../scripts/ioc-discovery.mjs';
import { createRunContext } from '../scripts/runtime.mjs';

const HASH = 'a'.repeat(64);
const URL = 'https://www.microsoft.com/en-us/security/blog/2026/11/01/example-macos-analysis/';
const META = { sourceId: 'microsoft-security', sourceUrl: URL, publishedAt: '2026-11-01T00:00:00.000Z', fetchedAt: '2026-11-03T00:00:00.000Z' };
const TABLE = `<h1>Malware targeting macOS</h1><h2>Indicators of compromise</h2><table><tr><th>File path</th><th>SHA-256</th></tr><tr><td>/Users/&lt;user&gt;/Library/LaunchAgents/example-malware.plist</td><td>${HASH}</td></tr></table><h2>Other information</h2>`;

test('An attributed macOS vendor IOC table binds an exact file hash to a short-lived declared rule', () => {
  // Arrange / Act
  const result = parseIocCandidates(TABLE, META);
  // Assert
  assert.equal(result.rules.length, 1);
  assert.equal(result.rules[0].platform, 'darwin');
  assert.equal(result.rules[0].sourceUrl, URL);
  assert.equal(result.rules[0].verifiedAt, '2026-11-03T00:00:00.000Z');
  assert.equal(result.rules[0].expiresAt, '2026-11-10T00:00:00.000Z');
  assert.deepEqual(result.rules[0].iocs, [{ type: 'sha256', target: 'exact-file', relativePath: 'Library/LaunchAgents/example-malware.plist', value: HASH, strong: true }]);
  assert.equal(result.candidates[0].verified, false);
});

test('Prose mentions, other-platform tables, missing dates and generic hashes never become verified Mac rules', () => {
  // Arrange
  const cases = [
    [TABLE.replace('Malware targeting macOS', 'Malware targeting Linux'), META],
    [TABLE.replace('Indicators of compromise', 'Useful downloads'), META],
    [TABLE.replace('/Users/&lt;user&gt;/Library/LaunchAgents/example-malware.plist', 'sample.plist'), META],
    [TABLE, { ...META, publishedAt: null }],
    [TABLE, { ...META, sourceId: 'cisa-analysis' }],
    [TABLE, { ...META, sourceUrl: 'https://attacker.invalid/article' }],
    [TABLE.replace('SHA-256', 'Unreviewed column'), META],
  ];
  for (const [html, metadata] of cases) {
    // Act / Assert
    assert.equal(parseIocCandidates(html, metadata).rules.length, 0);
  }
});

test('Credential paths and traversal in vendor tables cannot authorize local reads', () => {
  // Arrange
  for (const path of ['/Users/&lt;user&gt;/.ssh/id_ed25519', '/Users/&lt;user&gt;/.aws/credentials', '/Users/&lt;user&gt;/../secrets', '/Users/&lt;user&gt;/.env', '/Users/&lt;user&gt;/secrets/token']) {
    // Act
    const result = parseIocCandidates(TABLE.replace('/Users/&lt;user&gt;/Library/LaunchAgents/example-malware.plist', path), META);
    // Assert
    assert.equal(result.rules.length, 0);
    assert.equal(result.candidates[0].relativePath, undefined);
  }
});

test('STIX hash facts remain unverified and pattern bodies never enter evidence', () => {
  // Arrange
  const stix = { type: 'bundle', objects: [
    { type: 'file', spec_version: '2.1', id: 'file--example', name: 'sample', hashes: { 'SHA-256': HASH } },
    { type: 'indicator', spec_version: '2.1', id: 'indicator--example', pattern_type: 'yara', pattern: 'SENTINEL_REMOTE_CODE' },
    { type: 'file', spec_version: '2.1', id: ['wrong'], hashes: { 'SHA-256': HASH } },
  ] };
  // Act
  const result = parseIocCandidates(JSON.stringify(stix), { ...META, sourceId: 'cisa-analysis' }, 'stix');
  // Assert
  assert.equal(result.candidates[0].platform, 'unknown');
  assert.deepEqual(result.rules, []);
  assert.equal(result.unsupported['unsupported-yara'], 1);
  assert.equal(result.unsupported['unsupported-object-schema'], 1);
  assert.equal(JSON.stringify(result).includes('SENTINEL'), false);
});

test('Recurring-source discovery fetches only its source-owned article and supplies valid rules plus unassessed scope', async () => {
  // Arrange
  const requests = [];
  const context = createRunContext({ budgetMs: 120000, wallNow: () => Date.parse(META.fetchedAt), fetchImpl: async address => { requests.push(String(address)); return new Response(TABLE); } });
  // Act
  const result = await discoverIocs([{ ...META, url: URL }, { ...META, url: 'https://attacker.invalid/payload' }], context);
  await context.close();
  // Assert
  assert.deepEqual(requests, [URL]);
  assert.equal(result.rules.length, 1);
  assert.equal(result.status, 'partial');
  assert.equal(result.coverage.find(value => value.sourceId === 'cisa-analysis').reasonCode, 'NO_VERIFIED_APPLICABLE_IOC');
});

test('No applicable current IOC stays unknown instead of proving absence of compromise', async () => {
  // Arrange
  const context = createRunContext({ budgetMs: 120000, fetchImpl: async () => { throw new Error('unexpected'); } });
  // Act
  const result = await discoverIocs([], context);
  await context.close();
  // Assert
  assert.deepEqual(result.rules, []);
  assert.equal(result.status, 'partial');
  assert.ok(result.coverage.every(value => value.reasonCode === 'NO_VERIFIED_APPLICABLE_IOC'));
});
