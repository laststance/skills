---
name: qa-ios
version: 0.1.0
description: iOS Sim QA
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
  - mcp__ios-simulator__get_booted_sim_id
  - mcp__ios-simulator__open_simulator
  - mcp__ios-simulator__launch_app
  - mcp__ios-simulator__install_app
  - mcp__ios-simulator__screenshot
  - mcp__ios-simulator__record_video
  - mcp__ios-simulator__stop_recording
  - mcp__ios-simulator__ui_describe_all
  - mcp__ios-simulator__ui_describe_point
  - mcp__ios-simulator__ui_tap
  - mcp__ios-simulator__ui_type
  - mcp__ios-simulator__ui_swipe
  - mcp__ios-simulator__ui_view
---

# /qa-ios — Systematic iOS Simulator QA

Drive an iOS app running in the Simulator, collect evidence (screenshots + AX
trees + logs), grade issues, and produce a report. Fixing is out of scope —
this skill reports. If the user wants to fix bugs, hand the report to a
session that has access to the Swift source.

## Why this exists

Web QA tools (Playwright, headless Chrome) do not reach iOS. Native apps
behave differently:

- The accessibility tree is the source of truth, not the DOM
- Layout is governed by Auto Layout + safe area insets, not CSS
- There is no JS console — runtime errors surface via `log stream` or crash
  reports in `~/Library/Logs/DiagnosticReports/`
- Touch is primary; hover does not exist; keyboards appear and cover content
- The operating system (not the app) controls Dark Mode, Dynamic Type,
  Reduce Motion, Low Power Mode, orientation — all of which can break layouts

This skill codifies the minimum systematic path that catches the most common
classes of iOS bugs without Xcode instrumentation.

## Scope and non-goals

**In scope:** Simulator-only black-box testing — driving the app via
accessibility actions, capturing screenshots, parsing the AX tree, reading
crash + log output, comparing against HIG rules.

**Out of scope:**
- Physical device testing (iOS Simulator only — no ios-deploy / Xcode devices)
- Swift source code reading or editing (delegate fixes elsewhere)
- UI test authoring (XCUITest generation — use `/exhaustive-qa` as the model
  if you need a fix loop on the Swift side)
- App Store metadata review, screenshot pipeline, App Privacy questionnaire
- Performance profiling (Instruments, MetricKit)

## Required context before starting

If any of these are unknown, use `AskUserQuestion` to collect them:

1. **Bundle ID** — e.g. `com.example.myapp`. Without this, `launch_app` fails.
2. **Target simulator** — usually "the currently booted one". Confirm with
   `mcp__ios-simulator__get_booted_sim_id`. If nothing is booted, ask which
   device + iOS version to boot, then `xcrun simctl boot <udid>` + `open -a
   Simulator`.
3. **Scope** — "the whole app" vs "only the checkout flow" vs "just the
   onboarding screens". A scoped run is cheaper and usually more useful.
4. **Build state** — is the current Simulator build the one they want
   tested? If there's a fresh build sitting in DerivedData, offer to
   install it via `mcp__ios-simulator__install_app`.

Do not guess any of these. Missing context causes the skill to test the
wrong app or skip real areas.

---

## Phase 0: Boot and baseline

Goal: confirm a clean starting state, know which simulator we're on, capture
a "before anything happened" screenshot for regression comparison later.

1. `mcp__ios-simulator__get_booted_sim_id` → note the UDID. All subsequent
   calls should target this UDID (either pass `udid` explicitly or rely on
   `IDB_UDID` env).
2. Read the device metadata:
   ```bash
   xcrun simctl list devices booted -j | head -50
   ```
   Record: device name, iOS version, state. These go in the report.
3. Start a log stream **in the background** so runtime errors surfaced
   during the session are captured:
   ```bash
   mkdir -p /tmp/qa-ios-session
   xcrun simctl spawn booted log stream \
     --predicate 'subsystem == "<bundle-id>" OR eventMessage CONTAINS "error"' \
     --level debug > /tmp/qa-ios-session/log.txt 2>&1 &
   echo $! > /tmp/qa-ios-session/log.pid
   ```
   Replace `<bundle-id>` with the target's bundle identifier. Kill this
   process at the end of the session.
4. `mcp__ios-simulator__launch_app` with `terminate_running: true` — this
   forces a clean launch from cold state, which is the state users actually
   encounter.
5. Take the baseline: `mcp__ios-simulator__screenshot` →
   `/tmp/qa-ios-session/00-baseline.png`.
6. Dump the AX tree: `mcp__ios-simulator__ui_describe_all` → save to
   `/tmp/qa-ios-session/00-ax-tree.json`. This is the first datum for tap
   target audits.

If the launch fails, STOP and report to the user. Common causes: wrong
bundle ID, app not installed, simulator not actually booted (check with
`xcrun simctl list devices booted`).

## Phase 1: Surface mapping

Goal: build a mental map of what screens exist before diving deep.

Walk the app's primary navigation breadth-first. For a typical app this
means: tab bar (if any) → each tab's root → first-level detail screens. Do
not drill into modals, forms, or edge cases yet. At each stop:

- Screenshot → `NN-<screen-slug>.png`
- AX dump → `NN-<screen-slug>-ax.json`
- One line of notes describing what the screen is for

The goal is a checklist of screens to deep-test in Phase 2. Budget: roughly
2–5 minutes of real time. If the app has >15 top-level screens, ask the
user which ones matter most for this run.

**How to navigate without guessing coordinates:** call
`ui_describe_all` → scan for a node with the expected label/role (e.g.
`{ "AXLabel": "Settings", "AXRole": "AXButton" }`) → extract its `frame`
(an `{x, y, width, height}` rect) → tap its center with `ui_tap({ x: x +
width/2, y: y + height/2 })`. AX-driven tapping is far more reliable than
pixel-guessing from the screenshot.

## Phase 2-6: Systematic exploration

For every screen from Phase 1, work the checklist below. Most bugs fall out
of this loop — the point is to be **systematic**, not clever.

### Phase 2 — Visual scan

- Screenshot → visually compare against `references/hig-compliance.md`
  (safe area, readable contrast, layout breaks)
- AX dump → find any node whose `frame.width < 44` or `frame.height < 44`
  **AND** whose role is tappable (`AXButton`, `AXLink`,
  `AXSwitch`) — flag as **HIG tap target violation**
- Find nodes where `AXValue` contains obvious placeholder text ("Lorem
  ipsum", "TODO", "Untitled")
- Look for clipped text: an `AXStaticText` node whose bounding box is
  smaller than the text length could render → likely truncated

### Phase 3 — Interactive surface

Enumerate every tappable node on the screen from the AX dump. Tap each in
turn. After each tap:

- Screenshot
- Check for: unexpected navigation, modal that can't be dismissed, spinner
  that never resolves, app crash (the sim returns to Springboard)
- If the tap causes something to happen, back out (swipe-back gesture, Nav
  Bar back button, or `Cancel` button) and continue

### Phase 4 — Forms and keyboard

Every `AXTextField` / `AXTextView`:

- Tap → confirm keyboard appears
- `ui_type("…")` with (a) empty submit, (b) valid input, (c) invalid input
  for the semantic type (e.g., non-email into an email field, 0 into a
  positive-integer field, 1000-char string into a short field)
- After each submit: screenshot + log check
- **Critical**: Confirm the keyboard does not cover the active field. This
  is one of the most common iOS bugs and the AX tree doesn't always reveal
  it — verify visually.

### Phase 5 — States and conditions

Force the non-default conditions the OS controls:

| Condition | How to force | What to check |
|-----------|--------------|---------------|
| Dark Mode | `xcrun simctl ui booted appearance dark` | Color inversions, missing dark assets, invisible text |
| Light Mode | `xcrun simctl ui booted appearance light` | (restore) |
| Dynamic Type — largest | `xcrun simctl ui booted content_size extra-extra-extra-large` | Text overflow, clipped labels, broken layout |
| Landscape | Simulator → Device → Rotate Left (Cmd+←) | Layout breaks, safe-area misuse |
| Network off | Simulator → Features → Toggle Network Link Conditioner (or `xcrun simctl status_bar booted override --dataNetwork none`) | Offline states, error messages |
| Low Power Mode | `xcrun simctl status_bar booted override --batteryState charged --batteryLevel 20` + user flips Low Power in Settings | Animations reducing, background tasks behaving |

At minimum: Dark Mode + Dynamic Type XXL + Landscape. These three catch
the vast majority of state bugs.

### Phase 6 — Accessibility

- Each interactive node should have a non-empty `AXLabel`. Flag
  anything tappable with only a `AXRole` and no label.
- Images with no `AXLabel` and no sibling label → probably missing
  `accessibilityLabel`
- Contrast: eye-check obvious cases; for a rigorous pass note in the
  report that dedicated contrast tooling (Xcode Accessibility Inspector)
  should be run
- Headings: scan for `AXHeader` presence on screens that have visible
  heading text but no marked header

See `references/issue-taxonomy-ios.md` for the full category list.

---

## Phase 7: Triage

Take every issue collected across phases and classify:

- **severity**: critical / high / medium / low (definitions in
  `references/issue-taxonomy-ios.md`)
- **category**: one of `hig` / `functional` / `visual` / `accessibility` /
  `state` / `content` / `crash`
- **repro**: minimum steps to reproduce on a fresh launch
- **evidence**: screenshot path + AX snippet + log excerpt if any

De-duplicate aggressively. If five screens have the same tap-target
violation on the same reused button component, that's one issue with a
list of affected screens — not five.

## Phase 8: Report

Use `templates/qa-report-template-ios.md` as the skeleton. Fill in:

- App metadata (bundle ID, device, iOS version, build number if
  determinable from `xcrun simctl appinfo booted <bundle-id>`)
- Health score per category (see the template)
- Top 3 things to fix, with issue IDs linking to the details below
- Full issue list, severity-grouped

Save the report to `./qa-reports/ios-<date>-<device-short>.md` relative to
the user's current directory. Save all screenshots and AX dumps to
`./qa-reports/ios-<date>-<device-short>/`.

**Don't embed the full AX JSON in the report** — they're 5k-50k tokens
each. Save them alongside and link. Only embed the specific snippet
relevant to an issue.

## Phase 9: Session cleanup

Always, even if the report isn't finished:

```bash
# Stop log stream
[ -f /tmp/qa-ios-session/log.pid ] && kill "$(cat /tmp/qa-ios-session/log.pid)" 2>/dev/null
# Clear status bar overrides so the sim returns to normal
xcrun simctl status_bar booted clear
# Restore appearance if you changed it
xcrun simctl ui booted appearance light
# Restore content size
xcrun simctl ui booted content_size medium
```

Leaving the simulator in a non-default state creates confusing "why is my
status bar frozen at 9:41?" moments for the user later.

---

## Deliverables checklist

Before telling the user "done":

- [ ] `qa-reports/ios-<date>-<device>.md` exists and opens cleanly
- [ ] At least one screenshot per issue (not an image of the whole app)
- [ ] Each issue has a severity, category, and repro steps
- [ ] Health score table is filled (no `{SCORE}` placeholders left)
- [ ] "Top 3 Things to Fix" has actual issue titles
- [ ] The session cleanup block ran (simulator back to defaults)
- [ ] Log stream process was killed

---

## Reference files

- `references/issue-taxonomy-ios.md` — severity + category definitions
- `references/ios-mcp-reference.md` — MCP tool + `xcrun simctl` cheat sheet
- `references/hig-compliance.md` — the specific HIG rules this skill checks
- `templates/qa-report-template-ios.md` — fill-in report skeleton

Load the references on demand (they're not in context by default). When
you hit a category question during triage, read the taxonomy. When you
need a `simctl` recipe you don't remember, read the MCP reference.

---

## Escape hatches

- **Sim is wedged / unresponsive:** `xcrun simctl shutdown booted` then
  `xcrun simctl boot <udid>` + `open -a Simulator`. Re-launch the app.
- **Accessibility tree returns nothing useful:** the app might be drawing
  with Metal / SpriteKit / a custom UIView that doesn't expose AX. Fall
  back to visual-only testing — screenshot every screen, annotate
  manually. Note in the report that AX coverage is limited.
- **Crash on launch, no obvious cause:** `ls -lt
  ~/Library/Logs/DiagnosticReports/ | head -5` — the most recent
  `.ips` is your crash. Don't try to decode it; quote the first 20 lines
  and the crashed thread's stack into the report.
- **Bundle ID unknown:** `xcrun simctl listapps booted` — grep for the
  display name. If that fails, the app isn't installed on this sim.
