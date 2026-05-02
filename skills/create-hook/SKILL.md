---
name: create-hook
description: Creates, debugs, and extends Claude Code hooks. Use when building a new hook, troubleshooting why a hook "doesn't fire", designing SessionStart/PostCompact/PreToolUse/PostToolUse/UserPromptSubmit/Stop/Notification handlers, or when the user mentions settings.json hooks, additionalContext injection, or hookSpecificOutput.
---

# Create Hook

Build reliable Claude Code hooks that survive real-world event firing — not just clean dry-runs.

## When to Use

- User says "make a hook for X" / "wire a hook" / "hook up X to event Y"
- User debugging: "my hook doesn't fire" / "the hook runs but nothing happens"
- Designing flows involving `additionalContext` injection, context recovery, tool gating, notifications
- Any edit to `~/.claude/settings.json` `hooks` block
- Extending this skill itself with new event knowledge

## Core Principles

1. **Fail-safe or silent**: every failure path ends with `echo '{}'; exit 0`. A broken hook must never block the user.
2. **Logs are ground truth for the script, not for Claude Code acceptance**: your log says "I emitted X"; only empirical live testing proves Claude Code consumed X.
3. **Subprocess dry-runs lie**: `printf '%s' "$PAYLOAD" | bash hook.sh` can produce different output than the real hook invocation (locale, TTY, stdin semantics, environment). Validate with a **real trigger** before declaring done.
4. **Atomic file ops for shared state**: `mktemp` + `mv` on the same filesystem, so concurrent sessions cannot double-read or corrupt.
5. **Key by CWD when state is project-scoped**: `shasum -a 256 | cut -c1-16` of `$CWD` gives a stable, collision-resistant filename.

## Quick Start

**1. Pick your event + matcher.** See [references/hook-events.md](references/hook-events.md) for the catalog. Key empirically-validated ones:

| Event | Matcher | Fires when | Stdin has |
|-------|---------|------------|-----------|
| `SessionStart` | `startup` | first launch | session_id, cwd, transcript_path |
| `SessionStart` | `resume` | `claude -r` | same |
| `SessionStart` | `clear` | user types `/clear` | same |
| `SessionStart` | `compact` | after auto/manual compaction | same |
| `PostCompact` | (none) | after `/compact` or auto-compact | + `compact_reason` |
| `UserPromptSubmit` | (none) | user sends a message | + `prompt` |
| `PreToolUse` | tool name regex | before a tool call | + `tool_name`, `tool_input` |

**2. Copy the skeleton** from [templates/hook-skeleton.sh](templates/hook-skeleton.sh). It has the mandatory boilerplate: `set -uo pipefail`, dependency checks, stdin parsing, logger, fail-safe exits.

**3. Wire it in `~/.claude/settings.json`:**

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "clear",
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/hooks/my-hook.sh" }
        ]
      }
    ]
  }
}
```

Omit `matcher` for events that don't support it. Multiple hooks per event run in parallel — order is not guaranteed.

**4. Test live, not via dry-run.** See [references/testing-hooks.md](references/testing-hooks.md). The TL;DR: trigger the real event (`/clear`, `/compact`, a real prompt) and inspect both your log AND the visible effect on Claude's behavior. Subprocess pipe testing catches syntax errors but misses integration issues.

## Standard Workflow

Copy this checklist and tick items:

```
- [ ] 1. Pick event + matcher (references/hook-events.md)
- [ ] 2. Draft input schema (what stdin fields will I read?)
- [ ] 3. Draft output shape ({} vs hookSpecificOutput)
- [ ] 4. Start from templates/hook-skeleton.sh
- [ ] 5. Add fail-safe wrappers on every failure path
- [ ] 6. Add timestamped logging to ~/.claude/hooks/logs/<name>.log
- [ ] 7. Register in ~/.claude/settings.json (NOT settings.local.json if shared)
- [ ] 8. Live-trigger the event (real /clear, real prompt, etc.)
- [ ] 9. Confirm Claude's observable behavior changed (not just the log)
- [ ] 10. Check logs for the expected [INFO] lines
```

## Critical Gotchas

**Logs can mislead.** `[INFO] injected size=9851` means the script's `echo`/`jq -nc` ran — not that Claude Code accepted the JSON. For SessionStart-with-additionalContext, confirm by asking the new session a question only the injected context could answer.

**`additionalContext` has a ~10k char budget.** Truncate with a trailing marker so you (and Claude) can tell when it happened. See [references/additional-context.md](references/additional-context.md).

**`matcher` scopes the event, `type: "command"` runs the hook.** A missing or mistyped matcher silently skips execution — no error, no log. Always `echo` + timestamp at the top of the script to confirm firing.

**Exit codes matter for PreToolUse only.** Exit 2 blocks the tool call; any other exit is treated as success. Other events ignore exit codes beyond `!= 0` = failure.

**Don't use `set -e`.** Use `set -uo pipefail` + explicit `|| { log; echo '{}'; exit 0; }` on every risky command. This keeps the fail-safe contract intact.

**`settings.json` is gitignored in most .claude setups.** Edits won't appear in `git status`. To confirm your changes persisted, `stat` the file or grep the disk copy directly.

## References

- [references/hook-events.md](references/hook-events.md) — event catalog: inputs, matchers, output shapes, maturity level (empirically verified vs documented-only)
- [references/additional-context.md](references/additional-context.md) — `hookSpecificOutput.additionalContext` injection mechanics, size limits, verification
- [references/testing-hooks.md](references/testing-hooks.md) — why subprocess dry-runs mislead, live-trigger protocol, debugging checklist
- [references/patterns.md](references/patterns.md) — fail-safe template, atomic writes, CWD-keyed storage, logger, dependency checks
- [references/debugging.md](references/debugging.md) — "my hook doesn't fire" decision tree, log interpretation, Claude Devtools caveats

## Extending This Skill

This skill is intentionally incomplete. As new event types are validated empirically, append to `references/hook-events.md` with a **maturity marker**:

- `✅ empirically verified` — real trigger produced real effect; include date + session evidence
- `📖 docs-only` — haven't personally triggered; cite the doc URL
- `❓ suspected` — inferred from source or analogy; label clearly

Keep SKILL.md stable; push event-specific knowledge into references. The decision framework here applies to every event type — only the schemas differ.
