import path from 'node:path';
import { aggregateAdvisories, assessmentStatus, coverageKind, normalizeSeverity, prioritizeFindings } from './assessment.mjs';
import { resolveLanguage, localizeDiagnostic } from './locale.mjs';
import { newsDateRange, newsWindowStatus } from './news-format.mjs';
import * as registry from './source-registry.mjs';

const TEXT = Object.freeze({
  ja: {
    unknown: '未確認', none: '該当なし', report: 'Mac セキュリティ巡回', important: '重要なニュース', local: 'このMacの確認結果',
    affected: '影響する可能性がある対象', unaffected: '対象条件に該当しないことを確認した対象', uncertain: '判断に必要な情報が不足している対象',
    iocs: '侵害の痕跡', ongoing: '継続して確認する項目', categories: 'カテゴリ別ニュース', gaps: '未確認・取得制限', actions: '次に確認すること',
    evidence: '証拠と情報源', runtimes: 'ランタイムの確認結果', sources: '情報源の取得状況', commands: '実行したコマンド',
    item: '対象・バージョン / 告知', verdict: '判定', observation: '観測', severity: '深刻度', fixed: '修正版', scope: '範囲', basis: '根拠',
    source: '出典', date: '公開', updated: '更新', fetched: '取得', relation: 'このMacとの関係', detail: '確認内容',
    count: '件数', windowCount: '期間内と確認できた記事数', status: '状態', category: '分類', period: '収集期間', fullEvidence: '全件の証拠',
    noHighlights: '今回取得したニュースに、優先表示の条件に合う項目はありません。取得範囲は情報源の表を参照してください。',
    noLocal: 'この区分の判定はありません。未確認の対象は別欄に残しています。',
    localPending: 'ローカルスキャンは未開始です。ニュースの取得結果だけを保存しています。',
    localPartial: 'ローカルスキャンは一部未完了です。完了した観測だけを示しています。',
    localDone: 'ローカルスキャンの処理が終了しました。対象外・取得失敗は未確認欄に残しています。',
    noIoc: '適用可能な指標の確認結果がありません。侵害の有無は未確認です。',
    iocLimit: '不一致は、記載した指標を今回観測できなかったことを示します。過去の侵害や、調べていないマルウェアの不在は証明しません。',
    noOngoing: '前回の陽性記録と、期間外で継続する告知はありません。',
    notRechecked: '前回の陽性記録・今回は再確認できず', lastObserved: '前回の観測',
    zeroNews: '今回の取得期間に該当する記事は0件でした。', missingNews: 'このカテゴリの最新情報を取得できていません。',
    noGaps: '処理上の未確認項目はありません。判定の対象は、このレポートに記載した範囲です。',
    noActions: '今回の結果から追加の対策は提案しません。未確認項目があれば、その確認を先に進めてください。',
    evidenceLimit: '調査対象は変更していません。脆弱性の対象条件への一致と、侵害・窃取の成立は別の判定です。',
    negativeLimit: '「影響なし」は、記載したバージョン・配布元・告知・取得時点の範囲での判定です。Mac全体の安全を示すものではありません。',
    dependencyLimit: 'ロック記録はインストールや実行の証明ではありません。',
    partialTranslation: '指定言語への翻訳は未完了です。以下は保存済みの基準レポートです。スキャンを繰り返さず、このレポートを翻訳してください。',
    findingsCount: '判定数', scopeUnknown: '範囲の詳細は証拠を参照', detailNeeded: '一次資料で対象条件を確認',
    defaultReason: '記録したバージョン・観測・情報源を参照してください。',
    fixDependencies: '影響する依存の利用箇所・外部入力への到達性と、告知の修正版を確認して更新を計画してください。ロック記録だけで全資格情報のローテーションを必須としません。',
    fixProducts: '影響するアプリ・ランタイムの配布元、利用状況、告知に記載された修正版を確認して更新を計画してください。',
    fixIncident: '悪性配布の入手元・実物・実行痕跡を確認してください。ロック一致だけで隔離・失効を必須にしません。実行・窃取を確定するには追加の証拠が必要です。',
    fixIoc: '一致したファイルや実行痕跡の証拠を保全し、必要な封じ込めを本人へ提案してください。停止・削除・認証変更は実行しません。',
    fixGaps: '取得に失敗した情報源と未確認の対象を補完してください。再試行は、記録した待機期限・提供元の復旧・形式修正を確認してから行います。',
    firstPriority: '未確認の情報源・対象製品を補完して判断',
  },
  en: {
    unknown: 'Unassessed', none: 'None recorded', report: 'Mac security sweep', important: 'Important news', local: 'Results for this Mac',
    affected: 'Potentially affected components', unaffected: 'Components outside the assessed affected conditions', uncertain: 'Components needing more evidence',
    iocs: 'Compromise indicators', ongoing: 'Ongoing items', categories: 'News by category', gaps: 'Coverage gaps and limits', actions: 'Next checks',
    evidence: 'Evidence and sources', runtimes: 'Runtime observations', sources: 'Source receipts', commands: 'Commands executed',
    item: 'Component and version / advisory', verdict: 'Assessment', observation: 'Observation', severity: 'Severity', fixed: 'Fixed version', scope: 'Scope', basis: 'Evidence',
    source: 'Source', date: 'Published', updated: 'Updated', fetched: 'Retrieved', relation: 'Relevance to this Mac', detail: 'Recorded basis',
    count: 'Count', windowCount: 'Confirmed in-window articles', status: 'Status', category: 'Classification', period: 'Discovery window', fullEvidence: 'Complete evidence',
    noHighlights: 'No retrieved item meets the priority criteria for this report. Check the source receipts for the collection scope.',
    noLocal: 'No assessment is listed in this group. Unassessed components remain in the coverage gaps.',
    localPending: 'The local scan has not started. This checkpoint contains public news only.',
    localPartial: 'The local scan is incomplete. Only completed observations are shown.',
    localDone: 'Local collection has finished. Exclusions and retrieval failures remain in the coverage gaps.',
    noIoc: 'No applicable indicator checks are available. Compromise remains unassessed.',
    iocLimit: 'A nonmatch means that the specified indicator was not observed by this check. It does not establish the absence of past compromise or other malware.',
    noOngoing: 'No previous positive records or ongoing advisories outside the discovery window are listed.',
    notRechecked: 'Previously positive; not rechecked in this run', lastObserved: 'Previous observation',
    zeroNews: 'The successful query returned no articles within this discovery window.', missingNews: 'Current information for this category was not retrieved.',
    noGaps: 'No processing gaps are recorded. Assessments apply only to the scope described in this report.',
    noActions: 'No additional action is proposed from these results. Resolve any unassessed items before drawing broader conclusions.',
    evidenceLimit: 'The inspected system was not modified. Matching affected conditions does not establish successful exploitation or data theft.',
    negativeLimit: 'A non-affected assessment applies to the recorded version, distribution, advisory and retrieval time. It is not a safety judgment for the entire Mac.',
    dependencyLimit: 'A lockfile record does not prove installation or execution.',
    partialTranslation: 'The requested-language translation is pending. This is the saved canonical report. Translate it without repeating the scan.',
    findingsCount: 'Assessment count', scopeUnknown: 'See the evidence for the precise scope', detailNeeded: 'Check the affected conditions in the primary source',
    defaultReason: 'Use the recorded version, observation and source to review this assessment.',
    fixDependencies: 'Check the affected dependencies, reachable inputs and advisory-specific fixed versions before planning updates. Lockfile matches alone do not require rotating every credential.',
    fixProducts: 'Check the affected applications and runtimes, their distribution, current use and advisory-specific fixed versions before planning updates.',
    fixIncident: 'Verify the malicious distribution, installed files and execution evidence. A lockfile match alone does not require isolation or revocation; execution and theft need separate evidence.',
    fixIoc: 'Preserve the matching file or execution evidence and propose any necessary containment to the owner. Do not stop processes, delete files or change credentials.',
    fixGaps: 'Complete failed source queries and unassessed checks. Retry only after the recorded cooldown, provider recovery or schema correction.',
    firstPriority: 'Complete missing source and component checks',
  },
});

const STATUS = Object.freeze({
  '確定': ['固有IOCの一致', 'Specific indicator matched'], '可能性高': ['影響する可能性が高い', 'Likely affected'],
  '可能性あり': ['影響を判断できず', 'Unassessed'], '影響なし': ['影響なし（記載範囲）', 'Not affected within the assessed scope'],
  '関係あり': ['関連あり', 'Related'], '関係なし': ['関連の根拠なし', 'No recorded relevance'], '確認候補': ['要確認', 'Needs assessment'],
  complete: ['完了', 'Complete'], 'complete-with-exclusions': ['完了・対象外あり', 'Complete with exclusions'], partial: ['一部未完了', 'Partial'],
  pending: ['未開始', 'Not started'], failed: ['取得失敗', 'Failed'], unavailable: ['取得できず', 'Unavailable'], ok: ['取得成功', 'Retrieved'],
  fresh: ['今回取得', 'Retrieved in this run'], timeout: ['期限到達', 'Timed out'], unconfirmed: ['未確認', 'Unassessed'],
  excluded: ['方針上の対象外', 'Excluded by policy'], deferred: ['上限による持越し', 'Deferred by a limit'],
  'not-read': ['読取対象外', 'Not read'], absent: ['検出なし（確認範囲内）', 'Absent within checked scope'],
  'not-applicable': ['対象外', 'Not applicable'], 'not-required': ['翻訳不要', 'Not required'],
  matched: ['一致', 'Matched'], 'no-match': ['不一致', 'No match'], unsupported: ['未対応', 'Unsupported'],
  HIGH: ['高', 'High'], CRITICAL: ['緊急', 'Critical'], MEDIUM: ['中', 'Medium'], LOW: ['低', 'Low'], UNKNOWN: ['未評価', 'Unrated'],
});
const EXTRA_REFERENCE_HOSTS = new Set(['osv.dev', 'nvd.nist.gov', 'www.cve.org', 'github.com', 'support.apple.com', 'developer.apple.com',
  'chromereleases.googleblog.com', 'nodejs.org', 'www.mozilla.org', 'www.openssl.org', 'openssl-library.org', 'www.php.net', 'www.ruby-lang.org',
  'openjdk.org', 'www.oracle.com', 'www.docker.com', 'docs.docker.com', 'security-tracker.debian.org', 'www.debian.org', 'ubuntu.com',
  'access.redhat.com', 'secdb.alpinelinux.org', 'alpinelinux.org', 'www.kernel.org', 'www.cisa.gov', 'blogs.jpcert.or.jp', 'www.microsoft.com',
  'imagemagick.org', 'www.electronjs.org', 'brew.sh', 'docs.brew.sh']);

/**
 * Render external values as literal Markdown text without HTML, headings or table injection.
 * Every report presenter uses this at the point where data enters the document.
 *
 * @example
 * escapeReportText('[title](javascript:alert(1))');
 */
export function escapeReportText(value, limit = 500) {
  return String(value ?? '').slice(0, limit).replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\\`*_{}\[\]()#+!|~]/g, '\\$&')
    // Prevent GFM from turning untrusted plain URLs or addresses into automatic links.
    .replace(/\b(https?|ftp):\/\//gi, '$1&#58;//').replace(/\bwww\./gi, 'www&#46;').replace(/@/g, '&#64;');
}

/**
 * Accept only HTTPS source links from the finite source registry and reviewed reference hosts.
 * The report and translation-delivery validator call this before creating a clickable link.
 *
 * @example
 * safeSourceUrl('https://osv.dev/vulnerability/GHSA-example');
 */
export function safeSourceUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f<>\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    const hosts = new Set([...EXTRA_REFERENCE_HOSTS, ...(registry.SOURCE_REFERENCE_HOSTS || []), ...(registry.SOURCES || []).map(source => new URL(source.url).hostname)]);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !hosts.has(url.hostname)) return null;
    // CISA's fixed public CVE filter is an identifier; arbitrary query values remain forbidden.
    const cisaFilter = url.hostname === 'www.cisa.gov' && url.pathname === '/known-exploited-vulnerabilities-catalog'
      && [...url.searchParams.keys()].length === 1 && /^CVE-\d{4}-\d{4,}$/.test(url.searchParams.get('field_cve') || '');
    if (url.search && !cisaFilter) return null;
    return url.href.replace(/[()[\]*_!]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  } catch { return null; }
}

/** Create a source link only after its destination passes the shared boundary. @example sourceLink(item.url, 'Source') */
function sourceLink(value, label) { const url = safeSourceUrl(value); return url ? `[${escapeReportText(label)}](${url})` : ''; }

/** Preserve the existing date-based filename convention independently of report language. @example jstDate(new Date('2026-10-30T23:00:00Z')) */
export function jstDate(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Translate finite machine labels while retaining unknown identifiers literally. @example label('partial', 'en') */
function label(value, language) { return STATUS[value]?.[language === 'ja' ? 0 : 1] || escapeReportText(value || TEXT[language].unknown); }

/** Find an advisory detail through its canonical identifier or aliases. @example detailFor(finding, details) */
function detailFor(finding, details) {
  const ids = new Set([finding.advisoryId, finding.id, ...(finding.aliases || [])]);
  return details.find(detail => ids.has(detail.id) || (detail.aliases || []).some(id => ids.has(id)));
}

/** Keep the observed target separate from editorial titles and untranslated source summaries. @example targetText(finding, 'en') */
function targetText(finding, language) {
  const versions = finding.version || [...new Set((finding.runtimeEvidence || []).map(item => item.version).filter(Boolean))].join(', ');
  const identity = [finding.package?.name || finding.product || finding.productId, versions].filter(Boolean).join(' ');
  return escapeReportText(identity || finding.title || finding.advisoryId || finding.id || TEXT[language].unknown);
}

/** Format supported evidence semantics without treating raw source prose as translated explanation. @example observationText(finding, 'en') */
function observationText(finding, language) {
  const ja = language === 'ja';
  if (finding.status === '確定') return ja ? '固有IOCの一致' : 'Specific indicator match';
  if (finding.incident) return ja ? '悪性配布の疑い・実行は未確認' : 'Suspected malicious distribution; execution unconfirmed';
  if (finding.category === 'update-review') return finding.status === '影響なし'
    ? (ja ? '製品バージョンを確認' : 'Product version observed') : (ja ? '更新情報の確認が必要' : 'Update advisory needs review');
  if (finding.impact?.executionConfirmed) return ja ? '対象の実行とバージョンを確認' : 'Target execution and version observed';
  if (finding.impact?.installationConfirmed) return ja ? 'インストール済みのバージョンを確認' : 'Installed version observed';
  if (finding.impact?.kind === 'image-record-affected') return ja ? '画像digestと結合したSBOM記録' : 'SBOM record bound to the image digest';
  return finding.package ? (ja ? 'ロック/グローバル記録・実物は未確認' : 'Lockfile/global record; installation unconfirmed') : (ja ? '製品メタデータ' : 'Product metadata');
}

/** Retain exact negative-proof bounds and identifiers in both native languages. @example findingReason(finding, 'en') */
function findingReason(finding, language) {
  const t = TEXT[language];
  if (language === 'ja' && finding.reasonCode === 'package-osv-affected' && finding.impact?.installationConfirmed) return 'OSVが対象版と判定。インストール済みのバージョンを確認しましたが、入手元・実行条件・侵害の有無は別途確認が必要です。';
  if (language === 'ja' && finding.reason) return escapeReportText(finding.reason);
  if (language === 'ja') return finding.status === '影響なし' ? '記録した対象は、この告知の対象条件に該当しません。バージョン・配布元・確認範囲は証拠を参照してください。'
    : finding.status === '可能性高' ? '記録した対象が脆弱性の対象条件に一致しています。実際の利用条件と侵害の有無は追加確認が必要です。'
      : finding.status === '確定' ? '固有の指標が一致しました。この検査で確認した内容に限る判定です。' : t.defaultReason;
  const reasons = {
    'not-installed': 'The target was not found within the completed inventory scope.',
    'version-not-affected': 'The observed version falls outside the advisory’s affected range.',
    'fixed-version': 'The observed version includes the advisory-specific fix.',
    'affected-version': 'The observed version matches the advisory’s affected range.',
    'origin-unverified': 'Package origin is unverified; applicability cannot be established.',
    'unsupported-comparator': 'This version scheme has no verified comparator.',
    'conflicting-evidence': 'Official evidence conflicts; applicability remains unassessed.',
    'history-incomplete': 'The relevant advisory history has not been fully checked.',
    'identity-unverified': 'The product, distribution or release identity is unverified.',
    'package-malicious-record': 'The recorded package version matches a malicious distribution advisory. Installation, execution and theft remain separate checks.',
    'package-osv-affected': 'OSV lists the exact queried package version as affected. Check its recorded origin and use before assessing reachability.',
    'package-advisory-affected': 'The package version matches the structured advisory range.',
    'package-range-unsupported': 'The advisory range cannot be compared with this version scheme.',
    'advisory-conflict': 'Official records disagree about applicability. The result remains unassessed.',
    'rule-unverified': 'The advisory rule has not been verified within its required review period.',
    'rule-version-affected': 'The observed product version matches the verified advisory range.',
    'rule-version-unsupported': 'The observed version cannot be compared using this rule.',
    'rule-inventory-partial': 'The required product inventory is incomplete.',
    'rule-version-not-affected': 'The observed product version falls outside this verified advisory range.',
    'security-release-review': 'A security update exists for the observed macOS major version. Review its advisory; the release index alone does not establish CVE applicability.',
    'security-release-reached': 'The observed product version has reached this security release. This comparison does not establish the absence of other vulnerabilities.',
    'ioc-file-match': 'The exact file matched a published indicator. This establishes file presence, not execution or theft.',
    'ioc-supporting-match': 'Supporting indicator metadata matched. More evidence is required to establish compromise.',
  };
  const code = finding.reasonCode;
  const base = reasons[code] || (finding.status === '影響なし'
    ? 'The recorded target was assessed outside the affected conditions. Use the exact version, provenance and source scope below.'
    : finding.status === '可能性高' ? 'The recorded target matches affected conditions. Exploit reachability and compromise require separate evidence.'
      : finding.status === '確定' ? 'A specific indicator matched. The check establishes only the observation described here.'
        : t.defaultReason);
  return escapeReportText(base);
}

/** Show one target per row, with local evidence retained in the complete evidence artifact. @example findingTable(findings, details, 'en') */
function findingTable(findings, details, language) {
  const t = TEXT[language];
  if (!findings.length) return t.noLocal;
  return [`| ${t.verdict} | ${t.item} | ${t.observation} | ${t.severity} | ${t.fixed} | ${t.scope} | ${t.basis} |`, '|---|---|---|---|---|---|---|', ...findings.map(finding => {
    const detail = detailFor(finding, details);
    const severity = normalizeSeverity(detail?.severity || finding.severity);
    const fixed = finding.fixed || detail?.fixed?.filter(value => value.name === finding.package?.name && (!value.ecosystem || value.ecosystem === finding.package?.ecosystem)).map(value => value.version).join(', ');
    const scope = language === 'en' ? (finding.scope || '').split(' / ').filter(Boolean)
      .map(value => ({ '仕事': 'Work', '個人・その他': 'Personal / other', '端末': 'Host' }[value] || t.scopeUnknown)).join(' / ') || t.scopeUnknown : finding.scope || '端末';
    const source = [...(finding.sources || []), ...(detail?.references || []).map(value => typeof value === 'string' ? value : value.url)].find(safeSourceUrl);
    const bounds = [finding.package?.ecosystem, finding.distribution || finding.package?.distribution, finding.release || finding.package?.distributionRelease,
      finding.package?.architecture, finding.package?.sourcePackage, finding.package?.sourceVersion, finding.historyScope, finding.assessmentBasis,
      finding.verifiedAt ? `${language === 'ja' ? 'ルール確認' : 'Rule verified'}: ${finding.verifiedAt}` : '',
      finding.fetchedAt || finding.queriedAt || finding.observedAt].filter(value => typeof value === 'string' && value).map(value => escapeReportText(value)).join(' / ');
    const identifiers = [...new Set([finding.advisoryId || finding.id, ...(finding.aliases || [])].filter(Boolean))].map(value => escapeReportText(value)).join(' / ');
    return `| ${label(finding.status, language)} | ${targetText(finding, language)}; ${identifiers} | ${observationText(finding, language)} | ${label(severity.level, language)}${severity.score === null ? '' : ` ${severity.score}`} | ${escapeReportText(fixed || t.detailNeeded)} | ${escapeReportText(scope)} | ${findingReason(finding, language)} ${bounds} ${sourceLink(source, t.source)} |`;
  })].join('\n');
}

/** Merge classifier fields with retrieved item metadata without losing broad news at a news-only checkpoint. @example assessedNews(news, match) */
function assessedNews(news, match) {
  const classified = new Map((match.newsAssessment || []).map(item => [item.id, item]));
  const items = (news.items || []).map(item => ({ ...item, ...(classified.get(item.id) || {}) }));
  const ids = new Set(items.map(item => item.id));
  return [...items, ...(match.newsAssessment || []).filter(item => !ids.has(item.id))];
}

/** Rank and alias-deduplicate priority news; raw timestamps break equal-priority ties deterministically. @example importantNews(items, findings, [], Date.now()) */
function importantNews(items, findings, details, now) {
  const aliases = aggregateAdvisories([...items, ...findings], details).canonicalIds;
  const positive = new Set(findings.filter(finding => ['確定', '可能性高'].includes(finding.status)).map(finding => aliases[finding.advisoryId || finding.id] || finding.advisoryId || finding.id));
  const scored = items.map(item => {
    const detail = detailFor(item, details);
    // 取り下げ済み告知は保存するが、現在対応すべき重要ニュースには選ばない。
    if (item.withdrawnAt || item.withdrawn || detail?.withdrawn) return null;
    const severity = normalizeSeverity(item.severity || detail?.severity);
    const local = item.relevance === '関係あり' || positive.has(aliases[item.id] || item.id);
    const active = item.knownExploited === true || detail?.knownExploited === true;
    const dateRange = newsDateRange(item);
    const timestamp = Date.parse(dateRange?.start || item.updatedAt || item.modified || item.publishedAt || '');
    return { ...item, knownExploited: active, _id: aliases[item.id] || item.id || item.url, _local: local, _severity: severity,
      _rank: [local && (active || item.advisoryType === 'malware') ? 1 : 0, active ? 1 : 0, severity.rank, local ? 1 : 0,
        dateRange && timestamp >= now - 86400000 && Date.parse(dateRange.endExclusive) <= now + 1 ? 1 : 0, Number.isFinite(timestamp) ? timestamp : 0] };
  }).filter(item => item && (item._local || item.knownExploited || item._severity.rank >= 3));
  scored.sort((left, right) => {
    for (let index = 0; index < left._rank.length; index++) if (left._rank[index] !== right._rank[index]) return right._rank[index] - left._rank[index];
    return String(left._id).localeCompare(String(right._id));
  });
  const seen = new Set();
  const unique = scored.filter(item => { if (seen.has(item._id)) return false; seen.add(item._id); return true; });
  const highlights = unique.slice(0, 5);
  const local = unique.find(item => item._local && (item.knownExploited || item._severity.rank >= 3));
  const global = unique.find(item => !item._local && (item.knownExploited || item._severity.rank >= 4));
  // どちらかの大量の記事で、重要なローカル情報または世界の悪用情報を押し出さない。
  for (const candidate of [local, global].filter(Boolean)) {
    if (highlights.some(item => item._id === candidate._id)) continue;
    if (highlights.length === 5) {
      const index = highlights.findLastIndex(item => item !== local && item !== global);
      highlights.splice(index, 1);
    }
    highlights.push(candidate);
  }
  return unique.filter(item => highlights.includes(item));
}

/** Explain news relevance without promoting product-name matches to exposure or absence proof. @example relevanceText(item, 'en') */
function relevanceText(item, language) {
  if (language === 'ja' && item.reason) return escapeReportText(item.reason, 250);
  const reasons = {
    'news-ambiguous-editor': 'An extension record exists, but its editor distribution is unverified.',
    'news-editor-context': 'The editor is present. The affected extension and any removed extension history need separate checks.',
    'news-structured-match': 'A structured advisory target matches the recorded package identity. Check the version and origin in the local assessment.',
    'news-target-not-observed': 'The target was not found in the completed extraction scope. Unscanned locations remain outside this conclusion.',
    'news-inventory-incomplete': 'The local inventory is incomplete; relevance has not been determined.',
    'news-summary-only': 'A product is mentioned only in the summary. Confirm the affected product and platform in the advisory.',
    'news-product-match': 'A recorded product name matches. Confirm its affected version and distribution.',
    'news-text-candidate': 'The article is a possible match; the affected package or extension identity is unverified.',
    'news-no-local-evidence': 'The collected evidence does not establish local relevance. This does not prove the product is unused.',
    'news-other-platform': 'The advisory concerns a different operating system or channel. No conclusion is made about another device.',
  };
  if (language === 'en' && reasons[item.reasonCode]) return reasons[item.reasonCode];
  if (item.relevance === '関係あり') return language === 'ja' ? '製品名が一致。対象バージョン・配布元を個別に確認' : 'A recorded product matches; version and distribution require an individual assessment.';
  if (item.relevance === '関係なし') return language === 'ja' ? '収集した範囲では関連の根拠なし。未使用の証明ではない' : 'No relevance was established within the collected scope. This does not prove the product is unused.';
  return language === 'ja' ? 'ローカルの対象条件は未確認' : 'Local applicability remains unassessed.';
}

/** Display the published precision without turning a known month into an invented day. @example newsDateText({publishedMonth:'2026-10'}, 'publishedAt', 'en') */
function newsDateText(item, field, language) {
  const range = newsDateRange(item);
  const month = item[field === 'publishedAt' ? 'publishedMonth' : 'updatedMonth'] || (range?.precision === 'month' && range.field === field ? range.start.slice(0, 7) : null);
  if (month) return `${escapeReportText(month)} (${language === 'ja' ? '日付は月まで判明' : 'day not provided'})`;
  if (range?.precision === 'day' && range.field === field) return range.start.slice(0, 10);
  return escapeReportText(item[field] || (field === 'updatedAt' ? item.modified : null) || TEXT[language].unknown);
}

/** Keep dates, source links and applicability together in either the highlight or category list. @example newsLine(item, 'en', true) */
function newsLine(item, language, important = false) {
  const t = TEXT[language];
  const title = escapeReportText(item.title || item.id || t.unknown, 260);
  const heading = important ? `**${title}**` : title;
  if (item.withdrawnAt || item.withdrawn) return `- ${heading}\n  ${language === 'ja' ? '取り下げ済み' : 'Withdrawn'}: ${escapeReportText(item.withdrawnAt || item.withdrawn)}. ${language === 'ja' ? '現在の影響判定には使用しません。' : 'Not used to establish current exposure.'} ${sourceLink(item.url, t.source)}`;
  const known = item.knownExploited ? (language === 'ja' ? '悪用確認あり。' : 'Known exploitation. ') : '';
  const dates = `${t.date}: ${newsDateText(item, 'publishedAt', language)}; ${t.updated}: ${newsDateText(item, 'updatedAt', language)}`;
  const source = sourceLink(item.url, t.source);
  return `- ${heading}${source ? ` (${source})` : ''}\n  ${dates}. ${label(item.relevance || 'unconfirmed', language)}. ${known}${relevanceText(item, language)}`;
}

/** Explain date uncertainty separately from a successful empty query. Category rows and source receipts call this. @example undatedNewsText(24, 'en') */
function undatedNewsText(count, language) {
  return language === 'ja' ? `公開日・更新日が不明な記事が${count}件あり、収集期間内の記事か判定できません。`
    : `Publication and update dates are unavailable for ${count} ${count === 1 ? 'article' : 'articles'}; whether they fall within the discovery window is unconfirmed.`;
}

/** Preserve old receipts without treating undated or out-of-window items as current news. Category rendering calls this after collection. @example categoryNewsCounts(items, receipt, news.window) */
function categoryNewsCounts(items, receipt, window) {
  const statuses = items.map(item => newsWindowStatus(item, window));
  const since = Date.parse(window?.since || ''), until = Date.parse(window?.until || '');
  const undatedCount = Number.isSafeInteger(receipt?.undatedCount) && receipt.undatedCount >= 0 ? receipt.undatedCount : statuses.filter(value => value === 'undated').length;
  // New receipts provide exact counts; older receipts need an explicit window before dates can be counted.
  const datedItemCount = Number.isSafeInteger(receipt?.datedItemCount) && receipt.datedItemCount >= 0 ? receipt.datedItemCount
    : Number.isFinite(since) && Number.isFinite(until) ? statuses.filter(value => value === 'confirmed').length
      : items.length ? null : 0;
  const uncertainItemCount = Number.isSafeInteger(receipt?.uncertainItemCount) && receipt.uncertainItemCount >= 0 ? receipt.uncertainItemCount : statuses.filter(value => value === 'possible').length;
  const impreciseCount = Number.isSafeInteger(receipt?.impreciseCount) && receipt.impreciseCount >= 0 ? receipt.impreciseCount : items.filter(item => newsDateRange(item)?.precision === 'month').length;
  const unclassifiedCount = Number.isSafeInteger(receipt?.unclassifiedCount) && receipt.unclassifiedCount >= 0 ? receipt.unclassifiedCount : items.filter(item => item.categoryStatus === 'unconfirmed').length;
  return { undatedCount, datedItemCount, uncertainItemCount, impreciseCount, unclassifiedCount };
}

/** Keep timing and product-classification uncertainty separate from a confirmed empty result. @example categoryCountNotes({undatedCount:0,uncertainItemCount:1,impreciseCount:1,unclassifiedCount:0}, 'en') */
function categoryCountNotes(counts, language) {
  const ja = language === 'ja', notes = [];
  if (counts.undatedCount) notes.push(undatedNewsText(counts.undatedCount, language));
  if (counts.impreciseCount) notes.push(ja ? `${counts.impreciseCount}件は年月のみ判明しています。` : `${counts.impreciseCount} ${counts.impreciseCount === 1 ? 'article is' : 'articles are'} dated only to the month.`);
  if (counts.uncertainItemCount) notes.push(ja ? `${counts.uncertainItemCount}件は日付の精度が足りず、期間内か確定できません。` : `${counts.uncertainItemCount} ${counts.uncertainItemCount === 1 ? 'article lacks' : 'articles lack'} enough date precision to confirm whether they fall within the discovery window.`);
  if (counts.unclassifiedCount) notes.push(ja ? `${counts.unclassifiedCount}件は製品・OSの分類が未確認で、その他のニュースに保持しています。` : `${counts.unclassifiedCount} ${counts.unclassifiedCount === 1 ? 'article has' : 'articles have'} unconfirmed product or OS classification and ${counts.unclassifiedCount === 1 ? 'remains' : 'remain'} in general news.`);
  return notes.join(' ');
}

// 既存readerの固定説明を有限コードへ対応付け、言語を変えても具体的な未確認範囲を残す。
const COVERAGE_REASONS = Object.fromEntries([
  ['discovery-resume', '同じroot実体のfrontier・directory位置を保存し、通常の再実行で継続します。リンク・依存/build配下は探索しません。', 'The same root identity and directory frontier are saved for the next normal run. Symlinks, dependency directories and build output are not explored.'],
  ['discovery-depth', '探索の深さ上限より下に未確認のdirectoryがあります。後続runでも未確認を保持し、完走後は同じrootを再確認します。', 'Directories below the depth limit remain unassessed across subsequent runs. After completing the traversal, the same roots are checked again.'],
  ['discovery-page', '現在のpageのみ再確認。以前のpageは保存済みレポートの証拠であり、今回の全件鮮度を意味しません。', 'Only the current discovery page was rechecked. Earlier pages remain evidence from previous saved reports, not fresh observations from this run.'],
  ['scan-root-excluded', 'ホーム直下の認証領域・Library・リンクは探索対象にできません。', 'Authentication directories directly under the home, Library and symlink roots are excluded from project discovery.'],
  ['ssh-metadata-only', '鍵・設定本文は読まず、存在・権限・時刻だけを確認します。authorized_keysの行数は本文を開かないためunknownです。', 'Only SSH file existence, permissions and timestamps were checked. Key and configuration contents were not read; the authorized_keys line count remains unknown.'],
  ['os-status-only', 'status表示だけを使用。Gatekeeperのオンラインassess、権限変更、保護設定の修復は行いません。', 'Only protection status was read. No online Gatekeeper assessment, permission change or protection repair was performed.'],
  ['os-platform-unsupported', 'macOS以外のOS保護状態は未対応です。', 'Protection-state inspection is unsupported for operating systems other than macOS.'],
  ['sbom-digest-scope', '既存のCycloneDX/SPDXを画像digestと照合。未結合SBOM・由来未確認のpackageは照会や画像内部の確認完了に使いません。', 'Existing CycloneDX/SPDX records were matched to image digests. Unbound SBOMs and packages of unverified origin cannot establish image-content coverage or authorize queries.'],
  ['xprotect-metadata-only', 'OSの配置差・権限制限を保持。版metadataだけでは最新性や過去の検知を断定しません。', 'OS layout differences and permission restrictions remain recorded. XProtect version metadata alone does not establish current protection or past detections.'],
  ['cloud-existence-only', 'クラウド設定は存在のみ。本文・認証値・利用アカウントは取得しません。', 'Only cloud configuration existence was checked. Contents, credentials and account identities were not collected.'],
  ['application-metadata-only', 'Info.plist・既存の同梱版metadata・署名表示だけを確認。チケットの存在は公証の有効性を証明しません。', 'Only Info.plist, existing bundled-version metadata and signature displays were inspected. The presence of a notarization ticket does not prove that notarization is valid.'],
  ['editor-reader-unsupported', 'エディタを検出しましたが、この製品の拡張metadata readerは未対応です。', 'The editor was detected, but extension metadata inspection is unsupported for this product.'],
  ['safari-enablement-unknown', 'Safari appex metadataを確認。有効状態は安全な既存metadataで確認できないためunknownです。', 'Safari appex metadata was inspected. Extension enablement remains unknown because safe existing metadata does not establish it.'],
  ['background-enablement-unknown', '背景項目の識別子と静的LoginItemsだけを確認。有効状態・権限制限の領域はunknownです。', 'Only background-item identifiers and static LoginItems were inspected. Enablement and permission-restricted areas remain unknown.'],
  ['cron-hooks-metadata-only', 'cronは行数、shell hookは存在metadataのみ。本文は保存しません。', 'Only cron line counts and shell-hook existence metadata were collected. Their contents were not retained.'],
  ['network-current-user-tcp', '現在の利用者に見えるTCP接続のみ。UDP・過去の通信・権限制限の領域は未確認です。', 'Only current TCP connections visible to this user were observed. UDP, historical traffic and permission-restricted areas remain unassessed.'],
  ['parent-process-scope', '親processの稼働は依存のロードやデプロイ版の証拠ではありません。', 'A running parent process does not prove that a dependency was loaded or establish its deployed version.'],
  ['lock-origin-unverified', '由来未確認・不正recordを未確認として保持。省略された既定registryは公開の根拠にしない', 'Unverified-origin and invalid records remain unassessed. An omitted default registry is not evidence of public origin.'],
  ['lock-public-records', 'recordに明記された公開配布先と固定版だけを抽出', 'Only exact versions with an explicitly recorded public distribution source were extracted.'],
  ['lock-private-excluded', '解析済みのprivate/Git/local依存は方針上の対象外。公開由来の固定版だけを照会する', 'Parsed private, Git and local dependencies are excluded by policy. Only exact versions with verified public origin are queried.'],
  ['record-page-capacity', 'このlockの抽出済みrecordは次の有限ページで照会する', 'The records extracted from this lockfile are deferred to the next bounded query page.'],
  ['bounded-record-page', 'record合計15000件以内で照会。現在ページの照会・詳細完了後に保留lock/global/SBOMへ進む', 'Each page contains at most 15000 records. Pending lockfile, global and SBOM records follow after the current page queries and advisory details finish.'],
  ['lock-revalidated-origin', '新規/変更lockの抽出上限とは別に、以前のlockも現在のbounded本文で公開性を再確認', 'Previously seen lockfiles are revalidated against their current bounded contents, independently of the extraction limit for new or changed files.'],
  ['global-origin-exception', '由来未検証のinstalled-global例外を明示。lock/SBOMには適用しない。queryUnknownGlobals=falseで停止可能', 'The unverified-origin exception applies only to installed-global records, not lockfiles or SBOMs. Set queryUnknownGlobals=false to disable it.'],
  ['record-origin-separation', '同一名・版でも由来と方針除外を独立保持。未確認を除外によって隠さない', 'Origin and policy exclusions remain separate even for identical names and versions. Exclusions do not conceal unassessed records.'],
  ['osv-resume-scope', '現在の由来と一致する24時間以内の未完了照会だけ再開。全ページ成功を完了とする', 'Only incomplete queries less than 24 hours old with matching current provenance are resumed. A query is complete only after all its pages succeed.'],
  ['package-installation-scope', '影響版と名前が一致する実物だけを観測。不在は未使用・未実行の証明にしない', 'Only installed objects matching the affected name and version were observed. Absence does not prove that the package was never used or executed.'],
  ['ioc-no-verified-rules', 'no-verified-ioc-rules', 'No verified applicable indicator rules are available. Compromise remains unassessed.', '検証済みで適用可能な指標がありません。侵害の有無は未確認です。'],
  ['ioc-key-contents-excluded', '鍵本文は読みません。未読を無影響の根拠にしません。', 'Key contents were not read. Unread data is not evidence of non-impact.'],
  ['advisory-details-pending', '現在の許可query結果のIDのみGET。応答ID一致を検証し、未処理詳細を保持', 'Details are fetched only for IDs returned by currently authorized queries. Response IDs are verified and unprocessed details remain pending.'],
  ['product-source-unsupported', '既知の公式情報源registryに対応がない製品。導入検出のみで脆弱性照合済みとはしない', 'No maintained official-source adapter covers this product. Detecting installation does not establish vulnerability assessment coverage.'],
  ['product-channel-unverified', '配布チャネルを確認できない。履歴は候補として保持し別チャネルの修正版を適用しない', 'The distribution channel is unverified. Historical entries remain candidates; fixes from another channel are not applied to this product.'],
  ['product-history-scope', '更新履歴baselineを確認。CVE影響開始版・実行条件の網羅は未確認', 'The release-history baseline was retrieved. Complete CVE affected-version ranges and execution conditions remain unassessed.'],
  ['product-history-incomplete', '差分フィードまたは取得未完了。導入製品の過去の全脆弱性baselineは未確認', 'Only an incremental feed or incomplete retrieval is available. The installed product’s full vulnerability history remains unassessed.'],
  ['source-registry-review', '情報源の定義・schema・取得方法は最終確認から30日で再確認。自動登録や任意URL追加は行わない', 'Source definitions, schemas and retrieval methods require review after 30 days. Sources are not registered automatically and arbitrary URLs are not added.'],
  ['homebrew-record-scope', '公式DBの収録済みpatch修正だけを比較。未収録・cask・custom tapを無脆弱性と判定しない', 'Only patch fixes recorded in the official Homebrew database are compared. Missing entries, casks and custom taps are not declared vulnerability-free.'],
  ['source-success-history', '情報源の成功と履歴範囲を確認', 'Source retrieval and historical coverage are assessed separately; retrieval alone does not establish complete history.'],
  ['source-retention-limit', 'Feed retention and update dates are provider-dependent; older omissions remain unknown.', 'Feed retention and update dates depend on the provider. Older omissions remain unassessed.', 'フィードの保存期間と更新日は配信元に依存します。過去の記事の欠落は未確認です。'],
  ['stage-not-finished', '収集は未完了。完了した観測だけを保存', 'Collection is unfinished. Only completed observations have been saved.'],
  ['previous-positive-unconfirmed', '以前の陽性を今回の範囲で再確認できないため保持。消失・未走査を解消としない', 'Previous positive evidence is retained because this run could not recheck it. Disappearance or missing coverage does not establish resolution.'],
  ['rule-review-expired', '出典の検証日が未確認・未来または30日超。影響版・配布元・IOCを再確認する', 'The source verification date is unknown, in the future or over 30 days old. Affected versions, provenance and indicators need renewed review.'],
  ['ioc-extension-unavailable', '対象拡張の現在の実物を確認できず、hash検査を実施していません。', 'The current target extension could not be confirmed; its hash was not checked.'],
  ['ioc-root-excluded', '許可された拡張rootの外は未読です。', 'Locations outside the allowed extension root were not read.'],
  ['ioc-root-unverified', '拡張rootの実体を検証できません。', 'The extension root identity could not be verified.'],
  ['format-static-unsupported', '検出済み・静的解析未対応', 'The format was detected but static parsing is unsupported.'],
  ['format-unverified-no-query', '形式・schema・上限を検証できないため、このファイルから送信しない', 'The format, schema or limits could not be validated. No records from this file are sent externally.'],
  ['osv-page-pending', 'queryごとの追加ページを次回へ保持', 'Additional pages for each query are retained for the next run.'],
  ['lock-root-excluded', '現在の認可済みproject rootの外側', 'The lockfile is outside the currently authorized project roots.'],
  ['previous-page-scope', '前ページで解析した同一ファイル。未対応・未確認の判定も保持', 'The same file was parsed on a previous page. Its unsupported and unassessed statuses are preserved.'],
  ['offline-query-not-run', 'offline指定のため公開照会は未実施', 'Public queries were not performed because offline mode was selected.'],
  ['reader-not-finished', 'この領域の収集を完了できませんでした。保存された診断コードを確認してください。', 'Collection for this area did not finish. Consult the saved diagnostic code.'],
].map(([code, original, en, ja = original]) => [code, { original, ja, en }]));
const COVERAGE_REASON_CODES = new Map(Object.entries(COVERAGE_REASONS).map(([code, text]) => [text.original, code]));

/** Preserve a stable code for existing reader explanations in saved coverage and native reports. @example normalizeCoverageEntry({area:'network',reason:'...'}) */
export function normalizeCoverageEntry(entry) {
  if (entry.reasonCode) return entry;
  const code = COVERAGE_REASON_CODES.get(entry.reason);
  return code ? { ...entry, reasonCode: code } : entry;
}

/** Avoid exposing untranslated provider errors while preserving finite recovery context. @example coverageReason(entry, 'en') */
function coverageReason(entry, language) {
  entry = normalizeCoverageEntry(entry);
  const reasons = {
    'image-sbom-records-only': ['画像digestと対応するSBOM記録を確認しました。その他の画像内部は未確認です。', 'Only digest-bound SBOM records were assessed. Other image contents remain unassessed.'],
    'image-sbom-missing': ['画像digestと対応するSBOMがなく、画像内部は未確認です。', 'No digest-bound SBOM is available; the image contents remain unassessed.'],
    'sbom-package-identity-unknown': ['SBOMの一部でパッケージの識別情報・配布元を確認できず、照合できていません。', 'Some SBOM package identities or distributions are unsupported and remain unassessed.'],
    'sbom-supported-records': ['対応するSBOMのパッケージ記録を抽出しました。', 'Supported SBOM package records were extracted within the stated scope.'],
    IOC_CONTEXT_REVIEW_REQUIRED: ['公開指標の候補を取得しました。対象製品・指標・適用範囲の検証が必要です。', 'Indicator candidates were retrieved. Their product, indicator type and applicable scope require verification.'],
    IOC_SOURCE_UNAVAILABLE: ['指標の情報源を取得できず、該当する侵害の痕跡は未確認です。', 'The indicator source could not be retrieved; the corresponding compromise checks remain unassessed.'],
    NO_VERIFIED_APPLICABLE_IOC: ['検証済みで適用可能な指標がなく、侵害の有無は未確認です。', 'No verified applicable indicators are available. Compromise remains unassessed.'],
    IOC_CANDIDATE_LIMIT: ['指標候補の上限に達し、残りの候補は未確認です。', 'The indicator candidate limit was reached. Remaining candidates are unassessed.'],
    SOURCE_UNDATED_ITEMS: ['公開日・更新日が不明な記事があり、収集期間内か判定できません。', 'Some articles have no publication or update date; their inclusion in the discovery window is unconfirmed.'],
    PRIMARY_SOURCE_UNDATED_ITEMS: ['取得した記事の日付が不明で、収集期間内か判定できません。', 'The retrieved articles have no publication or update date; their inclusion in the discovery window is unconfirmed.'],
    PRIMARY_SOURCE_FETCHED_WITH_UNDATED_ITEMS: ['公開日・更新日が不明な記事は、収集期間内か判定できません。', 'Articles without publication or update dates cannot be assigned to the discovery window.'],
    SOURCE_DATE_PRECISION: ['日付の精度が足りない記事を保持しています。収集期間内か確定できないものは件数を分けます。', 'Articles with limited date precision are retained. Uncertain window membership is counted separately.'],
    PRIMARY_SOURCE_DATE_PRECISION: ['公式情報を取得しましたが、日付の精度が足りず収集期間内か確定できない記事があります。', 'The official source was retrieved, but some article dates are too imprecise to confirm discovery-window membership.'],
    PRIMARY_SOURCE_CATEGORY_UNCONFIRMED: ['公式情報を取得しましたが、製品・OSを分類できない記事があります。その他のニュースに保持します。', 'The official source was retrieved, but some articles could not be assigned to a product or operating system. They remain in general news.'],
  };
  const history = entry.area?.startsWith('news-history:') && entry.reason === 'partial'
    ? (language === 'ja' ? '過去の情報の取得は未完了です。未取得の告知が残る可能性があります。' : 'Historical retrieval is incomplete. Older advisories may remain unassessed.') : null;
  const explanation = COVERAGE_REASONS[entry.reasonCode]?.[language] || reasons[entry.reasonCode]?.[language === 'ja' ? 0 : 1] || history;
  if (language === 'ja') return escapeReportText(explanation || entry.reason || entry.reasonCode || TEXT.ja.unknown);
  if (entry.diagnostic) {
    const diagnostic = localizeDiagnostic(entry.diagnostic, language);
    return `${explanation ? `${escapeReportText(explanation)} ` : ''}${escapeReportText(diagnostic.code)}: ${escapeReportText(diagnostic.message)} ${escapeReportText(diagnostic.recovery)}`;
  }
  if (explanation) return explanation;
  const messages = { excluded: 'Excluded by the read-only collection policy.', deferred: 'Deferred because this run reached a limit.', failed: 'The check could not be completed.',
    unconfirmed: 'More evidence is required to complete this check.', complete: 'Completed within the stated scope.' };
  return `${messages[coverageKind(entry)]} ${escapeReportText(entry.reasonCode || '')}`;
}

/** Build only an internally generated local evidence destination, never a URL supplied by an advisory. @example evidenceHref('.') */
function evidenceHref(directory) {
  const base = typeof directory === 'string' && !/[\u0000-\u001f\u007f:]|^\/\//.test(directory) ? directory : '.';
  return path.join(base || '.', 'evidence.json').split('/').map(encodeURIComponent).join('/');
}

/**
 * Render news, local assessments and incomplete coverage in the requested native language.
 * The runner calls this for each immutable checkpoint; host translations retain this canonical report.
 *
 * @example
 * renderReport({ locale: resolveLanguage({ explicit: 'EN' }), news, match });
 */
export function renderReport(data) {
  const locale = data.locale || resolveLanguage({ explicit: data.language || data.requestedLanguage });
  const language = locale.canonicalLanguage === 'ja' ? 'ja' : 'en', t = TEXT[language], ja = language === 'ja';
  const { inventory = {}, news = {}, packages = {}, iocs = {}, match = {}, details = {}, changes = {}, commands = [] } = data;
  const findings = prioritizeFindings(match.findings || [], details.details || []);
  const confirmed = findings.filter(finding => finding.status === '確定');
  const affected = findings.filter(finding => finding.status === '可能性高');
  const unknown = findings.filter(finding => finding.status === '可能性あり');
  const safe = findings.filter(finding => finding.status === '影響なし');
  const incidents = findings.filter(finding => finding.incident && ['確定', '可能性高'].includes(finding.status));
  const dependencies = new Set(affected.filter(finding => finding.package).map(finding => `${finding.package.ecosystem}:${finding.package.name}:${finding.version}`)).size;
  const advisoryCount = new Set(affected.filter(finding => finding.package).map(finding => finding.advisoryId || finding.id)).size;
  const coverage = [...new Map([inventory, news, packages, iocs, match, details].flatMap(value => value.coverage || []).concat(data.extraCoverage || []).map(entry => [JSON.stringify([entry.area, entry.status, entry.reason]), entry])).values()];
  const gaps = coverage.filter(entry => !['complete', 'excluded'].includes(coverageKind(entry)));
  const excluded = coverage.filter(entry => coverageKind(entry) === 'excluded');
  const items = assessedNews(news, match);
  const unreviewed = items.filter(item => item.needsReview).length;
  const status = data.status || (data.stageStatus ? assessmentStatus(coverage, unreviewed) : 'partial');
  const startedAt = data.startedAt || t.unknown, finishedAt = data.finishedAt || t.unknown;
  const duration = Date.parse(finishedAt) - Date.parse(startedAt);
  const now = Number.isFinite(Date.parse(finishedAt)) ? Date.parse(finishedAt) : Date.now();
  const evidence = `[${t.fullEvidence}](${evidenceHref(data.evidenceDirectory)})`;
  const stage = data.stageStatus?.inventory;
  const localState = stage === 'pending' || stage === 'not-started' ? t.localPending : stage === 'partial' ? t.localPartial : stage === 'complete' ? t.localDone : t.unknown;
  const actionCount = confirmed.length + affected.length + unknown.length;
  const lines = [
    ja ? `被害の有無: 侵害を示すIOCの確定 ${confirmed.length} 件。脆弱性への該当だけでは侵害・窃取を確認したことにはなりません。`
      : `Compromise: ${confirmed.length} confirmed specific indicator matches. Vulnerability exposure alone does not establish compromise or theft.`,
    ja ? `要確認: ${actionCount} 判定（依存 ${dependencies} 種類／アドバイザリ ${advisoryCount} 種類／依存と告知の一致 ${affected.filter(finding => finding.package).length} 件、感染件数ではない）。未確認範囲 ${gaps.length} 件・方針上の対象外 ${excluded.length} 件。`
      : `Needs review: ${actionCount} ${actionCount === 1 ? 'assessment' : 'assessments'} (${dependencies} ${dependencies === 1 ? 'dependency version' : 'dependency versions'}, ${advisoryCount} ${advisoryCount === 1 ? 'advisory' : 'advisories'}; these are not infection counts). Coverage gaps: ${gaps.length}; policy exclusions: ${excluded.length}.`,
    ja ? `最優先: ${confirmed.length ? '一致したIOCの根拠と実行痕跡を確認' : affected.length ? '影響する対象の利用条件と修正版を確認' : t.firstPriority}。`
      : `First check: ${confirmed.length ? 'Verify the matching indicator and execution evidence.' : affected.length ? 'Check the affected components, reachable inputs and fixed versions.' : `${t.firstPriority}.`}`,
    '', `# ${t.report} ${jstDate(new Date(now))}`, '',
    `${ja ? '実行' : 'Run'}: ${escapeReportText(startedAt)} → ${escapeReportText(finishedAt)} (UTC). ${ja ? '所要時間' : 'Elapsed'}: ${Number.isFinite(duration) ? (duration / 1000).toFixed(1) : t.unknown} ${ja ? '秒' : 'seconds'}. ${ja ? '表題の日付' : 'Title date'}: Asia/Tokyo.`,
    `${t.period}: ${escapeReportText(news.window?.since || t.unknown)} → ${escapeReportText(news.window?.until || t.unknown)}.`,
    `${ja ? '処理' : 'Processing'}: ${label(status, language)}; ${ja ? 'ローカル取得' : 'Local collection'}: ${label(data.collectionCoverage || 'unconfirmed', language)}; ${ja ? '照会' : 'Queries'}: ${label(data.queryCoverage || 'unconfirmed', language)}.`,
    `${ja ? '指定言語' : 'Requested language'}: ${escapeReportText(locale.requestedLanguage)}; ${ja ? '基準レポート' : 'Canonical language'}: ${escapeReportText(locale.canonicalLanguage)}; ${ja ? '翻訳' : 'Translation'}: ${label(locale.translationStatus, language)}.`, '',
  ];
  if (locale.translationStatus === 'pending') lines.push(t.partialTranslation, '');
  if (stage) lines.push(localState, '');
  const highlights = importantNews(items, findings, details.details || [], now);
  lines.push(`## ${t.important}`, '', ...(highlights.length ? highlights.flatMap(item => [newsLine(item, language, true), '']) : [t.noHighlights, '']));
  const globalException = (packages.coverage || []).find(entry => entry.area === 'global-package-origins')?.count || 0;
  lines.push(`## ${t.local}`, '', t.evidenceLimit, '',
    ja ? `- macOS: ${escapeReportText(inventory.host?.macOS?.productVersion || inventory.host?.osVersion || t.unknown)}。アプリ ${inventory.applications?.length || 0} 件、ロックファイル ${inventory.lockfiles?.length || 0} 件、抽出したパッケージ ${packages.packages?.length || 0} 件。`
      : `- macOS: ${escapeReportText(inventory.host?.macOS?.productVersion || inventory.host?.osVersion || t.unknown)}. Applications: ${inventory.applications?.length || 0}; lockfiles: ${inventory.lockfiles?.length || 0}; extracted packages: ${packages.packages?.length || 0}.`,
    ja ? `- 由来未検証のinstalled-global例外: ${globalException} 件。公開パッケージと確認できた件数ではありません。queryUnknownGlobals=false で照会を停止できます。`
      : `- Installed-global origin exception: ${globalException} records. Their public origin has not been verified. Set queryUnknownGlobals=false to exclude these queries.`, '',
    `### ${t.affected}`, '', findingTable([...confirmed, ...affected].slice(0, 40), details.details || [], language), '',
    `### ${t.unaffected}`, '', findingTable(safe.slice(0, 40), details.details || [], language), '', t.negativeLimit, '',
    `### ${t.uncertain}`, '', findingTable(unknown.slice(0, 40), details.details || [], language), '',
    `${t.findingsCount}: ${findings.length}. ${evidence}. ${t.dependencyLimit}`, '', `### ${t.iocs}`, '');
  if (!(iocs.checks || []).length) lines.push(t.noIoc, '');
  else lines.push(`| ${ja ? '種類' : 'Type'} | ${ja ? '対象' : 'Target'} | ${ja ? '一致' : 'Match'} | ${t.detail} |`, '|---|---|---|---|', ...(iocs.checks || []).map(check => {
    const result = check.matched === true ? 'matched' : check.matched === false ? 'no-match' : 'unconfirmed';
    const reasons = {
      'ioc-path-present': 'The exact indicator path exists.', 'ioc-path-absent': 'The exact indicator path was absent during this check.',
      'ioc-target-unreadable': 'The exact target could not be read.', 'ioc-exact-hash-compared': 'The exact target hash was compared; file contents were not retained.',
      'ioc-extension-hash-compared': 'The extension file hash was compared.', 'ioc-process-name-compared': 'A process-name observation was compared; a name alone does not prove compromise.',
      'ioc-process-inventory-partial': 'The process inventory is incomplete.', 'ioc-platform-unassessed': 'The indicator applies to an unassessed platform.',
      'ioc-candidates-unreviewed': 'Discovered indicator candidates have not been verified for execution.',
    };
    const bounds = [`${ja ? '観測' : 'Observed'}: ${escapeReportText(check.observedAt || t.unknown)}`,
      check.verifiedAt ? `${ja ? '指標の検証' : 'Indicator verified'}: ${escapeReportText(check.verifiedAt)}` : '',
      check.expiresAt ? `${ja ? '検証期限' : 'Review expires'}: ${escapeReportText(check.expiresAt)}` : '', sourceLink(check.sourceUrl, t.source)].filter(Boolean).join('; ');
    const detail = `${ja ? `${escapeReportText(check.reason)} ${escapeReportText(check.command)}` : `${reasons[check.reasonCode] || `${check.strong ? 'Specific' : 'Supporting'} indicator.`} ${escapeReportText(check.diagnostic?.code || '')}`} ${bounds}`;
    return `| ${escapeReportText(check.kind)} | ${escapeReportText(check.value)} | ${label(result, language)} | ${detail} |`;
  }), '');
  lines.push(t.iocLimit, '', `## ${t.ongoing}`, '');
  if (Object.keys(changes).length) lines.push(ja ? `前回との差分: 新規 ${(changes.new || []).length} 件、継続 ${(changes.continuing || []).length} 件、再確認による解消 ${(changes.resolved || []).length} 件、今回は確認不能 ${(changes.unconfirmed || []).length} 件。`
    : `Changes: ${(changes.new || []).length} new, ${(changes.continuing || []).length} continuing, ${(changes.resolved || []).length} resolved by recheck, ${(changes.unconfirmed || []).length} not rechecked.`, '');
  const older = items.filter(item => item.ongoing === true || (Date.parse(newsDateRange(item)?.endExclusive || '') <= Date.parse(news.window?.since || '') && (item.knownExploited || item.relevance === '関係あり')));
  if (!(changes.unconfirmed || []).length && !older.length) lines.push(t.noOngoing, '');
  for (const old of changes.unconfirmed || []) lines.push(`- ${targetText(old, language)}: ${t.notRechecked}. ${t.lastObserved}: ${escapeReportText(old.observedAt || old.lastObservedAt || old.firstSeenAt || data.previousRunAt || t.unknown)}. ${escapeReportText(old.advisoryId || old.id)}`, '');
  lines.push(...older.slice(0, 20).flatMap(item => [newsLine(item, language), '']));
  lines.push(`## ${t.categories}`, '', `| ${t.category} | ${t.status} | ${t.windowCount} | ${t.fetched} | ${t.detail} |`, '|---|---|---|---|---|');
  const highlightedIds = new Set(highlights.map(item => item.id));
  for (const category of registry.NEWS_CATEGORIES || []) {
    const categoryItems = items.filter(item => (item.categories || [item.category]).includes(category.id));
    const receipt = (news.categoryCoverage || []).find(entry => entry.category === category.id);
    const fresh = receipt?.status === 'fresh';
    const counts = categoryNewsCounts(categoryItems, receipt, news.window);
    const uncertainty = categoryCountNotes(counts, language);
    const description = [!fresh && (!uncertainty || receipt?.reasonCode === 'PRIMARY_SOURCE_UNAVAILABLE') ? t.missingNews : '', uncertainty, fresh && !uncertainty && counts.datedItemCount === 0 ? t.zeroNews : ''].filter(Boolean).join(' ');
    lines.push(`| ${escapeReportText(category.labels[language])} | ${label(fresh ? 'fresh' : 'partial', language)} | ${counts.datedItemCount ?? t.unknown} | ${escapeReportText(receipt?.fetchedAt || t.unknown)} | ${description} |`);
  }
  lines.push('');
  for (const category of registry.NEWS_CATEGORIES || []) {
    const categoryItems = items.filter(item => (item.categories || [item.category]).includes(category.id));
    const remaining = categoryItems.filter(item => !highlightedIds.has(item.id));
    if (remaining.length) lines.push(`### ${escapeReportText(category.labels[language])}`, '', ...remaining.slice(0, 20).flatMap(item => [newsLine(item, language), '']));
    if (remaining.length > 20) lines.push(`${ja ? 'この欄は先頭20件。全件' : 'This section shows 20 items. All items'}: ${evidence}.`, '');
  }
  lines.push(`## ${t.gaps}`, '');
  if (!gaps.length && !excluded.length) lines.push(t.noGaps, '');
  else lines.push(`| ${ja ? '対象' : 'Area'} | ${t.category} | ${t.status} | ${t.count} | ${t.detail} |`, '|---|---|---|---|---|', ...[...gaps, ...excluded].map(entry =>
    `| ${escapeReportText(entry.area)} | ${label(coverageKind(entry), language)} | ${label(entry.status, language)} | ${entry.count ?? ''}/${entry.total ?? ''} | ${coverageReason(entry, language)} |`), '');
  lines.push(`## ${t.actions}`, '');
  const actions = [];
  if (confirmed.length) actions.push(t.fixIoc);
  if (incidents.length) actions.push(t.fixIncident);
  if (affected.some(finding => finding.package)) actions.push(t.fixDependencies);
  if (affected.some(finding => !finding.package)) actions.push(t.fixProducts);
  if (gaps.length || unreviewed) actions.push(t.fixGaps);
  lines.push(...(actions.length ? actions.map(action => `- ${action}`) : [t.noActions]), '', `## ${t.evidence}`, '', `${evidence}.`, '', `### ${t.sources}`, '',
    `| ${ja ? '情報源' : 'Source'} | ${t.status} | ${ja ? '記事数' : 'Items'} | ${ja ? 'ページ数' : 'Pages'} | ${t.fetched} | ${t.detail} |`, '|---|---|---|---|---|---|',
    ...(news.sources || []).map(source => {
      const recovery = source.diagnostic ? localizeDiagnostic(source.diagnostic, language) : null;
      const detail = [source.historicalCoverage === 'partial' ? (ja ? '過去期間に不足あり' : 'Historical period incomplete') : '',
        categoryCountNotes(source, language),
        Number.isSafeInteger(source.datedItemCount) && source.datedItemCount >= 0 ? `${t.windowCount}: ${source.datedItemCount}.` : '',
        source.reasonCode || '', recovery?.code || '', recovery?.message || '', recovery?.recovery || '',
        source.cooldownUntil ? `${ja ? '再試行可能時刻' : 'Retry after'}: ${source.cooldownUntil}` : '',
        source.attempts !== undefined ? `${ja ? '試行' : 'Attempts'}: ${source.attempts}` : ''].filter(Boolean).join(' ');
      return `| ${escapeReportText(source.name)} | ${label(source.status, language)} | ${source.itemCount ?? 0} | ${source.pages ?? 0} | ${escapeReportText(source.fetchedAt || t.unknown)} | ${escapeReportText(detail || (ja ? source.reason || t.unknown : t.unknown))} ${sourceLink(source.url, t.source)} |`;
    }), '', `### ${t.runtimes}`, '', `| ${ja ? 'ランタイム' : 'Runtime'} | ${ja ? 'バージョン' : 'Version'} | ${ja ? '利用状況' : 'Usage'} | ${t.verdict} | ${t.basis} |`, '|---|---|---|---|---|',
    ...(inventory.runtimes || []).map(runtime => {
      const judgments = findings.flatMap(finding => (finding.runtimeEvidence || []).filter(entry => entry.path === runtime.path).map(entry => `${escapeReportText(finding.id)}: ${label(entry.status, language)}`));
      const usage = runtime.usageEvidence?.length ? (ja ? '稼働中の実体を観測' : 'Running instance observed') : runtime.isCurrent === true ? (ja ? 'この棚卸しで実行した現在のNode' : 'Node used for this inventory') : runtime.isCurrent === false ? (ja ? '別用途・保管版（使用状況は未確認）' : 'Other or stored version; use unassessed') : t.unknown;
      return `| ${escapeReportText(runtime.name)} | ${escapeReportText(runtime.version)} | ${usage} | ${judgments.join(' / ') || t.unknown} | ${escapeReportText(runtime.path)} |`;
    }), '', `### ${t.commands}`, '', `| ${ja ? 'コマンド' : 'Command'} | ${t.status} | ${ja ? '時間ms' : 'Elapsed ms'} |`, '|---|---|---|',
    ...commands.map(command => `| ${escapeReportText(command.command, 1400)} | ${label(command.status, language)} | ${Number.isFinite(command.elapsedMs) ? command.elapsedMs : ''} |`), '');
  return lines.join('\n');
}
