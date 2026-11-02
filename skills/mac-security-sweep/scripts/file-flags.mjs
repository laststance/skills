import { execFile } from 'node:child_process';
import { SweepError } from './diagnostics.mjs';

const SF_DATALESS = 0x40000000;
const waiting = [];
let active = 0;

/** state読取でも固定statだけを最大4並列で実行する。runtimeでは共有command poolへ置換する。 @example nativeStat('/Users/example') */
async function nativeStat(filename, signal) {
  if (active >= 4) await new Promise(resolve => waiting.push(resolve));
  else active += 1;
  try {
    if (signal?.aborted) throw new Error('aborted');
    return await new Promise((resolve, reject) => {
      execFile('/usr/bin/stat', ['-f', '%d:%i:%f', filename], {
        shell: false, timeout: 1000, killSignal: 'SIGKILL', maxBuffer: 1024, signal,
        env: { PATH: '/usr/bin:/bin', LANG: 'C' },
      }, (error, stdout) => error ? reject(error) : resolve({ code: 0, stdout }));
    });
  } finally { if (waiting.length) waiting.shift()(); else active -= 1; }
}

/** macOSの実st_flagsを確認し、datalessの祖先や本文をmaterializeしない。safe IOが子の探索前に呼ぶ。 @example const checkLocal = createLocalityGuard(); await checkLocal(file, stat); */
export function createLocalityGuard({ platform = process.platform, signal, runStat = filename => nativeStat(filename, signal) } = {}) {
  const cache = new Map();
  return async (filename, metadata) => {
    if (/\.icloud$/i.test(filename) || metadata.isPlaceholder || metadata.isEvicted || (metadata.flags & SF_DATALESS)) throw new SweepError('READ', { cause: 'not-local', operation: 'read' });
    if (platform !== 'darwin') return;
    // ctimeを含むmetadataが変わった場合は、以前のlocal判定を再利用しない。
    const key = `${filename}:${metadata.dev}:${metadata.ino}:${metadata.mode}:${metadata.size}:${metadata.mtimeMs}:${metadata.ctimeMs}`;
    if (!cache.has(key)) {
      if (cache.size >= 30000) cache.delete(cache.keys().next().value);
      cache.set(key, (async () => {
        try {
          const result = await runStat(filename), match = /^(\d+):(\d+):(\d+)\s*$/.exec(result.stdout || '');
          if (result.code !== 0 || !match || Number(match[1]) !== metadata.dev || Number(match[2]) !== metadata.ino || (Number(match[3]) & SF_DATALESS)) throw new Error('unconfirmed');
        } catch {
          // 取得不能・identity不一致もlocalと推測しない。例外本文は保存しない。
          throw new SweepError('READ', { cause: 'not-local', operation: 'read' });
        }
      })());
    }
    try { await cache.get(key); } catch (error) { cache.delete(key); throw error; }
  };
}
