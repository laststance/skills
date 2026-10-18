// Live disk-map viewer: treemap, recommendations, review dialogs, chat with
// the invoking agent, exact cleanup manifests, results and restore.
// All file names and agent text are rendered as text, never as HTML.
import { formatBytes, squarify } from '/treemap.mjs';

const I18N = {
  en: {
    title: 'Disk map', rescan: 'Rescan', export: 'Export report', end: 'End session', free: 'Free right now', safeCard: 'Verified cleanup',
    reviewCard: 'Needs review', unaccounted: 'Unaccounted', explorer: 'Explorer', explorerSub: 'Sized by allocated space. Select a region to inspect it.',
    category: 'Category', cleanupMode: 'Cleanup', search: 'Search names', list: 'Folder contents', name: 'Name', allocated: 'Allocated', state: 'State',
    more: 'Show more', recs: 'Recommendations', recsSub: 'Checked items enter the cleanup plan. Review items need your answer first.', results: 'Results',
    chat: 'Chat with your agent', clear: 'Clear', ask: 'Ask about the selected region…', send: 'Send', selectSafe: 'Select safe', cleanUp: 'Clean Up',
    of: 'of {total}', items: '{n} items', outsideScan: 'used but outside this scan', scanning: 'Scanning… {n} items · {bytes}', scanned: 'Read-only scan complete · revision {r}',
    partial: 'Partial: {n} locations denied or unmapped', cancelled: 'Scan cancelled · partial snapshot', cleaning: 'Cleaning… do not quit the agent', ended: 'Session ended · live actions are disabled',
    failed: 'Scan failed', agentOn: 'Agent connected', agentWait: 'Waiting for agent', agentOff: 'Agent disconnected',
    reconnect: 'Ask the agent that started disk-map to continue its disk-map loop (`next`). New cleanup plans are paused until it reconnects.',
    waitHelp: 'The agent that started disk-map answers here. It may take a moment to connect.', onHelp: 'Questions go to the agent that started this session.',
    mapped: '{bytes} mapped', smallFiles: '{n} small files', other: '{n} more', safeGroup: 'Safe to remove', reviewGroup: 'Review first', waitingGroup: 'Waiting for agent',
    blockedGroup: 'Not cleanable ({n})', review: 'Review', remove: 'Permanent removal', trash: 'Move to Trash', cli: 'Tool cleanup', restoreOp: 'Restore',
    answerFirst: 'Answer the review question first', noItems: 'No candidates yet.', selected: '{n} selected · {bytes} represented · reclaimable {rec}', unknown: 'unknown',
    noSelection: 'Nothing selected', path: 'Path', logical: 'Logical size', kind: 'Kind', risk: 'Assessment', purpose: 'Purpose', operation: 'Proposed operation',
    command: 'Command', consequences: 'If removed', evidence: 'Evidence', question: 'Question', coverage: 'Coverage', complete: 'Complete', incomplete: 'Incomplete (denied, cancelled or still scanning)',
    openFolder: 'Open folder', askChat: 'Ask in chat', include: 'Include in cleanup', close: 'Close', about: 'About: {name}', you: 'You', agent: 'Agent',
    waitingReply: 'Waiting for the agent…', staleReply: 'This reply refers to an earlier scan revision.', keep: 'Keep', investigate: 'Investigate further',
    reviewTitle: 'Review: {name}', reviewIntro: 'This decision applies only to these paths in scan revision {r}.', affected: 'Affected paths',
    planTitle: 'Final cleanup manifest', planIntro: 'Only these exact targets will be processed. Confirm within {s} seconds.', confirm: 'Confirm cleanup',
    cancel: 'Cancel', irreversible: 'Cannot be undone by disk-map', restorable: 'Restorable from Trash', irreversibleWarn: '{n} operation(s) cannot be undone. Regenerated caches do not bring back the old bytes.',
    trashNote: 'Moving to Trash frees no space until you empty the Trash. disk-map never empties it.', conflicts: 'Excluded before planning', started: 'Cleanup started.',
    restore: 'Restore', restoreBeside: 'Restore beside it', occupied: 'The original location is occupied. Nothing will be overwritten.', restoreTitle: 'Restore from Trash',
    restoreIntro: 'The item moves back to the destination below. Confirm within {s} seconds.', destination: 'Destination', exported: 'Report written to {path}',
    noSession: 'This viewer link was already used or is missing. Ask the agent for the session status.', expired: 'Viewer session expired. Ask the agent to start a new session.',
    endedBanner: 'Session ended. Reports: {path}', excluded: '{n} protected item(s) inside are excluded', status_succeeded: 'Succeeded', status_failed: 'Failed', status_skipped: 'Skipped',
    status_interrupted: 'Interrupted', status_unknown: 'Unknown', m_representedBytes: 'Represented by selection', m_estimatedReclaimableBytes: 'Estimated reclaimable',
    m_permanentCleanupBytes: 'Permanently cleaned (allocated)', m_trashMovedBytes: 'Moved to Trash (not freed)', m_cliReportedBytes: 'Reported by tools', m_observedFreeDeltaBytes: 'Observed free-space change (whole volume)',
    risk_safe: 'Safe', risk_review: 'Review', risk_protected: 'Protected', risk_blocked: 'Blocked', risk_unassessed: 'Not assessed',
    cat_agent_history: 'Agent history', cat_your_files: 'Your files', cat_build_output: 'Build output', cat_dev_cache: 'Developer caches', cat_system_apps: 'System & apps', cat_docker_vm: 'Docker & VMs', cat_ai_models: 'AI models', cat_other: 'Other',
    recovered: '{n} earlier operation(s) had no recorded result and were marked without replaying them.',
  },
  ja: {
    title: 'ディスクマップ', rescan: '再スキャン', export: 'レポートを書き出す', end: 'セッションを終了', free: '現在の空き容量', safeCard: '確認済みの削除候補',
    reviewCard: '確認が必要', unaccounted: '内訳なし', explorer: 'エクスプローラー', explorerSub: '割り当て容量で面積を表示。領域を選ぶと詳細を表示します。',
    category: 'カテゴリ', cleanupMode: 'クリーンアップ', search: '名前で検索', list: 'フォルダの内容', name: '名前', allocated: '割り当て', state: '状態',
    more: 'さらに表示', recs: 'おすすめ', recsSub: 'チェックした項目がクリーンアップ計画に入ります。確認項目は先に回答が必要です。', results: '結果',
    chat: 'エージェントとチャット', clear: 'クリア', ask: '選んだ領域について質問…', send: '送信', selectSafe: '安全な項目を選択', cleanUp: 'クリーンアップ',
    of: '/ {total}', items: '{n} 件', outsideScan: '使用中だがこのスキャン外', scanning: 'スキャン中… {n} 項目 · {bytes}', scanned: '読み取り専用スキャン完了 · リビジョン {r}',
    partial: '一部のみ: {n} か所が拒否または未マップ', cancelled: 'スキャン中止 · 部分的なスナップショット', cleaning: 'クリーンアップ中… エージェントを終了しないでください', ended: 'セッション終了 · ライブ操作は無効です',
    failed: 'スキャン失敗', agentOn: 'エージェント接続中', agentWait: 'エージェント待機中', agentOff: 'エージェント切断',
    reconnect: 'disk-map を起動したエージェントに、disk-map ループ (`next`) の再開を依頼してください。再接続まで新しいクリーンアップ計画は停止します。',
    waitHelp: 'disk-map を起動したエージェントがここで回答します。接続まで少し待ってください。', onHelp: '質問はこのセッションを起動したエージェントに届きます。',
    mapped: '{bytes} をマップ済み', smallFiles: '小さなファイル {n} 個', other: 'ほか {n} 件', safeGroup: '安全に削除可能', reviewGroup: '先に確認', waitingGroup: 'エージェントの評価待ち',
    blockedGroup: '削除できない項目 ({n})', review: '確認', remove: '完全に削除', trash: 'ゴミ箱に移動', cli: 'ツールでクリーンアップ', restoreOp: '復元',
    answerFirst: '先に確認の質問に回答してください', noItems: '候補はまだありません。', selected: '{n} 件選択 · 対象 {bytes} · 回収見込み {rec}', unknown: '不明',
    noSelection: '未選択', path: 'パス', logical: '論理サイズ', kind: '種類', risk: '評価', purpose: '用途', operation: '提案する操作',
    command: 'コマンド', consequences: '削除した場合', evidence: '根拠', question: '質問', coverage: '網羅性', complete: '完全', incomplete: '不完全 (拒否・中止・スキャン中)',
    openFolder: 'フォルダを開く', askChat: 'チャットで質問', include: 'クリーンアップに含める', close: '閉じる', about: '対象: {name}', you: 'あなた', agent: 'エージェント',
    waitingReply: 'エージェントの回答を待っています…', staleReply: 'この回答は以前のスキャンリビジョンについてのものです。', keep: '残す', investigate: 'さらに調べる',
    reviewTitle: '確認: {name}', reviewIntro: 'この判断はスキャンリビジョン {r} の以下のパスにだけ適用されます。', affected: '対象パス',
    planTitle: '最終クリーンアップ一覧', planIntro: '以下の対象だけを処理します。{s} 秒以内に確定してください。', confirm: 'クリーンアップを確定',
    cancel: 'キャンセル', irreversible: 'disk-map では元に戻せません', restorable: 'ゴミ箱から復元可能', irreversibleWarn: '{n} 件の操作は元に戻せません。再生成されたキャッシュは古いデータを戻しません。',
    trashNote: 'ゴミ箱に移動しても、ゴミ箱を空にするまで空き容量は増えません。disk-map はゴミ箱を空にしません。', conflicts: '計画前に除外された項目', started: 'クリーンアップを開始しました。',
    restore: '復元', restoreBeside: '横に復元', occupied: '元の場所は使用中です。何も上書きしません。', restoreTitle: 'ゴミ箱から復元',
    restoreIntro: '以下の場所に戻します。{s} 秒以内に確定してください。', destination: '復元先', exported: 'レポートを書き出しました: {path}',
    noSession: 'このビューアーリンクは使用済みか無効です。エージェントにセッション状態を確認してください。', expired: 'ビューアーセッションが期限切れです。エージェントに新しいセッションを依頼してください。',
    endedBanner: 'セッションを終了しました。レポート: {path}', excluded: '内部の保護項目 {n} 件は除外されます', status_succeeded: '成功', status_failed: '失敗', status_skipped: 'スキップ',
    status_interrupted: '中断', status_unknown: '不明', m_representedBytes: '選択の対象容量', m_estimatedReclaimableBytes: '回収見込み',
    m_permanentCleanupBytes: '完全に削除 (割り当て)', m_trashMovedBytes: 'ゴミ箱へ移動 (未解放)', m_cliReportedBytes: 'ツールの報告値', m_observedFreeDeltaBytes: '観測した空き容量の変化 (ボリューム全体)',
    risk_safe: '安全', risk_review: '要確認', risk_protected: '保護', risk_blocked: '不可', risk_unassessed: '未評価',
    cat_agent_history: 'エージェント履歴', cat_your_files: 'あなたのファイル', cat_build_output: 'ビルド出力', cat_dev_cache: '開発キャッシュ', cat_system_apps: 'システムとアプリ', cat_docker_vm: 'Docker と VM', cat_ai_models: 'AI モデル', cat_other: 'その他',
    recovered: '以前の操作 {n} 件は結果が記録されていなかったため、再実行せずに記録しました。',
  },
};
const CATEGORIES = ['agent-history', 'your-files', 'build-output', 'dev-cache', 'system-apps', 'docker-vm', 'ai-models'];
const RISK_ICON = { safe: '✓', review: '?', protected: '🔒', blocked: '⛔', unassessed: '·' };
const MAP_TILES = 40;

let locale = 'en';
const t = (key, vars = {}) => (I18N[locale]?.[key] ?? I18N.en[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
const fmt = (bytes) => (bytes === null || bytes === undefined ? t('unknown') : formatBytes(bytes, locale));
const $ = (id) => document.getElementById(id);

/** Build an element; strings become text nodes, never parsed HTML. */
function h(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') element.className = value;
    else if (key === 'text') element.textContent = value;
    else if (key.startsWith('on')) element.addEventListener(key.slice(2), value);
    else if (key === 'style') Object.assign(element.style, value);
    else element.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) element.append(child instanceof Node ? child : String(child));
  return element;
}

const app = { token: null, state: null, seq: -1, tree: null, parentId: null, mode: 'category', context: [], selectedId: null, treeAt: 0, treeKey: '', search: '', listCursor: 0, timer: null };

async function api(method, route, body) {
  const response = await fetch(route, {
    method,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${app.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error?.message ?? `HTTP ${response.status}`), { status: response.status, code: data.error?.code, data: data.error ?? {} });
  return data;
}

function banner(text) {
  $('banner').hidden = !text;
  $('banner').textContent = text ?? '';
}

function openDialog(dialog) {
  dialog.returnTo = document.activeElement;
  if (!dialog.open) dialog.showModal();
}

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('close', () => {
    if (dialog.countdown) clearInterval(dialog.countdown);
    dialog.returnTo?.focus?.();
  });
}

/** Home-relative display path for compact lists; dialogs keep the exact path. */
const shortPath = (target) => (app.state?.home && target.startsWith(`${app.state.home}/`) ? `~${target.slice(app.state.home.length)}` : target);
const candidateById = (id) => app.state?.candidates.find((candidate) => candidate.id === id) ?? null;
const live = () => app.state && !app.state.ended;

// ------------------------------------------------------------------ rendering

function applyStaticText() {
  document.documentElement.lang = locale;
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
  for (const element of document.querySelectorAll('[data-i18n-placeholder]')) element.placeholder = t(element.dataset.i18nPlaceholder);
  $('legend').replaceChildren(...CATEGORIES.map((category) => h('li', {}, h('i', { class: `cat-${category}`, 'aria-hidden': 'true' }), t(`cat_${category.replace(/-/g, '_')}`))));
}

function renderStatus() {
  const state = app.state;
  const status = $('status');
  $('root').textContent = state.root;
  if (state.ended) status.textContent = t('ended');
  else if (state.phase === 'scanning') status.textContent = t('scanning', { n: (state.progress?.entries ?? 0).toLocaleString(locale), bytes: fmt(state.progress?.allocatedBytes ?? '0') });
  else if (state.phase === 'cleaning') status.textContent = t('cleaning');
  else if (state.phase === 'cancelled') status.textContent = t('cancelled');
  else if (state.phase === 'failed') status.textContent = t('failed');
  else {
    const coverage = state.coverage;
    const gaps = coverage.denied + coverage.mounts;
    status.textContent = `${t('scanned', { r: state.revision })}${!coverage.complete || gaps ? ` · ${t('partial', { n: gaps })}` : ''}`;
  }
}

function renderAgent() {
  const agent = app.state.agent;
  const badge = $('agent');
  const stateName = agent.connected ? 'connected' : agent.everConnected ? 'disconnected' : 'waiting';
  badge.dataset.state = stateName;
  badge.textContent = t({ connected: 'agentOn', disconnected: 'agentOff', waiting: 'agentWait' }[stateName]);
  $('agent-help').textContent = t({ connected: 'onHelp', disconnected: 'reconnect', waiting: 'waitHelp' }[stateName]);
  renderFooter();
}

function renderCards() {
  const summary = app.state.summary;
  $('c-free').textContent = fmt(summary.freeBytes);
  $('c-free-note').textContent = summary.totalBytes ? t('of', { total: fmt(summary.totalBytes) }) : '';
  $('c-safe').textContent = fmt(summary.safe.bytes);
  $('c-safe-note').textContent = t('items', { n: summary.safe.count });
  $('c-review').textContent = fmt(summary.review.bytes);
  $('c-review-note').textContent = t('items', { n: summary.review.count });
  $('c-unaccounted').textContent = fmt(summary.unaccountedBytes);
  $('c-unaccounted-note').textContent = t('outsideScan');
}

function riskBadge(risk) {
  if (!risk) return null;
  return h('span', { class: `badge ${risk}` }, h('span', { 'aria-hidden': 'true' }, RISK_ICON[risk]), t(`risk_${risk}`));
}

function operationLabel(candidate) {
  if (candidate.operation === 'cli') return candidate.command ?? t('cli');
  if (candidate.operation === 'trash' || candidate.risk === 'review') return t('trash');
  if (candidate.operation === 'remove') return t('remove');
  return candidate.recipe ?? '';
}

async function setSelected(ids, selected) {
  try {
    await api('POST', '/api/selection', { scanId: app.state.scanId, revision: app.state.revision, candidateIds: ids, selected });
    await refresh();
  } catch (error) {
    banner(error.message);
    await refresh();
  }
}

function recRow(candidate, { checkbox, question }) {
  const box = checkbox ? h('input', {
    type: 'checkbox',
    checked: candidate.selected,
    disabled: !live() || (candidate.risk === 'review' && candidate.decision !== 'trash'),
    title: candidate.risk === 'review' && candidate.decision !== 'trash' ? t('answerFirst') : null,
    'aria-label': `${t('include')}: ${candidate.name}`,
    onchange: (event) => setSelected([candidate.id], event.target.checked),
  }) : h('span');
  const row = h('div', { class: 'rec', 'data-candidate': candidate.id },
    box,
    h('div', {}, h('button', { type: 'button', class: 'title', onclick: () => openDrawer(candidate.id) }, candidate.purpose || candidate.name), h('div', { class: 'meta' }, operationLabel(candidate)), h('div', { class: 'meta' }, shortPath(candidate.path))),
    h('span', { class: 'size' }, fmt(candidate.allocatedBytes)));
  if (question) {
    row.append(h('div', { class: 'question' }, h('span', {}, candidate.question || candidate.reason), h('button', { type: 'button', disabled: !live(), onclick: () => openReview(candidate.id) }, t('review'))));
  }
  return row;
}

function renderRecs() {
  const candidates = app.state.candidates;
  const container = $('recs');
  const group = (label, tone, list, options) => {
    if (!list.length) return [];
    const total = list.reduce((sum, candidate) => sum + BigInt(candidate.allocatedBytes), 0n);
    return [h('div', { class: 'group-head' }, h('span', { class: `pill ${tone}` }, label), h('span', { class: 'sub' }, fmt(String(total)))), ...list.map((candidate) => recRow(candidate, options))];
  };
  const safe = candidates.filter((candidate) => candidate.risk === 'safe');
  const review = candidates.filter((candidate) => candidate.risk === 'review');
  const waiting = candidates.filter((candidate) => candidate.risk === 'unassessed');
  const blocked = candidates.filter((candidate) => candidate.risk === 'protected' || candidate.risk === 'blocked');
  const nodes = [
    ...group(t('safeGroup'), 'safe', safe, { checkbox: true }),
    ...group(t('reviewGroup'), 'review', review, { checkbox: true, question: true }),
    ...group(t('waitingGroup'), 'muted', waiting, {}),
  ];
  if (blocked.length) {
    nodes.push(h('details', { class: 'blocked' }, h('summary', {}, t('blockedGroup', { n: blocked.length })), ...blocked.map((candidate) => h('div', { class: 'rec' }, h('span', {}, riskBadge(candidate.risk)), h('div', {}, h('button', { type: 'button', class: 'title', onclick: () => openDrawer(candidate.id) }, candidate.name), h('div', { class: 'meta' }, candidate.reason)), h('span', { class: 'size' }, fmt(candidate.allocatedBytes))))));
  }
  container.replaceChildren(...(nodes.length ? nodes : [h('p', { class: 'sub' }, t('noItems'))]));
}

function renderFooter() {
  const summary = app.state.summary.selected;
  $('sel-summary').textContent = summary.count ? t('selected', { n: summary.count, bytes: fmt(summary.allocatedBytes), rec: summary.reclaimableBytes === null ? t('unknown') : fmt(summary.reclaimableBytes) }) : t('noSelection');
  const blockedReason = !live() ? t('ended') : app.state.phase !== 'complete' ? $('status').textContent : !app.state.agent.connected ? t('reconnect') : !summary.count ? t('noSelection') : null;
  $('cleanup').disabled = Boolean(blockedReason);
  $('cleanup').title = blockedReason ?? '';
  $('select-safe').disabled = !live() || !app.state.candidates.some((candidate) => candidate.risk === 'safe' && !candidate.selected);
  for (const id of ['rescan', 'export', 'end']) $(id).disabled = !live() && id !== 'export';
  $('rescan').disabled = !live() || app.state.phase === 'scanning' || app.state.phase === 'cleaning';
  for (const element of $('composer').elements) element.disabled = !live();
}

function renderChat() {
  const list = $('messages');
  const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 8;
  list.replaceChildren(...app.state.chat.map((message) => h('li', { class: `msg ${message.role}`, 'data-message': message.id },
    h('span', { class: 'who' }, message.role === 'user' ? t('you') : t('agent')),
    message.text,
    message.role === 'user' && message.status === 'pending' ? h('span', { class: 'who' }, t('waitingReply')) : null,
    message.stale ? h('span', { class: 'who' }, t('staleReply')) : null)));
  if (atBottom) list.scrollTop = list.scrollHeight;
  const context = $('context');
  context.hidden = !app.context.length;
  $('context-text').textContent = app.context.length ? t('about', { name: app.context.map((item) => item.name).join(', ') }) : '';
}

function renderResults() {
  const outcomes = app.state.outcomes;
  $('results').hidden = !outcomes.length && !app.state.metrics;
  const metrics = app.state.metrics;
  $('metrics').replaceChildren(...(metrics ? ['representedBytes', 'estimatedReclaimableBytes', 'permanentCleanupBytes', 'trashMovedBytes', 'cliReportedBytes', 'observedFreeDeltaBytes'].flatMap((key) => [h('span', { class: 'sub' }, t(`m_${key}`)), h('b', {}, fmt(metrics[key]))]) : []));
  $('outcomes').replaceChildren(...[...outcomes].reverse().map((outcome) => h('div', { class: 'outcome', 'data-operation': outcome.operationId },
    h('span', { class: `badge status-${outcome.status}` }, t(`status_${outcome.status}`)),
    h('div', {}, h('div', { class: 'path mono' }, outcome.path), h('div', { class: 'sub' }, `${outcome.operation ?? ''} · ${outcome.reason}`), outcome.trashPath ? h('div', { class: 'sub mono' }, outcome.trashPath) : null, outcome.recoveryPath ? h('div', { class: 'sub mono' }, outcome.recoveryPath) : null),
    outcome.operation === 'trash' && outcome.status === 'succeeded' && outcome.trashPath && !outcome.restored ? h('button', { type: 'button', disabled: !live(), onclick: () => requestRestore(outcome.operationId, 'original') }, t('restore')) : h('span'))));
}

function render() {
  renderStatus();
  renderCards();
  renderRecs();
  renderChat();
  renderResults();
  renderAgent();
  if (app.state.recovered?.length && !app.recoveredShown) {
    app.recoveredShown = true;
    banner(t('recovered', { n: app.state.recovered.length }));
  }
}

// ------------------------------------------------------------------ map

function tileClasses(entry, extra = '') {
  return `tile ${extra} cat-${CATEGORIES.includes(entry.category) ? entry.category : 'other'} ${entry.risk ? `risk-${entry.risk}` : ''} ${entry.complete === false ? 'incomplete' : ''}`;
}

function placeTile(map, rect, entry, extra, onclick) {
  // Slivers are unreadable and unclickable; the list below still shows them.
  if (rect.w < 8 || rect.h < 8) return null;
  const label = `${entry.name}, ${fmt(entry.allocatedBytes)}${entry.risk ? `, ${t(`risk_${entry.risk}`)}` : ''}`;
  const tiny = rect.w < 64 || rect.h < 40;
  const tile = h(onclick ? 'button' : 'div', {
    type: onclick ? 'button' : null,
    class: `${tileClasses(entry, extra)} ${tiny ? 'tiny' : ''}`,
    style: { left: `${rect.x}px`, top: `${rect.y}px`, width: `${Math.max(rect.w, 0)}px`, height: `${Math.max(rect.h, 0)}px` },
    'aria-label': label,
    'aria-pressed': onclick ? String(app.selectedId === entry.id) : null,
    title: entry.path ?? entry.name,
    'data-id': entry.id ?? null,
    onclick,
  });
  if (extra.includes('parent')) tile.append(h('span', { class: 'head' }, h('span', { class: 'name' }, entry.name), h('span', { class: 'size' }, fmt(entry.allocatedBytes))));
  else tile.append(...[h('span', { class: 'name' }, entry.name), h('span', { class: 'size' }, fmt(entry.allocatedBytes)), entry.risk && entry.risk !== 'unassessed' ? h('span', { class: 'badge-wrap' }, riskBadge(entry.risk)) : null].filter(Boolean));
  map.append(tile);
  return tile;
}

function renderMap() {
  const map = $('map');
  map.classList.toggle('mode-cleanup', app.mode === 'cleanup');
  map.replaceChildren();
  const tree = app.tree;
  if (!tree?.parent) {
    map.append(h('div', { class: 'empty' }, t('scanning', { n: 0, bytes: fmt('0') })));
    return;
  }
  $('mapped').textContent = t('mapped', { bytes: fmt(tree.parent.allocatedBytes) });
  const width = map.clientWidth;
  const height = map.clientHeight;
  const shown = tree.entries.filter((entry) => Number(entry.allocatedBytes) > 0).slice(0, MAP_TILES);
  const hidden = tree.entries.slice(MAP_TILES).reduce((sum, entry) => sum + Number(entry.allocatedBytes), 0) + Number(tree.other?.allocatedBytes ?? 0);
  const hiddenCount = Math.max(tree.entries.length - MAP_TILES, 0) + (tree.other?.count ?? 0);
  const items = shown.map((entry) => ({ type: 'node', entry, value: Number(entry.allocatedBytes) }));
  if (tree.parent.small && Number(tree.parent.small.allocatedBytes) > 0) items.push({ type: 'files', value: Number(tree.parent.small.allocatedBytes), entry: { name: t('smallFiles', { n: tree.parent.small.count }), allocatedBytes: tree.parent.small.allocatedBytes, category: 'other' } });
  if (hidden > 0) items.push({ type: 'other', value: hidden, entry: { name: t('other', { n: hiddenCount }), allocatedBytes: String(hidden), category: 'other' } });
  items.sort((a, b) => b.value - a.value);
  const rects = squarify(items.map((item) => item.value), { x: 0, y: 0, w: width, h: height });
  items.forEach((item, index) => {
    const rect = { x: rects[index].x + 2, y: rects[index].y + 2, w: rects[index].w - 4, h: rects[index].h - 4 };
    if (item.type !== 'node') return placeTile(map, rect, item.entry, item.type, null);
    const nested = item.entry.children?.length && rect.w > 120 && rect.h > 90;
    placeTile(map, rect, item.entry, nested ? 'parent' : '', () => selectNode(item.entry));
    if (!nested) return;
    // Children fill the inner area; the unlisted remainder keeps areas proportional.
    const children = item.entry.children.filter((child) => Number(child.allocatedBytes) > 0);
    const remainder = Math.max(item.value - children.reduce((sum, child) => sum + Number(child.allocatedBytes), 0), 0);
    const inner = { x: rect.x + 6, y: rect.y + 26, w: rect.w - 12, h: rect.h - 32 };
    const childRects = squarify([...children.map((child) => Number(child.allocatedBytes)), remainder].filter((value, position) => position < children.length || value > 0), inner);
    children.forEach((child, position) => {
      const cr = childRects[position];
      placeTile(map, { x: cr.x + 1, y: cr.y + 1, w: cr.w - 2, h: cr.h - 2 }, { ...child, path: `${item.entry.path}/${child.name}` }, 'child', () => selectNode({ ...child, path: `${item.entry.path}/${child.name}` }));
    });
  });
}

function renderCrumbs() {
  const tree = app.tree;
  if (!tree?.parent) return;
  const crumbs = [...tree.ancestors, { id: tree.parent.id, name: tree.parent.name }];
  $('crumbs').replaceChildren(...crumbs.flatMap((crumb, index) => [
    index ? h('span', { 'aria-hidden': 'true', class: 'sub' }, '›') : null,
    h('button', { type: 'button', 'aria-current': index === crumbs.length - 1 ? 'page' : null, title: crumb.name, onclick: () => loadTree(crumb.id) }, crumb.name),
  ]));
}

function listRow(entry) {
  return h('tr', {}, h('td', {}, entry.id ? h('button', { type: 'button', class: 'link', onclick: () => selectNode(entry) }, entry.name) : entry.name, entry.alias ? h('span', { class: 'sub' }, ' (hard link)') : null, entry.boundary ? h('span', { class: 'sub' }, ` (${entry.boundary})`) : null),
    h('td', { class: 'num' }, fmt(entry.allocatedBytes)),
    h('td', {}, riskBadge(entry.risk) ?? (entry.complete === false ? h('span', { class: 'sub' }, t('incomplete')) : '')));
}

function renderList(append = false) {
  const tree = app.tree;
  const rows = (tree?.entries ?? []).map(listRow);
  if (append) $('list').append(...rows);
  else $('list').replaceChildren(...rows);
  $('more').hidden = !tree?.nextCursor;
}

async function loadTree(parentId = app.parentId, { quiet = false } = {}) {
  try {
    const query = new URLSearchParams();
    if (parentId) query.set('parentId', parentId);
    const tree = await api('GET', `/api/tree?${query}`);
    // Skip re-rendering identical data so focus and hover survive polling.
    const key = JSON.stringify(tree);
    app.treeAt = Date.now();
    if (key === app.treeJson) return;
    app.treeJson = key;
    app.tree = tree;
    app.parentId = tree.parent?.id ?? null;
  } catch (error) {
    if (error.code === 'unknown-node') return loadTree(null, { quiet });
    if (!quiet) banner(error.message);
    return;
  }
  renderCrumbs();
  renderMap();
  if (!app.search) renderList();
}

async function search(text) {
  app.search = text.trim();
  if (!app.search) return renderList();
  const result = await api('GET', `/api/tree?q=${encodeURIComponent(app.search)}`).catch(() => null);
  if (result) $('list').replaceChildren(...result.entries.map((entry) => listRow({ ...entry, name: entry.path })));
}

function selectNode(entry) {
  if (!entry.id) return;
  app.selectedId = entry.id;
  app.context = [{ id: entry.id, name: entry.name }];
  for (const tile of document.querySelectorAll('.tile[aria-pressed]')) tile.setAttribute('aria-pressed', String(tile.dataset.id === entry.id));
  renderChat();
  openDrawer(entry.id, entry);
}

// ------------------------------------------------------------------ dialogs

function evidenceItem(item) {
  if (item.kind === 'documentation' && /^https:\/\//.test(item.reference)) return h('li', {}, h('a', { href: item.reference, target: '_blank', rel: 'noopener noreferrer' }, item.reference));
  return h('li', {}, `${item.kind}: ${item.reference}`);
}

function openDrawer(id, node = null) {
  const candidate = candidateById(id);
  const entry = candidate ?? node ?? app.tree?.entries.find((item) => item.id === id) ?? { id, name: id };
  const risk = candidate?.risk ?? entry.risk ?? 'unassessed';
  const rows = [
    [t('path'), h('code', {}, entry.path ?? '')],
    [t('allocated'), fmt(entry.allocatedBytes)],
    [t('logical'), fmt(entry.logicalBytes ?? candidate?.logicalBytes)],
    [t('risk'), h('span', {}, riskBadge(risk), ' ', candidate?.reason ?? '')],
    [t('coverage'), (candidate?.complete ?? entry.complete) === false ? t('incomplete') : t('complete')],
  ];
  if (candidate?.purpose) rows.push([t('purpose'), candidate.purpose]);
  if (candidate?.operation) rows.push([t('operation'), operationLabel(candidate)]);
  if (candidate?.consequences?.length) rows.push([t('consequences'), h('ul', {}, ...candidate.consequences.map((text) => h('li', {}, text)))]);
  if (candidate?.evidence?.length) rows.push([t('evidence'), h('ul', {}, ...candidate.evidence.map(evidenceItem))]);
  if (candidate?.question) rows.push([t('question'), candidate.question]);
  const dirLike = entry.kind === 'dir' || entry.hasChildren;
  const eligible = candidate && (candidate.risk === 'safe' || (candidate.risk === 'review' && candidate.decision === 'trash'));
  $('drawer-body').replaceChildren(
    h('h2', { id: 'drawer-title' }, entry.name),
    h('dl', {}, ...rows.flatMap(([label, value]) => [h('dt', {}, label), h('dd', {}, value)])),
    eligible ? h('label', {}, h('input', { type: 'checkbox', checked: candidate.selected, disabled: !live(), onchange: (event) => setSelected([candidate.id], event.target.checked) }), ' ', t('include')) : null,
    h('div', { class: 'row' },
      dirLike ? h('button', { type: 'button', onclick: () => { $('drawer').close(); loadTree(id); } }, t('openFolder')) : null,
      candidate?.risk === 'review' ? h('button', { type: 'button', disabled: !live(), onclick: () => { $('drawer').close(); openReview(id); } }, t('review')) : null,
      h('button', { type: 'button', disabled: !live(), onclick: () => { app.context = [{ id, name: entry.name }]; $('drawer').close(); renderChat(); $('chat-input').focus(); } }, t('askChat')),
      h('button', { type: 'button', class: 'primary', onclick: () => $('drawer').close() }, t('close'))));
  openDialog($('drawer'));
}

function openReview(id) {
  const candidate = candidateById(id);
  if (!candidate) return;
  // Group review items that share a purpose and question so one decision covers a reviewed set.
  const group = app.state.candidates.filter((other) => other.risk === 'review' && (other.id === id || (candidate.purpose && other.purpose === candidate.purpose && other.question === candidate.question)));
  const decide = async (choice) => {
    const results = [];
    for (const item of group) {
      try {
        results.push(await api('POST', '/api/decisions', { candidateId: item.id, revision: app.state.revision, choice }));
      } catch (error) {
        results.push({ ok: false, reason: error.message });
      }
    }
    const failure = results.find((result) => result.ok === false);
    banner(failure ? failure.reason : null);
    $('review-dialog').close();
    await refresh();
  };
  $('review-body').replaceChildren(
    h('h2', { id: 'review-title' }, t('reviewTitle', { name: candidate.purpose || candidate.name })),
    h('p', { class: 'note' }, candidate.question || candidate.reason),
    candidate.consequences?.length ? h('div', {}, h('b', {}, t('consequences')), h('ul', {}, ...candidate.consequences.map((text) => h('li', {}, text)))) : null,
    h('p', { class: 'sub' }, t('reviewIntro', { r: app.state.revision })),
    h('b', {}, t('affected')),
    h('ul', { class: 'mono' }, ...group.map((item) => h('li', {}, `${item.path} — ${fmt(item.allocatedBytes)}`))),
    h('p', { class: 'sub' }, t('trashNote')),
    h('div', { class: 'row' },
      h('button', { type: 'button', onclick: () => decide('investigate') }, t('investigate')),
      h('button', { type: 'button', onclick: () => decide('trash') }, t('trash')),
      h('button', { type: 'button', class: 'primary', autofocus: true, onclick: () => decide('keep') }, t('keep'))));
  openDialog($('review-dialog'));
}

function openPlan(plan, { restore = false } = {}) {
  const dialog = $('plan-dialog');
  const seconds = () => Math.max(0, Math.round((Date.parse(plan.expiresAt) - Date.now()) / 1000));
  const intro = h('p', {}, t(restore ? 'restoreIntro' : 'planIntro', { s: seconds() }));
  const irreversible = plan.entries.filter((entry) => entry.irreversible).length;
  const confirmButton = h('button', {
    type: 'button',
    class: 'danger',
    onclick: async () => {
      confirmButton.disabled = true;
      try {
        await api('POST', `/api/plans/${plan.planId}/confirm`, { manifestHash: plan.manifestHash, nonce: plan.nonce });
        dialog.close();
        banner(t('started'));
      } catch (error) {
        banner(error.message);
        dialog.close();
      }
      await refresh();
    },
  }, restore ? t('restore') : t('confirm'));
  dialog.replaceChildren(h('div', { class: 'dlg' },
    h('h2', { id: 'plan-title' }, restore ? t('restoreTitle') : t('planTitle')),
    intro,
    h('table', { class: 'manifest' },
      h('thead', {}, h('tr', {}, h('th', {}, t('path')), h('th', {}, t('operation')), h('th', {}, t('allocated')), h('th', {}, ''))),
      h('tbody', {}, ...plan.entries.map((entry) => h('tr', { 'data-plan-entry': entry.candidateId ?? entry.operationId },
        h('td', { class: 'mono' }, entry.action === 'restore' ? `${entry.trashPath} → ${entry.destinationPath}` : entry.path),
        h('td', {}, entry.action === 'restore' ? t('restoreOp') : entry.operation === 'cli' ? entry.command : t(entry.operation === 'trash' ? 'trash' : 'remove'), entry.excludedProtected ? h('div', { class: 'sub' }, t('excluded', { n: entry.excludedProtected })) : null),
        h('td', {}, fmt(entry.allocatedBytes)),
        h('td', {}, entry.irreversible ? t('irreversible') : entry.action === 'restore' ? '' : t('restorable')))))),
    plan.conflicts?.length ? h('div', {}, h('b', {}, t('conflicts')), h('ul', {}, ...plan.conflicts.map((conflict) => h('li', {}, `${conflict.path}: ${conflict.reason}`)))) : null,
    irreversible ? h('p', { class: 'warn' }, t('irreversibleWarn', { n: irreversible })) : null,
    plan.entries.some((entry) => entry.operation === 'trash') ? h('p', { class: 'note' }, t('trashNote')) : null,
    h('div', { class: 'row' }, h('button', { type: 'button', autofocus: true, onclick: () => dialog.close() }, t('cancel')), confirmButton)));
  dialog.countdown = setInterval(() => {
    intro.textContent = t(restore ? 'restoreIntro' : 'planIntro', { s: seconds() });
    if (!seconds()) confirmButton.disabled = true;
  }, 1000);
  openDialog(dialog);
}

async function requestRestore(operationId, destinationMode) {
  try {
    openPlan(await api('POST', '/api/restores', { operationId, destinationMode }), { restore: true });
  } catch (error) {
    if (error.code !== 'destination-occupied') return banner(error.message);
    const dialog = $('plan-dialog');
    dialog.replaceChildren(h('div', { class: 'dlg' }, h('h2', { id: 'plan-title' }, t('restoreTitle')), h('p', { class: 'warn' }, t('occupied')),
      h('div', { class: 'row' }, h('button', { type: 'button', onclick: () => dialog.close() }, t('cancel')), h('button', { type: 'button', class: 'primary', onclick: () => { dialog.close(); requestRestore(operationId, 'sibling'); } }, t('restoreBeside')))));
    openDialog(dialog);
  }
}

// ------------------------------------------------------------------ actions

$('composer').addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = $('chat-input').value.trim();
  if (!text || !live()) return;
  try {
    await api('POST', '/api/chat', { scanId: app.state.scanId, candidateIds: app.context.map((item) => item.id), text });
    $('chat-input').value = '';
    await refresh();
  } catch (error) {
    banner(error.message);
  }
});
$('chat-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) $('composer').requestSubmit();
});
$('context-clear').addEventListener('click', () => {
  app.context = [];
  renderChat();
});
$('select-safe').addEventListener('click', () => {
  // Only currently eligible, non-overlapping safe items (shallowest first).
  const chosen = [];
  const taken = app.state.candidates.filter((candidate) => candidate.selected);
  const overlaps = (a, b) => a.path === b.path || a.path.startsWith(`${b.path}/`) || b.path.startsWith(`${a.path}/`);
  for (const candidate of app.state.candidates.filter((item) => item.risk === 'safe' && !item.selected).sort((a, b) => a.path.length - b.path.length)) {
    if (![...taken, ...chosen].some((other) => overlaps(candidate, other))) chosen.push(candidate);
  }
  if (chosen.length) setSelected(chosen.map((candidate) => candidate.id), true);
});
$('cleanup').addEventListener('click', async () => {
  const ids = app.state.candidates.filter((candidate) => candidate.selected).map((candidate) => candidate.id);
  try {
    openPlan(await api('POST', '/api/plans', { scanId: app.state.scanId, revision: app.state.revision, candidateIds: ids }));
  } catch (error) {
    banner(error.data?.conflicts?.length ? `${error.message} ${error.data.conflicts.map((conflict) => `${conflict.path}: ${conflict.reason}`).join(' · ')}` : error.message);
  }
  await refresh();
});
$('rescan').addEventListener('click', async () => {
  await api('POST', '/api/rescan', { scanId: app.state.scanId }).catch((error) => banner(error.message));
  await refresh();
});
$('export').addEventListener('click', async () => {
  try {
    banner(t('exported', { path: (await api('POST', '/api/export', {})).snapshot }));
  } catch (error) {
    banner(error.message);
  }
});
$('end').addEventListener('click', async () => {
  try {
    const result = await api('POST', '/api/end', {});
    banner(t('endedBanner', { path: result.reports?.snapshot ?? '' }));
  } catch (error) {
    banner(error.message);
  }
  await refresh();
});
for (const button of document.querySelectorAll('.seg button')) {
  button.addEventListener('click', () => {
    app.mode = button.dataset.mode;
    for (const other of document.querySelectorAll('.seg button')) other.setAttribute('aria-pressed', String(other === button));
    renderMap();
  });
}
let searchTimer;
$('search').addEventListener('input', (event) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => search(event.target.value), 250);
});
$('more').addEventListener('click', async () => {
  const query = new URLSearchParams({ cursor: String(app.tree.nextCursor) });
  if (app.parentId) query.set('parentId', app.parentId);
  const page = await api('GET', `/api/tree?${query}`).catch((error) => banner(error.message));
  if (!page) return;
  app.tree = { ...app.tree, nextCursor: page.nextCursor };
  $('list').append(...page.entries.map(listRow));
  $('more').hidden = !page.nextCursor;
});
new ResizeObserver(() => renderMap()).observe($('map'));

// ------------------------------------------------------------------ polling

async function refresh() {
  try {
    const state = await api('GET', `/api/state?after=${app.seq}`);
    if (state.unchanged) {
      app.state.agent = state.agent;
      renderAgent();
    } else {
      const treeKey = `${state.revision}:${state.phase}`;
      app.state = state;
      app.seq = state.seq;
      if (state.locale && state.locale !== locale) {
        locale = state.locale;
        applyStaticText();
      }
      render();
      // Reload the map on new revisions/phases, and periodically while scanning.
      if (treeKey !== app.treeKey || Date.now() - app.treeAt > (state.phase === 'scanning' ? 2000 : 4000)) {
        app.treeKey = treeKey;
        await loadTree(app.parentId, { quiet: true });
      }
    }
  } catch (error) {
    if (error.status === 401) {
      banner(t('expired'));
      return false;
    }
  }
  return true;
}

async function poll() {
  const keepGoing = await refresh();
  if (keepGoing) app.timer = setTimeout(poll, 1000);
}

async function bootstrap() {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const oneUse = fragment.get('t');
  // Remove the one-use token from the address bar and history immediately.
  history.replaceState(null, '', location.pathname);
  app.token = sessionStorage.getItem('disk-map-viewer');
  if (oneUse && !app.token) {
    const response = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: oneUse }) });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      app.token = data.viewerToken;
      locale = data.locale ?? locale;
      sessionStorage.setItem('disk-map-viewer', app.token);
    }
  }
  applyStaticText();
  if (!app.token) return banner(t('noSession'));
  poll();
}

bootstrap();
