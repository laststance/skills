# Team QA Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend exhaustive-real-world-scenario-qa with a 3-agent Team mode (`--team`) that coordinates Main (Spec Tester), Design Checker, and Bug Hunter via SendMessage for multi-session browser testing.

**Architecture:** Add Mode C (Team) alongside existing Mode A (Main) and Mode B (Fresh Agent). Extend Phase 1 with Spec Resolution and Figma Resolution. Add DESIGN test category. Team agents use separate `playwright-cli -s=<name>` instances and communicate state changes via SendMessage protocol.

**Tech Stack:** Claude Code Teams (TeamCreate/SendMessage), playwright-cli sessions, Figma Desktop MCP (optional), Serena memory, sequential-thinking

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `references/test-case-taxonomy.md` | Modify | Add DESIGN category section |
| `references/team-agent-prompts.md` | Create | Prompt templates for Design Checker and Bug Hunter agents |
| `SKILL.md` (frontmatter + description) | Modify | Update description to mention Team mode |
| `SKILL.md` (Arguments section) | Modify | Add --team, --headed, --headless flags |
| `SKILL.md` (Phase 1) | Modify | Add 1.1 Spec Resolution, 1.2 Figma Resolution, renumber existing |
| `SKILL.md` (Phase 2) | Modify | Add Owner column, test distribution table, DESIGN in tier table |
| `SKILL.md` (Phase 3) | Modify | Add Mode C: Team (setup, auth, iteration loop, SendMessage) |
| `SKILL.md` (Phase 4-5) | Modify | Extended report format, Spec Coverage, Design Compliance sections |
| `SKILL.md` (Quick Reference) | Modify | Add --team examples |

---

### Task 1: Add DESIGN category to test-case-taxonomy.md

**Files:**
- Modify: `references/test-case-taxonomy.md` (append after STATE section, line ~135)

- [ ] **Step 1: Add DESIGN category section**

Append the following after the `## STATE` section (after line 135):

````markdown

---

## DESIGN -- Visual & UI Compliance

**Purpose**: Verify that the implemented UI matches the design reference (Figma, design spec,
or industry guidelines). Catches visual regressions, spacing inconsistencies, color mismatches,
and accessibility violations.

**Reference sources** (priority cascade):
1. Figma URL (via Figma Desktop MCP for screenshot comparison)
2. User-provided design spec (image or document)
3. Apple HIG / industry standard guidelines (fallback)

### Generation Checklist

- [ ] Color accuracy: buttons, backgrounds, text colors match reference
- [ ] Spacing: margins, padding follow 4/8 grid system
- [ ] Typography: font size, weight, line-height match design
- [ ] Element presence: all designed elements exist in implementation
- [ ] Interactive feedback: hover, focus, active states visible
- [ ] Tap target size: >= 44x44px for interactive elements
- [ ] Contrast ratio: WCAG 2.2 AA+ (4.5:1 text, 3:1 large text)
- [ ] Corner radius: consistent with design system (4/8/12/20px)
- [ ] Responsive behavior: layout adapts correctly at breakpoints
- [ ] Dark/light mode: colors adapt if theme support exists

### Severity Levels

| Severity | Criteria | Example |
|----------|----------|---------|
| critical | Functional impact or major visual deviation | Wrong color on CTA button, missing element |
| minor | Noticeable but not blocking | 2px spacing difference, slightly wrong font weight |
| acceptable | Within tolerance or subjective | Minor shadow difference, 1px alignment offset |

### Examples

| Pattern | Test Case |
|---------|-----------|
| Color match | Primary button background matches Figma hex value |
| Spacing grid | Card margins are multiples of 8px |
| Tap area | All buttons/links have >= 44x44px clickable area |
| Contrast | Text on colored backgrounds meets WCAG AA ratio |
| Element presence | All icons, labels, dividers from design exist |
| Responsive | Layout switches from 2-column to 1-column at mobile breakpoint |
````

- [ ] **Step 2: Verify the file is valid markdown**

Run: `cat ~/.claude/skills/exhaustive-real-world-scenario-qa/references/test-case-taxonomy.md | wc -l`
Expected: ~195 lines (was ~135, added ~60)

- [ ] **Step 3: Commit**

```bash
cd ~/.claude/skills/exhaustive-real-world-scenario-qa
git add references/test-case-taxonomy.md
git commit -m "feat(qa): add DESIGN category to test case taxonomy"
```

---

### Task 2: Create team-agent-prompts.md

**Files:**
- Create: `references/team-agent-prompts.md`

- [ ] **Step 1: Write the Design Checker prompt template**

Create `references/team-agent-prompts.md` with the following content:

````markdown
# Team Agent Prompt Templates

Prompt templates for the Design Checker and Bug Hunter agents in `--team` mode.
Main (Spec Tester) does not need a template — it runs as the coordinator in the
main Claude session.

Variables in `{curly_braces}` are interpolated at runtime by the coordinator.

---

## Design Checker

```
You are a Design Checker agent in a QA team. Your job is to verify that the
implemented UI matches the design reference. You are NOT testing functionality
— that's the Spec Tester's job. You focus exclusively on visual accuracy.

## Your Browser Session
playwright-cli -s=qa-design

## Browser Commands
playwright-cli -s=qa-design open <url> --headed
playwright-cli -s=qa-design snapshot
playwright-cli -s=qa-design click @e1
playwright-cli -s=qa-design screenshot --filename=<path>
playwright-cli -s=qa-design evaluate "js code"
playwright-cli -s=qa-design run-code "async page => await page.waitForLoadState('networkidle')"

## Auth
URL: {target_url}
Email: {email}
Password: {password}
Login steps: {login_flow_steps}

## Browser Workarounds
{relevant_workarounds}

## Design Reference
{design_reference_section}

## Test Cases
{design_test_cases}

## Communication Protocol
You are part of a team. Use SendMessage to communicate:
- Listen for messages from Spec Tester about completed test cases and data changes
- After Spec Tester completes a TC, navigate to the same screen and verify design
- Send "completed" when all your test cases are done

Message format:
SendMessage(to: "qa-team", message: JSON.stringify({
  action: "completed | warning",
  target: "screen or element identifier",
  detail: "human-readable description",
  tc_id: "DC01"
}))

## Evaluation Method

### With Figma Reference (Tier 1-2)
When a Figma URL or design spec is provided:
1. Navigate to the screen under test
2. Take screenshot: playwright-cli -s=qa-design screenshot --filename=/tmp/qa_design_dc{ID}.png
3. Compare against Figma reference (semantic comparison, NOT pixel-perfect):
   - Color: hex values match within tolerance (allow +/- 5 for RGB)
   - Layout: element positions and sizes match design
   - Element presence: all designed elements exist
   - Text: content matches, font size/weight approximate
4. Record finding with severity: critical | minor | acceptable

### Without Figma (Tier 3 — HIG Fallback)
When no design reference is available, evaluate against Apple HIG checklist:
- [ ] Tap targets >= 44x44px
- [ ] Contrast ratio WCAG 2.2 AA+ (use: playwright-cli evaluate to compute)
- [ ] Spacing follows 4/8 grid
- [ ] Interactive elements have visible feedback (hover, focus, active)
- [ ] Corner radius is consistent across similar elements
- [ ] Typography hierarchy is clear (headings vs body)

## Output Format
Return a JSON array:
[
  {
    "id": "DC01",
    "element": "primary button",
    "reference": "Figma: #1976D2, 44x40px",
    "actual": "measured: #1976D2, 44x40px",
    "severity": "acceptable",
    "screenshot": "/tmp/qa_design_dc01.png",
    "notes": "Color match, size match"
  }
]
```

---

## Bug Hunter (Devil's Advocate)

```
You are a Bug Hunter agent in a QA team. Your mission: BREAK THE UI. You are the
devil's advocate. Test every edge case, abuse every input, and find every bug that
a developer would never think to test.

You have full creative license to invent destructive tests beyond the planned table.
Report ad-hoc findings as BH_AD_XX.

## Your Browser Session
playwright-cli -s=qa-hunter

## Browser Commands
playwright-cli -s=qa-hunter open <url> --headed
playwright-cli -s=qa-hunter snapshot
playwright-cli -s=qa-hunter click @e1
playwright-cli -s=qa-hunter fill @e1 "text"
playwright-cli -s=qa-hunter press Enter
playwright-cli -s=qa-hunter screenshot --filename=<path>
playwright-cli -s=qa-hunter evaluate "js code"
playwright-cli -s=qa-hunter run-code "async page => await page.waitForLoadState('networkidle')"
playwright-cli -s=qa-hunter back
playwright-cli -s=qa-hunter forward
playwright-cli -s=qa-hunter reload

## Auth
URL: {target_url}
Email: {email}
Password: {password}
Login steps: {login_flow_steps}

## Browser Workarounds
{relevant_workarounds}

## Test Cases (Planned)
{hunter_test_cases}

## Communication Protocol
You are part of a team. Use SendMessage to communicate:
- MUST send "warning" before destructive tests (deleting data, corrupting state)
- MUST send message when creating or deleting test data
- Check incoming messages before each test case to avoid operating on deleted data

Message format:
SendMessage(to: "qa-team", message: JSON.stringify({
  action: "created | deleted | modified | warning | completed",
  target: "resource identifier",
  detail: "human-readable description",
  tc_id: "BH01"
}))

## Freestyle Attack Playbook
Beyond the planned test cases, aggressively try these attacks:

### Rapid-Fire
- Click the same button 20x rapidly
- Submit the same form 5x in quick succession
- Toggle a switch on/off 10x rapidly

### URL Manipulation
- Navigate directly to URLs with invalid IDs (e.g., /drawings/99999)
- Modify URL parameters to unexpected values
- Use browser back/forward through deleted resources

### Form Abuse
- Fill a form halfway → navigate away → return → check state
- Submit with maximum-length strings (500+ chars)
- Paste HTML/script tags into text fields
- Upload files with unusual names (spaces, unicode, very long)

### State Corruption
- Open the same resource in two tabs → modify in both
- Delete an item while a modal referencing it is open
- Navigate during an active API request (spinner visible)

### Browser Abuse
- Resize window during interaction (check responsive breakpoints)
- Zoom to 150% and 50% → check layout
- Use browser back button during multi-step flow
- Close tab during operation → reopen → check state

## Output Format
Return a JSON array (include both planned and ad-hoc findings):
[
  {
    "id": "BH01",
    "type": "planned",
    "attack": "rapid click on save button",
    "result": "PASS — only 1 save executed",
    "severity": "n/a",
    "screenshot": "/tmp/qa_hunter_bh01.png"
  },
  {
    "id": "BH_AD_01",
    "type": "ad-hoc",
    "attack": "pasted <script>alert(1)</script> into name field",
    "result": "FAIL — script tag rendered as HTML",
    "severity": "critical",
    "screenshot": "/tmp/qa_hunter_bh_ad_01.png"
  }
]
```
````

- [ ] **Step 2: Verify file created**

Run: `ls -la ~/.claude/skills/exhaustive-real-world-scenario-qa/references/team-agent-prompts.md`
Expected: file exists, ~180 lines

- [ ] **Step 3: Commit**

```bash
cd ~/.claude/skills/exhaustive-real-world-scenario-qa
git add references/team-agent-prompts.md
git commit -m "feat(qa): add team agent prompt templates for Design Checker and Bug Hunter"
```

---

### Task 3: Update SKILL.md — Frontmatter, Description, and Arguments

**Files:**
- Modify: `SKILL.md` (lines 1-63)

- [ ] **Step 1: Update frontmatter description**

Replace the existing `description:` value (line 3) with:

```
description: "Exhaustive Real World Scenario QA testing via playwright-cli (headed mode default). Analyzes source code + spec using Serena/sequential-thinking/Context7 to generate test cases with 99.9% happy path coverage + TC3-style exhaustive edge cases. Three execution modes: Main Claude (default), Fresh Agent (--fresh-agent) for bias-free testing, Team (--team) for 3-agent coordinated testing with Design Checker + Bug Hunter. Loops 3x to catch state-dependent bugs. Use PROACTIVELY when: '/exhaustive-qa', 'real world scenario test', 'exhaustive QA', 'browser QA', 'team QA', after feature implementation, or when thorough browser-based verification is needed."
```

- [ ] **Step 2: Update description paragraph**

Replace lines 13-18 (the "Two execution modes" block) with:

```markdown
Three execution modes:
- **Main Claude (default)** — direct execution, real-time adaptation, simpler error handling
- **Fresh Agent (`--fresh-agent`)** — spawns agents with zero code context for bias-free
  double-blind testing (the executor has NO knowledge of your implementation)
- **Team (`--team`)** — 3-agent coordinated testing: Main (Spec Tester) + Design Checker
  + Bug Hunter, each with their own browser session, communicating via SendMessage
```

- [ ] **Step 3: Update Arguments section**

Replace the Arguments code block (lines 46-57) with:

````markdown
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
````

- [ ] **Step 4: Add DESIGN to Coverage Targets by Tier table**

Replace the tier table (lines 59-63) with:

```markdown
| Tier | Categories Included | When to Use |
|------|---------------------|-------------|
| quick | HAPPY only | Smoke test, time-constrained |
| standard | HAPPY + EDGE + REGRESSION | Normal feature verification |
| exhaustive | ALL (+ EXHAUSTIVE + STATE + DESIGN) | Pre-release, critical features |
```

- [ ] **Step 5: Commit**

```bash
cd ~/.claude/skills/exhaustive-real-world-scenario-qa
git add SKILL.md
git commit -m "feat(qa): update SKILL.md frontmatter, description, and arguments for --team mode"
```

---

### Task 4: Update SKILL.md — Phase 1 Extensions (Spec + Figma Resolution)

**Files:**
- Modify: `SKILL.md` Phase 1 section (lines 106-167)

- [ ] **Step 1: Restructure Phase 1 with Spec Resolution**

Replace the Phase 1 section header and subsections. The new structure:
- 1.1 Spec Resolution (NEW)
- 1.2 Code Analysis (was 1.1)
- 1.3 Framework Docs (was 1.2)
- 1.4 Spec Analysis (was 1.3, modified to use resolved spec)
- 1.5 Figma Resolution (NEW, --team only)
- 1.6 Structured Analysis (was 1.4)

Replace everything from `## Phase 1: Analyze` through the structured analysis output block with:

````markdown
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
````

- [ ] **Step 2: Verify Phase 1 reads correctly**

Read SKILL.md and confirm Phase 1 has 6 subsections (1.1-1.6) and flows logically.

- [ ] **Step 3: Commit**

```bash
cd ~/.claude/skills/exhaustive-real-world-scenario-qa
git add SKILL.md
git commit -m "feat(qa): add Spec Resolution and Figma Resolution to Phase 1"
```

---

### Task 5: Update SKILL.md — Phase 2 Extensions (Owner, Distribution, DESIGN)

**Files:**
- Modify: `SKILL.md` Phase 2 section (lines 170-210)

- [ ] **Step 1: Update Phase 2 with Owner column and distribution**

Replace the Phase 2 section (from `## Phase 2: Generate Test Cases` through `**Do not proceed to Phase 3 until user approves.**`) with:

````markdown
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
````

- [ ] **Step 2: Commit**

```bash
cd ~/.claude/skills/exhaustive-real-world-scenario-qa
git add SKILL.md
git commit -m "feat(qa): extend Phase 2 with Owner column, DESIGN category, and team distribution"
```

---

### Task 6: Update SKILL.md — Phase 3 Mode C: Team

**Files:**
- Modify: `SKILL.md` Phase 3 section (lines 212-345)

This is the largest task. Add Mode C between Mode B and "Between Iterations".

- [ ] **Step 1: Add Mode C: Team section after Mode B**

Insert the following after the Mode B section (after the "Fresh Agent troubleshooting" block, before "### Between Iterations"):

````markdown

### Mode C: Team (`--team`)

Spawns 3 coordinated agents, each with their own `playwright-cli` session. Agents
communicate state changes via `SendMessage` to avoid operating on stale/deleted data.

**`--team` and `--fresh-agent` are mutually exclusive.**

#### 3.C.0 Team Setup

```bash
# Create the team
TeamCreate("qa-team")
```

Distribute test cases by role:
- Main receives: HAPPY (Spec) + REGRESSION (Diff) test cases
- Design Checker receives: DESIGN test cases + Figma/HIG reference
- Bug Hunter receives: EDGE + EXHAUSTIVE + STATE test cases + freestyle license

#### 3.C.1 Auth Phase (all headed, parallel)

All 3 agents start **headed** for login, then non-Main agents restart headless
(unless `--headed` flag keeps them headed).

```bash
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
````

- [ ] **Step 2: Update "Between Iterations" to account for team mode**

Replace the existing "Between Iterations" section with:

```markdown
### Between Iterations (all modes)

- Do NOT clear test data — accumulated state is the point
- Do NOT close/reopen the browser between iterations
- Log observations about data growth or UI changes
- (`--team` mode) All agents continue with their existing sessions
```

- [ ] **Step 3: Commit**

```bash
cd ~/.claude/skills/exhaustive-real-world-scenario-qa
git add SKILL.md
git commit -m "feat(qa): add Phase 3 Mode C: Team execution with SendMessage protocol"
```

---

### Task 7: Update SKILL.md — Phase 4-5 Report Extensions + Quick Reference

**Files:**
- Modify: `SKILL.md` Phase 4, Phase 5, and Quick Reference sections

- [ ] **Step 1: Update Phase 5 report template**

Replace the Phase 5 report template (the markdown block inside the code fence) with:

````markdown
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
````

- [ ] **Step 2: Update Quick Reference**

Replace the Quick Reference section with:

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
cd ~/.claude/skills/exhaustive-real-world-scenario-qa
git add SKILL.md
git commit -m "feat(qa): extend Phase 5 report format and Quick Reference for team mode"
```

---

### Task 8: Final Review and Verification

**Files:**
- All modified files in `~/.claude/skills/exhaustive-real-world-scenario-qa/`

- [ ] **Step 1: Verify all files exist and are reasonable size**

```bash
cd ~/.claude/skills/exhaustive-real-world-scenario-qa
echo "--- SKILL.md ---"
wc -l SKILL.md
echo "--- test-case-taxonomy.md ---"
wc -l references/test-case-taxonomy.md
echo "--- team-agent-prompts.md ---"
wc -l references/team-agent-prompts.md
echo "--- browser-workarounds.md ---"
wc -l references/browser-workarounds.md
```

Expected approximate sizes:
- SKILL.md: ~600 lines (was 415, added ~185)
- test-case-taxonomy.md: ~195 lines (was 135, added ~60)
- team-agent-prompts.md: ~180 lines (new)
- browser-workarounds.md: ~250 lines (unchanged from previous update)

- [ ] **Step 2: Cross-check design spec coverage**

Verify every section of `specs/2026-04-02-team-qa-mode-design.md` has a corresponding implementation:

| Spec Section | Implemented In |
|-------------|----------------|
| Team Composition table | SKILL.md Phase 3 Mode C |
| New CLI Arguments | SKILL.md Arguments section |
| Phase 1.1 Spec Resolution | SKILL.md Phase 1.1 |
| Phase 1.2 Figma Resolution | SKILL.md Phase 1.5 |
| Phase 2 Test Table Extension | SKILL.md Phase 2 (Owner column) |
| Phase 2 Test Distribution | SKILL.md Phase 2 (distribution table) |
| Phase 3.0 Team Setup | SKILL.md Phase 3.C.0 |
| Phase 3.1 Auth Phase | SKILL.md Phase 3.C.1 |
| Phase 3.2 Iteration Loop | SKILL.md Phase 3.C.3 |
| Phase 3.3 SendMessage Protocol | SKILL.md Phase 3.C.4 |
| Phase 4-5 Report Structure | SKILL.md Phase 5 Team Report |
| Phase 4-5 Spec Coverage | SKILL.md Phase 5 Spec Coverage section |
| DESIGN category | test-case-taxonomy.md |
| Agent prompts | team-agent-prompts.md |
| Constraints | SKILL.md Arguments (mutually exclusive note) |

- [ ] **Step 3: Grep for consistency**

```bash
cd ~/.claude/skills/exhaustive-real-world-scenario-qa
# Verify --team appears in Arguments, Phase 3, and Quick Reference
grep -c "\-\-team" SKILL.md
# Expected: 8+ occurrences

# Verify SendMessage appears in SKILL.md and prompts
grep -c "SendMessage" SKILL.md references/team-agent-prompts.md
# Expected: 5+ in SKILL.md, 3+ in prompts

# Verify all 3 agent sessions referenced
grep -c "qa-spec\|qa-design\|qa-hunter" SKILL.md references/team-agent-prompts.md
# Expected: multiple occurrences across both files

# Verify DESIGN category in taxonomy
grep "DESIGN" references/test-case-taxonomy.md
# Expected: section header + references
```

- [ ] **Step 4: Final commit (if any cleanup needed)**

```bash
cd ~/.claude/skills/exhaustive-real-world-scenario-qa
git status
# If clean: done
# If changes: git add -A && git commit -m "chore(qa): final cleanup for team mode implementation"
```
