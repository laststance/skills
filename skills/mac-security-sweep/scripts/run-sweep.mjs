#!/usr/bin/env node
import { mkdir, writeFile, readFile, rename, lstat, realpath, chmod } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { advisoryKind, assessmentStatus, coverageKind, compareAssessments, prioritizeFindings } from './assessment.mjs';

const execute = promisify(execFile);
const SKILL = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * 未信頼の公開文をMarkdown表の安全なセルにする。レポート生成から呼ぶ。
 * @returns 制御文字・HTML・表区切りを無害化した短い文字列。
 * @example
 * cell('パッケージ | 1.0.0')
 */
function cell(value, limit = 350) {
  return String(value ?? '未確認').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '\\|').replace(/\[/g, '\\[').replace(/\]/g, '\\]').slice(0, limit);
}

/**
 * 日本時間でレポートの日付を決める。ホストのタイムゾーンに依存させない。
 * @returns YYYY-MM-DD 形式の日付。
 * @example
 * jstDate(new Date('2026-10-30T23:00:00Z'))
 */
export function jstDate(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/**
 * 既存JSONを秘密値のエラーなしで読む。状態の復旧とテストから呼ぶ。
 * @returns JSONオブジェクト。読めない場合は空オブジェクト。
 */
async function readJson(filename) {
  try { return JSON.parse(await readFile(filename, 'utf8')); } catch { return {}; }
}

/**
 * 保存先を利用者専用ディレクトリにする。巡回開始時にだけ呼ぶ。
 * @throws シンボリックリンクや通常ディレクトリ以外を指定した場合。
 */
async function privateDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error('安全な保存先ではありません');
  // 出力用ディレクトリの既存権限も、利用者だけに限定する。
  await chmod(directory, 0o700);
}

/**
 * 既存データを上書きせず証拠を保存する。巡回の各工程完了時に呼ぶ。
 * @returns 保存した絶対パス。
 */
async function saveJson(directory, name, value) {
  const filename = path.join(directory, name);
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  return filename;
}

/**
 * 各補助CLIを別プロセスで有限時間だけ動かす。巡回の段階ごとに呼ぶ。
 * @param deadline - 巡回全体の上限。子プロセスの上限より短ければ優先する。
 * @returns JSONまたは失敗を示すカバレッジ。生の例外・stderrは残さない。
 */
async function runStage(name, args, maximum, deadline) {
  const started = Date.now();
  const command = `node scripts/${name}.mjs ${args.map(value => JSON.stringify(value)).join(' ')}`.trim();
  const timeout = Math.min(maximum, deadline - started);
  if (timeout < 1000) return { schemaVersion: 1, coverage: [{ area: name, status: 'unavailable', reason: '巡回の時間上限' }], commands: [{ command, status: 'unavailable', elapsedMs: 0 }], error: '時間上限' };
  try {
    const { stdout } = await execute(process.execPath, [path.join(SKILL, 'scripts', `${name}.mjs`), ...args], {
      timeout, killSignal: 'SIGKILL', maxBuffer: 128 * 1024 * 1024,
      env: { PATH: process.env.PATH, HOME: homedir(), TMPDIR: process.env.TMPDIR || '/tmp', LANG: 'en_US.UTF-8', TZ: 'Asia/Tokyo' },
    });
    const result = JSON.parse(stdout);
    if (!result || typeof result !== 'object' || result.error) throw new Error('工程未完了');
    result.commands = [...(result.commands || []), { command, status: 'complete', elapsedMs: Date.now() - started }];
    return result;
  } catch {
    return { schemaVersion: 1, error: '工程を完了できませんでした', coverage: [{ area: name, status: 'unavailable', reason: '終了失敗・タイムアウト・JSON形式不正のいずれか。秘密保護のため生の出力は非保存' }], commands: [{ command, status: 'unavailable', elapsedMs: Date.now() - started }] };
  }
}

/**
 * 公開OSV IDから修正版などの表示情報を補う。照合後に最大80件だけ呼ぶ。
 * @returns 公開情報の必要な項目だけ。ローカルのパス等を送信しない。
 */
export async function enrichAdvisories(findings, deadline, fetchImpl = fetch, options = {}) {
  const started = Date.now();
  const metadata = new Map((options.news?.items || []).map(item => [item.id, item]));
  const knownExploited = new Set(options.news?.knownExploitedIds || []);
  // stateからも公開詳細の許可フィールドだけを復元し、余分な設定・秘密値を転載しない。
  const cached = (Array.isArray(options.previous?.cache) ? options.previous.cache : []).filter(detail => detail && /^[A-Za-z0-9][A-Za-z0-9._-]{2,120}$/.test(detail.id || '')).map(detail => ({
    id: detail.id, summary: cell(detail.summary || '', 500), severity: cell(detail.severity || '未評価', 200),
    modified: typeof detail.modified === 'string' && Number.isFinite(Date.parse(detail.modified)) ? detail.modified : null,
    fetchedAt: typeof detail.fetchedAt === 'string' && Number.isFinite(Date.parse(detail.fetchedAt)) ? detail.fetchedAt : null,
    withdrawn: typeof detail.withdrawn === 'string' ? detail.withdrawn : null, advisoryType: advisoryKind(detail),
    aliases: (Array.isArray(detail.aliases) ? detail.aliases : []).filter(alias => typeof alias === 'string' && /^[A-Za-z0-9._-]{1,160}$/.test(alias)).slice(0, 20),
    fixed: (Array.isArray(detail.fixed) ? detail.fixed : []).filter(fixed => typeof fixed.name === 'string' && typeof fixed.version === 'string').map(fixed => ({ name: cell(fixed.name), version: cell(fixed.version), ecosystem: cell(fixed.ecosystem) })),
  }));
  const ranked = prioritizeFindings(findings.map(finding => ({ ...finding, advisoryId: finding.id,
    severity: metadata.get(finding.id)?.severity || finding.severity, advisoryType: advisoryKind(metadata.get(finding.id) || finding) })), cached);
  const allIds = [...new Set(ranked.map(item => item.advisoryId || item.id).filter(id => /^[A-Za-z0-9][A-Za-z0-9._-]{2,120}$/.test(id)))];
  const details = cached.filter(detail => allIds.includes(detail.id) && Date.now() - Date.parse(detail.fetchedAt) >= 0 && Date.now() - Date.parse(detail.fetchedAt) < 7 * 86400000
    && findings.filter(finding => finding.id === detail.id).every(finding => !finding.modified || detail.modified && Date.parse(detail.modified) >= Date.parse(finding.modified)));
  const pending = new Set(options.previous?.pendingIds || []);
  const urgent = new Set(ranked.filter(finding => advisoryKind(finding) === 'malware' || finding.knownExploited || /^(?:CRITICAL|HIGH)$/i.test(finding.severity || '')).map(finding => finding.id));
  const needed = allIds.filter(id => !details.some(detail => detail.id === id)).sort((a, b) => Number(urgent.has(b)) - Number(urgent.has(a)) || Number(pending.has(b)) - Number(pending.has(a)));
  for (const detail of details) {
    detail.knownExploited = [detail.id, ...(detail.aliases || [])].some(alias => knownExploited.has(alias));
    if (metadata.get(detail.id)?.advisoryType === 'malware') detail.advisoryType = 'malware';
  }
  const ids = needed.slice(0, options.maxDetails ?? 80);
  const failures = [];
  let cursor = 0;
  const limit = Math.min(deadline, started + 120_000);
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      if (Date.now() >= limit) { failures.push(id); continue; }
      try {
        const response = await fetchImpl(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`, { redirect: 'error', signal: AbortSignal.timeout(Math.min(15_000, limit - Date.now())), headers: { Accept: 'application/json' } });
        if (!response.ok) { await response.body?.cancel(); throw new Error('HTTP'); }
        const chunks = []; let size = 0;
        for await (const chunk of response.body) { size += chunk.length; if (size > 2 * 1024 * 1024) throw new Error('容量上限'); chunks.push(chunk); }
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        details.push({ id, summary: cell(data.summary || '', 500), aliases: (data.aliases || []).filter(value => typeof value === 'string').slice(0, 20), modified: data.modified || null, withdrawn: data.withdrawn || null,
          severity: cell(data.database_specific?.severity || metadata.get(id)?.severity || data.severity?.map(value => value.score).join(', ') || '未評価', 200),
          fetchedAt: new Date().toISOString(), advisoryType: advisoryKind(metadata.get(id) || data),
          knownExploited: [id, ...(data.aliases || [])].some(alias => knownExploited.has(alias)),
          fixed: (data.affected || []).flatMap(affected => (affected.ranges || []).flatMap(range => (range.events || []).filter(event => event.fixed).map(event => ({ name: cell(affected.package?.name), ecosystem: cell(affected.package?.ecosystem), version: cell(event.fixed) })))) });
      } catch { failures.push(id); }
    }
  }));
  const pendingIds = needed.filter(id => !details.some(detail => detail.id === id));
  return { schemaVersion: 1, details, continuation: { pendingIds, cache: details },
    coverage: [{ area: 'osv-details', status: pendingIds.length ? 'partial' : 'complete', deferred: pendingIds.length > failures.length, count: details.length, requested: ids.length, total: allIds.length, failed: failures.length,
      reason: '公開IDのみGET。1回最大80種類・120秒。未処理IDから再開し、公開メタデータは7日以内かつ告知未更新の場合だけ再利用' }],
    commands: [{ command: 'GET https://api.osv.dev/v1/vulns/{公開ID} （最大80種類・並列6、ローカル公開情報キャッシュ併用）', status: failures.length ? 'partial' : 'complete', count: ids.length - failures.length, elapsedMs: Date.now() - started }] };
}

/**
 * 同一依存とアドバイザリの一致をまとめ、件数を誇張しない。表示処理から呼ぶ。
 * @returns 現在の四段階判定の重複を除いた配列。
 */
function uniqueFindings(findings) {
  const result = new Map();
  for (const finding of findings) {
    const key = `${finding.advisoryId || finding.id}:${finding.package?.ecosystem || ''}:${finding.package?.name || ''}:${finding.version || ''}`;
    if (!result.has(key)) result.set(key, finding);
  }
  return [...result.values()];
}

/**
 * 修正版をパッケージと対応させる。判定表生成から呼ぶ。
 * @returns 確認できた修正版。版系統の選択や更新は実行しない。
 */
function fixedText(finding, details) {
  if (finding.fixed) return cell(finding.fixed);
  const advisory = details.find(detail => detail.id === finding.advisoryId);
  return advisory?.fixed.filter(fixed => fixed.name === finding.package?.name).map(fixed => fixed.version).join(', ') || '一次資料で確認';
}

/**
 * 四段階の判定を表にする。全文索引と概要レポートで共用する。
 * @returns 原因・版・範囲・修正版を明記したMarkdown。
 */
function findingTable(findings, details) {
  return ['| 判定 | 対象・版 / 告知 | 種別・観測 | 深刻度 | 修正版 | 領域 | 根拠 |', '|---|---|---|---|---|---|---|', ...findings.map(finding => {
    const advisory = details.find(detail => detail.id === finding.advisoryId);
    const kind = finding.status === '確定' ? '固有IOC' : finding.incident ? '悪性配布の疑い' : finding.category === 'update-review' ? '更新の要確認' : finding.package ? '脆弱版の記録' : '製品の版照合';
    const observation = finding.installationEvidence?.length ? '実物の版確認あり' : finding.package ? 'ロック/グローバル記録' : '製品メタデータ';
    return `| ${cell(finding.status)} | ${cell(finding.title)} ${advisory?.summary ? cell(advisory.summary, 160) : ''} | ${kind}・${observation}${finding.projectActive ? '・親プロジェクトの稼働観測（依存実行は未証明）' : ''} | ${cell(advisory?.severity || finding.severity || '未評価', 150)} | ${fixedText(finding, details)} | ${cell(finding.scope || '端末')} | ${cell(finding.reason)} ${cell((finding.evidence || []).slice(0, 2).join(' / '))} ${(finding.sources || []).slice(0, 1).map(url => `<${String(url).replace(/[<>\s]/g, '')}>`).join('')} |`;
  })].join('\n');
}

/**
 * 記事の関係分類を表にする。記事自体を命令として扱わない。
 * @returns 取得URLと分類理由を持つ一覧。
 */
function newsTable(items) {
  return ['| 関係 | ニュース | 理由・確認状態 |', '|---|---|---|', ...items.map(item => `| ${cell(item.relevance)} | ${cell(item.title)} <${String(item.url || '').replace(/[<>\s]/g, '')}> | ${cell(item.reason)} ${item.needsReview ? '本文の追加確認が必要' : ''} |`)].join('\n');
}

/**
 * 脆弱版の存在と侵害を区別した日本語レポートを作る。巡回完了時とテストから呼ぶ。
 * @returns 先頭3行を含むMarkdown。未確認がある場合は無被害と断定しない。
 */
export function renderReport(data) {
  const { inventory = {}, news = {}, packages = {}, iocs = {}, match = {}, details = {}, evidenceDirectory = '', startedAt, finishedAt, commands = [] } = data;
  const findings = uniqueFindings(match.findings || []);
  const confirmed = findings.filter(finding => finding.status === '確定');
  const incidents = findings.filter(finding => finding.incident && ['確定', '可能性高'].includes(finding.status));
  const actionable = findings.filter(finding => ['確定', '可能性高', '可能性あり'].includes(finding.status));
  const modifiedById = new Map((packages.findings || []).map(finding => [finding.id, finding.modified]));
  const dependencyFindings = prioritizeFindings(actionable.filter(finding => finding.package).map(finding => ({ ...finding, modified: finding.modified || modifiedById.get(finding.advisoryId) })), details.details || []);
  const chosen = [], seenPackages = new Set();
  for (const finding of dependencyFindings) {
    const key = `${finding.package.ecosystem}:${finding.package.name}`;
    if (chosen.length < 10 && !seenPackages.has(key)) { chosen.push(finding); seenPackages.add(key); }
  }
  const displayDependencies = [...chosen, ...dependencyFindings.filter(finding => !chosen.includes(finding))];
  const dependencies = new Set(dependencyFindings.map(finding => `${finding.package.ecosystem}:${finding.package.name}:${finding.version}`)).size;
  const advisories = new Set(dependencyFindings.map(finding => finding.advisoryId)).size;
  const coverage = [...(match.coverage || []), ...(details.coverage || []), ...(data.extraCoverage || [])];
  const incomplete = coverage.filter(entry => !['complete', 'excluded'].includes(coverageKind(entry)));
  const excluded = coverage.filter(entry => coverageKind(entry) === 'excluded');
  const assessments = match.newsAssessment || [];
  const unreviewed = assessments.filter(item => item.needsReview).length;
  const firstPriority = incidents.length ? '悪性配布の入手元・実物・実行痕跡を最優先確認。実行IOCがあれば封じ込め・証拠保全を提案' : dependencyFindings.length ? '重大告知と影響依存の実際の利用・到達性を確認し、仕事領域と実行中環境から修正版への更新を計画' : incomplete.length || unreviewed ? '未確認の情報源・対象製品を補完して判断する' : '今回の関連する更新情報を確認する';
  const lines = [
    `被害の有無: 侵害を示すIOCの確定 ${confirmed.length} 件。脆弱版の該当だけでは侵害・窃取を確認したことにはならない。`,
    `要対応: 優先確認 ${chosen.length + actionable.filter(finding => !finding.package).length} 対象を先に表示。全体 ${actionable.length} 判定（依存 ${dependencies} 種類／アドバイザリ ${advisories} 種類／依存と告知の一致 ${dependencyFindings.length} 件、感染件数ではない）。未確認範囲 ${incomplete.length} 件・方針上の対象外 ${excluded.length} 件・本文未確認ニュース ${unreviewed} 件。`,
    `いちばん急ぐこと: ${firstPriority}。`, '',
    `# Mac セキュリティ巡回 ${jstDate(new Date(finishedAt || Date.now()))}`, '',
    `実行: ${startedAt || '未記録'} ～ ${finishedAt || '未記録'}（UTC表記）。所要時間: ${Number.isFinite(Date.parse(finishedAt) - Date.parse(startedAt)) ? ((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000).toFixed(1) : '未確認'} 秒。期間: ${news.window?.since || '未確認'} ～ ${news.window?.until || '未確認'}。調査対象は変更していない。被害なし・過去の侵害なしを保証するレポートではない。`, '',
    '## このMacの観測', '',
    `- OS: ${cell(inventory.host?.macOS?.productVersion || inventory.host?.osVersion || inventory.host?.version || inventory.host?.macOS || '棚卸しJSONを参照')}。アプリ ${inventory.applications?.length || 0}、エディタ拡張 ${inventory.extensions?.length || 0}、ブラウザ拡張 ${inventory.browserExtensions?.length || 0}。`,
    `- ロックファイル ${inventory.lockfiles?.length || 0} 件、抽出したパッケージ版 ${packages.packages?.length || 0} 件。ロック記録は現在の実行・インストールの証明ではない。`,
    `- ランタイム: ${(inventory.runtimes || []).map(runtime => `${cell(runtime.name || 'Node')} ${cell(runtime.version)} / ${cell(runtime.path || runtime.executable || 'パス不明')} (${runtime.isCurrent ? '現在の実行環境' : '保管・別用途を含む'})`).join('、') || '未確認'}。`,
    `- Claude Code拡張: ${(inventory.extensions || []).filter(extension => extension.id?.toLowerCase() === 'anthropic.claude-code').map(extension => `${extension.editor} ${extension.version}、入手元 ${cell(extension.source)}、日時 ${cell(extension.installedAt)}`).join(' / ') || '取得した拡張一覧に該当なし（カバレッジの不足を別途参照）'}。`, '',
    '## 判定表', '',
    findingTable([...prioritizeFindings(findings.filter(finding => !finding.package && finding.status !== '影響なし'), details.details || []), ...displayDependencies, ...findings.filter(finding => !finding.package && finding.status === '影響なし')].slice(0, 20), details.details || []), '',
    `全 ${findings.length} 判定と全証拠パスは [判定の全文](${path.join(evidenceDirectory, 'findings.md')}) および [照合JSON](${path.join(evidenceDirectory, 'match.json')})。表の「影響なし」はその個別事案・確認範囲の判断。`, '',
    '## ランタイムごとの影響範囲（現在の利用と保管版を区別）', '',
    '総合判定に旧版が含まれていても、現在の実行環境まで影響版という意味ではない。Node公式の修正バックポートを考慮し、内蔵Brotliの表示版だけでは判定しない。別用途・保管版は現在使用されていないことまでは証明できない。', '',
    '| ランタイム | 版 | 実行・保管の区別 | 今回事案の判定 | 実体・根拠 |', '|---|---|---|---|---|',
    ...(inventory.runtimes || []).map(runtime => {
      const judgments = findings.flatMap(finding => (finding.runtimeEvidence || []).filter(evidence => evidence.path === runtime.path).map(evidence => `${finding.id}: ${evidence.status}`));
      const usage = runtime.usageEvidence?.length ? `稼働中: ${runtime.usageEvidence.map(evidence => evidence.purpose).join(' / ')}（棚卸しの選択先とは別に観測）` : runtime.isCurrent === true ? 'この棚卸しで実行した現在のNode' : runtime.isCurrent === false ? '別用途・保管版（使用状況は未確認）' : '用途・選択先を未確認';
      return `| ${cell(runtime.name)} | ${cell(runtime.version)} | ${cell(usage)} | ${cell(judgments.join(' / ') || '今回の検証済みルールの対象外')} | ${cell(runtime.path)} ${cell(runtime.currentEvidence || runtime.evidence || '')} |`;
    }), '',
    '## IOC照合の観測（不一致を含む）', '',
    '| 種類 | 対象 | 一致 | 固有一致 | 観測・コマンド |', '|---|---|---|---|---|',
    ...(iocs.checks || []).map(check => `| ${cell(check.kind)} | ${cell(check.value)} | ${check.status === 'unavailable' ? '未確認' : check.matched ? 'あり' : 'なし'} | ${check.strong ? 'あり' : 'なし'} | ${cell(check.reason)} ${cell(check.command)} |`), '',
    'IOCの不一致は、この方法・時点・権限で観測できなかったことだけを示す。過去の通信、削除済みファイル、全マルウェアの不在を証明しない。', '',
    '## ニュース一覧（関係あり／なし）', '',
    newsTable([...assessments.filter(item => item.relevance === '関係あり').slice(0, 15), ...assessments.filter(item => item.relevance !== '関係あり').slice(0, 5)]), '',
    `全 ${assessments.length} 記事: [ニュース全文索引](${path.join(evidenceDirectory, 'news-index.md')})。関係なしは取得した製品名との不一致であり、未使用の証明ではない。`, '',
    '## 情報源ごとの取得状況', '',
    '| 情報源 | 取得 | 記事数 | ページ数 | 履歴・制約 |', '|---|---|---|---|---|',
    ...(news.sources || []).map(source => `| ${cell(source.name)} | ${cell(source.status)} | ${source.itemCount ?? 0} | ${source.pages ?? 0} | ${cell(source.reason || source.limit || '取得成功')} ${source.historicalCoverage ? '過去期間の不足あり' : ''} |`), '',
    '## 優先する対策（提案のみ）', '',
  ];
  const changeLabels = { new: '新規', continuing: '継続', resolved: '解消', unconfirmed: '今回は確認不能' };
  const changes = data.changes || { new: [], continuing: [], resolved: [], unconfirmed: [] };
  const changeLines = ['## 前回との差分', '', `状態: ${assessmentStatus(coverage, unreviewed)}。解消は今回の十分な再検査で確認した対象だけ。初回または旧stateでは新規を基準にする。`, '',
    '| 変化 | 件数 | 主な対象 |', '|---|---|---|', ...Object.entries(changeLabels).map(([key, label]) => `| ${label} | ${(changes[key] || []).length} | ${cell((changes[key] || []).slice(0, 3).map(finding => finding.title).join(' / '))} |`), '',
    '悪性配布・悪用確認・深刻度・稼働/実物の観測を優先し、同条件でだけ更新日時を使う。親プロジェクトの稼働は依存自体の実行を証明しない。', ''];
  lines.splice(lines.indexOf('## このMacの観測'), 0, ...changeLines);
  const contexts = inventory.executionContexts || [];
  if (contexts.length) lines.push('## 稼働中の実体（引数・環境変数は非保存）', '', '| 用途・観測 | PID | cwd | Node実体 |', '|---|---|---|---|',
    ...contexts.map(context => `| ${cell(context.purpose)} | ${cell(context.pid)} | ${cell(context.cwd)} | ${cell(context.runtimePath)} |`), '');
  const launchRuntimes = (inventory.launchItems || []).filter(launch => launch.runtimePaths?.length);
  if (launchRuntimes.length) lines.push('## 起動設定のNode指定（稼働の証明とは別）', '', '| 起動項目 | 指定されたNode実体 |', '|---|---|',
    ...launchRuntimes.map(launch => `| ${cell(launch.label)} | ${cell(launch.runtimePaths.join(' / '))} |`), '');
  if (incidents.length) {
    lines.push('悪性配布（拡張またはパッケージ）または固有IOCの一致を含むため、入手元・実物・実行痕跡を優先確認する。ロック一致だけでは実行・窃取を確定しない。封じ込め・失効は実行根拠が得られた場合の条件付き提案。', '',
      `- **何が**: ${incidents.map(finding => cell(finding.title)).join('、')}。仕込まれた処理の根拠は各判定の公式告知。`,
      `- **いつ**: 今回の棚卸し観測 ${cell(inventory.generatedAt || packages.scannedAt)}。対象の導入・実行・悪用日時は未確認。IOCファイル日時 ${(iocs.checks || []).filter(check => check.matched).map(check => `${cell(check.value)}: ${cell(check.eventAt || check.modifiedAt || check.observedAt)}`).slice(0, 10).join(' / ') || '未確認'}。ファイル時刻から侵入時刻は断定できない。`,
      '- **どうやって**: 各告知の配布元・版・配布期間と、実際の入手元・インストール記録を照合する。ロック記録や履歴不足だけでインストール・更新経由と断定しない。',
      '- **読めた可能性のある場所（推定）**: ~/.ssh/、~/.config/gh/hosts.yml、~/.npmrc、各リポジトリの .env、~/.local/share/com.vercel.cli/、~/.supabase/、~/.config/neonctl/、~/.config/gcloud/、Chrome/Canaryのプロファイル、~/.config/op/、~/.openclaw/、~/.claude/.credentials.json、~/.codex/auth.json。存在・権限の未確認を含み、秘密値は未読。1Password/Keychainの存在は解読や窃取を意味しない。',
      '- **影響範囲**: 個人/仕事の範囲はローカルstateで設定した探索ルートと判定の領域欄で確認する。同じmacOSユーザーの権限で双方へ到達する可能性がある。仕事に及ぶ可能性があればクライアントのインシデント手順に沿う報告が必要な可能性。',
      `- **最優先・5分・無料**: 実行IOCが確認された場合に、本人確認後のネットワーク隔離、対象プロセス停止と証拠保全を検討。ロック一致だけで隔離・失効を必須にしない。根拠: ${incidents.flatMap(finding => finding.sources || []).slice(0, 3).map(url => `<${String(url).replace(/[<>\s]/g, '')}>`).join(' / ')}`,
      '- **次に30分〜半日・既存機能は無料**: 信頼できる別端末で主要メール/SSO→[GitHub Sessions](https://github.com/settings/sessions)・[Tokens](https://github.com/settings/tokens)・[SSH keys](https://github.com/settings/keys)→[Vercel Tokens](https://vercel.com/account/tokens)・[Supabase Tokens](https://supabase.com/dashboard/account/tokens)・[Neon](https://console.neon.tech/)・[gcloud](https://console.cloud.google.com/apis/credentials)→[OpenAI](https://platform.openai.com/api-keys)・[Anthropic](https://console.anthropic.com/settings/keys)の順に、実際に利用した資格情報を失効/再発行する計画。GitHub個人/仕事の認証は切り替えず各画面を区別する。', '');
  }
  // 脆弱版のみの高判定にも影響範囲を示し、侵害を既成事実にしない。
  if (!incidents.length && findings.some(finding => finding.status === '可能性高')) {
    lines.push('### 影響版があるため確認する事項', '',
      '- **何が**: 判定表にあるランタイム・依存版が既知の脆弱性に該当。悪性コードの混入や攻撃成功が確認されたという意味ではない。',
      `- **いつ**: 観測は ${cell(inventory.generatedAt)}。ロックファイルの更新日時はinventory.jsonに保存しているが、依存の導入日時・実行日時・悪用日時は特定できない。`,
      '- **どうやって**: 侵入経路は未確認。外部入力を扱う実際の稼働プロセス、依存の呼び出し経路、過去に選択したNode版を確認して到達性を絞る。',
      '- **個人/仕事の範囲**: ローカルstateのpersonal/work設定を判定の領域欄で分離した。同じmacOSユーザーの権限を持つプロセスが悪用されていた場合は双方へ及び得る。仕事側で悪用や資格情報アクセスの兆候が分かれば、クライアントのインシデント手順に沿った報告が必要な可能性がある。',
      '- **秘密情報の場所（悪用が成立した場合の候補）**: ~/.ssh/、~/.config/gh/hosts.yml、~/.npmrc、リポジトリの.env、Vercel/Supabase/Neon/gcloudのCLI認証ディレクトリ、Chrome/Canaryプロファイル、~/.config/op/、~/.openclaw/、~/.claude/.credentials.json、~/.codex/auth.json。内容・当時の権限・実際の窃取は未確認。',
      '- **封じ込めとローテーションの条件付き計画**: 実行IOCが見つかった場合は、本人確認後のネットワーク隔離・対象プロセス停止・証拠保全を優先。信頼できる別端末から主要メール/SSO→[GitHubのセッション](https://github.com/settings/sessions)・[Tokens](https://github.com/settings/tokens)・[SSH鍵](https://github.com/settings/keys)→[Vercel](https://vercel.com/account/tokens)・[Supabase](https://supabase.com/dashboard/account/tokens)・[Neon](https://console.neon.tech/)・[gcloud](https://console.cloud.google.com/apis/credentials)→AIサービスの認証を必要な範囲で失効/再発行する。現時点の依存版一致だけではこの変更を実行しない。', '');
  }
  const actions = [];
  if (dependencyFindings.length) actions.push(`**1. 依存の修正を優先順位付け — 30分〜半日・無料。** ${dependencies}種類の依存版について、仕事・外部入力を処理するアプリ・実行中グローバルCLIを先に確認。各プロジェクトで該当依存の \`pnpm why <package>\` 等を使い、表の修正版と互換性を確認して更新を計画する。[OSV照合結果](https://osv.dev/)と個別判定の告知が根拠。ロック記録だけで全資格情報のローテーションを必須としない。`);
  const context = JSON.stringify({ findings: findings.filter(finding => !finding.package), articles: assessments.filter(item => item.relevance === '関係あり').map(item => item.title) });
  if (/Cursor|Claude Code/i.test(context)) actions.push(`**${actions.length + 1}. 拡張の入手元と過去履歴を確認 — 5分・無料。** Cursor/VS Code の Extensions で Claude Code の版と配布元を確認。対象版やIOCがある場合は更新済みでも事後対策を検討する。[Cursor公式](https://cursor.com/blog/claude-code-extension-security-notice)。今回の自動チェックはSSH鍵本文を読んでいない。`);
  if (/macOS|Safari/i.test(context)) actions.push(`**${actions.length + 1}. macOS/Safariのセキュリティ更新を確認 — 30分・無料。** System Settings > General > Software Update で利用しているOS系統の修正版を確認し、保存・バックアップ後の適用を計画する。[Apple Security Releases](https://support.apple.com/en-us/100100)。`);
  if (/Chrome/i.test(context)) actions.push(`**${actions.length + 1}. ChromeとCanaryを別々に確認 — 5分・無料。** 各ブラウザの Help > About Google Chrome、\`chrome://settings/help\` でチャネルと更新状態を確認し再起動を計画する。Stableの版番号だけでCanaryを安全判定しない。[Google公式リリース](https://chromereleases.googleblog.com/)。`);
  if (/Brotli|Node/i.test(context)) actions.push(`**${actions.length + 1}. 使用中と保管中のNode/Brotliを整理して更新計画 — 30分・無料。** \`command -v node\` と \`node -p 'JSON.stringify(process.versions)'\` で実行環境を確認。Vite+、Homebrew、同梱ランタイムと旧キャッシュは別扱いし、修正済み版へ切り替える計画を立てる。[Node.js公式告知](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)。`);
  if (incomplete.length || unreviewed) actions.push(`**${actions.length + 1}. 取得不足と未確認記事を補完 — 30分・無料。** 下表の情報源・権限制約から優先確認。GHSAは保存した継続ページ、RSSは公開アーカイブを確認する。権限が必要でもこのスキルはsudoを実行しない。`);
  lines.push(...actions.slice(0, incidents.length ? 5 : 7).flatMap(action => [action, '']));
  if (actions.length < 3) lines.push('今回はニュースと実測に結びつく提案が3件未満。未確認情報を根拠に一般論を追加せず、情報補完後に3〜7件へ整える。', '');
  const coverageLabels = { excluded: '方針上の対象外', deferred: '上限による持越し', failed: '取得失敗', unconfirmed: '追加の確認が必要' };
  lines.push('## 未確認・取得制限', '', '方針上の対象外は取得失敗と分けて表示する。対象外・未確認を無影響の根拠には使わない。', '',
    '| 対象 | 分類 | 状態 | 件数・理由 |', '|---|---|---|---|', ...[...incomplete, ...excluded].map(entry => `| ${cell(entry.area)} | ${coverageLabels[coverageKind(entry)]} | ${cell(entry.status)} | ${entry.count ?? ''}/${entry.total ?? ''} ${cell(entry.reason)} |`), '',
    `ローカル証拠は ${evidenceDirectory} に保存。ローカル一覧JSONやファイル本文を外部へ送っていない。OSVへの送信は公開パッケージ名・版・エコシステム、詳細照会は公開IDのみ。`, '',
    '## 実行したコマンド', '', '<details><summary>コマンド・件数・経過時間</summary>', '', '| コマンド | 状態 | 時間ms |', '|---|---|---|', ...commands.map(command => `| ${cell(command.command, 1400)} | ${cell(command.status)} | ${command.elapsedMs ?? ''} |`), '', '</details>', '');
  return lines.join('\n');
}

/**
 * 完了したレポートに対応する状態を組み立てる。失敗した情報源の期間は進めない。
 * @returns 次回の取りこぼしを防ぐ状態JSON。
 */
export function buildNextState(previous, news, finishedAt, reportPath, allComplete = false, progress = {}) {
  const sourceCursors = { ...(previous.sourceCursors || {}) };
  const sourceContinuations = { ...(previous.sourceContinuations || {}) };
  for (const source of news.sources || []) {
    if (source.status === 'ok' && source.historicalCoverage !== 'partial') sourceCursors[source.name] = news.sourceCursors?.[source.name] || source.window?.until || news.window?.until;
    else if (!sourceCursors[source.name]) sourceCursors[source.name] = source.window?.since || news.window?.since;
    if (news.sourceContinuations?.[source.name]) sourceContinuations[source.name] = news.sourceContinuations[source.name];
    else if (source.status === 'ok') delete sourceContinuations[source.name];
  }
  const completeNews = (news.sources || []).length > 0 && news.sources.every(source => source.status === 'ok' && source.historicalCoverage !== 'partial');
  const runStatus = typeof allComplete === 'string' ? allComplete : allComplete ? 'complete' : 'partial';
  const newsFallbackSince = (news.sources || []).length ? undefined : previous.newsFallbackSince || news.window?.since || previous.lastRunAt || new Date(Date.parse(finishedAt) - 14 * 86400000).toISOString();
  return { schemaVersion: 1, ...previous, lastRunAt: finishedAt, lastReport: reportPath, sourceCursors, sourceContinuations,
    newsFallbackSince,
    ...(runStatus !== 'partial' && completeNews ? { lastSuccessfulAt: finishedAt } : {}), lastRunStatus: completeNews ? runStatus : 'partial',
    ...(progress.packages?.continuation ? { packageContinuation: progress.packages.continuation } : {}),
    ...(progress.details?.continuation ? { advisoryContinuation: progress.details.continuation } : {}),
    ...(progress.changes?.snapshot ? { assessmentSnapshot: progress.changes.snapshot } : {}) };
}

/**
 * 既存スクリプトを順序制御し、レポート保存後に状態を更新する。CLIから呼ぶ。
 * @returns 利用者向けの短い完了情報。詳細な一覧はローカルだけに保存する。
 */
export async function runSweep() {
  const started = Date.now(), startedAt = new Date(started).toISOString(), deadline = started + 28 * 60_000;
  const reportRoot = path.join(homedir(), 'security-reports');
  const stateRoot = path.join(homedir(), '.local/state/mac-security-sweep');
  await privateDirectory(reportRoot); await privateDirectory(stateRoot);
  // 保存先がGit管理下なら報告対象データを置かずに止める。
  let ancestor = await realpath(reportRoot);
  while (true) { if (await lstat(path.join(ancestor, '.git')).catch(() => null)) throw new Error('レポート保存先がGit管理下'); const parent = path.dirname(ancestor); if (parent === ancestor) break; ancestor = parent; }
  const stamp = startedAt.replace(/[-:.]/g, '');
  const evidenceDirectory = path.join(reportRoot, `${jstDate(new Date(started))}-${stamp}-evidence`);
  await privateDirectory(evidenceDirectory);
  const statePath = path.join(stateRoot, 'state.json'), previous = await readJson(statePath);
  const [inventory, news] = await Promise.all([runStage('inventory', [], 8 * 60_000, deadline), runStage('fetch-news', ['--state', statePath, '--until', startedAt], 3 * 60_000 + 5000, deadline)]);
  const inventoryPath = await saveJson(evidenceDirectory, 'inventory.json', inventory), newsPath = await saveJson(evidenceDirectory, 'news.json', news);
  const [packages, iocs] = await Promise.all([
    runStage('scan-packages', ['--inventory', inventoryPath, '--state', statePath, '--budget-ms', '540000'], 10 * 60_000, deadline),
    runStage('check-iocs', ['--inventory', inventoryPath, '--since', news.window?.since || new Date(started - 14 * 86400000).toISOString(), '--until', startedAt], 2 * 60_000, deadline),
  ]);
  const packagesPath = await saveJson(evidenceDirectory, 'packages.json', packages), iocsPath = await saveJson(evidenceDirectory, 'iocs.json', iocs);
  const details = await enrichAdvisories(packages.findings || [], deadline, fetch, { news, previous: previous.advisoryContinuation });
  const detailsPath = await saveJson(evidenceDirectory, 'advisory-details.json', details);
  const match = await runStage('match', ['--inventory', inventoryPath, '--news', newsPath, '--packages', packagesPath, '--advisory-details', detailsPath, '--ioc-evidence', iocsPath, '--rules', path.join(SKILL, 'references/verified-rules.json')], 2 * 60_000, deadline);
  const extraCoverage = [inventory, news, packages, iocs, match].filter(stage => stage.error).flatMap(stage => stage.coverage || []);
  const commands = [inventory, news, packages, iocs, match, details].flatMap(stage => stage.commands || []);
  await saveJson(evidenceDirectory, 'match.json', match);
  const changes = compareAssessments(previous.assessmentSnapshot || [], match.findings || [], packages, match.coverage || []);
  await saveJson(evidenceDirectory, 'changes.json', changes);
  await writeFile(path.join(evidenceDirectory, 'findings.md'), `${findingTable(uniqueFindings(match.findings || []), details.details)}\n`, { mode: 0o600, flag: 'wx' });
  await writeFile(path.join(evidenceDirectory, 'news-index.md'), `${newsTable(match.newsAssessment || [])}\n`, { mode: 0o600, flag: 'wx' });
  const finishedAt = new Date().toISOString();
  let reportPath = path.join(reportRoot, `${jstDate(new Date(started))}.md`);
  if (await lstat(reportPath).catch(() => null)) reportPath = path.join(reportRoot, `${jstDate(new Date(started))}-${stamp}.md`);
  const report = renderReport({ inventory, news, packages, iocs, match, details, changes, evidenceDirectory, startedAt, finishedAt, commands, extraCoverage });
  await writeFile(reportPath, report, { mode: 0o600, flag: 'wx' });
  // レポートの保存成功より前に状態を進めない。
  const allComplete = assessmentStatus([...(match.coverage || []), ...(details.coverage || []), ...extraCoverage], (match.newsAssessment || []).filter(item => item.needsReview).length);
  const nextState = buildNextState(previous, news, finishedAt, reportPath, allComplete, { packages, details, changes });
  const stateTemp = path.join(stateRoot, `state-${stamp}.tmp`);
  await writeFile(stateTemp, `${JSON.stringify(nextState, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  await rename(stateTemp, statePath);
  return { reportPath, evidenceDirectory, statePath, status: nextState.lastRunStatus, elapsedMs: Date.now() - started, findings: match.counts || {}, newsItems: news.items?.length || 0, scannedPackages: packages.packages?.length || 0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help')) console.log('使用法: node run-sweep.mjs\n読み取り専用の巡回を行い、~/security-reports と ~/.local/state/mac-security-sweep にだけ結果を保存します。');
  else {
    try { console.log(JSON.stringify(await runSweep(), null, 2)); }
    catch { console.log(JSON.stringify({ error: '巡回の保存または実行に失敗しました。レポート保存先・権限を確認してください。生の例外は秘密保護のため非表示。' })); process.exitCode = 1; }
  }
}
