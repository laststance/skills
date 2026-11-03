#!/usr/bin/env node
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStateStore } from './state-store.mjs';
import { createSafeIO, LIMITS } from './safe-io.mjs';
import { validateProfile } from './configuration.mjs';
import { normalizeLanguage, localizeDiagnostic } from './locale.mjs';
import { SweepError, safeDiagnostic } from './diagnostics.mjs';

/** Commit a reviewed private draft against an existing report. This entry point never invokes collectors.
 * @example await deliverTranslation({generation, canonicalHash, language:'es', semanticReviewed:true})
 */
export async function deliverTranslation(options = {}) {
  const home = options.home || homedir();
  const language = normalizeLanguage(options.language);
  validateProfile(options.profile);
  if (!/^mss-[a-f0-9-]{36}-\d{6}$/.test(options.generation || '') || !/^[a-f0-9]{64}$/.test(options.canonicalHash || '') || ['ja', 'en'].includes(language) || options.semanticReviewed !== true) throw new SweepError('USAGE', { cause: 'malformed', operation: 'cli' });
  const store = await createStateStore({ home, profile: options.profile, filesystem: options.filesystem, identityProvider: options.identityProvider, onBoundary: options.onBoundary });
  try {
    const canonical = await store.canonicalReport(options.generation);
    const draftPath = path.join(canonical.directory, `translation-${language}.input.md`);
    const content = await createSafeIO({ home, filesystem: options.filesystem }).readText(draftPath, { roots: [canonical.directory], maxBytes: LIMITS.state });
    return await store.commitTranslation({ generation: options.generation, canonicalHash: options.canonicalHash, language, content, semanticReviewed: true });
  } finally { await store.close(); }
}

/** Parse only fixed translation options and print a safe receipt; caller review is an explicit attestation.
 * @example await runTranslationCli(['--help'])
 */
export async function runTranslationCli(args = process.argv.slice(2), options = {}) {
  const stdout = options.stdout || (value => process.stdout.write(`${value}\n`));
  const stderr = options.stderr || (value => process.stderr.write(`${value}\n`));
  try {
    if (args.length === 1 && args[0] === '--help') {
      stdout('Usage: node scripts/deliver-translation.mjs --generation ID --canonical-hash SHA256 --language es [--profile id] --semantic-reviewed\nRead the canonical report, translate it into translation-<language>.input.md in that generation directory, and review its meaning before delivery. No scan or network collection is repeated.');
      return 0;
    }
    const parsed = {};
    const names = { '--generation': 'generation', '--canonical-hash': 'canonicalHash', '--language': 'language', '--profile': 'profile' };
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === '--semantic-reviewed' && !parsed.semanticReviewed) { parsed.semanticReviewed = true; continue; }
      const key = names[args[index]];
      if (!key || parsed[key] !== undefined || !args[index + 1] || args[index + 1].startsWith('--')) throw new SweepError('USAGE', { cause: 'malformed', operation: 'cli' });
      parsed[key] = args[++index];
    }
    stdout(JSON.stringify(await deliverTranslation({ ...options, ...parsed })));
    return 0;
  } catch (error) {
    const detail = localizeDiagnostic(safeDiagnostic(error, 'INTERNAL', 'cli'), 'en');
    stderr(`${detail.code} (${detail.operation}): ${detail.message} ${detail.recovery}`);
    stdout(JSON.stringify({ translationStatus: 'pending', diagnostic: detail }));
    return detail.code === 'MSS_USAGE' || detail.code === 'MSS_STATE' ? 64 : detail.code === 'MSS_LOCK' ? 75 : 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await runTranslationCli();
