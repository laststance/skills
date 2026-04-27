# CLI Conventions Reference

What a well-behaved CLI is expected to do. Used during Phase 3–7 to
decide whether observed behavior is a bug or acceptable.

## Stream discipline

The fundamental contract:

| Stream | Carries | Redirect target |
|--------|---------|-----------------|
| stdout | the **data** the user / script wants to capture | `> file` |
| stderr | progress, warnings, errors, diagnostics | `2> errfile` |
| stdin  | input being processed, or config piped in | `< file` or `\|` |

**The test**: `<tool> some-command > data.txt` should produce a
`data.txt` that contains only the data, even while the user sees
progress on their terminal. If `data.txt` has progress bars, ANSI
codes, or status lines, the tool got the streams wrong.

Examples of things that MUST go to stderr:

- "Downloading 32%..."
- "Warning: deprecated flag"
- "Connecting to server..."
- Error messages of any kind
- `--verbose` output (unless verbose IS the data)

Examples of things that MUST go to stdout:

- JSON when `--format json` is set
- The processed result (filtered lines, transformed text, computed
  number)
- Tables / reports (in interactive mode) — these are data too

Exception: in purely interactive tools (TUIs), this split matters
less — but that's `qa-tui`'s territory, not here.

## Exit codes

### Minimum guarantee

- `0` on success
- **Any non-zero** on failure

A CLI that always exits `0` is broken. A CLI that exits non-zero only
sometimes on failure is broken.

### Conventions worth following

| Code | Meaning | Source |
|------|---------|--------|
| 0   | Success | POSIX |
| 1   | General error (catch-all) | de facto |
| 2   | Misuse / bad invocation (bad flags, missing args) | GNU coreutils |
| 64  | `EX_USAGE` — command-line usage error | sysexits.h |
| 65  | `EX_DATAERR` — input data format error | sysexits.h |
| 66  | `EX_NOINPUT` — input file missing / unreadable | sysexits.h |
| 67  | `EX_NOUSER` — addressee unknown | sysexits.h |
| 68  | `EX_NOHOST` — host unknown | sysexits.h |
| 69  | `EX_UNAVAILABLE` — service unavailable | sysexits.h |
| 70  | `EX_SOFTWARE` — internal software error | sysexits.h |
| 71  | `EX_OSERR` — system error (can't fork, etc.) | sysexits.h |
| 72  | `EX_OSFILE` — system file missing | sysexits.h |
| 73  | `EX_CANTCREAT` — can't create output file | sysexits.h |
| 74  | `EX_IOERR` — input/output error | sysexits.h |
| 75  | `EX_TEMPFAIL` — temporary failure, try later | sysexits.h |
| 76  | `EX_PROTOCOL` — remote error in protocol | sysexits.h |
| 77  | `EX_NOPERM` — permission denied | sysexits.h |
| 78  | `EX_CONFIG` — configuration error | sysexits.h |
| 126 | Command found but not executable | POSIX shell |
| 127 | Command not found | POSIX shell |
| 128+N | Terminated by signal N (e.g., 130 = SIGINT, 143 = SIGTERM) | POSIX shell |

Most tools only use `0`, `1`, and sometimes `2`. That's fine.
Deviating from `sysexits.h` without a reason is fine. Using
`sysexits.h` codes wrongly (exiting 73 for a parse error) is
confusing.

## Flag conventions

### Short vs long

- **Short**: single dash + one letter. `-v`, `-f`, `-h`.
- **Long**: double dash + word. `--verbose`, `--force`, `--help`.
- **Combined short**: `-abc` = `-a -b -c` (classic POSIX). Not all
  tools support this; document it either way.
- **Value**: `--name=value` or `--name value` (both should work).
  `-nVALUE` (no separator for short flags) works in some tools.

### End-of-options separator

`--` marks the end of options. Anything after is a positional,
even if it looks like a flag:

```bash
$TOOL -- --not-a-flag    # "--not-a-flag" is a positional
```

A tool that ignores `--` is broken when users have filenames
starting with `-`.

### Reserved flags users expect

- `-h`, `--help`: print help, exit 0
- `--version` (sometimes `-V` or `-v`): print version, exit 0

Watch for `-v` being both "verbose" and "version" in the same tool —
that's ambiguous and should be documented away from one or the other.

## isatty detection & color

### The rule

Color is **on** when stdout is a TTY, **off** when it's a pipe or
file. The tool should check with `isatty(STDOUT_FILENO)`.

Overrides the user expects, in this priority:

1. **`--no-color`** or **`--color=never`** flag → color OFF
2. **`--color=always`** flag → color ON (even when piped)
3. **`NO_COLOR=1`** env var (https://no-color.org) → color OFF
4. **`FORCE_COLOR=1`** env var (de facto in Node.js tooling) → color ON
5. Default: ON if stdout is TTY, OFF otherwise

A tool that always outputs color, or never outputs color, or
ignores `NO_COLOR`, is wrong.

### Progress bars, spinners

Same logic: suppress on non-TTY. A tool that prints `\r[===>    ] 40%`
into a log file (because it didn't check TTY) has corrupted the log.

## Error message quality

### Good error shape

```
error: cannot read 'fixtures/does-not-exist.txt': no such file or directory

Try 'tool --help' or 'tool subcommand --help' for usage information.
```

Properties:

- **Lowercase** "error:" prefix (convention; "Error:" also accepted)
- The **subject** of the failure (what the tool tried to do)
- The **reason** (system error, reframed for humans)
- A **next step** (run help / check input / etc.)

### Bad error shape

```
Traceback (most recent call last):
  File "/usr/local/lib/node_modules/tool/lib/index.js", line 42, in _read
    raise FileNotFoundError(2, 'No such file or directory', path)
FileNotFoundError: [Errno 2] No such file or directory: 'fixtures/does-not-exist.txt'
```

Why it's bad:

- Exposes implementation (Python / Node / internal paths)
- Users can't tell if the tool crashed or "correctly" rejected input
- No remediation suggestion
- The path is in the wrong place (hard to copy)

## Help text conventions

Expected sections:

```
Usage: tool [OPTIONS] COMMAND [ARGS]...

  <one-line summary>

  <optional longer description>

Options:
  -v, --verbose        Enable verbose output
  --config FILE        Path to config file
  -h, --help           Show this message and exit
  --version            Show version and exit

Commands:
  init     Initialize a new project
  sync     Sync data from source to dest
  status   Show current status
```

- Subcommands listed alphabetically or in a documented order
- Flags grouped (Options, then per-subcommand)
- Placeholder uppercase for `FILE`, `URL`, `PATH`
- `-h` and `--help` both shown

## Config file precedence

Standard order (highest priority wins):

```
1. Command-line flags
2. Environment variables
3. Config file
4. Built-in defaults
```

If a tool advertises env-var support, the env should override the
config file, and the flag should override the env. Any other order
needs to be loudly documented.

### Config file locations

Common conventions (Linux / macOS):

- `$XDG_CONFIG_HOME/tool/config.yaml` (defaulting to
  `~/.config/tool/config.yaml`)
- `~/.toolrc` (legacy style)
- `./.toolrc` or `./tool.config.yaml` (project-local)

If the tool reads multiple paths, the closer one (project-local)
usually wins over user-wide.

## Idempotency

If a tool's operation is supposed to be idempotent (e.g., `tool apply
config.yaml` in an infra tool), running it twice must not cause more
changes than running it once. Verify with `diff`-on-state.

Not all operations are idempotent (`tool create foo` usually fails
the second time, which is correct).

## Signal handling

- **SIGINT** (Ctrl+C): wind down, clean up, exit 130
- **SIGTERM**: graceful shutdown (same as SIGINT, different code 143)
- **SIGKILL**: can't be caught; the tool must leave the system in a
  recoverable state regardless (use atomic writes, write lockfiles
  with timestamps for stale-lock detection)
- **SIGPIPE**: upstream closed a pipe (like `tool | head -5`). Tools
  should exit quietly with a non-zero code, not with a stack trace.
  Python tools often need explicit handling here.

## Streaming

A CLI that processes potentially large input should stream, not
buffer. Test with:

```bash
yes | head -c 100000000 | $TOOL process        # 100 MB of input
```

If memory balloons or it takes minutes instead of streaming past,
flag it. Users will eventually feed it a 10 GB file.

## UTF-8 & locale

- **Default assumption**: UTF-8. Modern Linux & macOS use UTF-8
  locales by default.
- **Under `LANG=C`**: tools should either still handle UTF-8 input
  correctly, or fall back to byte-level handling without crashing.
- **Never**: emit non-UTF-8 bytes into a presumed-UTF-8 stream (`?`
  placeholders or `\ufffd` REPLACEMENT CHARACTER is acceptable;
  garbled bytes that break terminal rendering is not).

Test argv, stdin, and filenames with Unicode separately; they hit
different code paths.

## Security expectations

- Never log secrets (tokens, passwords, auth headers) to stdout or
  stderr, even in `--verbose`
- Accept secrets via env var or stdin, not via argv (argv shows up
  in `ps` output for other users)
- Fail closed: if a cert / signature / permission check fails, exit
  non-zero, not with a warning

---

## Where this file is used

During Phase 3–7 the skill compares observed tool behavior against
this file. If the observed behavior contradicts a convention here,
file it as the matching category from `issue-taxonomy-cli.md`. If
the convention is "accepted either way" (e.g., short flag
combining), note it in the report under Coverage notes instead of
filing a bug.

The goal isn't conformance for its own sake — it's that users'
expectations track these conventions, so violations are where the
UX surprise lives.
