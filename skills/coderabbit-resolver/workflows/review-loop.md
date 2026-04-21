# Workflow: CodeRabbit Review-Fix-Resolve Loop

<required_reading>
**Read these reference files NOW:**
1. references/github-graphql-api.md
2. references/coderabbit-commands.md
</required_reading>

<process>

## Step 0: Setup

Extract owner/repo from git remote and determine PR number:

```bash
# Get owner and repo
REMOTE_URL=$(git remote get-url origin)
OWNER=$(echo "$REMOTE_URL" | sed -n 's/.*github.com[:/]\([^/]*\)\/.*/\1/p')
REPO=$(echo "$REMOTE_URL" | sed -n 's/.*github.com[:/][^/]*\/\([^.]*\).*/\1/p')

# PR number from argument or auto-detect
PR_NUMBER=${1:-$(gh pr view --json number -q .number)}
```

Store these as session variables. Use them in all subsequent commands.

## Step 1: Extract All CodeRabbit Review Comments

### 1a. Get Unresolved Inline Threads

Run the GraphQL query from `references/github-graphql-api.md` to get all review threads. Filter to unresolved CodeRabbit threads:

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

Parse the result with python3 or jq. Categorize threads:
- **Unresolved + CodeRabbit-authored** → needs action
- **Already resolved** → skip
- **Outdated** → verify if still relevant

### 1b. Get Review Body Comments (Outside-Diff)

```bash
gh api repos/$OWNER/$REPO/pulls/$PR_NUMBER/reviews \
  --jq '.[] | select(.user.login == "coderabbitai") | {id, body}'
```

Parse review bodies for "outside diff" items. These are NOT inline threads — they appear in the review summary and must be addressed by reading the referenced code.

### 1c. Build Audit Table

Create a structured audit of ALL comments with status:

| # | File | Issue | Severity | Status |
|---|------|-------|----------|--------|
| 1 | path/file.ts | Description | Critical/Minor/Nitpick | FIXED/NOT_FIXED/SKIPPED |

Read the current source files to verify which comments are already addressed.

## Step 2: Fix Unresolved Issues

For each NOT_FIXED item:

1. **Read** the relevant source file
2. **Understand** the CodeRabbit suggestion
3. **Apply** the fix using Edit tool
4. **Update** the audit table status to FIXED

**Priority order**: Critical → Minor → Nitpick (skip nitpicks if low value)

## Step 3: Validate

Run project validation before committing:

```bash
pnpm validate
```

If validation fails, fix the issues before proceeding. Do NOT push broken code.

## Step 4: Commit and Push

```bash
git add <specific-files>
git commit -m "fix: resolve CodeRabbit review findings

- <list of fixes applied>"
git push origin <branch>
```

## Step 5: Resolve Fixed Threads

After pushing, resolve all threads for issues that have been fixed.

Run the resolve script:
```bash
bash ~/.claude/skills/coderabbit-resolver/scripts/resolve-threads.sh $OWNER $REPO $PR_NUMBER
```

Or resolve manually with the GraphQL mutation for each thread ID.

**Important**: Only resolve threads you have actually fixed. Do NOT blindly resolve all threads.

## Step 6: Wait for CI and CodeRabbit Re-review

### 6a. Wait for CodeRabbit Review (HEAD-gated)

Use the script — it polls internally with bounded iterations:

```bash
bash ~/.claude/skills/coderabbit-resolver/scripts/check-ci-status.sh $OWNER $REPO $PR_NUMBER
```

Treat this script as a hard merge gate. It must confirm all of the following on `HEAD_SHA`:
- At least one CodeRabbit check run exists
- CodeRabbit check run is `completed` with `success`
- No failing checks remain

**DO NOT** write a top-level `for i in seq ...; do ...; sleep 10; done` polling loop as a Bash command. Claude Code's Bash policy blocks long leading `sleep` and chained sleeps. The script wraps its `sleep` calls so the entire poll runs as a single Bash invocation — that's the only safe form here. If you need to wait without a script, see Step 6d below.

### 6b. Check for Rate Limit and Trigger Full Review

After CodeRabbit's check run completes, check whether CodeRabbit posted a rate limit comment instead of an actual review. Run:

```bash
bash ~/.claude/skills/coderabbit-resolver/scripts/wait-for-ratelimit.sh $OWNER $REPO $PR_NUMBER
```

**Exit code handling:**
- **Exit 0** — Rate limit was detected. The script waited for expiry and posted `@coderabbitai full review`. **Go back to Step 6a** to wait for the new review to complete.
- **Exit 1** — No rate limit found. Continue to Step 6c (normal flow).
- **Exit 2** — Error occurred. Report to user.

**IMPORTANT:** Max rate limit retry: **3 times**. If CodeRabbit is still rate-limited after 3 cycles, report to user and ask for guidance (single PR mode) or mark as SKIPPED (bulk mode).

### 6c. Check All CI Status

```bash
gh pr checks $PR_NUMBER
```

Report the CI results to the user.

### 6d. Wait Without a Script Wrapper — Use ScheduleWakeup

Sometimes you need to wait at the top level — e.g., the check-run completed but CodeRabbit hasn't posted its review comments yet (typically a 30-180s gap), or you want to give the rate-limit window extra slack beyond what the script handles. In those cases **use `ScheduleWakeup`, never a top-level `sleep`**.

```
ScheduleWakeup({
  delaySeconds: 270,  // <300s keeps the prompt cache warm
  reason: "waiting for CodeRabbit to post review comments after check-run completed",
  prompt: "Continue /coderabbit-resolver workflow on PR #<number>. Re-query unresolved threads (Step 1a) and check for new CodeRabbit comments since <ISO-timestamp>. If new actionable comments exist, restart from Step 1. Otherwise proceed to Step 7 (Loop Check)."
})
```

**Picking `delaySeconds`:**
- `60–270` for short waits (CodeRabbit comment posting, retry after transient failure) — stays inside the 5-minute prompt cache TTL
- `1200–1800` for genuinely idle waits (long rate-limit windows, scheduled re-review) — pays one cache miss but amortizes it
- **Avoid `300`** — worst-of-both: cache miss without amortization

**Why this matters:** A top-level `sleep 180; gh api ...` is rejected by Bash policy. Even chaining shorter sleeps (`sleep 60; sleep 60; sleep 60`) is blocked. `ScheduleWakeup` releases the session entirely and re-enters the workflow at the right moment with the right context.

### 6e. Fix CI Failures (Even If Unrelated to PR)

If any CI check fails:

1. **Get failed check details:**
```bash
gh pr checks $PR_NUMBER
HEAD_SHA=$(gh pr view $PR_NUMBER --json headRefOid -q .headRefOid)
gh api "repos/$OWNER/$REPO/commits/$HEAD_SHA/check-runs" \
  --jq '.check_runs[] | select(.conclusion == "failure") | {name, output: .output.summary}'
```

2. **Investigate failure logs** — use `gh run view <run-id> --log-failed` to get detailed output

3. **Identify root cause** — may be:
   - Flaky test → rerun or fix
   - Dependency issue → update lockfile
   - Unrelated code breakage → fix the code
   - Type/lint error → fix regardless of PR scope

4. **Apply fix**, run local validation (`pnpm validate`)

5. **Commit** with message: `fix: resolve CI failure (<check-name>)`

6. **Push and re-check CI** (loop back to Step 6a, which includes the rate limit check at 6b)

**IMPORTANT:** Do NOT skip CI failures. Fix them even if unrelated to PR content.
Max CI fix attempts per PR: **3**. If still failing after 3 attempts, report to user and mark as SKIPPED (in bulk mode) or ask for guidance (in single PR mode).

## Step 7: Loop Check — Are We Done?

Query unresolved threads again (Step 1a). If CodeRabbit posted **new** review comments OR CI is still failing OR CodeRabbit check is not `completed+success` on HEAD:

- **New comments exist** → Go back to Step 1 (new iteration)
- **CI still failing** → Go back to Step 6e (CI fix iteration)
- **CodeRabbit not completed+success on HEAD** → Go back to Step 6a
- **No unresolved threads AND all CI green AND CodeRabbit completed+success on HEAD** → Proceed to Step 8

## Step 8: Final Verification

Before merging, verify ALL conditions:

```bash
# 1. Zero unresolved CodeRabbit threads
UNRESOLVED=$(gh api graphql -f query='...' | jq '[...] | length')
echo "Unresolved threads: $UNRESOLVED"

# 2. All CI checks passing
gh pr checks $PR_NUMBER

# 3. CodeRabbit completed+success on HEAD (hard gate)
bash ~/.claude/skills/coderabbit-resolver/scripts/check-ci-status.sh $OWNER $REPO $PR_NUMBER 180

# 4. PR is mergeable
gh pr view $PR_NUMBER --json mergeable,mergeStateStatus
```

**ALL four must be satisfied before merging.**

## Step 9: Merge

```bash
gh pr merge $PR_NUMBER --merge --delete-branch
```

Use `--merge` (merge commit) by default. Use `--squash` if the project prefers squash merges.

## Step 10: Local Cleanup

```bash
# Switch to main and pull
git checkout main
git pull origin main

# Delete local feature branch
git branch -d <branch-name>

# Prune remote tracking branches
git remote prune origin
```

</process>

<success_criteria>
This workflow is complete when:
- [ ] All CodeRabbit inline threads resolved (zero unresolved)
- [ ] All "outside diff" review body items addressed
- [ ] All CI checks passing (green)
- [ ] CodeRabbit check status is "completed"
- [ ] PR merged successfully
- [ ] Remote branch deleted (via --delete-branch)
- [ ] Local branch cleaned up
- [ ] User informed of final status
</success_criteria>
