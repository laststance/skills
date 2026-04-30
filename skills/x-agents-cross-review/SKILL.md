---
name: x-agents-cross-review
description: Cross-review
---

# X-Agents Cross-Review

Launch X parallel agents to independently review the same scope from different perspectives. Each agent gets full tool access, the highest-performance model, and maximum thinking time.

<essential_principles>

## Core Rules

1. **No scope splitting** — Every agent reviews the FULL scope independently
2. **Different perspectives** — Each agent gets a unique review lens (see [perspectives library](references/perspectives.md))
3. **+1 Philosophy** — When X is not specified, auto-determine optimal count + 1 (the last agent often catches what others miss)
4. **Unified report** — Consolidate all results into a single report with consensus analysis

</essential_principles>

## Phase 1: Context Gathering

1. Parse the review target from user input (code, spec, PR, etc.)
2. Gather the source material:
   - **Notion spec** → `mcp__claude_ai_Notion__notion-fetch`
   - **OpenAPI spec** → `mcp__zumen-api-docs__read_project_oas_*` or `curl` to file
   - **Code** → `git diff dev --name-only` for changed files
   - **PR** → `gh pr view` for PR description and diff
3. Determine agent count:
   - If user specifies X → use X
   - If not specified → estimate based on scope complexity + 1

| Scope Size | Base Agents | +1 | Total |
|------------|-------------|-----|-------|
| Small (1-3 files, single concern) | 3 | +1 | 4 |
| Medium (4-10 files, multi-concern) | 5 | +1 | 6 |
| Large (10+ files, cross-cutting) | 8 | +1 | 9 |
| Critical (production deploy, security) | 10 | +1 | 11 |

## Phase 2: Perspective Assignment

Assign perspectives from the [perspectives library](references/perspectives.md). Rules:

- **First agent** = Baseline (全要件網羅)
- **Last agent** = Devil's Advocate (隠れたリスク・仕様の曖昧さ)
- **Middle agents** = Domain-specific lenses from the library
- Never assign the same perspective twice
- Match perspectives to the review target (e.g., i18n perspective only if i18n is involved)

## Phase 3: Agent Launch

Launch ALL agents in a **single message** (parallel execution). Each agent config:

```
Agent(
  name: "reviewer-{NN}-{perspective-slug}",
  model: "opus",
  mode: "bypassPermissions",
  run_in_background: true,
  prompt: <constructed from template below>
)
```

### Agent Prompt Template

```
## Task: {review_type} (Reviewer #{N}/{total} — {perspective_name})

{context_material}

### Review Scope
{file_list_or_spec}

### Instructions
- Use Serena tools for code reading (find_symbol, get_symbols_overview, search_for_pattern)
- Use mcp__sequential-thinking__sequentialthinking for step-by-step analysis
- Use Context7 for library documentation when needed
- Review ALL items in scope from your perspective: {perspective_description}

### Requirements Checklist
{requirements_list}

### Output Format
## Reviewer #{N}: {perspective_name}
### Requirements Status
| # | Requirement | Status | Evidence |
...
### ISSUES FOUND
- [severity: CRITICAL/HIGH/MEDIUM/LOW] [location]: [description]
### OBSERVATIONS
### Summary
[1-2 sentence assessment]
```

## Phase 4: Progress Tracking

Report progress as agents complete:
- `**#N 完了** ({perspective}) — {brief_summary}. 残り M/{total} ⏳`

## Phase 5: Unified Report

After ALL agents complete, produce:

### Report Structure

```markdown
## X重レビュー統合レポート — {target}

### 全体判定: {PASS/FAIL} (CRITICAL N件)

### 要件別コンセンサス
| # | Requirement | Verdict | Reviewers |
(items where multiple reviewers agree)

### コンセンサス発見 (複数レビュアー一致)
| # | Finding | Severity | Reviewers | Fix |
(sorted by reviewer count, then severity)

### 単独発見 (1レビュアーのみ)
| # | Finding | Severity | Reviewer | Note |

### PASS 項目サマリー

### Insight
(What the multi-review approach uniquely uncovered)
```

### Consolidation Rules

1. **Consensus = 2+ reviewers** flagging the same issue → elevate severity
2. **Unique findings** from single reviewer → keep original severity
3. **Pre-existing patterns** (not regressions) → note as "既存パターン"
4. **BE-scope items** → mark as "NOT FE SCOPE" / "BE確認事項"
5. Deduplicate identical findings, credit all discovering reviewers

## References

- [Perspectives Library](references/perspectives.md) — Review lens catalog
