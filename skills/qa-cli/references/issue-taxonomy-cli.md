# CLI QA Issue Taxonomy

## Severity Levels

| Severity | Definition | CLI examples |
|----------|------------|--------------|
| **critical** | Tool is unusable for a core workflow, silently corrupts data, or breaks automation | Exits 0 on a real error (caller thinks it succeeded), hangs on closed stdin, ignores SIGTERM, produces invalid JSON under `--format json`, destroys input file on failure, leaks secrets to stdout or stderr |
| **high** | Feature works but makes the tool unfit for common use patterns | Color leaks on pipe, `NO_COLOR=1` ignored, `--no-color` flag non-functional, error goes to stdout instead of stderr, stack-trace error instead of a user message, stale lockfile blocks forever, progress messages corrupt the JSON output stream |
| **medium** | Notable problem with a workaround, or breaks a less-common flow | Cryptic error with no suggestion, `-h` and `--help` disagree, conflicting flags produce last-one-wins silently, `--quiet` still emits warnings, help text has typos or broken URLs, missing man page, completion script is incomplete |
| **low** | Cosmetic or polish | Help text alignment, inconsistent capitalization of error prefixes (`Error:` vs `error:`), trailing whitespace in output, minor UX friction |

## Categories

### 1. Exit code

The contract between a CLI and its callers. Wrong exit codes break
shell pipelines, Makefiles, CI checks, and orchestration.

- Exit `0` on error → **critical** (caller proceeds as if success)
- Non-zero on `--help` → **medium** (breaks `tool --help >/dev/null &&
  echo ok` pattern; conventionally `--help` exits 0)
- Non-zero on `--version` → **medium** (same reason)
- Always exits `1`, never distinguishes error classes → **low** to
  **medium** depending on the tool's complexity
- Uses exotic codes (`42`, `99`) without documenting them → **low**

Convention for reference: `0` = success; `1` = general error; `2` =
misuse of shell builtin (GNU uses this for bad invocation); `126` =
cannot execute; `127` = not found; `128+N` = killed by signal N.

### 2. Help / usage / documentation

- `--help` exits non-zero → **medium**
- `--help` produces no output / empty → **high**
- `-h` and `--help` produce different output (or one missing) → **medium**
- Flag listed in `--help` but not implemented → **high**
- Flag implemented but not listed → **medium**
- Stub text: `TODO`, `FIXME`, `<fill me in>`, `Lorem` → **medium**
- Broken / fake URLs: `example.com`, `yourcompany.com` → **medium**
- Help mentions a subcommand that doesn't exist → **high**
- Man page absent despite being advertised → **medium**
- Man page out of date versus `--help` → **medium**

### 3. Flag parsing

- `-abc` (combined short flags) behaves differently from `-a -b -c`
  without documentation → **high**
- Short and long forms collide (`-f` advertised as both `--force` and
  `--file`) → **high**
- Unknown flag passes silently (exit 0, no warning) → **critical**
- Flag expecting a value consumes the next flag (`--config --verbose`
  treats `--verbose` as the config path) → **high**
- `--` separator not respected (tool keeps parsing flags after it) →
  **high**
- Repeated flags: last-wins / first-wins / accumulate — any behavior
  is fine, but it must be consistent and documented. Inconsistent →
  **medium**
- Abbreviation handling (`--ver` matches both `--verbose` and
  `--version`) fails ambiguously → **medium**

### 4. Output (stdout / stderr / format)

- Data on stderr, status on stdout → **high** (breaks piping)
- Progress indicator on stdout → **high**
- Warnings on stdout mixing with data → **high**
- `--format json` produces invalid JSON → **critical**
- UTF-8 BOM prepended to output → **high** (breaks many pipelines)
- Trailing `\r` or control characters in non-TTY output → **medium**
- No final newline on stdout when a newline is expected → **low** to
  **medium** (breaks `read` in shell loops)
- Debug `print()` / `console.log` leaked in release → **high**
- Timestamps / PIDs embedded when not asked → **low** unless they
  break `diff`-based flows

### 5. Error handling & messages

- Stack trace instead of a user-facing message → **high**
- Error message contains internal file paths, package names, or
  implementation details → **medium** to **high**
- Error with no remediation suggestion and no "run --help" hint →
  **medium**
- Same error for different root causes (missing file vs permission
  denied vs not readable) → **medium**
- Exception uncaught → crash dump → **high**
- Error before validation (e.g., reads config before checking
  required args, so user sees a confusing "no such config" before the
  real "missing argument") → **medium**
- Error message leaks secrets (tokens, URLs with auth, env values) →
  **critical**

### 6. I/O: stdin, files, paths

- Hangs waiting for stdin when none is available (no `isatty` check)
  → **critical**
- Ignores stdin when `-` is passed → **high**
- Does not support stdin when the tool's purpose implies streaming
  (grep-likes, filters) → **high**
- Destroys input file on failure (e.g., truncate-then-write without
  atomic rename) → **critical**
- Creates output file without `--force` overwriting existing data
  silently → **high** (convention: confirm or require `--force`)
- Does not create parent directory for `--out` path when it "should"
  → **low** (debatable; document it)
- Path expansion broken (tilde, env var, relative) → **high**
- Binary input fed to text-mode processing produces garbage instead
  of a clear error → **medium**

### 7. State: environment, config, precedence

- Config file with invalid syntax → parser traceback → **high**
- Env var documented but ignored → **high**
- Flag does not override env → **high** (violates `flag > env > config
  > default` precedence)
- Env does not override config → **high**
- Two config paths possible (`$XDG_CONFIG_HOME`, `$HOME/.toolrc`),
  both present, undocumented tiebreak → **medium**
- Config schema change across versions with no migration → **medium**
- Defaults that depend on `$USER` or `$HOME` but don't handle the
  unset case → **medium**

### 8. Signals & cleanup

- SIGTERM ignored → **critical** (breaks k8s, systemd)
- SIGINT leaves partial output file → **high**
- SIGINT leaves lockfile or pidfile → **high** (blocks retries)
- Exit code on signal is `0` or `1` rather than `128+N` → **medium**
- No "cancelled" / "interrupted" message → **low**
- Forked child not cleaned up → **high** (zombie processes)
- Temp files left in `/tmp` after normal exit → **medium**

### 9. Performance & startup

- Cold startup > 500 ms for a "simple" CLI (no subcommand) → note
  as **medium**; > 2 s → **high**
- Does not stream output — buffers entire result before emitting →
  **medium** (fails on large inputs)
- Memory use grows linearly with input when a streaming algorithm
  would do → **medium**
- Re-reads config on every subcommand invocation → **low**

Measure with:

```bash
time $TOOL --help >/dev/null
/usr/bin/time -v $TOOL process big.txt 2>&1 | tail -20
```

### 10. Localization / i18n / encoding

- `LANG=C` breaks the tool (Unicode assumptions in output) → **high**
- Non-ASCII input in a file argument / stdin mangled → **high**
- Non-ASCII in argv (`tool --name "日本語"`) rejected or mangled →
  **high**
- Hard-coded English error messages when other langs are claimed to
  be supported → **medium**
- Date / number formats ignore locale when output is going to a
  human → **low**
- Date / number formats vary with locale when output is machine-
  readable (JSON) → **high** (automation-breaking)

---

## Per-surface exploration checklist

Apply to each subcommand during Phase 2–7:

1. **Help sanity** — `subcmd --help` exit 0, clean, no stubs
2. **Golden path** — expected inputs → exit 0, right streams
3. **Missing required args** — clear error, non-zero exit
4. **Bad flag value** — clear error, non-zero exit
5. **Nonexistent input** — clear error, non-zero exit, no traceback
6. **Empty input** — reasonable behavior (pass-through / empty
   output / explicit message)
7. **Piped stdin closed** — does it hang? (If yes, critical)
8. **Output redirected to /dev/null** — does progress still show on
   stderr, is data-only still going to stdout?
9. **`NO_COLOR=1`** — color gone?
10. **`--format json`** if supported → pipe to `jq .` → must parse
11. **SIGINT mid-run** (if long-running) → prompt exit, no residue
