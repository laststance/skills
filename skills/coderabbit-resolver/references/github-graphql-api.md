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
  | map(select(.comments.nodes[0].author.login == "coderabbitai"))
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

Review bodies contain "outside diff" comments that aren't inline threads. Extract them:

```bash
gh api repos/$OWNER/$REPO/pulls/$PR_NUMBER/reviews \
  --jq '.[] | select(.user.login == "coderabbitai") | {id: .id, body: .body}'
```

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
