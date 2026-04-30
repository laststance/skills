---
name: exhaustive-real-world-scenario-qa
description: Scenario QA
---

# Exhaustive Real World Scenario QA

Automated QA testing that thinks like a suspicious user, not a hopeful developer.

This skill analyzes your code and spec using **Serena** (semantic code analysis),
**sequential-thinking** (structured reasoning), and **Context7** (framework docs),
then generates comprehensive test cases executed via `playwright-cli` in **headed mode**.

Three execution modes:
- **Main Claude (default)** — direct execution, real-time adaptation, simpler error handling
- **Fresh Agent (`--fresh-agent`)** — spawns agents with zero code context for bias-free
  double-blind testing (the executor has NO knowledge of your implementation)
- **Team (`--team`)** — 3-agent coordinated testing: Main (Spec Tester) + Design Checker
  + Bug Hunter, each with their own browser session, communicating via SendMessage

Tests run 3x by default to catch state-dependent bugs.

<essential_principles>

## Why 3x Loops Matter

~40% of production bugs only appear on the second or third use:
- Iteration 1: Clean state. Everything works because there's no prior data.
- Iteration 2: Data from iter 1 exists. Duplicate checks, cache, stale references surface.
- Iteration 3: Accumulated data. Performance, UI overflow, pagination edge cases appear.

Tests that pass on iter 1 but fail on iter 2+ are classified as STATE-DEPENDENT — these
are the bugs users find on day 2 that developers never catch in testing.

## Core Rules

1. **Execute test steps literally** — follow the test table exactly, don't take shortcuts based on code knowledge
2. **Sequential iterations** — iter 2 must see iter 1's leftover state
3. **Screenshot every step** — visual evidence for every action and assertion
4. **Never skip a test** — if one fails, capture evidence and continue to the next
5. **User approves test table** before execution begins
6. **Headed mode by default** — visible browser for real-time observation

</essential_principles>

## Arguments

```
/exhaustive-qa [URL] [options]

Options:
  --spec <notion-url|file>    Spec source (Notion URL, markdown file, or "inline")
  --loops <N>                 Iteration count (default: 3)
  --tier <level>              quick | standard | exhaustive (default: exhaustive)
  --scope <path>              Limit analysis to specific directory
  --headless                  Run in headless mode (default: headed)
  --fresh-agent               Spawn fresh agents with zero code context per iteration
  --team                      Enable 3-agent team mode (mutually exclusive with --fresh-agent)
  --headed                    All agents stay headed throughout (--team only)
  --headed=<agents>           Comma-separated: spec,design,hunter (--team only)
  --skip-analysis             Skip code analysis, use provided test table directly
```

| Tier | Categories Included | When to Use |
|------|---------------------|-------------|
| quick | HAPPY only | Smoke test, time-constrained |
| standard | HAPPY + EDGE + REGRESSION | Normal feature verification |
| exhaustive | ALL (+ EXHAUSTIVE + STATE + DESIGN) | Pre-release, critical features |

---

## Phase 0: Setup

1. **Parse arguments** — extract URL, spec source, loop count, tier, headed/headless flag
2. **Clean tree check:**
   ```bash
   git status --porcelain
   ```
   If dirty → AskUserQuestion: commit, stash, or abort.

3. **Verify playwright-cli:**
   ```bash
   which playwright-cli 2>/dev/null && playwright-cli --version || echo "AGENT_BROWSER_NOT_FOUND"
   ```
   If not found → BLOCKED. Tell user: `npm install -g playwright-cli` or check `~/.agents/skills/playwright-cli/`.

4. **Launch browser (headed by default):**
   ```bash
   # Default: headed mode (visible browser window)
   playwright-cli open {target_url} --headed

   # If --headless flag was passed:
   playwright-cli open {target_url}
   ```

5. **Detect base branch:**
   ```bash
   gh pr view --json baseRefName -q .baseRefName 2>/dev/null || \
   gh repo view --json defaultBranchRef -q .defaultBranchRef.name 2>/dev/null || \
   echo "main"
   ```

6. **Diff-aware scoping:**
   ```bash
   git diff <base>..HEAD --name-only
   ```
   Filter to UI-relevant files (`.tsx`, `.ts` in `views/`, `features/`, `components/`, `pages/`).

---

## Phase 1: Analyze

Goal: Understand the feature deeply enough to generate tests that cover 99.9% of real usage.

### 1.1 Spec Resolution

Priority cascade for test scenario source:

```
1. --spec argument (Notion URL / file path / "inline")
2. Serena task memory: current_tasks → task_{NNNN}_* → Notion URL + Inkdrop PR note
3. Code diff analysis only (default)
```

Resolution steps:
```
# Priority 1: explicit --spec argument
IF --spec provided:
  spec_source = fetch(--spec)  # Notion MCP, Read, or inline parse

# Priority 2: Serena task memory
ELSE IF Serena available:
  mcp__serena__read_memory("current_tasks")
  → find active task → read task_{NNNN}_* memory
  → extract Notion URL or Inkdrop note ID
  → fetch spec content via Notion MCP / Inkdrop MCP
  spec_source = fetched content

# Priority 3: code-only (existing behavior)
ELSE:
  spec_source = null  # rely on code analysis + diff
```

When Spec is found:
- Every Spec requirement becomes at least 1 HAPPY test case
- Spec-derived tests are marked `Owner: Spec` in the test table
- Code analysis still generates EDGE / EXHAUSTIVE / STATE / REGRESSION tests

### 1.2 Code Analysis (Serena)

Use Serena tools to read changed components:

```
mcp__serena__get_symbols_overview  → identify components, hooks, handlers
mcp__serena__find_symbol           → read specific function bodies (name_path_pattern required)
mcp__serena__search_for_pattern    → find disabled conditions, validation rules
mcp__serena__find_referencing_symbols → trace how components are used
```

Extract and document:
- **UI components**: buttons, forms, modals, dropdowns — their enabled/disabled conditions
- **State management**: useState/useReducer/context — what triggers state changes
- **API calls**: endpoints, request payloads, error handling
- **Validation rules**: Zod schemas, form validators, business logic guards
- **Edge case triggers**: conditions that disable submit, reset state, or show errors

### 1.3 Framework Docs (Context7)

Look up framework-specific behavior for the detected tech stack:

```
mcp__context7__resolve-library-id  → resolve library (e.g., "react", "next.js", "chakra-ui")
mcp__context7__query-docs          → get relevant API behavior, known quirks
```

This informs browser workarounds (modal handling, dropdown interaction, etc.).

### 1.4 Spec Analysis

Fetch spec from the resolved source (1.1):
- **Notion URL** → `mcp__claude_ai_Notion__notion-fetch`
- **Markdown file** → Read tool
- **Inline** → parse from user message
- **Serena memory** → already fetched in 1.1

Extract: acceptance criteria, required behaviors, edge cases mentioned in spec.

### 1.5 Figma Resolution (`--team` only)

3-tier fallback for Design Checker reference:

```
# Tier 1: Serena task memory → Figma URL
IF Serena available:
  task memory → Figma URL in task_{NNNN}_* → Figma Desktop MCP
  design_reference = "figma"

# Tier 2: Ask user for design spec
ELSE IF no Figma URL:
  AskUserQuestion: "Design reference for Design Checker?"
  A) Figma URL (provide URL)
  B) Design spec file (provide path)
  C) No design reference — use HIG guidelines
  design_reference = user_response

# Tier 3: Apple HIG fallback
ELSE:
  design_reference = "hig"
  # Design Checker evaluates against:
  #   - Tap areas >= 44x44px
  #   - Contrast ratio WCAG 2.2 AA+
  #   - Spacing on 4/8 grid
  #   - Interactive elements have visual feedback
  #   - Corner radius consistency
```

### 1.6 Structured Analysis (Sequential Thinking)

Use `mcp__sequential-thinking__sequentialthinking` to synthesize code + spec + docs:

1. Map UI components → user interactions → state transitions
2. Identify untested paths: disabled states, error boundaries, concurrent operations
3. Cross-reference spec requirements with actual implementation gaps

Write structured analysis to working memory (not a file):

```
## Feature Analysis: {feature_name}
### Components: [list with file paths]
### State Transitions: [state machine description]
### API Endpoints: [method, path, payload shape]
### Disabled Conditions: [when buttons/inputs become disabled and why]
### Validation Rules: [what gets rejected and error messages]
### Edge Case Triggers: [specific conditions from code]
### Framework Quirks: [from Context7 lookup]
### Spec Requirements: [from spec resolution, if available]
### Design Reference: [figma | hig | user-provided spec] (--team only)
```

---

## Phase 2: Generate Test Cases

Use `mcp__sequential-thinking__sequentialthinking` to systematically generate test cases
from the analysis using the taxonomy in `references/test-case-taxonomy.md`.

### Coverage Targets by Tier

| Category | quick | standard | exhaustive |
|----------|-------|----------|------------|
| HAPPY | All | All | All |
| EDGE | Skip | All | All |
| EXHAUSTIVE | Skip | Skip | All |
| REGRESSION | Skip | All | All |
| STATE | Skip | Skip | All |
| DESIGN | Skip | Skip | All (`--team` only) |

### Test Table Format

Generate a markdown table. In `--team` mode, include `Owner` and `Agent` columns:

```markdown
<!-- Standard mode (Mode A/B) -->
| ID | Cat | Description | Preconditions | Steps | Expected |
|----|-----|-------------|---------------|-------|----------|
| TC01 | HAPPY | Basic form submit | Logged in | 1. Fill form... | Success toast |

<!-- Team mode (Mode C) — extended table -->
| ID | Cat | Owner | Agent | Description | Steps | Expected |
|----|-----|-------|-------|-------------|-------|----------|
| TC01 | HAPPY | Spec | Main | requirement 1 | ... | ... |
| TC02 | REGRESSION | Diff | Main | changed code path | ... | ... |
| DC01 | DESIGN | Figma | Design | button color match | ... | ... |
| DC02 | DESIGN | HIG | Design | tap area >= 44px | ... | ... |
| BH01 | EDGE | Code | Hunter | boundary test | ... | ... |
| BH02 | EXHAUSTIVE | Code | Hunter | rapid-fire clicks | ... | ... |
```

**Owner** values: `Spec` (from spec document), `Diff` (from code diff), `Code` (from code analysis), `Figma` (from Figma reference), `HIG` (from Apple HIG guidelines).

### Test Distribution (`--team` mode)

| Agent | Receives |
|-------|----------|
| Main (Spec Tester) | HAPPY (Spec) + REGRESSION (Diff) |
| Design Checker | DESIGN tests + screenshots of Main's completed TCs |
| Bug Hunter | EDGE + EXHAUSTIVE + STATE + license for freestyle attacks |

Bug Hunter is explicitly encouraged to invent additional destructive tests beyond
the planned table (rapid clicks, URL manipulation, form interruption, back button
abuse, etc.). These ad-hoc findings are reported as BH_AD_XX.

### Approval Gate

Present the generated test table to the user via AskUserQuestion:

> "Generated {N} test cases across {categories}. Review the table above."
> A) Approve and execute
> B) Add more test cases (describe what's missing)
> C) Remove some test cases (specify IDs)
> D) Regenerate with different tier

**Do not proceed to Phase 3 until user approves.**

---

## Phase 3: Execute

### Auth Resolution

Read auth credentials from Serena memory:
```
mcp__serena__read_memory("test_accounts_and_permissions")
```
If no memory exists, AskUserQuestion for login credentials.

### Browser Workarounds

Read `references/browser-workarounds.md` and apply relevant workarounds based on
the tech stack detected in Phase 1.

### Mode A: Main Claude Direct (default)

Main Claude executes tests directly via playwright-cli. While you have code context
from Phase 1, **follow test steps literally** — do not take shortcuts or skip steps
based on implementation knowledge.

For each iteration (1 to N):

```
## Iteration {N}

For EACH test case in the approved table:

1. Navigate to the precondition state
   playwright-cli open {url} --headed
   playwright-cli snapshot

2. Execute each step literally
   playwright-cli click @ref
   playwright-cli fill @ref "value"
   playwright-cli snapshot            # re-snapshot after DOM changes

3. Screenshot after each significant action
   playwright-cli screenshot --filename=/tmp/qa_iter{N}_tc{ID}_{step}.png

4. Record result: PASS, FAIL, or BLOCKED (with reason)

5. If FAIL: capture current page state
   playwright-cli snapshot
   playwright-cli console error
   playwright-cli console

6. Continue to next test case regardless of result
```

### Mode B: Fresh Agent (`--fresh-agent`)

Spawns a **new agent per iteration** with zero implementation context. The executor
sees ONLY the test table, URL, auth, and browser commands — no source code.

This is the software equivalent of double-blind testing: the agent that wrote the code
is NOT the one testing it.

For each iteration, spawn:

```
Agent(
  name: "qa-executor-iter-{N}",
  model: "sonnet",
  mode: "bypassPermissions",
  run_in_background: false,
  prompt: <executor prompt below>
)
```

**Executor Prompt Template** (the ONLY context the fresh agent receives):

```
You are a QA tester. You have NO knowledge of the application's source code or
implementation. Execute each test case exactly as written, using browser automation.

## Browser Commands
playwright-cli open <url> --headed    # Navigate (visible browser)
playwright-cli snapshot              # Get interactive elements with refs
playwright-cli click e1              # Click element by ref
playwright-cli fill e1 "text"        # Fill input
playwright-cli press Enter            # Press key
playwright-cli screenshot <path>      # Take screenshot
playwright-cli eval "js code"         # Run JavaScript
playwright-cli run-code "async page => await page.waitForLoadState('networkidle')" # Wait for page load
playwright-cli console error                 # Check JS errors
playwright-cli console                # Check console messages

## Auth
URL: {target_url}
Email: {email}
Password: {password}
Login steps: {login_flow_steps}

## Browser Workarounds
{relevant_workarounds_from_references}

## Test Cases
{approved_test_table}

## Instructions
For EACH test case:
1. Navigate to the precondition state
2. Execute each step literally — do not infer shortcuts
3. Screenshot after each action: playwright-cli screenshot --filename=/tmp/qa_iter{N}_tc{ID}_{step}.png
4. Record result: PASS, FAIL, or BLOCKED (with reason)
5. If FAIL: run `playwright-cli console error` and `playwright-cli network`, capture output
6. Continue to the next test case regardless of result

## Output Format
Return a JSON array:
[
  {
    "id": "TC01",
    "status": "PASS|FAIL|BLOCKED",
    "observations": "what you actually saw",
    "screenshots": ["/tmp/qa_iter1_tc01_step1.png"],
    "error": null or "error description"
  }
]
```

**Fresh Agent troubleshooting** (common failure causes):
- `playwright-cli` not found → ensure PATH includes the binary location in the prompt
- Auth fails → verify credentials are correctly interpolated, not placeholder text
- Timeout → increase Agent timeout or reduce test case count per iteration
- If an agent fails, capture its error output and continue to the next iteration

### Mode C: Team (`--team`)

Spawns 3 coordinated agents, each with their own `playwright-cli` session. Agents
communicate state changes via `SendMessage` to avoid operating on stale/deleted data.

**`--team` and `--fresh-agent` are mutually exclusive.**

#### 3.C.0 Team Setup

```
# Create the team
TeamCreate("qa-team")
```

Distribute test cases by role:
- Main receives: HAPPY (Spec) + REGRESSION (Diff) test cases
- Design Checker receives: DESIGN test cases + Figma/HIG reference
- Bug Hunter receives: EDGE + EXHAUSTIVE + STATE test cases + freestyle license

Share auth credentials with all agents (interpolated into agent prompts in 3.C.2).

**Recommended: minimum 2 iterations** for team mode — state interaction between
agents is the primary value of coordinated testing.

#### 3.C.1 Auth Phase (all headed, parallel)

All 3 agents start **headed** for login, then non-Main agents restart headless
(unless `--headed` flag keeps them headed).

```
# All 3 agents in parallel:
# Main (Spec Tester)
playwright-cli -s=qa-spec open {target_url} --headed
# → complete login flow
playwright-cli -s=qa-spec state-save /tmp/qa-auth-spec.json

# Design Checker
playwright-cli -s=qa-design open {target_url} --headed
# → complete login flow
playwright-cli -s=qa-design state-save /tmp/qa-auth-design.json

# Bug Hunter
playwright-cli -s=qa-hunter open {target_url} --headed
# → complete login flow
playwright-cli -s=qa-hunter state-save /tmp/qa-auth-hunter.json
```

Default post-auth behavior:
```
Main: stays headed (always)
Design Checker + Bug Hunter:
  playwright-cli -s=<name> close
  playwright-cli -s=<name> open {target_url} --headless
  playwright-cli -s=<name> state-load /tmp/qa-auth-<name>.json
```

Override with flags:
- `--headed` → all agents stay headed throughout
- `--headed=spec,design` → only spec and design stay headed, hunter goes headless
- `--headless` → all agents go headless after auth (including Main)

#### 3.C.2 Agent Spawn

Spawn Design Checker and Bug Hunter as background agents:

```
Agent(
  name: "qa-design-checker",
  model: "sonnet",
  mode: "bypassPermissions",
  run_in_background: false,
  prompt: <Design Checker prompt from references/team-agent-prompts.md>
    interpolated with: {target_url}, {email}, {password}, {login_flow_steps},
    {relevant_workarounds}, {design_reference_section}, {design_test_cases}
)

Agent(
  name: "qa-bug-hunter",
  model: "sonnet",
  mode: "bypassPermissions",
  run_in_background: false,
  prompt: <Bug Hunter prompt from references/team-agent-prompts.md>
    interpolated with: {target_url}, {email}, {password}, {login_flow_steps},
    {relevant_workarounds}, {hunter_test_cases}
)
```

#### 3.C.3 Iteration Loop

For each iteration (1 to N), all agents run concurrently:

**Main (Spec Tester)** — coordinator:
```
1. Execute HAPPY + REGRESSION tests sequentially
2. Screenshot after each action
3. On data change → SendMessage to qa-team:
   { action: "created|deleted|modified|navigated", target: "...", detail: "..." }
4. After completing a TC, notify Design Checker with screen URL/path
5. Record results as JSON
```

**Design Checker** (concurrent):
```
1. Wait for Main to complete each TC → receive notification
2. Navigate to the same screen via own session
3. Take screenshot: playwright-cli -s=qa-design screenshot
4. If Figma URL available:
   - Get Figma node screenshot via Figma Desktop MCP
   - Semantic comparison: color, layout, element presence, text
5. If no Figma:
   - Evaluate against Apple HIG checklist
6. Record findings with severity: critical | minor | acceptable
```

**Bug Hunter** (concurrent):
```
1. Execute EDGE + EXHAUSTIVE + STATE tests
2. Check incoming messages before each TC (avoid stale data)
3. On data change → SendMessage to qa-team
4. Perform freestyle attacks between planned TCs:
   - Rapid repeated clicks (20x)
   - URL direct entry with invalid IDs
   - Form mid-fill abandonment → return
   - Back/forward button abuse
   - Browser tab close → reopen
   - Resize window during interaction
5. Record all findings including ad-hoc discoveries (BH_AD_XX)
```

#### 3.C.4 SendMessage Protocol

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

### Between Iterations (all modes)

- Do NOT clear test data — accumulated state is the point
- Do NOT close/reopen the browser between iterations
- Log observations about data growth or UI changes
- (`--team` mode) All agents continue with their existing sessions

---

## Phase 4: Compare Results

After all iterations complete, classify each test case:

| Pattern | Classification | Meaning |
|---------|---------------|---------|
| PASS → PASS → PASS | CONSISTENT-PASS | Stable — no issues |
| FAIL → FAIL → FAIL | CONSISTENT-FAIL | Reproducible bug |
| PASS → FAIL → FAIL | STATE-DEPENDENT | Data accumulation bug |
| PASS → PASS → FAIL | ACCUMULATION | Progressive degradation |
| Mixed (no pattern) | FLAKY | Timing/race condition |
| FAIL → PASS → PASS | SELF-HEALING | Possible test env issue |

---

## Phase 5: Report

Generate the final report. In `--team` mode, include additional sections.

### Standard Report (Mode A/B)

```markdown
# Exhaustive QA Report — {feature_name}
**Branch**: {branch} | **Date**: {date} | **Loops**: {N} | **Tier**: {tier}
**Browser**: playwright-cli (headed) | **Executor**: {Main Claude | Fresh Agent}

## Summary
| Metric | Count |
|--------|-------|
| Total test cases | {total} |
| PASS | {pass} |
| FAIL | {fail} |
| STATE-DEPENDENT | {state_dep} |
| FLAKY | {flaky} |
| Coverage | {pass/total * 100}% |

## Results
| ID | Cat | Description | Iter1 | Iter2 | Iter3 | Verdict | Notes |
|----|-----|-------------|-------|-------|-------|---------|-------|

## State-Dependent Issues (ACTION REQUIRED)
{detailed description of each STATE-DEPENDENT finding}

## Screenshots
{organized by test case and iteration}
```

### Team Report (Mode C) — Extended Sections

When `--team` is used, the report includes these additional sections:

```markdown
# Exhaustive QA Report — {feature_name}
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
| (untested) | - | UNTESTED |

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

**Spec Coverage section**: When Spec was used as test source, maps every Spec
requirement to test case IDs and pass/fail status. Any requirement without a TC
is flagged as "UNTESTED".

### Save Report

```bash
mkdir -p .gstack/qa-reports
# Save as: .gstack/qa-reports/exhaustive-{date}-{branch}.md
```

Present summary to user. If any FAIL or STATE-DEPENDENT issues found, offer to investigate.

---

## Quick Reference

```
/exhaustive-qa http://localhost:8080                         # Full exhaustive QA (headed, Main Claude)
/exhaustive-qa http://localhost:3000 --loops 1               # Single pass
/exhaustive-qa http://localhost:8080 --tier standard         # Skip exhaustive category
/exhaustive-qa http://localhost:8080 --headless              # Headless mode
/exhaustive-qa http://localhost:8080 --fresh-agent           # Bias-free double-blind testing
/exhaustive-qa http://localhost:8080 --fresh-agent --loops 5 # Extended fresh agent testing
/exhaustive-qa http://localhost:8080 --team                  # 3-agent team QA (Design + Hunter)
/exhaustive-qa http://localhost:8080 --team --headed         # Team, all agents headed
/exhaustive-qa http://localhost:8080 --team --headed=design  # Team, only design stays headed
/exhaustive-qa http://localhost:8080 --spec notion://... --scope src/features/split
/exhaustive-qa http://localhost:8080 --team --spec notion://... # Team + spec-based testing
```
