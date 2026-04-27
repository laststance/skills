# Workflow: PR Creation and CodeRabbit Review Loop

Push the feature branch, create a PR, and iterate the CodeRabbit review loop until merge.

<process>

## Step 1: Push and Create PR

### 1a. Push Feature Branch

```bash
BRANCH_NAME=$(git branch --show-current)
git push -u origin "$BRANCH_NAME"
```

### 1b. Create Pull Request

Build the PR body with all resolved issues:

```bash
gh pr create --title "feat: resolve bulk issues ($(date +%Y-%m-%d))" --body "$(cat <<'EOF'
## Summary

Bulk resolution of open GitHub issues on a single feature branch.

### Resolved Issues

- Closes #N — <title>
- Closes #N — <title>
- Closes #N — <title>

### Changes per Issue

#### Issue #N: <title>
- <change summary>
- Tests: unit + E2E + frontend verify

#### Issue #N: <title>
- <change summary>
- Tests: unit + E2E + frontend verify

## Verification

- [x] Lint passing
- [x] TypeCheck passing
- [x] Unit tests passing
- [x] E2E tests passing
- [x] Build successful
- [x] Frontend verification (screenshots captured per issue)
EOF
)"
```

Store the PR number:
```bash
PR_NUMBER=$(gh pr view --json number -q .number)
```

### 1c. Extract Owner/Repo

```bash
REMOTE_URL=$(git remote get-url origin)
OWNER=$(echo "$REMOTE_URL" | sed -n 's/.*github.com[:/]\([^/]*\)\/.*/\1/p')
REPO=$(echo "$REMOTE_URL" | sed -n 's/.*github.com[:/][^/]*\/\([^.]*\).*/\1/p')
```

---

## Step 2: Wait for Initial CodeRabbit Review

Poll for CodeRabbit review completion:

```bash
HEAD_SHA=$(gh pr view $PR_NUMBER --json headRefOid -q .headRefOid)
for i in $(seq 1 30); do
  STATUS=$(gh api "repos/$OWNER/$REPO/commits/$HEAD_SHA/check-runs" \
    --jq '.check_runs[] | select(.name | test("coderabbit"; "i")) | .status' 2>/dev/null)
  if [ "$STATUS" = "completed" ]; then break; fi
  sleep 10
done
```

---

## Step 3: Extract Unresolved CodeRabbit Threads

Query via GraphQL:

```bash
gh api graphql -f query='
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          comments(first: 3) {
            nodes {
              body
              author { login }
            }
          }
        }
      }
    }
  }
}' -F owner="$OWNER" -F repo="$REPO" -F pr="$PR_NUMBER"
```

Filter to: unresolved + CodeRabbit-authored threads.

If **zero unresolved threads** AND **all CI green** → skip to Step 8.

---

## Step 4: Fix Unresolved Issues

For each unresolved CodeRabbit comment:

1. Read the relevant source file
2. Understand the suggestion
3. Apply the fix (Edit tool)
4. Track in audit table:

| # | File | Issue | Status |
|---|------|-------|--------|
| 1 | path/file.ts | Description | FIXED |

---

## Step 5: Validate and Push

```bash
# Run full validation
pnpm lint && pnpm typecheck && pnpm test && pnpm build

# If E2E exists
pnpm test:e2e

# Commit and push
git add <specific-files>
git commit -m "$(cat <<'EOF'
fix: resolve CodeRabbit review findings

- <list of fixes>
EOF
)"
git push origin "$BRANCH_NAME"
```

---

## Step 6: Resolve Fixed Threads

Resolve each fixed thread via GraphQL mutation:

```bash
gh api graphql -f query='
mutation($threadId: ID!) {
  resolveReviewThread(input: {threadId: $threadId}) {
    thread { isResolved }
  }
}' -F threadId="$THREAD_ID"
```

**Only resolve threads you have actually fixed.** Do not blindly resolve all.

---

## Step 7: Wait for CI + Re-review

### 7a. Wait for CodeRabbit

Poll check-runs (same as Step 2). Wait for CodeRabbit to complete.

### 7b. Rate Limit Handling

Check if CodeRabbit posted a rate limit comment instead of reviewing:

Look for comments containing "rate limit" or "usage limit" from `coderabbitai`.
If detected:
1. Extract the reset time from the comment
2. Wait until reset time + 30 seconds buffer
3. Post: `gh pr comment $PR_NUMBER --body "@coderabbitai full review"`
4. Return to Step 7a

**Max rate limit retries: 3.** After 3, report to user and ask for guidance.

### 7c. Check CI Status

```bash
gh pr checks $PR_NUMBER
```

If any CI check fails:
1. Get failure details: `gh run view <run-id> --log-failed`
2. Investigate root cause
3. Fix, validate locally, commit + push
4. Return to Step 7a

**Max CI fix attempts: 3.** After 3, report to user.

---

## Step 8: Loop Check — Are We Done?

Re-query unresolved threads (Step 3).

- **New comments exist** → Go back to Step 3 (new iteration)
- **CI still failing** → Go back to Step 7c
- **Zero unresolved threads AND all CI green** → Proceed to Step 9

---

## Step 9: Merge

Verify all conditions before merging:

```bash
# Confirm mergeable
gh pr view $PR_NUMBER --json mergeable,mergeStateStatus

# Merge
gh pr merge $PR_NUMBER --merge --delete-branch
```

---

## Step 10: Cleanup

```bash
# Switch to main and pull
git checkout main
git pull origin main

# Prune remote tracking branches
git remote prune origin
```

### Verify Issue Closure

All issues should be auto-closed by `Closes #N` in the PR body.
Verify:

```bash
for ISSUE_NUM in <list-of-issue-numbers>; do
  gh issue view $ISSUE_NUM --json state -q .state
done
```

If any remain open, close manually:
```bash
gh issue close $ISSUE_NUM --comment "Resolved in PR #$PR_NUMBER"
```

---

## Step 11: Final Report

Present summary to user:

```
## Bulk Issues Complete

| Issue | Title | Commit | Status |
|-------|-------|--------|--------|
| #7 | Add Mermaid to code-trace | abc1234 | RESOLVED |
| #9 | Write blog post | def5678 | RESOLVED |
| #10 | Migrate SC Commands | ghi9012 | RESOLVED |

**PR**: #<PR_NUMBER> — MERGED
**CodeRabbit iterations**: N
**Total commits**: M
```

</process>

<success_criteria>
PR review workflow is complete when:
- [ ] PR created with all `Closes #N` references
- [ ] All CodeRabbit review threads resolved (zero unresolved)
- [ ] All CI checks passing (green)
- [ ] PR merged successfully
- [ ] Feature branch deleted (remote + local)
- [ ] All linked issues confirmed closed
- [ ] Final summary report presented to user
</success_criteria>
