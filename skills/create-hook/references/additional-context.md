# additionalContext Injection

How to silently feed text into a Claude Code session via hooks.

## What It Does

`additionalContext` injects text into the agent's context as if it were a system-provided note. The user doesn't see it in the transcript; Claude reads it and can reference it in replies.

**Supported events:**
- `SessionStart` (any matcher) — persists for the whole session
- `UserPromptSubmit` — appended to a single turn only

**Not supported:** PostCompact, PreCompact, PreToolUse, Stop, etc. Use `SessionStart:compact` if you want post-compaction injection.

## Output Shape

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "...your text here..."
  }
}
```

Both fields are required. `hookEventName` must match the firing event exactly — omitting or misspelling silently drops the injection.

## Size Limit

**~10,000 characters.** Exceeding silently truncates (or drops entirely — behavior not fully tested). Truncate yourself with a visible marker:

```bash
MAX_CHARS=10000
TRUNC_CHARS=9800
SUFFIX=$'\n\n...[truncated to fit 10k additionalContext limit]'

if [ "${#SUMMARY}" -gt "$MAX_CHARS" ]; then
  SUMMARY="${SUMMARY:0:$TRUNC_CHARS}${SUFFIX}"
fi
```

Leaving headroom (9800 vs 10000) prevents boundary bugs when the suffix is appended.

## Building the JSON Safely

Use `jq -nc --arg` to escape newlines, quotes, and control characters automatically:

```bash
jq -nc --arg ctx "$SUMMARY" \
  '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
```

**Do not** build JSON with `printf` or string concatenation — embedded `"`, `\n`, `\`, or control chars will break the parse.

## Verification Protocol

After wiring injection, confirm it actually reached the model:

1. **Don't trust the log alone.** `[INFO] injected size=9851` means your script emitted — not that Claude Code accepted.
2. **Don't trust Claude Devtools alone.** In our 2026-04-18 session, Devtools did not visibly show the injected context post-`/clear`, yet the model *did* have the context (confirmed by asking a question only the injected summary could answer).
3. **Ask a "needle" question.** Inject a sentinel string like `"Session marker: XYZ123"`; immediately ask "what is the session marker?" in the first turn. If Claude answers `XYZ123`, injection succeeded.

## Common Injection Failures

| Symptom | Likely cause |
|---------|--------------|
| Script logs success, Claude has no memory | malformed JSON on stdout (check with `jq -e < output`) |
| Log says "no store file" | CWD hash mismatch (run shasum manually on the actual CWD) |
| Injection works first time, not subsequently | atomic-take consumed the store; this is correct behavior — regenerate the store before re-testing |
| Claude sees a *different* summary than expected | multiple `isCompactSummary` entries in transcript; only the *last* is extracted — confirm which you actually want |

## Related: UserPromptSubmit Injection

Per-turn injection for context that should not persist:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "Reminder: the user is on vacation this week."
  }
}
```

Use for reminders, auth metadata, or ephemeral state that would pollute session-long context.
