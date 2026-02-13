#!/usr/bin/env bash
# wait-for-ratelimit.sh — Detect CodeRabbit rate limit, wait for expiry, trigger full review
#
# Usage: bash wait-for-ratelimit.sh <owner> <repo> <pr_number>
# Example: bash wait-for-ratelimit.sh laststance corelive 17
#
# @param owner - GitHub repository owner
# @param repo - GitHub repository name
# @param pr_number - Pull request number
# @returns Exit 0 if rate limit detected + waited + full review triggered
#          Exit 1 if no rate limit found (normal flow)
#          Exit 2 if error occurred

set -euo pipefail

OWNER="${1:?Usage: $0 <owner> <repo> <pr_number>}"
REPO="${2:?Usage: $0 <owner> <repo> <pr_number>}"
PR_NUMBER="${3:?Usage: $0 <owner> <repo> <pr_number>}"

BUFFER_SECONDS=30

echo "Checking for CodeRabbit rate limit on PR #$PR_NUMBER..."

# Fetch the 10 most recent issue comments from coderabbitai (newest first)
COMMENTS=$(gh api "repos/$OWNER/$REPO/issues/$PR_NUMBER/comments?per_page=10&sort=created&direction=desc" \
  --jq '.[] | select(.user.login == "coderabbitai") | .body' 2>/dev/null || true)

if [ -z "$COMMENTS" ]; then
  echo "  No CodeRabbit comments found."
  exit 1
fi

# Check only the most recent CodeRabbit comment for rate limit patterns
LATEST_COMMENT=$(echo "$COMMENTS" | head -1)

# Match rate limit patterns (case-insensitive)
# Common CodeRabbit rate limit messages:
#   "rate limit" / "rate-limited" / "rate limited"
#   "try again in X minutes" / "available in approximately X minutes"
#   "will be available in X min"
if ! echo "$LATEST_COMMENT" | grep -qiE 'rate.?limit'; then
  echo "  No rate limit detected in latest CodeRabbit comment."
  exit 1
fi

echo "  Rate limit detected!"

# Extract wait time from the comment
# Patterns: "X minutes", "X min", "X hours", "X seconds", "X sec"
WAIT_SECONDS=0

# Try to extract minutes
MINUTES=$(echo "$LATEST_COMMENT" | grep -oiP '(\d+)\s*(?:minutes?|mins?)' | head -1 | grep -oP '\d+' || true)
if [ -n "$MINUTES" ]; then
  WAIT_SECONDS=$((MINUTES * 60))
  echo "  Detected wait time: ${MINUTES} minute(s)"
fi

# Try to extract hours (if no minutes found)
if [ "$WAIT_SECONDS" -eq 0 ]; then
  HOURS=$(echo "$LATEST_COMMENT" | grep -oiP '(\d+)\s*(?:hours?|hrs?)' | head -1 | grep -oP '\d+' || true)
  if [ -n "$HOURS" ]; then
    WAIT_SECONDS=$((HOURS * 3600))
    echo "  Detected wait time: ${HOURS} hour(s)"
  fi
fi

# Try to extract seconds (if nothing else found)
if [ "$WAIT_SECONDS" -eq 0 ]; then
  SECONDS_VAL=$(echo "$LATEST_COMMENT" | grep -oiP '(\d+)\s*(?:seconds?|secs?)' | head -1 | grep -oP '\d+' || true)
  if [ -n "$SECONDS_VAL" ]; then
    WAIT_SECONDS=$SECONDS_VAL
    echo "  Detected wait time: ${SECONDS_VAL} second(s)"
  fi
fi

# Fallback: if rate limit detected but no time extracted, default to 15 minutes
if [ "$WAIT_SECONDS" -eq 0 ]; then
  WAIT_SECONDS=900
  echo "  Could not extract wait time. Defaulting to 15 minutes."
fi

# Add buffer
TOTAL_WAIT=$((WAIT_SECONDS + BUFFER_SECONDS))
echo "  Waiting ${TOTAL_WAIT}s (${WAIT_SECONDS}s + ${BUFFER_SECONDS}s buffer)..."

# Wait with progress indicator
ELAPSED=0
INTERVAL=30
while [ "$ELAPSED" -lt "$TOTAL_WAIT" ]; do
  REMAINING=$((TOTAL_WAIT - ELAPSED))
  REMAINING_MIN=$((REMAINING / 60))
  echo "  Waiting... ${REMAINING}s remaining (~${REMAINING_MIN}m)"

  if [ "$REMAINING" -lt "$INTERVAL" ]; then
    sleep "$REMAINING"
    ELAPSED=$TOTAL_WAIT
  else
    sleep "$INTERVAL"
    ELAPSED=$((ELAPSED + INTERVAL))
  fi
done

echo "  Rate limit wait complete. Triggering full review..."

# Post @coderabbitai full review to trigger a complete re-review
gh pr comment "$PR_NUMBER" --repo "$OWNER/$REPO" --body "@coderabbitai full review"

if [ $? -eq 0 ]; then
  echo "  Posted '@coderabbitai full review' on PR #$PR_NUMBER."
  echo "  Full review triggered successfully."
  exit 0
else
  echo "  ERROR: Failed to post full review comment."
  exit 2
fi
