# Testing Hooks

The single most important page in this skill. Read before declaring a hook "done".

## The Subprocess Dry-Run Trap

**Most developers' first instinct** — and the one that burned this skill's author — is to test like this:

```bash
PAYLOAD='{"session_id":"test","cwd":"/tmp","transcript_path":"/tmp/t.jsonl"}'
printf '%s' "$PAYLOAD" | bash ~/.claude/hooks/my-hook.sh
```

Then inspect stdout with `jq -e` and call it done if it parses.

**This is unreliable.** Subprocess invocation differs from Claude Code's real hook invocation in ways that matter:

- **Locale / LC_ALL** — may differ, affecting byte encoding of non-ASCII input
- **Stdin semantics** — interactive vs. pipe, blocking vs. non-blocking
- **Environment variables** — `HOME`, `PATH`, `SHELL`, unset vars your hook relies on
- **TTY attachment** — some tools (`jq` included) behave differently when stdin/stdout are TTYs vs. pipes
- **Working directory** — may not match `$cwd` in the payload
- **Parent process** — signals, group, session

In the 2026-04-18 session, a dry-run falsely "reproduced" a bug: `stdout line count: 103` with `jq parse error: control characters must be escaped`. A real `/clear` trigger then proved the hook worked perfectly — the subprocess had lied.

**Rule:** dry-runs are useful for syntax/typo catching, not for integration validation.

## The Live-Trigger Protocol

Always validate with a real event firing:

### For SessionStart:clear

```
1. Ensure pre-state exists (e.g., a store file for the current CWD)
2. Type /clear in the live Claude Code session
3. In the post-clear session, ask a needle question that ONLY the
   injected content could answer
4. Check ~/.claude/hooks/logs/<name>.log for the [INFO] line
5. Confirm BOTH the log fired AND Claude knows the needle answer
```

### For PostCompact

```
1. Trigger with /compact (manual) or let context exhaustion auto-compact
2. Immediately check the expected side effect (store file written,
   notification fired, backup created)
3. Check logs for expected entries
```

### For PreToolUse / PostToolUse

```
1. Invoke a tool matching your matcher regex in the live session
2. Confirm the decision/block took effect (tool didn't run, or reason
   appears in Claude's response)
```

### For UserPromptSubmit

```
1. Send any prompt
2. Observe Claude's response for evidence of injected context
   (needle-question approach works here too)
```

## Reading Logs Correctly

A log entry describes **what your script did**, not **what Claude Code accepted**.

```
[2026-04-18T18:32:05+09:00] inject: INFO: injected cwd=/path size=9851
```

This means: "my `echo`/`jq` emitted 9851 bytes." It does NOT mean Claude Code successfully parsed and injected that content.

**To verify acceptance, you need observable effect on Claude's behavior.** Not a log line.

## Debugging Checklist

When a hook seems broken, work top-down:

```
- [ ] Did the hook fire at all?
      Check: any log entry with a timestamp matching the trigger event
      If no: matcher/registration problem (see debugging.md)

- [ ] Did the hook complete successfully?
      Check: [INFO] line at the bottom of the script
      If no: an intermediate step failed — check [WARN]/[ERROR] above

- [ ] Did the hook emit valid JSON?
      Check: capture stdout to a temp file DURING a real run and run jq -e
      Add `tee /tmp/last-hook-output.json` to your echo path temporarily

- [ ] Did Claude Code accept the JSON?
      Check: observable effect (context available, tool blocked, etc.)
      If no effect despite valid JSON: recheck output shape exactly
      matches the event's contract (hookEventName, required fields)
```

## Capturing Real Invocation Output

To inspect what your hook ACTUALLY emits during a real trigger (not a fake dry-run), temporarily wrap stdout:

```bash
# At the end of your hook, instead of plain:
#   echo "$OUTPUT"
# Use:
echo "$OUTPUT" | tee -a ~/.claude/hooks/logs/my-hook.stdout.log
```

After the next live trigger, inspect `my-hook.stdout.log` — this is the byte-for-byte output Claude Code received. Validate with `jq -e < my-hook.stdout.log`.

Remove the `tee` once debugging is done (it persists output between runs which can confuse the next inspection).

## Testing Across Claude Code Versions

Hook schemas occasionally change between Claude Code releases. When upgrading:

1. Check each hook's expected stdin shape against a real invocation (inspect with `tee < /dev/stdin`)
2. Check output acceptance against a fresh needle-question test
3. Update event entries in `hook-events.md` with the new evidence date

## The One Rule

> A hook is "working" only after a real trigger produced a real, observable effect on Claude's behavior — not after the script ran, not after the log fired, not after dry-run output parsed.
