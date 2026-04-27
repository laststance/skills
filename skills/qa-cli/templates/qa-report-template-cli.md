# CLI QA Report: {TOOL_NAME}

| Field | Value |
|-------|-------|
| **Date** | {DATE} |
| **Tool under test** | {TOOL_INVOCATION} |
| **Binary / script path** | {PATH} |
| **Reported version** | {VERSION_STRING from --version} |
| **Runtime** | {e.g., Node 20.11 / Python 3.12 / Rust binary / Go static} |
| **Host OS** | {e.g., macOS 15.1 arm64 / Ubuntu 24.04} |
| **Shell used** | {bash 5.2 / zsh 5.9 / fish 3.7} |
| **Locale** | {LANG / LC_ALL as run} |
| **Scope** | {SCOPE or "Full tool"} |
| **Duration** | {DURATION} |
| **Cases captured** | {N} |
| **Subcommands covered** | {N of M} |

## Health Score: {SCORE}/100

| Category | Score | Notes |
|----------|-------|-------|
| Exit codes | {0-100} | right code on success / failure / signal |
| Help / usage | {0-100} | `--help` clean, complete, exits 0 |
| Flag parsing | {0-100} | short/long, combined, `--`, no silent misreads |
| Output (streams / formats) | {0-100} | stdout = data, stderr = diagnostics, JSON valid |
| Error handling | {0-100} | user-facing messages, no tracebacks |
| I/O | {0-100} | stdin / files / paths / globs / no hangs |
| State & config | {0-100} | env, config, precedence |
| Signals & cleanup | {0-100} | SIGINT/SIGTERM, no residue |
| Performance | {0-100} | startup, streaming, memory |
| Localization / i18n | {0-100} | UTF-8, LANG=C, Unicode in args / files |

Scoring guide: subtract 20 per critical, 8 per high, 3 per medium, 1
per low, clamp to [0, 100]. Rough health number — the issue list
is what matters.

## Top 3 Things to Fix

1. **{ISSUE-NNN}: {title}** — {one-line description, why first}
2. **{ISSUE-NNN}: {title}** — {…}
3. **{ISSUE-NNN}: {title}** — {…}

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
| Exit code | | | | |
| Help / usage | | | | |
| Flag parsing | | | | |
| Output | | | | |
| Error handling | | | | |
| I/O | | | | |
| State & config | | | | |
| Signals & cleanup | | | | |
| Performance | | | | |
| i18n | | | | |

## Baseline captures

| Capture | Exit | Length | Notes |
|---------|------|--------|-------|
| `--help`    | {0} | {N lines} | {observations} |
| `-h`        | {0} | {N lines} | {matches / diverges from `--help`?} |
| `--version` | {0} | {N lines} | {clean version string or banner noise?} |

## Surface map tested

### Subcommands

| Subcommand | Golden path case | Error cases | Notes |
|------------|------------------|-------------|-------|
| `init`     | case-001 | case-002, case-003 | |
| `sync`     | case-004 | case-005 | |
| `status`   | case-006 | — | |

### Top-level flags

List each flag tested, where it was tested, and whether it
behaved as documented.

| Flag | Tested in | Behavior |
|------|-----------|----------|
| `--verbose` | case-001, case-004 | {OK / diverges: …} |
| `--config <path>` | case-007, case-008 | {OK / diverges: …} |
| `--format json` | case-009, case-010 | {OK / diverges: …} |
| `--no-color` | case-011 | {OK / diverges: …} |

## Environment matrix tested

| State | Tested? | Result |
|-------|---------|--------|
| Attached TTY | yes | — |
| Piped stdout (`\| cat`) | yes | {color gone? progress gone?} |
| Redirected stdout (`> file`) | yes | {data clean? mixed streams?} |
| Closed stdin (`</dev/null`) | yes | {exits fast? hangs?} |
| `NO_COLOR=1` | yes | {color gone? ignored?} |
| `--no-color` | yes | {works?} |
| `LANG=C` | yes | {UTF-8 degrades gracefully? mojibake?} |
| `tr_TR.UTF-8` (Turkish locale) | yes/no | {if text-processing tool} |
| Missing HOME / PATH | yes/no | {crash? graceful?} |

## Signal-handling matrix

| Signal | Tested? | Exit code | Residue | Notes |
|--------|---------|-----------|---------|-------|
| SIGINT (Ctrl+C) | yes | {130 / other} | {files? lockfile?} | |
| SIGTERM | yes | {143 / other} | | |
| SIGPIPE (`\| head -5`) | yes | {0 / 141 / other} | | |

---

## Issues

### ISSUE-001: {Short title}

| Field | Value |
|-------|-------|
| **Severity** | critical / high / medium / low |
| **Category** | exit-code / help / flag / output / error / io / state / signal / perf / i18n |
| **Subcommand** | {subcommand or "top-level"} |
| **Case** | case-NNN |

**What's wrong:** {expected vs actual in one or two sentences}

**Repro:**

```bash
$ {exact command, copy-pasteable}
```

**Observed:**

```
{stdout excerpt — keep short, 3-10 lines}
```

```
{stderr excerpt}
```

`exit=N`

**Expected:**

{one-line description of what should happen, referencing a convention
from cli-conventions.md when applicable}

**Evidence:**

- `artifacts/cli-{date}-{tool}/cases/case-NNN/cmd`
- `artifacts/cli-{date}-{tool}/cases/case-NNN/stdout`
- `artifacts/cli-{date}-{tool}/cases/case-NNN/stderr`
- `artifacts/cli-{date}-{tool}/cases/case-NNN/exit`

---

(Repeat for each issue — group under `## Critical`, `## High`,
`## Medium`, `## Low` subheadings for navigability.)

---

## Residue

Files / processes / state the tool left behind during testing. Each
row is something to either clean up manually or to treat as an issue
(cross-reference if filed as one).

| Location | Contents | Source case | Treated as issue? |
|----------|----------|-------------|-------------------|
| `./.tool.lock` | stale lockfile after SIGKILL | case-015 | ISSUE-012 |
| `/tmp/tool-tmp-xxxxx/` | temp dir not cleaned | case-008 | ISSUE-009 |
| `~/.config/tool/cache/` | populated (intended) | — | no |

## Coverage notes

Things intentionally **not** tested in this run (and why):

- {e.g., Destructive subcommands (`sync --write` against a live
  target) — user did not approve scope}
- {e.g., Shell completions for fish — only bash / zsh tested}
- {e.g., Subcommand `admin` — requires credentials we don't have}
- {e.g., Windows PowerShell behavior — macOS / Linux only}
- {e.g., Very large inputs (>1 GB) — skipped; filed as "recommend
  stream test"}

## Ship readiness

| Metric | Value |
|--------|-------|
| Critical issues | {N} |
| High issues | {N} |
| Pipe-safety bugs | {N} |
| Exit-code bugs | {N} |
| Hang / signal bugs | {N} |
| Invalid-JSON-when-promised bugs | {N} |

**Recommendation:** {ship / hold for fixes / needs specific rework}

Short justification: {one sentence — e.g., "`--format json` emits a
banner that breaks `jq` parsing, and Ctrl+C leaves a stale lockfile.
Both block automation users."}

## Environment captured

- **OS**: `{uname -a}`
- **Shell**: `{$SHELL}` `{version}`
- **Locale**: `{locale output}`
- **Tool version**: `{--version string}`
- **Runtime**: `{node --version / python --version / …}`
- **Home**: `{$HOME}` (relevant if tool reads config from it)
- **XDG_CONFIG_HOME**: `{$XDG_CONFIG_HOME or "unset"}`

If the defect list looks different under another shell, OS, or
locale, that's worth a separate run.
