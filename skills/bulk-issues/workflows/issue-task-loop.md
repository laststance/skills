# Workflow: Per-Issue Task Loop

Process each issue through the full 5-phase task flow. This mirrors `/task` exactly,
but with `--frontend-verify` and all tests **always mandatory**.

<process>

## Loop Start

For each issue in the approved order, execute Phases 1-5 below.
After completing an issue, return to Loop Start for the next issue.

---

## Pre-Phase: Setup for Current Issue

1. **Mark top-level TodoWrite entry** as in-progress
2. **Read issue details**:
   ```bash
   gh issue view $ISSUE_NUMBER --json title,body,labels,comments
   ```
3. **Register issue sub-tasks** in TodoWrite for this issue's implementation steps
   (these are created during Phase 2: Plan, but the TodoWrite tab is initialized here)

---

## Phase 1: Investigate

Understand the issue and gather context.

1. Parse requirements from issue body and comments
2. Read relevant code files (Grep, Read, Serena symbolic tools)
3. Check external libraries with Context7 if needed
4. Identify existing patterns and conventions
5. Check if issue references other issues or PRs for context
6. Use introspection markers: 🤔 Reasoning, 🎯 Decision, 📊 Quality

**Tools**: Grep, Read, Glob, `mcp__serena__find_symbol`, `mcp__serena__get_symbols_overview`, `mcp__context7__query-docs`

### 🔶 Information Gate
Call `mcp__serena__think_about_collected_information` — Is the information sufficient to plan?

---

## Phase 2: Plan

Break down the issue into implementation steps.

1. Design the approach based on investigation findings
2. Create **sub-tasks in TodoWrite** for this issue:
   ```
   TodoWrite (sub-tasks for Issue #N):
     - "Read and understand affected module" — pending
     - "Implement core logic change" — pending
     - "Add unit tests" — pending
     - "Add E2E tests" — pending
     - "Update documentation if needed" — pending
   ```
3. Identify parallelizable steps: `Plan: 1) Parallel [Read A, B] → 2) Edit → 3) Parallel [Test, Lint]`
4. Note dependencies between sub-tasks

### 🔶 Information Gate
Call `mcp__serena__think_about_collected_information` — Any gaps in the plan?

---

## Phase 3: Implement

Execute the plan with continuous adherence checks.

For each sub-task:

1. Mark TodoWrite sub-task as in-progress
2. **🔶 Adherence Gate**: Call `mcp__serena__think_about_task_adherence` — Still on track?
3. Edit code (Edit, Write tools)
4. Use introspection markers (🤔🎯⚡📊💡) to explain reasoning
5. Mark TodoWrite sub-task as complete

**Rules** (same as /task):
- No `// TODO: implement later` — write working code
- No mock objects outside tests
- Follow existing code patterns and conventions
- Confirm with user before destructive operations

---

## Phase 4: Verify (ALL MANDATORY)

Run every quality gate. No exceptions. No skipping.

### 4a. Standard Verification

Run in parallel where possible:

```bash
pnpm lint &
pnpm typecheck &
pnpm test &
pnpm build &
wait
```

### 4b. E2E Tests (MANDATORY)

```bash
pnpm test:e2e
```

If project uses a different E2E command, detect from `package.json` scripts.
If no E2E tests exist for the changed code, **write them** before proceeding.

### 4c. Unit Tests (MANDATORY)

Verify that new/modified code has adequate unit test coverage.
If unit tests don't exist for the changed code, **write them** before proceeding.

### 4d. Frontend Verification (MANDATORY)

Auto-detect platform from `package.json`:

| Dependency | Platform | Preflight | Verification Tool |
|------------|----------|-----------|-------------------|
| _(default)_ | Web | `kill-port <port> && pnpm dev` | playwright-cli (`open --headed`, `snapshot`, `screenshot`) |
| `electron` | Electron | `pnpm electron:dev` | `/qa-electron` skill (`playwright-cli` attached to Electron CDP) |
| `expo` / `react-native` | Mobile | `mcp__ios-simulator__open_simulator` | iOS Simulator MCP |
| `commander` / `inquirer` / `oclif` | CLI | shell session | Shellwright MCP |

**Before any browser interaction**: invoke `/dnd` to load the drag-and-drop verification protocol (Web and Electron only).

**Frontend Verify Workflow:**
1. Start dev server / app, confirm MCP connection
2. Design test scenarios based on changes
3. Execute each scenario, take screenshot after each step
4. Judge: all pass → continue. Any fail → return to Phase 3

### 4e. Failure Handling

If **any** check fails:
1. Investigate root cause (read error trace)
2. Hypothesize the cause (🤔 marker)
3. Return to **Phase 3** to fix
4. Re-run **all** Phase 4 checks after fix

### 🔶 Completion Gate
Call `mcp__serena__think_about_whether_you_are_done` — Is this issue truly complete?

---

## Phase 5: Complete (Per Issue)

Finalize this issue on the branch.

1. **Commit** (do NOT push yet):
   ```bash
   git add <specific-files>
   git commit -m "$(cat <<'EOF'
   fix/feat: resolve #N — <concise summary>

   - <change 1>
   - <change 2>
   - <change 3>
   EOF
   )"
   ```
   Use `fix:` for bug fixes, `feat:` for features, `refactor:` for refactoring, `docs:` for documentation.

2. **Mark top-level TodoWrite entry** as complete
3. **Report** brief summary to user: what was changed, test results, screenshots

---

## Loop End

After completing all issues:

1. Verify all top-level TodoWrite entries are marked complete
2. Report overall progress summary to user
3. **Read and execute `workflows/pr-review.md`**

</process>

<success_criteria>
Issue task loop is complete when:
- [ ] Every issue processed through all 5 phases
- [ ] Every issue has: lint, typecheck, unit tests, E2E, build, frontend verify — all passing
- [ ] One commit per issue on the feature branch
- [ ] All top-level TodoWrite entries marked complete
- [ ] Ready to push and create PR
</success_criteria>
