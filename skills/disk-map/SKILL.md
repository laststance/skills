---
name: disk-map
description: >
  Map Mac storage as an interactive local HTML disk map, answer the user's
  questions about selected regions as the invoking agent, and run a reviewed
  cleanup with an exact manifest, Trash restore and an audit trail. Use when
  the user asks what fills their Mac disk, wants to free space, clean caches
  or build output safely, or says 「ディスクを空けたい」「容量の内訳」
  「キャッシュを安全に消したい」「ディスクマップ」. macOS only.
---

# Disk map

Scan the Mac read-only and answer viewer questions as the invoking agent. Cleanup requires the user's exact-manifest confirmation in the viewer.

## Hard rules

1. **You are the chat backend.** No replacement agent, model API, `claude -p` or `codex exec`. Never edit host settings, MCP config, sandbox or approval modes.
2. **Never delete, move or empty anything with your own tools.** The runtime executes only manifests the user confirmed in the viewer. A "yes" in Chat is not consent.
3. **Use metadata-only probes.** Start with `probe` below; never print raw process arguments (`ps aux`, `ps … args`, `pgrep -af`) or environment variables. Never read conversations, browser databases, credentials, keychains or mail. When one small sample is needed, say what you read and why.
4. **Evidence, not names.** "cache", a large size, or an old date never makes something safe. Follow [references/assessment.md](references/assessment.md).
5. **Keep host approvals intact.** Follow host permission prompts. If local execution is unavailable, stop and explain; do not scan a different machine.

## Requirements

macOS, Node.js 22+, local command execution and a browser. No npm install or API key. See [host compatibility](references/host-compatibility.md).

## 1. Start

Use the invocation language for `--locale` (`ja` for Japanese, otherwise `en`) and for every reply.

```bash
node <skill-dir>/scripts/disk-map.mjs start --locale en --open
```

- Default root is the data volume (`/System/Volumes/Data`). For a narrower scan pass `--root /Users/<you>/Projects`.
- Output: `session` (private file), `viewerUrl` (one-use link), `next` (command). Share `viewerUrl` once if `--open` is unavailable.
- Exit 2: report the preflight failure `message` and stop.

## 2. Service loop

Repeat while the session is active:

```bash
node <skill-dir>/scripts/disk-map.mjs next --session <session> --timeout 25
```

| Output | Do this |
|---|---|
| `{"type":"idle"}` | Call `next` again immediately. |
| `kind: "scan-complete"` | Assess the first candidate/large-region pages (step 3); follow next cursors for more. |
| `kind: "chat"` | Answer `payload.text` about `payload.candidates` (step 4). |
| `kind: "investigate"` | Investigate the review item, reassess, then `respond`. |
| `kind: "operation-complete"` | Summarise counts, Trash bytes, observed free-space delta and report paths; `respond` with this message ID to acknowledge it. The viewer offers save/end, continue, and restore. |
| `type: "session-paused"` (exit 6) | Stop polling and finish this turn with the saved report and resume instructions. Keep the local runtime available. |
| `kind` or `type: "session-ended"` (exit 3 for the latter) | Run `stop`, then summarise the reports. |
| exit 4 (unreachable) | The runtime stopped. Tell the user; offer to start a new session. |

- Run `heartbeat --session <session>` during investigations over ~40 s. After 60 s without an agent call, new cleanup plans pause.
- Hosts that yield may run `watch --session <session>` in the background. It exits when the session pauses or ends. Long polls support up to 300 s; keep individual waits within your host limit.
- A message with `redelivered: true` was not answered before its lease expired; answer it once.
- If `payload.spilled` is true, read the private JSON at `payload.payloadFile`.
- Three minutes without viewer input pauses idle sessions and saves reports. Polling does not extend activity. Resume only on user request: `resume --session <session>`, then `next`.
- An explicit request to finish in the host chat authorizes `stop` immediately. Do not ask the user to also press the viewer button. “Clear question selection” only removes chat context; it does not clean files or end the session.

## 3. Assess

Scan events contain ≤8 entries per kind. Page further in size order using the current revision:

```bash
node <skill-dir>/scripts/disk-map.mjs candidates --session <session> --revision 0 --kind largest --cursor 8 --limit 20
node <skill-dir>/scripts/disk-map.mjs probe --session <session> --revision 0 --candidate-id <uuid>
```

`candidates` pages recipe matches; `largest` pages large regions. Follow `nextCursor` until null. `probe` supplies metadata, readiness, sanitized usage and documentation links, without granting deletion permission.

Submit an assessment JSON file by absolute path:

```bash
node <skill-dir>/scripts/disk-map.mjs assess --session <session> --file /abs/path/assess-1.json
```

Body: `{ scanId, revision, messageId?, assessments: Assessment[] }`; [field definitions](references/protocol.md#assessment-item). Write explanations in the invocation language. Acknowledge the scan message after pagination and assessment.

- `safe` needs a [permanent-cleanup recipe](references/assessment.md), local **and** documentation evidence, and consequences. Failed runtime checks downgrade it to `review`.
- Uncertain ownership or personal data → `review` with a plain `question` the user can answer (Keep is the default; Trash only after they choose it).
- Credentials, settings, active work, source, VM/Docker disks, app bundles → `protected`. Runtime protection includes Lume/OrbStack containers and `disk.img`/`data.img`; assessments cannot override it.
- `protected` defaults to `protectionScope: "subtree"`. Use `"container"` only to prohibit deleting a parent as a whole while independently checking its exact cache leaves. User **Keep** and runtime protection always prevail.
- Read both `results` and `affected`: protection changes can unselect previously safe children or parents. For `stale-revision`, run `status` and use the current revision.

## 4. Answer chat

Send a reply file with the message ID and current revision:

```bash
node <skill-dir>/scripts/disk-map.mjs respond --session <session> --file /abs/path/reply-1.json
```

```json
{ "messageId": "<payload messageId>", "revision": 0, "text": "This is Xcode DerivedData for an old project…", "candidateIds": ["<uuid>"] }
```

Explain the folder's purpose, removal consequences and evidence in the user's language. Update `assess` when needed. Direct cleanup through the viewer's controls, never destructive shell commands.

## 5. Stop

```bash
node <skill-dir>/scripts/disk-map.mjs stop --session <session>
```

`stop` waits for a running operation to record its outcome, then writes reports. Summarise files in `reports/`, outcome counts, bytes moved to Trash (not yet freed), and the observed free-space change. Never describe an incomplete scan or incomparable allocated totals as “0 unaccounted”; use unknown. Trash is never emptied automatically. The static HTML report uses the viewer language; JSON/CSV retain stable machine-readable fields.

## References

- [references/assessment.md](references/assessment.md) — evidence rules, protected vs review examples, recipe table and verified app-cache leaves.
- [references/protocol.md](references/protocol.md) — CLI, events, HTTP API, persistence, plan confirmation, crash recovery.
- [references/host-compatibility.md](references/host-compatibility.md) — Codex Desktop/CLI, Claude Code, Devin CLI, Cursor and OpenClaw requirements and verification status.
