import { deliverTranslation } from '../../scripts/deliver-translation.mjs';

const [home, generation, canonicalHash, boundary] = process.argv.slice(2);
const identityProvider = async pid => {
  try { process.kill(pid, 0); return { status: 'live', start: 'fixture-start', boot: 'fixture-boot' }; }
  catch (error) { return { status: error.code === 'ESRCH' ? 'dead' : 'unknown' }; }
};
try {
  await deliverTranslation({ home, generation, canonicalHash, language: 'es', semanticReviewed: true, identityProvider,
    onBoundary: async point => { if (point === boundary) process.kill(process.pid, 'SIGKILL'); } });
} catch (error) {
  process.stdout.write(JSON.stringify({ code: error.diagnostic?.code || 'MSS_INTERNAL' }));
  process.exitCode = 1;
}
