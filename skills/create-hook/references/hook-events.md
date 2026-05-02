# Hook Events Catalog

Event-by-event reference: matcher semantics, stdin schema, output shape, maturity.

**Maturity levels:**
- ✅ **empirically verified** — real trigger produced real effect, observed in live session
- 📖 **docs-only** — from Claude Code documentation, not personally triggered
- ❓ **suspected** — inferred from source/analogy, not confirmed

Add dated evidence lines when promoting from 📖 → ✅.

## SessionStart ✅

Fires when a new session begins. The `matcher` selects which *kind* of session start triggers.

**Matchers:**
| Matcher | Trigger |
|---------|---------|
| `startup` | fresh `claude` invocation |
| `resume` | `claude -r` or resuming from exit |
| `clear` | user types `/clear` (session reset in place) |
| `compact` | session continues after auto/manual compaction |

**Stdin (JSON):**
```json
{
  "session_id": "uuid",
  "transcript_path": "/abs/path/to/session.jsonl",
  "cwd": "/abs/working/dir",
  "hook_event_name": "SessionStart"
}
```

**Valid output shapes:**
- `{}` — no-op
- `{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "..."}}` — inject context (see `additional-context.md`)

**Empirical evidence:** 2026-04-18, `SessionStart:clear` fired after `/clear`; injected summary was readable in the next turn (this skill's author session).

## PostCompact ✅

Fires after compaction (manual `/compact` or auto-compact on context exhaustion).

**Matcher:** none.

**Stdin (JSON):**
```json
{
  "session_id": "uuid",
  "transcript_path": "/abs/path/to/session.jsonl",
  "cwd": "/abs/working/dir",
  "compact_reason": "manual" | "auto",
  "hook_event_name": "PostCompact"
}
```

**Transcript content at this point:** the last JSONL entry with `"isCompactSummary": true` holds the compaction summary. Extract with:

```python
for line in open(transcript_path):
    obj = json.loads(line)
    if obj.get("isCompactSummary"):
        summary = obj["message"]["content"]  # may be overwritten by later entries
```

Iterate to the *last* matching entry — there may be multiple across a long session.

**Valid output shapes:** `{}` only. PostCompact does not accept `additionalContext`; use `SessionStart:compact` for context injection after compaction.

**Empirical evidence:** 2026-04-18, `PostCompact` fired after `/compact`; `compact-save.sh` successfully wrote store file keyed by CWD hash.

## PreCompact 📖

Fires *before* compaction starts. Use to snapshot state that would otherwise be lost.

**Matcher:** `manual` | `auto` (suspected based on PostCompact symmetry — ❓ on matcher support).

**Stdin:** session_id, transcript_path, cwd.

**Use case:** serena memory save, external backup, user confirmation prompts.

## UserPromptSubmit 📖

Fires when the user submits a prompt, before Claude processes it.

**Matcher:** none.

**Stdin (JSON):**
```json
{
  "session_id": "uuid",
  "transcript_path": "...",
  "cwd": "...",
  "prompt": "the user's message text",
  "hook_event_name": "UserPromptSubmit"
}
```

**Valid output shapes:**
- `{}` — no-op
- `{"decision": "block", "reason": "..."}` — prevent the prompt from being sent (per docs)
- `{"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": "..."}}` — inject context just for this turn

**Note:** `additionalContext` here is per-turn, not per-session. Unlike SessionStart injection, it does not persist — it's appended to the user's message context only.

## PreToolUse 📖

Fires before a tool call. Matcher is a tool-name regex.

**Matcher examples:** `Bash`, `Edit|Write`, `mcp__.*`, `.*` (all tools).

**Stdin (JSON):**
```json
{
  "session_id": "uuid",
  "tool_name": "Bash",
  "tool_input": { "command": "...", "description": "..." },
  "cwd": "...",
  "hook_event_name": "PreToolUse"
}
```

**Valid output shapes:**
- `{}` — allow
- `{"decision": "block", "reason": "shown to Claude"}` — deny the tool call
- Exit code `2` from stderr — deny with stderr text as reason (alternative form)

**Use case:** auth/permission gating, dangerous-command interception, audit logging.

## PostToolUse 📖

Fires after a tool call completes.

**Matcher:** same regex semantics as PreToolUse.

**Stdin:** + `tool_response` (the tool's result).

**Use case:** result filtering, post-write validation, metrics.

## Stop / SubagentStop 📖

Fires when the main agent (or a subagent) is about to stop responding.

**Stdin:** session_id, transcript_path, cwd, `stop_hook_active` (boolean — true if already in a stop hook chain, to prevent infinite loops).

**Valid output shapes:**
- `{}` — allow stop
- `{"decision": "block", "reason": "..."}` — force continue (Claude sees the reason and keeps working)

**Warning:** blocking in a Stop hook without a guard on `stop_hook_active` creates an infinite loop. Always check: `if stop_hook_active: echo '{}'; exit 0`.

## Notification 📖

Fires when Claude Code emits a notification (awaiting user input, idle, etc.).

**Stdin:** session_id, cwd, `message` (notification text).

**Use case:** desktop notifications (`osascript`, `notify-send`), Slack/email pings, sound alerts.

## SessionEnd 📖

Fires when a session ends (user quits, timeout).

**Stdin:** session_id, transcript_path, cwd.

**Use case:** final snapshot, cleanup, export.

---

## How to Add a New Event Entry

When you empirically verify a new event or matcher combination:

1. Add/upgrade the section above with ✅ and a dated evidence line.
2. Paste the real stdin JSON you observed (redact secrets).
3. Paste the real output shape that worked.
4. If behavior differs from docs, note the discrepancy explicitly.
