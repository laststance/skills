import { normalizeSeverity } from './assessment.mjs';

const PUBLIC_ID = /\b(?:CVE-\d{4}-\d{4,10}|GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})\b/gi;
const HIGH_IMPACT = /\b(?:RCE|(?:remote|arbitrary) code execution|zero[- ]day|0[- ]day|actively exploited|exploited in the wild|authentication bypass|supply[- ]chain (?:attack|compromise))\b|リモートコード実行|任意(?:の)?コード実行|ゼロデイ|悪用(?:を確認|が確認|中)|認証回避|サプライチェーン攻撃/i;
const CRITICAL = /\bcritical\b|重大|深刻|緊急/i;
const SIGNAL_PRIORITY = { exploited: 3, rated: 2, reported: 1, index: 0 };

/**
 * 収集とローカル分類を同じ記事IDで結び、旧世代やニュース取得直後にも使える形にする。
 * レポート生成とチャット照合が同じ証拠を読む。
 * @example assessedNews({ items: [] }, { newsAssessment: [] })
 */
export function assessedNews(news = {}, match = {}) {
  const classified = new Map((match.newsAssessment || []).map(item => [item.id, item]));
  const items = (news.items || []).map(item => ({ ...item, ...(classified.get(item.id) || {}), sourceReview: item.reasonCode }));
  const ids = new Set(items.map(item => item.id));
  return [...items, ...(match.newsAssessment || []).filter(item => !ids.has(item.id))];
}

/** {@link selectBriefingAdvisories} と提出前の照合で公開IDを完全な単語として読む。 @example publicAdvisoryIds('CVE-2026-1234') */
export function publicAdvisoryIds(text) {
  return [...new Set((String(text || '').match(PUBLIC_ID) || []).map(id => id.toUpperCase().startsWith('CVE-') ? id.toUpperCase() : 'GHSA-' + id.slice(5).toLowerCase()))];
}

/**
 * {@link selectBriefingAdvisories} と見出しの重複排除で同じ記事の公開IDを使う。
 * 本文だけのIDは1件に限定し、関連記事に列挙された別件を束ねない。
 * @example newsIdentifiers({ title: 'OpenJDK advisory CVE-2026-114938' })
 */
export function newsIdentifiers(item) {
  const titleIds = publicAdvisoryIds(String(item.title || '').slice(0, 1000));
  const ownIds = [item.id, ...(item.aliases || [])].flatMap(value => {
    if (typeof value !== 'string') return [];
    const [id] = publicAdvisoryIds(value);
    return id && value.toLowerCase() === id.toLowerCase() ? [id] : [];
  });
  const bodyIds = !titleIds.length && !ownIds.length ? publicAdvisoryIds(String(item.summary || '').slice(0, 1200)) : [];
  const ids = [...new Set([...ownIds, ...titleIds, ...(bodyIds.length === 1 ? bodyIds : [])])];
  const cves = ids.filter(id => id.startsWith('CVE-'));
  return { titleIds, ids: cves.length ? cves : ids };
}

/**
 * 重大と報じられた記事を、見出しの件数制限や影響版の確定とは独立に引き渡す。
 * レポートとチャット照合が呼ぶ。記事中の複数CVEは別の案件で、相互の別名にはしない。
 * @returns 公開ID単位の確認項目。ID未公表の記事は出典・見出しで照合する。
 * @example selectBriefingAdvisories(assessedNews(news, match))
 */
export function selectBriefingAdvisories(items, details = [], knownExploitedIds = []) {
  const required = new Map();
  const withdrawn = new Set(), detailById = new Map(), exploited = new Set(knownExploitedIds);
  for (const detail of details) {
    for (const id of [detail.id, ...(detail.aliases || [])]) {
      detailById.set(id, detail);
      if (detail.withdrawn) withdrawn.add(id);
    }
  }
  for (const item of items) {
    if (item.withdrawn || item.withdrawnAt || withdrawn.has(item.id) || item.relevance === '関係なし') continue;
    const local = item.relevance === '関係あり' || Boolean(item.matchedProducts?.length);
    const inventoryPending = !item.relevance || item.reasonCode === 'inventory-not-started' || item.relevance === '未確認';
    const title = String(item.title || '').slice(0, 1000);
    const { ids, titleIds } = newsIdentifiers(item);
    const headline = HIGH_IMPACT.test(title) || Boolean(ids.length && CRITICAL.test(title));
    // 公式の一覧に日付・リンクしかなくても、導入製品の新しい告知本文を確認対象にする。
    const indexReview = local && !item.ongoing && (item.sourceReview || item.reasonCode) === 'OFFICIAL_INDEX_REQUIRES_RANGE_REVIEW';
    // 未収集の段階ではID付きの重大な公表を残す。棚卸しの欠落だけでは製品一致にならない。
    const vendorScore = normalizeSeverity(item.severity).rank;
    const primaryWarning = item.knownExploited || vendorScore >= 4 || vendorScore >= 3 && (item.sourceReview || item.reasonCode) === 'OPENJDK_RISK_MATRIX';
    if (!local && !(ids.length && (inventoryPending && (headline || primaryWarning) || headline && item.needsReview && titleIds.length))) continue;
    for (const id of ids.length ? ids : [null]) {
      if (withdrawn.has(id)) continue;
      const detail = detailById.get(id) || (ids.length <= 1 ? detailById.get(item.id) : null);
      // 複数のCVEを挙げた記事全体の深刻度や悪用フラグを、各CVEに転記しない。
      const known = ids.length <= 1 && item.knownExploited === true || detail?.knownExploited === true || exploited.has(id);
      const rating = normalizeSeverity(detail?.severity || (ids.length <= 1 ? item.severity : null));
      // 見出しのRCE・緊急等は優先確認の根拠に限る。CVSS、悪用確認、侵害判定には変換しない。
      const signal = known ? 'exploited' : rating.rank >= 3 ? 'rated' : headline ? 'reported' : indexReview ? 'index' : null;
      if (!signal) continue;
      if (!id && !item.url && !title) continue;
      const key = id || JSON.stringify([item.url || '', title]);
      const prior = required.get(key);
      // 同じIDの転載では、導入記録、次いで構造化された悪用・深刻度の根拠を優先する。
      const lead = prior?.lead || (headline ? item : null);
      if (!prior || local && !prior.local || local === prior.local && SIGNAL_PRIORITY[signal] > SIGNAL_PRIORITY[prior.signal]) {
        required.set(key, { id, item, local, signal, lead });
      } else if (lead) prior.lead = lead;
    }
  }
  const entries = [...required.values()], unnumberedUrls = new Map();
  for (const { id, item } of entries) if (!id && item.url) unnumberedUrls.set(item.url, (unnumberedUrls.get(item.url) || 0) + 1);
  // 共通の索引URLだけでは別々の無番号記事を識別できない。この場合は提出原稿の原見出しで照合する。
  for (const entry of entries) if (!entry.id && unnumberedUrls.get(entry.item.url) > 1) entry.sharedUrl = true;
  return entries;
}
