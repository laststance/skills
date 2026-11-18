import test from 'node:test';
import assert from 'node:assert/strict';
import { parseZedManifest, parsePluginXml, pluginXmlFromJar } from '../scripts/extension-metadata.mjs';
import { pluginJar } from './fixtures/plugin-jar.mjs';

test('Zed inventory keeps root identity fields without retaining tokens or nested tool configuration', () => {
  // Arrange
  const manifest = 'id = "example"\nname = "Example"\nversion = "1.2.3"\nprivate_token = "DO_NOT_RETAIN"\n[language_servers.example]\nversion = "9.9.9"';
  // Act
  const result = parseZedManifest(manifest);
  // Assert
  assert.deepEqual(result, { id: 'example', name: 'Example', version: '1.2.3' });
  assert.equal(parseZedManifest('id = "example"\nversion = "1.2.3"\nversion = "2.0.0"'), null);
  assert.equal(JSON.stringify(result).includes('DO_NOT_RETAIN'), false);
});

test('JetBrains identity comes from root descriptor fields rather than nested dependency metadata', () => {
  // Arrange
  const descriptor = '<?xml version="1.0"?><idea-plugin><id>org.example.plugin</id><name>Example &amp; Tools</name><version>2.3.4</version><extensions><item><id>wrong.id</id></item></extensions><vendor email="DO_NOT_RETAIN">Vendor</vendor></idea-plugin>';
  // Act
  const result = parsePluginXml(descriptor);
  // Assert
  assert.deepEqual(result, { id: 'org.example.plugin', name: 'Example & Tools', version: '2.3.4' });
  assert.equal(JSON.stringify(result).includes('DO_NOT_RETAIN'), false);
});

test('malformed, entity-bearing and duplicate JetBrains identities remain unassessed', () => {
  // Arrange
  const descriptors = [
    '<!DOCTYPE idea-plugin [<!ENTITY data SYSTEM "file:///private">]><idea-plugin><id>org.example</id><version>1.0.0</version></idea-plugin>',
    '<idea-plugin><id>org.example</id><id>other</id><version>1.0.0</version></idea-plugin>',
    '<idea-plugin><id>org.example</version><version>1.0.0</version></idea-plugin>',
  ];
  // Act
  const results = descriptors.map(parsePluginXml);
  // Assert
  assert.deepEqual(results, [null, null, null]);
});

test('a plugin JAR exposes only its descriptor without decompressing unrelated resources', () => {
  // Arrange
  const jar = pluginJar([{ name: 'META-INF/plugin.xml', text: '<idea-plugin><id>org.example</id><version>1.0.0</version></idea-plugin>' },
    { name: 'DoNotRun.class', text: 'DO_NOT_RUN_OR_RETAIN', expanded: 0xffffffff }]);
  // Act
  const result = parsePluginXml(pluginXmlFromJar(jar));
  // Assert
  assert.deepEqual(result, { id: 'org.example', name: null, version: '1.0.0' });
  assert.equal(pluginXmlFromJar(pluginJar([{ name: 'library.class', text: 'ignored' }])), null);
});

test('encrypted, oversized, corrupt and duplicate JAR descriptors cannot establish an installed identity', () => {
  // Arrange
  const entry = { name: 'META-INF/plugin.xml', text: '<idea-plugin><id>org.example</id><version>1.0.0</version></idea-plugin>' };
  const archives = [pluginJar([{ ...entry, flags: 1 }]), pluginJar([{ ...entry, expanded: 200000 }]),
    pluginJar([{ ...entry, crc: 0 }]), pluginJar([entry, entry]), Buffer.from('not a jar')];
  // Act / Assert
  for (const archive of archives) assert.throws(() => pluginXmlFromJar(archive), error => error.diagnostic?.code === 'MSS_FORMAT');
});
