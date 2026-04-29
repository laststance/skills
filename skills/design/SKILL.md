---
name: design
description: Plan architect
argument-hint: "<target feature or system to design>"
---

# Design — Architecture-Driven Plan Creation

Create exhaustively detailed implementation plans by investigating the existing codebase,
researching web resources for optimal architecture and libraries, then refining through
multi-agent review loops until the plan is robust enough for any LLM to execute flawlessly.

## Behavioral Flow

1. **Analyze**: Examine target requirements and existing system context
2. **Plan**: Define design approach and structure based on type and format
3. **Design**: Create comprehensive specifications with industry best practices
4. **Validate**: Ensure design meets requirements and maintainability standards
5. **Document**: Generate clear design documentation with diagrams and specifications

Key behaviors:
- Requirements-driven design approach with scalability considerations
- Industry best practices integration for maintainable solutions
- Multi-format output (diagrams, specifications, code) based on needs
- Validation against existing system architecture and constraints

## Pipeline

```
/design [target]
  │
  Phase 1: Research ──────────── references/research-phase.md
  │  Codebase investigation (Serena) + Web research (Context7, Perplexity, Exa)
  │
  Phase 2: Architecture Design
  │  Optimal architecture + new library evaluation + Plan draft
  │
  Phase 3: Review Loop (max 5 rounds) ── references/review-loop.md
  │  3 parallel reviewers per round:
  │  ├─ Architecture Reviewer ──── references/architecture-reviewer.md
  │  ├─ Completeness Reviewer ──── references/completeness-reviewer.md
  │  └─ Feasibility Reviewer ───── references/feasibility-reviewer.md
  │  All 3 approved → Phase 4
  │
  Phase 4: Final Review ─────── references/final-reviewer.md
  │  Holistic coherence check across all tasks
  │
  Phase 5: Plan Output ──────── references/plan-format.md
     Save to docs/plans/YYYY-MM-DD-<target>-plan.md
     EnterPlanMode for user approval
```

## "Weakest LLM Proof" Principle

Every step in the Plan MUST be executable by the lowest-performing LLM without failure.

| Required | Example |
|----------|---------|
| Exact file paths | `src/auth/middleware.ts:45-67` |
| Complete code (no ellipsis) | Full copy-pasteable snippets |
| Exact commands + expected output | `pnpm test -- auth.test.ts` -> `Tests: 5 passed` |
| Dependency versions | `pnpm add zod@3.23.8` |
| Verification after every step | Run test / check output / confirm state |

| Forbidden | Use Instead |
|-----------|-------------|
| "Add appropriate validation" | Write the exact Zod schema |
| "As needed" / "if necessary" | State the condition explicitly, cover both cases |
| "etc." / "and so on" | Enumerate every item |
| "Similarly to X" | Write out the full step independently |

## Research Tools

| Tool | Purpose |
|------|---------|
| `mcp__serena__get_symbols_overview` | File structure, classes, functions |
| `mcp__serena__find_symbol` | Specific patterns and interface details |
| `mcp__serena__find_referencing_symbols` | Dependency graph |
| `mcp__context7__resolve-library-id` -> `query-docs` | Current + candidate library docs |
| `mcp__perplexity__perplexity_research` | Architecture best practices |
| `mcp__exa__web_search_exa` | Code examples, real-world implementations |

## Phase 2: Architecture Design

Based on Phase 1 research findings:
1. Identify optimal architecture for the target
2. Evaluate new libraries found in research (justified by evidence)
3. Draft Plan using the template in `references/plan-format.md`
4. Each Task = one logical unit, each Step = one atomic action (2-5 min)

## Phase 5: Plan Output

1. Save Plan to `docs/plans/YYYY-MM-DD-<target>-plan.md`
2. Call `EnterPlanMode` — write the complete Plan (not a summary)
3. Present to user:
   - Review History (rounds completed, final reviewer confidence)
   - Markdown file path
   - Execution options: parallel subagents (one per task) / sequential in-session / manual

## References

- `references/research-phase.md` — Codebase + web research procedures
- `references/plan-format.md` — Plan document template and task structure
- `references/review-loop.md` — 5-round parallel review orchestration
- `references/architecture-reviewer.md` — Design coherence reviewer prompt
- `references/completeness-reviewer.md` — Coverage and gap reviewer prompt
- `references/feasibility-reviewer.md` — Technical risk reviewer prompt
- `references/final-reviewer.md` — Holistic final reviewer prompt
