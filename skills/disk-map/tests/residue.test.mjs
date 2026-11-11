import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fakeExec, idFor, makeFixture, newSession, writeBytes } from './helpers.mjs';

const MB = 1024 * 1024;

/**
 * Session over a fixture where Spotlight knows nothing, `vp list` is empty,
 * and the only installed app lives in the injected app dir.
 */
async function residueSession(fx, { appNames = [], vpStdout = 'vp packages (0)' } = {}) {
  const appDir = path.join(fx.base, 'Applications');
  for (const name of appNames) await writeBytes(path.join(appDir, `${name}.app`, 'Contents', 'Info.plist'), 100);
  const tools = {
    '/usr/bin/mdfind': () => ({ code: 0, stdout: '', stderr: '', timedOut: false }),
    [path.join(fx.home, '.vite-plus/bin/vp')]: () => ({ code: 0, stdout: vpStdout, stderr: '', timedOut: false }),
  };
  const session = await newSession(fx, { exec: fakeExec({ tools }), appDirs: [appDir] });
  await session.startScan();
  return session;
}

// protects: uninstalled-app residue surfaces for review | fails_when: leftover state of a removed app is invisible or hidden behind app-data protection | no_claim: every uninstaller pattern
test('leftover folders of an uninstalled app become review candidates while installed apps stay protected', async () => {
  // Arrange
  const fx = await makeFixture();
  const appSupport = path.join(fx.home, 'Library', 'Application Support', 'OpenClaw');
  const logs = path.join(fx.home, 'Library', 'Logs', 'openclaw');
  const dotdir = path.join(fx.home, '.openclaw');
  const payload = path.join(fx.home, '.vite-plus', 'packages', 'openclaw');
  const installed = path.join(fx.home, 'Library', 'Application Support', 'Keept');
  await writeBytes(path.join(appSupport, 'db.sqlite'), 2 * MB);
  await writeBytes(path.join(logs, 'run.log'), 2 * MB);
  await writeBytes(path.join(dotdir, 'Cookies'), 2 * MB); // credentials-looking payload must not block review
  await writeBytes(path.join(payload, 'blob'), 2 * MB);
  await writeBytes(path.join(installed, 'db.sqlite'), 2 * MB);
  const session = await residueSession(fx, { appNames: ['Keept'] });
  // Act
  const get = (target) => session.candidates.get(idFor(session, target));
  const installedCandidate = session.ensureCandidate(session.scan.tree.findByPath(installed));
  // Assert
  assert.match(get(appSupport).residue.note, /No installed app matches "OpenClaw"/);
  assert.equal(get(appSupport).risk, 'unassessed');
  assert.match(get(logs).residue.note, /openclaw/);
  assert.match(get(dotdir).residue.note, /openclaw/);
  assert.equal(get(dotdir).risk, 'unassessed');
  assert.match(get(payload).residue.note, /not in the package manager's list/);
  assert.equal(installedCandidate.residue, null);
  assert.equal(installedCandidate.risk, 'protected');
  await fx.cleanup();
});

// protects: plain CLI configs are not residue | fails_when: a lone dot-dir gets flagged without other residue of the same app | no_claim: CLI tool semantics
test('a dot-dir is not flagged when no other residue carries the same app name', async () => {
  // Arrange
  const fx = await makeFixture();
  const lone = path.join(fx.home, '.lonecli');
  await writeBytes(path.join(lone, 'state.json'), 2 * MB);
  const session = await residueSession(fx);
  // Act
  const candidate = session.ensureCandidate(session.scan.tree.findByPath(lone));
  // Assert
  assert.equal(candidate.residue, null);
  await fx.cleanup();
});
