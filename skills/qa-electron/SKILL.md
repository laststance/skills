---
name: qa-electron
version: 0.1.0
description: |
  Systematically QA test an Electron desktop app by driving it via
  electron-playwright-cli (config-based auto-launch, no CDP port needed),
  then produce a structured bug report with severity-graded issues, screenshots,
  accessibility evidence, native-OS integration checks, and security spot-checks.
  Report-only — does NOT modify the app's source code.

  Primary scope: the developer's own Electron app launched from a project root
  with `.playwright/cli.config.json`. For arbitrary installed third-party
  Electron apps (Slack, VS Code, etc.), point `executablePath` in the config
  at the app's Electron binary.

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

## Scope and non-goals

**In scope:** Black-box testing of an Electron app on the current host —
driving the renderer via `electron-playwright-cli` (auto-launches Electron via
`.playwright/cli.config.json`), driving the native surface via `osascript`
(macOS) / PowerShell (Windows) / computer-use MCP, reading log files, comparing
against cross-platform conventions.

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

1. **Project root & launch config** — the directory containing
   `.playwright/cli.config.json`, with `browser.launchOptions.args` pointing at
   the app's main process entry (e.g. `["./out/main/index.js"]` or
   `["./dist/main.js"]`). For installed third-party apps, set
   `executablePath` to the app's Electron binary instead.
2. **`readyCondition`** — for React/Vue apps, set
   `browser.readyCondition.waitForSelector` to a stable post-mount selector
   (e.g. `"[data-testid='app-ready']"`). Without it, commands may race the
   first paint.
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

Goal: clean start, app auto-launched via electron-playwright-cli config,
baseline screenshot + DOM snapshot recorded, log tail running.

1. Verify the config file exists at the project root:
   ```bash
   cat .playwright/cli.config.json
   ```
   Expected shape:
   ```json
   {
     "browser": {
       "launchOptions": {
         "args": ["./out/main/index.js"]
       },
       "readyCondition": {
         "waitForSelector": "[data-testid='app-ready']",
         "timeout": 10000
       }
     }
   }
   ```
   If missing or `args` points at a stale path, ask the user before editing it.

2. Verify the app isn't already running under another daemon (sessions own the
   Electron instance):
   ```bash
   electron-playwright-cli list
   ```
   If a previous session is still alive (`default` or named), close it first:
   ```bash
   electron-playwright-cli close-all
   ```
   Or for a stuck daemon:
   ```bash
   electron-playwright-cli kill-all
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

4. Trigger first command — the daemon launches Electron via the config file
   automatically and waits for `readyCondition` before responding:
   ```bash
   electron-playwright-cli snapshot --filename=/tmp/qa-electron-session/00-snapshot.yaml
   ```
   If the daemon refuses to start, STOP and report. Common causes: bad
   `args` path in config (Electron exits immediately), `readyCondition`
   selector never matches (renderer never reaches that state — increase
   timeout or pick a different selector), missing `playwright` peer
   dependency in the project (`pnpm add -D playwright @playwright/test`).

5. List every native Electron window and every webview/tab target:
   ```bash
   electron-playwright-cli electron_windows   # native BrowserWindow inventory
   electron-playwright-cli tab-list           # webview/tab inventory inside the focused window
   ```
   Record the output — this is the target inventory for Phase 2 (matrix
   generation) and Phase 4 (multi-window coverage). Typical Electron app:
   1 main BrowserWindow + 0–N webviews. If you see >5, confirm with the
   user that's expected.

6. Baseline — main window only for now:
   ```bash
   electron-playwright-cli tab-select 0
   electron-playwright-cli screenshot --filename=/tmp/qa-electron-session/00-baseline.png
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

1. **Main window routes** — use `electron-playwright-cli snapshot` to see
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
   convention). After each open: `electron-playwright-cli electron_windows`
   (native BrowserWindow inventory) plus `electron-playwright-cli tab-list`
   (webview/tab targets) → note new target → screenshot + snapshot.
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

Re-snapshot (`electron-playwright-cli snapshot`) after any action that mutates the
DOM — `eN` refs are valid only for the most recent snapshot.

Most bugs fall out of a matrix run plus the lenses below — the point is
to be **systematic**, not clever.

### Visual scan

- Screenshot → eyeball for overlaps, truncation, missing assets, broken
  layout
- `electron-playwright-cli snapshot` → look for elements with empty `name` (probably
  unlabeled buttons), elements with role `button` but no keyboard focus
  marker, obvious placeholder text ("Lorem ipsum", "TODO", "Untitled")
- Compare against `references/cross-platform-conventions.md` — window
  controls on the right side? Menu bar lives at top? Standard shortcut keys?

### Interactive surface

Enumerate every interactive element from the snapshot. For each:

- `electron-playwright-cli click eN` → screenshot → check: expected action, no unhandled
  exception in the log tail, no new window opened unexpectedly
- If the click opens a modal: can it be dismissed? Esc, click outside, an
  explicit Close/Cancel button — at least one of these should work. If none
  do → **critical** (focus trap)
- If the click opens an external URL: does it go to the OS default browser
  (correct for most apps) or does it open inside the Electron window (a
  **security issue** unless the app intentionally embeds that URL)?

### Forms and keyboard

- Every input field: empty submit, valid input, invalid input, overflow input
  (2000+ chars), paste-heavy input. Use
  `electron-playwright-cli fill eN "..."` and `electron-playwright-cli press Enter` (or Tab).
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
electron-playwright-cli tab-list               # list webview/tab targets
electron-playwright-cli electron_windows       # list native BrowserWindow targets
electron-playwright-cli tab-select 2           # switch to webview/tab index 2
electron-playwright-cli snapshot               # new context
electron-playwright-cli click e3
# ...
electron-playwright-cli tab-select 0           # back to main
```

If the app spawns a new window during a flow (OAuth popup, file picker
preview, deep link), `electron-playwright-cli electron_windows` will show it
on the next call.

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
  `electron-playwright-cli snapshot` — empty-name buttons / inputs are flagged.
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
  electron-playwright-cli eval 'typeof require'
  ```
  If the result is `"function"`, `nodeIntegration` is enabled on this
  renderer. This is a **critical security finding** unless the app author
  has a deliberate reason (and for the main window, there's almost never a
  good reason — it should be `false` with `contextIsolation: true`).
- **CSP presence** — `electron-playwright-cli eval 'document.querySelector("meta[http-equiv=Content-Security-Policy]")?.content'`
  on the main window. No CSP is not automatically critical, but note it.
- **Renderer console** — `electron-playwright-cli eval "console.error('qa probe')"`
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
  `electron-playwright-cli eval 'process.versions.electron'`, host OS)
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

# Close the electron-playwright-cli session — this also exits the launched
# Electron app, since the daemon owns the process.
electron-playwright-cli close 2>/dev/null || true

# If a daemon is wedged:
# electron-playwright-cli kill-all
```

Note: unlike the old CDP-attach model, `electron-playwright-cli` *owns* the
Electron process via the daemon — there is no "disconnect without quitting".
If the user wants to keep the app running after QA, instruct them to relaunch
manually after the report is delivered.

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
- `references/electron-electron-playwright-cli-reference.md` — electron-playwright-cli + CDP
  commands used by this skill
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

- **Daemon stuck / commands hang:** `electron-playwright-cli list` to see
  active sessions. `electron-playwright-cli close-all` for graceful, or
  `electron-playwright-cli kill-all` to force-terminate every daemon.
- **App launches but no windows open:** the daemon's `readyCondition` may have
  matched a hidden splash screen. Increase `timeout` in
  `.playwright/cli.config.json` or pick a more specific selector. Then re-run
  `electron-playwright-cli electron_windows` — if still empty, the app may
  have crashed silently — check the log tail.
- **`electron-playwright-cli snapshot` returns nothing useful:** the renderer might be
  rendering with Canvas or WebGL with no accessible DOM. Fall back to
  visual-only (`electron-playwright-cli screenshot`) and note AX coverage is limited.
- **Menu-bar `osascript` returns "not authorized":** macOS System Settings
  → Privacy & Security → Accessibility → add Terminal (or the relevant
  agent host). Do not work around this — it's the user's consent boundary.
- **Crash on launch, no obvious cause:** check the app log, then macOS
  Crashlytics-style dumps at `~/Library/Logs/DiagnosticReports/<AppName>*`.
  Quote the first 20 lines + crashed thread into the report.
- **Third-party installed app (Slack, VS Code, etc.):** point
  `browser.launchOptions.executablePath` in the config at the app's Electron
  binary (e.g. `/Applications/Slack.app/Contents/MacOS/Slack`) and leave
  `args` empty — Electron uses the app's own bundled main. Some helper-style
  apps (Figma) wrap the binary; point at the inner `Contents/MacOS/<Helper>`
  if the wrapper swallows flags.
