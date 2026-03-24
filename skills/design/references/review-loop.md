# Review Loop — 5-Round Parallel Multi-Agent Review

## Overview

Before presenting the Plan to the user, refine it through up to 5 rounds
of parallel multi-agent review. Each round dispatches 3 specialized reviewers
simultaneously, collects all feedback, fixes issues, and repeats until
all reviewers approve or the round limit is reached.

## Orchestration Flow

```
for round in 1..5:
    dispatch 3 reviewers in parallel (Agent tool, run_in_background=True)
    wait for all 3 to complete
    collect feedback

    if all 3 returned "Approved":
        break → Phase 4 (Final Review)
    else:
        fix all reported issues in the Plan
        continue to next round

if round == 5 and still issues:
    present remaining issues to user for guidance
```

## Dispatch Template

For each round, dispatch exactly 3 agents in a SINGLE message (parallel):

```
Agent(
    description="Architecture review round N",
    prompt=<read references/architecture-reviewer.md, fill [PLAN_CONTENT] and [CODEBASE_SUMMARY]>,
    subagent_type="general-purpose",
    run_in_background=True,
    name="arch-reviewer-rN"
)

Agent(
    description="Completeness review round N",
    prompt=<read references/completeness-reviewer.md, fill [PLAN_CONTENT] and [TARGET_DESCRIPTION]>,
    subagent_type="general-purpose",
    run_in_background=True,
    name="comp-reviewer-rN"
)

Agent(
    description="Feasibility review round N",
    prompt=<read references/feasibility-reviewer.md, fill [PLAN_CONTENT] and [TECH_STACK_INFO]>,
    subagent_type="general-purpose",
    run_in_background=True,
    name="feas-reviewer-rN"
)
```

## Feedback Collection

After all 3 agents complete, compile results:

```markdown
## Round N Results

### Architecture Reviewer
- Status: Approved | Issues Found
- Issues: [list]

### Completeness Reviewer
- Status: Approved | Issues Found
- Issues: [list]

### Feasibility Reviewer
- Status: Approved | Issues Found
- Issues: [list]

### Action Items
- [ ] Fix: [issue 1 from arch reviewer]
- [ ] Fix: [issue 2 from comp reviewer]
- [ ] Fix: [issue 3 from feas reviewer]
```

## Fix Procedure

1. Read all issues across all 3 reviewers
2. Group by affected Task/Step in the Plan
3. Fix each issue directly in the Plan draft
4. Verify fixes don't introduce new contradictions
5. Proceed to next round with the updated Plan

## Exit Conditions

| Condition | Action |
|-----------|--------|
| All 3 approved | Exit loop → Phase 4 (Final Review) |
| Round 5, still issues | Present remaining issues to user with: "5 review rounds completed. N issues remain. Approve with known issues or provide guidance?" |
| Reviewer returns invalid/unclear response | Re-dispatch that specific reviewer with clarified instructions |

## After Review Loop

Dispatch the Final Reviewer (references/final-reviewer.md):
- Provide the complete, reviewed Plan
- Final Reviewer performs holistic coherence check
- If approved → Phase 5 (Plan Output)
- If issues → fix and re-dispatch Final Reviewer (1 retry max)

## Principles

- **Never skip a round** if issues were found — always fix then re-review
- **Fix in the Plan draft**, not in a separate document
- **Each reviewer sees only the latest Plan** — no review history needed
- **Reviewers are advisory on Recommendations** — only Issues block approval
- **Same skill executor fixes** — preserves context about design decisions
