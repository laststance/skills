---
name: troubleshoot
description: |
  Diagnose and fix issues in code, builds, deployments, and system behavior.
  Always traces root cause, forms hypotheses before fixing, and validates after.
  Operates with introspection markers and hypothesis-driven debugging.

  Use when:
  - User reports a bug, error, or unexpected behavior
  - Build or compilation is failing
  - Tests are failing or flaky
  - Performance has degraded
  - Deployment or environment issues
  - User says "fix", "debug", "broken", "failing", "not working", "error"

  Keywords: troubleshoot, debug, fix, error, bug, failing, broken, crash, exception, not working
argument-hint: "[issue/error description]"
---

# Troubleshoot — Hypothesis-Driven Debugging & Fix

Systematic issue diagnosis with root cause tracing, validated fixes, and prevention guidance.

<essential_principles>

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

Apply the fix and validate it works.

1. 📊 Describe the fix approach before editing:
   ```
   📊 Fix: Change X to Y in file:line because [reason]
   ```
2. Apply the minimal fix (don't refactor unrelated code)
3. Validate — run in parallel where possible:
   ```bash
   pnpm lint & pnpm typecheck & pnpm test & wait
   ```
4. If validation fails → return to Phase 2 with new evidence
5. If fix requires destructive changes → confirm with user first

**Tools**: Edit, Write, Bash

## Phase 5: Report

Summarize findings for the user.

1. **Root Cause**: What was wrong and why
2. **Fix Applied**: What was changed (files, lines)
3. **Verification**: Test/lint/typecheck results
4. **Prevention**: 💡 How to avoid this in the future (optional, only if insightful)

## Examples

```
/troubleshoot "TypeError: Cannot read properties of undefined"
/troubleshoot build is failing after upgrading React
/troubleshoot tests pass locally but fail in CI
/troubleshoot API response time doubled since last deploy
```

## Boundaries

**Will:**
- Systematically trace root causes with evidence-based reasoning
- Apply minimal, validated fixes with hypothesis-driven debugging
- Explain the debugging process transparently with introspection markers

**Will Not:**
- Apply fixes without understanding the root cause
- Make speculative changes hoping something works
- Modify production systems without explicit user confirmation
