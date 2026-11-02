#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { advisoryKind, projectIsActive, evidenceScope } from './assessment.mjs';

const STATUSES = ['確定', '可能性高', '可能性あり', '影響なし'];

/**
 * 明示的な安定版の大小だけを比較する。
 * {@link satisfiesRange} が呼び、prerelease や曖昧なバージョンを誤って安全扱いしない。
 * @returns 左が小さければ -1、大きければ 1、同じなら 0。比較不能なら null。
 * @example
 * compareVersions('2.1.314', '2.1.313');
 */
export function compareVersions(left, right) {
  if (![left, right].every(v => typeof v === 'string' && /^v?\d+(?:\.\d+){1,3}$/.test(v))) return null;
  const a = left.replace(/^v/, '').split('.').map(Number), b = right.replace(/^v/, '').split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const x = a[index] || 0, y = b[index] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * GitHub Advisory の単純な比較演算子範囲を保守的に判定する。
 * 一般的な semver ライブラリの代用ではなく、未対応の式は null を返す。
 * @returns 影響範囲内なら true、範囲外なら false、評価不能なら null。
 */
export function satisfiesRange(version, range) {
  if (typeof range !== 'string' || !range.trim()) return null;
  let unknown = false;
  for (const alternative of range.split('||')) {
    let matches = true;
    for (const term of alternative.split(',').map(x => x.trim())) {
      const parsed = /^(<=|>=|<|>|=)?\s*(v?\d+(?:\.\d+){1,3})$/.exec(term);
      if (!parsed) { unknown = true; matches = false; break; }
      const compared = compareVersions(version, parsed[2]);
      if (compared === null) { unknown = true; matches = false; break; }
      const operators = { '<': compared < 0, '<=': compared <= 0, '>': compared > 0, '>=': compared >= 0, '=': compared === 0 };
      if (!operators[parsed[1] || '=']) matches = false;
    }
    if (matches) return true;
  }
  return unknown ? null : false;
}

/**
 * 特定エディタの拡張一覧を十分に読めたか確認する。
 * {@link matchRule} が、不在と権限不足を混同しないために呼ぶ。
 * @returns 対象の全範囲が complete/absent と記録されている場合だけ true。
 */
function extensionCoverageComplete(inventory, editor) {
  const relevant = (inventory.coverage || []).filter(c => c.area === 'extensions' || c.area === `extensions:${editor}`
    || c.area === `${editor}-extensions` || (c.area === 'editor-extensions' && (!c.editor || c.editor === editor)));
  return relevant.length > 0 && relevant.every(c => ['complete', 'absent'].includes(c.status));
}

/**
 * 実機のランタイム内蔵ライブラリ・アプリ・OS の版を検証済み範囲と比較する。
 * {@link matchRule} が呼び、異なる配布チャネルや比較できない版を安全扱いしない。
 * @returns 四段階判定と、実機のどの版を比較したかの証拠。
 */
function matchVersionRule(inventory, rule, result) {
  let candidates = [], complete = false;
  if (['runtime-component', 'runtime'].includes(rule.kind)) {
    candidates = (inventory.runtimes || []).filter(runtime => runtime.name === rule.runtimeName)
      .map(runtime => ({ version: rule.kind === 'runtime' ? runtime.version : runtime[rule.component], runtimeVersion: runtime.version,
        path: runtime.path, isCurrent: runtime.isCurrent ?? null,
        label: `${runtime.path}: ${runtime.name} ${runtime.version}${rule.kind === 'runtime-component' ? `; ${rule.component}=${runtime[rule.component] || '未確認'}` : ''}; current=${runtime.isCurrent ?? '未確認'}`, status: runtime.componentStatus }));
    complete = (inventory.coverage || []).some(entry => entry.area === 'runtimes' && entry.status === 'complete');
  } else if (rule.kind === 'application') {
    candidates = (inventory.applications || []).filter(app => (rule.applicationNames || []).includes(app.name))
      .map(app => ({ version: app.version, label: `${app.name}: ${app.version || '未確認'}; ${app.path}` }));
    complete = (inventory.coverage || []).some(entry => entry.area === 'applications' && entry.status === 'complete');
  } else if (rule.kind === 'os') {
    candidates = [{ version: inventory.host?.osVersion, label: `sw_vers: macOS ${inventory.host?.osVersion || '未確認'} (${inventory.host?.buildVersion || 'build 不明'})` }];
    complete = typeof inventory.host?.osVersion === 'string';
  }
  result.evidence = candidates.map(candidate => candidate.label);
  if (rule.verified !== true) { result.reason = '影響範囲の出典が未検証'; return result; }
  if (!candidates.length) {
    result.status = complete ? '影響なし' : '可能性あり';
    result.reason = complete ? '対象製品の棚卸しが完了し、対象配布チャネルの製品は見つからなかった' : '対象製品の一覧が不完全で、不在を判断できない';
    return result;
  }
  const ranges = rule.affectedRanges || (rule.affectedRange ? [rule.affectedRange] : []);
  const checks = candidates.map(candidate => {
    // ベンダーが同じ内蔵版番号のままバックポートした修正を優先する。
    if ((rule.patchedRuntimeRanges || []).some(range => satisfiesRange(candidate.runtimeVersion, range) === true)) return false;
    if (rule.kind === 'runtime-component' && rule.runtimeName === 'node' && !(rule.patchedRuntimeRanges || []).length) return null;
    if (rule.supportedMajors) {
      const major = /^v?(\d+)\./.exec((['runtime', 'runtime-component'].includes(rule.kind) ? candidate.runtimeVersion : candidate.version) || '')?.[1];
      if (rule.supportedMajors && !rule.supportedMajors.includes(Number(major))) return null;
    }
    // Chrome の安定版など桁数を指定したルールでは別形式へ勝手に変換しない。
    if (rule.kind === 'application' && rule.fixedVersion?.split('.').length === 4 && !/^\d+\.\d+\.\d+\.\d+$/.test(candidate.version || '')) return null;
    const outcomes = ranges.map(range => satisfiesRange(candidate.version, range));
    if (outcomes.includes(true)) return true;
    if (rule.kind === 'runtime' && !Array.isArray(rule.supportedMajors)) return null;
    return outcomes.length && outcomes.every(value => value === false) ? false : null;
  });
  if (['runtime', 'runtime-component'].includes(rule.kind)) result.runtimeEvidence = candidates.map((candidate, index) => ({ path: candidate.path,
    version: candidate.runtimeVersion, componentVersion: rule.kind === 'runtime-component' ? candidate.version : undefined,
    isCurrent: candidate.isCurrent, status: checks[index] === true ? '可能性高' : checks[index] === false ? '影響なし' : '可能性あり' }));
  if (checks.includes(true)) {
    result.status = '可能性高'; result.reason = '検証済みの影響範囲に入る実機の版が存在。攻撃・実行経路・IOC は未確認';
  } else if (checks.some(value => value === null)) {
    result.status = '可能性あり'; result.reason = '関連製品は存在するが、一部の内蔵版・版形式・影響範囲を比較できない';
  } else {
    result.status = '影響なし'; result.reason = `確認した版は検証済みの影響範囲外${rule.fixedVersion ? `（修正版 ${rule.fixedVersion} 以降）` : ''}。対象外の未探索領域を含む端末全体の安全保証ではない`;
  }
  return result;
}

/**
 * 人が出典を検証したルールと棚卸し・IOC 証拠を照合する。
 * {@link matchInventory} が呼ぶ。拡張の配布経路、旧版残骸、未読範囲を保持して誤判定を防ぐ。
 * @returns 根拠と出典を添えた四段階判定。
 */
export function matchRule(inventory, rule, iocEvidence = {}) {
  const result = { id: rule.id, title: rule.title || rule.id, status: '可能性あり', reason: '', evidence: [],
    sources: rule.sourceUrl ? [rule.sourceUrl] : [], incident: rule.incident === true, verified: rule.verified === true };
  const checks = (iocEvidence.checks || []).filter(check => check.ruleId === rule.id);
  const strong = checks.filter(check => check.matched === true && check.strong === true);
  const supporting = checks.filter(check => check.matched === true && check.strong !== true);
  // 強い IOC でなくても一致した痕跡を残し、製品不在だけで調査を終了しない。
  const finish = (value = result) => {
    if (supporting.length) {
      value.evidence.push(...supporting.map(check => `${check.command || check.kind}: ${check.reason || check.value || '補助 IOC と一致'}`));
      if (value.status === '影響なし') {
        value.status = '可能性あり'; value.reason = '対象製品の版・不在確認だけでは説明できない補助 IOC が存在。内容・ハッシュ・作成経緯の追加確認が必要';
      }
    }
    return value;
  };
  // IOC の単なる一般パスの存在は侵害確定の根拠にしない。
  if (strong.length && rule.verified === true) {
    result.status = '確定'; result.reason = '検証済みの攻撃 IOC と強い一致。単なる製品の存在による判定ではない';
    result.evidence = strong.map(check => `${check.command || check.kind}: ${check.reason || check.value || '一致'}`);
    return result;
  }
  if (['runtime', 'runtime-component', 'application', 'os'].includes(rule.kind)) return finish(matchVersionRule(inventory, rule, result));
  if (rule.kind !== 'extension') {
    result.reason = '自動判定に未対応のルール形式。出典と対象製品を人が照合する必要がある'; return result;
  }
  const all = (inventory.extensions || []).filter(ext => ext.id?.toLowerCase() === rule.extensionId?.toLowerCase());
  const candidates = all.filter(ext => ext.editor === rule.editor);
  for (const ext of all) {
    result.evidence.push(`${ext.editor}: ${ext.id} ${ext.version || '版不明'}; source=${ext.source || '不明'}; active=${ext.active ?? '不明'}; installedAt=${ext.installedAt || '未確認'} (${ext.installedAtBasis || '日時の根拠不明'}); ${ext.path || 'パス不明'}`);
  }
  result.evidence.push(`inventory.mjs: ${rule.editor} 拡張領域の読取=${extensionCoverageComplete(inventory, rule.editor) ? '完了' : '不完全'}`);
  // 未検証ルールを確定情報として扱わず、出典確認を要求する。
  if (rule.verified !== true) { result.reason = 'ルールの出典未検証。回帰テスト以外では根拠確認が必要'; return result; }
  if (!candidates.length) {
    if (extensionCoverageComplete(inventory, rule.editor)) {
      result.status = '影響なし'; result.reason = '対象配布経路の拡張が現在の対象ディレクトリに存在しない。過去に削除済みの侵害まで否定するものではない';
    } else result.reason = '対象拡張は一覧にないが、棚卸しが不完全なので不在とは判断できない';
    return finish();
  }
  const affected = candidates.filter(ext => (rule.affectedVersions || []).includes(ext.version));
  // 影響版は現在無効でも、ディスク上に残った履歴として高い可能性に分類する。
  if (affected.length) {
    const sourceMatches = ext => (!rule.sourcePattern || typeof ext.source === 'string' && ext.source.includes(rule.sourcePattern))
      && (!rule.acceptedSources || rule.acceptedSources.includes(ext.source));
    const windowMatches = ext => {
      if (!rule.installationWindow) return true;
      const installed = Date.parse(ext.installedAt), since = Date.parse(rule.installationWindow.since), until = Date.parse(rule.installationWindow.until);
      return Number.isFinite(installed) && Number.isFinite(since) && Number.isFinite(until) && installed >= since && installed <= until;
    };
    const matched = affected.some(ext => sourceMatches(ext) && windowMatches(ext));
    const otherVerifiedSource = affected.every(ext => ext.sourceVerified === true && !sourceMatches(ext));
    result.status = matched ? '可能性高' : otherVerifiedSource ? '影響なし' : '可能性あり';
    result.reason = matched ? '対象エディタに影響版または残骸があり、配布元と既知の配布期間も一致。IOC と実行履歴は別途確認が必要'
      : otherVerifiedSource ? '影響版と同じ番号だが、独立に検証された入手元が攻撃の配布元と異なる'
        : '影響版は存在するが配布元またはインストール期間を確認できない。日時が期間外でも再インストール・コピーを否定できず、安全とは判断しない';
    return finish();
  }
  const exactScope = Array.isArray(rule.affectedVersions) && rule.affectedVersions.length > 0
    && candidates.every(ext => typeof ext.version === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(ext.version));
  if (exactScope && extensionCoverageComplete(inventory, rule.editor)) {
    result.status = '影響なし'; result.reason = '検証済みの影響バージョン一覧に現在の版・残存版が含まれない。過去の削除済み版は未確認';
  } else result.reason = '製品は存在するが、版または対象領域の確認が不完全';
  return finish();
}

/**
 * 記事と端末にあるソフトウェアの関係を候補として整理する。
 * {@link matchInventory} が呼び、記事タイトルの一致を脆弱性確定と区別する。
 * @returns 関係あり・関係なし・要確認と、その分類理由。
 */
function classifyNews(item, inventory, packages) {
  const ecosystemNames = { pip: 'PyPI', rust: 'crates.io', go: 'Go', composer: 'Packagist', rubygems: 'RubyGems', maven: 'Maven', npm: 'npm', nuget: 'NuGet', erlang: 'Hex', actions: 'GitHub Actions' };
  const ecosystems = new Set(['npm', 'PyPI', 'crates.io', 'Go', 'Packagist', 'RubyGems', 'Maven', 'NuGet', 'Hex', 'GitHub Actions', 'Pub', 'SwiftURL', 'VSCode']);
  const affected = (item.affected || []).filter(entry => typeof entry.name === 'string' && ecosystems.has(ecosystemNames[entry.ecosystem] || entry.ecosystem));
  // 構造化 Advisory はエコシステム一般ではなく、具体的なパッケージ名で関連を判定する。
  if (affected.length) {
    const installed = [...packages, ...(inventory.globalPackages || [])];
    const matched = [];
    let editorOnly = false;
    for (const target of affected) {
      const ecosystem = ecosystemNames[target.ecosystem] || target.ecosystem;
      if (ecosystem === 'VSCode') {
        const extensions = (inventory.extensions || []).filter(extension => extension.id?.toLowerCase() === target.name.toLowerCase()
          && (!target.editor || extension.editor === target.editor));
        const editorPresent = (inventory.extensions || []).some(extension => !target.editor || extension.editor === target.editor)
          || (inventory.applications || []).some(app => target.editor === 'cursor' ? app.name === 'Cursor' : target.editor === 'vscode' ? app.name === 'Visual Studio Code' : ['Cursor', 'Visual Studio Code'].includes(app.name));
        if (extensions.length || editorPresent) {
          matched.push(extensions.length ? target.name : `${target.editor || 'エディタ'}（IOC 確認対象）`);
          if (!extensions.length) editorOnly = true;
        }
      } else if (installed.some(pkg => pkg.name === target.name && (ecosystemNames[pkg.ecosystem] || pkg.ecosystem) === ecosystem)) matched.push(target.name);
    }
    return { id: item.id, title: item.title, url: item.url, publishedAt: item.publishedAt,
      relevance: matched.length ? '関係あり' : '関係なし', matchedProducts: [...new Set(matched)],
      reason: !matched.length ? '対象パッケージは取得済みの一覧では未検出。未走査領域除く'
        : editorOnly ? '対象エディタが存在し、削除済み拡張の可能性も含めた IOC 確認対象。現在の拡張導入を意味しない'
          : '構造化 Advisory の対象名がロック抽出・グローバル・拡張の一覧と一致。影響版・配布元は個別判定を参照',
      needsReview: matched.length > 0 };
  }
  const identities = [
    ...(inventory.applications || []).flatMap(app => [app.name === 'Code' ? 'Visual Studio Code' : app.name, app.bundleId]),
    ...(inventory.applications || []).flatMap(app => /^Google Chrome/.test(app.name) ? ['Chrome'] : app.name === 'Code' || app.name === 'Visual Studio Code' ? ['VS Code'] : []),
    ...(inventory.runtimes || []).map(runtime => runtime.name === 'node' ? 'Node.js' : runtime.name),
    ...(inventory.extensions || []).map(extension => extension.id), 'macOS', 'Apple', 'Safari',
  ].filter(value => typeof value === 'string' && value.length >= 3 && !/^(?:code|connect|key|three|phone|apps|open|read|when|which|long)$/i.test(value));
  const corpus = [item.title, ...(item.products || []).map(product => typeof product === 'string' ? product : product.name)].join(' ').toLowerCase();
  // macOSの棚卸しへ他OS・別配布チャネルのChrome版を適用しない。
  if (/chrome.*(?:android|ios|chromeos)|chromeos.*update/i.test(item.title || '')) return { id: item.id, title: item.title, url: item.url,
    relevance: '関係なし', matchedProducts: [], reason: '今回のmacOS対象とはOS・配布チャネルが異なる。別端末の安全判定ではない', needsReview: false };
  const matched = [...new Set(identities.filter(identity => {
    const escaped = identity.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(corpus);
  }))].slice(0, 8);
  // 非構造化記事のパッケージ名は、パッケージと明示された文脈だけで候補にする。
  const packageMentions = packages.filter(pkg => {
    const escaped = pkg.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:npm|pypi|package|パッケージ)\\s+[\\x60'"]?${escaped}(?:[\\x60'"\\s@]|$)`, 'i').test(corpus);
  }).map(pkg => pkg.name);
  const browserCandidate = (inventory.browserExtensions || []).length > 0 && /browser extensions?|chrome extensions?|searchjacked|ブラウザ拡張|検索.*乗っ取/i.test(corpus);
  const candidate = !matched.length && (packageMentions.length > 0 || browserCandidate);
  return { id: item.id, title: item.title, url: item.url, publishedAt: item.publishedAt,
    relevance: matched.length ? '関係あり' : candidate ? '確認候補' : '関係なし', matchedProducts: [...matched, ...packageMentions],
    reason: matched.length ? '導入製品名が一致。影響範囲・対象OS・配布元・修正版は本文の確認が必要'
      : candidate ? 'パッケージの明示的言及またはブラウザ拡張の調査記事。対象版・拡張IDは未確認'
        : '取得した情報では関連根拠を確認できない。一般語の一致から製品導入を推測しない（未使用の証明ではない）',
    needsReview: matched.length > 0 || candidate };
}

/**
 * ニュース、ルール、OSV の照合結果を四段階のローカル判定に統合する。
 * CLI とテストから呼ばれ、未完了の検査を全体の安全宣言へ変換しない。
 * @returns 個別判定、記事の関係分類、検査範囲。
 * @example
 * matchInventory(inventory, news, { rules: { rules: [] } });
 */
export function matchInventory(inventory, news, { packages = {}, rules = {}, iocEvidence = {}, advisoryDetails = {}, now = new Date() } = {}) {
  const findings = (Array.isArray(rules) ? rules : rules.rules || []).map(rule => matchRule(inventory, rule, iocEvidence));
  // OSV の一致は影響版の存在を示すだけで、実際の攻撃や窃取を証明しない。
  for (const hit of packages.findings || []) {
    const detail = (advisoryDetails.details || []).find(entry => entry.id === hit.id);
    if (detail?.withdrawn) continue;
    const kind = advisoryKind({ ...hit, advisoryType: detail?.advisoryType || hit.advisoryType });
    findings.push({ id: `${hit.id}:${hit.package?.ecosystem}:${hit.package?.name}:${hit.version}`,
      advisoryId: hit.id, title: `${hit.package?.name} ${hit.version} — ${hit.id}`, status: '可能性高',
      reason: kind === 'malware' ? '悪性配布として公表された版と記録が一致。入手元・実物・実行痕跡を優先確認。実行・窃取は未確定'
        : 'OSV がロックまたはグローバル記録のパッケージ版を影響範囲と判定。実際のインストール・実行・到達可能性・攻撃 IOC は未確認',
      evidence: (hit.evidence || []).map(location => `scan-packages.mjs / OSV querybatch: ${location}`),
      sources: [hit.sourceUrl || `https://osv.dev/vulnerability/${encodeURIComponent(hit.id)}`],
      package: hit.package, version: hit.version, advisoryType: kind, incident: kind === 'malware',
      severity: detail?.severity || hit.severity, knownExploited: detail?.knownExploited || false, modified: hit.modified, localEvidence: hit.evidence || [],
      installationEvidence: hit.installationEvidence || [], projectActive: projectIsActive(hit.evidence, inventory.executionContexts),
      scope: evidenceScope(hit.evidence || [], inventory) });
  }
  const packageList = packages.packages || inventory.globalPackages || [];
  const ecosystemNames = { pip: 'PyPI', rust: 'crates.io', go: 'Go', composer: 'Packagist', rubygems: 'RubyGems', maven: 'Maven', npm: 'npm' };
  const existing = new Set(findings.map(finding => `${finding.advisoryId}:${finding.package?.ecosystem}:${finding.package?.name}:${finding.version}`));
  // 構造化 Advisory だけを版照合し、記事の自然言語から自動で影響範囲を推測しない。
  for (const item of news.items || []) {
    if (item.withdrawnAt || item.needsReview !== false) continue;
    for (const affected of item.affected || []) {
      const ecosystem = ecosystemNames[affected.ecosystem] || affected.ecosystem;
      const candidates = packageList.filter(pkg => pkg.name === affected.name && pkg.ecosystem === ecosystem);
      for (const pkg of candidates) {
        const key = `${item.id}:${ecosystem}:${pkg.name}:${pkg.version}`;
        if (existing.has(key)) {
          const found = findings.find(finding => finding.id === key);
          if (found && advisoryKind(item) === 'malware') { found.incident = true; found.advisoryType = 'malware'; found.reason = '公開された悪性配布の版と記録が一致。入手元・実物・実行痕跡を優先確認。実行・窃取は未確定'; }
          if (found && item.severity) found.severity = item.severity;
          continue;
        }
        const affectedVersion = Array.isArray(affected.versions) ? affected.versions.includes(pkg.version) : satisfiesRange(pkg.version, affected.range);
        if (affectedVersion === false) continue;
        findings.push({ id: key, advisoryId: item.id, title: `${pkg.name} ${pkg.version} — ${item.id}`, status: affectedVersion === true ? '可能性高' : '可能性あり',
          reason: affectedVersion === true ? advisoryKind(item) === 'malware' ? 'GitHubの悪性配布告知の版と記録が一致。入手元・実物・実行痕跡を優先確認。実行・窃取は未確定'
            : '構造化 GitHub Advisory の影響範囲とローカルの固定版が一致。実行・攻撃の確認ではない' : '製品は一致するが、この影響範囲の構文または版を安全に比較できない',
          evidence: (Array.isArray(pkg.evidence) ? pkg.evidence : [pkg.evidence || 'グローバル一覧']).map(location => `scan-packages.mjs: ${location}; range=${affected.range || JSON.stringify(affected.versions)}`),
          sources: item.url ? [item.url] : [], package: { name: pkg.name, ecosystem }, version: pkg.version, fixed: affected.fixed || null,
          advisoryType: advisoryKind(item), incident: advisoryKind(item) === 'malware', severity: item.severity,
          localEvidence: Array.isArray(pkg.evidence) ? pkg.evidence : [pkg.evidence].filter(Boolean),
          installationEvidence: pkg.installationEvidence || [], projectActive: projectIsActive(Array.isArray(pkg.evidence) ? pkg.evidence : [pkg.evidence].filter(Boolean), inventory.executionContexts),
          scope: evidenceScope(Array.isArray(pkg.evidence) ? pkg.evidence : [pkg.evidence || ''], inventory) });
        existing.add(key);
      }
    }
  }
  const newsAssessment = (news.items || []).map(item => classifyNews(item, inventory, packageList));
  const coverage = [...(inventory.coverage || []), ...(packages.coverage || []), ...(iocEvidence.coverage || [])];
  // 古い検証済みルールで「影響なし」を継続せず、出典の再確認へ戻す。
  for (const rule of Array.isArray(rules) ? rules : rules.rules || []) {
    const verifiedAt = Date.parse(rule.verifiedAt), age = (new Date(now).getTime() - verifiedAt) / 86400000;
    if (Number.isFinite(age) && age > 30) {
      coverage.push({ area: `rule-freshness:${rule.id}`, status: 'partial', reason: '出典の最終検証から30日超。影響版・配布元・IOCを再確認する' });
      const found = findings.find(finding => finding.id === rule.id);
      if (found?.status === '影響なし') { found.status = '可能性あり'; found.reason = 'ルールの出典再確認期限を超過。以前の影響範囲だけでは最新の無影響を判定しない'; }
    }
  }
  findings.push(...matchSecurityReleases(inventory, news.securityReleases || []));
  for (const source of news.sources || []) {
    coverage.push({ area: `news:${source.name}`, status: source.status, reason: source.reason, count: source.itemCount });
    if (source.historicalCoverage) coverage.push({ area: `news-history:${source.name}`, status: 'partial', reason: typeof source.historicalCoverage === 'string' ? source.historicalCoverage : JSON.stringify(source.historicalCoverage) });
  }
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), findings, newsAssessment, coverage,
    counts: Object.fromEntries(STATUSES.map(status => [status, findings.filter(finding => finding.status === status).length])),
    conclusion: findings.some(finding => finding.status === '確定') ? '検証済み IOC の一致あり' : '検査範囲内で侵害を確定する IOC は未確認。被害がないことの証明ではない' };
}

/**
 * 期間外も含むApple公式リリース表から未適用更新を拾う。{@link matchInventory} が固定ルールの漏れを補う。
 * @returns 対応製品の更新確認候補。CVEの影響開始版や悪用の有無は推測しない。
 */
export function matchSecurityReleases(inventory, releases) {
  const supported = [{ name: 'Xcode', pattern: /^Xcode\s+(\d+\.\d+(?:\.\d+)?)$/i },
    { name: 'Safari', pattern: /^Safari\s+(\d+\.\d+(?:\.\d+)?)$/i }];
  const findings = [];
  for (const product of supported) {
    const installed = (inventory.applications || []).filter(app => app.name === product.name);
    const candidates = releases.flatMap(release => {
      const version = product.pattern.exec(release.title || '')?.[1];
      let official = false;
      try { const url = new URL(release.url); official = url.origin === 'https://support.apple.com' && !url.username && !url.password; } catch { /* 不正な公開URLは採用しない。 */ }
      return version && official ? [{ ...release, version }] : [];
    }).sort((a, b) => compareVersions(b.version, a.version) || 0);
    const latest = candidates[0];
    if (!latest) continue;
    for (const app of installed) {
      const compared = compareVersions(app.version, latest.version);
      findings.push({ id: `security-update:${app.bundleId || app.name}:${latest.version}`, title: `${app.name} ${app.version}：セキュリティ更新 ${latest.version} を確認`,
        status: compared === null || compared < 0 ? '可能性あり' : '影響なし', category: 'update-review', incident: false, scope: '端末', sources: [latest.url], fixed: latest.version,
        reason: compared === null || compared < 0 ? '公式リリース表の更新に未到達または版比較不能。対象OS・各CVEの影響開始版・実行条件は本文で確認する'
          : '確認した公式更新候補に到達。当該更新候補の適用確認だけであり、製品全体の無脆弱性・無侵害の証明ではない', evidence: [app.path], localEvidence: [app.path],
        publishedAt: latest.publishedAt, installationEvidence: [{ path: app.path, version: app.version }] });
    }
  }
  return findings;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.includes('--help') || args.includes('-h')) {
      process.stdout.write('使い方: node match.mjs --inventory 棚卸し.json --news ニュース.json [--packages パッケージ照合.json] [--rules 検証済みルール.json] [--ioc-evidence IOC証拠.json]\n入力 JSON をローカルで照合し、根拠付きの四段階判定を JSON で出力します。ネットワーク通信や対策の実行は行いません。このヘルプでは照合しません。\n');
      process.exit(0);
    }
    const readArgument = (flag, required = false) => {
      const index = args.indexOf(flag);
      if (index < 0) { if (required) throw new Error('usage'); return {}; }
      return JSON.parse(fs.readFileSync(args[index + 1], 'utf8'));
    };
    const result = matchInventory(readArgument('--inventory', true), readArgument('--news', true), {
      packages: readArgument('--packages'), rules: readArgument('--rules'), iocEvidence: readArgument('--ioc-evidence'),
      advisoryDetails: readArgument('--advisory-details'),
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch {
    process.stdout.write(JSON.stringify({ schemaVersion: 1, error: '入力 JSON を読めません。--inventory と --news のパスを確認してください。秘密値を含む例外本文は表示しません。' }) + '\n');
    process.exitCode = 1;
  }
}
