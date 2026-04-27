---
name: issue
description: |
  Creates issues on the project's tracker (GitHub Issues or Linear) and lists open issues.
  Auto-detects which tracker the project uses.

  Use when:
  - User says "/issue <description>" to create a new issue
  - User says "/issue list" to view open issues
  - User wants to file a bug, feature request, or task as an issue

  Keywords: issue, bug, feature request, ticket, create issue, list issues, open issues
argument-hint: "<description> | list [--assignee me] [--label bug]"
---

# Issue — Create & List Project Issues

Create issues or list open ones. Auto-detects the project's issue tracker.

## Argument Parsing

| Input | Action |
|-------|--------|
| `/issue list` | List open issues |
| `/issue list --assignee me` | List my open issues |
| `/issue list --label <label>` | Filter by label |
| `/issue <any other text>` | Create issue with that text as title/description |

## Step 1: Detect Tracker

Determine which tracker this project uses. Check in order:

1. **CLAUDE.md** — look for explicit mention of "Linear" or "GitHub Issues"
2. **Linear MCP** — if `mcp__claude_ai_Linear__list_teams` is available, check if the project has a Linear team
3. **GitHub** (default) — if in a git repo with `gh` CLI available

Once detected, remember the tracker for the rest of the conversation.

## Step 2A: Create Issue

### 2A.1 Classify Issue Type (required before body generation)

Classify the user's input into ONE of:

| Type | Signals | Body policy |
|------|---------|-------------|
| **Feature request** | "add", "want", "wish", "could we", "〜したい", "〜が欲しい", new capability | **Strict**: non-engineer voice only (see 2A.2) |
| **Bug** | "broken", "doesn't work", "error", "regression", "crash", "〜が動かない" | Reproduction-focused (see 2A.3) |
| **Task** | refactor, chore, internal work, infra, "clean up", "migrate" | Flexible; technical context allowed |

If ambiguous, default to **Feature request** (safer — stays user-facing) or ask the user.

Apply the matching label automatically when the tracker supports it (`enhancement`, `bug`, `task`).

### 2A.2 Feature Request Body (non-engineer voice)

Feature requests describe **WHAT** the user wants and **WHY** — never **HOW**.
Technical design is deferred to the engineer who picks up the issue (they run `/plan-eng-review` or similar).

**MUST NOT include** (reject and rewrite if present in user input):
- Tech stack names (React, Next.js, Postgres, Redis, library versions, framework APIs)
- Implementation approach (architecture, patterns, algorithms, data structures)
- Code snippets, file paths, function/class names, API signatures
- Performance numbers or internals ("O(n)", "use a hash map", "index this column")
- DB schema, migration plans, endpoint designs

**MUST include**:
- **Problem / Motivation** — 1–2 plain-language sentences on the user-facing pain or desired outcome
- **Acceptance Criteria** — checkbox list of observable, testable behaviors phrased as "user can X" / "system shows Y" (no implementation verbs like "implement", "refactor", "add API")

**Template** (embed verbatim in the issue body):

```markdown
## Problem / Motivation
<1–2 sentences, user-facing. No tech terms.>

## Acceptance Criteria
- [ ] <observable behavior 1>
- [ ] <observable behavior 2>
- [ ] <observable behavior 3>

## Examples (optional)
<user-story-style scenarios, plain language>

---
_Technical design & implementation plan will be produced at pickup time via `/plan-eng-review`._
```

**Rewrite rule**: if the user's raw input contains technical terms, translate them into user-facing outcomes before writing the body. E.g., "add a Redis cache for session lookups" → "Problem: login feels slow on repeat visits. AC: returning users see their home screen within 1 second."

See [references/feature-request-policy.md](references/feature-request-policy.md) for more examples and edge cases.

### 2A.3 Bug / Task Body

- **Bug**: include steps to reproduce, expected vs actual, environment (OS/browser/version). Technical detail encouraged.
- **Task**: short goal statement + scope notes. Technical context allowed since this is internal work.

### 2A.4 Submit to Tracker

#### GitHub (default)

```bash
gh issue create --title "<title>" --body "<body>" --label "<type-label>"
```

- Parse user input: first sentence → title, rest → body
- For feature requests, rewrite the title in user-facing language ("Users can export data as CSV" — not "Implement CSV export handler")
- Return the issue URL

#### Linear

Use `mcp__claude_ai_Linear__save_issue`:
- `title`: user-facing phrasing for feature requests
- `description`: the templated body from 2A.2 / 2A.3
- `team`: auto-detect from `mcp__claude_ai_Linear__list_teams` (use first team, or ask if multiple)
- `labels`: apply `Feature` / `Bug` / `Task` based on classification
- Return the issue identifier (e.g., `LIN-123`)

## Step 2B: List Issues

### GitHub

```bash
gh issue list --state open --limit 20 --json number,title,url,body,labels
```

Display as table:

```
| # | Title | Labels | URL |
|---|-------|--------|-----|
```

Include a 1-line summary (first 80 chars of body) for each.

### Linear

Use `mcp__claude_ai_Linear__list_issues` with `state: "started"` or unfiltered for all active.
Pass `--assignee` and `--label` filters if provided.

Display: identifier, title, state, URL.

## Output Format

### After Creating

```
Issue created: <URL or identifier>
Title: <title>
```

### After Listing

Render a markdown table with columns: **#/ID**, **Title**, **Summary**, **URL**

Keep summary to ~80 chars. Truncate with `...` if longer.

## References

- [Tracker detection details](references/tracker-detection.md)
- [Feature request body policy (anti-patterns & rewrite examples)](references/feature-request-policy.md)
