# GitHub GraphQL API Reference for Thread Resolution

## Query: Get All Review Threads

```bash
OWNER="<owner>"
REPO="<repo>"
PR_NUMBER=<number>

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
              databaseId
            }
          }
        }
      }
    }
  }
}' -F owner="$OWNER" -F repo="$REPO" -F pr="$PR_NUMBER"
```

## Filter: Unresolved CodeRabbit Threads Only

```bash
gh api graphql -f query='...' | jq '
  .data.repository.pullRequest.reviewThreads.nodes
  | map(select(.isResolved == false))
  | map(select(.comments.nodes[0].author.login == "coderabbitai" or .comments.nodes[0].author.login == "coderabbitai[bot]"))
'
```

## Mutation: Resolve a Thread

```bash
THREAD_ID="PRRT_kwDOxxxxxxxxx"

gh api graphql -f query='
mutation($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { id isResolved }
  }
}' -f threadId="$THREAD_ID"
```

**Key facts:**
- Thread IDs use `PRRT_` prefix (PullRequestReviewThread node ID)
- GraphQL only — no REST API equivalent exists
- Mutation is idempotent — calling on already-resolved thread is safe (no error)
- Requires write access to the repository

## Query: Get Review Bodies (Outside-Diff Comments)

Outside-diff findings are embedded in `PullRequestReview.body`, not resolvable inline threads. The `/issues/{pr}/comments` endpoint used for walkthrough/rate-limit comments does not return these review bodies.

Fetch **all pages** and accept both CodeRabbit login forms. REST responses commonly use `coderabbitai[bot]`; matching only `coderabbitai` silently drops those reviews. Keep the source URL and reviewed commit for the audit:

```bash
gh api "repos/$OWNER/$REPO/pulls/$PR_NUMBER/reviews?per_page=100" --paginate \
  --jq '.[]
    | select(.user.login == "coderabbitai" or .user.login == "coderabbitai[bot]")
    | {id, html_url, commit_id, submitted_at, state, body}'
```

Read every returned body for outside-diff findings, including collapsed HTML details and repeated AI prompt sections. Do not filter to the latest review, current-HEAD reviews, or a particular review state: older findings remain relevant until checked against current code, even after an approval or a later review with no new comments. Preserve `cr-comment` markers when present to identify duplicate appearances of the same finding.

An API failure is not an empty review history. If no CodeRabbit reviews are returned despite a known review URL or completed review, investigate the repository, pagination, and author filtering before declaring the audit clean.

## Check CI Status

```bash
# All checks including CodeRabbit
gh pr checks $PR_NUMBER

# Specifically CodeRabbit check
HEAD_SHA=$(gh pr view $PR_NUMBER --json headRefOid -q .headRefOid)
gh api "repos/$OWNER/$REPO/commits/$HEAD_SHA/check-runs" \
  --jq '.check_runs[] | select(.name | test("coderabbit"; "i")) | {name, status, conclusion}'
```

## Check Merge Requirements

```bash
gh pr view $PR_NUMBER --json mergeable,mergeStateStatus \
  --jq '{mergeable, mergeStateStatus}'
```
