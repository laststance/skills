import { SweepError } from './diagnostics.mjs';

const EN_DIAGNOSTICS = Object.freeze({
  USAGE: ['Invalid command-line options.', 'Run node scripts/run-sweep.mjs --help for accepted options.'],
  CONFIG: ['The configuration format could not be verified.', 'Check the documented types and limits. Preserve existing values when correcting the configuration.'],
  STATE: ['The saved continuation could not be read safely.', 'Keep the state unchanged and check the skill version and saved report.'],
  BOUNDARY: ['The permitted read boundary could not be verified.', 'Check the configured target and its resolved location. Links and authentication stores are excluded.'],
  READ: ['Required metadata could not be read.', 'Treat the target as unassessed and check that it is a regular local file. Do not change permissions.'],
  FORMAT: ['The metadata format is unsupported or invalid.', 'Check the format support table. Leave the source file unchanged.'],
  TOOL: ['A trusted existing helper tool could not be verified.', 'Use the static metadata results and check the remaining gaps. No tool is installed automatically.'],
  COMMAND: ['A read-only command did not finish.', 'Check the saved gaps. Retry once when the underlying condition has changed.'],
  HTTP: ['Public information could not be retrieved.', 'Keep the saved continuation. Retry after the recorded cooldown or provider recovery.'],
  TOKEN: ['The public API continuation could not be verified.', 'Keep the unfinished query and check it during the next normal run.'],
  SOURCE: ['The source format or freshness could not be verified.', 'Check the source receipt and missing period. Schema failures require an adapter correction before retrying.'],
  READER: ['Some environment metadata remains unassessed.', 'Check the support table and recorded gaps. Do not change permissions or authentication settings.'],
  SOCKET: ['An allowed local container connection could not be verified.', 'Treat image contents as unassessed. Do not start containers or connect to remote engines.'],
  SBOM: ['The SBOM origin or image binding could not be verified.', 'Check the existing SBOM format and image digest. Do not generate a new image scan.'],
  IOC: ['The indicator rule or its review date could not be verified.', 'Check the primary source and verification date. Unverified rules are not executed.'],
  LOCK: ['Another run or an unverified owner holds the lock.', 'Wait for the active run to finish, then retry once. Use the recovery guide if the owner is unknown.'],
  SAVE: ['The report and continuation could not be saved.', 'Preserve the previous state. Check free space and the recovery guide; the next run reconciles saved generations.'],
  CAPACITY: ['A processing or storage limit was reached.', 'Keep the deferred work. Resume it within the documented limits; check target configuration if state capacity is exhausted.'],
  DEADLINE: ['The collection deadline was reached.', 'Read the saved partial report and resume the normal sweep when needed.'],
  TRANSLATION_PENDING: ['The requested-language report has not been delivered.', 'Translate the saved canonical report and commit that translation. Do not repeat the scan.'],
  INTERNAL: ['Processing could not continue safely.', 'Report only the diagnostic ID and skill version. Do not share raw configuration, logs or state.'],
});

/**
 * Validate a requested language before any scan or state write starts.
 * The CLI and host-language resolver use the same grammar so malformed options cannot become paths.
 *
 * @throws {SweepError} When the value is missing, malformed or too long.
 * @example
 * normalizeLanguage('EN'); // 'en'
 */
export function normalizeLanguage(value) {
  if (typeof value !== 'string' || value.length > 63 || !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value)) {
    throw new SweepError('USAGE', { cause: 'malformed', operation: 'cli' });
  }
  let normalized;
  try { [normalized] = Intl.getCanonicalLocales(value); }
  catch { throw new SweepError('USAGE', { cause: 'malformed', operation: 'cli' }); }
  const primary = normalized.split('-')[0];
  // Native renderers deliberately share the same text across regional variants.
  return ['ja', 'en'].includes(primary) ? primary : normalized;
}

/**
 * Select the explicit override, conversation language, saved preference, then Japanese CLI default.
 * The runner calls this before collection; other languages require a separate host translation.
 *
 * @example
 * resolveLanguage({ conversation: 'es' });
 */
export function resolveLanguage({ explicit, conversation, saved } = {}) {
  const requestedLanguage = normalizeLanguage(explicit ?? conversation ?? saved ?? 'ja');
  const native = ['ja', 'en'].includes(requestedLanguage);
  return { requestedLanguage, canonicalLanguage: native ? requestedLanguage : 'en', translationStatus: native ? 'not-required' : 'pending' };
}

/**
 * Localize finite diagnostic messages without reading an exception or untrusted explanation.
 * CLI and report presenters call this after the diagnostic has been projected by its owner.
 *
 * @example
 * localizeDiagnostic({ code: 'MSS_HTTP', cause: 'cooldown' }, 'en');
 */
export function localizeDiagnostic(diagnostic, language = 'ja') {
  if (language === 'ja') return diagnostic;
  const key = String(diagnostic?.code || '').replace(/^MSS_/, '');
  const [message, recovery] = EN_DIAGNOSTICS[key] || EN_DIAGNOSTICS.INTERNAL;
  return { ...diagnostic, message, recovery };
}
