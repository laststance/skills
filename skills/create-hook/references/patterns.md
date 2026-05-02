# Hook Patterns

Copy-paste snippets for the recurring concerns every hook faces.

## Fail-Safe Wrapper (the universal top)

```bash
#!/usr/bin/env bash
# <hook-name>: <one-line purpose>
# Fail-safe: ANY error → echo '{}'; exit 0

set -uo pipefail        # NOTE: no -e; we handle errors explicitly

LOG_DIR="$HOME/.claude/hooks/logs"
LOG="$LOG_DIR/<hook-name>.log"
mkdir -p "$LOG_DIR"
log() { printf '[%s] <hook-name>: %s\n' "$(date -Iseconds)" "$*" >> "$LOG"; }

# Dependency check — bail fast if tools are missing
for cmd in jq shasum; do    # adjust per hook
  if ! command -v "$cmd" >/dev/null 2>&1; then
    log "ERROR: missing dependency: $cmd"
    echo '{}'; exit 0
  fi
done

payload=$(cat)  # read stdin once
```

**Why `set -uo pipefail` and not `-e`:** with `-e`, any non-zero return aborts before you can log or emit the fail-safe `{}`. With `-uo pipefail` + explicit `||`, every failure path is inspectable.

## Reading Stdin Fields

```bash
CWD=$(printf '%s' "$payload" | jq -r '.cwd // ""' 2>/dev/null)
SESSION_ID=$(printf '%s' "$payload" | jq -r '.session_id // "unknown"' 2>/dev/null)
TRANSCRIPT=$(printf '%s' "$payload" | jq -r '.transcript_path // ""' 2>/dev/null)
```

Use `// ""` fallback to avoid `null` strings. Always validate required fields:

```bash
if [ -z "$CWD" ]; then
  log "WARN: cwd empty"
  echo '{}'; exit 0
fi
```

## CWD-Keyed Storage

When per-project state is needed (e.g., context inject store):

```bash
STORE_DIR="$HOME/.claude/hooks/<feature>-store"
mkdir -p "$STORE_DIR"
CWD_HASH=$(printf '%s' "$CWD" | shasum -a 256 | cut -c1-16)
STORE_FILE="$STORE_DIR/${CWD_HASH}.json"
```

16 hex chars (= 64 bits) gives ~4 billion before a 50% collision chance — ample for per-user project counts. `shasum` is in macOS base; use `sha256sum` on Linux.

## Atomic Write (produce side)

Never write directly to the target — readers might see a half-written file.

```bash
TMP=$(mktemp "$STORE_DIR/.tmp.XXXXXX") || {
  log "ERROR: mktemp failed"
  echo '{}'; exit 0
}

if ! jq -nc --arg summary "$SUMMARY" '{summary: $summary}' > "$TMP"; then
  log "ERROR: jq failed"
  rm -f "$TMP"
  echo '{}'; exit 0
fi

if ! mv -f "$TMP" "$STORE_FILE"; then
  log "ERROR: mv failed"
  rm -f "$TMP"
  echo '{}'; exit 0
fi
```

**Why this is atomic:** `mv` on the same filesystem is `rename(2)`, which POSIX guarantees atomic. A reader either sees the old file or the new one, never a partial.

**Must be same filesystem.** `mktemp` inside `$STORE_DIR` (not `/tmp`) ensures this — cross-filesystem `mv` becomes copy+delete, which breaks atomicity.

## Atomic Take (consume side)

For single-consumer semantics (two concurrent `/clear`s must not double-inject):

```bash
TMP=$(mktemp "$STORE_DIR/.take.XXXXXX") || { log "ERROR: mktemp"; echo '{}'; exit 0; }

if ! mv "$STORE_FILE" "$TMP" 2>/dev/null; then
  log "INFO: lost race or no file"
  rm -f "$TMP"
  echo '{}'; exit 0
fi

# Now only THIS process owns $TMP — race-free read
CONTENT=$(jq -r '.field' "$TMP")
rm -f "$TMP"
```

The `mv` succeeds for exactly one caller; the other gets `No such file`.

## Building JSON Output Safely

```bash
jq -nc --arg ctx "$SUMMARY" \
  '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
```

`--arg` passes the value as a string literal with automatic escaping of quotes, backslashes, newlines, and control chars. Never build JSON with `printf` or concatenation.

## Truncation with Marker

```bash
MAX_CHARS=10000
TRUNC_CHARS=9800
SUFFIX=$'\n\n...[truncated to fit 10k additionalContext limit]'

if [ "${#SUMMARY}" -gt "$MAX_CHARS" ]; then
  SUMMARY="${SUMMARY:0:$TRUNC_CHARS}${SUFFIX}"
  log "INFO: truncated from $ORIG_LEN"
fi
```

A visible suffix tells future-you (and Claude reading the injected context) that data was cut.

## Logger Format

```bash
log() { printf '[%s] <hook-name>: %s\n' "$(date -Iseconds)" "$*" >> "$LOG"; }
log "INFO: processed cwd=$CWD size=${#DATA}"
log "WARN: store missing"
log "ERROR: jq failed"
```

ISO-8601 timestamps sort naturally and are unambiguous across timezones. Always prefix severity (`INFO`/`WARN`/`ERROR`) so `grep ERROR` works.

## Python Helper Invocation

When bash + jq can't cleanly parse JSONL or do complex extraction, shell out to a Python helper:

```bash
LIB_DIR="$HOME/.claude/hooks/lib"

EXTRACT_OUT=$(python3 "$LIB_DIR/extract.py" "$TRANSCRIPT" 2>/dev/null) || {
  log "INFO: extract failed"
  echo '{}'; exit 0
}
```

Python helper should exit 0 with JSON on stdout for success, exit non-zero for "no data" (not an error), write to stderr for real errors.

## settings.json Registration

```json
{
  "hooks": {
    "<EventName>": [
      {
        "matcher": "<matcher-or-omit>",
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/hooks/my-hook.sh" }
        ]
      }
    ]
  }
}
```

**Expand `$HOME`** — Claude Code resolves `$HOME` in the command field. Avoid hardcoded `/Users/yourname/` paths.

**Multiple hooks per event** run in parallel. If order matters, combine into one script.
