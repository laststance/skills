#!/usr/bin/env node
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { advisoryKind, assessmentStatus, coverageKind, compareAssessments, prioritizeFindings } from './assessment.mjs';
import { createRunContext } from './runtime.mjs';
import { createStateStore } from './state-store.mjs';
import { parseRunnerArgs } from './configuration.mjs';
import { safeDiagnostic, causeClass, SweepError } from './diagnostics.mjs';
export { enrichAdvisories } from './advisory-details.mjs';

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

/** 未評価vectorを数値と取り違えず重大度方式を表示する。判定表が呼ぶ。 @example severityText({level:'HIGH',score:8.1,method:'CVSS_V3'}) */
function severityText(value) {
  if (!value || typeof value !== 'object') return cell(value || '未評価', 150);
  return cell(`${value.level || '未評価'}${Number.isFinite(value.score) ? ` ${value.score}` : ''}${value.method ? ` (${value.method})` : ''}${value.evaluated === false ? '・未評価' : ''}`, 150);
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
  const advisory = detailForFinding(finding, details);
  return advisory?.fixed?.filter(fixed => fixed.name === finding.package?.name && (!fixed.ecosystem || fixed.ecosystem === finding.package?.ecosystem)).map(fixed => fixed.version).join(', ') || '一次資料で確認';
}

/** alias統合後も同じ告知の詳細を参照する。表の重大度・修正版表示が呼ぶ。 @example detailForFinding(finding, details) */
function detailForFinding(finding, details) {
  const ids = new Set([finding.advisoryId, ...(finding.aliases || [])]);
  return details.find(detail => ids.has(detail.id) || (detail.aliases || []).some(id => ids.has(id)));
}

/**
 * 四段階の判定を表にする。全文索引と概要レポートで共用する。
 * @returns 原因・版・範囲・修正版を明記したMarkdown。
 */
function findingTable(findings, details) {
  return ['| 判定 | 対象・版 / 告知 | 種別・観測 | 深刻度 | 修正版 | 領域 | 根拠 |', '|---|---|---|---|---|---|---|', ...findings.map(finding => {
    const advisory = detailForFinding(finding, details);
    const kind = finding.status === '確定' ? '固有IOC' : finding.incident ? '悪性配布の疑い' : finding.category === 'update-review' ? '更新の要確認' : finding.package ? '脆弱版の記録' : '製品の版照合';
    const observation = finding.impact?.installationConfirmed === true ? '実物の版確認あり' : finding.impact?.kind === 'image-record-affected' ? '画像digestと結合したSBOM記録' : finding.package ? 'ロック/グローバル記録（実物は未確認）' : '製品メタデータ';
    return `| ${cell(finding.status)} | ${cell(finding.title)} ${advisory?.summary ? cell(advisory.summary, 160) : ''} | ${kind}・${observation}${finding.projectActive ? '・親プロジェクトの稼働観測（依存実行は未証明）' : ''} | ${severityText(advisory?.severity || finding.severity)} | ${fixedText(finding, details)} | ${cell(finding.scope || '端末')} | ${cell(finding.reason)} ${cell((finding.evidence || []).slice(0, 2).join(' / '))} ${(finding.sources || []).slice(0, 1).map(url => `<${String(url).replace(/[<>\s]/g, '')}>`).join('')} |`;
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
    `要対応: 優先確認 ${chosen.length + actionable.filter(finding => !finding.package).length} 対象を先に表示。全体 ${actionable.length} 判定（依存 ${dependencies} 種類／アドバイザリ ${advisories} 種類／依存と告知の一致 ${dependencyFindings.length} 件、感染件数ではない）。未確認範囲 ${incomplete.length} 件・方針上の対象外 ${excluded.length} 件・本文未確認ニュース ${unreviewed} 件。前回陽性の今回未確認 ${(data.changes?.unconfirmed || []).length} 件。`,
    `いちばん急ぐこと: ${firstPriority}。`, '',
    `# Mac セキュリティ巡回 ${jstDate(new Date(finishedAt || Date.now()))}`, '',
    `実行: ${startedAt || '未記録'} ～ ${finishedAt || '未記録'}（UTC表記）。所要時間: ${Number.isFinite(Date.parse(finishedAt) - Date.parse(startedAt)) ? ((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000).toFixed(1) : '未確認'} 秒。期間: ${news.window?.since || '未確認'} ～ ${news.window?.until || '未確認'}。調査対象は変更していない。被害なし・過去の侵害なしを保証するレポートではない。`, '',
    '## このMacの観測', '',
    `- OS: ${cell(inventory.host?.macOS?.productVersion || inventory.host?.osVersion || inventory.host?.version || inventory.host?.macOS || '棚卸しJSONを参照')}。アプリ ${inventory.applications?.length || 0}、エディタ拡張 ${inventory.extensions?.length || 0}、ブラウザ拡張 ${inventory.browserExtensions?.length || 0}。`,
    `- ロックファイル ${inventory.lockfiles?.length || 0} 件、抽出したパッケージ版 ${packages.packages?.length || 0} 件。ロック記録は現在の実行・インストールの証明ではない。`,
    `- 由来未検証のinstalled-global例外: ${(packages.coverage || []).find(entry => entry.area === 'global-package-origins')?.count || 0} 件。名前・版だけの照会で公開性を証明したことにはならない。設定 queryUnknownGlobals=false でこの例外を停止できる。`,
    `- 同一告知の統合後: 告知 ${match.uniqueAdvisoryCount ?? advisories} 種類、影響先 ${match.affectedTargetCount ?? dependencies} 件、告知と対象の組 ${match.advisoryTargetCount ?? dependencyFindings.length} 件。aliasだけで統合し、場所・版の違いは証拠に保持。`,
    `- ランタイム: ${(inventory.runtimes || []).map(runtime => `${cell(runtime.name || 'Node')} ${cell(runtime.version)} / ${cell(runtime.path || runtime.executable || 'パス不明')} (${runtime.isCurrent ? '現在の実行環境' : '保管・別用途を含む'})`).join('、') || '未確認'}。`,
    `- Claude Code拡張: ${(inventory.extensions || []).filter(extension => extension.id?.toLowerCase() === 'anthropic.claude-code').map(extension => `${extension.editor} ${extension.version}、入手元 ${cell(extension.source)}、日時 ${cell(extension.installedAt)}`).join(' / ') || '取得した拡張一覧に該当なし（カバレッジの不足を別途参照）'}。`, '',
    '## 判定表', '',
    findingTable([...prioritizeFindings(findings.filter(finding => !finding.package && finding.status !== '影響なし'), details.details || []), ...displayDependencies, ...findings.filter(finding => !finding.package && finding.status === '影響なし')].slice(0, 20), details.details || []), '',
    `全 ${findings.length} 判定と全証拠パスは [判定の全文](${path.join(evidenceDirectory, 'evidence.json')}) および [照合JSON](${path.join(evidenceDirectory, 'evidence.json')})。表の「影響なし」はその個別事案・確認範囲の判断。`, '',
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
    `全 ${assessments.length} 記事: [ニュース全文索引](${path.join(evidenceDirectory, 'evidence.json')})。関係なしは取得した製品名との不一致であり、未使用の証明ではない。`, '',
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
  if (changes.unconfirmed?.length) lines.push('## 前回陽性・今回は確認不能', '',
    '次の既知記録を解消扱いにせず保持している。前回の存在・影響可能性を示す履歴で、今回の実物を再確認した意味ではない。', '',
    findingTable(changes.unconfirmed, details.details || []), '');
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
      `- **いつ**: 観測は ${cell(inventory.generatedAt)}。収集できたロックファイルの更新日時はevidence.jsonのinventory内に保存するが、依存の導入日時・実行日時・悪用日時は特定できない。`,
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
    `ローカル証拠は ${evidenceDirectory} に保存。ローカル一覧JSONやファイル本文を外部へ送っていない。OSV照会は許可した名前・版・ecosystemとAPIの継続token、詳細照会は現在の結果に含まれる公開IDのみ。由来未検証のinstalled-global例外は上の件数欄を参照し、公開性の確認済みとは扱わない。`, '',
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
    if (source.windowComplete === true || source.status === 'ok' && source.historicalCoverage !== 'partial') sourceCursors[source.name] = news.sourceCursors?.[source.name] || source.window?.until || news.window?.until;
    else if (!sourceCursors[source.name]) sourceCursors[source.name] = source.window?.since || news.window?.since;
    if (news.sourceContinuations?.[source.name]) sourceContinuations[source.name] = news.sourceContinuations[source.name];
    else if (source.status === 'ok' || source.windowComplete === true) delete sourceContinuations[source.name];
  }
  const completeNews = (news.sources || []).length > 0 && news.sources.every(source => source.status === 'ok' && source.historicalCoverage !== 'partial');
  const runStatus = typeof allComplete === 'string' ? allComplete : allComplete ? 'complete' : 'partial';
  const newsFallbackSince = (news.sources || []).length ? undefined : previous.newsFallbackSince || news.window?.since || previous.lastRunAt || new Date(Date.parse(finishedAt) - 14 * 86400000).toISOString();
  return { schemaVersion: 1, ...previous, lastRunAt: finishedAt, lastReport: reportPath, sourceCursors, sourceContinuations,
    newsFallbackSince,
    ...(runStatus !== 'partial' && completeNews ? { lastSuccessfulAt: finishedAt } : {}), lastRunStatus: completeNews ? runStatus : 'partial',
    ...(progress.packages?.continuation ? { packageContinuation: progress.packages.continuation } : {}),
    ...(progress.details?.continuation ? { advisoryContinuation: progress.details.continuation } : {}),
    ...(progress.changes?.snapshot ? { assessmentSnapshot: progress.changes.snapshot } : {}),
    ...(progress.inventory?.discoveryContinuation ? { discoveryContinuation: progress.inventory.discoveryContinuation } : {}),
    ...(news.baselines ? { productBaselines: news.baselines } : {}),
    ...(news.adaptiveContinuation ? { adaptiveNews: news.adaptiveContinuation } : {}),
    ...(progress.transport ? { transport: progress.transport } : {}) };
}

/** 既存CLIと試験から同じimported stageを組み立てる。stageごとの子Nodeを起動しない。 @example await defaultStages() */
async function defaultStages() {
  const [inventoryModule, newsModule, packageModule, iocModule, matchModule, detailModule] = await Promise.all([
    import('./inventory.mjs'), import('./fetch-news.mjs'), import('./scan-packages.mjs'), import('./check-iocs.mjs'), import('./match.mjs'), import('./advisory-details.mjs'),
  ]);
  return { inventory: inventoryModule.inventory, news: newsModule.fetchNews, adaptive: newsModule.fetchAdaptiveNews, mergeNews: newsModule.mergeNews,
    packages: packageModule.scanPackages, iocs: iocModule.checkIocs, match: matchModule.matchInventory, details: detailModule.enrichAdvisories };
}

/** 全stageの観測を共有contextで集め、report-backed世代を保存する。通常CLIと隔離E2Eが呼ぶ。 @example await runSweep({budgetMs:120000}) */
export async function runSweep(options = {}) {
  const home = options.home || homedir();
  const monotonicNow = options.monotonicNow || (() => performance.now()), preflightStarted = monotonicNow();
  const budgetMs = options.budgetMs ?? 1680000, reserve = Math.max(10000, Math.min(60000, budgetMs * 0.1));
  if (!Number.isSafeInteger(budgetMs) || budgetMs < 12000 || budgetMs > 1680000) throw new SweepError('CONFIG', { cause: 'limit', operation: 'config' });
  const checkPreflight = () => { if (monotonicNow() - preflightStarted >= budgetMs - reserve) throw new SweepError('DEADLINE', { cause: 'timeout', operation: 'state' }); };
  const store = await createStateStore({ home, runId: options.runId, filesystem: options.filesystem, identityProvider: options.identityProvider, onBoundary: options.onBoundary, checkPreflight });
  let context, closing = false, saveQueue = Promise.resolve(), lastCheckpoint = 0, startedMonotonic = 0, saved;
  const data = {}, previous = store.state;
  const pending = new Set(['inventory', 'news', 'adaptive', 'packages', 'iocs', 'details']);
  let stages, rules = {};
  try {
    context = createRunContext({ ...options, home, monotonicNow, monotonicStart: preflightStarted, config: store.config, previousTransport: previous.transport, continuationVerified: store.progressVerified,
      checkpoint: async update => {
        if (closing || !update || !['inventory', 'news', 'adaptive', 'packages', 'iocs', 'details'].includes(update.stage)) return;
        data[update.stage] = structuredClone(update.value);
        if (context.monotonicNow() - lastCheckpoint >= 15000) await checkpoint(false);
      } });
    startedMonotonic = preflightStarted;
    stages = options.stages || await defaultStages();
    rules = options.rules || await context.io.readJson(path.join(SKILL, 'references/verified-rules.json'), { roots: [path.join(SKILL, 'references')] });

    /** 未完了・失敗をcoverageに残す。同じ結果から保存状態と冒頭件数を作る。 @example await snapshot(false) */
    function snapshot(final) {
      const inventory = data.inventory || {}, news = stages.mergeNews && data.adaptive ? stages.mergeNews(data.news || {}, data.adaptive) : data.news || {};
      const packages = data.packages || {}, iocs = data.iocs || {}, details = data.details || {};
      const match = stages.match(inventory, news, { packages, iocEvidence: iocs, advisoryDetails: details, rules, now: new Date(context.wallNow()) });
      const sourceCoverage = (news.sources || []).map(source => ({ area: `source:${source.name}`, status: source.status === 'ok' && source.historicalCoverage !== 'partial' ? 'complete' : 'partial', reason: source.reason || source.limit || '情報源の成功と履歴範囲を確認' }));
      const productCoverage = (news.productCoverage || []).map(product => ({ ...product, area: `product:${product.productId || 'unsupported'}` }));
      const coverage = [...[inventory, news, packages, iocs, details, match].flatMap(stage => stage.coverage || []), ...sourceCoverage, ...productCoverage];
      if (!final || pending.size) coverage.push(...[...pending].map(stage => ({ area: stage, status: 'partial', deferred: true, reason: '収集は未完了。完了した観測だけを保存' })));
      const unreviewed = (match.newsAssessment || []).filter(item => item.needsReview).length;
      const collectionCoverage = assessmentStatus([inventory, iocs].flatMap(stage => stage.coverage || []));
      const queryCoverage = assessmentStatus([... [news, packages, details].flatMap(stage => stage.coverage || []), ...sourceCoverage, ...productCoverage]);
      const changes = compareAssessments(previous.assessmentSnapshot || [], match.findings || [], packages, coverage);
      if (changes.unconfirmed.length) coverage.push({ area: 'previous-positive-evidence', status: 'partial', count: changes.unconfirmed.length, reason: '以前の陽性を今回の範囲で再確認できないため保持。消失・未走査を解消としない' });
      const status = assessmentStatus(coverage, unreviewed);
      const finishedAt = new Date(context.wallNow()).toISOString();
      const commands = [inventory, news, packages, iocs, details].flatMap(stage => stage.commands || []);
      const nextState = buildNextState(store.state, news, finishedAt, '', status, { inventory, packages, details, changes, transport: context.transport });
      // 統合coverageを一度だけreportへ渡し、重複した未確認件数を避ける。
      const uniqueCoverage = [...new Map(coverage.map(entry => [`${entry.area}:${entry.status}:${entry.reason || ''}`, entry])).values()];
      const reportMatch = { ...match, coverage: uniqueCoverage };
      const report = renderReport({ inventory, news, packages, iocs, details: { ...details, coverage: [] }, match: reportMatch, changes,
        evidenceDirectory: '.', startedAt: context.startedAt, finishedAt, commands });
      return { evidence: { schemaVersion: 2, runId: context.runId, runStatus: status, collectionCoverage, queryCoverage, impact: match.impact || 'unconfirmed',
        inventory, news, packages, iocs, details, match: reportMatch, changes, metrics: context.metrics, diagnostics: context.diagnostics }, report, nextState, final };
    }

    async function checkpoint(final) {
      const captured = snapshot(final);
      lastCheckpoint = context.monotonicNow();
      saveQueue = saveQueue.then(async () => { saved = { ...await store.commit(captured), evidence: captured.evidence }; }).catch(error => {
        context.stop();
        throw error instanceof SweepError ? error : new SweepError('SAVE', { cause: causeClass(error), operation: 'checkpoint', writeOutcome: 'unknown' });
      });
      await saveQueue;
    }

    /** stage失敗を安全な診断と部分結果に変換する。保存失敗は隠さず上位へ返す。 @example await collect('inventory', collectInventory) */
    async function collect(name, work) {
      try { data[name] = await work(); }
      catch (error) {
        if (error instanceof SweepError && ['MSS_SAVE', 'MSS_LOCK', 'MSS_STATE'].includes(error.diagnostic.code)) { context.stop(); throw error; }
        const detail = context.record(error, 'READER', name === 'news' || name === 'adaptive' ? 'news' : name === 'packages' || name === 'details' ? name : 'inventory');
        data[name] = { ...data[name], coverage: [...(data[name]?.coverage || []), { area: name, status: 'partial', reason: detail.message, diagnostic: detail }] };
      }
      pending.delete(name);
      try { await checkpoint(false); } catch (error) { context.stop(); throw error; }
      return data[name];
    }

    const inventoryTask = collect('inventory', () => stages.inventory({ context, home, config: store.config, previous }));
    const newsTask = collect('news', () => stages.news({ context, previous, now: new Date(context.wallNow()), until: context.startedAt }));
    const packageTask = inventoryTask.then(inventory => collect('packages', () => stages.packages(inventory, { context, previous: previous.packageContinuation, state: previous, queryUnknownGlobals: store.config.queryUnknownGlobals })));
    const iocTask = inventoryTask.then(inventory => collect('iocs', () => stages.iocs(inventory, { context, rules, since: previous.lastRunAt, until: context.startedAt })));
    const detailTask = packageTask.then(packages => collect('details', () => stages.details(packages?.findings || [], context.wallNow() + context.remainingMs(), context.request,
      { context, previous: previous.advisoryContinuation, news: data.news })));
    const adaptiveTask = Promise.all([inventoryTask, newsTask]).then(([inventory, commonNews]) => collect('adaptive', () => stages.adaptive
      ? stages.adaptive(inventory, { context, previous, commonNews, now: new Date(context.wallNow()) }) : Promise.resolve({ coverage: [] })));
    const settled = await Promise.allSettled([inventoryTask, newsTask, packageTask, iocTask, detailTask, adaptiveTask]);
    const failed = settled.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    closing = true;
    await context.close();
    await saveQueue;
    await checkpoint(true);
    const evidence = saved.evidence;
    return { reportPath: saved.reportPath, evidenceDirectory: saved.evidenceDirectory, statePath: saved.statePath, generation: saved.generation,
      status: evidence.runStatus, runStatus: evidence.runStatus, collectionCoverage: evidence.collectionCoverage, queryCoverage: evidence.queryCoverage,
      impact: evidence.impact, elapsedMs: Math.max(0, context.monotonicNow() - startedMonotonic), findings: evidence.match.counts || {},
      newsItems: evidence.news.items?.length || 0, scannedPackages: evidence.packages.packages?.length || 0,
      codes: [...new Set(evidence.diagnostics.map(item => item.code))] };
  } finally {
    closing = true;
    await context?.close();
    await saveQueue.catch(() => {});
    await store.close();
  }
}

/** CLIの終了値と秘密を含まない診断を固定する。対話入力は要求しない。 @example await runCli(['--help']) */
export async function runCli(args = process.argv.slice(2), options = {}) {
  const stdout = options.stdout || (value => process.stdout.write(`${value}\n`));
  const stderr = options.stderr || (value => process.stderr.write(`${value}\n`));
  try {
    const parsed = parseRunnerArgs(args);
    if (parsed.help) { stdout('使用法: node scripts/run-sweep.mjs [--budget-ms 120000]\n対象は読み取り専用。~/security-reports/ と ~/.local/state/mac-security-sweep/ にだけ結果・継続状態を保存。部分レポートは終了値2。'); return 0; }
    const result = await runSweep({ ...options, ...parsed });
    stdout(JSON.stringify(result));
    return result.runStatus === 'partial' ? 2 : 0;
  } catch (error) {
    const rejected = error instanceof SweepError && ['MSS_CONFIG', 'MSS_STATE', 'MSS_LOCK'].includes(error.diagnostic.code);
    const detail = safeDiagnostic(error, 'INTERNAL', 'cli', rejected ? 'none' : 'unknown');
    stderr(`${detail.code}: ${detail.message}\n${detail.recovery}`);
    stdout(JSON.stringify({ runStatus: 'failed', code: detail.code, diagnostic: detail }));
    return detail.code === 'MSS_LOCK' ? 75 : ['MSS_CONFIG', 'MSS_STATE'].includes(detail.code) ? 64 : 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await runCli();
