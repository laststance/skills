import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(here, '..');
const FILES = {
  skill: path.join(here, '..', 'SKILL.md'),
  html: path.join(here, '..', 'assets', 'viewer.html'),
  css: path.join(here, '..', 'assets', 'viewer.css'),
  viewer: path.join(here, '..', 'assets', 'viewer.mjs'),
  yaml: path.join(here, '..', 'agents', 'openai.yaml'),
  matrix: path.join(here, '.', 'README.md'),
  journeys: path.join(here, 'browser', 'journeys.mjs'),
  perf: path.join(here, '.', 'perf.mjs'),
};
const read = (file) => fsp.readFile(file, 'utf8');

// protects: a clean install is self-contained | fails_when: SKILL.md links or the viewer needs a missing file, a package install or a CDN | no_claim: host discovery behavior
test('every file the skill and viewer reference ships inside the skill folder', async () => {
  // Arrange
  const skill = await read(FILES.skill);
  const html = await read(FILES.html);
  const linked = [...skill.matchAll(/\]\((references\/[^)]+)\)/g)].map((match) => match[1]);
  const served = [...html.matchAll(/(?:href|src)="\/([^"]+)"/g)].map((match) => `assets/${match[1]}`);
  // Act
  const missing = [];
  for (const rel of [...new Set([...linked, ...served, 'scripts/disk-map.mjs', 'assets/treemap.mjs'])]) {
    await fsp.access(path.join(skillDir, rel)).catch(() => missing.push(rel));
  }
  // Assert
  assert.deepEqual(served.sort(), ['assets/viewer.css', 'assets/viewer.mjs']);
  assert.deepEqual(missing, []);
  assert.equal(/https?:\/\//.test(html), false);
  assert.equal(await fsp.access(path.join(skillDir, 'package.json')).then(() => true, () => false), false);
});

// protects: motion respects the user setting and small screens stack | fails_when: the reduced-motion or narrow-screen rules disappear | no_claim: rendering in every browser
test('the stylesheet disables motion for reduced-motion users and stacks the layout on narrow screens', async () => {
  // Arrange
  const css = await read(FILES.css);
  // Act
  const reduced = /@media \(prefers-reduced-motion: reduce\)[^}]*\{[^}]*transition: none !important/.test(css);
  const narrow = /@media \(max-width: 1100px\)\s*\{\s*\.layout \{ grid-template-columns: minmax\(0, 1fr\); \}/.test(css);
  // Assert
  assert.deepEqual({ reduced, narrow }, { reduced: true, narrow: true });
});

// protects: the viewer works under its CSP and renders untrusted names as text | fails_when: inline script/style or innerHTML appears | no_claim: every DOM sink
test('the viewer markup has no inline script or style and the viewer never assigns innerHTML', async () => {
  // Arrange
  const html = await read(FILES.html);
  const script = await read(FILES.viewer);
  // Act
  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)].length;
  const styleAttributes = /\sstyle="/.test(html);
  const htmlSinks = /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/.test(script);
  // Assert
  assert.deepEqual({ inlineScripts, styleAttributes, htmlSinks }, { inlineScripts: 0, styleAttributes: false, htmlSinks: false });
});

// protects: English and Japanese UI stay complete | fails_when: a viewer label exists in one language only | no_claim: translation quality
test('every viewer text key exists in both the English and the Japanese dictionary', async () => {
  // Arrange
  const html = await read(FILES.html);
  const script = await read(FILES.viewer);
  const [en, ja] = script.split(/^\s{2}ja: \{$/m);
  const keysOf = (block) => new Set([...block.matchAll(/(?:^|[\s,{])([A-Za-z_]+):\s['"]/g)].map((match) => match[1]));
  const htmlKeys = [...html.matchAll(/data-i18n(?:-placeholder)?="([^"]+)"/g)].map((match) => match[1]);
  // Act
  const enKeys = keysOf(en.slice(en.indexOf('en: {')));
  const jaKeys = keysOf(ja.slice(0, ja.indexOf('\n  },')));
  // Assert
  assert.deepEqual([...enKeys].filter((key) => !jaKeys.has(key)), []);
  assert.deepEqual([...jaKeys].filter((key) => !enKeys.has(key)), []);
  assert.deepEqual(htmlKeys.filter((key) => !enKeys.has(key)), []);
});

// protects: normal skill discovery stays enabled | fails_when: implicit invocation is disabled or metadata is missing | no_claim: how each host ranks skills
test('Codex metadata names the skill and keeps implicit invocation enabled', async () => {
  // Arrange
  const yaml = await read(FILES.yaml);
  const skill = await read(FILES.skill);
  // Act
  const frontmatter = skill.split('---')[1];
  // Assert
  assert.match(yaml, /display_name: "Disk Map"/);
  assert.match(yaml, /default_prompt: ".*\$disk-map/);
  assert.equal(/allow_implicit_invocation:\s*false/.test(yaml), false);
  assert.match(frontmatter, /^name: disk-map$/m);
  assert.equal(/disable-model-invocation:\s*true/.test(frontmatter), false);
});

// protects: the test matrix document matches real tests | fails_when: tests/README.md names a test that does not exist | no_claim: test quality
test('every test named in the test matrix exists in a test file', async () => {
  // Arrange
  const matrix = await read(FILES.matrix);
  const sources = (await Promise.all(['scanner', 'policy', 'cleanup', 'bridge', 'recipes-report', 'cli', 'packaging'].map((name) => read(path.join(here, `${name}.test.mjs`))))).join('\n');
  const rows = [...matrix.matchAll(/^\| [UI]\d+ \| [\w.-]+\.test\.mjs \| (.+) \|$/gm)].flatMap((match) => match[1].split('; ').map((name) => name.replace(/ \(.*\)$/, '').trim()));
  // Act
  const missing = rows.filter((name) => !sources.includes(name.split(';')[0].trim()));
  // Assert
  assert.ok(rows.length >= 24, `only ${rows.length} rows parsed`);
  assert.deepEqual(missing, []);
});

// protects: the browser and perf entry points stay runnable | fails_when: a syntax error hides in a script node --test does not load | no_claim: their runtime results
test('the browser journey and performance scripts parse', () => {
  // Arrange
  const scripts = [FILES.journeys, FILES.perf];
  // Act
  const statuses = scripts.map((file) => spawnSync(process.execPath, ['--check', file]).status);
  // Assert
  assert.deepEqual(statuses, [0, 0]);
});
