# Terminal + TUI Conventions

What terminals and TUIs conventionally do, used for comparison during the
visual scan + terminal states phases. A TUI that violates these feels
"off" without the user being able to name why.

Source: de-facto conventions across major terminals (xterm, Kitty, iTerm2,
Alacritty, Ghostty, Windows Terminal, Apple Terminal) and major TUI
frameworks (ncurses, bubbletea, ratatui, ink, textual, blessed, tview).

## Colors

### Color semantics (widely shared)

- **Red** — error, deletion, danger
- **Green** — success, addition, healthy
- **Yellow** — warning, modified, pending
- **Blue** — information, links, neutral actions
- **Magenta** — metadata (author, tags), branches (git)
- **Cyan** — secondary info, keys, shortcuts

A TUI that uses red for success would be breaking muscle memory built by
dozens of other tools. If you see it, note as a content / UX issue, not
a bug — but worth calling out.

### Color depth fallbacks

- TUIs should detect `$COLORTERM` = `truecolor` or `24bit` for 24-bit
  support
- Fall back to 256-color (`\x1b[38;5;Nm`) if only `TERM=*-256color`
- Fall back to 16-color for anything else
- Fall back to no-color for `TERM=dumb` or `NO_COLOR=1`

A TUI that skips the fallbacks and emits truecolor everywhere breaks on
older TERMs. Very common finding in hobby TUIs.

### NO_COLOR

The NO_COLOR spec (https://no-color.org/) says: if the env var is set to
any non-empty value, disable all color output. A TUI that respects
`NO_COLOR` passes a basic accessibility check. One that doesn't — even
for "aesthetic" reasons — is a finding.

## Box drawing

### Styles

- **Single line:** `─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼` (Unicode U+2500 range)
- **Double line:** `═ ║ ╔ ╗ ╚ ╝ ╠ ╣ ╦ ╩ ╬`
- **Heavy (bold):** `━ ┃ ┏ ┓ ┗ ┛ ┣ ┫ ┳ ┻ ╋`
- **Rounded:** `─ │ ╭ ╮ ╰ ╯ ├ ┤ ┬ ┴ ┼`
- **ASCII fallback:** `- | + + + + + + + + +`

A TUI should pick ONE style and use it consistently. Mixing (rounded for
one pane, square for another) is a low-severity inconsistency finding.

### Fallback for non-UTF-8

On `LANG=C` or similar, Unicode box chars render as `?` or garbage. A
well-behaved TUI detects the locale and falls back to ASCII
(`-`, `|`, `+`). Many don't bother — usually medium severity unless
the TUI is targeted at minimal environments.

## Cursor

### When to show the cursor

- **Hidden**: normal / navigation modes — user's input doesn't go into a
  field, so a blinking cursor is a distraction. Hide with
  `\x1b[?25l`.
- **Visible**: input mode — text field focused, user is typing.
  `\x1b[?25h`.
- **On exit**: restore visibility unconditionally. A TUI that forgets
  to show the cursor on exit makes the shell unusable until `stty sane`
  or reset.

### Cursor styles

- Block (solid rectangle): default, "pointing at a char"
- Underline: used for insert mode in some TUIs (vim-like)
- Bar (I-beam): used for insert mode in others (most GUI-familiar TUIs)

OSC 1337 and DECSCUSR escapes control the style. Not every terminal
supports every shape — Alacritty, Kitty, iTerm2, Ghostty all do; Apple
Terminal is the usual laggard.

## Alt screen

TUIs that take over the whole terminal should enter the "alt screen"
buffer via `\x1b[?1049h` on start and exit it with `\x1b[?1049l`. This
ensures:

- The shell's scrollback before the TUI is preserved
- The TUI's output doesn't pollute scrollback
- On exit, the user sees exactly what was on screen before

Small TUIs (one-screen dialog prompts) may skip the alt screen
intentionally. A TUI that writes full UI to the main screen + doesn't
clean up on exit is the worst of both worlds — it smears itself across
the shell history. Flag as high.

## Mouse reporting

If a TUI supports mouse:

- Enable reporting on entry (`\x1b[?1000h`, plus SGR mode `\x1b[?1006h`
  for extended coordinates beyond 223)
- Disable reporting on exit (else mouse clicks in the shell after exit
  appear as garbage bytes — a classic bug)

If a TUI doesn't support mouse:

- Either don't touch mouse reporting at all (do nothing)
- OR explicitly disable it on entry (covers tmux + wrap cases where
  mouse is already on)

A TUI that enables mouse reporting but doesn't process the events leaks
`^[[M...` or `^[[<0;...` sequences into its own input buffer — visible
as garbage when the user clicks.

## Minimum terminal size

Most TUIs assume **80 columns × 24 rows** as the minimum. Going below
that, TUIs should either:

- Adapt layout (collapse panes, scroll content)
- Display a friendly "terminal too small (minimum 80×24)" message
- In the worst case, at least not crash

A TUI that silently breaks layout below 80×24 is a medium issue; one
that crashes is critical.

## Shortcut conventions

Common across many TUIs:

- `q` or `Esc` — quit / back / dismiss
- `?` or `h` or `F1` — help
- `/` — search
- `j k` — down / up (vim-style)
- `h l` — left / right (vim-style)
- `g G` — go to top / bottom
- `n N` — next / previous search match
- `:` — command mode (vim-style)
- Tab / Shift+Tab — focus cycling
- Ctrl+C — cancel / quit top-level
- Ctrl+L — redraw
- Ctrl+Z — suspend

A TUI that intentionally diverges from vim-style navigation should
provide an alternative (arrow keys usually) and document it.

## Exit conventions

On quit, a well-behaved TUI:

- Exits the alt screen (`\x1b[?1049l`)
- Shows the cursor (`\x1b[?25h`)
- Resets SGR attributes (`\x1b[0m`)
- Resets the scroll region if it set one (`\x1b[r`)
- Disables mouse reporting if it enabled it
- Does NOT leave any pending escape state (e.g., partial Alt prefix)

Test by exiting the TUI and typing `echo hello` at the shell. If:

- The shell echo works normally and `hello` appears in default colors
  and shape — cleanup was correct
- Characters don't echo — raw mode was left on (critical)
- Characters appear in a color other than default — SGR wasn't reset
- Cursor is invisible — `?25h` wasn't sent
- The screen is blank or missing scrollback — alt-screen wasn't exited

## TERM values to test

| TERM | What it means | What to expect |
|------|---------------|----------------|
| `xterm-256color` | Modern default on most emulators | Full feature support |
| `xterm` | Older emulators, some minimal installs | Fall back to 16 colors |
| `screen-256color` | Inside screen(1) or tmux with ancient TERM setup | Full features if TUI detects |
| `tmux-256color` | Modern tmux sets this | Full features |
| `dumb` | Non-interactive / pipe-like environments | TUI should refuse politely or print plain text |
| `vt100` | Very old / minimal | Monochrome, no fancy escapes |

A sweep across these usually reveals at least one compat bug in a
non-trivial TUI.

---

## How this file is used by the skill

During Phase 2 (visual + byte scan) and Phase 4 (terminal states), the
SKILL.md tells Claude to "compare against `terminal-conventions.md`".
In practice: for each observed screen / exit / color scheme, check
against this file. If the TUI diverges, raise an issue.

Severity is usually medium for convention violations — it's "not a crash,
but it'll confuse users" territory. Exceptions:

- Exit cleanup failures (raw mode on, alt screen stuck, mouse leaks) —
  critical
- Crashes under a non-default TERM — critical or high
- Color semantic reversal (red = success) — medium, but flag clearly
