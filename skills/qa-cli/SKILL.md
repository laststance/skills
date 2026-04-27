---
name: qa-cli
version: 0.1.0
description: |
  Systematic black-box QA for command-line tools (non-TUI: one-shot
  commands, flags, subcommands, pipes). Use this skill whenever the user
  mentions QA / testing / auditing a CLI, binary, command, shell tool,
  or any program that runs and exits — even if they only say "test my
  CLI", "audit my tool", or "find bugs in this script". Covers
  `--help` / `--version` sanity, flag parsing, exit codes, stdout vs
  stderr, error-message quality, stdin / file / pipe I/O, env + config
  precedence, signal handling, and localization. Produces a report-only
  deliverable at `./qa-reports/` — never modifies the tool under test.
  NOT for interactive terminal UIs (full-screen apps, `curses`, `ink`,
  `blessed`) — for those use `qa-tui`.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
---

# qa-cli — Black-box QA for CLI tools

You audit a CLI tool without touching its source, produce a single
Markdown report of observed issues, and stop. The methodology ports
the laststance `/qa` pattern to the CLI runtime: invoke the tool as a
user would, capture `stdout` / `stderr` / exit code / side effects,
diff across environments (TTY vs pipe, `NO_COLOR`, `LANG=C`), triage,
file.

## Ground rules

1. **Report-only.** Never modify the tool's source, config, install
   prefix, or any global shell config. If you create scratch files
   during testing (fixtures, temp configs), put them under
   `/tmp/qa-cli-session/` and clean up in Phase 9.
2. **Black-box.** Treat the binary / script as opaque. You may read
   its `--help` output, man page, and any user-visible docs, but do
   not grep its source to decide what to test.
3. **Every claim needs evidence.** A stdout / stderr excerpt, an exit
   code, a `printenv`-pair, or a before/after file listing. Commands
   alone are not evidence — capture their output.
4. **Stop when you have enough.** Time-box to the scope the user
   asked for. A 30-minute audit with a focused report beats a two-hour
   exhaustion with no narrative.

## When to use

- User says "QA my CLI" / "audit this tool" / "test my binary" /
  "find bugs in this command"
- User has a CLI in the working tree and wants a pre-release sweep
- User provides a binary path and a scope ("just the `sync` subcommand")

## When NOT to use

- **Interactive TUI** (anything that enters an alt-screen, full-screen
  redraw, live keystroke handling): use `qa-tui` instead
- **Web app / Electron / RN / iOS native**: use the matching `qa-*`
  skill
- **Source-code review**: use `/review` or a review-oriented agent
- **Fixing bugs**: this skill only reports. Hand off afterward.

## Inputs you need from the user

Ask once, up front, via `AskUserQuestion`:

- **Tool under test**: binary path or invocation (`./my-cli`,
  `node cli.js`, `pnpm run cli --`, `bun run cli.ts`, a global like
  `gh` or `kubectl`)
- **Scope**: full tool / one subcommand / specific flags — if
  unspecified, default to "top-level flags + each listed subcommand at
  surface level"
- **Duration budget**: 15 min / 30 min / 60 min / exhaustive
- **Sensitive side effects?**: if the CLI writes files, mutates a DB,
  posts to APIs — ask whether there's a `--dry-run` or a safe test
  target. Never run destructive commands without explicit scope.

Record these answers in the report header.

## Output contract

One file, at `./qa-reports/cli-<YYYY-MM-DD>-<tool>.md`, matching
`templates/qa-report-template-cli.md`. Evidence (stdout / stderr
captures, session transcripts) lives alongside under
`./qa-reports/artifacts/cli-<date>-<tool>/`.

No other files. No fixes. No PRs.

---

## Session layout

Set up once in Phase 0:

```
/tmp/qa-cli-session/
├── baseline/
│   ├── help.txt              # `<tool> --help` raw capture
│   ├── version.txt
│   └── env.txt               # `printenv | sort` for reproducibility
├── cases/
│   ├── case-001/
│   │   ├── cmd               # the exact command run
│   │   ├── stdout
│   │   ├── stderr
│   │   └── exit              # numeric exit code
│   └── case-002/…
├── fixtures/                 # any sample input files you create
└── notes.md                  # running log — becomes the report
```

The rule: **one case = one directory**. It makes diffing across
environments mechanical.

---

## Phase 0 — Baseline + instrumentation

### 0.1 Confirm the tool runs and identify it

```bash
mkdir -p /tmp/qa-cli-session/{baseline,cases,fixtures}
cd /tmp/qa-cli-session

# Record the exact invocation — parameterize TOOL once, reuse.
TOOL="<user-provided-invocation>"
echo "$TOOL" > baseline/invocation

# Basics
$TOOL --version        > baseline/version.txt   2>&1 ; echo "exit=$?" >> baseline/version.txt
$TOOL --help           > baseline/help.txt      2>&1 ; echo "exit=$?" >> baseline/help.txt
$TOOL -h               > baseline/help-short.txt 2>&1 ; echo "exit=$?" >> baseline/help-short.txt
```

Note every mismatch already:

- Does `--help` exit 0? (Should. Exit-code bug if it doesn't.)
- Do `--help` and `-h` produce the same output? (Should, or one
  should be documented absent.)
- Does `--version` print only the version on stdout, or does it
  emit a header / banner / ASCII art? (Banners on stdout break
  `$(tool --version)` users.)

### 0.2 Record the environment

```bash
printenv | sort > baseline/env.txt
uname -a         > baseline/os.txt
echo "$SHELL"   >> baseline/os.txt
locale           > baseline/locale.txt 2>&1
```

These are the ground truth for every "works for me" debate in the
report.

### 0.3 Surface hygiene check

From `baseline/help.txt`, scan for:

- Stub strings: `TODO`, `FIXME`, `XXX`, `<fill in>`, `Lorem`
- Broken references: URLs like `example.com`, `yourdomain`
- Contradictions: flag shown as `--foo` in summary but `--FOO` in
  detail

Any hit is at least a **medium** content issue.

### 0.4 Check `man` and completions (if the tool claims to provide them)

```bash
man <tool>           2>/dev/null | head -50    > baseline/man.txt
<tool> completion bash 2>/dev/null | head -20 > baseline/completion-bash.txt
<tool> completion zsh  2>/dev/null | head -20 > baseline/completion-zsh.txt
```

A broken completion script is a **high**-severity functional bug
(breaks the user's shell if sourced).

---

## Phase 1 — Surface map

The goal: enumerate every subcommand, every top-level flag, and note
which combinations the tool advertises as supported.

From `baseline/help.txt`, build:

```md
## Surface map

### Top-level flags
- `--verbose` / `-v`
- `--config <path>` / `-c`
- `--format <json|plain>` / `-f`
- `--no-color`
- `--dry-run`
- `--help` / `-h`
- `--version`

### Subcommands
- `init`      — …
- `sync`      — …
- `status`    — …
- `config get|set|unset` — nested subcommands
- `help <cmd>`

### Positional patterns
- `<tool> <file>`                  (top-level)
- `<tool> sync <source> <dest>`    (sync subcommand)
```

For nested subcommands, recurse: `<tool> config --help`,
`<tool> config get --help`, etc. Cap the depth at what the user
asked for.

**Parking lot issues spotted during mapping** (record, don't deep-
dive yet):

- Help lists a flag but doesn't describe it
- A subcommand's `--help` references a flag the top-level help
  doesn't document
- Short and long forms that disagree (`-f` listed as `--force`
  somewhere, `--file` somewhere else)

---

## Phase 2 — Golden paths per surface

For each subcommand, run the "happiest possible" invocation and
capture all three streams.

```bash
CASE=/tmp/qa-cli-session/cases/case-001
mkdir -p "$CASE"
CMD=($TOOL sync ./fixtures/a.txt ./fixtures/b.txt)
printf '%q ' "${CMD[@]}" > "$CASE/cmd"
"${CMD[@]}" > "$CASE/stdout" 2> "$CASE/stderr"
echo $? > "$CASE/exit"
```

Check:

- Exit `0` on success? (Anything else on the golden path is a
  **high**.)
- Is stdout the data the user wants, or is it mixed with progress /
  status output? (Progress should go to stderr; stdout should be
  pipe-safe.)
- Is stderr empty, or does it contain benign diagnostics?
- Are any side-effect files / dirs created? Record a `ls -la` before
  and after.

Repeat for every subcommand within scope. One case per invocation.

---

## Phase 3 — Errors & validation

The CLI's error surface tells you how well it respects its users.

### 3.1 Bad flags

```bash
$TOOL --nonexistent-flag           # Expect: exit!=0, useful stderr
$TOOL -Z                            # Expect: same
$TOOL --config                      # Missing value for flag expecting one
$TOOL --format banana               # Invalid enum value
$TOOL sync                          # Missing required positional
$TOOL sync a b c d                  # Too many positionals
$TOOL --verbose --quiet             # Conflicting flags (if both exist)
```

For each, capture stdout/stderr/exit code. Red flags:

- Exit `0` on bad input → **critical**
- Helpful error in stdout instead of stderr → **high**
  (breaks `>/dev/null 2>errors.log` pattern)
- Error message that's a stack trace or includes internal file paths
  → **high** (unprofessional, leaks internals)
- Error with no suggestion and no `See '<tool> --help'` hint → **medium**

### 3.2 Bad input

Create fixtures that exercise the boundary:

```bash
# Empty file
: > fixtures/empty.txt

# File that doesn't exist
$TOOL process fixtures/does-not-exist.txt

# File with no read permission (if testing as a non-root tool)
echo hi > fixtures/denied.txt && chmod 000 fixtures/denied.txt
$TOOL process fixtures/denied.txt ; chmod 644 fixtures/denied.txt

# Binary data where the tool expects text
head -c 4096 /dev/urandom > fixtures/binary.bin
$TOOL process fixtures/binary.bin

# Input that looks like a flag
echo 'hello' > fixtures/--foo
$TOOL process fixtures/--foo          # should require `--` separator or quote

# Very large input (streaming test — see Phase 4)
```

Each case's shape matters: a `FileNotFoundError` traceback is a bug;
`error: no such file: 'fixtures/does-not-exist.txt'` on stderr with
exit !=0 is correct.

### 3.3 Bad environment

- `HOME` unset: `env -u HOME $TOOL`
- `PATH` stripped: `env PATH= $TOOL` (does the tool shell out? Should
  fail gracefully)
- `LANG=C`: `env LANG=C $TOOL --help` — any mojibake?

---

## Phase 4 — Output: stdout vs stderr, formats, colors, TTY detection

This is the phase CLIs most often fail.

### 4.1 Stdout / stderr separation

For the golden-path commands, confirm:

```bash
$TOOL command > /dev/null          # you should still see status / progress on stderr
$TOOL command 2> /dev/null         # you should still see the data on stdout
$TOOL command > out.txt 2> err.txt # the split is clean
```

Rules:

- **Data goes to stdout.** Anything a script would want to capture
  (`$(tool foo)`) lives here.
- **Progress, warnings, status, errors go to stderr.** They should
  never appear in `>out.txt`.
- If `--verbose` adds chatty output, it goes to stderr unless it IS
  the data.

### 4.2 Format flags

If the tool advertises `--format json` / `--json`:

```bash
$TOOL list --format json | jq .       # must parse
$TOOL list --format json > out.json ; wc -l out.json  # size sanity
```

A tool that says it outputs JSON but produces invalid JSON is
**critical**. Common bugs:

- A banner / progress line leaks into the JSON stream
- UTF-8 BOM at the start
- Trailing progress `\r`s
- `print()` debug statement left in → malformed JSON

### 4.3 Color: TTY vs pipe vs NO_COLOR

Invoke three ways:

```bash
$TOOL list                 # attached TTY → color OK
$TOOL list | cat           # piped → color must disappear (isatty check)
NO_COLOR=1 $TOOL list      # NO_COLOR spec → color must disappear
$TOOL list --no-color      # explicit flag → color must disappear
```

Grep each capture for ANSI codes:

```bash
grep -cP $'\x1b\\[' cases/case-NNN/stdout
```

- Color on pipe = **high** (breaks piping into grep, less, etc.)
- `NO_COLOR=1` ignored = **high** (spec violation,
  https://no-color.org)
- `--no-color` present but non-functional = **high**

### 4.4 Verbosity levels

If `--verbose` / `-v` / `-vv` / `--quiet` exist:

```bash
$TOOL command           2> stderr-normal
$TOOL command --verbose 2> stderr-verbose
$TOOL command --quiet   2> stderr-quiet
wc -l stderr-*          # expect: quiet < normal < verbose
```

`--quiet` that still emits warnings, or `--verbose` that adds
nothing, are **medium** bugs.

---

## Phase 5 — I/O: stdin, files, paths, globs

### 5.1 Stdin

If the tool advertises stdin support (`<tool> -` or implicit):

```bash
echo 'hello' | $TOOL process -          # piped
$TOOL process - < fixtures/a.txt        # redirected
$TOOL process                           # no stdin and no args — should fail fast,
                                        # NOT hang waiting for tty input in a
                                        # non-interactive context (common bug)
$TOOL process </dev/null                # closed stdin
```

**Hangs when stdin is closed** = **critical** (breaks CI, cron, any
piped use).

### 5.2 Paths and globs

```bash
$TOOL process ~/file.txt                # tilde expansion works? (shell-level, but
                                        # check the tool resolves correctly)
$TOOL process './relative/path.txt'
$TOOL process '/absolute/path.txt'
$TOOL process 'fixtures/*.txt'          # does the tool expand globs or rely on
                                        # the shell? Document which.
$TOOL process 'path with spaces.txt'    # quoting
```

### 5.3 Output to a file

```bash
$TOOL export --out result.txt          # --out flag creates / overwrites?
$TOOL export --out /no-permission.txt  # clear error, not a traceback
$TOOL export --out /tmp/a/b/c/d.txt    # does it mkdir -p or fail?
```

Document what it does; note surprising choices.

---

## Phase 6 — State: environment, config files, precedence

### 6.1 Env vars

Grep `--help` for mentioned env vars (`XYZ_CONFIG`, `XYZ_TOKEN`).
For each:

```bash
env -u XYZ_CONFIG $TOOL ...             # what happens without it?
XYZ_CONFIG=/non/existent $TOOL ...       # bad path?
XYZ_CONFIG='' $TOOL ...                  # empty string?
```

### 6.2 Config file

If the tool reads a config (`~/.config/<tool>/config.yaml`,
`./.toolrc`, etc.):

- Create a valid one; confirm it's loaded
- Create an invalid one (malformed YAML / JSON); expect clear error
  on stderr, non-zero exit, **not** a parser traceback
- Create an empty one; expect defaults

### 6.3 Precedence

The standard order is **flag > env > config > default**. Test it
explicitly:

```bash
# Set config to value A, env to B, flag to C; confirm C wins.
printf 'setting: A\n' > fixtures/cfg.yaml
SETTING=B $TOOL --config fixtures/cfg.yaml --setting C ...
# Repeat with flag omitted (env B wins?), flag+env omitted (config A wins?)
```

Wrong precedence is **high** — it's invisible to users until they're
deep in a bug hunt.

---

## Phase 7 — Signals & cleanup

Only applicable if the tool runs for any non-trivial duration.

### 7.1 Ctrl+C (SIGINT) during work

```bash
# Kick off a long operation, then SIGINT it
$TOOL sync --large-dataset &
PID=$!
sleep 2
kill -INT $PID
wait $PID
echo "exit=$?"
```

Check:

- Does the tool exit promptly (<1s after SIGINT)?
- Exit code is 130 (`128 + SIGINT`) by convention, or at least
  non-zero?
- Does it print "cancelled" / "interrupted" on stderr?
- Does it leave behind partial files, temp dirs, lockfiles? Do a
  `ls /tmp/qa-cli-session` and a `ls -la` in the target dir before
  and after.

### 7.2 SIGTERM

```bash
$TOOL sync --large-dataset &
kill -TERM $!
wait $!
```

Same checks. Tools that ignore SIGTERM and keep running are
**critical** in orchestrated environments (Kubernetes, systemd).

### 7.3 Lockfile / pidfile hygiene

If the tool uses a lockfile (`.tool.lock`):

- Kill -9 it, then retry. Does it detect a stale lock and recover,
  or does it refuse forever? Stale-lock-blocks-forever = **high**.

---

## Phase 8 — Triage & report

### 8.1 Reconcile the notes

Open `/tmp/qa-cli-session/notes.md`. For each observation:

- Assign a **category** from `references/issue-taxonomy-cli.md`
- Assign a **severity** (critical / high / medium / low) using the
  taxonomy guidance
- Confirm you have evidence (case directory number, excerpt ready
  to quote)
- De-dupe: multiple surfaces with the same underlying issue → one
  issue with affected surfaces listed

### 8.2 Rank and pick the Top 3

The "Top 3 things to fix" section at the top of the report is the
only thing a busy maintainer will read. Pick the three with the
highest user impact — usually (a) anything that exits 0 on a real
error, (b) anything that breaks piping, (c) anything that ignores
`NO_COLOR` / `--no-color`.

### 8.3 Write the report

Use `templates/qa-report-template-cli.md`. Fill every field. If a
section is empty, write "None observed" — don't delete it.

Store evidence excerpts inline (3–10 lines each with a fenced code
block). If a full capture is >20 lines, put it in
`./qa-reports/artifacts/<session>/` and link it.

### 8.4 Health score

Use the category weights in the template. Subtract:

- 20 per critical
- 8 per high
- 3 per medium
- 1 per low

Clamp to [0, 100]. Express as `{score}/100`. The number is a rough
signal; the issue list is what matters.

---

## Phase 9 — Session cleanup

```bash
# Remove scratch fixtures if they contain sensitive output
rm -rf /tmp/qa-cli-session

# If the tool left side effects (config files, lockfiles, temp dirs),
# note each one in the report's "Residue" section and either clean it
# up (if clearly a test artifact) or flag it for the user.
```

Confirm you did not create any files outside `/tmp/qa-cli-session`
and `./qa-reports/` during the run.

---

## References

- `references/issue-taxonomy-cli.md` — categories and severity
  guidance for every kind of CLI bug
- `references/cli-driver-reference.md` — shell patterns for
  capturing streams, measuring duration, exercising TTY detection
- `references/cli-conventions.md` — POSIX / GNU / isatty / NO_COLOR /
  exit-code conventions to compare observed behavior against

## Template

- `templates/qa-report-template-cli.md` — the output format
