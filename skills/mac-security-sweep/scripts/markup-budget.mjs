import { SweepError } from './diagnostics.mjs';

/** Bound markup work before block regexes; public-source parsers call this on whole responses.
 * CDATA/comments are skipped as data, while repeated unclosed tags fail in a single pass.
 * @example assertMarkupBudget(xml)
 */
export function assertMarkupBudget(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 6 * 1024 ** 2) throw new SweepError('CAPACITY', { cause: 'limit', operation: 'news' });
  const tokens = /<!\[CDATA\[|<!--|<\/?(?:item|entry|a|tr|table|h[1-6]|script|style)\b/gi;
  const open = new Map();
  let count = 0, match;
  while ((match = tokens.exec(text))) {
    if (++count > 30000) throw new SweepError('CAPACITY', { cause: 'limit', operation: 'news' });
    if (match[0] === '<![CDATA[' || match[0] === '<!--') {
      const marker = match[0] === '<!--' ? '-->' : ']]>';
      const end = text.indexOf(marker, tokens.lastIndex);
      if (end < 0) throw new SweepError('SOURCE', { cause: 'malformed', operation: 'news' });
      tokens.lastIndex = end + marker.length; continue;
    }
    const end = text.indexOf('>', tokens.lastIndex);
    if (end < 0) throw new SweepError('SOURCE', { cause: 'malformed', operation: 'news' });
    const name = match[0].replace(/^<\/?/, '').toLowerCase();
    const closing = match[0].startsWith('</'), selfClosing = /\/\s*$/.test(text.slice(tokens.lastIndex, end));
    const rawDepth = (open.get(name) || 0) + (closing ? -1 : selfClosing ? 0 : 1);
    // Vendor HTML can contain stray closing tags (observed Apple style); XML records remain strict.
    const depth = rawDepth < 0 && !['item', 'entry'].includes(name) ? 0 : rawDepth;
    if (depth < 0 || depth > (['item', 'entry', 'a', 'script', 'style'].includes(name) ? 1 : 32)) throw new SweepError('SOURCE', { cause: 'malformed', operation: 'news' });
    open.set(name, depth); tokens.lastIndex = end + 1;
    // Script/style text is not markup and may contain tag-looking strings.
    if (!closing && !selfClosing && ['script', 'style'].includes(name)) {
      const closePattern = new RegExp(`</${name}\\s*>`, 'gi'); closePattern.lastIndex = tokens.lastIndex;
      const close = closePattern.exec(text);
      if (!close) throw new SweepError('SOURCE', { cause: 'malformed', operation: 'news' });
      open.set(name, 0); tokens.lastIndex = close.index + close[0].length;
    }
  }
  if ([...open.values()].some(value => value !== 0)) throw new SweepError('SOURCE', { cause: 'malformed', operation: 'news' });
}
