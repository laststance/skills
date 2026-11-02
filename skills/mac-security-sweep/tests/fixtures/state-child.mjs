import { createStateStore } from '../../scripts/state-store.mjs';
import { randomUUID } from 'node:crypto';

const [home, boundary] = process.argv.slice(2);
const identityProvider = async pid => {
  try { process.kill(pid, 0); return { status: 'live', start: 'fixture-start', boot: 'fixture-boot' }; }
  catch (error) { return { status: error.code === 'ESRCH' ? 'dead' : 'unknown' }; }
};
try {
  const store = await createStateStore({ home, runId: randomUUID(), identityProvider,
    onBoundary: async point => { if (point === boundary) process.kill(process.pid, 'SIGKILL'); } });
  if (boundary === 'hold') {
    process.stdout.write('LOCKED\n');
    setInterval(() => {}, 1000);
  } else {
    await store.commit({ evidence: { positive: 'GHSA-fixture' }, report: '被害の有無: 未確認\n要対応件数: 1\n最優先: 確認', nextState: { lastRunStatus: 'partial', advisoryContinuation: { pendingIds: ['GHSA-fixture'], cache: [] } } });
    await store.close();
  }
} catch (error) {
  process.stdout.write(JSON.stringify({ code: error.diagnostic?.code || 'MSS_INTERNAL' }));
  process.exitCode = error.diagnostic?.code === 'MSS_LOCK' ? 75 : 1;
}
