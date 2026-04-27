# Shellwright MCP + TUI driving cheat sheet

Quick lookup for the operations used during a TUI QA run. Only the calls
the main SKILL.md flow references are listed. For anything else, read the
shellwright MCP tool descriptions directly.

## Session lifecycle

| Goal | Call |
|------|------|
| Start a PTY session | `mcp__shellwright__shell_start` |
| Stop the session (cleanup) | `mcp__shellwright__shell_stop` |
| Start recording (asciicast) | `mcp__shellwright__shell_record_start` |
| Stop recording | `mcp__shellwright__shell_record_stop` |

Start → run the TUI → record → drive → stop recording → stop session.

## Driving the TUI

| Goal | Call |
|------|------|
| Send keystrokes | `mcp__shellwright__shell_send({ keys: "..." })` |
| Read raw byte buffer | `mcp__shellwright__shell_read` |
| Capture rendered screenshot | `mcp__shellwright__shell_screenshot` |

**Rule of thumb:** after every `shell_send`, do both a `shell_read` (for
byte-level evidence) and a `shell_screenshot` (for rendered evidence). They
catch different classes of bugs — a TUI can emit correct bytes that render
wrong on a given emulator, or render correct but emit bytes that other
emulators will choke on.

## Key-code table

Shellwright's `shell_send` takes a `keys` string. These are the escape
sequences commonly needed:

### Single control chars

| Key | Escape | Notes |
|-----|--------|-------|
| Ctrl+A | `\u0001` | |
| Ctrl+B | `\u0002` | |
| Ctrl+C | `\u0003` | SIGINT |
| Ctrl+D | `\u0004` | EOF on empty input |
| Ctrl+E | `\u0005` | |
| Ctrl+F | `\u0006` | |
| Ctrl+G | `\u0007` | BEL |
| Backspace | `\u0008` or `\u007f` | varies by terminal — try DEL (7F) first |
| Tab | `\u0009` | |
| Enter | `\r` or `\u000d` | |
| Ctrl+L | `\u000c` | redraw convention |
| Ctrl+N | `\u000e` | |
| Ctrl+P | `\u0010` | |
| Ctrl+R | `\u0012` | reverse search in shells |
| Ctrl+U | `\u0015` | |
| Ctrl+V | `\u0016` | literal next |
| Ctrl+W | `\u0017` | |
| Ctrl+X | `\u0018` | chord prefix (Emacs) |
| Ctrl+Y | `\u0019` | |
| Ctrl+Z | `\u001a` | SIGTSTP (suspend) |
| Esc | `\u001b` | also used as Alt prefix |
| Space | `" "` | literal |

### Escape-sequence keys (ESC + ...)

| Key | Escape |
|-----|--------|
| Up arrow | `\u001b[A` |
| Down arrow | `\u001b[B` |
| Right arrow | `\u001b[C` |
| Left arrow | `\u001b[D` |
| Home | `\u001b[H` or `\u001b[1~` |
| End | `\u001b[F` or `\u001b[4~` |
| Insert | `\u001b[2~` |
| Delete | `\u001b[3~` |
| Page Up | `\u001b[5~` |
| Page Down | `\u001b[6~` |
| F1 | `\u001bOP` |
| F2 | `\u001bOQ` |
| F3 | `\u001bOR` |
| F4 | `\u001bOS` |
| F5 | `\u001b[15~` |
| F6 | `\u001b[17~` |
| F7 | `\u001b[18~` |
| F8 | `\u001b[19~` |
| F9 | `\u001b[20~` |
| F10 | `\u001b[21~` |
| F11 | `\u001b[23~` |
| F12 | `\u001b[24~` |
| Shift+Tab | `\u001b[Z` |

**Alt+X:** usually just `\u001b` + `x` — send `"\u001bx"`. Some emulators
send `\x1bOx` or `ESC x` with a delay. Try the simpler form first.

**Shift+Arrow, Ctrl+Arrow, etc.:** sequences vary wildly by emulator. On
xterm-style emulators, commonly:

- Ctrl+Up: `\u001b[1;5A`
- Shift+Up: `\u001b[1;2A`
- Alt+Up: `\u001b[1;3A`

If the key doesn't register, try alternate encodings. The emulator's key
inventory is authoritative — check `showkey -a` or `cat -v` in a real
shell to see what that emulator sends.

### Common sequences in chorded TUIs

- tmux prefix: `\u0002` (Ctrl+B) — then the second key.
  `tmux split-window`: `"\u0002%"`.
- Emacs chord: `\u0018\u0003` for `C-x C-c` (quit).
- vim command mode: `":q\r"` after Esc.

## The send-read-screenshot pattern

```
// 1. Set up what we expect
// 2. Fire the input
mcp__shellwright__shell_send({ keys: ":q\r" })

// 3. Give the TUI a moment to process (tune per TUI)
//    — some TUIs respond in ~10ms, some need 500ms+

// 4. Capture both forms of evidence
mcp__shellwright__shell_screenshot  // for visual verification
mcp__shellwright__shell_read        // for byte-level verification

// 5. Compare against expectation
```

If a TUI is slow to respond, don't just retry — use shellwright's
wait-style primitives if available, or read repeatedly until the buffer
stabilizes.

## Capturing escape-sequence evidence

When filing a rendering issue, quote the raw bytes from `shell_read`. Use
a form that's readable in the report:

```
\x1b[2J\x1b[H               → full clear + cursor home (usually OK, but
                              if this is every keystroke: bug)
\x1b[38;2;255;0;0m           → truecolor red (fine if TERM supports it)
\x1b[31m text \x1b[0m        → 16-color red + reset (safe everywhere)
\x1b[38;5;196m               → 256-color red
```

If the byte log has non-printable bytes you need to cite, pipe through
`cat -v` (or equivalent) to show them as `^[` etc. for human readability,
but keep the raw bytes in an attached file.

## Recording and replay

Asciicast recordings (or whatever format shellwright outputs) go in the
report appendix. The user can replay to see the full session in context —
especially useful for timing-dependent bugs.

Start recording **before** launching the TUI so the launch itself is
captured. Stop recording **before** stopping the session so the recording
file is flushed properly.

## Common gotchas

- **`\n` vs `\r`:** TUIs usually want `\r` (carriage return) for Enter.
  `\n` (newline) works in cooked mode but may not in raw mode. If in
  doubt, use `\r`.
- **Double Esc:** vim exits insert mode on a single Esc, but some TUIs
  need double-Esc to actually dismiss. Also, `\u001b` followed
  immediately by another char looks like Alt+that-char to the TUI —
  send a small wait between if you want a bare Esc.
- **Flow control:** Ctrl+S (XOFF) stops output in some terminal configs,
  Ctrl+Q (XON) resumes. If the TUI hangs after Ctrl+S, send Ctrl+Q.
- **Paste:** sending a large block of text via `shell_send` simulates a
  paste but without bracketed-paste markers. If the TUI only enables
  paste detection with bracketed paste (`\u001b[200~` ... `\u001b[201~`),
  the program won't know it's a paste. Worth testing both: raw send, and
  send wrapped in bracketed-paste markers.
- **Terminal size:** shellwright's PTY has a default size (often 80×24).
  If the TUI needs larger, check whether shellwright lets you set
  dimensions at `shell_start`. If not, this is a coverage boundary — note
  in the report.
