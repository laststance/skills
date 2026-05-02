# Memory Sources

Quick reference for Step 3 (read) and Step 7 (write-back) of `syncing-docs-and-memory`.

## Activation rules

- **Serena MCP** is **always active** when reachable. It's already loaded by `/load`, so listing keys is cost-free.
- **All other sources** are **opt-in**: only included when the user's invocation phrase mentions them.

## Speech-keyword → source map

The skill scans the user's invocation message (and earlier turns in the same session) for these phrases.

| Japanese / English phrase (substring match) | Source activated |
|---------|------------------|
| "Notion も" / "Notion に" / "Notion to" | Notion MCP |
| "Obsidian も" / "vault に" / "Obsidian" | Obsidian MCP |
| "Inkdrop も" / "Inkdrop" | Inkdrop MCP |
| "gbrain も" / "brain にも" / "gbrain" | gbrain CLI |
| "learnings に" / "gstack-learnings に" | gstack-learnings CLI |
| "Codex memory も" / "Codex memory" | Codex (`~/.codex/`) |
| "ローカル `.context/` に" / "local .context" | project-local dir |

Match case-insensitively. If multiple match, activate all.

## Always-on: Serena MCP

**Probe**: try `mcp__serena__list_memories()`. If it errors, mark unavailable and skip.

**Read API**:

```text
mcp__serena__list_memories()                     # → ["key1", "key2", ...]
mcp__serena__read_memory(memory_file_name=key)   # → string content
```

Filter `list_memories` output to keys containing `$SLUG` or the repo basename before reading. **Do not bulk-read** — context cost grows fast.

**Write API** (Step 7):

```text
mcp__serena__write_memory(memory_name=key, content=...)
mcp__serena__edit_memory(memory_file_name=key, ...)
mcp__serena__delete_memory(memory_file_name=key)
```

**Naming convention**: `project-state-YYYY-MM-DD`, `convention-<topic>`, `architecture-<area>`.

## Opt-in: gstack-learnings

**Probe**: `[ -x ~/.claude/skills/gstack/bin/gstack-learnings-log ]`.

**Read**:

```bash
~/.claude/skills/gstack/bin/gstack-learnings-search --skill <name> --limit 20
```

Returns JSONL records with `{skill, type, key, insight, confidence, source, ts, files?}`. Use the `files[]` field for diff reverse lookup (see `change-detection.md`).

**Write**:

```bash
~/.claude/skills/gstack/bin/gstack-learnings-log \
  --skill syncing-docs-and-memory \
  --type pattern \
  --key '<short-key>' \
  --insight '<one-sentence learning>' \
  --confidence 0.8 \
  --source 'sync run on <branch>'
```

`type` is one of `pattern | pitfall | architecture | convention`.

## Opt-in: gbrain

**Probe**: `command -v gbrain`.

**Read**:

```bash
gbrain search "<query>" --limit 10
```

**Write** (page-scale knowledge only — design rationale, technical-selection background):

```bash
gbrain put_page --title "<title>" --tags "<tag1,tag2>" < /tmp/content.md
```

## Opt-in: Notion MCP

**Probe**: tool `mcp__claude_ai_Notion__notion-search` exists in current toolset.

**Read**: `mcp__claude_ai_Notion__notion-search(query=...)`, then `notion-fetch(id=...)`.

**Write**: `notion-update-page(page_id=..., ...)` to edit an existing page; `notion-create-pages(...)` for new ones. Always confirm the target page with the user before writing.

## Opt-in: Obsidian MCP

**Probe**: `mcp__obsidian__obsidian_list_files_in_vault` exists.

**Read**: `obsidian_get_file_contents(filepath=...)`, `obsidian_simple_search(query=...)`.

**Write**: `obsidian_append_content(filepath=..., content=...)` (preferred — non-destructive), `obsidian_patch_content(...)` (targeted edit).

## Opt-in: Inkdrop MCP

**Probe**: `mcp__inkdrop__list-notebooks` exists.

**Read**: `search-notes(keyword=...)`, `read-note(noteId=...)`.

**Write**: `create-note(...)` for new entries, `update-note(...)` / `patch-note(...)` to modify.

## Opt-in: Codex built-in memory

**Probe**: `command -v codex && [ -d ~/.codex ]`.

**Status**: Codex memory format is project-versioned and may shift. On activation, `ls ~/.codex/` and read any `memory*.md` / `notes*.md` files found. **Confirm with the user** before writing — there's no stable write API at the moment.

## Opt-in: project-local dirs

Common paths: `.context/`, `.notes/`, `docs/designs/`, `docs/notes/`.

**Probe**: directory exists at repo root.

**Read**: `find <dir> -maxdepth 2 -name "*.md"` then `Read` each.

**Write**: append to a single rolling file (e.g. `.context/sync-log.md`) with a timestamped section. Don't proliferate files.

## Never written

- **Claude auto-memory** (`~/.claude/projects/.../memory/`) — that's global user-scoped memory managed by Claude Code itself. The harness owns it; this skill stays out.

## Write-back type → destination map

Use this in Step 7 to route observations to the right place.

| Observation | Destination(s) |
|-------------|----------------|
| Project-state snapshot | Serena (always) |
| Pattern / pitfall / architecture decision | gstack-learnings (opt-in) + Serena (always) |
| Long-form rationale page | gbrain / Notion / Obsidian (opt-in) |
| Trivial / one-shot fact | **skip** |
