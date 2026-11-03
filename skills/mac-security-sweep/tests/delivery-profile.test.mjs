import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createStateStore, stableJson } from '../scripts/state-store.mjs';
import { parseRunnerArgs, projectProgress, validateConfiguration } from '../scripts/configuration.mjs';
import { validateTranslationContent } from '../scripts/translation-validation.mjs';
import { deliverTranslation } from '../scripts/deliver-translation.mjs';
import { renderReport } from '../scripts/report.mjs';

test('malformed package page offsets cannot skip unchecked records on resume', () => {
  // Arrange
  const page = { schemaVersion: 1, cycleStartedAt: '2026-11-03T00:00:00Z', metadataSignature: 'a'.repeat(64),
    globalOffset: 0, nextGlobalOffset: 324, sbomOffset: 0, nextSbomOffset: 0, pendingGlobals: 0, pendingSboms: 1 };
  const changes = [{ pendingGlobals: -1 }, { pendingSboms: 0.5 }, { nextGlobalOffset: 1000001 }, { globalOffset: 325 },
    { metadataSignature: 'invalid' }, { metadataSignature: { toString: null } }, { cycleStartedAt: '2026-11-03' }, { schemaVersion: 2 }];
  // Act / Assert
  for (const change of changes) assert.throws(() => validateConfiguration({ packageContinuation: { recordPage: { ...page, ...change } } }, '/Users/fixture'), error => error.diagnostic.code === 'MSS_STATE');
  assert.throws(() => validateConfiguration({ packageContinuation: { acknowledgedLockfiles: [{ path: '/Users/fixture/Projects/fixture.lock', sourceIdentity: 'fixture', status: 'complete-and-clean' }] } }, '/Users/fixture'), error => error.diagnostic.code === 'MSS_STATE');
});
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

test('translation refuses traversal and alternate Markdown links even when the source contains the same destination', () => {
  // Arrange
  const unsafe = ['../credentials', '%2e%2e/credentials', '/credentials', '//evil.example/credentials', 'file:///credentials', 'evidence.json/../credentials', 'https://evil.example/credentials'];
  // Act / Assert
  for (const destination of unsafe) {
    assert.throws(() => validateTranslationContent(`${canonicalText}\n[Open](${destination})`, `${translatedText}\n[Abrir](${destination})`), error => error.diagnostic.code === 'MSS_TRANSLATION_PENDING');
  }
  for (const suffix of ['\n[Open][private]\n[private]: ../credentials', '\n[private]:\n  ../credentials', '\n[Open](evidence.json)', '\n<https://www.cisa.gov/example>', '\n<file:///credentials>', '\n\\\\[Open](../credentials)']) {
    assert.throws(() => validateTranslationContent(canonicalText, translatedText + suffix), error => error.diagnostic.code === 'MSS_TRANSLATION_PENDING');
  }
  const literal = String.raw`\[literal\]\(../credentials\)`;
  assert.equal(validateTranslationContent(`${canonicalText}\n${literal}`, `${translatedText}\n${literal}`).semanticReviewRequired, true);
});

test('translation keeps every occurrence of identifiers, numbers and source URLs', () => {
  // Arrange
  const suffixes = ['\nCVE-2026-1234', '\nGHSA-added-token', '\n2', '\nhttps://www.cisa.gov/example'];
  // Act / Assert
  for (const suffix of suffixes) assert.throws(() => validateTranslationContent(canonicalText, translatedText + suffix), error => error.diagnostic.code === 'MSS_TRANSLATION_PENDING');
  assert.throws(() => validateTranslationContent(`${canonicalText}\nCVE-2026-1234`, translatedText), error => error.diagnostic.code === 'MSS_TRANSLATION_PENDING');
});

test('every local link in a saved translation resolves to the unchanged canonical artifact', async t => {
  // Arrange
  const home = await fixture(t), store = await createStateStore({ home, identityProvider });
  const locale = { requestedLanguage: 'es', canonicalLanguage: 'en', translationStatus: 'pending' };
  const report = renderReport({ locale, evidenceDirectory: '.', finishedAt: '2026-11-03T00:00:00Z' })
    + '\n[Continuation](continuation.json)\n[Canonical](report.md)\n[Commit](commit.json)';
  const translated = report.replaceAll('Complete evidence', 'Pruebas completas');
  const saved = await store.commit({ evidence: { fixture: true }, report, nextState: { locale }, final: true });
  const artifactNames = ['evidence.json', 'continuation.json', 'report.md', 'commit.json'];
  const originals = Object.fromEntries(await Promise.all(artifactNames.map(async name => [name, await fs.readFile(path.join(saved.evidenceDirectory, name))])));
  const stateBefore = await fs.readFile(saved.statePath);
  // Act
  const receipt = await store.commitTranslation({ generation: saved.generation, canonicalHash: saved.reportHash, language: 'es', content: translated, semanticReviewed: true });
  const delivered = await fs.readFile(receipt.translatedPath, 'utf8');
  const links = [...delivered.matchAll(/\]\(([^)]+)\)/g)].map(match => match[1]).filter(destination => !destination.startsWith('https:'));
  const manifest = JSON.parse(await fs.readFile(receipt.manifestPath, 'utf8'));
  // Assert
  assert.deepEqual([...new Set(links)].sort(), ['commit.json', 'continuation.json', 'evidence.json', 'report.md']);
  assert.ok(links.filter(destination => destination === 'evidence.json').length >= 2);
  for (const destination of links) {
    const target = fileURLToPath(new URL(destination, pathToFileURL(receipt.translatedPath)));
    assert.equal(target, path.join(saved.evidenceDirectory, destination));
    assert.equal((await fs.lstat(target)).isSymbolicLink(), false);
    assert.deepEqual(await fs.readFile(target), originals[destination]);
  }
  assert.equal(path.dirname(receipt.translatedPath), saved.evidenceDirectory);
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(fileURLToPath(new URL(manifest.canonicalReport, pathToFileURL(receipt.manifestPath))), saved.reportPath);
  assert.equal(fileURLToPath(new URL(manifest.translatedReport, pathToFileURL(receipt.manifestPath))), receipt.translatedPath);
  assert.equal(createHash('sha256').update(delivered).digest('hex'), manifest.translatedHash);
  assert.equal(createHash('sha256').update(originals['report.md']).digest('hex'), manifest.canonicalHash);
  assert.deepEqual(await fs.readFile(saved.statePath), stateBefore);
  assert.equal((await fs.stat(receipt.manifestPath)).mode & 0o777, 0o600);
  await store.close();
});

test('translation-only retry repairs delivery beside a legacy generation without changing its old derivative or state', async t => {
  // Arrange
  const home = await fixture(t), store = await createStateStore({ home, identityProvider });
  const saved = await store.commit({ evidence: { fixture: true }, report: canonicalText, nextState: { locale: { requestedLanguage: 'es', canonicalLanguage: 'en', translationStatus: 'pending' }, lastRunStatus: 'partial' }, final: true });
  await store.close();
  const legacyRoot = path.join(saved.evidenceDirectory, 'translations');
  const translatedHash = createHash('sha256').update(translatedText).digest('hex');
  const legacyReport = path.join(legacyRoot, `es-${translatedHash}.md`);
  const legacyManifest = path.join(legacyRoot, `es-${translatedHash}.commit.json`);
  const legacyBytes = stableJson({ schemaVersion: 1, generation: saved.generation, requestedLanguage: 'es', canonicalLanguage: 'en', canonicalReport: '../report.md', canonicalHash: saved.reportHash, translatedReport: path.basename(legacyReport), translatedHash, translationStatus: 'complete', semanticReview: 'host-attested' });
  await fs.mkdir(legacyRoot, { mode: 0o700 });
  await fs.writeFile(legacyReport, translatedText, { mode: 0o600 });
  await fs.writeFile(legacyManifest, legacyBytes, { mode: 0o600 });
  await fs.writeFile(path.join(saved.evidenceDirectory, 'translation-es.input.md'), translatedText, { mode: 0o600 });
  const stateBefore = await fs.readFile(saved.statePath);
  // Act
  const receipt = await deliverTranslation({ home, identityProvider, generation: saved.generation, canonicalHash: saved.reportHash, language: 'es', semanticReviewed: true });
  const repeated = await deliverTranslation({ home, identityProvider, generation: saved.generation, canonicalHash: saved.reportHash, language: 'es', semanticReviewed: true });
  const resumed = await createStateStore({ home, identityProvider });
  const canonical = await resumed.canonicalReport(saved.generation);
  // Assert
  assert.equal(resumed.progressVerified, true);
  assert.equal(canonical.hash, saved.reportHash);
  assert.equal(canonical.content, `${canonicalText}\n`);
  assert.equal(receipt.translatedPath, repeated.translatedPath);
  assert.notEqual(receipt.translatedPath, legacyReport);
  assert.equal(await fs.readFile(legacyReport, 'utf8'), translatedText);
  assert.equal(await fs.readFile(legacyManifest, 'utf8'), legacyBytes);
  assert.deepEqual(await fs.readFile(saved.statePath), stateBefore);
  assert.deepEqual(await fs.readdir(legacyRoot), [`es-${translatedHash}.commit.json`, `es-${translatedHash}.md`]);
  assert.deepEqual(JSON.parse(await fs.readFile(new URL('evidence.json', pathToFileURL(receipt.translatedPath)), 'utf8')), { fixture: true });
  assert.equal((await fs.readdir(path.dirname(saved.evidenceDirectory))).filter(name => name.startsWith('mss-')).length, 1);
  await resumed.close();
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

test('source month precision, product classification, distro identity and language survive a committed resume without private fields', async t => {
  // Arrange
  const home = await fixture(t), store = await createStateStore({ home, identityProvider });
  const window = { since: '2026-10-04T00:00:00Z', until: '2026-11-03T00:00:00Z' };
  const progress = {
    locale: { requestedLanguage: 'es', canonicalLanguage: 'en', translationStatus: 'pending' },
    sourceContinuations: { 'GitHub Advisory reviewed': { url: 'https://api.github.com/advisories?after=fixture', window,
      items: [{ id: 'CVE-2026-1234', sourceId: 'github-reviewed', categories: ['linux'], fetchedAt: '2026-11-03T00:00:00Z', datePrecision: 'month', publishedAt: null, publishedMonth: '2026-10', updatedAt: null, updatedMonth: '2026-11', categoryStatus: 'unconfirmed', dateSemantics: 'published', ongoing: false, distribution: 'debian', distributionRelease: '12', fixed: null, secret: 'SENTINEL_SECRET' }],
      backlog: [{ url: 'https://api.github.com/advisories?after=older', window, items: [] }] } },
    packageContinuation: { query: { queries: [{ key: 'fixture', fingerprint: 'fixture', pageToken: null, complete: true, vulns: [], queriedAt: '2026-11-03T00:00:00Z', historyScope: 'osv-all-records-for-exact-version' }] },
      recordPage: { schemaVersion: 1, cycleStartedAt: '2026-11-03T00:00:00Z', metadataSignature: 'a'.repeat(64), globalOffset: 0, nextGlobalOffset: 324, sbomOffset: 0, nextSbomOffset: 0, pendingGlobals: 0, pendingSboms: 1, secret: 'SENTINEL_SECRET' },
      acknowledgedLockfiles: [{ path: '/Users/fixture/Projects/fixture.lock', sourceIdentity: 'fixture', status: 'unsupported', secret: 'SENTINEL_SECRET' }] },
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
  assert.equal(actual.sourceContinuations['GitHub Advisory reviewed'].items[0].publishedMonth, '2026-10');
  assert.equal(actual.sourceContinuations['GitHub Advisory reviewed'].items[0].updatedMonth, '2026-11');
  assert.equal(actual.sourceContinuations['GitHub Advisory reviewed'].items[0].publishedAt, null);
  assert.equal(actual.sourceContinuations['GitHub Advisory reviewed'].items[0].updatedAt, null);
  assert.equal(actual.sourceContinuations['GitHub Advisory reviewed'].items[0].categoryStatus, 'unconfirmed');
  assert.equal(actual.packageContinuation.query.queries[0].queriedAt, '2026-11-03T00:00:00Z');
  assert.equal(actual.assessmentSnapshot[0].package.sourceVersion, '3.0.14-1~deb12u2');
  assert.equal(actual.assessmentSnapshot[0].observedAt, '2026-11-03T00:00:00Z');
  assert.equal(actual.assessmentSnapshot[0].product, 'OpenSSL');
  assert.deepEqual(actual.packageContinuation.recordPage, { schemaVersion: 1, cycleStartedAt: '2026-11-03T00:00:00Z', metadataSignature: 'a'.repeat(64), globalOffset: 0, nextGlobalOffset: 324, sbomOffset: 0, nextSbomOffset: 0, pendingGlobals: 0, pendingSboms: 1 });
  assert.deepEqual(actual.packageContinuation.acknowledgedLockfiles, [{ path: '/Users/fixture/Projects/fixture.lock', sourceIdentity: 'fixture', status: 'unsupported' }]);
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
