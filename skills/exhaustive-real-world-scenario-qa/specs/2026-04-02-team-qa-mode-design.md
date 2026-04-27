# Team QA Mode Design Spec

**Date**: 2026-04-02
**Status**: Approved
**Skill**: exhaustive-real-world-scenario-qa
**Flag**: `--team`

## Overview

Extend the exhaustive QA skill with a 3-agent Team mode. Agents communicate via
SendMessage to coordinate state changes while testing the same application data
from separate browser sessions.

## Team Composition

| Agent | Role | Browser Session | Test Categories |
|-------|------|----------------|-----------------|
| **Main (Spec Tester)** | Coordinator. Runs Phase 1-2, distributes tests, collects results, runs Phase 4-5 | `qa-spec` (headed) | HAPPY (Spec), REGRESSION (Diff) |
| **Design Checker** | Verifies UI matches Figma or industry guidelines | `qa-design` (headless after auth) | DESIGN |
| **Bug Hunter (Devil's Advocate)** | Aggressively tries to break the UI | `qa-hunter` (headless after auth) | EDGE, EXHAUSTIVE, STATE + freestyle attacks |

All agents: `mode: "bypassPermissions"`.

## New CLI Arguments

```
/exhaustive-qa [URL] --team [options]

--team                 Enable 3-agent team mode (mutually exclusive with --fresh-agent)
--headless             All agents headless after auth
--headed               All agents stay headed throughout
--headed=<agents>      Comma-separated list of agents to keep headed (spec,design,hunter)
```

Default `--team` behavior: all agents start headed for login, then Design Checker
and Bug Hunter restart headless after saving auth cookies. Main stays headed.

## Phase 1: Analyze (Extended)

### 1.1 Spec Resolution (new)

Priority cascade for test scenario source:

```
1. --spec argument (Notion URL / file path / "inline")
2. Serena task memory: current_tasks → task_{NNNN}_* → Notion URL + Inkdrop PR note
3. Code diff analysis only (current behavior)
```

When Spec is found:
- Every Spec requirement becomes at least 1 HAPPY test case
- Spec-derived tests are marked `Owner: Spec` in the test table
- Code analysis still generates EDGE / EXHAUSTIVE / STATE / REGRESSION tests

### 1.2 Figma Resolution (new, --team only)

3-tier fallback for Design Checker reference:

```
1. Serena task memory → Figma URL in task_{NNNN}_* → Figma Desktop MCP
2. No Figma URL → ask user for design spec
3. No spec → Apple HIG / industry standard guidelines:
   - Tap areas >= 44x44px
   - Contrast ratio WCAG 2.2 AA+
   - Spacing on 4/8 grid
   - Interactive elements have visual feedback
   - Corner radius consistency
```

If tier 1 or 2 found: Design Checker uses Figma MCP for screenshot comparison.
If tier 3: Design Checker evaluates against HIG checklist (no Figma needed).

### 1.3-1.5 Unchanged

Code Analysis (Serena), Framework Docs (Context7), Structured Analysis
(Sequential Thinking) remain the same.

## Phase 2: Generate Test Cases (Extended)

### Test Table Extension

New `Owner` column tracks the source of each test case:

```markdown
| ID | Cat | Owner | Agent | Description | Steps | Expected |
|----|-----|-------|-------|-------------|-------|----------|
| TC01 | HAPPY | Spec | Main | requirement 1 | ... | ... |
| TC02 | REGRESSION | Diff | Main | changed code path | ... | ... |
| DC01 | DESIGN | Figma | Design | button color match | ... | ... |
| BH01 | EDGE | Code | Hunter | boundary test | ... | ... |
| BH02 | EXHAUSTIVE | Code | Hunter | rapid-fire clicks | ... | ... |
```

### Test Distribution

| Agent | Receives |
|-------|----------|
| Main | HAPPY (Spec) + REGRESSION (Diff) |
| Design Checker | DESIGN tests + screenshots of Main's completed TCs |
| Bug Hunter | EDGE + EXHAUSTIVE + STATE + license for freestyle attacks |

Bug Hunter is explicitly encouraged to invent additional destructive tests beyond
the planned table (rapid clicks, URL manipulation, form interruption, back button
abuse, etc.). These ad-hoc findings are reported as BH_AD_XX.

## Phase 3: Execute (--team mode)

### 3.0 Team Setup

```
1. TeamCreate("qa-team")
2. Distribute test cases by role
3. Share auth credentials with all agents
```

### 3.1 Auth Phase (all headed, parallel)

```
All 3 agents:
  playwright-cli -s=<name> open <URL> --headed
  → login flow
  → playwright-cli state-save /tmp/qa-auth-<name>.json

Then (default behavior):
  Main: stays headed
  Design + Hunter:
    playwright-cli -s=<name> close
    playwright-cli -s=<name> open <URL> --headless  (or per --headed flag)
    playwright-cli -s=<name> state-load /tmp/qa-auth-<name>.json
```

### 3.2 Iteration Loop

For each iteration (1 to N):

**Main (Spec Tester)**:
- Execute HAPPY + REGRESSION tests sequentially
- Screenshot after each action
- On data change → `SendMessage` to team:
  `{ action: "created|deleted|modified|navigated", target: "...", detail: "..." }`
- Record results as JSON

**Design Checker** (runs concurrently):
- Wait for Main to complete each TC, then navigate to the same screen
- Take screenshot via `playwright-cli screenshot --filename=<path>`
- If Figma URL available:
  - Get Figma node screenshot via Figma Desktop MCP
  - Semantic comparison (not pixel-perfect): color, layout, element presence, text
- If no Figma:
  - Evaluate against Apple HIG checklist
- Record findings with severity: `critical | minor | acceptable`

**Bug Hunter** (runs concurrently):
- Execute EDGE + EXHAUSTIVE + STATE tests
- Additionally, perform freestyle attacks:
  - Rapid repeated clicks (20x)
  - URL direct entry with invalid IDs
  - Form mid-fill abandonment → return
  - Back/forward button abuse
  - Browser tab close → reopen
  - Resize window during interaction
- On data change → `SendMessage` to team
- Record all findings including ad-hoc discoveries

### 3.3 SendMessage Protocol

```json
{
  "action": "created | deleted | modified | navigated | warning | completed",
  "target": "resource identifier (e.g., drawing 6, /drawings/6)",
  "detail": "human-readable description",
  "tc_id": "TC01 (optional, which test case triggered this)"
}
```

Agents MUST send a message when:
- Creating or deleting test data
- Navigating to a page that could affect other agents' tests
- Starting a destructive test ("warning")
- Completing their test batch ("completed")

Agents SHOULD check incoming messages before each test case to avoid
operating on deleted/modified data.

## Phase 4-5: Compare & Report (Extended)

### Report Structure

```markdown
# Exhaustive QA Report -- {feature_name}
**Mode**: Team (3 agents) | **Loops**: {N} | **Tier**: {tier}

## Agent Summary
| Agent | TCs Executed | Pass | Fail | Ad-hoc | Duration |
|-------|-------------|------|------|--------|----------|
| Spec Tester | N | N | N | - | Xm |
| Design Checker | N | N | N | - | Xm |
| Bug Hunter | N | N | N | N | Xm |

## Spec Coverage
| Requirement | TC IDs | Status |
|-------------|--------|--------|
| req 1 | TC01, TC02 | PASS |
| req 2 | TC03 | FAIL |

## Functional Results (Main + Hunter)
| ID | Cat | Owner | Agent | Iter1 | Iter2 | Iter3 | Verdict |
|----|-----|-------|-------|-------|-------|-------|---------|

## Design Compliance
| ID | Element | Reference | Actual | Severity | Screenshot |
|----|---------|-----------|--------|----------|------------|

## Bug Hunter Ad-hoc Findings
| ID | Attack | Result | Severity | Screenshot |
|----|--------|--------|----------|------------|

## State-Dependent Issues
{detailed description}

## Screenshots
{organized by agent, test case, and iteration}
```

### Spec Coverage Section (new)

When Spec was used as test source, report maps every Spec requirement to
test case IDs and their pass/fail status. Any requirement without a TC
is flagged as "UNTESTED".

## File Changes

| File | Change |
|------|--------|
| `SKILL.md` | Add --team flag docs, Phase 3 team branch, agent prompts |
| `references/browser-workarounds.md` | Already updated (ReactFlow section) |
| `references/test-case-taxonomy.md` | Add DESIGN category |
| `references/team-agent-prompts.md` | New: prompt templates for Design Checker and Bug Hunter |
| `specs/this-file` | This design spec |

## Constraints

- `--team` and `--fresh-agent` are mutually exclusive
- Team mode requires `playwright-cli` to be installed
- Figma Desktop MCP is optional (graceful fallback to HIG)
- Serena is optional (graceful fallback to --spec or code-only)
- Minimum 2 iterations recommended for team mode (state interaction between agents)
