# TUI QA Report: {APP_NAME}

| Field | Value |
|-------|-------|
| **Date** | {DATE} |
| **Program** | {APP_NAME} |
| **Version** | {APP_VERSION or "unknown"} |
| **Language / runtime** | {e.g., Rust / Go / Python / Node} |
| **Launch command** | `{LAUNCH_COMMAND}` |
| **Quit key** | {e.g., `:q`, `q`, `Ctrl+C`} |
| **Terminal emulator** | {e.g., Ghostty 1.0.1 / iTerm2 3.5 / Kitty 0.35} |
| **`$TERM`** | {e.g., `xterm-256color`} |
| **`$COLORTERM`** | {e.g., `truecolor`} |
| **PTY size at launch** | {COLS}×{ROWS} |
| **Locale** | {e.g., `en_US.UTF-8`} |
| **Scope** | {SCOPE or "Full app"} |
| **Duration** | {DURATION} |
| **Surfaces visited** | {COUNT} |
| **Keybinds exercised** | {COUNT of {TOTAL}} |
| **Screenshots** | {COUNT} |
| **Recording** | `recording.cast` (attached) |

## Health Score: {SCORE}/100

| Category | Score | Notes |
|----------|-------|-------|
| Rendering | {0-100} | redraw, cursor, colors, wide chars |
| Keybinds | {0-100} | every documented key works |
| Terminal compat | {0-100} | TERM, NO_COLOR, color depth |
| Resize | {0-100} | SIGWINCH handled, narrow layout |
| Signal / exit | {0-100} | Ctrl+C, Ctrl+Z, clean exit |
| State / config | {0-100} | config loaded, state preserved |
| Unicode | {0-100} | CJK, emoji, combining marks |
| Accessibility | {0-100} | NO_COLOR, cursor-follow, SSH-usable |
| Stability | {0-100} | crashes, leaks, deadlocks |

Scoring guide: subtract 20 for each critical, 8 for each high, 3 for each
medium, 1 for each low, clamp to [0, 100]. This is a rough health-check
number, not a benchmark — the issue list is what matters.

## Top 3 Things to Fix

1. **{ISSUE-NNN}: {title}** — {one-line description and why it ships first}
2. **{ISSUE-NNN}: {title}** — {…}
3. **{ISSUE-NNN}: {title}** — {…}

## Runtime health

### Errors surfaced during session

Captured from `shell_read` buffers and the recording.

| Level | Message | Context | Count |
|-------|---------|---------|-------|
| panic | {message} | {surface / action} | {N} |
| error | {message} | {…} | {N} |
| stderr | {message} | {…} | {N} |

### Exit cleanup verification

After sending the documented quit key:

| Check | Result |
|-------|--------|
| Shell prompt returns | yes / no |
| `echo ok` echoes normally | yes / no (raw mode on?) |
| Cursor visible | yes / no |
| Default colors | yes / no (SGR stuck?) |
| Full scrollback preserved | yes / no (alt screen leaked?) |
| Mouse events clean | yes / no (mouse reporting stuck?) |

If any is "no", link to the corresponding ISSUE below.

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |
| **Total** | **0** |

By category:

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Rendering | | | | |
| Keybind | | | | |
| Terminal compat | | | | |
| Resize | | | | |
| Signal / exit | | | | |
| State / config | | | | |
| Unicode | | | | |
| Performance | | | | |
| Accessibility | | | | |
| Crash | | | | |

---

## Issues

### ISSUE-001: {Short title}

| Field | Value |
|-------|-------|
| **Severity** | critical / high / medium / low |
| **Category** | rendering / keybind / terminal-compat / resize / signal-exit / state-config / unicode / performance / accessibility / crash |
| **Surface** | {screen / mode / pane} |
| **Terminal** | {emulator + `$TERM`} |
| **State** | {default / NO_COLOR / narrow 60 cols / `TERM=dumb` / after Ctrl+Z resume …} |
| **Affected versions** | {version} |

**What's wrong:** {expected vs actual in one or two sentences}

**Repro:**

1. Start PTY: `shell_start`
2. Launch: `{LAUNCH_COMMAND}` + Enter
   ![Step 2](screenshots/issue-001-step-2.png)
3. Send: `{key-sequence, e.g., ":q\r" or "\u001b[B"}`
   ![Step 3](screenshots/issue-001-step-3.png)
4. **Observe:** {what goes wrong}
   ![Result](screenshots/issue-001-result.png)

**Screenshot evidence:**

See `screenshots/issue-001-*.png`.

**Byte-level evidence** (if applicable):

```
← shell_read output just before the bug
\x1b[2J\x1b[H\x1b[31mHello\x1b[m
\x1b[?1000h                          ← mouse enabled but never disabled
```

Note: `\x1b[?1000l` was expected on exit but wasn't emitted. Any click
after quitting leaks mouse sequences into the shell.

**Recording timestamp:** `recording.cast` @ 00:12 — 00:18

---

(Repeat for each issue — group under `## Critical`, `## High`, `## Medium`,
`## Low` subheadings for navigability.)

---

## Terminal compatibility notes

Observed in this run's emulator. Parity across others is untested unless
noted.

| Terminal | `$TERM` tested | Status |
|----------|---------------|--------|
| {host emulator} | {TERM} | tested ✓ |
| iTerm2 | xterm-256color | not tested |
| Apple Terminal | xterm-256color | not tested |
| Kitty | xterm-kitty | not tested |
| Alacritty | alacritty | not tested |
| Ghostty | xterm-256color | not tested |
| Windows Terminal | (various) | not tested |
| tmux over SSH | screen-256color | not tested |

TUIs often have surprises in ≥1 of these. Flag any worth retesting in
coverage notes.

## Coverage notes

Things intentionally **not** tested in this run (and why):

- {e.g., Other terminal emulators — requires running on each}
- {e.g., Screen reader — VoiceOver requires a human-driven pass}
- {e.g., Large config files — only default config was exercised}
- {e.g., Long-session memory leaks — run exceeded 10 min wouldn't fit in a QA run}
- {e.g., Concurrent-use (multiple instances) — single-instance only}

## Ship readiness

| Metric | Value |
|--------|-------|
| Critical issues | {N} |
| High issues | {N} |
| Terminal-compat failures | {N} |
| Exit-cleanup failures | {N} |
| Crashes observed | {N} |

**Recommendation:** {ship / hold for fixes / needs cross-terminal pass}

Short justification: {one sentence — e.g., "Exit path leaves mouse
reporting enabled — shell becomes unusable after quit. Must fix before
release."}

## Environment tested

- **Host OS**: {e.g., macOS 15.2}
- **Terminal emulator**: {name + version}
- **`$TERM`**: {value}
- **`$COLORTERM`**: {value or "unset"}
- **Shell**: {e.g., fish 3.7.1 / zsh 5.9 / bash 5.2}
- **PTY size**: {COLS}×{ROWS}
- **Locale**: {`LANG`, `LC_ALL`}
- **Network**: {LAN / loopback only / N/A — relevant for TUIs that talk to servers}

If the defect list looks different under a different emulator, TERM,
shell, or locale — that's worth a separate run.
