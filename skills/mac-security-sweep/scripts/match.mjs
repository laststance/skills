#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { advisoryKind, projectIsActive, evidenceScope, assessPackageImpact, aggregateAdvisories, normalizeSeverity, assessmentStatus } from './assessment.mjs';
import { matchHomebrew } from './homebrew-advisories.mjs';
import { createRunContext } from './runtime.mjs';
import { SweepError, safeDiagnostic } from './diagnostics.mjs';

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
  // Rounding a malformed numeric component must not produce a false equality or safe range result.
  if (![...a, ...b].every(Number.isSafeInteger)) return null;
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
  const family = editorIdentity(editor);
  const areaEditor = entry => entry.editor || /^extensions:(.+)$/.exec(entry.area)?.[1] || /^(.+)-extensions$/.exec(entry.area)?.[1];
  const relevant = (inventory.coverage || []).filter(entry => entry.area === 'extensions' || entry.area === 'editor-extensions' && !entry.editor
    || editorIdentity(areaEditor(entry)) === family || ['portable', 'Portable'].includes(areaEditor(entry)));
  // 身元不明のPortableを既知エディタ不在の根拠にせず、Insidersは別配布系統のままにする。
  return family !== null && relevant.length > 0 && !(inventory.extensions || []).some(entry => ['portable', 'Portable'].includes(entry.editor))
    && relevant.every(entry => ['complete', 'absent'].includes(entry.status) && (!['portable', 'Portable'].includes(areaEditor(entry)) || entry.status === 'absent'));
}

/** 既知の通常版とPortableだけを同じ製品へ写す。拡張判定と記事分類が呼ぶ。 @example editorIdentity('cursor-portable') */
function editorIdentity(value) {
  const identities = { cursor: 'cursor', Cursor: 'cursor', 'cursor-portable': 'cursor', vscode: 'vscode', 'VS Code': 'vscode', 'vscode-portable': 'vscode', 'vscode-insiders': 'vscode-insiders', Insiders: 'vscode-insiders' };
  return Object.hasOwn(identities, value) ? identities[value] : null;
}

/**
 * 実機のランタイム内蔵ライブラリ・アプリ・OS の版を検証済み範囲と比較する。
 * {@link matchRule} が呼び、異なる配布チャネルや比較できない版を安全扱いしない。
 * @returns 四段階判定と、実機のどの版を比較したかの証拠。
 */
function matchVersionRule(inventory, rule, result) {
  let candidates = [], complete = false;
  // 製品の識別子を説明用タイトルと分離し、レポートの言語が変わっても保持する。
  result.product = rule.kind === 'os' ? 'macOS' : rule.runtimeName || (rule.applicationNames || []).join(' / ');
  result.scope = '端末';
  if (['runtime-component', 'runtime'].includes(rule.kind)) {
    candidates = (inventory.runtimes || []).filter(runtime => runtime.name === rule.runtimeName)
      .map(runtime => ({ version: rule.kind === 'runtime' ? runtime.version : runtime[rule.component], runtimeVersion: runtime.version,
        path: runtime.path, isCurrent: runtime.isCurrent ?? null,
        label: `${runtime.path}: ${runtime.name} ${runtime.version}${rule.kind === 'runtime-component' ? `; ${rule.component}=${runtime[rule.component] || '未確認'}` : ''}; current=${runtime.isCurrent ?? '未確認'}`, status: runtime.componentStatus }));
    const coverage = (inventory.coverage || []).filter(entry => entry.area === 'runtimes' || entry.area?.startsWith('runtime:'));
    complete = coverage.length > 0 && coverage.every(entry => ['complete', 'absent'].includes(entry.status));
  } else if (rule.kind === 'application') {
    candidates = (inventory.applications || []).filter(app => (rule.applicationNames || []).includes(app.name))
      .map(app => ({ version: app.version, path: app.path, label: `${app.name}: ${app.version || '未確認'}; ${app.path}` }));
    const coverage = (inventory.coverage || []).filter(entry => entry.area === 'applications' || entry.area?.startsWith('applications:'));
    complete = coverage.length > 0 && coverage.every(entry => ['complete', 'absent'].includes(entry.status));
  } else if (rule.kind === 'os') {
    candidates = [{ version: inventory.host?.osVersion, label: `sw_vers: macOS ${inventory.host?.osVersion || '未確認'} (${inventory.host?.buildVersion || 'build 不明'})` }];
    complete = typeof inventory.host?.osVersion === 'string';
  }
  result.evidence = candidates.map(candidate => candidate.label);
  result.historyScope = 'declared-advisory-only';
  if (candidates.length === 1) result.version = candidates[0].version;
  if (rule.fixedVersion) result.fixed = rule.fixedVersion;
  result.installationEvidence = candidates.map(candidate => ({ ...(candidate.path ? { path: candidate.path } : {}), version: candidate.version }));
  if (rule.verified !== true) { result.reasonCode = 'rule-unverified'; result.reason = '影響範囲の出典が未検証'; return result; }
  if (!candidates.length) {
    result.status = complete ? '影響なし' : '可能性あり';
    result.reason = complete ? '対象製品の棚卸しが完了し、対象配布チャネルの製品は見つからなかった' : '対象製品の一覧が不完全で、不在を判断できない';
    return result;
  }
  const ranges = rule.affectedRanges || (rule.affectedRange ? [rule.affectedRange] : []);
  const checks = candidates.map(candidate => {
    if (['java', 'jdk'].includes(rule.runtimeName)) return null;
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
    result.status = '可能性高'; result.reasonCode = 'rule-version-affected'; result.reason = '検証済みの影響範囲に入る実機の版が存在。攻撃・実行経路・IOC は未確認';
  } else if (checks.some(value => value === null)) {
    result.status = '可能性あり'; result.reasonCode = 'rule-version-unsupported'; result.reason = '関連製品は存在するが、一部の内蔵版・版形式・影響範囲を比較できない';
  } else if (!complete) {
    // 取得済みの修正版は保持し、未読rootにある別の対象版まで無影響へ昇格しない。
    result.status = '可能性あり'; result.reasonCode = 'rule-inventory-partial'; result.reason = '確認した版は当該影響範囲外だが、製品の探索範囲が不完全で未確認の版が残る';
  } else {
    result.status = '影響なし'; result.reasonCode = 'rule-version-not-affected'; result.reason = `確認した版は検証済みの影響範囲外${rule.fixedVersion ? `（修正版 ${rule.fixedVersion} 以降）` : ''}。対象外の未探索領域を含む端末全体の安全保証ではない`;
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
    sources: rule.sourceUrl ? [rule.sourceUrl] : [], impact: { kind: 'assessment-unknown', compromise: 'unconfirmed' }, incident: rule.incident === true, verified: rule.verified === true, verifiedAt: rule.verifiedAt, observedAt: inventory.collectedAt || inventory.generatedAt, assessmentBasis: 'verified-advisory-range' };
  const checks = (iocEvidence.checks || []).filter(check => check.ruleId === rule.id);
  const strong = checks.filter(check => check.matched === true && check.strong === true && check.kind === 'sha256');
  const supporting = checks.filter(check => check.matched === true && !strong.includes(check));
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
    result.impact = { kind: 'specific-ioc-match', compromise: 'specific-evidence', executionConfirmed: false };
    result.status = '確定'; result.reason = '検証済みの攻撃 IOC と強い一致。単なる製品の存在による判定ではない';
    result.evidence = strong.map(check => `${check.command || check.kind}: ${check.reason || check.value || '一致'}`);
    return result;
  }
  if (['runtime', 'runtime-component', 'application', 'os'].includes(rule.kind)) return finish(matchVersionRule(inventory, rule, result));
  if (rule.kind !== 'extension') {
    result.reason = '自動判定に未対応のルール形式。出典と対象製品を人が照合する必要がある'; return result;
  }
  const all = (inventory.extensions || []).filter(ext => ext.id?.toLowerCase() === rule.extensionId?.toLowerCase());
  const candidates = all.filter(ext => editorIdentity(rule.editor) !== null && editorIdentity(ext.editor) === editorIdentity(rule.editor));
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
    result.status = matched ? '可能性高' : otherVerifiedSource && extensionCoverageComplete(inventory, rule.editor) ? '影響なし' : '可能性あり';
    result.reason = matched ? '対象エディタに影響版または残骸があり、配布元と既知の配布期間も一致。IOC と実行履歴は別途確認が必要'
      : otherVerifiedSource ? '確認した影響版の入手元は攻撃の配布元と異なる。未確認の拡張領域があれば製品全体の無影響は判断できない'
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
function classifyNews(item, inventory, packages, packageCoverage = []) {
  const ecosystemNames = { pip: 'PyPI', rust: 'crates.io', go: 'Go', composer: 'Packagist', rubygems: 'RubyGems', maven: 'Maven', npm: 'npm', nuget: 'NuGet', erlang: 'Hex', actions: 'GitHub Actions' };
  const ecosystems = new Set(['npm', 'PyPI', 'crates.io', 'Go', 'Packagist', 'RubyGems', 'Maven', 'NuGet', 'Hex', 'GitHub Actions', 'Pub', 'SwiftURL', 'VSCode']);
  const base = { id: item.id, title: item.title, url: item.url, source: item.source, sourceId: item.sourceId,
    category: item.category, categories: item.categories || [], coverageTopics: item.coverageTopics || [], aliases: item.aliases || [],
    publishedAt: item.publishedAt, updatedAt: item.updatedAt, publishedMonth: item.publishedMonth, updatedMonth: item.updatedMonth, fetchedAt: item.fetchedAt,
    categoryStatus: item.categoryStatus,
    datePrecision: item.datePrecision, dateSemantics: item.dateSemantics, ongoing: item.ongoing === true,
    distribution: item.distribution, distributionRelease: item.distributionRelease, repository: item.repository,
    severity: item.severity, knownExploited: item.knownExploited === true, advisoryType: advisoryKind(item) };
  if (item.distribution) {
    const distribution = String(item.distribution).toLowerCase(), release = String(item.distributionRelease || '').replace(/^v/, '');
    const targets = new Set([...(item.affected || []), ...(item.fixed || [])].map(entry => entry.name).filter(Boolean));
    const matches = (inventory.sbomPackages || []).filter(record => record.distribution === distribution && release && record.distributionRelease === release
      && (!targets.size || targets.has(record.sourcePackage || record.name)) && !record.distributionConflict);
    const endpoints = (inventory.coverage || []).filter(row => row.area === 'container-endpoint');
    const noObservedImages = endpoints.length > 0 && endpoints.every(row => ['complete', 'absent'].includes(row.status)) && !(inventory.containers || []).length;
    // A host Homebrew package never establishes applicability of a Linux distribution's package record.
    return { ...base, relevance: matches.length ? '関係あり' : noObservedImages ? '関係なし' : '確認候補', matchedProducts: [...new Set(matches.map(record => record.sourcePackage || record.name))],
      reasonCode: matches.length ? 'news-structured-match' : noObservedImages ? 'news-other-platform' : 'news-inventory-incomplete',
      reason: matches.length ? '同じdistribution・release・source packageのSBOM記録あり。画像内部の完全性と各CVEの影響版は別途確認が必要。'
        : noObservedImages ? '今回確認したローカルのコンテナ一覧には対象画像を観測していません。別端末や未接続環境は未確認です。' : 'Linux配布版の対象と一致する記録を確認できず、ローカル影響は未確認です。',
      needsReview: matches.length > 0 || !noObservedImages };
  }
  const affected = (item.affected || []).filter(entry => typeof entry.name === 'string' && (ecosystems.has(ecosystemNames[entry.ecosystem] || entry.ecosystem) || /^(?:Debian|Alpine):/.test(entry.ecosystem || '')));
  // Structured package names must match the exact ecosystem; runtime names are not library identities.
  if (affected.length) {
    const installed = [...packages, ...(inventory.globalPackages || []), ...(inventory.sbomPackages || [])];
    const matched = [];
    let editorOnly = false, unknownEditor = false;
    for (const target of affected) {
      const ecosystem = ecosystemNames[target.ecosystem] || target.ecosystem;
      if (ecosystem === 'VSCode') {
        const extensions = (inventory.extensions || []).filter(extension => extension.id?.toLowerCase() === target.name.toLowerCase()
          && (!target.editor || editorIdentity(target.editor) !== null && editorIdentity(extension.editor) === editorIdentity(target.editor)));
        const ambiguous = (inventory.extensions || []).some(extension => extension.id?.toLowerCase() === target.name.toLowerCase() && ['portable', 'Portable'].includes(extension.editor));
        const editorPresent = (inventory.extensions || []).some(extension => !target.editor || editorIdentity(target.editor) !== null && editorIdentity(extension.editor) === editorIdentity(target.editor))
          || (inventory.applications || []).some(app => editorIdentity(target.editor) === 'cursor' ? app.name === 'Cursor' : editorIdentity(target.editor) === 'vscode' ? app.name === 'Visual Studio Code' : !target.editor && ['Cursor', 'Visual Studio Code'].includes(app.name));
        if (extensions.length || editorPresent || ambiguous) {
          matched.push(extensions.length ? target.name : target.editor || 'editor');
          if (!extensions.length) editorOnly = true;
          if (!extensions.length && !editorPresent && ambiguous) unknownEditor = true;
        }
      } else if (installed.some(pkg => pkg.name === target.name && (ecosystemNames[pkg.ecosystem] || pkg.ecosystem) === ecosystem)) matched.push(target.name);
    }
    const complete = affected.every(target => target.ecosystem === 'VSCode' ? extensionCoverageComplete(inventory, target.editor)
      : packageCoverage.some(row => row.area === 'package-extraction') && assessmentStatus(packageCoverage) !== 'partial');
    return { ...base, relevance: unknownEditor || !matched.length && !complete ? '確認候補' : matched.length ? '関係あり' : '関係なし', matchedProducts: [...new Set(matched)],
      reasonCode: unknownEditor ? 'news-ambiguous-editor' : matched.length ? editorOnly ? 'news-editor-context' : 'news-structured-match' : complete ? 'news-target-not-observed' : 'news-inventory-incomplete',
      reason: !matched.length ? complete ? '今回確認したパッケージ範囲では対象名を検出していません。端末全体の不在を意味しません。' : '対象パッケージを検出していませんが、探索・照合範囲が不完全で関連性は未確認です。'
        : unknownEditor ? '同じ拡張IDのPortable記録があるがエディタの配布系統は未確認'
          : editorOnly ? '対象エディタが存在。現在の拡張導入や影響版の存在は未確認です。'
          : '告知の対象名とエコシステムが観測記録に一致。影響版・配布元は個別判定を参照。',
      needsReview: matched.length > 0 || !complete };
  }
  const runtimeAliases = { node: 'Node.js', java: 'Java', jdk: 'Java', ruby: 'Ruby', openssl: 'OpenSSL', php: 'PHP', electron: 'Electron' };
  const brewNames = [...(inventory.homebrew?.formulae || []), ...(inventory.homebrew?.casks || [])].flatMap(value => {
    const raw = value.name || value.token;
    if (typeof raw !== 'string') return [];
    const name = raw.split('/').at(-1).replace(/@\d+(?:\.\d+)*$/, '');
    return [name, name === 'openjdk' ? 'Java' : name === 'imagemagick' ? 'ImageMagick' : name === 'openssl' ? 'OpenSSL' : null];
  });
  const identities = [
    ...(inventory.applications || []).flatMap(app => [app.name === 'Code' ? 'Visual Studio Code' : app.name, app.bundleId]),
    ...(inventory.applications || []).flatMap(app => /^Google Chrome/.test(app.name) ? ['Chrome'] : app.name === 'Code' || app.name === 'Visual Studio Code' ? ['VS Code'] : []),
    ...(inventory.applications || []).flatMap(app => (app.components || []).map(component => runtimeAliases[component.name] || component.name)),
    ...(inventory.runtimes || []).flatMap(runtime => [runtimeAliases[runtime.name] || runtime.name, runtime.name === 'java' ? 'JDK' : null]), ...brewNames,
    ...(inventory.extensions || []).flatMap(extension => [extension.id, { cursor: 'Cursor', vscode: 'VS Code' }[editorIdentity(extension.editor)]]),
    ...(inventory.host?.osVersion ? ['macOS', 'Apple'] : []),
  ].filter(value => typeof value === 'string' && value.length >= 3 && !/^(?:code|connect|key|three|phone|apps|open|read|when|which|long)$/i.test(value));
  const corpus = [item.title, item.summary, ...(item.products || []).map(product => typeof product === 'string' ? product : product.name)].join(' ').toLowerCase();
  // Retain other-platform news for the briefing without assigning it to this Mac.
  if (/chrome.*(?:android|ios|chromeos)|chromeos.*update/i.test(item.title || '') || /^(?:iOS|iPadOS|watchOS|tvOS)\b/i.test(item.title || '')) return { ...base,
    relevance: '関係なし', matchedProducts: [], reasonCode: 'news-other-platform', reason: '今回のmacOS対象とはOS・配布チャネルが異なる。別端末の安全判定ではない', needsReview: false };
  const escapedName = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matched = [...new Set(identities.filter(identity => new RegExp(`(^|[^a-z0-9])${escapedName(identity)}([^a-z0-9]|$)`, 'i').test(corpus)))].slice(0, 8);
  const packageMentions = packages.filter(pkg => new RegExp(`(?:npm|pypi|package|パッケージ)\\s+[\\x60'"]?${escapedName(pkg.name)}(?:[\\x60'"\\s@]|$)`, 'i').test(corpus)).map(pkg => pkg.name);
  const browserCandidate = (inventory.browserExtensions || []).length > 0 && /browser extensions?|chrome extensions?|searchjacked|ブラウザ拡張|検索.*乗っ取/i.test(corpus);
  const candidate = !matched.length && (packageMentions.length > 0 || browserCandidate);
  const summaryOnly = matched.length > 0 && matched.every(value => !(item.title || '').toLowerCase().includes(value.toLowerCase()));
  const complete = (inventory.coverage || []).length > 0 && assessmentStatus(inventory.coverage) !== 'partial';
  return { ...base, relevance: summaryOnly ? '確認候補' : matched.length ? '関係あり' : candidate || !complete ? '確認候補' : '関係なし', matchedProducts: [...matched, ...packageMentions],
    reasonCode: summaryOnly ? 'news-summary-only' : matched.length ? 'news-product-match' : candidate ? 'news-text-candidate' : complete ? 'news-no-local-evidence' : 'news-inventory-incomplete',
    reason: matched.length ? '導入製品名が一致。影響範囲・対象OS・配布元・修正版は個別確認が必要。'
      : candidate ? 'パッケージの明示的言及またはブラウザ拡張の調査記事。対象版・拡張IDは未確認。'
        : complete ? '今回の観測範囲では関連製品を確認していません。未使用や無影響の証明ではありません。' : '棚卸しが不完全なため、この記事のローカル影響は未確認です。',
    needsReview: matched.length > 0 || candidate || !complete };
}

/**
 * ニュース、ルール、OSV の照合結果を四段階のローカル判定に統合する。
 * CLI とテストから呼ばれ、未完了の検査を全体の安全宣言へ変換しない。
 * @returns 個別判定、記事の関係分類、検査範囲。
 * @example
 * matchInventory(inventory, news, { rules: { rules: [] } });
 */
export function matchInventory(inventory, news, { packages = {}, rules = {}, iocEvidence = {}, advisoryDetails = {}, now = new Date() } = {}) {
  let findings = (Array.isArray(rules) ? rules : rules.rules || []).map(rule => matchRule(inventory, rule, iocEvidence));
  // OSV の一致は影響版の存在を示すだけで、実際の攻撃や窃取を証明しない。
  for (const hit of packages.findings || []) {
    const detail = (advisoryDetails.details || []).find(entry => entry.id === hit.id);
    if (detail?.withdrawn) continue;
    const kind = advisoryKind({ ...hit, advisoryType: detail?.advisoryType || hit.advisoryType });
    findings.push({ id: `${hit.id}:${hit.package?.ecosystem}:${hit.package?.name}:${hit.version}`,
      advisoryId: hit.id, aliases: [...new Set([...(hit.aliases || []), ...(detail?.aliases || [])])], title: `${hit.package?.name} ${hit.version} — ${hit.id}`, status: '可能性高',
      reason: kind === 'malware' ? '悪性配布として公表された版と記録が一致。入手元・実物・実行痕跡を優先確認。実行・窃取は未確定'
        : 'OSV がロックまたはグローバル記録のパッケージ版を影響範囲と判定。実際のインストール・実行・到達可能性・攻撃 IOC は未確認',
      evidence: (hit.evidence || []).map(location => `scan-packages.mjs / OSV querybatch: ${location}`),
      sources: [hit.sourceUrl || `https://osv.dev/vulnerability/${encodeURIComponent(hit.id)}`],
      package: hit.package, version: hit.version, queriedAt: hit.queriedAt, queryComplete: hit.queryComplete, historyScope: hit.historyScope, reasonCode: kind === 'malware' ? 'package-malicious-record' : 'package-osv-affected', advisoryType: kind, incident: kind === 'malware',
      severity: normalizeSeverity(detail?.severity || hit.severity, 'OSV'), severityEvidence: detail?.severityEvidence || hit.severityEvidence || [], impact: assessPackageImpact(hit), occurrences: hit.occurrences || [], knownExploited: detail?.knownExploited || false, modified: hit.modified, localEvidence: hit.evidence || [],
      installationEvidence: hit.installationEvidence || [], projectActive: projectIsActive(hit.evidence, inventory.executionContexts),
      scope: evidenceScope(hit.evidence || [], inventory) });
  }
  const packageList = packages.packages || inventory.globalPackages || [];
  const ecosystemNames = { pip: 'PyPI', rust: 'crates.io', go: 'Go', composer: 'Packagist', rubygems: 'RubyGems', maven: 'Maven', npm: 'npm' };
  const existing = new Set(findings.map(finding => `${finding.advisoryId}:${finding.package?.ecosystem}:${finding.package?.name}:${finding.version}`));
  const exclusions = [];
  // 構造化 Advisory だけを版照合し、記事の自然言語から自動で影響範囲を推測しない。
  for (const item of [...(news.historicalAdvisories || []), ...(news.items || [])]) {
    if (item.withdrawnAt || item.needsReview !== false) continue;
    for (const affected of item.affected || []) {
      const ecosystem = ecosystemNames[affected.ecosystem] || affected.ecosystem;
      const candidates = packageList.filter(pkg => pkg.name === affected.name && pkg.ecosystem === ecosystem);
      for (const pkg of candidates) {
        const key = `${item.id}:${ecosystem}:${pkg.name}:${pkg.version}`;
        // Only the reviewed numeric npm subset uses this comparator. Distro/JDK/PEP440/Ruby ordering is not SemVer.
        const affectedVersion = Array.isArray(affected.versions) ? affected.versions.includes(pkg.version) : ecosystem === 'npm' ? satisfiesRange(pkg.version, affected.range) : null;
        if (affectedVersion === false) {
          const ids = new Set([item.id, ...(item.aliases || [])]);
          exclusions.push({ ids, ecosystem, name: pkg.name, version: pkg.version, source: item.url });
          const conflict = findings.filter(finding => finding.package?.name === pkg.name && finding.package?.ecosystem === ecosystem && finding.version === pkg.version
            && [finding.advisoryId, ...(finding.aliases || [])].some(id => ids.has(id)) && ['可能性高', '確定'].includes(finding.status));
          for (const finding of conflict) {
            finding.status = finding.status === '確定' ? '確定' : '可能性あり'; finding.conflictingEvidence = true;
            finding.reasonCode = 'advisory-conflict'; finding.reason = '同じ告知・版について情報源の判定が競合。影響ありの証拠を保持し、無影響とは判定しません。';
            finding.sources = [...new Set([...finding.sources, item.url].filter(Boolean))];
          }
          continue;
        }
        const contradicting = exclusions.filter(entry => entry.ecosystem === ecosystem && entry.name === pkg.name && entry.version === pkg.version
          && [item.id, ...(item.aliases || [])].some(id => entry.ids.has(id)));
        if (existing.has(key)) {
          const found = findings.find(finding => finding.id === key);
          if (found && advisoryKind(item) === 'malware') { found.incident = true; found.advisoryType = 'malware'; found.reason = '公開された悪性配布の版と記録が一致。入手元・実物・実行痕跡を優先確認。実行・窃取は未確定'; }
          if (found && item.severity) found.severity = item.severity;
          if (found) { found.aliases = [...new Set([...(found.aliases || []), ...(item.aliases || [])])]; found.sources = [...new Set([...found.sources, item.url].filter(Boolean))]; found.severityEvidence = [...(found.severityEvidence || []), ...(item.severityEvidence || [])]; }
          continue;
        }
        findings.push({ id: key, advisoryId: item.id, aliases: item.aliases || [], title: `${pkg.name} ${pkg.version} — ${item.id}`, status: affectedVersion === true && !contradicting.length ? '可能性高' : '可能性あり', reasonCode: contradicting.length ? 'advisory-conflict' : affectedVersion === true ? 'package-advisory-affected' : 'package-range-unsupported',
          conflictingEvidence: contradicting.length > 0, historyScope: 'fetched-structured-advisories',
          reason: contradicting.length ? '同じ告知・版について情報源の判定が競合。影響ありの証拠を保持し、無影響とは判定しません。' : affectedVersion === true ? advisoryKind(item) === 'malware' ? 'GitHubの悪性配布告知の版と記録が一致。入手元・実物・実行痕跡を優先確認。実行・窃取は未確定'
            : '構造化 GitHub Advisory の影響範囲とローカルの固定版が一致。実行・攻撃の確認ではない' : '製品は一致するが、この影響範囲の構文または版を安全に比較できない',
          evidence: (Array.isArray(pkg.evidence) ? pkg.evidence : [pkg.evidence || 'グローバル一覧']).map(location => `scan-packages.mjs: ${location}; range=${affected.range || JSON.stringify(affected.versions)}`),
          sources: [...new Set([item.url, ...contradicting.map(entry => entry.source)].filter(Boolean))], package: { name: pkg.name, ecosystem }, version: pkg.version, fixed: affected.fixed || null,
          advisoryType: advisoryKind(item), incident: advisoryKind(item) === 'malware', severity: normalizeSeverity(item.severity, item.source), severityEvidence: item.severityEvidence || [], impact: assessPackageImpact(pkg), occurrences: pkg.occurrences || [],
          localEvidence: Array.isArray(pkg.evidence) ? pkg.evidence : [pkg.evidence].filter(Boolean),
          installationEvidence: pkg.installationEvidence || [], projectActive: projectIsActive(Array.isArray(pkg.evidence) ? pkg.evidence : [pkg.evidence].filter(Boolean), inventory.executionContexts),
          scope: evidenceScope(Array.isArray(pkg.evidence) ? pkg.evidence : [pkg.evidence || ''], inventory) });
        existing.add(key);
      }
    }
  }
  // Discovered, validated IOC matches are reportable even without a permanent product rule.
  for (const check of [...(iocEvidence.checks || [])].sort((a, b) => Number(b.strong === true) - Number(a.strong === true))) {
    if (check.matched !== true || findings.some(finding => finding.id === check.ruleId)) continue;
    const specific = check.strong === true && check.kind === 'sha256';
    findings.push({ id: check.ruleId, title: check.product || check.ruleId, status: specific ? '確定' : '可能性あり', incident: true,
      reasonCode: specific ? 'ioc-file-match' : 'ioc-supporting-match', reason: specific ? '検証済みの悪性ファイルhashと一致。ファイルの存在を確認しました。実行・窃取は未確認です。' : '公開IOCのパスまたはプロセス名と一致。これだけでは侵害を確定できません。',
      sources: [check.sourceUrl], observedAt: check.observedAt, verifiedAt: check.verifiedAt, evidence: (iocEvidence.checks || []).filter(item => item.ruleId === check.ruleId && item.matched === true).map(item => item.value), localEvidence: (iocEvidence.checks || []).filter(item => item.ruleId === check.ruleId && item.matched === true).map(item => item.value),
      impact: { kind: specific ? 'specific-ioc-match' : 'supporting-ioc-match', compromise: specific ? 'specific-evidence' : 'unconfirmed', executionConfirmed: false } });
  }
  const kev = new Set(news.knownExploitedIds || []);
  const newsAssessment = (news.items || []).map(item => classifyNews({ ...item, knownExploited: item.knownExploited === true || [item.id, ...(item.aliases || [])].some(id => kev.has(id)) }, inventory, packageList, packages.coverage || []));
  const coverage = [...(inventory.coverage || []), ...(packages.coverage || []), ...(iocEvidence.coverage || []), ...(news.productCoverage || [])];
  if (news.sourceRegistry) coverage.push(news.sourceRegistry);
  // 古い検証済みルールで「影響なし」を継続せず、出典の再確認へ戻す。
  for (const rule of Array.isArray(rules) ? rules : rules.rules || []) {
    const verifiedAt = Date.parse(rule.verifiedAt), age = (new Date(now).getTime() - verifiedAt) / 86400000;
    if (!Number.isFinite(age) || age < 0 || age > 30) {
      coverage.push({ area: `rule-freshness:${rule.id}`, status: 'partial', reason: '出典の検証日が未確認・未来または30日超。影響版・配布元・IOCを再確認する' });
      const found = findings.find(finding => finding.id === rule.id);
      if (found) { found.status = '可能性あり'; found.reason = 'ルールの出典再確認期限を超過または検証日不明。以前の影響範囲だけでは最新の無影響・確定を判定しない'; }
    }
  }
  findings.push(...matchSecurityReleases(inventory, news.securityReleases || []));
  findings.push(...matchProductBaselines(inventory, news.securityUpdates || []));
  const homebrew = matchHomebrew(inventory, news.homebrew);
  findings.push(...homebrew.findings);
  coverage.push(...homebrew.coverage);
  for (const source of news.sources || []) {
    coverage.push({ area: `news:${source.name}`, status: source.status, reason: source.reason, count: source.itemCount });
    if (source.historicalCoverage) coverage.push({ area: `news-history:${source.name}`, status: 'partial', reason: typeof source.historicalCoverage === 'string' ? source.historicalCoverage : JSON.stringify(source.historicalCoverage) });
  }
  // A retained prior finding keeps its original observation; only this run's findings receive this timestamp.
  findings = findings.map(finding => ({ ...finding, observedAt: finding.observedAt || new Date(now).toISOString() }));
  const aggregate = aggregateAdvisories(findings, advisoryDetails.details || []);
  findings = consolidateFindings(aggregate.groups);
  return { schemaVersion: 2, generatedAt: new Date(now).toISOString(), findings, newsAssessment, coverage,
    advisoryGroups: aggregate.groups, uniqueAdvisoryCount: aggregate.uniqueAdvisoryCount, affectedTargetCount: aggregate.affectedTargetCount, advisoryTargetCount: aggregate.advisoryTargetCount,
    impact: findings.some(finding => finding.status === '確定') ? 'specific-ioc-match' : 'compromise-unconfirmed',
    counts: Object.fromEntries(STATUSES.map(status => [status, findings.filter(finding => finding.status === status).length])),
    conclusion: findings.some(finding => finding.status === '確定') ? '検証済み IOC の一致あり' : '検査範囲内で侵害を確定する IOC は未確認。被害がないことの証明ではない' };
}

/** 同一告知・版のaliasを表示上まとめ、場所と全出典は保持する。中央判定が呼ぶ。 @example consolidateFindings(groups) */
function consolidateFindings(groups) {
  return groups.flatMap(group => {
    const targets = new Map();
    for (const finding of group.findings) {
      const key = finding.advisoryId ? `${group.id}:${finding.package?.ecosystem || ''}:${finding.package?.name || ''}:${finding.version || ''}` : finding.id;
      const prior = targets.get(key);
      if (!prior) { targets.set(key, { ...finding, id: key, advisoryId: finding.advisoryId ? group.id : undefined, aliases: group.advisoryIds }); continue; }
      if (STATUSES.indexOf(finding.status) < STATUSES.indexOf(prior.status)) { prior.status = finding.status; prior.reason = finding.reason; }
      for (const field of ['sources', 'evidence', 'localEvidence']) prior[field] = [...new Set([...(prior[field] || []), ...(finding[field] || [])])];
      prior.occurrences = [...(prior.occurrences || []), ...(finding.occurrences || [])];
      prior.installationEvidence = [...(prior.installationEvidence || []), ...(finding.installationEvidence || [])];
      prior.severityEvidence = [...(prior.severityEvidence || []), ...(finding.severityEvidence || [])];
      if (normalizeSeverity(finding.severity).rank > normalizeSeverity(prior.severity).rank) prior.severity = finding.severity;
      if (finding.conflictingEvidence || prior.conflictingEvidence) { prior.conflictingEvidence = true; if (prior.status !== '確定') prior.status = '可能性あり'; prior.reasonCode = 'advisory-conflict'; prior.reason = '同じ告知の判定が競合。陽性の証拠を保持し、無影響とは判断しません。'; }
      if (finding.incident) { prior.incident = true; prior.advisoryType = finding.advisoryType; }
      if (finding.impact?.installationConfirmed) prior.impact = finding.impact;
    }
    return [...targets.values()];
  });
}

/** 導入後に見つかった過去の公式更新を候補にする。履歴一覧から影響開始版は推測しない。 @example matchProductBaselines(inventory, updates) */
export function matchProductBaselines(inventory, updates) {
  const findings = [];
  for (const app of inventory.applications || []) {
    const product = app.bundleId === 'org.mozilla.thunderbird' || app.name === 'Thunderbird' ? 'Thunderbird'
      : app.bundleId === 'org.mozilla.firefox' || ['Firefox', 'Firefox ESR'].includes(app.name) ? 'Firefox' : null;
    if (!product) continue;
    const channel = app.channel || (app.name === 'Firefox ESR' ? 'esr' : 'unknown');
    const candidates = updates.filter(update => update.product === product && update.freshness !== 'stale' && update.channel === channel);
    for (const update of candidates) {
      const asVersion = value => /^\d+$/.test(value || '') ? `${value}.0` : value;
      const compared = compareVersions(asVersion(app.version), asVersion(update.fixedVersion));
      if (compared !== null && compared >= 0) continue;
      // ESRは同じメジャー系統の更新だけを比較し、別branchを脆弱性境界として適用しない。
      if (channel === 'esr' && app.version?.split('.')[0] !== update.fixedVersion.split('.')[0]) continue;
      findings.push({ id: `product-update:${app.bundleId || app.name}:${update.channel}:${update.fixedVersion}`, title: `${app.name} ${app.version || '版不明'}：公式セキュリティ更新 ${update.fixedVersion}`,
        product: app.name, version: app.version, status: '可能性あり', category: 'update-review', incident: false, fixed: update.fixedVersion, scope: '端末', sources: update.urls || [update.sourceUrl],
        reason: '公式の修正済みリリース履歴に未到達または版比較不能。CVEの影響開始版と実行条件は個別告知で確認する',
        impact: { kind: 'installed-version-review', compromise: 'unconfirmed', installationConfirmed: true }, localEvidence: [app.path].filter(Boolean), evidence: [app.path].filter(Boolean),
        installationEvidence: [{ path: app.path, version: app.version }], advisoryReferences: update.advisoryIds });
    }
  }
  return findings;
}

/**
 * 期間外も含むApple公式リリース表から未適用更新を拾う。{@link matchInventory} が固定ルールの漏れを補う。
 * @returns 対応製品の更新確認候補。CVEの影響開始版や悪用の有無は推測しない。
 */
export function matchSecurityReleases(inventory, releases) {
  const supported = [{ name: 'Xcode', pattern: /^Xcode\s+(\d+\.\d+(?:\.\d+)?)$/i },
    { name: 'Safari', pattern: /^Safari\s+(\d+\.\d+(?:\.\d+)?)$/i },
    { name: 'macOS', pattern: /^macOS(?:\s+[A-Za-z]+)*\s+(\d+(?:\.\d+){0,2})$/i }];
  const findings = [];
  for (const product of supported) {
    const installed = product.name === 'macOS' ? inventory.host?.osVersion ? [{ name: 'macOS', bundleId: 'com.apple.macos', version: inventory.host.osVersion }] : []
      : (inventory.applications || []).filter(app => app.name === product.name);
    const candidates = releases.flatMap(release => {
      const rawVersion = product.pattern.exec(release.title || '')?.[1];
      const version = rawVersion && /^\d+$/.test(rawVersion) ? `${rawVersion}.0` : rawVersion;
      let official = false;
      try { const url = new URL(release.url); official = url.origin === 'https://support.apple.com' && !url.username && !url.password; } catch { /* 不正な公開URLは採用しない。 */ }
      return version && official && release.freshness !== 'stale' ? [{ ...release, version }] : [];
    }).sort((a, b) => compareVersions(b.version, a.version) || 0);
    for (const app of installed) {
      // macOS branches receive independent security updates; a newer major is not a CVE boundary.
      const latest = candidates.find(release => product.name !== 'macOS' || release.version.split('.')[0] === app.version.split('.')[0]);
      if (!latest) continue;
      const compared = compareVersions(app.version, latest.version);
      findings.push({ id: `security-update:${app.bundleId || app.name}:${latest.version}`, title: `${app.name} ${app.version}：セキュリティ更新 ${latest.version} を確認`,
        status: compared === null || compared < 0 ? '可能性あり' : '影響なし', category: 'update-review', incident: false, scope: '端末', sources: [latest.url], fixed: latest.version,
        product: app.name, version: app.version, historyScope: 'official-release-index', assessmentBasis: product.name === 'macOS' ? 'same-major-security-release' : 'official-security-release',
        reasonCode: compared === null || compared < 0 ? 'security-release-review' : 'security-release-reached',
        reason: compared === null || compared < 0 ? '公式リリース表の更新に未到達または版比較不能。対象OS・各CVEの影響開始版・実行条件は本文で確認する'
          : '確認した公式更新候補に到達。当該更新候補の適用確認だけであり、製品全体の無脆弱性・無侵害の証明ではない', evidence: [app.path].filter(Boolean), localEvidence: [app.path].filter(Boolean),
        publishedAt: latest.publishedAt, installationEvidence: [{ ...(app.path ? { path: app.path } : {}), version: app.version }] });
    }
  }
  return findings;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write('使い方: node scripts/match.mjs --inventory 棚卸し.json --news ニュース.json [--packages 照合.json] [--rules 検証済みルール.json] [--ioc-evidence IOC証拠.json] [--advisory-details 詳細.json]\n実行場所はスキルroot。入力JSONをローカルで照合し、JSONを非公開の証拠保存先へリダイレクトする。ヘルプでは照合しない。\n');
  } else {
    const context = createRunContext({ budgetMs: 120000 });
    try {
      const flags = new Map();
      for (let index = 0; index < args.length; index += 2) {
        if (!['--inventory', '--news', '--packages', '--rules', '--ioc-evidence', '--advisory-details'].includes(args[index]) || !args[index + 1] || flags.has(args[index])) throw new SweepError('CONFIG', { cause: 'malformed', operation: 'cli' });
        flags.set(args[index], path.resolve(args[index + 1]));
      }
      if (!flags.has('--inventory') || !flags.has('--news')) throw new SweepError('CONFIG', { cause: 'malformed', operation: 'cli' });
      const readArgument = async flag => flags.has(flag) ? context.io.readJson(flags.get(flag), { roots: [path.dirname(flags.get(flag))], maxBytes: 32 * 1024 ** 2 }) : {};
      const [inventory, news, packages, rules, iocEvidence, advisoryDetails] = await Promise.all(['--inventory', '--news', '--packages', '--rules', '--ioc-evidence', '--advisory-details'].map(readArgument));
      const result = matchInventory(inventory, news, { packages, rules, iocEvidence, advisoryDetails });
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      if (assessmentStatus(result.coverage) === 'partial') process.exitCode = 2;
    } catch (error) {
      const diagnostic = safeDiagnostic(error, 'INTERNAL', 'cli');
      process.stderr.write(JSON.stringify(diagnostic) + '\n');
      process.exitCode = diagnostic.code === 'MSS_CONFIG' ? 64 : 1;
    } finally { await context.close(); }
  }
}
