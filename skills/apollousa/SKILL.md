---
name: apollousa
description: "Create a GitHub PR for completed work, then run coderabbit-resolver through review, CI, merge, and cleanup. Use when: the user asks for PR creation followed by CodeRabbit resolution. Keywords: create PR, CodeRabbit, merge."
argument-hint: "[base-branch]"
---

# Apollousa

Create the PR, then hand it directly to `coderabbit-resolver`.

1. Read the repository instructions and verify `pwd`, Git status, current branch, default branch, remote, and existing PR state.
2. Run the repository's required validation before pushing. Never push a broken or dirty result.
3. If currently on the default branch, create a descriptive feature branch at the completed commit. Otherwise reuse the current feature branch.
4. Push the feature branch and create a non-draft PR with a concise summary and test plan. Reuse an existing PR for the branch instead of duplicating it.
5. Invoke the installed `coderabbit-resolver` skill with the PR number and follow its single-PR workflow through CodeRabbit findings, CI, merge, and branch cleanup.
6. Report the PR URL, merge result, final checks, and clean local branch state.

Do not stop after PR creation. Completion means the invoked `coderabbit-resolver` workflow has reached its own success criteria or reported a genuine blocker.
