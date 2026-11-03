import path from 'node:path';
import { createHash } from 'node:crypto';
import { boundedJson, LIMITS } from './safe-io.mjs';
import { SweepError, safeDiagnostic } from './diagnostics.mjs';

const DEFINITIONS = [
  ['npm', ['package-lock.json', 'npm-shrinkwrap.json'], '1/2/3', 'npm', 'https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json'],
  ['pnpm', ['pnpm-lock.yaml'], '5/6/9 subset; 1/2 documents', 'npm', 'https://github.com/pnpm/pnpm/blob/main/pnpm/docs/lockfile.md'],
  ['yarn', ['yarn.lock'], 'classic/berry subset', 'npm', 'https://yarnpkg.com/advanced/lexicon#lockfile'],
  ['bun', ['bun.lock'], 'JSONC 1/2', 'npm', 'https://bun.sh/docs/pm/lockfile'],
  ['bun-binary', ['bun.lockb'], 'detected only', 'npm', 'https://bun.sh/docs/pm/lockfile'],
  ['cargo', ['Cargo.lock'], '1/2/3/4 TOML subset', 'crates.io', 'https://doc.rust-lang.org/cargo/guide/cargo-toml-vs-cargo-lock.html'],
  ['go', ['go.sum'], 'checksum lines', 'Go', 'https://go.dev/ref/mod#go-sum-files'],
  ['poetry', ['poetry.lock'], '1/2 TOML subset', 'PyPI', 'https://python-poetry.org/docs/repositories/'],
  ['pipfile', ['Pipfile.lock'], 'JSON 6', 'PyPI', 'https://pipenv.pypa.io/en/latest/pipfile.html'],
  ['uv', ['uv.lock'], '1 TOML subset', 'PyPI', 'https://docs.astral.sh/uv/concepts/projects/layout/#the-lockfile'],
  ['requirements', ['requirements.txt'], 'exact pins/direct wheels', 'PyPI', 'https://pip.pypa.io/en/stable/reference/requirements-file-format/'],
  ['composer', ['composer.lock'], 'Composer 1/2 JSON', 'Packagist', 'https://getcomposer.org/doc/05-repositories.md'],
  ['gem', ['Gemfile.lock'], 'Bundler section subset', 'RubyGems', 'https://bundler.io/man/gemfile.5.html'],
  ['gradle', ['gradle.lockfile'], 'Gradle lock lines', 'Maven', 'https://docs.gradle.org/current/userguide/dependency_locking.html'],
  ['nuget', ['packages.lock.json'], '1/2', 'NuGet', 'https://learn.microsoft.com/en-us/nuget/consume-packages/package-references-in-project-files#locking-dependencies'],
  ['nuget-config', ['packages.config'], 'packages XML', 'NuGet', 'https://learn.microsoft.com/en-us/nuget/reference/packages-config'],
  ['dart', ['pubspec.lock'], 'hosted YAML subset', 'Pub', 'https://dart.dev/tools/pub/glossary#lockfile'],
  ['swift', ['Package.resolved'], '1/2/3 JSON', null, 'https://ossf.github.io/osv-schema/'],
];
export const FORMAT_CAPABILITIES = Object.freeze(DEFINITIONS.map(([id, files, schema, ecosystem, reference]) => Object.freeze({ id, files, schema, ecosystem,
  discovery: true, parsing: id !== 'bun-binary', origin: 'record-bound-only', query: id === 'swift' ? 'privacy-excluded' : id === 'bun-binary' ? 'unsupported' : 'proven-public-only', reference, verifiedAt: '2026-11-03' })));
export const LOCKFILE_NAMES = new Set(DEFINITIONS.flatMap(([, files]) => files));
const ECOSYSTEMS = new Set(DEFINITIONS.map(([, , , ecosystem]) => ecosystem).filter(Boolean));
const DISTRO_ECOSYSTEM = /^(?:Debian:(?:10|11|12|13)|Alpine:v3\.(?:18|19|20|21|22|23|24))$/;
const PUBLIC_HOSTS = {
  npm: new Set(['registry.npmjs.org', 'registry.yarnpkg.com']),
  PyPI: new Set(['pypi.org', 'files.pythonhosted.org']),
  'crates.io': new Set(['index.crates.io', 'static.crates.io', 'crates.io']),
  Go: new Set(['proxy.golang.org']), Packagist: new Set(['repo.packagist.org', 'packagist.org']),
  RubyGems: new Set(['rubygems.org']), Maven: new Set(['repo.maven.apache.org', 'repo1.maven.org']),
  NuGet: new Set(['api.nuget.org', 'www.nuget.org']), Pub: new Set(['pub.dev', 'pub.dartlang.org']),
};

/** 意図的に未対応とした構文だけを有限診断へ変換する。形式検証の各guardが呼び、JS実装例外は変換しない。
 * @example throw unsupportedSyntax()
 */
function unsupportedSyntax() { return new SweepError('FORMAT', { cause: 'unsupported', operation: 'packages' }); }

/** 発見と解析が同じ形式表を使う。{@link extractLockfile}とinventoryから呼ぶ。 @example identifyFormat('Cargo.lock') */
export function identifyFormat(filename) { return FORMAT_CAPABILITIES.find(format => format.files.includes(path.basename(filename))) || null; }

/** 名前の構文と固定版をecosystem別に検証する。送信直前にも再確認する。 @example validPackage({name:'org.example:core',version:'1.2.3',ecosystem:'Maven'}) */
export function validPackage(pkg) {
  const distro = DISTRO_ECOSYSTEM.test(pkg?.ecosystem || '');
  if (!pkg || !ECOSYSTEMS.has(pkg.ecosystem) && !distro || typeof pkg.name !== 'string' || pkg.name.length > 200 || pkg.name.includes('..') || typeof pkg.version !== 'string') return false;
  if (!(distro ? /^[0-9][A-Za-z0-9.+_!:\-~]{0,119}$/ : /^[v0-9][A-Za-z0-9.+_!:\-]{0,119}$/).test(pkg.version)) return false;
  // OSV accepts distro source identities; release-specific comparison belongs to its ecosystem implementation.
  if (distro) return /^[a-z0-9][a-z0-9+.-]*$/.test(pkg.name);
  const names = {
    npm: /^(?:@[a-z0-9_.-]+\/)?[A-Za-z0-9_.-]+$/, PyPI: /^[A-Za-z0-9][A-Za-z0-9_.-]*$/,
    'crates.io': /^[A-Za-z0-9][A-Za-z0-9_-]*$/, Go: /^[A-Za-z0-9][A-Za-z0-9._~+/-]*$/,
    Packagist: /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/, RubyGems: /^[A-Za-z0-9][A-Za-z0-9_.-]*$/,
    Maven: /^[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+$/, NuGet: /^[A-Za-z0-9][A-Za-z0-9_.-]*$/, Pub: /^[a-z][a-z0-9_]*$/,
  };
  return names[pkg.ecosystem].test(pkg.name);
}

/** 公開の配布先を有限リストで分類する。Gitホストや既定registryの推測は許可しない。 @example publicResolution('https://registry.npmjs.org/a/-/a-1.0.0.tgz','npm') */
export function publicResolution(value, ecosystem) {
  if (typeof value !== 'string' || value.length > 4096) return false;
  try {
    const url = new URL(value);
    const distroHosts = /^Debian:/.test(ecosystem) ? ['deb.debian.org', 'security.debian.org', 'archive.debian.org']
      : /^Alpine:/.test(ecosystem) ? ['dl-cdn.alpinelinux.org', 'dl-1.alpinelinux.org'] : [];
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.port
      && (PUBLIC_HOSTS[ecosystem]?.has(url.hostname) === true || DISTRO_ECOSYSTEM.test(ecosystem) && distroHosts.includes(url.hostname));
  } catch { return false; }
}

/** 重複JSON keyで前のprivate記録を上書きさせない。形式パーサだけが呼ぶ。 @example strictJson('{"version":1}') */
function strictJson(text) {
  const value = boundedJson(text, { maxRecords: 150000 });
  const stack = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') stack.push({ object: true, keys: new Set() });
    else if (char === '[') stack.push({ object: false });
    else if (char === '}' || char === ']') stack.pop();
    else if (char === '"') {
      const start = index;
      let escaped = false;
      for (index += 1; index < text.length; index += 1) {
        if (escaped) escaped = false;
        else if (text[index] === '\\') escaped = true;
        else if (text[index] === '"') break;
      }
      let next = index + 1;
      while (/\s/.test(text[next] || '') && next < text.length) next += 1;
      const frame = stack.at(-1);
      if (text[next] === ':' && frame?.object) {
        const key = JSON.parse(text.slice(start, index + 1));
        if (frame.keys.has(key)) throw unsupportedSyntax();
        frame.keys.add(key);
      }
    }
  }
  return value;
}

/** sourceの値を本文を残さず有限分類にする。各形式のrecord生成が呼ぶ。 @example classifyOrigin('https://registry.npmjs.org/a','npm') */
function classifyOrigin(reference, ecosystem, privateFlag = false) {
  if (privateFlag) return 'private';
  if (!reference) return 'unknown';
  if (publicResolution(reference, ecosystem)) return 'public';
  if (/^(?:git(?:\+|:)|ssh:|git@|github:)/i.test(reference) || /\.git(?:#|$)/i.test(reference)) return 'git';
  if (/^(?:file|path|link|workspace):|^\.{1,2}\//i.test(reference)) return 'local';
  return 'private';
}

/** JSONCを文字列内URLを壊さずJSONへ限定変換する。Bun解析だけが呼ぶ。 @example parseJsonc('{"lockfileVersion":1,}') */
export function parseJsonc(text) {
  let output = '', quote = false, escape = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) { output += char; if (escape) escape = false; else if (char === '\\') escape = true; else if (char === '"') quote = false; continue; }
    if (char === '"') { quote = true; output += char; continue; }
    if (char === '/' && text[index + 1] === '/') { while (index < text.length && text[index] !== '\n') index += 1; output += '\n'; continue; }
    if (char === '/' && text[index + 1] === '*') {
      const end = text.indexOf('*/', index + 2);
      if (end < 0) throw new SweepError('FORMAT', { cause: 'malformed', operation: 'packages' });
      output += ' '; index = end + 1; continue;
    }
    // trailing commaだけを取り除き、式や単引用符はJSONへ通さない。
    if (char === ',' && /^\s*[}\]]/.test(text.slice(index + 1))) continue;
    output += char;
  }
  let cleaned = ''; quote = false; escape = false;
  // コメント除去後にtrailing commaを判定する。文字列中のcommaは保持する。
  for (let index = 0; index < output.length; index += 1) {
    const char = output[index];
    if (quote) { cleaned += char; if (escape) escape = false; else if (char === '\\') escape = true; else if (char === '"') quote = false; continue; }
    if (char === '"') quote = true;
    if (char === ',' && /^\s*[}\]]/.test(output.slice(index + 1))) continue;
    cleaned += char;
  }
  return strictJson(cleaned);
}

/** 限定YAML/TOMLの単純scalarを扱う。コード・タグ・aliasは解釈しない。 @example scalar('"1.2.3"') */
function scalar(value) {
  const text = value.trim();
  if (text.startsWith('"')) return boundedJson(text);
  if (text.startsWith("'")) { if (!/^'(?:[^']|'')*'$/.test(text)) throw unsupportedSyntax(); return text.slice(1, -1).replace(/''/g, "'"); }
  if (/[\x00-\x1f]/.test(text) || /^(?:[&*!>|]|\{\{|\$\{)/.test(text)) throw unsupportedSyntax();
  return text.replace(/\s+#.*$/, '').trim();
}

/** 限定YAMLで同じmapping内のkeyを重複させない。公開sourceのfirst-match化を防ぐ。 @example validateYamlKeys(text) */
function validateYamlKeys(text) {
  const frames = [];
  for (const line of text.split('\n')) {
    if (/^\s*(?:#.*)?$/.test(line)) continue;
    if (/^(?:---|\.\.\.)(?:[ \t]|$)/.test(line) || /^%/.test(line)) throw unsupportedSyntax();
    const mapping = line.match(/^( *)(\S.*?):(?:\s|$)/);
    if (!mapping) continue;
    // mapping値のalias/tagだけを拒否し、workspace:*などscalar内のcolonを読み違えない。
    if (/^[&*!]/.test(line.slice(mapping[0].length).trimStart())) throw unsupportedSyntax();
    const indent = mapping[1].length;
    while (frames.length && frames.at(-1).indent > indent) frames.pop();
    if (!frames.length || frames.at(-1).indent < indent) frames.push({ indent, keys: new Set() });
    const selector = mapping[2].match(/^("(?:[^"\\]|\\.)*"),\s*(?:"(?:[^"\\]|\\.)*"(?:,\s*)?)+$/)?.[1];
    const key = scalar(selector || mapping[2]);
    if (frames.at(-1).keys.has(key)) throw unsupportedSyntax();
    frames.at(-1).keys.add(key);
    // flow mapの由来に関係するkeyも重複を拒否する。複雑なflowは未対応として閉じる。
    const originKeys = [...line.matchAll(/(?:[,{]\s*)("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[A-Za-z_][A-Za-z0-9_-]*)\s*:/g)].map(match => scalar(match[1]));
    if (new Set(originKeys).size !== originKeys.length) throw unsupportedSyntax();
    if (/[{,]\s*[!&*?]/.test(line) || /\s:\s*[{,]/.test(line)) throw unsupportedSyntax();
  }
}

/** pnpmのboot/projectを別々のmappingとして検証する。{@link extractLockfile}は両方を同じ有限record枠へ収める。
 * @example pnpmDocuments("---\nlockfileVersion: '9.0'\npackages: {}\n")
 */
function pnpmDocuments(text) {
  const documents = text.split(/^---[ \t]*\r?$/m);
  // 先頭markerの前はコメントと空白だけ許す。空documentや3document以上は受け入れない。
  if (documents.length > 1 && documents[0].split('\n').every(line => /^\s*(?:#.*)?$/.test(line))) documents.shift();
  if (documents.length > 2 || documents.some(document => document.split('\n').every(line => /^\s*(?:#.*)?$/.test(line)))) throw unsupportedSyntax();
  let expectedSchema;
  for (const document of documents) {
    validateYamlKeys(document);
    const schema = scalar(document.match(/^lockfileVersion:\s*(.+)$/m)?.[1] || '');
    if (!/^(?:5(?:\.\d+)?|6(?:\.0)?|9(?:\.0)?)$/.test(schema) || expectedSchema !== undefined && schema !== expectedSchema) throw unsupportedSyntax();
    expectedSchema = schema;
  }
  return documents;
}

/** packagesを省略したlockを、importerが全て明示的な空mappingの場合だけ空として扱う。pnpmの形式分岐が呼ぶ。
 * @example emptyPnpmImporters('lockfileVersion: 9\nimporters:\n  .: {}\n')
 */
function emptyPnpmImporters(document) {
  // 未対応のroot keyや引用したpackages欄を、依存なしとして読み飛ばさない。
  if (document.split('\n').some(line => /^\S/.test(line) && !/^#/.test(line)
    && !/^(?:lockfileVersion|settings|importers|snapshots|overrides|catalogs|packageExtensionsChecksum):/.test(line))) return false;
  if (/^(?:dependencies|devDependencies|optionalDependencies|configDependencies|packageManagerDependencies):/m.test(document)
    || /^snapshots:/m.test(document) && !/^snapshots:\s*\{\}\s*$/m.test(document)) return false;
  if (/^importers:\s*\{\}\s*$/m.test(document)) return true;
  const section = document.split(/^importers:\s*$/m)[1]?.split(/^\S/m)[0];
  if (section === undefined) return false;
  const lines = section.split('\n').filter(line => !/^\s*(?:#.*)?$/.test(line));
  return lines.length > 0 && lines.every(line => /^ {2}\S.*:\s*\{\}\s*$/.test(line));
}

/** resolutionのflat flow mapだけを構文どおり読む。文字列内・入れ子のtarballを由来へ誤結合しない。 @example flatYamlMap('{tarball: https://registry.npmjs.org/a.tgz}') */
function flatYamlMap(input) {
  if (!input.startsWith('{') || !input.endsWith('}')) throw unsupportedSyntax();
  const fields = new Map();
  let index = 1;
  const end = input.length - 1;
  const quoted = () => {
    const start = index, quote = input[index++];
    while (index < end) {
      if (quote === '"' && input[index] === '\\') { index += 2; continue; }
      if (input[index++] === quote) {
        if (quote === "'" && input[index] === "'") { index += 1; continue; }
        return scalar(input.slice(start, index));
      }
    }
    throw unsupportedSyntax();
  };
  while (index < end) {
    while (/\s/.test(input[index]) && index < end) index += 1;
    if (index >= end) break;
    let key;
    if (['"', "'"].includes(input[index])) key = quoted();
    else { const match = input.slice(index).match(/^[A-Za-z_][A-Za-z0-9_-]*/); if (!match) throw unsupportedSyntax(); key = match[0]; index += key.length; }
    while (/\s/.test(input[index]) && index < end) index += 1;
    if (input[index++] !== ':' || fields.has(key)) throw unsupportedSyntax();
    while (/\s/.test(input[index]) && index < end) index += 1;
    let value;
    if (['"', "'"].includes(input[index])) value = quoted();
    else {
      const start = index;
      while (index < end && input[index] !== ',') { if (/[{}\[\]"']/.test(input[index])) throw unsupportedSyntax(); index += 1; }
      value = scalar(input.slice(start, index));
    }
    fields.set(key, value);
    if (fields.size > 100) throw unsupportedSyntax();
    while (/\s/.test(input[index]) && index < end) index += 1;
    if (index < end && input[index++] !== ',') throw unsupportedSyntax();
  }
  return fields;
}

/** TOML文字列内の等号をkey代入と混同しない。{@link validateTomlSubset}が限定構文の検証に使う。
 * @example tomlAssignment('  "python_version == 3.13",')
 */
function tomlAssignment(line) {
  let quote = null, escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (quote === '"' && char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '#') break;
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '=') {
      const key = line.slice(0, index);
      return /^[^#{}\[\],]+$/.test(key) ? key.trim() : null;
    }
  }
  if (quote) throw new SweepError('FORMAT', { cause: 'unsupported', operation: 'packages' });
  return null;
}

/** 読めないTOMLの同義keyやmultiline文字列をファイル単位で拒否する。由来の部分読取を防ぐ。 @example validateTomlSubset(text) */
function validateTomlSubset(text) {
  const keys = new Set();
  let section = '', instance = 0;
  for (const line of text.split('\n')) {
    if (/^\s*(?:#.*)?$/.test(line)) continue;
    if (/['"]{3}/.test(line)) throw unsupportedSyntax();
    if (/^\s*\[/.test(line) && !/^\s*\[\s*$/.test(line)) {
      const table = line.match(/^(\[{1,2})([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)(\]{1,2})\s*(?:#.*)?$/);
      if (!table || table[1].length !== table[3].length) throw unsupportedSyntax();
      if (table[1] === '[[') instance += 1;
      section = `${instance}:${table[2]}`;
      continue;
    }
    // 標準keyのquoted/dotted/空白付き表現を無視して公開版だけ採用しない。
    const key = tomlAssignment(line);
    if (key !== null) {
      if (!/^[A-Za-z0-9_-]+$/.test(key) || /^\s/.test(line)) throw unsupportedSyntax();
      const identity = `${section}:${key}`;
      if (keys.has(identity)) throw unsupportedSyntax();
      keys.add(identity);
    }
    if (/[{,]\s*["'](?:[^"']|\\.)*["']\s*=/.test(line) || /[{,]\s*[A-Za-z0-9_-]+\s*\./.test(line)) throw unsupportedSyntax();
  }
}

/** インデントでrecordを切り出す。汎用YAMLとして未対応構文を成功扱いしない。 @example yamlBlocks(text,'packages',2) */
function yamlBlocks(text, section, indent) {
  const lines = text.split('\n');
  const output = [];
  const keys = new Set();
  let active = section === null, current = null;
  for (const line of lines) {
    if (/^\s*(?:#.*)?$/.test(line)) continue;
    if (/\t/.test(line) || /^\s*[&*!]/.test(line) || /^\s*<<\s*:/.test(line)) throw unsupportedSyntax();
    if (section !== null && /^\S/.test(line)) { active = line === `${section}:`; current = null; continue; }
    if (!active) continue;
    const match = line.match(new RegExp(`^ {${indent}}(\\S.*):(?:\\s*(\\{\\}))?\\s*$`));
    if (match) {
      const firstYarnSelector = section === null ? match[1].match(/^("(?:[^"\\]|\\.)*"),\s*(?:"(?:[^"\\]|\\.)*"(?:,\s*)?)+$/)?.[1] : null;
      current = { key: scalar(firstYarnSelector || match[1]), lines: [] };
      if (keys.has(current.key)) throw unsupportedSyntax();
      keys.add(current.key); output.push(current);
    }
    else if (current && line.startsWith(' '.repeat(indent + 1))) current.lines.push(line);
    else if (line.trim()) throw unsupportedSyntax();
  }
  return output;
}

/** TOML package blockの単純値だけを読む。source欄の未知表現は送信許可へ使わない。 @example tomlValue(block,'name') */
function tomlValue(block, key) {
  const matches = [...block.matchAll(new RegExp(`^${key}\\s*=\\s*(.+?)\\s*$`, 'gm'))];
  if (matches.length > 1) throw unsupportedSyntax();
  if (!matches.length) return undefined;
  const quoted = matches[0][1].match(/^("(?:[^"\\]|\\.)*"|'[^']*')\s*(?:#.*)?$/)?.[1];
  if (!quoted) throw unsupportedSyntax();
  return scalar(quoted);
}

/** lockごとの出所をrecord単位で保持する。{@link scanPackages}がsafe IOで取得した本文だけを渡す。 @example extractLockfile('package-lock.json', text, {sourceIdentity:'1:2'}) */
export function extractLockfile(filename, content, options = {}) {
  const format = identifyFormat(filename);
  const records = [];
  const sourceIdentity = typeof options.sourceIdentity === 'string' && /^[A-Za-z0-9:._-]{1,250}$/.test(options.sourceIdentity) ? options.sourceIdentity
    : createHash('sha256').update(typeof content === 'string' || Buffer.isBuffer(content) ? content : '').digest('hex');
  let invalid = 0;
  const add = (recordKey, name, version, ecosystem, origin = 'unknown', extra = {}) => {
    const recordId = createHash('sha256').update(String(recordKey)).digest('hex');
    const pkg = { name, version, ecosystem };
    if (!validPackage(pkg) && ecosystem !== 'SwiftURL') { invalid += 1; return; }
    if (ecosystem === 'SwiftURL' && (!/^[A-Za-z0-9_.-]{1,200}$/.test(name || '') || !/^[v0-9][A-Za-z0-9.+_-]{0,119}$/.test(version || ''))) { invalid += 1; return; }
    records.push({ ...pkg, recordId, sourceIdentity, origin, queryEligible: origin === 'public' && ecosystem !== 'SwiftURL', policyExcluded: ['private', 'git', 'local'].includes(origin),
      evidenceKind: 'lock-declaration', optional: extra.optional === true, platform: extra.platform === 'darwin' ? 'darwin' : extra.platform === 'other' ? 'other' : 'unknown',
      ...(Number.isInteger(extra.pnpmDocument) ? { pnpmDocument: extra.pnpmDocument } : {}),
      ...(Number.isSafeInteger(extra.resolutionRevision) ? { resolutionRevision: extra.resolutionRevision, ...(extra.resolutionRevision > 0 ? { reasonCode: 'registry-revision-unassessed' } : {}) } : {}),
      ...(ecosystem === 'SwiftURL' ? { exclusion: 'git-url-privacy' } : {}) });
    if (records.length > 15000) throw new SweepError('CAPACITY', { cause: 'limit', operation: 'packages' });
  };
  if (!format || format.id === 'bun-binary') return { packages: [], records: [], skipped: 0, status: 'unsupported', reason: '検出済み・静的解析未対応', format: format?.id || 'unknown' };
  try {
    if (typeof content !== 'string' || Buffer.byteLength(content) > LIMITS.lock || content.includes('\0') || content.split('\n').some(line => line.length > LIMITS.line)) throw new SweepError('CAPACITY', { cause: 'limit', operation: 'packages' });
    const id = format.id;
    if (['yarn', 'dart'].includes(id)) validateYamlKeys(content);
    if (id === 'npm') {
      const data = strictJson(content);
      const version = data.lockfileVersion ?? (data.packages ? 2 : null);
      if (![1, 2, 3].includes(version)) throw unsupportedSyntax();
      if (version === 1) {
        const visit = (dependencies, parent = '', depth = 0) => {
          if (depth > 32 || !dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) throw unsupportedSyntax();
          for (const [name, pkg] of Object.entries(dependencies)) {
            const key = `${parent}/node_modules/${name}`;
            add(key, name, pkg.version, 'npm', classifyOrigin(pkg.resolved, 'npm', pkg.private === true || pkg.link === true), { optional: pkg.optional });
            if (pkg.dependencies) visit(pkg.dependencies, key, depth + 1);
          }
        };
        visit(data.dependencies || {});
      } else {
        if (!data.packages || Array.isArray(data.packages)) throw unsupportedSyntax();
        for (const [location, pkg] of Object.entries(data.packages)) {
          if (!location) continue;
          add(location, pkg.name || location.split('node_modules/').at(-1), pkg.version, 'npm', classifyOrigin(pkg.resolved, 'npm', pkg.private === true || pkg.link === true),
            { optional: pkg.optional, platform: Array.isArray(pkg.os) ? pkg.os.includes('darwin') ? 'darwin' : pkg.os.includes('!darwin') || pkg.os.every(os => !os.startsWith('!')) ? 'other' : 'unknown' : 'unknown' });
        }
      }
    } else if (id === 'pnpm') {
      const documents = pnpmDocuments(content);
      for (let documentIndex = 0; documentIndex < documents.length; documentIndex += 1) {
        const document = documents[documentIndex];
        if (!/^packages:\s*(?:\{\})?\s*$/m.test(document) && (/^packages:/m.test(document) || !emptyPnpmImporters(document))) throw unsupportedSyntax();
        // 同名recordもdocumentを跨いで上書きせず、各record自身のresolutionだけを読む。
        for (const block of yamlBlocks(document, 'packages', 2)) {
          const clean = block.key.replace(/^\//, '').replace(/\([^)]*\)/g, '');
          const parsed = clean.match(/^(@[^/]+\/[^@/]+|[^@/]+)@([^/]+)$/) || clean.match(/^(@[^/]+\/[^/]+|[^/]+)\/([^/]+)$/);
          if (!parsed) { invalid += 1; continue; }
          const body = block.lines.join('\n');
          const flow = body.match(/^    resolution:\s*(\{[^\n]*\})\s*$/m)?.[1];
          const resolution = body.match(/^    resolution:\s*\n((?:^ {6,}[^\n]*\n?)+)/m)?.[1] || '';
          const flowFields = flow ? flatYamlMap(flow) : null;
          const url = flowFields ? flowFields.get('tarball') : resolution.match(/^ {6}tarball:\s*("[^"]*"|'[^']*'|[^,}\s]+)/m)?.[1];
          const revisionValue = flowFields ? flowFields.get('revision') : resolution.match(/^ {6}revision:\s*(.+)$/m)?.[1];
          const revision = revisionValue === undefined ? undefined : Number(scalar(revisionValue));
          if (revisionValue !== undefined && (!/^(?:0|[1-9]\d*)$/.test(scalar(revisionValue)) || !Number.isSafeInteger(revision))) throw unsupportedSyntax();
          const privateSource = /(?:^\s+|[,{]\s*)(?:type:\s*(?:git|directory)|repo:|directory:|private:\s*true)/m.test(body);
          const origin = classifyOrigin(url && scalar(url), 'npm', privateSource);
          // 正のrevisionは別配布物なので、通常のname/version照会へ縮約しない。
          add(`${documentIndex}:${block.key}`, parsed[1], parsed[2], 'npm', revision > 0 && origin === 'public' ? 'unknown' : origin,
            { pnpmDocument: documentIndex, resolutionRevision: revision });
        }
      }
    } else if (id === 'yarn') {
      const berry = /^__metadata:/m.test(content);
      for (const block of yamlBlocks(content, null, 0)) {
        if (block.key === '__metadata') continue;
        const body = block.lines.join('\n');
        if (!berry && /^  ["']/m.test(body)) throw unsupportedSyntax();
        if ((body.match(/^  (?:resolved|resolution)(?::|\s)/gm) || []).length > 1 || (body.match(/^  version(?::|\s)/gm) || []).length !== 1) throw unsupportedSyntax();
        const version = body.match(/^  version(?::|\s)\s*(.+)$/m)?.[1];
        let name = block.key.match(/^(@[^/]+\/[^@]+|[^@,]+)@/)?.[1];
        const aliased = block.key.match(/@npm:(@[^/]+\/[^@]+|[^@,]+)@/);
        if (!berry && aliased) name = aliased[1];
        const resolution = body.match(/^  (?:resolved|resolution)(?::|\s)\s*(.+)$/m)?.[1];
        let resolved = resolution && scalar(resolution);
        if (berry) {
          const actual = resolved?.match(/^(@[^/]+\/[^@]+|[^@]+)@npm:([^:]+)(?:::(?:__archiveUrl)=(.+))?$/);
          if (actual && actual[1] !== name) name = actual[1];
          const archive = actual?.[2] === (version && scalar(version)) ? actual?.[3] : undefined;
          resolved = archive ? decodeURIComponent(archive) : actual ? undefined : 'private:resolution';
        }
        add(block.key, name, version && scalar(version), 'npm', classifyOrigin(resolved, 'npm'));
      }
    } else if (id === 'bun') {
      const data = parseJsonc(content);
      if (![1, 2].includes(data.lockfileVersion) || !data.packages || Array.isArray(data.packages)) throw unsupportedSyntax();
      for (const [key, tuple] of Object.entries(data.packages)) {
        if (!Array.isArray(tuple) || tuple.length < 2 || tuple.length > 4) { invalid += 1; continue; }
        const parsed = tuple[0]?.match(/^(@[^/]+\/[^@]+|[^@]+)@(.+)$/);
        add(key, parsed?.[1], parsed?.[2], 'npm', classifyOrigin(tuple[1], 'npm'));
      }
    } else if (['cargo', 'poetry', 'uv'].includes(id)) {
      validateTomlSubset(content);
      const header = content.split(/^\[\[package\]\]\s*$/m)[0];
      const declared = header.match(/^version\s*=\s*(\d+)\s*$/m)?.[1];
      if ((header.match(/^version\s*=/gm) || []).length > 1) throw unsupportedSyntax();
      if (id === 'cargo' && declared && !['1', '2', '3', '4'].includes(declared) || id === 'uv' && declared !== '1') throw unsupportedSyntax();
      const poetrySchema = content.match(/^lock-version\s*=\s*"([^"\n]+)"\s*$/m)?.[1];
      if ((content.match(/^lock-version\s*=/gm) || []).length > 1) throw unsupportedSyntax();
      if (id === 'poetry' && poetrySchema && !/^[12]\.\d+$/.test(poetrySchema)) throw unsupportedSyntax();
      const blocks = content.split(/^\[\[package\]\]\s*$/m).slice(1);
      if (!blocks.length && !/\[\[package\]\]/.test(content)) throw unsupportedSyntax();
      let index = 0;
      for (const block of blocks) {
        const main = block.split(/^\[/m)[0];
        const sourceFields = (main.match(/^source\s*=/gm) || []).length;
        const sourceTables = (block.match(/^\[package\.source\]\s*$/gm) || []).length;
        if (sourceFields > 1 || sourceTables > 1 || sourceFields && sourceTables || id !== 'poetry' && sourceTables || id === 'poetry' && sourceFields) throw unsupportedSyntax();
        const name = tomlValue(main, 'name'), version = tomlValue(main, 'version');
        let origin = 'unknown';
        if (id === 'cargo') {
          const source = tomlValue(main, 'source');
          origin = /^(?:registry\+https:\/\/github\.com\/rust-lang\/crates\.io-index|sparse\+https:\/\/index\.crates\.io\/?)$/.test(source || '') ? 'public' : classifyOrigin(source, 'crates.io');
        } else if (id === 'uv') {
          const line = main.match(/^source\s*=\s*\{([^}\n]+)\}\s*$/m)?.[1];
          const registry = line?.match(/^\s*registry\s*=\s*("[^"]*"|'[^']*')\s*$/)?.[1];
          origin = registry ? classifyOrigin(scalar(registry), 'PyPI') : line ? 'private' : 'unknown';
        } else {
          const source = block.split(/^\[package\.source\]\s*$/m)[1]?.split(/^\[/m)[0];
          if (source) {
            const type = tomlValue(source, 'type');
            origin = ['git', 'directory', 'file'].includes(type) ? 'private' : ['legacy', 'url'].includes(type) ? classifyOrigin(tomlValue(source, 'url'), 'PyPI') : 'unknown';
          }
        }
        add(`${index++}`, name, version, id === 'cargo' ? 'crates.io' : 'PyPI', origin);
      }
    } else if (id === 'pipfile') {
      const data = strictJson(content);
      if (data._meta?.['pipfile-spec'] !== undefined && data._meta['pipfile-spec'] !== 6) throw unsupportedSyntax();
      if (!data._meta || !Object.hasOwn(data, 'default') && !Object.hasOwn(data, 'develop')) throw unsupportedSyntax();
      if (!Array.isArray(data._meta.sources)) throw unsupportedSyntax();
      const sources = new Map();
      for (const source of data._meta.sources) {
        if (!source || typeof source.name !== 'string' || sources.has(source.name)) throw unsupportedSyntax();
        sources.set(source.name, source.url);
      }
      for (const group of ['default', 'develop']) {
        for (const [name, pkg] of Object.entries(data[group] || {})) add(`${group}/${name}`, name, /^==(.+)$/.exec(pkg.version || '')?.[1], 'PyPI',
          pkg.path || pkg.git || pkg.file || pkg.editable ? 'private' : classifyOrigin(sources.get(pkg.index), 'PyPI'));
      }
    } else if (id === 'go') {
      for (const [index, line] of content.split('\n').entries()) {
        if (!line.trim()) continue;
        const parsed = line.match(/^(\S+)\s+(v\S+?)(?:\/go\.mod)?\s+h1:[A-Za-z0-9+/=]+$/);
        if (!parsed) throw unsupportedSyntax();
        add(index, parsed[1], parsed[2], 'Go');
      }
    } else if (id === 'requirements') {
      for (const [index, line] of content.split('\n').entries()) {
        const value = line.trim();
        if (!value || value.startsWith('#')) continue;
        if (value.startsWith('-')) { invalid += 1; continue; }
        const pinned = value.match(/^([A-Za-z0-9_.-]+)(?:\[[A-Za-z0-9_,.-]+\])?==([A-Za-z0-9.!+_-]+)(?:\s+--hash=sha256:[a-f0-9]+)*(?:\s*;.*)?$/);
        if (pinned) { add(index, pinned[1], pinned[2], 'PyPI'); continue; }
        const direct = value.match(/^([A-Za-z0-9_.-]+)\s+@\s+(https:\/\/\S+)$/);
        if (direct) {
          const wheel = new URL(direct[2]).pathname.split('/').at(-1)?.match(/^([A-Za-z0-9_]+)-([0-9][A-Za-z0-9.!+_]*)-(?:[^/]+)\.whl$/);
          if (wheel && wheel[1].replace(/_/g, '-').toLowerCase() === direct[1].replace(/[_.]/g, '-').toLowerCase()) add(index, direct[1], wheel[2], 'PyPI', classifyOrigin(direct[2], 'PyPI'));
          else invalid += 1;
        } else invalid += 1;
      }
    } else if (id === 'composer') {
      const data = strictJson(content);
      if (!Array.isArray(data.packages) || data['packages-dev'] !== undefined && !Array.isArray(data['packages-dev'])) throw unsupportedSyntax();
      for (const group of ['packages', 'packages-dev']) for (const [index, pkg] of (data[group] || []).entries()) {
        const origin = pkg.dist?.url && ['zip', 'tar'].includes(pkg.dist.type) ? classifyOrigin(pkg.dist.url, 'Packagist', pkg.private === true) : pkg.source ? 'git' : 'unknown';
        add(`${group}/${index}`, pkg.name, pkg.version, 'Packagist', origin);
      }
    } else if (id === 'gem') {
      let section = '', remotes = [], specs = false;
      for (const [index, line] of content.split('\n').entries()) {
        if (/^[A-Z][A-Z ]*$/.test(line)) { section = line; remotes = []; specs = false; continue; }
        const remote = line.match(/^  remote: (.+)$/)?.[1];
        if (remote) { if (specs) throw unsupportedSyntax(); remotes.push(remote); }
        if (line === '  specs:') specs = true;
        const pkg = line.match(/^    ([A-Za-z0-9_.-]+) \(([^)]+)\)$/);
        if (specs && pkg) add(index, pkg[1], pkg[2], 'RubyGems', section === 'GEM' && remotes.length === 1 ? classifyOrigin(remotes[0], 'RubyGems') : section === 'GIT' ? 'git' : section === 'PATH' ? 'local' : 'unknown');
      }
      if (!/^GEM|^GIT|^PATH/m.test(content)) throw unsupportedSyntax();
    } else if (id === 'gradle') {
      for (const [index, line] of content.split('\n').entries()) {
        if (!line.trim() || line.startsWith('#') || line.startsWith('empty=')) continue;
        const parsed = line.match(/^([A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+):([^=\s]+)=[A-Za-z0-9_,.\-]*$/);
        if (!parsed) throw unsupportedSyntax();
        add(index, `${parsed[1]}:${parsed[2]}`, parsed[3], 'Maven');
      }
    } else if (id === 'nuget') {
      const data = strictJson(content);
      if (![1, 2].includes(data.version) || !data.dependencies || Array.isArray(data.dependencies)) throw unsupportedSyntax();
      for (const [framework, entries] of Object.entries(data.dependencies)) for (const [name, pkg] of Object.entries(entries)) {
        if (['Direct', 'Transitive'].includes(pkg.type)) add(`${framework}/${name}`, name, pkg.resolved, 'NuGet');
        else if (pkg.type !== 'Project') invalid += 1;
      }
    } else if (id === 'nuget-config') {
      if (/<!DOCTYPE|<!ENTITY/i.test(content) || !/<packages(?:\s[^>]*)?>[\s\S]*<\/packages>/.test(content)) throw unsupportedSyntax();
      const tags = [...content.matchAll(/<package\s+([^>]+)\/\s*>/g)];
      const remaining = content.replace(/<\?xml[^>]*\?>/g, '').replace(/<!--[^]*?-->/g, '').replace(/<\/?packages(?:\s[^>]*)?>/g, '').replace(/<package\s+[^>]+\/\s*>/g, '').trim();
      if (remaining) throw unsupportedSyntax();
      for (const [index, tag] of tags.entries()) {
        const name = tag[1].match(/\bid="([^"&<>]+)"/)?.[1], version = tag[1].match(/\bversion="([^"&<>]+)"/)?.[1];
        add(index, name, version, 'NuGet');
      }
    } else if (id === 'dart') {
      if (!/^packages:\s*(?:\{\})?\s*$/m.test(content)) throw unsupportedSyntax();
      for (const block of yamlBlocks(content, 'packages', 2)) {
        const body = block.lines.join('\n');
        const version = body.match(/^    version:\s*(.+)$/m)?.[1];
        const source = body.match(/^    source:\s*(.+)$/m)?.[1];
        const description = body.match(/^    description:\s*\n((?:^ {6,}[^\n]*\n?)+)/m)?.[1] || '';
        const url = description.match(/^      url:\s*(.+)$/m)?.[1];
        const declaredName = description.match(/^      name:\s*(.+)$/m)?.[1];
        add(block.key, block.key, version && scalar(version), 'Pub', declaredName && scalar(declaredName) !== block.key ? 'unknown'
          : source && scalar(source) === 'hosted' ? classifyOrigin(url && scalar(url), 'Pub') : 'private');
      }
    } else if (id === 'swift') {
      const data = strictJson(content);
      if (![1, 2, 3].includes(data.version)) throw unsupportedSyntax();
      const pins = data.version === 1 ? data.object?.pins : data.pins;
      if (!Array.isArray(pins)) throw unsupportedSyntax();
      for (const [index, pin] of pins.entries()) add(index, pin.identity || pin.package, pin.state?.version, 'SwiftURL', 'git');
    }
    const packages = records.filter(record => record.queryEligible).map(({ name, version, ecosystem }) => ({ name, version, ecosystem }));
    const excluded = records.filter(record => record.policyExcluded).length;
    const unknown = records.filter(record => !record.queryEligible && !record.policyExcluded).length;
    const skipped = invalid + excluded + unknown;
    return { packages, records, skipped, excluded, unknown, invalid, status: invalid || unknown ? 'partial' : excluded ? 'complete-with-exclusions' : 'complete', format: format.id,
      reason: invalid || unknown ? '由来未確認・不正recordを未確認として保持。省略された既定registryは公開の根拠にしない'
        : excluded ? '解析済みのprivate/Git/local依存は方針上の対象外。公開由来の固定版だけを照会する' : 'recordに明記された公開配布先と固定版だけを抽出' };
  } catch (error) {
    return { packages: [], records: [], skipped: 0, status: 'unsupported', format: format.id,
      diagnostic: safeDiagnostic(error, 'FORMAT', 'packages'), reason: '形式・schema・上限を検証できないため、このファイルから送信しない' };
  }
}
