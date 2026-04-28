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
# @returns Exit 0 only when:
#          - all checks on HEAD are completed
#          - no failing checks exist
#          - at least one CodeRabbit check exists on HEAD and is completed+success
#          Exit 1 for failed checks (including failed/non-success CodeRabbit)
#          Exit 2 on timeout

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
  # Query BOTH the Checks API and the legacy Statuses API because GitHub
  # bots split between them. CodeRabbit (and many CI services) publish via
  # commit statuses, not check_runs — querying check-runs alone returns 0
  # CodeRabbit results and the script would otherwise wait forever.
  # `gh pr checks` aggregates both, but `repos/.../check-runs` does not.
  #
  # Statuses API state mapping (state → status|conclusion):
  #   pending          → in_progress|pending
  #   success          → completed|success
  #   failure | error  → completed|failure
  # Mirroring the check_runs shape lets the rest of the loop stay unchanged.
  CHECK_RUNS=$(gh api "repos/$OWNER/$REPO/commits/$HEAD_SHA/check-runs" \
    --jq '.check_runs[] | "\(.name)|\(.status)|\(.conclusion // "pending")"' 2>/dev/null || true)
  COMMIT_STATUSES=$(gh api "repos/$OWNER/$REPO/commits/$HEAD_SHA/status" \
    --jq '.statuses[] |
      if .state == "pending" then "\(.context)|in_progress|pending"
      elif .state == "success" then "\(.context)|completed|success"
      elif .state == "failure" or .state == "error" then "\(.context)|completed|failure"
      else "\(.context)|completed|\(.state)" end' 2>/dev/null || true)
  ALL_CHECKS=$(printf '%s\n%s\n' "$CHECK_RUNS" "$COMMIT_STATUSES" | sed '/^$/d')

  if [ -z "$ALL_CHECKS" ]; then
    echo "  No checks found yet... (${ELAPSED}s elapsed)"
    sleep "$INTERVAL"
    ELAPSED=$((ELAPSED + INTERVAL))
    continue
  fi

  # Count completed vs in-progress
  TOTAL=$(echo "$ALL_CHECKS" | wc -l | tr -d ' ')
  COMPLETED=$(echo "$ALL_CHECKS" | grep -c '|completed|' || true)
  CR_CHECKS=$(echo "$ALL_CHECKS" | grep -i 'coderabbit' || true)
  CR_TOTAL=$(echo "$CR_CHECKS" | sed '/^$/d' | wc -l | tr -d ' ')
  CR_SUCCESS=$(echo "$CR_CHECKS" | grep -c '|completed|success$' || true)
  CR_FAILED=$(echo "$CR_CHECKS" | grep -c '|completed|failure$' || true)
  CR_NON_SUCCESS_COMPLETED=$(echo "$CR_CHECKS" | grep -c '|completed|' || true)

  echo "  Checks: $COMPLETED/$TOTAL completed, CodeRabbit: $CR_SUCCESS success / $CR_TOTAL found (${ELAPSED}s elapsed)"

  if [ "$CR_TOTAL" -eq 0 ]; then
    echo "  CodeRabbit not found on HEAD yet (queried both check-runs and commit-status APIs). Waiting..."
    sleep "$INTERVAL"
    ELAPSED=$((ELAPSED + INTERVAL))
    continue
  fi

  if [ "$CR_FAILED" -gt 0 ]; then
    echo ""
    echo "CodeRabbit check failed."
    echo "$CR_CHECKS" | while IFS='|' read -r name status conclusion; do
      echo "  [FAIL] $name ($status/$conclusion)"
    done
    exit 1
  fi

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

    echo ""
    echo "CodeRabbit checks:"
    echo "$CR_CHECKS" | while IFS='|' read -r name status conclusion; do
      echo "  - $name ($status/$conclusion)"
    done

    # Even with no unresolved threads, we must not merge until the CodeRabbit
    # signal for current HEAD (check_run OR commit_status) is completed+success.
    if [ "$CR_SUCCESS" -lt 1 ] || [ "$CR_NON_SUCCESS_COMPLETED" -gt "$CR_SUCCESS" ]; then
      echo ""
      echo "CodeRabbit review is not in completed+success state yet."
      exit 1
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
