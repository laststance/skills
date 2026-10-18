# Runtime protocol

All persisted records use `schemaVersion: 1`. Byte counts are decimal strings. IDs are UUIDs, never paths. The server-side state is authoritative.

## Files

`~/Library/Application Support/disk-map/runs/<runId>/` (directory 0700, files 0600; `--state-dir` overrides for tests):

| File | Content |
|---|---|
| `config.json` | Root, home, Trash, locale, preflight checks |
| `session.json` | Port, origin, **agent credential**, one-use viewer link. Never share it |
| `runtime.log` | Server stderr |
| `scan-r<revision>.jsonl` | Incremental per-folder records written while scanning |
| `mailbox.jsonl` | Every viewer→agent message and its answered marker |
| `journal.jsonl` | Cleanup `intent` (fsync before mutation), `staging`, and `outcome` records |
| `state.json` | Candidates and chat at the last report |
| `reports/` | `summary.json`, `operations.jsonl`, `operations.csv`, `skipped-failed.json`, `snapshot-<time>.html` |

## CLI

| Command | Result | Exit codes |
|---|---|---|
| `start [--root ABS] [--state-dir ABS] [--locale en\|ja] [--open]` | Preflight, reconcile old journals, spawn the detached runtime, print `{ session, viewerUrl, runId, runDir, root, checks, next }` | 0, 1 usage, 2 preflight |
| `next --session ABS --timeout 25` | One event, `{type:"idle"}`, or `{type:"session-ended"}` | 0, 3 ended, 4 unreachable, 5 rejected |
| `heartbeat --session ABS` | Renews the agent lease and active message leases | 0, 4, 5 |
| `respond --session ABS --file ABS_JSON` | `{ messageId, revision, text, candidateIds? }` | 0, 4, 5 |
| `assess --session ABS --file ABS_JSON` | `{ scanId, revision, messageId?, assessments[] }` → per-item effective risk | 0, 4, 5 |
| `status --session ABS` | Phase, revision, progress, agent lease, summary | 0, 4, 5 |
| `stop --session ABS` | Waits for a running operation (≤120 s) to record its outcome, writes reports, exits | 0, 4, 5 |

`start` also accepts `--home ABS` and `--trash-dir ABS` for isolated fixtures, and `--file-node-threshold BYTES` (default 1 MiB: smaller files are aggregated into their folder). Bodies are read from files; nothing is shell-interpolated. No command accepts a confirmation nonce, a deletion path or argv.

## Events (`next`)

```json
{ "type": "event", "messageId": "<uuid>", "kind": "chat", "delivery": 1, "redelivered": false, "createdAt": "…", "payload": { … } }
```

| Kind | Payload |
|---|---|
| `scan-complete` | `scanId`, `revision`, `root`, `volume`, `coverage`, `candidates[]` (recipe matches), `largest[]` (big folders under home with their IDs), `changedCandidateIds[]` (rescans) |
| `chat` | `scanId`, `revision`, `text`, `candidates[]` (the region the user selected: ID, path, sizes, risk, recipe, reason) |
| `investigate` | Same shape as `chat` for a review item the user wants investigated |
| `session-ended` | The user ended the session in the viewer |

Leases: a delivered message is leased for 60 s. Without an answer it is delivered again with the same `messageId` and `delivery + 1`. Answers are idempotent; a duplicate returns `{ duplicate: true }` and is not shown twice. A reply whose `revision` differs from the current scan is shown with a stale note.

Agent connectivity is separate from browser connectivity: any agent call renews a 60 s agent lease; the viewer shows *disconnected* within about two seconds of expiry, and new cleanup plans are refused (`409 agent-disconnected`) until the agent calls again. A confirmed plan already running finishes and records every outcome.

## Assessment item

```ts
type Assessment = {
  candidateId: string;                       // UUID from an event
  risk: 'safe' | 'review' | 'protected' | 'blocked';
  purpose: string; reason: string;           // ≤ 500 / 2000 chars
  consequences: string[];                    // ≤ 10
  evidence: { kind: 'local' | 'documentation'; reference: string; checkedAt: string }[]; // documentation = https URL
  recipe: 'build-output' | 'derived-data' | 'app-cache' | 'npm-cache' | 'pnpm-store' | 'uv-cache' | 'trash' | null;
  question: string | null;
  reclaimableBytes?: string | null;
};
```

Unknown fields (for example `argv`, `command`, `path`) are rejected with `400 unknown-field`. Body limit 1 MiB.

## HTTP API

Loopback only (`127.0.0.1`, OS-assigned port). Exact `Host` required. The viewer, assets and API share one origin; there is no CORS.

| Endpoint | Role | Notes |
|---|---|---|
| `GET /`, `/viewer.css`, `/viewer.mjs`, `/treemap.mjs` | public | CSP `default-src 'none'; script-src 'self'; …`, `no-store` |
| `POST /api/session` | bootstrap | Consumes the one-use fragment token, returns a viewer bearer credential |
| `GET /api/state?after=N` | viewer | `{ unchanged: true }` when nothing changed since `seq` N |
| `GET /api/tree?parentId=ID&cursor=C` / `?q=TEXT` | viewer | ≤ 300 entries, previews for the first 40, remainder aggregate, next cursor; or a name search |
| `POST /api/chat` | viewer | `{ scanId, candidateIds, text }` |
| `POST /api/selection` | viewer | `{ scanId, revision, candidateIds, selected }`; eligible, non-overlapping items only |
| `POST /api/decisions` | viewer | `{ candidateId, revision, choice: keep\|trash\|investigate }` |
| `POST /api/plans` | viewer | `{ scanId, revision, candidateIds }` → manifest, `manifestHash`, `nonce`, `expiresAt` |
| `POST /api/plans/:id/confirm` | viewer | `{ manifestHash, nonce }`; single use, 120 s, same viewer session, same revision and selection epoch |
| `POST /api/restores` | viewer | `{ operationId, destinationMode: original\|sibling }` → restore manifest (confirm with the same endpoint) |
| `POST /api/rescan` | viewer | New revision; unchanged candidates keep their ID and assessment, decisions reset |
| `POST /api/export`, `POST /api/end` | viewer | Write reports / end the session (additions to the original surface) |
| `GET /agent/next`, `POST /agent/heartbeat`, `POST /agent/responses`, `POST /agent/assessments` | agent | Agent credential; rejected when `Origin` or `Sec-Fetch-Site` is present |
| `GET /agent/status`, `POST /agent/stop` | agent | Additions used by the `status` and `stop` commands |

Mutations from the viewer require the exact `Origin`. Errors are `{ error: { code, message } }`: 400 validation, 401 missing/expired session, 403 role/origin/host, 404 unknown, 409 stale/overlap/expired/ended, 413 body too large (64 KiB, assessments 1 MiB), 415 not JSON, 500 without stack traces.

## Plans and execution

1. The manifest lists each target's path, identity (device, inode, uid, kind, mtime/ctime ns), operation, metadata digest, bytes, consequences, whether it is irreversible, and the fixed command for CLI recipes. Parent/child overlaps are rejected; items that changed since the scan are excluded and unchecked.
2. Any selection, assessment, identity or revision change increments an epoch that invalidates unconfirmed plans.
3. Entries run sequentially. Before each: canonical parent (no links), identity, ownership, protection rules, metadata digest (no new/removed/changed descendants, no protected names, no other volume), recipe checks and process/open-file checks. Any mismatch → `skipped`.
4. Permanent removal renames the target into an exclusive sibling `.disk-map-staging-*` directory, re-validates the moved tree, then removes it. A mismatch keeps it there and reports the recovery path.
5. Trash moves use an exclusive `~/.Trash/disk-map-<operationId>/` wrapper and `rename` only. Another volume, permission errors or an unsafe Trash path fail closed; nothing is copied or deleted.
6. Restore uses `link`+`unlink` (files) or an exclusive placeholder + `rename` (folders), so an occupied destination is never overwritten. `sibling` restores to `<path>.restored-<uuid>`.
7. After a crash, `start` closes every `intent` without an `outcome` as `interrupted` (source still present) or `unknown`, reports any staging/Trash location, and never replays it.

## Space accounting

Reported separately: `representedBytes` (allocated bytes of planned items), `estimatedReclaimableBytes` (null when any item is unknown; Trash moves count 0), `permanentCleanupBytes`, `trashMovedBytes` (not freed until the Trash is emptied), `cliReportedBytes` (only tools that print bytes), and `observedFreeDeltaBytes` (fresh `statfs` after minus before, whole volume, includes unrelated writes). A CLI target that disappears is `observed-missing`, not a direct deletion event. Hard links are counted once per (device, inode); APFS clones, compression, snapshots and purgeable space mean allocated bytes are not a promise of freed space.
