import { SweepError } from './diagnostics.mjs';
import { LIMITS } from './safe-io.mjs';
import { safeSourceUrl } from './report.mjs';

/**
 * Extract the renderer's inline links without accepting another active Markdown link syntax.
 * {@link validateTranslationContent} calls this for both texts before committing a derivative.
 *
 * @returns The literal destinations, or null when the text contains unsupported link syntax.
 * @example
 * translationDestinations('[Evidence](evidence.json)');
 */
function translationDestinations(text) {
  const destinations = [];
  const inline = /\[(?:\\.|[^\[\]\r\n\\])*\]\(([^()\s\\<>]+)\)/y;
  for (let index = 0; index < text.length; index += 1) {
    // CommonMark escapes punctuation in pairs; an even number of backslashes leaves a link active.
    if (text[index] === '\\' && /[!-/:-@[-`{-~]/.test(text[index + 1] || '')) { index += 1; continue; }
    if (text[index] === '!' && text[index + 1] === '[' || text[index] === '<' || text[index] === ']') return null;
    if (text[index] !== '[') continue;
    inline.lastIndex = index;
    const match = inline.exec(text);
    // Reference links and definitions are not emitted by the canonical renderer.
    if (!match) return null;
    destinations.push(match[1]);
    index = inline.lastIndex - 1;
  }
  return destinations;
}

/** Validate mechanical translation integrity before the store accepts a host-reviewed derivative.
 * Meaning still requires host review; identifiers and output syntax are checked here.
 * @example validateTranslationContent(canonicalReport, translatedReport)
 */
export function validateTranslationContent(canonical, translated) {
  const reject = () => { throw new SweepError('TRANSLATION_PENDING', { cause: 'mismatch', operation: 'report' }); };
  if (typeof canonical !== 'string' || typeof translated !== 'string' || !translated.trim() || Buffer.byteLength(translated) > LIMITS.state) reject();
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(canonical + translated)) reject();
  const sameTokens = (left, right) => JSON.stringify(left.toSorted()) === JSON.stringify(right.toSorted());
  const urls = text => text.match(/\b(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>\])]+/g) || [];
  const originalUrls = urls(canonical), translatedUrls = urls(translated);
  if (!sameTokens(originalUrls, translatedUrls) || originalUrls.some(url => !safeSourceUrl(url))) reject();
  const originalDestinations = translationDestinations(canonical), translatedDestinations = translationDestinations(translated);
  if (!originalDestinations || !translatedDestinations || !sameTokens(originalDestinations, translatedDestinations)) reject();
  // Same-generation artifacts are the only permitted local destinations; never normalize traversal.
  const localArtifacts = new Set(['evidence.json', 'continuation.json', 'report.md', 'commit.json']);
  for (const destination of originalDestinations) {
    if (!localArtifacts.has(destination) && !safeSourceUrl(destination)) reject();
  }
  // Evidence IDs, dates, versions and counts must survive translation exactly; this does not prove semantics.
  const identifiers = text => text.match(/\b(?:CVE-\d{4}-\d{4,}|GHSA-[a-z0-9]+(?:-[a-z0-9]+)+|\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z)?)\b/g) || [];
  const originalIdentifiers = identifiers(canonical), translatedIdentifiers = identifiers(translated);
  if (!sameTokens(originalIdentifiers, translatedIdentifiers)) reject();
  const retained = new Set(originalIdentifiers);
  const numbers = text => text.match(/(?<![\p{L}\p{N}])\d+(?:[.:/-]\d+)*(?![\p{L}\p{N}])/gu) || [];
  const originalNumbers = numbers(canonical), translatedNumbers = numbers(translated);
  if (!sameTokens(originalNumbers, translatedNumbers)) reject();
  for (const token of originalNumbers) retained.add(token);
  if ([...retained].some(token => !translated.includes(token))) reject();
  return { identifiersChecked: retained.size, sourceLinksChecked: new Set(originalUrls).size, semanticReviewRequired: true };
}
