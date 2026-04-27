# Workflow: Issue Triage

Collect all open issues, analyze dependencies, determine processing order, and set up the workspace.

<process>

## Step 0: Collect Open Issues

Fetch all open issues with full metadata:

```bash
REMOTE_URL=$(git remote get-url origin)
OWNER=$(echo "$REMOTE_URL" | sed -n 's/.*github.com[:/]\([^/]*\)\/.*/\1/p')
REPO=$(echo "$REMOTE_URL" | sed -n 's/.*github.com[:/][^/]*\/\([^.]*\).*/\1/p')

gh issue list --state open --json number,title,body,labels,assignees,createdAt \
  --jq 'sort_by(.createdAt) | .[]'
```

If `--repo` argument was provided, use that instead of auto-detection.

If **no open issues** exist, report to user and exit.

## Step 1: Analyze Each Issue

For each issue, extract:
- Core requirement (what needs to change)
- Affected files/components (from issue body, labels)
- Dependencies on other issues (mentions of `#N`, "depends on", "after")
- Type: `feat` / `fix` / `refactor` / `docs` / `chore`
- Estimated complexity: small / medium / large

## Step 2: Determine Optimal Order

Apply these ordering rules (highest priority first):

| Priority | Rule | Rationale |
|----------|------|-----------|
| 1 | Dependency-first | If issue B depends on A's changes, A goes first |
| 2 | Infrastructure/config before features | Foundation must exist before features |
| 3 | Smaller/foundational before larger | Reduce merge conflicts within branch |
| 4 | Fixes before features | Stabilize before extending |
| 5 | Original creation order | Tiebreaker |

Build a dependency graph. If circular dependencies exist, flag to user.

## Step 3: Present Plan to User

Present the proposed order with rationale using `AskUserQuestion`:

```
## Proposed Issue Processing Order

| Order | Issue | Title | Type | Complexity | Reason |
|-------|-------|-------|------|------------|--------|
| 1 | #7 | Add Mermaid to code-trace | feat | medium | No dependencies |
| 2 | #9 | Write blog post | docs | small | Independent |
| 3 | #10 | Migrate SC Commands | refactor | large | May affect other issues |

Proceed with this order?
```

Options: "Approve order" / "Customize order" (let user rearrange)

If user customizes, update the order accordingly.

## Step 4: Create Feature Branch

```bash
BRANCH_NAME="feat/bulk-issues-$(date +%Y%m%d)"
git checkout main
git pull origin main
git checkout -b "$BRANCH_NAME"
```

## Step 5: Register All Issues in TodoWrite

Create top-level TODO entries for all issues in the approved order:

```
TodoWrite:
  - "[Issue #7] Add Mermaid to code-trace" — pending
  - "[Issue #9] Write blog post" — pending
  - "[Issue #10] Migrate SC Commands" — pending
```

Each entry should include the issue number, title, and type.

## Step 6: Proceed

**Read and execute `workflows/issue-task-loop.md` with the ordered issue list.**

</process>

<success_criteria>
Triage is complete when:
- [ ] All open issues collected and analyzed
- [ ] Processing order determined and approved by user
- [ ] Feature branch created from latest main
- [ ] All issues registered in TodoWrite (top-level)
- [ ] Ready to begin per-issue task loop
</success_criteria>
