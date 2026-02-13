#!/usr/bin/env bash
# check-ci-status.sh — Wait for CI and CodeRabbit review to complete on a PR
#
# Usage: bash check-ci-status.sh <owner> <repo> <pr_number> [max_wait_seconds]
# Example: bash check-ci-status.sh laststance corelive 17 300
#
# @param owner - GitHub repository owner
# @param repo - GitHub repository name
# @param pr_number - Pull request number
# @param max_wait_seconds - Maximum wait time (default: 300 = 5 minutes)
# @returns Prints CI status summary when all checks complete or timeout

set -euo pipefail

OWNER="${1:?Usage: $0 <owner> <repo> <pr_number> [max_wait_seconds]}"
REPO="${2:?Usage: $0 <owner> <repo> <pr_number> [max_wait_seconds]}"
PR_NUMBER="${3:?Usage: $0 <owner> <repo> <pr_number> [max_wait_seconds]}"
MAX_WAIT="${4:-300}"

HEAD_SHA=$(gh pr view "$PR_NUMBER" --json headRefOid -q .headRefOid)
echo "Waiting for CI on PR #$PR_NUMBER (commit: ${HEAD_SHA:0:7})..."

INTERVAL=10
ELAPSED=0

while [ "$ELAPSED" -lt "$MAX_WAIT" ]; do
  # Check all check runs
  ALL_CHECKS=$(gh api "repos/$OWNER/$REPO/commits/$HEAD_SHA/check-runs" \
    --jq '.check_runs[] | "\(.name)|\(.status)|\(.conclusion // "pending")"' 2>/dev/null || true)

  if [ -z "$ALL_CHECKS" ]; then
    echo "  No checks found yet... (${ELAPSED}s elapsed)"
    sleep "$INTERVAL"
    ELAPSED=$((ELAPSED + INTERVAL))
    continue
  fi

  # Count completed vs in-progress
  TOTAL=$(echo "$ALL_CHECKS" | wc -l | tr -d ' ')
  COMPLETED=$(echo "$ALL_CHECKS" | grep -c '|completed|' || true)

  echo "  Checks: $COMPLETED/$TOTAL completed (${ELAPSED}s elapsed)"

  if [ "$COMPLETED" -eq "$TOTAL" ]; then
    echo ""
    echo "All $TOTAL checks completed:"
    echo "$ALL_CHECKS" | while IFS='|' read -r name status conclusion; do
      case "$conclusion" in
        success) icon="pass" ;;
        failure) icon="FAIL" ;;
        skipped) icon="skip" ;;
        *) icon="$conclusion" ;;
      esac
      echo "  [$icon] $name"
    done

    # Check if CodeRabbit specifically passed
    CR_STATUS=$(echo "$ALL_CHECKS" | grep -i 'coderabbit' | head -1 || true)
    if [ -n "$CR_STATUS" ]; then
      echo ""
      echo "CodeRabbit: $(echo "$CR_STATUS" | cut -d'|' -f3)"
    fi

    # Return success if no failures
    FAILURES=$(echo "$ALL_CHECKS" | grep -c '|failure$' || true)
    if [ "$FAILURES" -eq 0 ]; then
      echo ""
      echo "All checks passed."
      exit 0
    else
      echo ""
      echo "$FAILURES check(s) failed."
      exit 1
    fi
  fi

  sleep "$INTERVAL"
  ELAPSED=$((ELAPSED + INTERVAL))
done

echo ""
echo "Timeout after ${MAX_WAIT}s. Current status:"
gh pr checks "$PR_NUMBER" 2>/dev/null || echo "(Unable to fetch checks)"
exit 2
