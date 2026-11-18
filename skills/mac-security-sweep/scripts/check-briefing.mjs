#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessedNews, publicAdvisoryIds, selectBriefingAdvisories } from './briefing.mjs';
import { escapeReportText, safeSourceUrl } from './report.mjs';
import { boundedJson, createSafeIO, LIMITS, within } from './safe-io.mjs';

/**
 * チャット原稿の可視本文に優先告知があるかを提出直前に調べる。影響判定の意味は人が確認する。
 * {@link runBriefingCli} が呼び、不足を公開IDと無番号記事の件数だけで返す。
 * @example checkBriefing(required, 'CVE-2026-1234 の対象版は未確認。')
 */
export function checkBriefing(required, draft) {
  const lines = [], withoutComments = draft.replace(/<!--[\s\S]*?(?:-->|$)/g, '');
  let fence = '';
  // コメント・コード例・リンク定義は読者向けの判定本文として数えない。
  for (const line of withoutComments.split(/\r?\n/)) {
    const marker = /^[ \t]*([\x60]{3,}|~{3,})(.*)$/.exec(line);
    if (marker && !fence) { fence = marker[1]; continue; }
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = '';
      continue;
    }
    if (!/^\s*\[[^\]]+\]:\s*\S/.test(line)) lines.push(line);
  }
  const visible = lines.join('\n');
  const prose = visible.replace(/\]\(https?:\/\/[^\s)]*\)/gi, ']').replace(/https?:\/\/[^\s<>)]+/gi, '');
  const present = new Set(publicAdvisoryIds(prose));
  const links = new Set((visible.match(/https:\/\/[^\s<>)\]]+/g) || []).map(safeSourceUrl).filter(Boolean));
  const missingIds = [];
  let missingArticles = 0;
  for (const { id, item, sharedUrl } of required) {
    if (id) {
      if (!present.has(id)) missingIds.push(id);
      continue;
    }
    // 未採番の記事は許可済みの同一出典か原見出しで識別し、内部のフィードIDをチャットに出さない。
    const title = item.title?.trim();
    const cited = !sharedUrl && links.has(safeSourceUrl(item.url));
    if (!cited && !(title && (prose.includes(title) || prose.includes(escapeReportText(title, 260))))) missingArticles++;
  }
  return { required: required.length, missingIds, missingArticles };
}

/**
 * 保存済み世代の証拠ハッシュを照合し、標準入力の提出原稿を読み取り専用で検査する。
 * 正規・補足どちらの世代でもstateを開かず、秘密値や生の入力を出力しない。
 * @returns 0 は全件掲載、2 は掲載漏れまたは未照合、64 は引数誤り。
 * @example await runBriefingCli(['--evidence', evidencePath])
 */
export async function runBriefingCli(args, { home = homedir(), input = process.stdin, output = line => console.log(line) } = {}) {
  if (args.length === 1 && args[0] === '--help') {
    output('node scripts/check-briefing.mjs --evidence /absolute/path/to/evidence.json < chat-draft.md');
    return 0;
  }
  const [flag, filename] = args, root = path.join(home, 'security-reports');
  if (args.length !== 2 || flag !== '--evidence' || !path.isAbsolute(filename) || !within(root, filename) || path.basename(filename) !== 'evidence.json') {
    output('MSS_USAGE: 保存済み世代の evidence.json の絶対パスを指定してください。');
    return 64;
  }
  if (input.isTTY) { output('MSS_USAGE: 掲載する原稿を標準入力に渡してください。'); return 64; }
  try {
    const io = createSafeIO({ home }), options = { roots: [root], maxBytes: LIMITS.state };
    const commit = await io.readJson(path.join(path.dirname(filename), 'commit.json'), { ...options, maxBytes: 8192 });
    const bytes = await io.readBytes(filename, options);
    if (commit.evidence?.name !== 'evidence.json' || commit.evidence.hash !== createHash('sha256').update(bytes).digest('hex')) throw new Error();
    const evidence = boundedJson(bytes.toString('utf8'), { maxRecords: LIMITS.stateRecords });
    if (!Array.isArray(evidence.news?.items) && !Array.isArray(evidence.match?.newsAssessment)) throw new Error();
    const required = selectBriefingAdvisories(assessedNews(evidence.news, evidence.match), evidence.details?.details, evidence.news?.knownExploitedIds);
    const chunks = [];
    let size = 0;
    for await (const chunk of input) {
      size += Buffer.byteLength(chunk);
      if (size > LIMITS.metadata) throw new Error();
      chunks.push(Buffer.from(chunk));
    }
    const draft = Buffer.concat(chunks).toString('utf8');
    if (!draft.trim()) throw new Error();
    const result = checkBriefing(required, draft);
    output(JSON.stringify(result));
    return result.missingIds.length || result.missingArticles ? 2 : 0;
  } catch {
    output('MSS_BRIEFING_UNVERIFIED: 証拠の整合性または原稿を確認できません。');
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await runBriefingCli(process.argv.slice(2));
