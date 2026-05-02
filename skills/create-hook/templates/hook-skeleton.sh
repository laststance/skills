#!/usr/bin/env bash
# <hook-name>: <one-line purpose>
# Event: <EventName> [matcher: <matcher-or-none>]
# Input (stdin JSON): <list expected fields>
# Output: <e.g. "{} no-op" or "hookSpecificOutput ...">
# Side effects: <files written, notifications, etc.>
#
# Fail-safe: ANY error → echo '{}'; exit 0 (never block user workflow)

set -uo pipefail

# --- config -----------------------------------------------------------------
LOG_DIR="$HOME/.claude/hooks/logs"
LOG="$LOG_DIR/<hook-name>.log"

# --- setup ------------------------------------------------------------------
mkdir -p "$LOG_DIR"
log() { printf '[%s] <hook-name>: %s\n' "$(date -Iseconds)" "$*" >> "$LOG"; }

# --- dependency check ------------------------------------------------------
for cmd in jq; do   # add more: shasum, python3, curl, etc.
  if ! command -v "$cmd" >/dev/null 2>&1; then
    log "ERROR: missing dependency: $cmd"
    echo '{}'; exit 0
  fi
done

# --- read stdin payload -----------------------------------------------------
payload=$(cat)

# Parse the fields you need — adjust to your event's schema
CWD=$(printf '%s' "$payload" | jq -r '.cwd // ""' 2>/dev/null)
SESSION_ID=$(printf '%s' "$payload" | jq -r '.session_id // "unknown"' 2>/dev/null)

# --- validate required inputs -----------------------------------------------
if [ -z "$CWD" ]; then
  log "WARN: cwd empty"
  echo '{}'; exit 0
fi

# --- your hook logic goes here ---------------------------------------------
# Replace this block with the actual work. Every risky step must end with
# a `|| { log ERROR; echo '{}'; exit 0; }` fail-safe.

# Example: emit additionalContext (SessionStart / UserPromptSubmit only)
#
# if ! jq -nc --arg ctx "Hello from <hook-name>" \
#     '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'; then
#   log "ERROR: jq output build failed"
#   echo '{}'; exit 0
# fi
# log "INFO: injected ctx_len=${#ctx}"
# exit 0

# --- default no-op success --------------------------------------------------
log "INFO: completed session=$SESSION_ID"
echo '{}'
