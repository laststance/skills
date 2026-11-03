import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createStateStore } from '../scripts/state-store.mjs';
import { parseRunnerArgs, projectProgress } from '../scripts/configuration.mjs';
import { validateTranslationContent } from '../scripts/translation-validation.mjs';
import { deliverTranslation } from '../scripts/deliver-translation.mjs';

const identityProvider = async () => ({ status: 'live', start: 'fixture-start', boot: 'fixture-boot' });
const canonicalText = 'Security report: 2026-11-03. CVE-2026-1234. Version 1.2.3. 2 records.\n[Source](https://www.cisa.gov/example)\n[Evidence](evidence.json)';
const translatedText = 'Informe de seguridad: 2026-11-03. CVE-2026-1234. Versión 1.2.3. 2 registros.\n[Fuente](https://www.cisa.gov/example)\n[Evidencia](evidence.json)\n';

/** Keep every storage exercise in a disposable home, with no real audit data.
 * @example const home = await fixture(t)
 */
async function fixture(t) {
  const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mss-delivery-')));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  return home;
}

test('language and profile arguments reject unsafe values before any storage work', () => {
  // Arrange / Act / Assert
  assert.deepEqual(parseRunnerArgs(['--language', 'EN', '--profile', 'evaluation-1']), { language: 'en', profile: 'evaluation-1' });
  for (const args of [['--profile', '../escape'], ['--profile', '/tmp/x'], ['--language'], ['--language', 'SENTINEL_SECRET!'], ['--language', 'EN', '--language', 'JA']]) {
    assert.throws(() => parseRunnerArgs(args), error => error.diagnostic.code === 'MSS_USAGE' && !JSON.stringify(error.diagnostic).includes('SENTINEL'));
  }
});

test('independent profiles inherit scan settings while keeping locks and evidence separate', async t => {
  // Arrange
  const home = await fixture(t), base = path.join(home, '.local/state/mac-security-sweep');
  await fs.mkdir(base, { recursive: true });
  await fs.writeFile(path.join(base, 'state.json'), JSON.stringify({ scanRoots: [{ path: '~/Projects', scope: 'work' }], queryUnknownGlobals: false, secret: 'SENTINEL_SECRET', lastRunAt: '2026-11-01T00:00:00Z' }));
  // Act
  const first = await createStateStore({ home, profile: 'first', identityProvider });
  const second = await createStateStore({ home, profile: 'second', identityProvider });
  // Assert
  assert.equal(first.config.scanRoots[0].path, path.join(home, 'Projects'));
  assert.equal(first.config.queryUnknownGlobals, false);
  assert.deepEqual(second.config, first.config);
  assert.equal(first.state.lastRunAt, undefined); assert.equal(first.state.secret, undefined);
  assert.equal(first.reportRoot, path.join(home, 'security-reports/profiles/first'));
  assert.notEqual(first.statePath, second.statePath);
  await assert.rejects(createStateStore({ home, profile: 'first', identityProvider }), error => error.diagnostic.code === 'MSS_LOCK');
  await Promise.all([first.close(), second.close()]);
});

test('profile traversal and linked storage roots are refused without following the link', async t => {
  // Arrange
  const home = await fixture(t), outside = path.join(home, 'outside');
  await fs.mkdir(outside);
  await fs.mkdir(path.join(home, '.local/state/mac-security-sweep'), { recursive: true });
  await fs.symlink(outside, path.join(home, '.local/state/mac-security-sweep/profiles'));
  // Act / Assert
  await assert.rejects(createStateStore({ home, profile: '../outside', identityProvider }));
  await assert.rejects(createStateStore({ home, profile: 'linked', identityProvider }));
  assert.deepEqual(await fs.readdir(outside), []);
});

test('translation integrity rejects changed evidence and active content without claiming semantic proof', () => {
  // Arrange / Act
  const proof = validateTranslationContent(canonicalText, translatedText);
  // Assert
  assert.equal(proof.semanticReviewRequired, true);
  for (const text of [translatedText.replace('CVE-2026-1234', 'CVE-2026-9999'), translatedText.replace('1.2.3', '1.2.4'), translatedText.replace('2 registros', '9 registros'), translatedText + '\n![track](https://evil.example/x)', translatedText + '\n<script>alert(1)</script>', translatedText + '\n[open](file:///secret)', translatedText.replace('https://www.cisa.gov/example', 'https://evil.example/x')]) {
    assert.throws(() => validateTranslationContent(canonicalText, text), error => error.diagnostic.code === 'MSS_TRANSLATION_PENDING');
  }
});

for (const boundary of ['translation:write', 'translation:sync', 'translation:rename', 'translation-commit:write', 'translation-commit:sync', 'translation-commit:rename']) {
  test(`translation retry after ${boundary} preserves the canonical generation and commits one verified derivative`, async t => {
    // Arrange
    const home = await fixture(t); let interrupt = false;
    const store = await createStateStore({ home, identityProvider, onBoundary: async point => { if (interrupt && point === boundary) throw new Error('SENTINEL_PRIVATE_ERROR'); } });
    const saved = await store.commit({ evidence: { fixture: true }, report: canonicalText, nextState: { locale: { requestedLanguage: 'es', canonicalLanguage: 'en', translationStatus: 'pending' } }, final: true });
    const canonical = await store.canonicalReport(saved.generation);
    const stateBefore = await fs.readFile(saved.statePath, 'utf8');
    interrupt = true;
    // Act
    await assert.rejects(store.commitTranslation({ generation: saved.generation, canonicalHash: canonical.hash, language: 'es', content: translatedText, semanticReviewed: true }));
    await store.close();
    const resumed = await createStateStore({ home, identityProvider });
    const result = await resumed.commitTranslation({ generation: saved.generation, canonicalHash: canonical.hash, language: 'es', content: translatedText, semanticReviewed: true });
    const repeated = await resumed.commitTranslation({ generation: saved.generation, canonicalHash: canonical.hash, language: 'es', content: translatedText, semanticReviewed: true });
    // Assert
    assert.equal(result.translatedPath, repeated.translatedPath);
    assert.equal(await fs.readFile(saved.statePath, 'utf8'), stateBefore);
    assert.equal(await fs.readFile(saved.reportPath, 'utf8'), `${canonicalText}\n`);
    assert.equal(await fs.readFile(result.translatedPath, 'utf8'), translatedText);
    assert.equal(JSON.parse(await fs.readFile(result.manifestPath, 'utf8')).canonicalHash, createHash('sha256').update(`${canonicalText}\n`).digest('hex'));
    assert.equal((await fs.stat(result.translatedPath)).mode & 0o777, 0o600);
    assert.equal((await fs.stat(path.dirname(result.translatedPath))).mode & 0o777, 0o700);
    await resumed.close();
  });
}

test('translation-only delivery reads a private draft and refuses mismatched canonical hashes', async t => {
  // Arrange
  const home = await fixture(t), store = await createStateStore({ home, identityProvider });
  const saved = await store.commit({ evidence: {}, report: canonicalText, nextState: { locale: { requestedLanguage: 'es', canonicalLanguage: 'en', translationStatus: 'pending' } }, final: true });
  const canonical = await store.canonicalReport(saved.generation);
  await store.close();
  await fs.writeFile(path.join(saved.evidenceDirectory, 'translation-es.input.md'), translatedText, { mode: 0o600 });
  // Act
  await assert.rejects(deliverTranslation({ home, identityProvider, generation: saved.generation, canonicalHash: '0'.repeat(64), language: 'es', semanticReviewed: true }), error => error.diagnostic.code === 'MSS_STATE');
  const receipt = await deliverTranslation({ home, identityProvider, generation: saved.generation, canonicalHash: canonical.hash, language: 'es', semanticReviewed: true });
  // Assert
  assert.equal(receipt.translationStatus, 'complete');
  assert.equal(receipt.semanticReview, 'host-attested');
  assert.equal(receipt.canonicalReportPath, saved.reportPath);
});

test('new source history, distro identity, query dates and language survive a committed resume without unknown private fields', async t => {
  // Arrange
  const home = await fixture(t), store = await createStateStore({ home, identityProvider });
  const window = { since: '2026-10-04T00:00:00Z', until: '2026-11-03T00:00:00Z' };
  const progress = {
    locale: { requestedLanguage: 'es', canonicalLanguage: 'en', translationStatus: 'pending' },
    sourceContinuations: { 'GitHub Advisory reviewed': { url: 'https://api.github.com/advisories?after=fixture', window,
      items: [{ id: 'CVE-2026-1234', sourceId: 'github-reviewed', categories: ['linux'], fetchedAt: '2026-11-03T00:00:00Z', datePrecision: 'day', dateSemantics: 'published', ongoing: false, distribution: 'debian', distributionRelease: '12', fixed: null, secret: 'SENTINEL_SECRET' }],
      backlog: [{ url: 'https://api.github.com/advisories?after=older', window, items: [] }] } },
    packageContinuation: { query: { queries: [{ key: 'fixture', fingerprint: 'fixture', pageToken: null, complete: true, vulns: [], queriedAt: '2026-11-03T00:00:00Z', historyScope: 'osv-all-records-for-exact-version' }] } },
    assessmentSnapshot: [{ id: 'CVE-2026-1234', product: 'OpenSSL', status: '可能性高', observedAt: '2026-11-03T00:00:00Z',
      package: { name: 'openssl', ecosystem: 'Debian:12', distribution: 'debian', distributionRelease: '12', sourcePackage: 'openssl', sourceVersion: '3.0.14-1~deb12u2', binaryName: 'libssl3', binaryVersion: '3.0.14-1~deb12u2', architecture: 'arm64', purlType: 'deb', provenanceStatus: 'verified-public-record', distributionConflict: false } }],
  };
  // Act
  const saved = await store.commit({ evidence: {}, report: 'fixture', nextState: progress });
  await store.close();
  const resumed = await createStateStore({ home, identityProvider });
  const actual = projectProgress(resumed.state);
  await resumed.close();
  // Assert
  assert.equal(actual.sourceContinuations['GitHub Advisory reviewed'].backlog.length, 1);
  assert.equal(actual.sourceContinuations['GitHub Advisory reviewed'].items[0].distributionRelease, '12');
  assert.equal(actual.packageContinuation.query.queries[0].queriedAt, '2026-11-03T00:00:00Z');
  assert.equal(actual.assessmentSnapshot[0].package.sourceVersion, '3.0.14-1~deb12u2');
  assert.equal(actual.assessmentSnapshot[0].observedAt, '2026-11-03T00:00:00Z');
  assert.equal(actual.assessmentSnapshot[0].product, 'OpenSSL');
  assert.equal(actual.locale.requestedLanguage, 'es');
  assert.equal((await fs.readFile(path.join(saved.evidenceDirectory, 'continuation.json'), 'utf8')).includes('SENTINEL'), false);
});

for (const boundary of ['translation:write', 'translation:sync', 'translation:rename', 'translation-commit:write', 'translation-commit:sync', 'translation-commit:rename']) {
  test(`a real process crash at ${boundary} recovers only the dead writer and retains the original report`, async t => {
    // Arrange
    const home = await fixture(t), store = await createStateStore({ home, identityProvider });
    const saved = await store.commit({ evidence: {}, report: canonicalText, nextState: { locale: { requestedLanguage: 'es', canonicalLanguage: 'en', translationStatus: 'pending' } }, final: true });
    await store.close();
    const stateBefore = await fs.readFile(saved.statePath, 'utf8');
    await fs.writeFile(path.join(saved.evidenceDirectory, 'translation-es.input.md'), translatedText, { mode: 0o600 });
    const child = spawn(process.execPath, ['--import', fileURLToPath(new URL('./deny-network.mjs', import.meta.url)), fileURLToPath(new URL('./fixtures/translation-child.mjs', import.meta.url)), home, saved.generation, saved.reportHash, boundary], { stdio: ['ignore', 'ignore', 'pipe'] });
    let errors = ''; child.stderr.on('data', chunk => { errors += chunk.toString(); });
    // Act
    const result = await new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
    const actualIdentity = async pid => {
      try { process.kill(pid, 0); return { status: 'live', start: 'fixture-start', boot: 'fixture-boot' }; }
      catch (error) { return { status: error.code === 'ESRCH' ? 'dead' : 'unknown' }; }
    };
    const receipt = await deliverTranslation({ home, generation: saved.generation, canonicalHash: saved.reportHash, language: 'es', semanticReviewed: true, identityProvider: actualIdentity });
    // Assert
    assert.equal(result.signal, 'SIGKILL', errors); assert.equal(receipt.translationStatus, 'complete');
    assert.equal(await fs.readFile(saved.statePath, 'utf8'), stateBefore);
    assert.equal(await fs.readFile(saved.reportPath, 'utf8'), `${canonicalText}\n`);
    assert.equal(await fs.readFile(receipt.translatedPath, 'utf8'), translatedText);
  });
}
