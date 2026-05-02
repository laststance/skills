---
name: syncing-docs-and-memory
description: Syncs project documentation files (README, AGENTS.md, CLAUDE.md, SPEC.md, root + docs/) and memory systems (Serena MCP, gstack-learnings, gbrain, Claude auto-memory etc) bidirectionally with current codebase state.
---

# syncing-docs-and-memory

Ceremony-free, bidirectional sync between project docs and memory systems.

- **Docs side**: README / AGENTS.md / CLAUDE.md / SPEC.md / CONTRIBUTING.md / ARCHITECTURE.md and any other discovered `*.md`
- **Memory side**: Serena MCP automatically; gstack-learnings / gbrain / Notion / Obsidian / Inkdrop / Codex / local `.context/` only when the user opts in via speech ("Notion も同期して" etc.)
- **NOT in scope**: CHANGELOG, VERSION, PR body, release ceremony — use `/document-release` for those

This is a **manual-only** skill. Do not auto-trigger.

## Step 0: Pre-flight

Get current branch and detect the repo's base branch (don't hardcode `main`):

```bash
CUR=$(git branch --show-current)
BASE=$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name 2>/dev/null \
  || git remote show origin 2>/dev/null | awk '/HEAD branch/ {print $NF}' \
  || echo "main")
[ "$CUR" = "$BASE" ] && echo "ABORT: on base branch ($BASE) — run from a feature branch" && exit 1
```

Capture project slug as a memory write-back hint (gstack optional):

```bash
if [ -x ~/.claude/skills/gstack/bin/gstack-slug ]; then
  source <(~/.claude/skills/gstack/bin/gstack-slug 2>/dev/null) || true
fi
SLUG="${SLUG:-$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null)}"
```

## Step 1: Diff & Repo State

```bash
git diff "$BASE"...HEAD --stat
git log "$BASE"..HEAD --oneline
git diff "$BASE"...HEAD --name-only
```

Classify changes into: **New features / Changed behavior / Removed functionality / Infrastructure**.

## Step 1.5: Scale Detection

Pick execution mode based on repo size and diff scope:

```bash
CHANGED_FILES=$(git diff "$BASE"...HEAD --name-only | wc -l | tr -d ' ')
DOC_FILES=$(find . -maxdepth 4 -name "*.md" -not -path "./.git/*" -not -path "./node_modules/*" | wc -l | tr -d ' ')
DIFF_LINES=$(git diff "$BASE"...HEAD --stat | tail -1 | grep -oE '[0-9]+ insertion' | grep -oE '^[0-9]+' || echo 0)
WORKSPACES=$(find . -maxdepth 3 \( -name "package.json" -o -name "Cargo.toml" -o -name "pyproject.toml" \) -not -path "./node_modules/*" | wc -l | tr -d ' ')
```

| Tier | Condition | Strategy |
|------|-----------|----------|
| **Small** | `DOC_FILES < 10` AND `CHANGED_FILES < 30` | Inline (single agent) |
| **Medium** | `DOC_FILES 10–40` OR `CHANGED_FILES 30–100` | Parallel `Read` (multiple in one message) |
| **Large** | `DOC_FILES > 40` OR `WORKSPACES > 3` OR `DIFF_LINES > 5000` | Spawn up to 3 `Explore` subagents in parallel, one per workspace |

**Large-mode subagent prompt template** (each agent owns one workspace, returns ≤500 words):

> "audit `<workspace>/` README/CLAUDE.md/SPEC.md against the diff. Report stale facts and narrative drift as `Recommendation: <action> because <reason>`. Do not Edit/Write — report only."

## Step 2: Doc Discovery

**Always audit** (well-known): `README.md`, `AGENTS.md`, `CLAUDE.md`, `SPEC.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, `TODOS.md` (if present).

**Discover** any other markdown:

```bash
find . -maxdepth 3 -name "*.md" \
  -not -path "./.git/*" -not -path "./node_modules/*" \
  -not -path "./.gstack/*" -not -path "./.context/*" \
  -not -path "./dist/*" -not -path "./build/*" | sort
```

Add discovered files to the audit list (deduped against well-known).

## Step 3: Memory Sources — Serena auto + opt-in

**Always (cost-free, already loaded by `/load`)**:

1. `mcp__serena__list_memories()` — list keys
2. Filter to keys matching `$SLUG` or repo name
3. `mcp__serena__read_memory()` only on relevant keys (don't read all)

If Serena MCP is unavailable, silently skip.

**Opt-in only when the user's invocation explicitly mentions a source**. Speech keyword → source mapping:

| Phrase | Source |
|--------|--------|
| "Notion も" / "Notion に" | Notion MCP |
| "Obsidian も" / "vault に" | Obsidian MCP |
| "Inkdrop も" | Inkdrop MCP |
| "gbrain も" / "brain にも" | gbrain CLI |
| "learnings に" / "gstack-learnings に" | gstack-learnings CLI |
| "Codex memory も" | Codex (`~/.codex/`) |
| "ローカル `.context/` に" | project-local dir |

For full read/write APIs and probes, see `references/memory-sources.md`.

**Never write to Claude auto-memory** (`~/.claude/projects/.../memory/`) — that's global user memory, out of scope.

## Step 4: Per-File Audit

Apply the heuristics in `references/doc-audit-heuristics.md` to each doc. In **Large** mode, aggregate the Step 1.5 subagent outputs instead of re-reading files.

Cross-check against any memory sources discovered in Step 3: flag docs whose narrative contradicts a recent learning or Serena snapshot.

Classify each candidate change:

- **Auto-update**: factual corrections — paths, counts, table rows, file trees
- **Ask user**: narrative changes, section deletes, ≥10-line rewrites, security-model edits, ambiguous relevance

For the stale-detection logic (which doc is affected by which diff path), see `references/change-detection.md`.

## Step 5: Apply Auto-Updates

Use `Edit` tool. Emit one summary line per file (e.g. `README.md: skill count 134 → 135`).

**Never auto-update**: README intro / project positioning, ARCHITECTURE.md philosophy / design rationale, security-model wording, full section deletions.

## Step 6: AskUserQuestion for Risky Changes

For each ask-user candidate, ask one question with:

- **Context**: project name, branch, doc file, what we're reviewing
- **Specific decision** to make
- `RECOMMENDATION: Choose [X] because [reason]`
- Options must include `C) Skip — leave as-is`

Apply approved edits via `Edit`.

## Step 7: Memory Write-Back

For every observed truth from Step 4 that has reuse value, write it back to the sources active in Step 3 (Serena always; others only if opted in).

| Observation type | Preferred destination |
|------------------|----------------------|
| Project-state snapshot (branch, scope, conventions) | Serena memory (always) |
| Pattern / pitfall / architecture decision | gstack-learnings (opt-in) + Serena (always) |
| Long-form page-scale knowledge | gbrain / Notion / Obsidian (opt-in) |
| Trivial current state | **Skip** (avoid memory bloat) |

**Gate every write with AskUserQuestion** (memory noise is permanent):

```
RECOMMENDATION: Append to Serena as "project-state-2026-05-02" because <reason>
A) Yes, write
B) Modify before write
C) Skip this entry
D) Skip & don't ask again this session
```

If neither Serena nor any opt-in source is available, skip the whole step and note "memory write-back: no destinations — docs sync only" in the output.

## Step 8: Out-of-Scope (do not touch)

- `CHANGELOG.md` (any change)
- `VERSION` file
- PR body / release notes
- Any release ceremony

If the diff suggests these need updates, end the run with: "Run `/document-release` for CHANGELOG/VERSION."

## Step 9: Output Summary

```
## syncing-docs-and-memory complete

**Mode**: Small | Medium | Large (N Explore agents)
**Memory sources active**: Serena (auto) [+ <opt-in sources>]

**Docs updated**:
- <file>: <one-line summary>
- (skipped: <file> — reason)

**Memory write-back**:
- Serena: N entries
- <opt-in source>: N entries
- (or: no destinations — skipped)

**Untouched** (use /document-release if needed): CHANGELOG, VERSION
**Out of scope**: Claude auto-memory (global)
```

## References

- `references/doc-audit-heuristics.md` — per-file audit checklists, auto-vs-ask split
- `references/memory-sources.md` — read/write APIs, probes, speech-keyword table
- `references/change-detection.md` — diff → stale-doc reverse lookup
