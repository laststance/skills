import { SweepError } from './diagnostics.mjs';
import { LIMITS } from './safe-io.mjs';

/** Validate mechanical translation integrity before the store accepts a host-reviewed derivative.
 * Meaning still requires host review; identifiers and output syntax are checked here.
 * @example validateTranslationContent(canonicalReport, translatedReport)
 */
export function validateTranslationContent(canonical, translated) {
  const reject = () => { throw new SweepError('TRANSLATION_PENDING', { cause: 'mismatch', operation: 'report' }); };
  if (typeof canonical !== 'string' || typeof translated !== 'string' || !translated.trim() || Buffer.byteLength(translated) > LIMITS.state) reject();
  // Preserve literal report data; never let translated prose introduce active resource embeds.
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(translated) || /(?<!\\)!\[|<!--|<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^>]*|\/?)>/.test(translated)) reject();
  const urls = text => new Set(text.match(/https:\/\/[^\s<>\])]+/g) || []);
  const originalUrls = urls(canonical), translatedUrls = urls(translated);
  if ([...originalUrls].some(url => !translatedUrls.has(url)) || [...translatedUrls].some(url => !originalUrls.has(url))) reject();
  const destinations = text => new Set([...text.matchAll(/(?<!\\)\]\(([^)]+)\)/g)].map(match => match[1]));
  const originalDestinations = destinations(canonical), translatedDestinations = destinations(translated);
  if ([...originalDestinations].some(url => !translatedDestinations.has(url)) || [...translatedDestinations].some(url => !originalDestinations.has(url))) reject();
  // Evidence IDs, dates, versions and counts must survive translation exactly; this does not prove semantics.
  const retained = new Set(canonical.match(/\b(?:CVE-\d{4}-\d{4,}|GHSA-[a-z0-9]+(?:-[a-z0-9]+)+|\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z)?)\b/g) || []);
  const numbers = text => new Set(text.match(/(?<![\p{L}\p{N}])\d+(?:[.:/-]\d+)*(?![\p{L}\p{N}])/gu) || []);
  const originalNumbers = numbers(canonical), translatedNumbers = numbers(translated);
  if ([...originalNumbers].some(token => !translatedNumbers.has(token)) || [...translatedNumbers].some(token => !originalNumbers.has(token))) reject();
  for (const token of originalNumbers) retained.add(token);
  if ([...retained].some(token => !translated.includes(token))) reject();
  return { identifiersChecked: retained.size, sourceLinksChecked: originalUrls.size, semanticReviewRequired: true };
}
