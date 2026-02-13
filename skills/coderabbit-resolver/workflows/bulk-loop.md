# Workflow: Bulk PR Processing

<required_reading>
**Read these before proceeding:**
1. workflows/review-loop.md (the single-PR workflow this builds upon)
2. references/github-graphql-api.md
3. references/coderabbit-commands.md
</required_reading>

<process>

## Step 0: List All Open PRs

Fetch all open PRs sorted by creation date (oldest first):

```bash
REMOTE_URL=$(git remote get-url origin)
OWNER=$(echo "$REMOTE_URL" | sed -n 's/.*github.com[:/]\([^/]*\)\/.*/\1/p')
REPO=$(echo "$REMOTE_URL" | sed -n 's/.*github.com[:/][^/]*\/\([^.]*\).*/\1/p')

gh pr list --state open --json number,title,createdAt \
  --jq 'sort_by(.createdAt) | .[] | "\(.number)\t\(.title)\t\(.createdAt)"'
```

If no open PRs exist, report to user and exit.

Store the PR list. Initialize the results tracker:
```
RESULTS=()  # Array of "PR_NUMBER|TITLE|RESULT|REASON"
```

## Step 1: Process Each PR (Oldest First)

For each PR in the sorted list:

### 1a. Checkout PR Branch

```bash
# Always return to main before switching to next PR
git checkout main
git pull origin main

# Checkout the PR branch
gh pr checkout $PR_NUMBER
```

### 1b. Execute review-loop.md

Run the **full** `review-loop.md` workflow for this PR. This includes:
- Extracting and fixing CodeRabbit review comments
- Running validation
- Committing and pushing fixes
- Resolving threads
- **Fixing CI failures** (Step 6c — even if unrelated to PR)
- Waiting for CI + re-review
- Merging on success

### 1c. Record Result

After `review-loop.md` completes for this PR:

- **Success (merged):** Record as `MERGED`
- **Failure (CI fix attempts exhausted):** Record as `SKIPPED` with reason
  - Return to main: `git checkout main && git pull origin main`
  - Move to next PR

**IMPORTANT:** Do not stop the bulk loop on a single PR failure. Skip and continue.

## Step 2: Summary Report

After all PRs have been processed, generate and display the results:

```
## Bulk Processing Complete

| PR | Title | Result | Notes |
|----|-------|--------|-------|
| #12 | Add auth middleware | MERGED | |
| #15 | Fix date parsing | MERGED | |
| #18 | Update deps | SKIPPED | CI failure after 3 attempts (test-e2e) |

**Total: 2 merged, 1 skipped**
```

Report to user with the full summary table.

</process>

<error_handling>

### PR Checkout Failure
If `gh pr checkout` fails (merge conflicts, deleted branch, etc.):
- Record as `SKIPPED` with reason
- Continue to next PR

### CI Fix Limit
Max CI fix attempts per PR: **3** (inherited from review-loop.md Step 6c).
After 3 failed attempts, skip the PR.

### CodeRabbit Rate Limit
If CodeRabbit is rate-limited (detected by `wait-for-ratelimit.sh`):
- The script handles waiting and triggering `@coderabbitai full review` automatically
- Max 3 rate limit retries per PR. After 3 retries, record as `SKIPPED (CodeRabbit rate limit)`

### Network/API Errors
If GitHub API is unreachable or rate-limited:
- Wait 60 seconds, retry once
- If still failing, pause and report to user

### Merge Conflicts After Previous PR Merge
After merging PR N, PR N+1 may now have conflicts:
- Attempt `git merge main` on the PR branch to incorporate changes
- If conflicts are auto-resolvable, resolve and push
- If manual resolution needed, record as `SKIPPED (merge conflict)`

</error_handling>

<success_criteria>
This workflow is complete when:
- [ ] All open PRs have been processed (attempted)
- [ ] Each PR is either MERGED or SKIPPED with documented reason
- [ ] Summary report displayed to user
- [ ] Working directory is clean on main branch
</success_criteria>
