# Test matrix generation — deriving near-100% happy-path coverage

The matrix is a pre-planned checksheet of every happy-path test case the agent
intends to run during Phase 3. Generating it first (before executing) forces
completeness, makes progress legible to the user, and produces a coverage
number you can defend.

**Scope of the matrix**: happy path only — every advertised feature has at
least one case that exercises its primary success path using its primary UI
entrypoint. Edge cases, invalid inputs, race conditions, and unusual
sequences are the job of Phase 9 (Exploratory testing), not the matrix.

## Inputs

You must have completed Phase 1 (Surface mapping) before entering Phase 2.
Phase 1 produced:

- List of windows and webviews (from `playwright-cli --s=default tab-list`)
- Menu bar tree, every top-level menu, every leaf item
- Tray menu items (if the app has a tray icon)
- Interactive-element inventory per surface (from `playwright-cli --s=default snapshot`)
- Secondary windows and how to reach them (Preferences, About, etc.)
- Deep-link protocols the app has registered

If any of these are missing, go back to Phase 1 before deriving the matrix.
An incomplete inventory produces an incomplete matrix.

## Derivation rules

For every match of a rule below, emit at least one row in the matrix.

### Rule 1 — Every interactive element in the main window

For every button, link, menu trigger, form input, checkbox, radio, dropdown,
toggle, slider, etc. with an accessible name from `snapshot -i`:

- **One case**: activate this element in its default state, expect its
  documented effect.
- If the element has visibly different states (disabled / active / loading),
  emit one case per distinguishable state when the app has a deterministic
  way to force that state (e.g. "when offline, the Sync button shows a
  spinner" → one case to force offline and verify the spinner).

### Rule 2 — Every menu bar / hamburger menu leaf item

For each leaf menu item (items that are submenus don't count, but their
children do):

- **One case**: click this menu item, expect its action.
- If the item has a keyboard shortcut documented, **one additional case**
  exercising the shortcut from the keyboard with focus on the main window.

### Rule 3 — Every Preferences panel + every setting inside it

For each tab / section in Preferences:

- **One case**: open this tab (smoke — the tab renders without error).
- For each toggleable setting: **one case** toggling it and verifying the
  in-app effect is visible without requiring a restart (or noting the
  restart requirement).
- For each text input in Preferences: **one case** filling a valid value
  and verifying it persists across Preferences close+reopen.

### Rule 4 — Every documented end-to-end flow

A flow is a multi-step journey: signup, login, logout, create-thing,
edit-thing, share-thing, delete-thing, undo-delete, bulk action, onboarding,
export, import. For each flow:

- **One end-to-end case** from cold app state to the success confirmation.
  Steps should be specific enough that a fresh agent could execute the case
  tomorrow without asking the author.

### Rule 5 — Every empty / full / error state with an intentional design

If the app has a designed state for "empty", "no results", "loading",
"error", "rate limited", "offline banner":

- **One case per state**: force the condition (clear data, block network,
  rate-limit simulate), verify the UI matches the design.

### Rule 6 — Every deep-link / protocol handler

For each declared protocol the app owns (check `Info.plist` on macOS,
registry keys on Windows, `.desktop` file on Linux, or ask the user):

- **One case per common URL shape**. At minimum, one URL that should succeed
  and one that should produce a graceful error.

### Rule 7 — Every persistence surface

Anything the app claims to persist across restarts (recently used, favorites,
last opened, window position, selected theme, signed-in user, draft content):

- **One case**: perform the action, quit, relaunch, verify the state
  survived. This rule alone catches a surprising number of "we thought we
  saved that" bugs.

### Rule 8 — Every cross-surface live-update

If the app shows the same data in two places at once (main list + sidebar
preview, main window + tray menu, item list + detail pane):

- **One case per pair**: change the data in place A, verify place B updates
  — ideally without requiring a refocus. If the update requires a manual
  refresh, note that as a UX issue (`medium` severity, state category) but
  the case still "passes" if the refresh does update.

### Rule 9 — Every keyboard shortcut the app advertises

For shortcuts documented in the menu bar (right column of menu items) OR in
the app's docs OR in the Preferences shortcut editor:

- **One case per shortcut**: focus the main window, press the shortcut,
  verify the expected action.

## Coverage target

**Happy-path coverage goal: ≥ 95%** of matrix cases executed and passing.
Every rule match above **must** produce a matrix row. If a rule has no
matches (e.g. the app has no tray icon, no protocol handler), write "N/A —
no tray" in that section of the matrix rather than omitting the section.

## Process

1. Read `templates/test-matrix-template.md` — this is the skeleton.
2. Walk the Phase 1 inventory surface by surface. For each surface, apply
   rules 1-9 in order.
3. Assign TC-001, TC-002, ... numbers. Number in **execution order** (group
   by surface so the agent isn't thrashing between windows).
4. Save the matrix to
   `./qa-reports/electron-<date>-<app>-<os>/test-matrix.md`.
5. Present a coverage summary to the user **before executing**:
   > "Generated N cases across S surfaces. Estimated execution time: M
   > minutes. Plan to execute all, trim to core flows, or adjust scope?"
6. On user confirmation, proceed to Phase 3 (Execute the matrix).

## Quality checks before showing the matrix to the user

Do not hand a matrix to the user until each row has:

- Unique `TC#` (no gaps, no duplicates)
- `Surface`, `Feature` / `Panel` / `Menu`, `Action`
- `Preconditions` — either `cold launch` or a named prior state
- `Expected` — specific enough that PASS/FAIL is unambiguous
- `Evidence` column planned (the file paths will be filled during Phase 3)

Every interactive element from Phase 1 must appear in ≥ 1 row. Walk the
inventory one more time and cross-check.

## Scoping — when the matrix is too big

If derivation produces > 100 rows for a medium-complexity app, that's often
correct. But before executing, offer the user a trim:

- **Full** — every row. Highest confidence, longest run.
- **Core only** — drop Rule 5 (state variants) and Rule 9 (shortcut
  redundancy with menu-click cases). Medium-high confidence, half the time.
- **Smoke** — one case per surface, plus the E2E flows from Rule 4. Low
  confidence, fastest.

If the user chose `Scope = "only the onboarding flow"` in the required-context
phase, the matrix should be proportionally smaller. Rule 4 covers the flow
itself; Rules 1-3 cover only the surfaces touched during onboarding.

## Example — small Electron app

For a Skills Desktop-class app (1 main window + 1 preferences window + menu
bar + no tray) with ~20 interactive elements, 3 preference tabs, 2 E2E flows
(install skill, bulk delete), and 6 menu items:

- Rule 1 (interactive elements): ~20 cases
- Rule 2 (menu leaves): 6 cases, plus ~3 shortcut cases = 9
- Rule 3 (preferences): 3 tab smokes + ~8 settings = 11 cases
- Rule 4 (E2E flows): 2 cases
- Rule 5 (states): ~3 cases (empty state, error state, offline)
- Rule 6 (deep links): 0 (no protocol)
- Rule 7 (persistence): ~2 cases (theme survives, window size survives)
- Rule 8 (cross-surface): ~2 cases (agent view ↔ main list)
- Rule 9 (shortcuts): already counted in Rule 2

Total: ~49 cases. Plausible 30-45 minute execution. Good target size.

## What the matrix is NOT

- Not a substitute for exploratory testing. The matrix catches "did each
  feature work?" It does not catch "what happens when I do X in a weird
  order, or while Y is still loading, or after coming back from sleep?"
  That is Phase 9's job.
- Not a regression suite. Matrix rows are intentionally not scripted for
  replay — the goal is coverage of one run, not automation.
- Not an exhaustive combinatorial test. Two settings × three inputs × four
  states would explode to 24 cases per feature. The matrix picks the
  primary path; combinatorial explosion belongs in unit / integration
  tests the app team owns.
