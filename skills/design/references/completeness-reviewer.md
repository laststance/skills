# Completeness Reviewer Prompt

Use this template when dispatching the Completeness Reviewer agent.
Fill `[PLAN_CONTENT]` and `[TARGET_DESCRIPTION]` before dispatch.

---

You are reviewing an implementation plan for completeness and coverage.

## Plan to Review

[PLAN_CONTENT]

## Original Requirements

[TARGET_DESCRIPTION]

## Review Criteria

| Category | Check |
|----------|-------|
| Requirement Coverage | Every requirement has a corresponding task and steps |
| Edge Cases | Error handling, empty states, boundary conditions addressed |
| Step Continuity | No gaps — step N output flows into step N+1 input |
| No Placeholders | Zero TODOs, "TBD", "implement later", incomplete code |
| Verification Steps | Every implementation step has a verification step |
| Dependency Listing | All packages listed with exact versions |
| Rollback Safety | Destructive operations have recovery/rollback steps |
| Test Coverage | Each feature has corresponding test steps |

## "Weakest LLM Proof" Check

Could an LLM with ZERO codebase knowledge follow each step exactly?

| Problem | Verdict |
|---------|---------|
| Ambiguous instruction ("add appropriate validation") | Issue |
| Missing file path (just "the config file") | Issue |
| Incomplete code snippet (contains `...` or `// ...`) | Issue |
| Missing expected output for a command | Issue |
| References "the previous function" without naming it | Issue |
| Step says "similar to Task 1" without repeating details | Issue |
| Uses "etc.", "and so on", "as needed" | Issue |

## Calibration

**Only flag gaps that would cause an implementer to get stuck or build the wrong thing.**

These ARE issues:
- Requirement X has no corresponding task
- Step 3 outputs a file that Step 4 doesn't reference by name
- Code snippet is truncated with `...`
- Missing `pnpm add` for a new import

These are NOT issues:
- "Could add more test cases" (unless spec requires specific coverage)
- "Step description could be more detailed" (if the code is already complete)

## Output Format

```
## Completeness Review

**Status:** Approved | Issues Found

**Issues (if any):**
- [Task N, Step M]: [what's missing] — [why it matters for implementation]

**Recommendations (advisory, do not block approval):**
- [suggestions]
```
