---
name: qa-electron
version: 0.2.0
description: |
  Systematically QA test an Electron desktop app by driving it via
  `playwright-cli` (CDP attach to the app's `--remote-debugging-port`),
  then produce a structured bug report with severity-graded issues, screenshots,
  accessibility evidence, native-OS integration checks, and security spot-checks.
  Report-only — does NOT modify the app's source code.

  Primary scope: the developer's own Electron app launched from a project root,
  with the app exposing CDP on `:9222` (e.g. via `pnpm dev` configured to pass
  `--remote-debugging-port=9222` to Electron). For arbitrary installed
  third-party Electron apps (Slack, VS Code, etc.), launch the app's binary
  with `--remote-debugging-port=9222` and attach the same way.

  Proactively suggest when the user mentions:
  - "QA the Electron app", "test the desktop app", "check Slack/VS Code/Discord/Figma/Notion"
  - "Does this Electron app work?", "find bugs in the desktop build"
  - Pre-release QA on an Electron app (auto-updater, code signing, notarization)
  - Accessibility audit on a desktop app (VoiceOver / Narrator, keyboard nav)
  - Security spot-check (context isolation, nodeIntegration, external links)
  - Cross-platform parity (macOS vs Windows vs Linux behavior)

  Voice triggers: "qa this electron app", "run electron qa", "test the desktop"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
  - mcp__computer-use__screenshot
  - mcp__computer-use__left_click
  - mcp__computer-use__right_click
  - mcp__computer-use__type
  - mcp__computer-use__key
  - mcp__computer-use__open_application
  - mcp__computer-use__list_granted_applications
  - mcp__computer-use__request_access
---

# /qa-electron — Systematic Electron Desktop-App QA

Drive an Electron app running on the host machine, collect evidence (snapshots,
screenshots, logs, menu-bar coverage), grade issues, and produce a report.
Fixing is out of scope — this skill reports. If the user wants to fix bugs,
hand the report to a session that has access to the app's source tree.

## Why this exists

Web QA tools reach the renderer, but Electron is two processes and several
windows. A bug can live in any of:

- **The renderer** (Chromium): a button doesn't react, layout breaks at certain
  widths, a form submits twice. Standard web-QA territory, reached via CDP.
- **The main process** (Node.js): an IPC handler crashes, auto-updater loops,
  the app hangs on quit. Visible only in the app's log files or stderr.
- **The native OS surface**: a menu item is disabled when it shouldn't be, the
  tray icon menu doesn't reflect state, the file-drop target ignores the drop.
  Neither CDP nor the DOM knows about these — you need a desktop-automation
  tool or the user's eyes.
- **The platform boundary**: the app behaves correctly on macOS and crashes on
  Windows. Or the window controls are on the wrong side. Or it doesn't open at
  all on Linux because of a glibc mismatch.

This skill codifies the minimum systematic path that catches the most common
classes of Electron bugs without reading the app's Swift/TypeScript source.

**On tooling:** `electron-playwright-cli` was the previous primary driver,
but its daemon `require()`s a `playwright/lib/mcp/browser/*` path that no
published `playwright` artifact ships, so it does not run on a clean host.
This skill standardizes on `playwright-cli` (Microsoft's standalone CLI)
attached to Electron's CDP port. The trade-off: CDP attach reaches the
renderer (≈95% of practical QA), but native `BrowserWindow` inventory and
main-process IPC introspection are unreachable until upstream ships a
working `electron-playwright-cli` build. For the parts that need them, this
skill falls back to `osascript` / computer-use MCP / log tailing.

## Scope and non-goals

**In scope:** Black-box testing of an Electron app on the current host —
driving the renderer via `playwright-cli attach --cdp=…`, driving the native
surface via `osascript` (macOS) / PowerShell (Windows) / computer-use MCP,
reading log files, comparing against cross-platform conventions.

**Out of scope:**
- Source-code reading or editing (delegate fixes elsewhere)
- Cross-OS testing on a single host — this skill tests the OS it runs on. If
  the user needs all three OSes covered, run the skill once per host.
- Auto-updater full E2E (requires a staged release channel — out of a single
  QA run's scope)
- Performance profiling (Chromium DevTools Performance panel, heap snapshots)
- Notarization / code-signing certificate chain audit
- Production-telemetry review (Sentry, Crashpad aggregated reports)

## Required context before starting

If any of these are unknown, use `AskUserQuestion` to collect them:

1. **Launch command** — how to start the app with CDP exposed on a known
   port. For project apps, this is usually `pnpm dev` configured to pass
   `--remote-debugging-port=9222` to Electron. For installed third-party
   apps, run the binary manually (e.g.
   `open -a "Slack" --args --remote-debugging-port=9222`).
2. **CDP port** — defaults to `9222`. Confirm via `lsof -i :9222` after
   launch. If the app is already running without the flag, it must be
   restarted — CDP cannot be turned on at runtime.
3. **Scope** — "the whole app" vs "only the onboarding flow" vs "only the
   settings window". A scoped run is cheaper and usually more useful.
4. **Host OS** — the skill adapts its checks to macOS / Windows / Linux. If
   unclear, run `uname -s`.
5. **Log location** — where does the app write its log file? Common defaults:
   - macOS: `~/Library/Logs/<AppName>/main.log`
   - Windows: `%APPDATA%\<AppName>\logs\main.log`
   - Linux: `~/.config/<AppName>/logs/main.log`
   If the user doesn't know, ask or inspect the app's `userData` folder.

Do not guess. Missing context causes the skill to automate the wrong app or
miss real issues.

---

## Phase 0: Launch and baseline

Goal: clean start, app launched with CDP exposed, `playwright-cli` attached,
baseline screenshot + DOM snapshot recorded, log tail running.

1. Confirm no stale `playwright-cli` session is bound:
   ```bash
   playwright-cli list
   ```
   If `default` (or a previously named session) is still attached from an
   earlier run, detach it before re-attaching:
   ```bash
   playwright-cli --s=default detach
   # for a wedged daemon:
   playwright-cli kill-all
   ```

2. Launch the app with CDP enabled (port `9222` by default). For a project
   in dev mode this is usually:
   ```bash
   pnpm dev          # the project must pass --remote-debugging-port=9222 to Electron
   ```
   For an installed third-party app:
   ```bash
   open -a "<AppName>" --args --remote-debugging-port=9222   # macOS
   ```
   Verify the port is listening before attaching:
   ```bash
   lsof -i :9222
   ```

3. Start a log tail **in the background**:
   ```bash
   mkdir -p /tmp/qa-electron-session
   tail -F "<log-path>" > /tmp/qa-electron-session/app.log 2>&1 &
   echo $! > /tmp/qa-electron-session/log.pid
   ```
   Replace `<log-path>` with the log file from the required-context step. On
   macOS, `log stream --process "<AppName>"` is an alternative that also
   catches stderr (requires `sudo` on some versions — skip if it prompts).

4. Attach `playwright-cli` to the running CDP port. The attach is one-shot
   per session; subsequent commands target it via `--s=default`:
   ```bash
   playwright-cli attach --cdp=http://localhost:9222
   playwright-cli --s=default snapshot --filename=/tmp/qa-electron-session/00-snapshot.yaml
   ```
   If `attach` errors with `ECONNREFUSED`, the app didn't start with CDP
   enabled (re-launch) or the port is wrong (`lsof -i :9222`). If
   `snapshot` returns nothing useful, the renderer may be Canvas/WebGL with
   no accessible DOM — note it and fall back to screenshot-only.

5. List every webview/tab target reachable via CDP:
   ```bash
   playwright-cli --s=default tab-list           # webview/tab inventory across attached pages
   ```
   Record the output — this is the target inventory for Phase 2 (matrix
   generation) and Phase 4 (multi-window coverage). Typical Electron app:
   1 main page + 0–N webviews. If you see >5, confirm with the user that's
   expected.

   **Limitation:** CDP attach does NOT enumerate native `BrowserWindow`
   instances directly — it sees their attached pages. If the app uses
   hidden / unattached BrowserWindows, those won't appear here. For
   secondary windows, open them via the UI / menu and they will show up
   in `tab-list` once their renderer is alive.

6. Baseline — main window only for now:
   ```bash
   playwright-cli --s=default tab-select 0
   playwright-cli --s=default screenshot --filename=/tmp/qa-electron-session/00-baseline.png
   ```

## Phase 1: Surface mapping

Goal: inventory every surface that needs testing before diving deep.

An Electron app's surfaces:

- **Main window** — the primary UI
- **Secondary windows** — preferences/settings, about, onboarding, command
  palette, modal editors
- **Menu bar** (macOS) or **hamburger menu** (Windows/Linux) — File, Edit,
  View, Window, Help, plus app-specific menus
- **Tray icon** (system tray / menu bar extra) — right-click menu
- **Notifications** — only visible when fired
- **Deep-link protocol handlers** — `slack://`, `vscode://`, etc.

Walk them breadth-first:

1. **Main window routes** — use `playwright-cli --s=default snapshot` to see
   what's interactive, click through top-level nav, screenshot each route.
2. **Every menu bar top-level item** (macOS):
   ```bash
   osascript -e 'tell application "System Events" to tell process "<AppName>" to get title of every menu of menu bar 1'
   ```
   For each top-level menu, enumerate its items:
   ```bash
   osascript -e 'tell application "System Events" to tell process "<AppName>" to get title of every menu item of menu "File" of menu bar 1'
   ```
   Record the full menu tree. This is the checklist for Phase 5 (native OS
   integration).
3. **Secondary windows** — open each via the main window's UI (Preferences,
   About, etc.) or via the menu (`Cmd+,` for preferences is a macOS
   convention). After each open: `playwright-cli --s=default tab-list` →
   note any new webview/tab target → switch to it with `tab-select` →
   screenshot + snapshot. Hidden / unattached BrowserWindows won't appear
   in `tab-list`; for those, capture via `mcp__computer-use__screenshot`
   while they're foregrounded.
4. **Tray icon** — if the app has one, right-click it (use computer-use MCP
   `right_click` on the tray icon's screen coordinates) and screenshot the
   menu. Record the items.

Budget: 3–6 minutes. If the app has >20 menu items across >5 top-level menus,
ask the user which are load-bearing for this run.

## Phase 2: Generate the test matrix

Goal: before touching anything else, produce a checksheet of every
happy-path case this run will execute. The matrix forces completeness (no
feature slipped), makes progress legible to the user (`N/M cases passed`),
and produces a coverage number worth quoting in the report.

**Scope of the matrix**: happy path only — every advertised feature has at
least one case exercising its primary success path. Edge cases, race
conditions, and creative "what-if" scenarios belong to Phase 9
(Exploratory testing), not the matrix.

1. Read `references/test-matrix-generation.md` — gives the nine derivation
   rules for turning Phase 1's inventory into matrix rows.
2. Read `templates/test-matrix-template.md` — the matrix skeleton.
3. Walk the Phase 1 inventory surface by surface, applying the nine rules
   in order. Assign `TC-001`, `TC-002`, ... in execution order (group by
   surface so the agent isn't thrashing between windows).
4. Save the matrix to
   `./qa-reports/electron-<date>-<app>-<os>/test-matrix.md`.
5. Present a coverage summary to the user **before executing**:
   > "Generated N cases across S surfaces. Estimated execution: M minutes.
   > Plan to execute: (a) Full, (b) Core only, (c) Smoke, (d) adjust?"
6. On user confirmation, proceed to Phase 3.

**Happy-path coverage target: ≥ 95%** of matrix cases executed + passing.
Below 95% means either the app has real bugs (Phase 10 will triage them)
or cases were blocked (document the blockers in the matrix).

**Do not execute the matrix during Phase 2.** Generation and execution
are separate phases — mixing them produces under-derived matrices because
the agent gets distracted running the first interesting case.

## Phase 3: Execute the test matrix

For every row in the matrix from Phase 2, work this checklist. The matrix
tells you **what** to run; the subsections below are the **how** per-row
— what to notice beyond pass/fail. For each row:

1. Verify preconditions (cold launch or the named prior state)
2. Execute the `Steps` column
3. Compare the UI outcome against `Expected`
4. Screenshot before + after; save snapshot to `snapshots/TC-NNN.txt`
5. Mark `Status`: `PASS` / `FAIL` / `BLOCKED` in the matrix
6. On `FAIL`: fill the `Failures detail` block in the matrix AND flag a
   candidate issue for Phase 10 (Triage). On `PASS`: move on — don't
   gold-plate a passing case.

Re-snapshot (`playwright-cli --s=default snapshot`) after any action that
mutates the DOM — `eN` refs are valid only for the most recent snapshot.

Most bugs fall out of a matrix run plus the lenses below — the point is
to be **systematic**, not clever.

### Visual scan

- Screenshot → eyeball for overlaps, truncation, missing assets, broken
  layout
- `playwright-cli --s=default snapshot` → look for elements with empty `name`
  (probably unlabeled buttons), elements with role `button` but no keyboard
  focus marker, obvious placeholder text ("Lorem ipsum", "TODO", "Untitled")
- Compare against `references/cross-platform-conventions.md` — window
  controls on the right side? Menu bar lives at top? Standard shortcut keys?

### Interactive surface

Enumerate every interactive element from the snapshot. For each:

- `playwright-cli --s=default click eN` → screenshot → check: expected
  action, no unhandled exception in the log tail, no new window opened
  unexpectedly
- If the click opens a modal: can it be dismissed? Esc, click outside, an
  explicit Close/Cancel button — at least one of these should work. If none
  do → **critical** (focus trap)
- If the click opens an external URL: does it go to the OS default browser
  (correct for most apps) or does it open inside the Electron window (a
  **security issue** unless the app intentionally embeds that URL)?

### Forms and keyboard

- Every input field: empty submit, valid input, invalid input, overflow input
  (2000+ chars), paste-heavy input. Use
  `playwright-cli --s=default fill eN "..."` and
  `playwright-cli --s=default press Enter` (or Tab).
- **Shortcut coverage** — standard shortcuts MUST work:
  - `Cmd/Ctrl+C/V/X/A/Z` in any text field
  - `Cmd/Ctrl+W` closes the focused window (or tab, depending on app)
  - `Cmd/Ctrl+Q` quits (macOS) / `Alt+F4` closes (Windows)
  - `Cmd/Ctrl+,` opens preferences (macOS convention, less strict on Win/Linux)
  - Tab cycles focus through interactive elements in reading order

### Per-window sanity

For each secondary window found in Phase 1:
- Can it be resized? Minimum size reasonable?
- Can it be closed without orphaning a parent?
- Does it remember position/size across relaunches? (close app → relaunch →
  reopen window → check)

## Phase 4: Multi-window + webview coverage

Run every primary flow in both the main window AND any secondary windows or
webviews that share surface. Common bugs:

- A feature works in the main window but crashes when invoked from the
  preferences window (different webview = different JS context)
- State saved in the main window is not visible in the secondary window
  until relaunch (stale cached props)
- A webview receives events that the main window swallows (or vice versa)

Tool loop:
```bash
playwright-cli --s=default tab-list               # list webview/tab targets
playwright-cli --s=default tab-select 2           # switch to webview/tab index 2
playwright-cli --s=default snapshot               # new context
playwright-cli --s=default click e3
# ...
playwright-cli --s=default tab-select 0           # back to main
```

If the app spawns a new window during a flow (OAuth popup, file picker
preview, deep link), `playwright-cli --s=default tab-list` will show it on
the next call **only if** the new window has an attached renderer. Native
`BrowserWindow` instances without a CDP-attached page are invisible to this
path — switch to `mcp__computer-use__screenshot` plus `osascript` for
those.

## Phase 5: Native OS integration

These are the parts neither the DOM nor CDP can see.

| Check | macOS | Windows | Linux |
|-------|-------|---------|-------|
| Menu bar items all work | `osascript` click each | keyboard nav via Alt+letter | keyboard nav |
| Tray icon menu | right-click menu bar extra | right-click system tray | right-click status-icon |
| Notifications appear & click routes correctly | Notification Center | Action Center | varies |
| File open dialog returns valid path | trigger + pick file | same | same |
| Drag-and-drop receiver accepts files | drag from Finder | from Explorer | from Files |
| Clipboard paste from other app | Cmd+V after copy from TextEdit | Ctrl+V from Notepad | Ctrl+V |
| Deep link opens app from other context | `open "<proto>://..."` | `start <proto>://...` | `xdg-open` |
| App appears in Dock/Taskbar with correct icon | eyeball | eyeball | eyeball |
| Quit from Dock right-click fully exits | right-click → Quit | right-click → Close | right-click |

**macOS menu-bar driving example:**

```bash
# Click File → New Window
osascript -e 'tell application "System Events" to tell process "<AppName>" to click menu item "New Window" of menu "File" of menu bar 1'
```

Screenshot after each trigger using computer-use MCP (since the menu is
native, not in the renderer):
```
mcp__computer-use__screenshot  # captures the entire screen including the native menu
```

For tray icons and other screen-coordinate-based interactions, use
computer-use MCP. Request access first:
```
mcp__computer-use__request_access({ apps: ["<AppName>"] })
```

**See `references/cross-platform-conventions.md`** for the full list of
platform-specific expectations (window controls, shortcut variants, menu
structure, notification UX).

## Phase 6: States

Force the conditions the OS + network control:

| State | How to force | What to check |
|-------|--------------|---------------|
| OS Light Mode | macOS System Settings → Appearance → Light | renderer respects it (if app claims to) |
| OS Dark Mode | macOS System Settings → Appearance → Dark | renderer respects it, no hardcoded white |
| Offline | Network Link Conditioner → 100% loss, or unplug ethernet+wifi | offline banners, retry UI, cached-data visibility, error copy |
| Background | click another app to defocus | app pauses timers / animations, doesn't keep CPU hot, doesn't keep network busy when idle |
| Window resize (min) | drag the corner to the smallest allowed size | no layout break, no content cut off without scroll |
| Window resize (max) | fullscreen | no wasted whitespace, no stretched assets |
| Multi-display | drag window to a second monitor | window remembers position, layout adapts to DPI |
| OS suspend / sleep | `pmset sleepnow` (macOS) | app reconnects network on wake, doesn't spin on reconnect loop |
| OS account switch / lock | lock screen + reopen | state preserved, sockets resume cleanly |

At minimum: **OS theme change + Offline + Window resize to small**. These
three catch the most state bugs for desktop apps.

## Phase 7: Accessibility

- Every interactive element has a non-empty accessible name. Use
  `playwright-cli --s=default snapshot` — empty-name buttons / inputs are
  flagged.
- **Keyboard-only navigation** — starting from the app's first focusable
  element, Tab through the entire primary flow. Every action the user might
  take with the mouse must be reachable via keyboard.
- **Screen reader smoke test** — macOS: turn on VoiceOver (Cmd+F5) and arrow
  through a core screen. Does each element read sensibly? Images have alt
  text? Role is correct (button vs link vs heading)?
- **High contrast / Reduce transparency** — macOS System Settings →
  Accessibility → Display → Increase contrast. Does the app stay legible?
  Any element disappear because it relied on a semi-transparent background?
- **Zoom** — Chromium `Ctrl+=` / `Cmd+=` to zoom the renderer. Does layout
  survive at 200%? Are any elements clipped at 400%?

See `references/issue-taxonomy-electron.md` for the full category list.

## Phase 8: Security spot-check

Electron has no gatekeeper — the app's author decides what's safe. Spot-check:

- **DevTools access** — `Cmd+Option+I` (macOS) / `Ctrl+Shift+I`. If DevTools
  opens in a production build, that's usually a misconfiguration (dev builds
  should have it; production builds usually disable it). Note in report.
- **External-link handling** — find a user-generated-content area (chat
  message, note body, etc.) if one exists. Enter a link
  `https://example.com/test`. Click it. Does it open in the user's default
  browser (correct) or inside the Electron window (suspicious — could
  indicate `nodeIntegration` exposure)?
- **nodeIntegration smoke test** — in a renderer console (via CDP):
  ```bash
  playwright-cli --s=default eval 'typeof require'
  ```
  If the result is `"function"`, `nodeIntegration` is enabled on this
  renderer. This is a **critical security finding** unless the app author
  has a deliberate reason (and for the main window, there's almost never a
  good reason — it should be `false` with `contextIsolation: true`).
- **CSP presence** — `playwright-cli --s=default eval 'document.querySelector("meta[http-equiv=Content-Security-Policy]")?.content'`
  on the main window. No CSP is not automatically critical, but note it.
- **Renderer console** — `playwright-cli --s=default eval "console.error('qa probe')"`
  plus check the app log for security warnings Electron itself logs
  (`Electron Security Warning` messages in the devtools console when running
  in development). These tell the user their own app is warning them.

Full security audit is out of scope — the spot-check surfaces the
most-common misconfigurations.

## Phase 9: Exploratory testing (creativity-driven)

The matrix (Phase 3) covered the happy path: every advertised feature
passed through its primary success path. What it could NOT cover:

- The gaps **between** matrix steps (double-click, Esc mid-animation,
  rapid repeats)
- Sequences the designer didn't anticipate (undo→redo→delete→undo)
- Moments of **transition** (app sleep, focus loss, network flap)
- **Truth vs. Appearance**: the UI claims X changed, but did the
  filesystem / DB / main process actually change?

The last category is the Electron-specific killer. Users lose trust when
they hit "Delete" and the item comes back on restart, or when they toggle
a preference that doesn't stick. A matrix cannot catch these by design —
it checks the UI state, not the underlying store.

### Budget

**15-25% of total QA time**. For a 60-minute run, that's 10-15 minutes.
If you blow past 25 minutes without finding anything interesting, stop.

### Process

1. Read `references/exploratory-heuristics.md` — nine **tours** (lenses)
   for generating creative test cases on the fly.
2. Pick **2-4 tours** based on the app's shape (the reference has a
   selection cheat sheet matched to app type).
3. **The Truth-vs-Appearance tour is mandatory** for any Electron app
   that writes to disk, DB, or network. Keep a shell open alongside the
   app and verify UI claims against the underlying store.
4. For each tour: state the question out loud, run it, note what happened
   even if nothing interesting (a "boring" answer is still evidence of a
   well-protected invariant).
5. Log each finding with: tour used, the specific prompt, expected vs.
   actual, severity hint, minimal repro, evidence paths.
6. Move findings into the main triage list in Phase 10.

### Electron-specific shell probes

Keep these one-liners ready for Truth-vs-Appearance verification:

```bash
# Filesystem-backed state
ls -la <path>; readlink <symlink>; stat <file>

# SQLite-backed state (common in Electron apps)
sqlite3 "~/Library/Application Support/<AppName>/db.sqlite" \
  "SELECT COUNT(*) FROM <table>"

# JSON/YAML config
jq '.thatField' "~/Library/Application Support/<AppName>/config.json"
```

Electron userData locations:
- macOS: `~/Library/Application Support/<AppName>`
- Windows: `%APPDATA%\<AppName>`
- Linux: `~/.config/<AppName>`

### Stop criteria

Stop exploratory testing when any of:
- 2-4 tours executed with reflective notes on each
- Time budget hit (25% of total)
- Phase 10 (Triage) will run long if you pile on more findings

Do NOT stop after just one tour produced nothing — try a second tour
first (different tour = different bug class).

## Phase 10: Triage

Take every issue collected across phases and classify:

- **severity**: critical / high / medium / low (definitions in
  `references/issue-taxonomy-electron.md`)
- **category**: one of `security` / `functional` / `visual` / `accessibility`
  / `state` / `content` / `platform` / `crash`
- **scope**: which window / process (main / renderer / webview-N)
- **repro**: minimum steps, starting from a cold launch
- **evidence**: screenshot path + snapshot snippet + log excerpt if any

De-duplicate aggressively. If the same missing aria-label appears on the
same reused component across six screens, that's one issue with a list of
affected screens — not six.

## Phase 11: Report

Use `templates/qa-report-template-electron.md` as the skeleton. Fill in:

- App metadata (name, version, Electron version if determinable from
  `playwright-cli --s=default eval 'process.versions.electron'`, host OS)
- Health score per category (see the template)
- Top 3 things to fix, with issue IDs linking below
- Full issue list, severity-grouped

Save the report to
`./qa-reports/electron-<date>-<app>-<os>.md` relative to the user's current
directory. Save all screenshots and snapshots alongside in
`./qa-reports/electron-<date>-<app>-<os>/`.

**Don't embed full DOM snapshots in the report** — they're noisy. Save them
alongside and link. Only embed the specific snippet relevant to an issue.

## Phase 12: Session cleanup

Always, even if the report isn't finished:

```bash
# Kill the log tail
[ -f /tmp/qa-electron-session/log.pid ] && kill "$(cat /tmp/qa-electron-session/log.pid)" 2>/dev/null

# Detach playwright-cli — this does NOT kill the Electron app, only the
# CDP-attached session.
playwright-cli --s=default detach 2>/dev/null || true

# If a daemon is wedged:
# playwright-cli kill-all
```

Note: `playwright-cli` attaches via CDP — it does NOT own the Electron
process. The dev server (`pnpm dev`) or whoever launched the app still
holds the process; quitting the app is up to the user. This is the
opposite of the old `electron-playwright-cli` model where the daemon owned
the process.

Restore any OS-level toggles you changed (Dark Mode, Network Link
Conditioner, Reduce Motion). Leaving them flipped creates confusing
"why is my screen dark now" moments.

---

## Deliverables checklist

Before telling the user "done":

- [ ] `qa-reports/electron-<date>-<app>-<os>.md` exists and opens cleanly
- [ ] Test matrix saved at `qa-reports/electron-<date>-<app>-<os>/test-matrix.md`
- [ ] Matrix coverage ≥ 95% (or deferred/blocked cases each documented with a reason)
- [ ] Phase 9 exploratory ran — Truth-vs-Appearance tour executed whenever the app writes to disk / DB / network, findings moved into triage
- [ ] At least one screenshot per issue (not one of the whole app)
- [ ] Each issue has severity, category, scope, repro
- [ ] Health score table is filled (no `{SCORE}` placeholders left)
- [ ] "Top 3 Things to Fix" has actual issue titles
- [ ] Cross-platform findings are tagged with which OS was tested
- [ ] Native OS integration phase ran, not skipped
- [ ] Log tail process was killed
- [ ] No OS-level toggles left flipped

---

## Reference files

- `references/issue-taxonomy-electron.md` — severity + category definitions
- `references/electron-agent-browser-reference.md` — `playwright-cli` + CDP
  commands used by this skill (file name is historical; contents are the
  current cheat sheet)
- `references/cross-platform-conventions.md` — macOS / Windows / Linux
  expectations the skill checks against
- `references/test-matrix-generation.md` — nine derivation rules for Phase 2
  matrix rows (near-100% happy-path coverage)
- `references/exploratory-heuristics.md` — nine tours for Phase 9
  creativity-driven testing (Truth-vs-Appearance, Goldfish, Wrong-Order, etc.)
- `templates/qa-report-template-electron.md` — fill-in report skeleton
- `templates/test-matrix-template.md` — matrix checksheet skeleton (coverage
  table + per-surface case rows)

Load the references on demand (they're not in context by default). Read
`test-matrix-generation.md` at the start of Phase 2, `exploratory-heuristics.md`
at the start of Phase 9, and the taxonomy / conventions when a triage question
needs them.

---

## Escape hatches

- **Daemon stuck / commands hang:** `playwright-cli list` to see active
  sessions. `playwright-cli --s=default detach` for graceful, or
  `playwright-cli kill-all` to force-terminate every session.
- **`attach --cdp` fails with `ECONNREFUSED`:** the app didn't start with
  `--remote-debugging-port=9222` (re-launch with the flag) or the port is
  already taken (`lsof -i :9222`). For project apps using `pnpm dev`,
  confirm the dev script passes the flag through to Electron.
- **App launches but `tab-list` is empty:** the renderer hasn't reached
  first paint yet — wait a few seconds and re-run, or watch for splash
  screens that delay attaching the main page. If still empty, the app may
  have crashed silently — check the log tail.
- **`playwright-cli snapshot` returns nothing useful:** the renderer might
  be rendering with Canvas or WebGL with no accessible DOM. Fall back to
  visual-only (`playwright-cli --s=default screenshot`) and note AX
  coverage is limited.
- **Native BrowserWindow not visible to CDP:** unattached / hidden
  `BrowserWindow` instances don't appear in `tab-list`. Capture them with
  `mcp__computer-use__screenshot` while foregrounded; introspect main-process
  state via the app's logs or by adding temporary IPC probes (out of scope
  for a report-only run).
- **Menu-bar `osascript` returns "not authorized":** macOS System Settings
  → Privacy & Security → Accessibility → add Terminal (or the relevant
  agent host). Do not work around this — it's the user's consent boundary.
- **Crash on launch, no obvious cause:** check the app log, then macOS
  Crashlytics-style dumps at `~/Library/Logs/DiagnosticReports/<AppName>*`.
  Quote the first 20 lines + crashed thread into the report.
- **Third-party installed app (Slack, VS Code, etc.):** launch the app's
  binary directly with `--remote-debugging-port=9222`. macOS:
  `open -a "Slack" --args --remote-debugging-port=9222`. Some apps strip
  custom flags; in that case launch the inner binary directly
  (`/Applications/Slack.app/Contents/MacOS/Slack --remote-debugging-port=9222`).
