import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createScan, subtreeDigest } from '../scripts/lib/scanner.mjs';
import { makeFixture, writeBytes } from './helpers.mjs';

const tempRoot = async () => fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), 'disk-map-scan-')));

// protects: hard-linked files are counted once | fails_when: two names double allocated bytes | no_claim: APFS clone accounting
test('two hard links to one file count its allocation once', async () => {
  // Arrange
  const root = await tempRoot();
  await writeBytes(path.join(root, 'a', 'data.bin'), 81_920);
  await fsp.link(path.join(root, 'a', 'data.bin'), path.join(root, 'b-alias.bin'));
  // Act
  const scan = createScan({ root, fileNodeThreshold: 0 });
  await scan.run();
  // Assert
  assert.equal(scan.tree.nodes[0].alloc, 81_920);
  assert.equal(scan.stats.hardLinkAliases, 1);
  assert.equal(scan.tree.nodes.filter((node) => node.alias).length, 1);
  await fsp.rm(root, { recursive: true });
});

// protects: traversal stays inside the root | fails_when: a symlink target is scanned | no_claim: OS permissions
test('a symbolic link to a large outside folder is recorded as a boundary, not scanned', async () => {
  // Arrange
  const root = await tempRoot();
  const outside = await tempRoot();
  await writeBytes(path.join(outside, 'huge.bin'), 409_600);
  await fsp.mkdir(path.join(root, 'inside'));
  await fsp.symlink(outside, path.join(root, 'inside', 'link-out'));
  // Act
  const scan = createScan({ root, fileNodeThreshold: 0 });
  await scan.run();
  // Assert
  assert.ok(scan.tree.nodes[0].alloc < 409_600);
  assert.deepEqual(scan.boundaries.map((boundary) => [path.basename(boundary.path), boundary.kind]), [['link-out', 'symlink']]);
  assert.equal(scan.tree.nodes.some((node) => node.name === 'huge.bin'), false);
  await fsp.rm(root, { recursive: true });
  await fsp.rm(outside, { recursive: true });
});

async function fingerprint(root) {
  const lines = [];
  const walk = async (dir) => {
    for (const name of (await fsp.readdir(dir)).sort()) {
      const target = path.join(dir, name);
      const stat = await fsp.lstat(target, { bigint: true });
      const content = stat.isFile() ? createHash('sha256').update(await fsp.readFile(target)).digest('hex') : '';
      lines.push(`${path.relative(root, target)} ${stat.ino} ${stat.size} ${stat.mtimeNs} ${stat.ctimeNs} ${stat.mode} ${content}`);
      if (stat.isDirectory()) await walk(target);
    }
  };
  await walk(root);
  return lines.join('\n');
}

// protects: scanning is read-only | fails_when: fixture contents or metadata change | no_claim: full Mac coverage
test('scanning leaves every file, time and mode in the fixture unchanged', async () => {
  // Arrange
  const fx = await makeFixture();
  const before = await fingerprint(fx.home);
  // Act
  const scan = createScan({ root: fx.home, fileNodeThreshold: 0 });
  await scan.run();
  // Assert
  assert.equal(await fingerprint(fx.home), before);
  await fx.cleanup();
});

// protects: partial states stay visible | fails_when: a denied or cancelled subtree reads as complete | no_claim: privileged scans
test('a denied folder makes its ancestors incomplete and is listed as denied', async () => {
  // Arrange
  const root = await tempRoot();
  await writeBytes(path.join(root, 'open', 'a.txt'), 10);
  await writeBytes(path.join(root, 'locked', 'secret.txt'), 10);
  await fsp.chmod(path.join(root, 'locked'), 0o000);
  // Act
  const scan = createScan({ root, fileNodeThreshold: 0 });
  await scan.run();
  // Assert
  const node = (name) => scan.tree.nodes.find((item) => item.name === name);
  assert.equal(node('locked').denied, true);
  assert.equal(node('locked').complete, false);
  assert.equal(node('open').complete, true);
  assert.equal(scan.tree.nodes[0].complete, false);
  assert.deepEqual(scan.boundaries.map((boundary) => [path.basename(boundary.path), boundary.kind, boundary.code]), [['locked', 'denied', 'EACCES']]);
  await fsp.chmod(path.join(root, 'locked'), 0o700);
  await fsp.rm(root, { recursive: true });
});

// protects: cancel leaves an inspectable partial snapshot | fails_when: a cancelled scan marks folders complete | no_claim: cancel latency
test('cancelling a scan leaves every folder incomplete', async () => {
  // Arrange
  const root = await tempRoot();
  for (let index = 0; index < 40; index += 1) await writeBytes(path.join(root, `d${index}`, 'f.txt'), 10);
  let scan;
  scan = createScan({ root, fileNodeThreshold: 0, concurrency: 1, onProgress: () => scan?.cancel() });
  // Act
  await scan.run();
  // Assert
  assert.equal(scan.cancelled, true);
  assert.equal(scan.tree.nodes.filter((node) => node.kind === 'dir').every((node) => node.complete === false), true);
  await fsp.rm(root, { recursive: true });
});

// protects: odd names and sparse files stay inspectable | fails_when: names break or sizes are fabricated | no_claim: every filesystem
test('empty folders, non-ASCII and very long names, and sparse files keep true sizes', async () => {
  // Arrange
  const root = await tempRoot();
  const longName = `${'長い名前'.repeat(20)}.bin`;
  await fsp.mkdir(path.join(root, 'empty'));
  await writeBytes(path.join(root, '日本語', longName), 4096);
  const sparse = await fsp.open(path.join(root, 'sparse.img'), 'w');
  await sparse.truncate(50_000_000);
  await sparse.close();
  // Act
  const scan = createScan({ root, fileNodeThreshold: 0 });
  await scan.run();
  // Assert
  const node = (name) => scan.tree.nodes.find((item) => item.name === name);
  assert.equal(node('empty').alloc, 0);
  assert.equal(node('empty').complete, true);
  assert.equal(scan.tree.pathOf(scan.tree.nodes.indexOf(node(longName))), path.join(root, '日本語', longName));
  assert.equal(node('sparse.img').logical, 50_000_000);
  assert.ok(node('sparse.img').alloc < 1_000_000, `sparse allocation was ${node('sparse.img').alloc}`);
  await fsp.rm(root, { recursive: true });
});

// protects: the digest notices a new child | fails_when: an added file keeps the same digest | no_claim: content changes with identical metadata
test('adding a file inside a folder changes its metadata digest', async () => {
  // Arrange
  const root = await tempRoot();
  await writeBytes(path.join(root, 'cache', 'a.bin'), 10);
  const before = await subtreeDigest(path.join(root, 'cache'));
  // Act
  await writeBytes(path.join(root, 'cache', 'b.bin'), 10);
  const after = await subtreeDigest(path.join(root, 'cache'));
  // Assert
  assert.notEqual(after.digest, before.digest);
  assert.equal(after.entries, 2);
  await fsp.rm(root, { recursive: true });
});

// protects: firmlink display paths resolve to scanned nodes | fails_when: a /Users-style alias path cannot be found after a rescan | no_claim: every firmlink on every macOS release
test('a path below a firmlink alias resolves to the same node as its scanned real path', async () => {
  // Arrange
  const root = await tempRoot();
  await writeBytes(path.join(root, 'Users', 'me', 'notes.txt'), 10);
  const scan = createScan({ root, fileNodeThreshold: 0, aliases: new Map([['Users', '/Users']]) });
  await scan.run();
  // Act
  const byAlias = scan.tree.findByPath('/Users/me/notes.txt');
  const byReal = scan.tree.findByPath(path.join(root, 'Users', 'me', 'notes.txt'));
  // Assert
  assert.equal(scan.tree.nodes[byAlias].name, 'notes.txt');
  assert.equal(byAlias, byReal);
  assert.equal(scan.tree.pathOf(byAlias), '/Users/me/notes.txt');
  assert.equal(scan.tree.findByPath('/Users/someone-else'), undefined);
  await fsp.rm(root, { recursive: true });
});
