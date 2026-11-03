import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { assertMarkupBudget } from '../scripts/markup-budget.mjs';
import { parseXmlFeed, plain } from '../scripts/fetch-news.mjs';

const SOURCE = { id: 'php', name: 'PHP News', url: 'https://www.php.net/feed.atom', categories: ['php'] };

test('Repeated unclosed XML entries fail before block extraction at both ordinary and tenfold size', t => {
  // Arrange
  for (const count of [10000, 100000]) {
    const text = `<rss>${'<item>'.repeat(count)}</rss>`;
    const started = performance.now();
    // Act / Assert
    assert.throws(() => parseXmlFeed(text, SOURCE), error => error.diagnostic.code === 'MSS_SOURCE');
    t.diagnostic(`Rejected ${count} unclosed tags (${Buffer.byteLength(text)} bytes) in ${(performance.now() - started).toFixed(3)} ms`);
  }
});

test('Repeated unclosed HTML links and tables fail before regex-based index parsing', () => {
  // Arrange
  for (const tag of ['a', 'tr', 'table', 'h2']) {
    // Act / Assert
    assert.throws(() => assertMarkupBudget(`<html>${`<${tag}>`.repeat(100000)}</html>`));
  }
});

test('CDATA tag-looking text and correctly balanced feed entries remain readable', () => {
  // Arrange
  const text = '<rss><channel><item><title><![CDATA[Example <b>release</b>]]></title><description><![CDATA[<item> is literal data]]></description></item></channel></rss>';
  // Act
  const result = parseXmlFeed(text, SOURCE);
  // Assert
  assert.equal(result[0].title, 'Example release');
  assert.equal(result[0].summary, 'is literal data');
});

test('Text cleanup handles a long unclosed script sequence without retaining executable markup', t => {
  // Arrange
  const value = `Before ${'<script>'.repeat(100000)}SENTINEL`; const started = performance.now();
  // Act
  const result = plain(value);
  // Assert
  assert.equal(result, 'Before');
  t.diagnostic(`Cleaned ${Buffer.byteLength(value)} bytes in ${(performance.now() - started).toFixed(3)} ms`);
});


test('A vendor stray HTML closing style is tolerated while mismatched XML record closure is rejected', () => {
  // Arrange / Act / Assert
  assert.doesNotThrow(() => assertMarkupBudget('<style>.example{color:red}</style></style><table><tr></tr></table>'));
  assert.throws(() => assertMarkupBudget('<rss><item>example</entry></rss>'));
});
