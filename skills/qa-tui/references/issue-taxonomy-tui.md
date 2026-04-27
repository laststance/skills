# TUI QA Issue Taxonomy

## Severity Levels

| Severity | Definition | TUI examples |
|----------|------------|--------------|
| **critical** | Program crashes, corrupts terminal state so the user's shell is unusable, or a core flow is fully blocked | Segfault on launch, leaves raw mode enabled on exit (keyboard input stops echoing), SIGWINCH crashes the program, force-kill path leaks terminfo state, infinite redraw loop pegging CPU |
| **high** | Primary feature broken with no workaround, or accessibility fully unusable | Documented quit key doesn't quit, Ctrl+C doesn't cancel a running operation, main pane doesn't render at all, every color rendered as magenta, mouse-reporting bytes leaked to screen |
| **medium** | Feature works but with a noticeable problem, or fails only in a specific state | CJK characters misaligned by one column, `TERM=xterm` renders truecolor escapes as literal text, narrow terminal overlaps labels, Ctrl+L redraw leaves residual artifacts, `NO_COLOR` only partially honored |
| **low** | Cosmetic or polish issue that a careful user notices | Box-drawing chars inconsistent between panes (single vs double lines), cursor briefly flashes in wrong spot before settling, help text slightly wider than pane |

## Categories

### 1. Rendering / visual

Bugs visible in the rendered terminal output.

- Flicker between frames (full clear-and-redraw on every keystroke)
- Cursor left in wrong position after a sequence
- Color leaking across pane boundaries (SGR attribute not reset)
- Wide char (CJK / emoji) takes one column instead of two — or vice
  versa
- Box-drawing chars mixed between styles (single + double + rounded)
  inconsistently in the same view
- Text truncated without ellipsis when a pane is narrow
- Background color extends past the intended region (hardcoded spaces
  with bg color instead of proper clear)
- Alt-screen not entered — program writes into the main scrollback

### 2. Keybind

- Documented keybind does nothing
- Keybind does the wrong thing
- Keybind collides with terminal-level shortcut (Ctrl+S stops flow
  control in many emulators — TUIs that bind Ctrl+S often lose it)
- Modifier chord (Alt+X, Ctrl+Alt+X) not recognized — usually because
  the emulator sends a different sequence than the TUI expects
- Repeat keys (holding) produce unexpected effects
- Mouse support advertised but not functional, or mouse events leak
  as garbage bytes to screen when a mouse-unsupported mode is active

### 3. Terminal compatibility

The TUI's assumption about its terminal doesn't match reality.

- Requires 256-color, renders broken on 16-color terminals (no
  fallback path)
- Truecolor (`\x1b[38;2;r;g;bm`) on a 256-color terminal — leaks as
  literal text
- Assumes `xterm-256color` TERM; fails with `xterm` or `screen`
- Doesn't honor `NO_COLOR` environment variable
- Assumes specific UTF-8 box-drawing; on `LANG=C` shows literal
  `?` or mojibake
- Assumes mouse reporting available; emitting mouse-enable/disable
  sequences on an emulator that doesn't support them leaves garbage
- Works in tmux but breaks outside (or vice versa) due to nested-TERM
  assumptions

### 4. Resize

SIGWINCH handling and size-dependent layout.

- No SIGWINCH handler — resize doesn't redraw; content stuck at old
  dimensions
- SIGWINCH crashes the TUI
- Minimum size unenforced — below some width, layout breaks with no
  "terminal too small" message
- Layout doesn't adapt — columns don't rebalance when the terminal
  grows
- Content lost on resize — scroll position reset to top, selection
  cleared, unsaved input discarded

### 5. Signal / exit

- Documented quit key doesn't fully quit
- Ctrl+C doesn't cancel current operation or doesn't quit at top level
- Ctrl+Z suspends but `fg` doesn't redraw — user sees stale pre-suspend
  screen
- SIGTERM not handled — program crashes or hangs instead of cleaning up
- Exit path leaves raw mode ON — parent shell can't echo chars
- Exit path leaves alt-screen ON — the shell prompt appears in the
  alt-screen and vanishes on `clear`
- Exit path doesn't restore cursor visibility — shell cursor is
  invisible after exit
- Exit path doesn't reset scroll region — shell scrolling behaves
  oddly

### 6. State / config

- Config file in `$XDG_CONFIG_HOME/<app>/` not loaded; defaults apply
- Malformed config crashes rather than shows an error
- Env var documented in `man` page has no effect
- State (cursor position, open file, recent items) not preserved
  across restart when it should be

### 7. Unicode

- Wide chars (CJK) not handled — cursor math wrong, next char overlaps
- Emoji not handled — single codepoint taking 1 col instead of 2, or
  vice versa
- Combining marks (accents, ZWJ sequences) render incorrectly
- Emoji with variation selector (emoji vs text presentation) renders
  inconsistently

### 8. Performance

- Input lag above 50ms between keystroke and visible response
- Full redraw every keystroke even when only part of the screen
  changed (visible as flicker; also bad on remote SSH)
- High idle CPU (above 5% with no input for 10 seconds)
- Memory growth during long session (measure with `ps -o rss`)
- Poor frame rate on resize (dragging the window stutters)

### 9. Accessibility

- System cursor not kept at a meaningful location — screen readers
  can't follow
- All distinctions color-only, NO_COLOR removes all affordances
- No keyboard alternative for a mouse-only action (if mouse support is
  present)
- Bold-vs-bright ambiguity makes "bold" elements invisible in themes
  that render bold as brighter color instead of heavier weight
- No high-contrast respect (some TUIs support OS theme — most don't;
  note in report if they claim to)

### 10. Crash / runtime

- Segfault, panic (Rust), unhandled exception (Python/Node TUIs),
  goroutine panic (Go)
- Memory leak over long session
- Deadlock — TUI stops responding to input, doesn't quit with quit key
  either
- PTY deadlock — shellwright can't get a response; the program has
  stopped reading stdin

Crash issues **always** have severity = critical regardless of
reproducibility.

---

## Per-surface exploration checklist

Apply to every surface visited during Phases 2–5:

1. **Visual scan** — screenshot; compare against terminal conventions
   (cursor positioning, color consistency, wide-char width)
2. **Byte scan** — `shell_read`; look for literal escape sequences,
   mouse garbage, redundant full-clears
3. **Help screen** — if one exists, enumerate every documented keybind
4. **Every keybind** — fire each; verify action + screen + byte stream;
   check the reverse if it's a navigation key
5. **Ctrl+C / Ctrl+Z / Ctrl+L** — all three, from this surface
6. **Esc** — dismiss path out of this surface
7. **Narrow terminal** — resize to 60 cols; rescan for overflow
8. **NO_COLOR relaunch** — restart TUI with `NO_COLOR=1`; verify the
   surface still conveys state without color
9. **Log check** — `shell_read` after the sequence; any unexpected
   error output?
