# CodeRabbit Bot Commands Reference

## PR Comment Commands

Post these as **issue comments** on the PR (not inline review comments):

| Command | Purpose |
|---------|---------|
| `@coderabbitai review` | Trigger incremental review (new changes only) |
| `@coderabbitai full review` | Complete review from scratch (all files) |
| `@coderabbitai resolve` | Resolve ALL CodeRabbit review comments at once |
| `@coderabbitai summary` | Regenerate PR summary |
| `@coderabbitai configuration` | Show current config |
| `@coderabbitai help` | Show all commands |
| `@coderabbitai pause` | Pause automatic reviews |
| `@coderabbitai resume` | Resume reviews |

## Behavior on New Push

- CodeRabbit auto-performs **incremental review** on each push
- Creates **new review comments** for issues in new diff
- May auto-resolve threads if the code changes address previous feedback
- Old threads on outdated diff hunks become "outdated" but may NOT auto-resolve

## Thread Resolution Strategy

**Preferred method**: Use GraphQL `resolveReviewThread` mutation (see github-graphql-api.md).

**Fallback method**: Post `@coderabbitai resolve` as a PR comment to resolve ALL threads at once. Use this only when you've verified all issues are actually fixed.

```bash
gh pr comment $PR_NUMBER --body "@coderabbitai resolve"
```

## Rate Limit Behavior

When CodeRabbit hits its API rate limit, it posts an **issue comment** on the PR instead of performing a review. The comment typically contains:
- The phrase "rate limit" or "rate-limited"
- A time estimate for when it will be available (e.g., "try again in 14 minutes", "available in approximately 20 minutes")

**Handling rate limits:**
1. After a CodeRabbit check run completes, check PR comments for rate limit messages
2. Extract the wait time from the comment
3. Wait for the specified duration (+ 30s buffer)
4. Post `@coderabbitai full review` to trigger a complete re-review

```bash
# Automated: use the wait-for-ratelimit.sh script
bash ~/.claude/skills/coderabbit-resolver/scripts/wait-for-ratelimit.sh $OWNER $REPO $PR_NUMBER

# Manual: post full review after rate limit expires
gh pr comment $PR_NUMBER --body "@coderabbitai full review"
```

**Why `full review` instead of `review`?**
- `review` only checks new changes (incremental)
- `full review` reviews all files from scratch — necessary after a rate limit gap to ensure nothing is missed

## Review Comment Structure

CodeRabbit comments follow this pattern:
- **Actionable comments**: Inline threads with specific code suggestions (fixable)
- **Nitpick comments**: Lower priority suggestions (prefix: `_🔧 Nitpick_`)
- **Outside diff comments**: Listed in review body, NOT as resolvable inline threads
- **Summary comment**: Overall review summary posted as issue comment

## Waiting for CodeRabbit Review

After pushing, CodeRabbit typically takes 30-120 seconds to post its review. Poll using:

```bash
# Check for CodeRabbit check run completion
HEAD_SHA=$(gh pr view $PR_NUMBER --json headRefOid -q .headRefOid)
gh api "repos/$OWNER/$REPO/commits/$HEAD_SHA/check-runs" \
  --jq '.check_runs[] | select(.name | test("coderabbit"; "i")) | .status'
```

Expected states: `queued` → `in_progress` → `completed`
