---
name: qa-tui
version: 0.1.0
description: |
  Systematically QA test a TUI (terminal user interface) program — htop, vim,
  neovim, lazygit, k9s, tmux, fzf, dialog-based CLIs, Claude Code itself —
  running inside a shellwright PTY session, then produce a structured bug
  report with severity-graded issues, screenshots, key-sequence repros, and
  terminal-compatibility findings. Report-only — does NOT modify the target
  program's source.

  Proactively suggest when the user mentions:
  - "QA the TUI", "test the CLI", "check the terminal app"
  - "Does lazygit / htop / nvim / my-tui-tool work?"
  - "Find bugs in the TUI", "terminal rendering issues"
  - Pre-release QA on a TUI before `cargo publish` / `npm publish` / `brew bump`
  - Terminal-emulator compatibility sweep (Kitty / iTerm2 / Alacritty / Ghostty
    / Apple Terminal / Windows Terminal)
  - Accessibility sweep on a TUI (screen reader, high-contrast, NO_COLOR)

  Voice triggers: "qa this tui", "run tui qa", "test the terminal app"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
  - mcp__shellwright__shell_start
  - mcp__shellwright__shell_stop
  - mcp__shellwright__shell_send
  - mcp__shellwright__shell_read
  - mcp__shellwright__shell_screenshot
  - mcp__shellwright__shell_record_start
  - mcp__shellwright__shell_record_stop
---

# /qa-tui — Systematic TUI QA via shellwright

Drive a TUI program inside a shellwright-managed PTY, collect evidence (raw
bytes + rendered screenshots + recordings), grade issues, and produce a
report. Fixing is out of scope — this skill reports. If the user wants to
fix bugs, hand the report to a session that has access to the TUI's source.

## Why this exists

A TUI is a program that draws its UI with escape sequences on a PTY. That
makes it harder to test than a web or desktop app for three reasons:

- **There's no DOM.** The "UI" is a stream of bytes interpreted by a
  terminal emulator. Two emulators can render the same bytes differently
  — or correctly bytes that your TUI emits incorrectly.
- **Input is keyboard-only, mostly.** Every action is a keystroke, and
  many TUIs use modal state (vim-style) or chord keys (tmux prefix, Emacs
  `C-x C-c`). The skill has to know how to drive these.
- **The terminal's state is shared.** If the TUI crashes halfway through
  a raw-mode switch, it leaves the parent shell unable to echo characters
  correctly. Cleanup matters more than in a sandboxed GUI app.

Shellwright solves the driving problem by giving us a managed PTY with
`shell_send` (send keystrokes) + `shell_read` (read the byte stream) +
`shell_screenshot` (render the current terminal state to an image) +
`shell_record_start/stop` (capture a session replay). This skill codifies
the systematic path that catches the most common classes of TUI bugs.

## Scope and non-goals

**In scope:** Black-box testing of a TUI program driven through a shellwright
PTY on the current host — sending keystrokes, reading the rendered buffer,
capturing screenshots, noting what breaks under resize / non-standard TERM /
NO_COLOR / narrow widths.

**Out of scope:**
- Cross-terminal testing on a single host — the skill tests the emulator
  shellwright is running inside. If the user needs Kitty + iTerm2 + Apple
  Terminal coverage, run the skill in each (the taxonomy has a
  "terminal compat" category for what you find).
- Non-TUI CLI tools (`grep`, `curl`, `ls`) — use `/qa` patterns for those,
  or spot-check manually. The skill assumes the program draws an
  interactive UI, not just prints output and exits.
- Source-code reading or editing (delegate fixes elsewhere)
- Performance profiling (use `flamegraph`, `samply`, `perf` — out of scope)
- Security review of a TUI's config-parsing attack surface

## Required context before starting

If any of these are unknown, use `AskUserQuestion` to collect them:

1. **Launch command** — the exact command that starts the TUI, including any
   args/flags. E.g. `nvim`, `lazygit`, `htop -d 10`, `k9s --context prod`,
   `./target/release/my-tui --config test.toml`.
2. **TUI kind** — modal (vim-style) / non-modal / chord-based (tmux / Emacs)
   / dialog-style (one screen per choice). This affects how Phase 3 drives
   the app.
3. **Quit key** — how do users exit? `:q`, `q`, `Ctrl+C`, `Esc`, `Ctrl+X
   Ctrl+C`. Knowing this up front prevents leaving orphan processes.
4. **Scope** — "whole app" vs "only the file browser" vs "only the keybind
   set for <action>". A scoped run is cheaper.
5. **Terminal context** — `echo $TERM`, `echo $COLORTERM`, emulator name
   (iTerm2, Kitty, etc.), PTY dimensions (`tput cols`, `tput lines`). These
   go in the report.
6. **Reset command** — if the TUI is known to leave the terminal in a bad
   state on crash (some do), note the user's recovery command — usually
   `stty sane` or `reset`.

Do not guess. Launching the wrong command or not knowing the quit key causes
the skill to get stuck or kill the wrong process.

---

## Phase 0: Start PTY + baseline

Goal: clean PTY, TUI launched, baseline screenshot + byte log captured,
recording started for the full session.

1. Record the pre-launch context (for the report's environment section):
   ```bash
   echo "TERM=$TERM"
   echo "COLORTERM=$COLORTERM"
   tput cols; tput lines
   uname -srm
   ```

2. Start the shellwright session:
   ```
   mcp__shellwright__shell_start
   ```
   Note the session ID — all subsequent commands target it.

3. Start recording the full session (for the report's appendix):
   ```
   mcp__shellwright__shell_record_start
   ```
   Save path goes in `/tmp/qa-tui-session/recording.cast` (asciicast) or
   similar — whatever shellwright returns. Capture it.

4. Launch the TUI by sending the launch command + Enter:
   ```
   mcp__shellwright__shell_send({ keys: "<launch-command>\r" })
   ```
   Then wait ~1 second for the TUI to initialize its first frame. Some
   heavier TUIs (k9s, lazygit with large repos) take 2–5 seconds.

5. Baseline screenshot + byte read:
   ```
   mcp__shellwright__shell_screenshot  → /tmp/qa-tui-session/00-baseline.png
   mcp__shellwright__shell_read        → /tmp/qa-tui-session/00-baseline.txt
   ```
   The screenshot is what the user sees. The byte read is what the TUI
   emitted. Both are useful — keep both per surface.

6. Confirm the TUI is interactive: send a no-op key the TUI should swallow
   (e.g., `h` for help in many TUIs) and verify the buffer changed with
   another `shell_read`. If nothing changes, the launch may have failed
   silently — check the buffer for a shell prompt or error.

If the launch fails, STOP and report. Common causes: binary not in PATH,
required env var missing, TUI requires a minimum terminal size the PTY
doesn't meet (typical: 80×24).

## Phase 1: Surface mapping

Goal: inventory every screen / pane / mode before testing any of them.

A TUI's surfaces:

- **Main screen** — the entrypoint view
- **Modes** — vim's Normal/Insert/Visual/Command; nvim's terminal mode;
  tmux's copy mode; lazygit's commit/rebase/stash views
- **Panes / splits** — if the TUI has a multi-pane layout (lazygit's 5
  panes, k9s's namespace/pod panes), each pane is its own surface
- **Popups / dialogs** — help overlay, confirmation prompts, input boxes
- **Modals** — search prompt (`/` in many TUIs), fuzzy picker (fzf-style)

Walk them by:

1. Open the help screen if one exists (usually `?` or `h` or `F1`).
   Screenshot it — this is the TUI's own documentation of what the user
   can do. It also doubles as the checklist for Phase 3 (exercise every
   keybind listed).
2. For each mode / pane listed, switch to it (sending the appropriate
   keys), screenshot, byte-read, and note any visible elements.
3. Note the exit path from each — some popups dismiss with Esc, some with
   `q`, some only with a specific confirmation. If a popup has no
   documented dismiss key, that's a finding.

Budget: 2–5 minutes. If the help screen lists >50 keybinds, ask the user
which feature sets matter for this run.

## Phase 2: Visual + byte scan

For each surface from Phase 1:

### Visual scan

- Screenshot → eyeball for: flicker between screenshots taken back-to-back,
  garbled wide chars (CJK, emoji), cursor in the wrong spot relative to the
  last cursor-positioning escape, color leaks across pane boundaries,
  truncation without ellipsis
- Compare against `references/terminal-conventions.md` — minimum 80×24
  support? Graceful degradation below that? Consistent color semantics
  (red for error, green for success, yellow for warning)?

### Byte scan

`shell_read` returns the raw stream the TUI emitted. Look for:

- **Unhandled escape sequences** leaking to the screen: literal `^[[31m`
  where `\x1b[31m` should have gone — indicates the TUI emitted an
  escape with a control-char that the emulator didn't recognize
- **Trailing / leading junk** — mouse-reporting garbage (`^[[M`, `^[[<0;...`)
  when the TUI doesn't support mouse but also doesn't disable mouse
  reporting
- **Flickering patterns** — a full clear-and-redraw (`\x1b[2J`) on every
  keystroke is usually a bug; incremental draws (`\x1b[H` + deltas) are
  correct
- **TERM-specific assumptions** — a program that hardcodes truecolor
  escapes (`\x1b[38;2;r;g;bm`) breaks in 256-color terminals

## Phase 3: Keybind coverage

Enumerate every keybind from the help screen (or the TUI's `man` page /
README) and fire each:

```
mcp__shellwright__shell_send({ keys: "<key-sequence>" })
mcp__shellwright__shell_screenshot  → <Nth>-<action>.png
mcp__shellwright__shell_read        → check for error output
```

For each keybind, verify:

- The expected action happens (screen changes in the documented way)
- The screen returns to a clean state after (no residual overlays,
  cursor in a sensible spot)
- No unexpected escape garbage in the byte stream
- The keybind's reverse works — e.g., if `j` moves down, `k` moves up
  the same distance

**Special keys to always test:**

- **Ctrl+C** — cancels current operation, or quits if at top level.
  Critical: confirm the terminal returns to a usable state after.
- **Ctrl+Z** — suspends (sends SIGTSTP). After `fg`, does the TUI redraw
  cleanly? Many don't — they leak the pre-suspend screen.
- **Ctrl+L** — redraw (many TUIs support this). After, is the screen
  pixel-identical to pre-Ctrl+L? If not, note which chars differ.
- **Ctrl+D** at an empty input — EOF. Some TUIs exit; some ignore.
  Document the observed behavior.
- **Esc** — exit mode / dismiss popup. Verify double-Esc is safe.
- **Tab, Shift+Tab** — focus cycling in multi-pane TUIs.
- **Arrow keys + Home/End/PgUp/PgDn** — cursor navigation.
- **The documented quit key** — must return cleanly to a working shell
  prompt with line discipline intact (type `echo hi` and confirm it
  echoes normally).

### Key-sequence syntax

Shellwright's `shell_send` takes a `keys` string. Typical conventions:

- Literal chars: `"abc"`
- Enter: `"\r"` (or sometimes `"\n"` — check shellwright behavior on first
  use)
- Control keys: `"\u0003"` for Ctrl+C, `"\u001b"` for Esc, `"\u0009"`
  for Tab
- Escape sequences (arrow keys): `"\u001b[A"` Up, `"\u001b[B"` Down,
  `"\u001b[C"` Right, `"\u001b[D"` Left

See `references/shellwright-tui-reference.md` for the full key-code table
and quirk list.

## Phase 4: Terminal states

Force the conditions the terminal emulator / shell controls:

| State | How to force | What to check |
|-------|--------------|---------------|
| Narrow width | Resize PTY to 60 cols (if shellwright supports) or launch with `COLUMNS=60 stty cols 60` in the session | Layout adapts, no overflow, minimum-size message if below floor |
| Tall / wide | Start a large PTY (120×40) | No wasted gaps, tables expand to fill |
| Resize mid-session | Change PTY size after launch | TUI handles SIGWINCH — redraws cleanly, no lingering ghost content |
| `TERM=dumb` | `TERM=dumb <launch-command>` | Program degrades gracefully or prints a readable error — doesn't crash |
| `TERM=xterm` vs `xterm-256color` | Set TERM to each, relaunch | Colors adapt; 16-color fallback works if 256 isn't available |
| `NO_COLOR=1` | `NO_COLOR=1 <launch-command>` | All color disabled, output still legible (spec: https://no-color.org/) |
| `LANG=C` / ASCII-only | `LANG=C <launch-command>` | Box-drawing chars fall back to ASCII, no mojibake |
| Piped stdin | `echo foo \| <launch-command>` | TUI refuses politely ("not a TTY") or adapts — doesn't segfault |
| Background / SIGSTOP | Send Ctrl+Z, then `fg` | Full redraw on resume |
| Long idle | Wait 5 minutes, then send any key | No memory growth, no reconnection delay (for network TUIs), no screen corruption |

At minimum: **narrow width + resize mid-session + NO_COLOR + `TERM=dumb`**.
These catch the vast majority of terminal-compat bugs.

## Phase 5: Accessibility

- **Screen reader compatibility** — macOS VoiceOver follows the system
  cursor; does the TUI keep a meaningful cursor position that VoiceOver
  can announce? (TUIs that repaint the whole screen often lose the cursor
  in the upper-left.)
- **High contrast** — on some terminal emulators, "bold" renders brighter
  rather than heavier. Does the TUI still distinguish elements when bold
  is interpreted as color shift?
- **NO_COLOR** — already covered in Phase 4; if colors were load-bearing
  (e.g., red = error, green = success) and NO_COLOR disabled them, is
  there a fallback (icons, text labels)?
- **Slow terminals / remote SSH** — TUIs that full-redraw on every
  keystroke are unusable on high-latency links. Send a sequence of 20
  keys rapidly with `shell_send`, then `shell_read`. Is the output
  coherent or does it show redraw artifacts?

See `references/issue-taxonomy-tui.md` for the full category list.

## Phase 6: Crash + cleanup behavior

Deliberately stress the exit paths:

1. **Graceful quit** — the documented quit key. Does it return to a clean
   shell prompt? Type `echo ok` at the prompt and confirm it echoes
   normally. If characters don't echo, raw mode was left on — **critical**.
2. **SIGINT during work** — send Ctrl+C while the TUI is in an active
   loop (mid-animation, mid-search). Does it quit cleanly? Leave raw
   mode on? Print a partial output?
3. **SIGTERM** — from outside: `kill <pid>`. Same questions.
4. **Force kill** — `kill -9 <pid>`. The TUI can't catch SIGKILL, so this
   simulates a crash. Afterward, use `stty -a` or try typing into the
   shell. If line discipline is broken, the program should have used
   `atexit` or equivalent to restore — and didn't. Note as **critical**.

After each, if the terminal is in a bad state, restore with `stty sane` or
`reset` and note what was needed. (The user may need to do the same after
a real crash.)

## Phase 7: Triage

Take every issue collected across phases and classify:

- **severity**: critical / high / medium / low (definitions in
  `references/issue-taxonomy-tui.md`)
- **category**: one of `rendering` / `keybind` / `terminal-compat` /
  `resize` / `signal-exit` / `state-config` / `unicode` / `performance`
  / `accessibility` / `crash`
- **repro**: minimum key sequence to reproduce on a fresh launch, starting
  from the shell prompt (include launch command + keys)
- **evidence**: screenshot + byte snippet + recording timestamp if any

De-duplicate aggressively. If the same rendering glitch appears in every
pane because a shared component misrenders wide chars, that's one issue
with a list of affected panes — not five.

## Phase 8: Report

Use `templates/qa-report-template-tui.md` as the skeleton. Fill in:

- TUI metadata (name, version if `<cmd> --version` works, language/runtime
  if known)
- Terminal environment (emulator, `$TERM`, `$COLORTERM`, PTY size)
- Health score per category (see the template)
- Top 3 things to fix, with issue IDs linking below
- Full issue list, severity-grouped

Save the report to `./qa-reports/tui-<date>-<app>.md` relative to the
user's current directory. Save all screenshots, byte dumps, and the
asciicast recording to `./qa-reports/tui-<date>-<app>/`.

**Don't embed full byte dumps in the report** — they can contain long
escape sequences and blow up the file. Save them alongside and link.
Only embed the specific snippet relevant to an issue.

## Phase 9: Session cleanup

Always, even if the report isn't finished:

1. Stop recording:
   ```
   mcp__shellwright__shell_record_stop
   ```

2. Quit the TUI via its documented quit key (safer than killing the
   session from outside):
   ```
   mcp__shellwright__shell_send({ keys: "<quit-key>" })
   ```

3. If the TUI didn't quit cleanly, send Ctrl+C, then `exit` to the shell:
   ```
   mcp__shellwright__shell_send({ keys: "\u0003" })
   mcp__shellwright__shell_send({ keys: "exit\r" })
   ```

4. Stop the shellwright session:
   ```
   mcp__shellwright__shell_stop
   ```

5. If the QA run changed terminal state (NO_COLOR, custom TERM, narrow
   width), those only lived inside the PTY — no host cleanup needed.
   But if you touched real env for some reason, unset here.

---

## Deliverables checklist

Before telling the user "done":

- [ ] `qa-reports/tui-<date>-<app>.md` exists and opens cleanly
- [ ] At least one screenshot per issue (not one of the whole session)
- [ ] Each issue has severity, category, key-sequence repro
- [ ] Health score table is filled (no `{SCORE}` placeholders left)
- [ ] "Top 3 Things to Fix" has actual issue titles
- [ ] Asciicast recording saved alongside the report
- [ ] Terminal emulator + `$TERM` + PTY size recorded (defines coverage)
- [ ] Cleanup phase ran (shellwright session stopped)

---

## Reference files

- `references/issue-taxonomy-tui.md` — severity + category definitions
- `references/shellwright-tui-reference.md` — shellwright MCP tool cheat
  sheet + key-code table
- `references/terminal-conventions.md` — what terminals / TUIs conventionally
  do, for comparison during Phase 2 + Phase 4
- `templates/qa-report-template-tui.md` — fill-in report skeleton

Load the references on demand (they're not in context by default). When
you hit a category question during triage, read the taxonomy. When you
need a key-code you don't remember, read the shellwright reference.

---

## Escape hatches

- **Shellwright session won't start:** check the shellwright MCP server
  is running and healthy. If it's not, ask the user to restart it.
- **TUI launches but first screenshot is blank:** it may be slow to draw.
  Wait 2–3 more seconds and retry. If still blank, `shell_read` to see
  what's actually in the buffer — maybe it's drawing with cursor
  positioning into a single row and the image capture missed it.
- **TUI exits immediately after launch:** it may be non-interactive with
  this stdin (piped). Check by running manually. If the TUI needs a real
  TTY that shellwright's PTY should already provide, check shellwright's
  TERM env — some TUIs refuse `dumb`.
- **Terminal is in a bad state after a crash:** send `\u0003` (Ctrl+C)
  then `stty sane\r` then `reset\r` to the session. If the session is
  itself wedged, `shell_stop` + `shell_start` again.
- **`shell_send` keystrokes don't seem to register:** some TUIs poll stdin
  slowly. Add a small wait after each send before the next `shell_read` /
  `shell_screenshot`. Find the minimum that works, note it in the report.
- **Character encoding garbled in byte dump:** confirm the PTY is UTF-8
  (`locale` should show `LANG=en_US.UTF-8` or similar). If not, the issue
  may be the PTY's encoding, not the TUI.
- **Screen reader testing isn't feasible from shellwright alone:** flag in
  the "Coverage notes" section that screen-reader compat requires a
  human-driven test on the target emulator.
