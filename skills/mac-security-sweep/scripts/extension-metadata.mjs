import { inflateRawSync } from 'node:zlib';
import { SweepError } from './diagnostics.mjs';
import { cleanText, safeIdentifier, safeVersion } from './inventory-projections.mjs';

const DESCRIPTOR_LIMIT = 128 * 1024;

/**
 * Recognize installed editor applications without confusing launch helpers with editors.
 * The report calls this to include editor versions even when no plugin was discovered.
 *
 * @param app - Projected application name and bundle identifier.
 * @returns Whether the record belongs to a known editor or IDE family.
 * @example
 * isEditorApplication({ name: 'Code', bundleId: 'com.microsoft.VSCode' });
 */
export function isEditorApplication(app) {
  return /^(?:com\.microsoft\.VSCode(?:Insiders)?|com\.todesktop\.230313mzl4w4u92|dev\.zed\.Zed(?:-Preview)?|com\.apple\.dt\.Xcode)$/i.test(app.bundleId || '')
    || /^com\.jetbrains\.(?:PhpStorm|WebStorm|intellij|pycharm|CLion|GoLand|rider|RustRover|datagrip|rubymine|dataspell)(?:\.|$)/i.test(app.bundleId || '')
    || /^(?:Visual Studio Code(?: - Insiders)?|Cursor|Zed(?: Preview)?|PhpStorm|WebStorm|IntelliJ IDEA|PyCharm|CLion|GoLand|Rider|RustRover|DataGrip|RubyMine|DataSpell|Xcode|Sublime Text|Emacs|Windsurf|Antigravity|Nova|BBEdit)$/i.test(app.name || '');
}

/**
 * Read only the literal identity fields in a Zed extension manifest.
 * The installed-extension reader calls this without evaluating TOML or extension code.
 *
 * @param text - A bounded extension.toml body; tables and unrelated fields are ignored.
 * @returns Projected identity metadata, or null when required fields are unsupported.
 * @example
 * parseZedManifest('id = "example"\nname = "Example"\nversion = "1.2.3"');
 */
export function parseZedManifest(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > DESCRIPTOR_LIMIT) return null;
  const fields = {};
  // Only root-level, single-line string literals establish an extension identity.
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) break;
    const match = /^\s*(id|name|version)\s*=\s*("(?:[^"\\]|\\["\\])*"|'[^']*')\s*(?:#.*)?$/.exec(line);
    if (!match) continue;
    if (Object.hasOwn(fields, match[1])) return null;
    try { fields[match[1]] = match[2].startsWith('"') ? JSON.parse(match[2]) : match[2].slice(1, -1); }
    catch { return null; }
  }
  return safeIdentifier(fields.id) && safeVersion(fields.version)
    ? { id: safeIdentifier(fields.id), name: cleanText(fields.name) || null, version: safeVersion(fields.version) } : null;
}

/**
 * Read direct identity children of an IntelliJ plugin descriptor.
 * The JetBrains reader calls this for plain or archived plugin.xml metadata.
 *
 * @param text - A bounded XML descriptor; DTDs, entities and ambiguous identities are rejected.
 * @returns Projected identity fields, or null for malformed or unsupported XML.
 * @example
 * parsePluginXml('<idea-plugin><id>org.example.plugin</id><version>1.2.3</version></idea-plugin>');
 */
export function parsePluginXml(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > DESCRIPTOR_LIMIT || /<!DOCTYPE|<!ENTITY/i.test(text)) return null;
  const stack = [], fields = {};
  let rootSeen = false, count = 0;
  const tokens = text.match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]*>|[^<]+/g) || [];
  // Parse bounded tag structure so nested dependency IDs cannot impersonate the plugin ID.
  for (const token of tokens) {
    if (++count > 10000 || stack.length > 50) return null;
    if (token.startsWith('<!--') || /^<\?xml\s[^?]*\?>$/.test(token)) continue;
    if (token.startsWith('<![CDATA[')) {
      if (stack.length === 2 && Object.hasOwn(fields, stack[1])) fields[stack[1]] += token.slice(9, -3);
      continue;
    }
    if (token.startsWith('</')) {
      const closing = /^<\/([\w:.-]+)\s*>$/.exec(token);
      if (!closing || stack.pop() !== closing[1]) return null;
    } else if (token.startsWith('<')) {
      const opening = /^<([\w:.-]+)(?:\s[^<>]*)?\s*\/?\s*>$/.exec(token);
      if (!opening || !stack.length && (rootSeen || opening[1] !== 'idea-plugin')) return null;
      if (!stack.length) rootSeen = true;
      if (stack.length === 1 && ['id', 'name', 'version'].includes(opening[1])) {
        if (Object.hasOwn(fields, opening[1])) return null;
        fields[opening[1]] = '';
      }
      if (!/\/\s*>$/.test(token)) stack.push(opening[1]);
    } else if (stack.length === 2 && Object.hasOwn(fields, stack[1])) fields[stack[1]] += token;
    else if (!stack.length && token.trim()) return null;
  }
  const decode = value => (value || '').replace(/&(?:amp|lt|gt|quot|apos);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[entity]).trim();
  const id = decode(fields.id || fields.name), name = decode(fields.name), version = decode(fields.version);
  return rootSeen && !stack.length && safeIdentifier(id) && safeVersion(version)
    ? { id: safeIdentifier(id), name: cleanText(name) || null, version: safeVersion(version) } : null;
}

/**
 * Validate ZIP entry integrity before trusting its descriptor metadata.
 * {@link pluginXmlFromJar} calls this only for the bounded decompressed descriptor.
 *
 * @param bytes - The descriptor bytes, never an entire decompressed archive.
 * @returns The unsigned ZIP CRC-32 checksum.
 * @example
 * descriptorCrc32(Buffer.from('descriptor'));
 */
function descriptorCrc32(bytes) {
  let crc = 0xffffffff;
  // ZIP uses the reflected IEEE polynomial rather than a cryptographic digest.
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Extract one bounded plugin descriptor from a JAR without writing or running its contents.
 * The JetBrains metadata reader supplies bytes read through the verified filesystem boundary.
 *
 * @param bytes - A regular JAR limited to 25 MiB by the caller.
 * @returns UTF-8 META-INF/plugin.xml, or null when this library JAR has no descriptor.
 * @throws {SweepError} For invalid, encrypted, multidisk, ZIP64 or oversized metadata.
 * @example
 * const xml = pluginXmlFromJar(jarBytes);
 */
export function pluginXmlFromJar(bytes) {
  const reject = () => { throw new SweepError('FORMAT', { cause: 'unsupported', operation: 'inventory' }); };
  if (!Buffer.isBuffer(bytes) || bytes.length < 22 || bytes.length > 25 * 1024 ** 2) return reject();
  let end = -1;
  // Search only the ZIP footer window; an embedded signature must also end at the archive boundary.
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (bytes.readUInt32LE(offset) === 0x06054b50 && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) { end = offset; break; }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) return reject();
  const entries = bytes.readUInt16LE(end + 10), length = bytes.readUInt32LE(end + 12), start = bytes.readUInt32LE(end + 16);
  if (entries > 2000 || entries !== bytes.readUInt16LE(end + 8) || start + length !== end) return reject();
  let offset = start, descriptor = null;
  // Read the central directory only; unrelated class/resource entries are never decompressed.
  for (let index = 0; index < entries; index++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) return reject();
    const nameLength = bytes.readUInt16LE(offset + 28), extra = bytes.readUInt16LE(offset + 30), comment = bytes.readUInt16LE(offset + 32);
    const next = offset + 46 + nameLength + extra + comment;
    if (next > end) return reject();
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (name === 'META-INF/plugin.xml') {
      if (descriptor !== null) return reject();
      const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10), crc = bytes.readUInt32LE(offset + 16);
      const compressed = bytes.readUInt32LE(offset + 20), expanded = bytes.readUInt32LE(offset + 24), local = bytes.readUInt32LE(offset + 42);
      if (flags & 1 || ![0, 8].includes(method) || expanded > DESCRIPTOR_LIMIT || compressed > DESCRIPTOR_LIMIT || local + 30 > start || bytes.readUInt16LE(offset + 34)) return reject();
      if (bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method) return reject();
      const localName = bytes.readUInt16LE(local + 26), localExtra = bytes.readUInt16LE(local + 28), dataStart = local + 30 + localName + localExtra;
      if (dataStart + compressed > start || bytes.subarray(local + 30, local + 30 + localName).toString('utf8') !== name) return reject();
      const packed = bytes.subarray(dataStart, dataStart + compressed);
      try { descriptor = method === 0 ? packed : inflateRawSync(packed, { maxOutputLength: DESCRIPTOR_LIMIT }); }
      catch { return reject(); }
      if (descriptor.length !== expanded || descriptorCrc32(descriptor) !== crc) return reject();
    }
    offset = next;
  }
  if (offset !== end) return reject();
  return descriptor?.toString('utf8') ?? null;
}
