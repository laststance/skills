import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createRunContext } from '../scripts/runtime.mjs';
import { discoverProjects } from '../scripts/discovery.mjs';

/** 探索専用の架空homeとcontextを作る。 @example const fixture = await discoveryFixture(); */
async function discoveryFixture() {
  const home = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'sweep-discovery-')));
  const reads = [];
  const context = createRunContext({ home, budgetMs: 120000, config: { scanRoots: [{ path: path.join(home, 'Projects'), scope: 'personal' }, { path: path.join(home, 'work'), scope: 'work' }] }, filesystem: { ...fs, open: async (...args) => { reads.push(args[0]); return fs.open(...args); } } });
  async function file(relative, text = '{}') { const filename = path.join(home, relative); await fs.mkdir(path.dirname(filename), { recursive: true }); await fs.writeFile(filename, text); return filename; }
  return { home, context, reads, file, close: async () => { await context.close(); await fs.rm(home, { recursive: true, force: true }); } };
}

test('既定rootが全て不在でも安全や探索完了を報告せず直下候補だけを示す', async () => {
  // Arrange
  const fixture = await discoveryFixture();
  try {
    await fs.mkdir(path.join(fixture.home, 'Code'));
    await fs.mkdir(path.join(fixture.home, '.ssh'));
    await fs.mkdir(path.join(fixture.home, 'Library'));
    // Act
    const result = await discoverProjects(fixture.context);
    // Assert
    assert.equal(result.coverage.at(-1).status, 'partial');
    assert.deepEqual(result.rootCandidates, [path.join(fixture.home, 'Code')]);
    assert.equal(result.lockfiles.length, 0);
    assert.equal(fixture.reads.length, 0);
  } finally { await fixture.close(); }
});

test('二つのrootと巨大directoryは小さなfrontier上限でも繰返し実行で前進する', async () => {
  // Arrange
  const fixture = await discoveryFixture();
  try {
    for (let index = 0; index < 20; index += 1) await fixture.file(`Projects/project-${index}/package-lock.json`);
    for (let index = 0; index < 4; index += 1) await fixture.file(`work/service-${index}/Cargo.lock`);
    const counts = [], rootsSeen = new Set();
    let previous = {}, result;
    // Act
    for (let run = 0; run < 80; run += 1) {
      result = await discoverProjects(fixture.context, previous, { directories: 2, entries: 2, queue: 4, files: 100 });
      counts.push(result.lockfiles.length);
      for (const file of result.lockfiles) rootsSeen.add(file.scope);
      previous = result.continuation;
      if (previous.complete) break;
    }
    // Assert
    assert.equal(result.continuation.complete, true);
    assert.equal(result.lockfiles.length, 24);
    assert.deepEqual([...rootsSeen].sort(), ['personal', 'work']);
    assert.equal(counts.every((count, index) => index === 0 || count >= counts[index - 1]), true);
    assert.equal(result.lockfiles.every(item => typeof item.sourceIdentity === 'string'), true);
    assert.equal(fixture.reads.length, 0);
  } finally { await fixture.close(); }
});

test('設定rootのLibraryリンク・祖先リンク・大文字小文字をread前に拒否する', async () => {
  // Arrange
  const fixture = await discoveryFixture();
  try {
    await fixture.file('Library/secret/package-lock.json', 'SYNTHETIC_SECRET');
    await fs.symlink(path.join(fixture.home, 'Library'), path.join(fixture.home, 'Projects'));
    await fs.mkdir(path.join(fixture.home, 'work'));
    await fs.symlink(path.join(fixture.home, 'Library'), path.join(fixture.home, 'work/alias'));
    fixture.context.config.scanRoots.push({ path: path.join(fixture.home, 'lIbRaRy/private'), scope: 'personal' });
    // Act
    const result = await discoverProjects(fixture.context);
    // Assert
    assert.equal(result.lockfiles.length, 0);
    assert.equal(result.coverage.at(-1).status, 'partial');
    assert.equal(fixture.reads.length, 0);
    assert.equal(JSON.stringify(result).includes('SYNTHETIC_SECRET'), false);
  } finally { await fixture.close(); }
});

test('root設定変更は古いfrontierを無効化し削除ファイルを現在の存在証拠へ残さない', async () => {
  // Arrange
  const fixture = await discoveryFixture();
  try {
    const removed = await fixture.file('Projects/a/package-lock.json');
    await fixture.file('work/b/Cargo.lock');
    const first = await discoverProjects(fixture.context, {}, { directories: 1, entries: 1 });
    fixture.context.config.scanRoots = [{ path: path.join(fixture.home, 'work'), scope: 'work' }];
    await fs.rm(removed);
    // Act
    const result = await discoverProjects(fixture.context, first.continuation);
    // Assert
    assert.deepEqual(result.lockfiles.map(item => item.format), ['Cargo.lock']);
    assert.equal(result.continuation.complete, true);
    assert.equal(result.projectRoots.length, 1);
  } finally { await fixture.close(); }
});

test('新しいlock形式の発見は本文を開かず能力registryと一致する', async () => {
  // Arrange
  const fixture = await discoveryFixture();
  try {
    fixture.context.config.scanRoots = [{ path: path.join(fixture.home, 'Projects'), scope: 'personal' }];
    const names = ['bun.lock', 'bun.lockb', 'gradle.lockfile', 'packages.lock.json', 'packages.config', 'pubspec.lock', 'Package.resolved'];
    for (const name of names) await fixture.file(`Projects/${name}`);
    // Act
    const result = await discoverProjects(fixture.context);
    // Assert
    assert.deepEqual(result.lockfiles.map(item => item.format).sort(), [...names].sort());
    assert.equal(result.continuation.complete, true);
    assert.equal(fixture.reads.length, 0);
  } finally { await fixture.close(); }
});

test('探索深さ上限の未確認は次回に完了へ変わらず上限変更時に再探索する', async () => {
  // Arrange
  const fixture = await discoveryFixture();
  try {
    fixture.context.config.scanRoots = [{ path: path.join(fixture.home, 'Projects'), scope: 'personal' }];
    const target = await fixture.file('Projects/deep/child/package-lock.json');
    // Act
    const first = await discoverProjects(fixture.context, {}, { depth: 1 });
    const second = await discoverProjects(fixture.context, first.continuation, { depth: 1 });
    const wider = await discoverProjects(fixture.context, second.continuation, { depth: 2 });
    // Assert
    assert.deepEqual([first, second].map(result => [result.coverage.at(-1).status, result.continuation.complete, result.continuation.depthLimited]), [['partial', false, true], ['partial', false, true]]);
    assert.deepEqual(second.lockfiles, []);
    assert.deepEqual(wider.lockfiles.map(item => item.path), [target]);
    assert.equal(wider.continuation.complete, true);
    assert.equal(wider.continuation.depthLimited, false);
  } finally { await fixture.close(); }
});

test('queue中の祖先がリンクへ置換されても再開時にその先を列挙しない', async () => {
  // Arrange
  const fixture = await discoveryFixture();
  try {
    fixture.context.config.scanRoots = [{ path: path.join(fixture.home, 'Projects'), scope: 'personal' }];
    await fixture.file('Projects/queued/safe/package-lock.json');
    await fixture.file('Library/private/secret/package-lock.json', 'SYNTHETIC_SECRET');
    const first = await discoverProjects(fixture.context, {}, { directories: 1 });
    await fs.rename(path.join(fixture.home, 'Projects/queued'), path.join(fixture.home, 'Projects/moved'));
    await fs.symlink(path.join(fixture.home, 'Library/private'), path.join(fixture.home, 'Projects/queued'));
    // Act
    const result = await discoverProjects(fixture.context, first.continuation);
    // Assert
    assert.equal(result.lockfiles.some(item => item.path.includes('/queued/')), false);
    assert.equal(result.coverage.at(-1).status, 'partial');
    assert.equal(fixture.reads.length, 0);
  } finally { await fixture.close(); }
});

test('収集期限で中止されても発見済みcatalogと未処理directoryを失わない', async () => {
  // Arrange
  const fixture = await discoveryFixture();
  try {
    fixture.context.config.scanRoots = [{ path: path.join(fixture.home, 'Projects'), scope: 'personal' }];
    await fixture.file('Projects/first/package-lock.json');
    await fixture.file('Projects/second/Cargo.lock');
    const first = await discoverProjects(fixture.context, {}, { directories: 2, entries: 1 });
    fixture.context.stop();
    // Act
    const interrupted = await discoverProjects(fixture.context, first.continuation);
    // Assert
    assert.equal(interrupted.continuation.complete, false);
    assert.equal(interrupted.lockfiles.length, first.lockfiles.length);
    assert.equal(interrupted.continuation.queue.length >= first.continuation.queue.length, true);
  } finally { await fixture.close(); }
});

test('catalog上限の10倍ある固定targetも消費済みpageを引継いで全て探索する', async () => {
  // Arrange
  const fixture = await discoveryFixture();
  try {
    fixture.context.config.scanRoots = [{ path: path.join(fixture.home, 'Projects'), scope: 'personal' }];
    for (let index = 0; index < 50; index += 1) await fixture.file(`Projects/project-${index}/package-lock.json`);
    let previous = {}, result;
    const seen = new Set(), pageSizes = [];
    // Act
    for (let run = 0; run < 100; run += 1) {
      result = await discoverProjects(fixture.context, previous, { directories: 10, entries: 3, queue: 5, files: 5, pageAcknowledged: previous.files?.length > 0 });
      for (const file of result.lockfiles) seen.add(file.path);
      pageSizes.push(result.lockfiles.length);
      previous = result.continuation;
      if (previous.complete) break;
    }
    // Assert
    assert.equal(seen.size, 50);
    assert.equal(result.continuation.complete, true);
    assert.equal(pageSizes.every(size => size <= 5), true);
    assert.equal(result.continuation.page >= 9, true);
    assert.equal(result.coverage.at(-1).status, 'partial');
    assert.equal(result.coverage.at(-1).acknowledgedFiles >= 45, true);
  } finally { await fixture.close(); }
});

test('未消費pageは削らず容量超過frontierは切捨てずに明示拒否する', async () => {
  // Arrange
  const fixture = await discoveryFixture();
  try {
    fixture.context.config.scanRoots = [{ path: path.join(fixture.home, 'Projects'), scope: 'personal' }];
    for (let index = 0; index < 6; index += 1) await fixture.file(`Projects/project-${index}/package-lock.json`);
    const first = await discoverProjects(fixture.context, {}, { files: 2 });
    // Act
    const waiting = await discoverProjects(fixture.context, first.continuation, { files: 2 });
    // Assert
    assert.deepEqual(waiting.lockfiles.map(item => item.path), first.lockfiles.map(item => item.path));
    assert.equal(waiting.continuation.page, 0);
    await assert.rejects(discoverProjects(fixture.context, { ...waiting.continuation, queue: [...waiting.continuation.queue, ...waiting.continuation.queue] }, { files: 2, queue: 1 }), error => error.diagnostic.code === 'MSS_STATE');
  } finally { await fixture.close(); }
});
