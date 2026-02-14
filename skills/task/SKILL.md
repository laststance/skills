---
name: task
description: |
  Standard implementation workflow for all coding tasks.
  Executes a systematic 5-phase cycle: Investigate → Plan → Implement → Verify → Complete.
  Integrates Serena think checkpoints, introspection markers, and quality gates.
  Supports --frontend-verify flag for browser/app/CLI visual verification.

  Use when:
  - User asks to implement a feature, fix a bug, or refactor code
  - User provides a task that requires code changes
  - User says "do this", "build this", "fix this", "add this"
  - Any implementation work involving code editing

  Keywords: task, implement, build, fix, add, create, refactor, update, change
argument-hint: "[task description] [--frontend-verify]"
---

# Task — Systematic Implementation Workflow

Standard 5-phase workflow for all implementation tasks with built-in quality gates.

<essential_principles>

## Serena Think Checkpoints (Mandatory)

These three tools MUST be called at the specified points. Never skip them.

| Checkpoint | Tool | When | Purpose |
|------------|------|------|---------|
| Information Gate | `mcp__serena__think_about_collected_information` | After Phase 1 (Investigate) and Phase 2 (Plan) | Verify sufficient information before proceeding |
| Adherence Gate | `mcp__serena__think_about_task_adherence` | Before each code edit in Phase 3 | Confirm still aligned with original task |
| Completion Gate | `mcp__serena__think_about_whether_you_are_done` | Before exiting Phase 4 (Verify) | Confirm all work is truly complete |

## Introspection Markers (Always Active)

Use these markers throughout all phases to make reasoning visible:

- 🤔 Reasoning — "🤔 The error suggests a missing dependency"
- 🎯 Decision — "🎯 Choosing approach A over B because..."
- ⚡ Performance — "⚡ This query may cause N+1"
- 📊 Quality — "📊 Checking consistency with existing patterns"
- 💡 Insight — "💡 This pattern can be reused for..."

## Safety Rules

- **Before destructive operations** (delete, overwrite, reset): Always confirm with user
- **Before code edits**: Call `think_about_task_adherence`
- **Never auto-commit**: Phase 5 waits for user instruction to commit/push
- **Quality gate required**: Phase 4 must pass before Phase 5

</essential_principles>

## Phase 1: Investigate

Understand the task and gather context.

1. Parse task requirements from user input
2. Read relevant code files (Grep, Read, Serena symbolic tools)
3. Check external libraries with Context7 if needed
4. Identify existing patterns and conventions
5. **🔶 `think_about_collected_information`** — Is the information sufficient?

**Tools**: Grep, Read, Glob, `mcp__serena__find_symbol`, `mcp__serena__get_symbols_overview`, `mcp__context7__query-docs`

## Phase 2: Plan

Break down the task and design the approach.

1. Create task breakdown with `TodoWrite`
2. Identify parallelizable steps: `Plan: 1) Parallel [Read A, B] → 2) Edit → 3) Parallel [Test, Lint]`
3. Save plan to Serena Memory: `mcp__serena__write_memory("plan_<topic>", content)`
4. **🔶 `think_about_collected_information`** — Any gaps in the plan?

**Output**: TodoWrite entries with clear acceptance criteria per step.

## Phase 3: Implement

Execute the plan with continuous adherence checks.

For each implementation step:

1. Mark TodoWrite item as in-progress
2. **🔶 `think_about_task_adherence`** — Still on track?
3. Edit code (Edit, Write)
4. Use introspection markers (🤔🎯⚡📊💡) to explain reasoning
5. Mark TodoWrite item as complete

**Rules**:
- No `// TODO: implement later` — write working code
- No mock objects outside tests
- Follow existing code patterns and conventions
- Confirm with user before destructive operations

## Phase 4: Verify

Run quality checks and validate correctness.

### Standard Verification (always)

Run in parallel where possible:

```bash
# Parallel execution
pnpm lint &
pnpm typecheck &
pnpm test &
pnpm build &
wait
```

If any check fails → investigate root cause → fix in Phase 3 → re-verify.

### `--frontend-verify` (when flag is provided)

Visual verification across platforms. Auto-detect platform from `package.json`:

| Dependency | Platform | Preflight | Verification Tool |
|------------|----------|-----------|-------------------|
| _(default)_ | Web | `kill-port <port> && pnpm dev` | Claude Chrome MCP (`tabs_context_mcp`, `read_page`, `take_screenshot`) |
| `electron` | Electron | `pnpm electron:dev` | Electron MCP (`mcp__electron__take_screenshot`) |
| `expo` / `react-native` | Mobile | `mcp__ios-simulator__open_simulator` | iOS Simulator MCP (`screenshot`, `ui_tap`, `ui_swipe`) |
| `commander` / `inquirer` / `oclif` | CLI | shell session | Shellwright MCP (TUI/CLI operation and output verification) |

**Frontend Verify Workflow:**

1. **Preflight**: Start dev server / app, confirm MCP connection
2. **Scenario creation**: Design test scenarios based on changes, save to Serena Memory
3. **Execute**: Run each scenario, take screenshot after each step
4. **Judge**: All pass → continue. Any fail → return to Phase 3

### Completion Gate

**🔶 `think_about_whether_you_are_done`** — Is everything truly complete?

## Phase 5: Complete

Report results and wait for user instruction.

1. Present verification summary to user:
   - What was changed (files, functions)
   - Test results
   - Screenshots (if --frontend-verify)
2. Update TodoWrite — mark all items complete
3. **⏸️ Wait for user instruction** to commit/push
4. On user confirmation: `git commit && git push`

## Quick Reference

```
/task fix the login button styling
/task add dark mode support --frontend-verify
/task refactor the API error handling
```

### Phase Flow Diagram

```
[Investigate] → 🔶 info gate
     ↓
  [Plan] → 🔶 info gate
     ↓
[Implement] → 🔶 adherence gate (per edit)
     ↓
 [Verify] → 🔶 completion gate
     ↓
[Complete] → ⏸️ wait for user → commit/push
```
