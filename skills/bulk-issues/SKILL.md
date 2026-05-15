---
name: bulk-issues
description: Bulk issue fix
argument-hint: "[--repo owner/repo]"
---

# Bulk Issues — Resolve All Open Issues in One Branch

## Codex Compatibility
When running this skill in Codex, translate Claude Code-only primitives before acting: `AskUserQuestion` -> chat/request_user_input, `TodoWrite` -> `update_plan`, `Task`/`TaskCreate`/`TeamCreate`/`SendMessage` -> `spawn_agent`/`send_input`/`wait_agent` when available and allowed, and `EnterPlanMode`/`ExitPlanMode` -> a concise chat plan plus explicit approval.
Resolve `Read`/`Write`/`Edit`/`Bash`/`WebSearch`/`WebFetch` to Codex file/shell/web tools, and map `~/.claude/...` paths to `~/.agents/...` or `~/.codex/...` unless the task explicitly targets Claude Code.

## Cursor Compatibility
When running this skill in Cursor Agent, translate Claude Code-only primitives before acting: `AskUserQuestion` -> `AskQuestion`; `TodoWrite` -> Cursor `TodoWrite` or an equivalent checklist; `Task`/`TaskCreate`/`TeamCreate`/`SendMessage`/multi-agent flows -> Cursor `Task` (subagents), parallel Tasks, or `run_in_background` when allowed (`TeamCreate`/`SendMessage` may have no exact match); `EnterPlanMode`/`ExitPlanMode` -> Plan mode (`SwitchMode` / `CreatePlan`) plus explicit user approval.
Resolve `Read`/`Write`/`Edit`/`StrReplace`/`Bash`/web/search/MCP via Cursor Composer or Agent equivalents. MCP names written as `mcp__server__tool` typically map to `call_mcp_tool` with configured server identifiers. Map `~/.claude/...` to `~/.cursor/skills/`, `.cursor/skills/`, and `.cursor/rules/` unless the task explicitly targets Claude Code.


Processes every open GitHub Issue through the full task workflow, accumulates commits
on a single feature branch, creates a PR, and iterates the CodeRabbit review loop until merge.

<essential_principles>

## Principle 1: Single Feature Branch Strategy

All issues are resolved on **one branch**: `feat/bulk-issues-YYYYMMDD`.
Each issue gets its own commit (`fix/feat: resolve #N — <summary>`).
Push happens **once** after all issues are implemented — not per issue.

## Principle 2: Full Task Flow Per Issue

Each issue receives the **exact same 5-phase treatment** as `/task`:

```
[Investigate] → 🔶 info gate
     ↓
  [Plan] → 🔶 info gate
     ↓
[Implement] → 🔶 adherence gate (per edit)
     ↓
 [Verify] → 🔶 completion gate
     ↓
[Complete] → commit (no push)
```

Never skip phases. Never combine issues into one phase.

## Principle 3: Mandatory Quality Gates (No Exceptions)

Unlike `/task` where `--frontend-verify` is optional, **ALL verification is mandatory here**:

| Gate | Required | Tool |
|------|----------|------|
| Lint + Typecheck | Always | `pnpm lint && pnpm typecheck` |
| Unit tests | Always | `pnpm test` |
| E2E tests | Always | `pnpm test:e2e` or project equivalent |
| Build | Always | `pnpm build` |
| Frontend verify | Always | Auto-detect platform → screenshot → validate |

If any gate fails → return to Phase 3 (Implement) and fix.

## Principle 4: Serena Think Checkpoints

Same three mandatory checkpoints as the task skill:

| Checkpoint | Tool | When |
|------------|------|------|
| Information Gate | `mcp__serena__think_about_collected_information` | After Investigate and Plan |
| Adherence Gate | `mcp__serena__think_about_task_adherence` | Before each code edit |
| Completion Gate | `mcp__serena__think_about_whether_you_are_done` | Before exiting Verify |

## Principle 5: TodoWrite Hierarchy

Two tiers of TODO management:

| Level | Content | When |
|-------|---------|------|
| **Top-level** | All issues as TODO items | Set up during triage |
| **Per-issue** | Implementation sub-tasks | Created at each issue's Plan phase |

When entering an issue: register its sub-tasks via TodoWrite.
When completing an issue: mark top-level TODO complete, then start next issue fresh.

## Principle 6: Post-PR CodeRabbit Loop

After PR creation, enter the iterative review-fix-resolve loop:
1. Extract unresolved CodeRabbit threads (GraphQL)
2. Fix code → validate → commit → push
3. Resolve threads (GraphQL mutation)
4. Wait for CI + re-review
5. Repeat until: 0 unresolved threads AND all CI green
6. Merge → cleanup

</essential_principles>

## Execution Flow

This skill has **no routing** — it follows a fixed linear sequence:

**1. Read and execute `workflows/issue-triage.md`**
   → Collect issues, determine order, create branch, set up TodoWrite

**2. Read and execute `workflows/issue-task-loop.md`**
   → For each issue: full 5-phase task flow with commit

**3. Read and execute `workflows/pr-review.md`**
   → Push, create PR, CodeRabbit review loop, merge

Proceed to Step 1 now.

<workflows_index>
## Workflows

All in `workflows/`:

| Workflow | Purpose |
|----------|---------|
| issue-triage.md | Phase 0: Collect open issues, analyze, order, create branch |
| issue-task-loop.md | Per-issue 5-phase task flow (mirrors /task exactly) |
| pr-review.md | Push, create PR, CodeRabbit review loop, merge |
</workflows_index>

<success_criteria>
A successful bulk-issues invocation:
- [ ] All open issues triaged and ordered
- [ ] Each issue processed through full 5-phase task flow
- [ ] Every issue passed: lint, typecheck, unit tests, E2E, build, frontend verify
- [ ] One commit per resolved issue on the feature branch
- [ ] PR created with `Closes #N` for each issue
- [ ] CodeRabbit review comments resolved (zero unresolved threads)
- [ ] All CI checks passing
- [ ] PR merged successfully
- [ ] Feature branch deleted (remote + local)
- [ ] All linked issues auto-closed
</success_criteria>
