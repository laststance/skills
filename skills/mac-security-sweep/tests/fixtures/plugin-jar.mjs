import { deflateRawSync } from 'node:zlib';

/**
 * Build small synthetic ZIPs for descriptor readers without starting Java or a ZIP executable.
 * Extension metadata tests call this with fixture-only text and optional corrupt header fields.
 *
 * @param entries - Named fixture resources, with optional unsupported flags or declared lengths.
 * @returns A complete in-memory ZIP archive.
 * @example
 * const jar = pluginJar([{ name: 'META-INF/plugin.xml', text: '<idea-plugin />' }]);
 */
export function pluginJar(entries) {
  const locals = [], central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name), raw = Buffer.from(entry.text), packed = deflateRawSync(raw);
    let crc = 0xffffffff;
    for (const byte of raw) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) * 0xedb88320);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30), record = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(entry.flags || 0, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(entry.expanded ?? raw.length, 22); local.writeUInt16LE(name.length, 26);
    record.writeUInt32LE(0x02014b50); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(entry.flags || 0, 8); record.writeUInt16LE(8, 10);
    record.writeUInt32LE(entry.crc ?? crc, 16); record.writeUInt32LE(packed.length, 20); record.writeUInt32LE(entry.expanded ?? raw.length, 24); record.writeUInt16LE(name.length, 28); record.writeUInt32LE(offset, 42);
    locals.push(local, name, packed); central.push(record, name); offset += local.length + name.length + packed.length;
  }
  const directory = Buffer.concat(central), footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50); footer.writeUInt16LE(entries.length, 8); footer.writeUInt16LE(entries.length, 10); footer.writeUInt32LE(directory.length, 12); footer.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, footer]);
}
