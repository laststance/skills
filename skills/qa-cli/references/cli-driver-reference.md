# CLI driver cheat sheet (shell patterns for qa-cli)

Hot-path shell recipes for capturing evidence from one-shot CLI
invocations. Everything here assumes `bash` / `zsh` / `fish` — no
MCP required.

## Capturing all three channels at once

The primary pattern. One case = one directory = three files.

```bash
CASE=/tmp/qa-cli-session/cases/case-NNN
mkdir -p "$CASE"

# Record the exact command BEFORE running it, quoted safely
CMD=($TOOL subcmd --flag value arg)
printf '%q ' "${CMD[@]}" > "$CASE/cmd"

# Run and split streams
"${CMD[@]}" > "$CASE/stdout" 2> "$CASE/stderr"
echo $? > "$CASE/exit"

# Convenience dump for quick review
{
  echo "# $(cat $CASE/cmd)"
  echo "exit: $(cat $CASE/exit)"
  echo "--- stdout ---"; cat "$CASE/stdout"
  echo "--- stderr ---"; cat "$CASE/stderr"
} > "$CASE/summary.txt"
```

### Why one dir per case

- `diff` works cleanly between cases
- You can attach the dir to the report without hand-editing
- If you need to rerun a case, you already have `cmd` verbatim

## Measuring exit codes

```bash
$TOOL foo
echo $?            # 0..255, signal-killed = 128+N
```

Common codes to recognize on sight:

| Code | Meaning (convention) |
|------|----------------------|
| 0    | success |
| 1    | general error |
| 2    | misuse (bad flag / usage) — GNU convention |
| 64   | usage error — sysexits.h (BSD) |
| 65   | data format error — sysexits.h |
| 77   | permission denied — sysexits.h |
| 126  | command found but not executable |
| 127  | command not found |
| 130  | terminated by Ctrl+C (`128 + 2`) |
| 137  | killed by SIGKILL (`128 + 9`) |
| 143  | terminated by SIGTERM (`128 + 15`) |

See `references/cli-conventions.md` for the full sysexits table.

## TTY vs pipe detection

CLIs often detect `isatty(stdout)` to decide whether to emit color,
progress bars, or prompts. The three ways to test:

```bash
# Attached to a real TTY (normal interactive)
$TOOL list

# Piped (stdout is a pipe, not a TTY)
$TOOL list | cat

# Redirected to a file (stdout is a regular file)
$TOOL list > /tmp/out.txt

# Stdin closed (no input at all)
$TOOL process < /dev/null

# Output fully detached
$TOOL list </dev/null >/dev/null 2>&1 ; echo "exit=$?"
```

### Forcing TTY detection in scripts

Some tools only behave correctly interactively. To simulate a TTY
under capture, use `script`:

```bash
# Linux util-linux
script -q -c "$TOOL list" /tmp/ttylog.txt

# macOS / BSD (different flag order)
script -q /tmp/ttylog.txt $TOOL list
```

`script` gives stdout a pseudo-TTY. Compare its output to the
non-TTY version to see which adaptations the tool is making.

## Counting ANSI escapes (color leak detection)

ANSI CSI sequences start with `ESC [` (hex `1b 5b`). To count them
in a captured stream:

```bash
grep -cP $'\x1b\\[' cases/case-NNN/stdout
# 0 on a pipe  → good, no color bleed
# >0 on a pipe → high-severity color leak
```

To strip ANSI for comparison purposes:

```bash
sed -E 's/\x1b\[[0-9;]*[A-Za-z]//g' cases/case-NNN/stdout > stripped.txt
```

## Stdin tests

```bash
# Stdin from a pipe
echo 'content' | $TOOL process -

# Stdin from a file
$TOOL process - < fixtures/input.txt

# Stdin empty (closed immediately)
$TOOL process - < /dev/null

# Stdin with no redirect in a script context (this is the bug-catcher —
# does the tool hang, or does it fail fast?)
timeout 5 $TOOL process
echo "exit=$? (124 = timeout hit)"
```

`timeout 5 <tool>` is your friend: if the tool hangs waiting for
interactive stdin when it shouldn't, you see exit 124 after 5
seconds. Without `timeout`, Claude sits there forever.

## Measuring startup time

```bash
# Real time to run --help
time $TOOL --help >/dev/null 2>&1

# Better: use /usr/bin/time for resource info
/usr/bin/time -l $TOOL --help >/dev/null 2>&1        # macOS
/usr/bin/time -v $TOOL --help >/dev/null 2>&1        # Linux

# Warm vs cold: clear OS caches (needs root; skip unless user approves)
```

A small tool should launch in <100 ms. A Node.js CLI commonly lands
at 150–300 ms. >500 ms for `--help` on a "simple" tool is a smell;
>2 s is a high-severity issue.

## Signal handling

```bash
# SIGINT (Ctrl+C)
$TOOL long-op &
PID=$!
sleep 2
kill -INT $PID
wait $PID 2>/dev/null
echo "SIGINT exit: $?"     # Convention: 130

# SIGTERM (graceful shutdown)
$TOOL long-op &
PID=$!
sleep 2
kill -TERM $PID
wait $PID 2>/dev/null
echo "SIGTERM exit: $?"    # Convention: 143

# SIGKILL (ungraceful — shouldn't matter, process can't catch it)
$TOOL long-op &
PID=$!
sleep 2
kill -KILL $PID
wait $PID 2>/dev/null
echo "SIGKILL exit: $?"    # 137; useful to see what state is left
```

After each, snapshot residue:

```bash
# Files the tool created in the cwd during its run
find . -newer /tmp/before.stamp -not -path './.git/*' 2>/dev/null

# Temp files in /tmp
ls -la /tmp/*$tool* 2>/dev/null
```

## Environment manipulation

```bash
# Run with a stripped env except named vars
env -i HOME=$HOME PATH=$PATH $TOOL --help

# Unset a single var
env -u XYZ_CONFIG $TOOL ...

# Set a specific locale
env LANG=C LC_ALL=C $TOOL ...
env LANG=ja_JP.UTF-8 $TOOL ...
env LANG=tr_TR.UTF-8 $TOOL ...   # classic locale-bug trap (dotless i)
```

The Turkish locale is famous for breaking case-insensitive string
comparisons (`I` → `ı` / `İ` mismatch). If the tool deals with text
in any way, test it under `tr_TR`.

## Config file precedence testing

```bash
mkdir -p fixtures
printf 'setting: A\n' > fixtures/cfg.yaml

# 1) Config file only
$TOOL --config fixtures/cfg.yaml show-setting

# 2) Env overrides config
SETTING=B $TOOL --config fixtures/cfg.yaml show-setting
# Expected output: B

# 3) Flag overrides env and config
SETTING=B $TOOL --config fixtures/cfg.yaml --setting C show-setting
# Expected output: C
```

## Glob / path / quoting edge cases

```bash
# Tilde expansion — shell does it, not the tool
$TOOL process ~/file.txt
# vs
$TOOL process '~/file.txt'            # tool sees literal '~'

# Globs — again, shell vs tool
$TOOL process fixtures/*.txt          # shell expands
$TOOL process 'fixtures/*.txt'        # tool receives literal

# Arguments that look like flags
echo hi > fixtures/--weird
$TOOL process fixtures/--weird        # should be OK with leading ./
$TOOL process ./fixtures/--weird      # explicit relative path
$TOOL process -- fixtures/--weird     # `--` end of flag parsing

# Spaces in paths
mkdir -p 'fixtures/has space'
echo hi > 'fixtures/has space/a.txt'
$TOOL process 'fixtures/has space/a.txt'
```

## JSON output validation

```bash
# Does it parse?
$TOOL list --format json | jq .
echo "parse-exit=$?"             # 0 = valid JSON

# Count objects
$TOOL list --format json | jq 'length'

# Check for embedded non-JSON (leaked progress / banners)
$TOOL list --format json > /tmp/out.json 2>/tmp/err.log
head -1 /tmp/out.json            # should look like JSON, not a banner
python3 -m json.tool /tmp/out.json > /dev/null && echo OK || echo BAD
```

## Idempotency & side effects

```bash
# Before
ls -laR target/ > /tmp/before.txt

# Run twice
$TOOL apply ./config.yaml
$TOOL apply ./config.yaml

# After
ls -laR target/ > /tmp/after.txt
diff /tmp/before.txt /tmp/after.txt
# If the second run caused changes that the first didn't, not idempotent.
```

## Quick "any surprise" sniff

When a golden-path run looks clean, do one last paranoid check:

```bash
# Any secret-looking strings in output?
grep -iE 'token|password|secret|api[_-]?key' cases/case-NNN/{stdout,stderr}

# Trailing whitespace / CRLF
cat -A cases/case-NNN/stdout | head -20

# Non-printable chars (other than \n and \t)
LC_ALL=C grep -lP '[^\x09\x0a\x20-\x7e]' cases/case-NNN/stdout 2>/dev/null
```

These catches are cheap and have a high rate of surfacing issues
that the structured phases miss.
