# Debugging Hooks

Decision tree for the three classic failure modes.

## Mode 1: "My hook doesn't fire"

Symptom: no log entry at all when the event should have triggered.

### Step 1 — Confirm registration
```bash
jq '.hooks' ~/.claude/settings.json
```
Is your hook listed under the correct event name? Common typos: `SessionStart` (capital S) vs `sessionstart`, `PreToolUse` vs `PreToolCall`.

### Step 2 — Confirm matcher
For events that support matchers (`SessionStart`, `PreToolUse`, `PostToolUse`), an unmatched matcher silently skips.

- `SessionStart` matchers: `startup`, `resume`, `clear`, `compact` (exact string).
- `PreToolUse/PostToolUse` matchers: regex against tool name — use `.*` to match everything while debugging.

### Step 3 — Confirm the script is executable
```bash
ls -l ~/.claude/hooks/my-hook.sh    # should show -rwx------
chmod +x ~/.claude/hooks/my-hook.sh # if not
```

### Step 4 — Confirm the script path resolves
Claude Code expands `$HOME` but not shell aliases. Test:
```bash
eval "ls -l $HOME/.claude/hooks/my-hook.sh"
```

### Step 5 — Add a top-of-script firing marker
```bash
#!/usr/bin/env bash
echo "[$(date -Iseconds)] FIRED: pid=$$ args=$*" >> ~/.claude/hooks/logs/_fire.log
# ... rest of script
```
Trigger the event. If `_fire.log` has no new line, the hook isn't wired. If it does, the hook fires but fails downstream.

### Step 6 — Check settings.json isn't overridden
Both `~/.claude/settings.json` and `~/.claude/settings.local.json` are loaded; local overrides global. Same goes for project-level `.claude/settings.json`. Confirm which file actually holds your hook.

## Mode 2: "Hook fires but has no effect"

Symptom: log shows `[INFO] success`, but Claude's behavior is unchanged.

### Step 1 — Inspect real output bytes
Temporary `tee` at the emit point:
```bash
OUTPUT='{"hookSpecificOutput":...}'
echo "$OUTPUT" | tee -a ~/.claude/hooks/logs/my-hook.stdout.log
```
After the next live trigger, validate:
```bash
tail -1 ~/.claude/hooks/logs/my-hook.stdout.log | jq -e .
```
If `jq -e` fails: malformed JSON. Rebuild with `jq -nc --arg` (never string concat).

### Step 2 — Verify output shape matches the event contract
- `SessionStart` injection requires: `hookSpecificOutput.hookEventName === "SessionStart"` AND `additionalContext`
- `UserPromptSubmit` decision requires: `decision: "block"` + `reason`
- `PreToolUse` deny requires: `decision: "block"` + `reason`, OR exit code 2 + stderr text

Mismatched shape = silent drop. Claude Code doesn't surface schema errors to the user.

### Step 3 — Verify with a needle question
Inject a sentinel, ask for it explicitly:

```
Hook injects: "SESSION_MARKER=alpha7"
First prompt: "What is the SESSION_MARKER?"
Claude answers: "alpha7"  ← injection succeeded
Claude answers: "I don't see..." ← injection silently failed
```

This is the only reliable acceptance signal.

### Step 4 — Claude Devtools caveat
Devtools may not visibly display injected `additionalContext` even when it succeeded (observed 2026-04-18). Do not rely on Devtools alone — use the needle test.

## Mode 3: "Dry-run works, live doesn't (or vice versa)"

This is the empirical-validation trap. Dry-runs are systematically unreliable; see [testing-hooks.md](testing-hooks.md).

**Resolution:** always trust the live trigger. If dry-run says broken but live works, your hook is fine and the dry-run was misleading. If dry-run says working but live doesn't, keep debugging with real triggers — do not re-use the dry-run as evidence.

## Diagnostic One-Liners

```bash
# See the full hook config Claude Code is using
jq '.hooks' ~/.claude/settings.json

# Tail all hook logs in real time while you trigger events
tail -f ~/.claude/hooks/logs/*.log

# Check if any stored state exists (e.g. for compact-inject)
ls -la ~/.claude/hooks/compact-inject-store/

# Validate the last stdout emission from a hook
tail -1 ~/.claude/hooks/logs/my-hook.stdout.log | jq -e .

# Find all transcript entries with compact summaries
jq -c 'select(.isCompactSummary == true) | {session: .sessionId, time: .timestamp, size: (.message.content | length)}' < /path/to/session.jsonl
```

## When All Else Fails

1. Reduce to minimum: make the hook do nothing but log "FIRED" and emit `{}`. Confirm that works.
2. Add ONE feature back at a time, live-testing after each.
3. Bisect: you'll quickly find the exact addition that broke it.

This is slow but reliable. Resist the temptation to "fix" multiple things at once — you'll chase phantoms.
