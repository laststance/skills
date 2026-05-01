---
name: troubleshoot
description: Root-cause fix
argument-hint: "[issue/error description] [--frontend-verify]"
---

# Troubleshoot — Hypothesis-Driven Debugging & Fix

Systematic issue diagnosis with root cause tracing, validated fixes, and prevention guidance.

<essential_principles>

## Serena Think Checkpoints (Mandatory)

Call the following Serena tools at the specified points. Never skip them.

| Checkpoint | Tool | When | Purpose |
|------------|------|------|---------|
| Adherence Gate | `mcp__serena__think_about_task_adherence` | Before each code edit in Phase 4 (Fix) | Confirm fix aligns with identified root cause |
| Completion Gate | `mcp__serena__think_about_whether_you_are_done` | Before exiting Phase 5 (Verify) | Confirm fix is verified with evidence |

After Phase 1 and again after Phase 2, do a short **evidence sufficiency self-check** in prose (repro steps, observed vs expected, hypotheses tied to concrete evidence). If gaps remain, collect more evidence before continuing—do not rely on a removed Serena tool.

## Always Active

- **Hypothesis before fix**: Never guess-fix. Always form a hypothesis, gather evidence,
  then apply the fix. "🤔 I think X because Y" → verify → fix
- **Introspection markers**: Make debugging reasoning visible throughout:
  - 🤔 Reasoning — "🤔 The stack trace points to a null ref in..."
  - 🎯 Decision — "🎯 Root cause identified: missing null check at..."
  - ⚡ Performance — "⚡ This N+1 query causes the slowdown"
  - 📊 Quality — "📊 This fix also addresses the underlying design issue"
  - 💡 Insight — "💡 This pattern is error-prone; consider refactoring"
- **Validate every fix**: Run lint/typecheck/test after each change. No unverified fixes
- **Destructive changes require confirmation**: Deleting files, resetting state, dropping data
- **No project-specific rules**: This skill works across all projects and AI agents

</essential_principles>

## Phase 1: Reproduce

Understand and reproduce the issue before diagnosing.

1. Parse the error description from user input
2. 🤔 Identify the error type: bug / build / test / performance / deployment
3. Collect evidence:
   - Read error messages, stack traces, logs
   - Run the failing command to see the actual output
   - Check `git diff` or `git log` for recent changes that may have caused it
4. Confirm reproduction: "I can reproduce this by running X → error Y"

**If cannot reproduce**: Ask user for more context before proceeding.

**Tools**: Bash, Read, Grep, Glob

5. **Reproduction evidence self-check** — Confirm you have enough to proceed: exact command or steps, full error output, and environment hints if relevant. If reproduction is shaky or incomplete, gather more before Phase 2.

## Phase 2: Hypothesize

Form hypotheses about the root cause — do not jump to fixing.

1. 🤔 List 2-3 candidate hypotheses based on evidence:
   ```
   🤔 Hypothesis A: Missing dependency after package update
   🤔 Hypothesis B: Type mismatch from recent refactor
   🤔 Hypothesis C: Environment variable not set
   ```
2. 🎯 Rank by likelihood based on evidence strength
3. Start investigating the most likely hypothesis first
4. **Hypothesis grounding self-check** — Each hypothesis should cite specific evidence (log line, code path, diff, measured behavior). Demote or drop guesses that are not tied to facts.

## Phase 3: Investigate

Systematically verify or eliminate each hypothesis.

1. Read the relevant source code (trace from error location outward)
2. Follow the call chain: caller → function → dependencies
3. Check external library behavior with Context7 if the issue involves a framework/library
4. Narrow down to the root cause with evidence:
   ```
   🎯 Root cause: X confirmed. Evidence: [specific line/behavior]
   ```

**Tools**: Read, Grep, Glob, `mcp__serena__find_symbol`, `mcp__context7__query-docs`

## Phase 4: Fix

Apply the fix with adherence checks before each edit.

For each code change:

1. **🔶 `think_about_task_adherence`** — Is this edit aligned with the identified root cause?
2. 📊 Describe the fix approach before editing:
   ```
   📊 Fix: Change X to Y in file:line because [reason]
   ```
3. Apply the minimal fix (don't refactor unrelated code)
4. If fix requires destructive changes → confirm with user first

**Tools**: Edit, Write, Bash

## Phase 5: Verify

Prove the fix works with concrete evidence. No fix is complete without verification.

### Standard Verification (always)

1. **Re-run the reproduction**: Execute the same command/action from Phase 1
   - Confirm the error no longer occurs
   - Record the output as evidence
2. **Quality checks** — run in parallel where possible:
   ```bash
   pnpm lint & pnpm typecheck & pnpm test & wait
   ```
3. **Evidence collection** — at least one of:
   - Console/log output showing the fix works
   - Test results (new or existing tests passing)
   - Screenshot of corrected behavior
   - User confirmation request ("Can you verify X now works?")

If any check fails → return to Phase 3 with new evidence.

### `--frontend-verify` (when flag is provided)

Visual verification across platforms. Auto-detect platform from `package.json`:

| Dependency | Platform | Preflight | Verification Tool |
|------------|----------|-----------|-------------------|
| _(default)_ | Web | `kill-port <port> && pnpm dev` | `playwright-cli` (`open --headed`, `snapshot`, `screenshot`) |
| `electron` | Electron | `pnpm electron:dev` | `/qa-electron` skill (`playwright-cli` attached to Electron CDP) |
| `expo` / `react-native` | Mobile | `mcp__ios-simulator__open_simulator` | iOS Simulator MCP (`screenshot`, `ui_tap`, `ui_swipe`) |
| `commander` / `inquirer` / `oclif` | CLI | shell session | Shellwright MCP (TUI/CLI operation and output verification) |

**Before any browser interaction**: invoke `/dnd` to load the drag-and-drop verification protocol. Ref-based `drag` reports false success on `dnd-kit` and similar libraries — load this preemptively for Web and Electron flows.

**Frontend Verify Workflow:**

1. **Preflight**: Start dev server / app, confirm MCP connection
2. **Before screenshot**: Take screenshot of the broken state (if reproducible in UI)
3. **After fix screenshot**: Take screenshot of the corrected state
4. **Compare**: Present before/after to user for confirmation
5. **Judge**: All pass → continue. Any fail → return to Phase 4

### Authentication for Frontend Verify

When verifying authenticated apps (SaaS dashboards, admin panels, OAuth-protected pages), use `playwright-cli`'s auth persistence:

| Strategy | Command | Use Case |
|----------|---------|----------|
| `state-save / state-load` | `playwright-cli state-save auth.json` | Session cookies + localStorage. Best for most web apps |
| `--profile <dir>` | `playwright-cli open <url> --profile ./browser-data` | Full Chromium user data dir. Best for complex OAuth (Google, GitHub SSO) |

**OAuth Flow:**

1. `playwright-cli open <login-url> --headed` (must be headed for OAuth redirects)
2. Complete OAuth manually or via `snapshot` + `fill` + `click`
3. `playwright-cli state-save auth.json` to persist session
4. Future runs: `playwright-cli state-load auth.json` before navigating to app

**Security:**

- Add `auth.json`, `browser-data/` to `.gitignore`
- State files contain session secrets — treat as credentials
- Use `--headed` for initial OAuth setup (redirects require visible browser)

### Completion Gate

**🔶 `think_about_whether_you_are_done`** — Is the fix verified with evidence?

## Phase 6: Report

Summarize findings for the user.

1. **Root Cause**: What was wrong and why
2. **Fix Applied**: What was changed (files, lines)
3. **Evidence**: Verification results (logs, screenshots, test output)
4. **Prevention**: 💡 How to avoid this in the future (optional, only if insightful)

## Examples

```
/troubleshoot "TypeError: Cannot read properties of undefined"
/troubleshoot build is failing after upgrading React
/troubleshoot tests pass locally but fail in CI --frontend-verify
/troubleshoot API response time doubled since last deploy
```

## Phase Flow Diagram

```
[Reproduce] → 🔶 info gate
     ↓
[Hypothesize] → 🔶 info gate
     ↓
[Investigate]
     ↓
   [Fix] → 🔶 adherence gate (per edit)
     ↓
 [Verify] → 🔶 completion gate
     ↓
 [Report]
```

## Boundaries

**Will:**
- Systematically trace root causes with evidence-based reasoning
- Apply minimal, validated fixes with hypothesis-driven debugging
- Verify fixes with concrete evidence (logs, screenshots, test results)
- Explain the debugging process transparently with introspection markers

**Will Not:**
- Apply fixes without understanding the root cause
- Make speculative changes hoping something works
- Mark a fix as complete without verification evidence
- Modify production systems without explicit user confirmation
