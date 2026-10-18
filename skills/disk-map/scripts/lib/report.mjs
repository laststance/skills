// Accounting, operation reports (JSONL/CSV) and the inert static HTML export.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { formatBytes, squarify } from '../../assets/treemap.mjs';
import { SCHEMA_VERSION, ensurePrivateDir, sumBytes, writePrivateJson } from './util.mjs';

/**
 * Keep every space figure separate; none is presented as another.
 *
 * Called after a plan finishes. Trash moves are never "reclaimed", estimates
 * stay estimates (or null when unknown), CLI receipts stay tool-reported, and
 * the free-space delta is an observation of the whole volume.
 *
 * @example
 * spaceMetrics({ entries, outcomes, freeBefore: '100', freeAfter: '160' }).observedFreeDeltaBytes; // '60'
 */
export function spaceMetrics({ entries, outcomes, freeBefore, freeAfter }) {
  const ok = outcomes.filter((outcome) => outcome.status === 'succeeded');
  const reclaimable = entries.map((entry) => entry.reclaimableBytes);
  const cli = ok.filter((outcome) => outcome.operation === 'cli');
  return {
    representedBytes: sumBytes(entries.map((entry) => entry.allocatedBytes)),
    estimatedReclaimableBytes: reclaimable.some((value) => value === null || value === undefined) ? null : sumBytes(reclaimable),
    permanentCleanupBytes: sumBytes(ok.filter((outcome) => outcome.operation === 'remove').map((outcome) => outcome.allocatedBytes)),
    trashMovedBytes: sumBytes(ok.filter((outcome) => outcome.operation === 'trash').map((outcome) => outcome.allocatedBytes)),
    cliReportedBytes: cli.some((outcome) => outcome.cliReportedBytes !== null) ? sumBytes(cli.map((outcome) => outcome.cliReportedBytes ?? 0)) : null,
    observedFreeDeltaBytes: freeBefore != null && freeAfter != null ? String(BigInt(freeAfter) - BigInt(freeBefore)) : null,
    freeBeforeBytes: freeBefore ?? null,
    freeAfterBytes: freeAfter ?? null,
  };
}

/** Escape a CSV cell; spreadsheet formula prefixes become literal text. */
export function csvField(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const CSV_COLUMNS = ['operationId', 'candidateId', 'path', 'recipe', 'operation', 'status', 'evidenceKind', 'startedAt', 'finishedAt', 'reason', 'trashPath', 'recoveryPath', 'allocatedBytes', 'cliReportedBytes'];

/** Render outcomes as CSV with a header row. */
export function outcomesCsv(outcomes) {
  return `${[CSV_COLUMNS.join(','), ...outcomes.map((outcome) => CSV_COLUMNS.map((column) => csvField(outcome[column])).join(','))].join('\n')}\n`;
}

/** Escape text for HTML element and attribute contexts. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

const RISK_TEXT = { safe: 'Safe', review: 'Review', protected: 'Protected', blocked: 'Blocked', unassessed: 'Unassessed' };

/**
 * Render a read-only, script-free HTML snapshot.
 *
 * Called by export and session end. The page has no script, a CSP of
 * `default-src 'none'`, and disabled Chat/Clean Up controls, so reopening it
 * cannot revive consent or send requests. It never receives credentials.
 */
export function renderSnapshot(snapshot) {
  const width = 960;
  const height = 420;
  const tiles = snapshot.tiles.filter((tile) => Number(tile.allocatedBytes) > 0).slice(0, 300);
  const rects = squarify(tiles.map((tile) => Number(tile.allocatedBytes)), { x: 0, y: 0, w: width, h: height });
  const tileHtml = tiles.map((tile, index) => {
    const rect = rects[index];
    return `<div class="tile c-${escapeHtml(tile.category)} r-${escapeHtml(tile.risk ?? 'none')}" style="left:${rect.x.toFixed(1)}px;top:${rect.y.toFixed(1)}px;width:${rect.w.toFixed(1)}px;height:${rect.h.toFixed(1)}px" title="${escapeHtml(tile.path)}"><span>${escapeHtml(tile.name)}</span><b>${escapeHtml(formatBytes(tile.allocatedBytes))}</b></div>`;
  }).join('');
  const row = (cells) => `<tr>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`;
  const metrics = snapshot.metrics ? Object.entries(snapshot.metrics).map(([key, value]) => row([key, value === null ? 'unknown' : `${formatBytes(value)} (${value} bytes)`])).join('') : '';
  return `<!doctype html>
<html lang="${escapeHtml(snapshot.locale ?? 'en')}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Disk map snapshot · ${escapeHtml(snapshot.generatedAt)}</title>
<style>
body{font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:24px;color:#1d1d1f;background:#f5f5f2}
.banner{background:#fff4d6;border:1px solid #e9c46a;border-radius:10px;padding:10px 14px;margin-bottom:16px}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}.card{background:#fff;border-radius:12px;padding:12px 16px;border:1px solid #e5e5e0}
.card b{display:block;font-size:24px}.map{position:relative;width:${width}px;height:${height}px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e0}
.tile{position:absolute;box-sizing:border-box;border:1px solid #fff;padding:4px 6px;overflow:hidden;font-size:12px;background:#eee}
.tile b{display:block}.c-agent-history{background:#e4defc}.c-your-files{background:#f5eadb}.c-build-output{background:#dde9f8}.c-system-apps{background:#ececea}
.c-docker-vm{background:#dcf0f2}.c-ai-models{background:#fbe0e6}.c-dev-cache{background:#e3f3e6}.r-safe{background-image:repeating-linear-gradient(45deg,transparent 0 6px,rgba(46,125,50,.18) 6px 8px)}
table{border-collapse:collapse;width:100%;background:#fff;margin:12px 0}td,th{border:1px solid #e5e5e0;padding:6px 8px;text-align:left;vertical-align:top;word-break:break-all}
button{opacity:.55}
</style></head><body>
<h1>Disk map snapshot</h1>
<p class="banner" role="note">Read-only snapshot from ${escapeHtml(snapshot.generatedAt)}. Chat, selection and Clean Up are disabled here; start a new disk-map session for live actions.</p>
<p>Scan root: <code>${escapeHtml(snapshot.root)}</code> · revision ${escapeHtml(snapshot.revision)} · coverage: ${escapeHtml(snapshot.coverage)}</p>
<div class="cards">${snapshot.cards.map((card) => `<div class="card">${escapeHtml(card.label)}<b>${escapeHtml(card.value)}</b>${escapeHtml(card.note ?? '')}</div>`).join('')}</div>
<div class="map" aria-label="Disk map">${tileHtml}</div>
<p><button type="button" disabled>Chat (disabled in snapshot)</button> <button type="button" disabled>Clean Up (disabled in snapshot)</button></p>
<h2>Candidates</h2>
<table><thead><tr><th>Path</th><th>Risk</th><th>Allocated</th><th>Recipe</th><th>Reason</th><th>Decision</th></tr></thead><tbody>
${snapshot.candidates.map((candidate) => row([candidate.path, RISK_TEXT[candidate.risk] ?? candidate.risk, formatBytes(candidate.allocatedBytes), candidate.recipe ?? '—', candidate.reason, candidate.decision ?? '—'])).join('')}
</tbody></table>
<h2>Operations</h2>
<table><thead><tr><th>Path</th><th>Operation</th><th>Status</th><th>Evidence</th><th>Reason</th><th>Trash / recovery</th></tr></thead><tbody>
${snapshot.outcomes.map((outcome) => row([outcome.path, outcome.operation, outcome.status, outcome.evidenceKind, outcome.reason, outcome.trashPath ?? outcome.recoveryPath ?? '—'])).join('')}
</tbody></table>
<h2>Space</h2><table><tbody>${metrics}</tbody></table>
</body></html>
`;
}

/**
 * Write the private run reports: summary JSON, operation JSONL/CSV, problem
 * list and the static snapshot. Called after cleanup and on session end.
 *
 * @returns Absolute paths of the files written.
 */
export async function writeReports(runDir, { snapshot, outcomes, metrics, summary }) {
  const dir = path.join(runDir, 'reports');
  await ensurePrivateDir(dir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const files = {
    summary: path.join(dir, 'summary.json'),
    operationsJsonl: path.join(dir, 'operations.jsonl'),
    operationsCsv: path.join(dir, 'operations.csv'),
    problems: path.join(dir, 'skipped-failed.json'),
    snapshot: path.join(dir, `snapshot-${stamp}.html`),
  };
  await writePrivateJson(files.summary, { schemaVersion: SCHEMA_VERSION, ...summary, metrics, counts: countByStatus(outcomes) });
  await fsp.writeFile(files.operationsJsonl, outcomes.map((outcome) => JSON.stringify(outcome)).join('\n') + (outcomes.length ? '\n' : ''), { mode: 0o600 });
  await fsp.writeFile(files.operationsCsv, outcomesCsv(outcomes), { mode: 0o600 });
  await writePrivateJson(files.problems, outcomes.filter((outcome) => outcome.status !== 'succeeded'));
  await fsp.writeFile(files.snapshot, renderSnapshot({ ...snapshot, metrics }), { mode: 0o600, flag: 'wx' });
  return files;
}

/** Count outcomes per status, including zero entries for every state. */
export function countByStatus(outcomes) {
  const counts = { succeeded: 0, skipped: 0, failed: 0, interrupted: 0, unknown: 0 };
  for (const outcome of outcomes) counts[outcome.status] = (counts[outcome.status] ?? 0) + 1;
  return counts;
}
