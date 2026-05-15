---
name: skill-inspect
description: Skill inspector
argument-hint: "[name]"
---

# Skill Inspector

## Codex Compatibility
When running this skill in Codex, translate Claude Code-only primitives before acting: `AskUserQuestion` -> chat/request_user_input, `TodoWrite` -> `update_plan`, `Task`/`TaskCreate`/`TeamCreate`/`SendMessage` -> `spawn_agent`/`send_input`/`wait_agent` when available and allowed, and `EnterPlanMode`/`ExitPlanMode` -> a concise chat plan plus explicit approval.
Resolve `Read`/`Write`/`Edit`/`Bash`/`WebSearch`/`WebFetch` to Codex file/shell/web tools, and map `~/.claude/...` paths to `~/.agents/...` or `~/.codex/...` unless the task explicitly targets Claude Code.

## Cursor Compatibility
When running this skill in Cursor Agent, translate Claude Code-only primitives before acting: `AskUserQuestion` -> `AskQuestion`; `TodoWrite` -> Cursor `TodoWrite` or an equivalent checklist; `Task`/`TaskCreate`/`TeamCreate`/`SendMessage`/multi-agent flows -> Cursor `Task` (subagents), parallel Tasks, or `run_in_background` when allowed (`TeamCreate`/`SendMessage` may have no exact match); `EnterPlanMode`/`ExitPlanMode` -> Plan mode (`SwitchMode` / `CreatePlan`) plus explicit user approval.
Resolve `Read`/`Write`/`Edit`/`StrReplace`/`Bash`/web/search/MCP via Cursor Composer or Agent equivalents. MCP names written as `mcp__server__tool` typically map to `call_mcp_tool` with configured server identifiers. Map `~/.claude/...` to `~/.cursor/skills/`, `.cursor/skills/`, and `.cursor/rules/` unless the task explicitly targets Claude Code.


Read-only diagnostic. Resolves any name across the skill ecosystem and displays a structured info card with provenance, metadata, and cross-tool availability.

<essential_principles>

- Read-only: never modify, install, or execute anything
- Report ALL matches across all categories (a name may exist in multiple places)
- Always include cross-tool availability check for skills

</essential_principles>

## Step 1: Resolve Name

Extract `<name>` from the user's argument. Run all checks — report every hit:

### 1a. Skill (`~/.claude/skills/` + `~/.agents/skills/`)

```bash
test -d ~/.claude/skills/<name> && echo "SKILL_FOUND_CLAUDE"
test -d ~/.agents/skills/<name> && echo "SKILL_FOUND_AGENTS"
```

If found in either location, sub-classify:

```bash
if [ -L ~/.claude/skills/<name> ]; then
  target=$(readlink ~/.claude/skills/<name>)
  echo "SYMLINK: $target"
elif [ -d ~/.claude/skills/<name> ]; then
  echo "REAL_DIR"
fi
```

Then Read `~/.agents/.skill-lock.json` and check if `<name>` is a key in `.skills`:

| Condition | Type Label |
|-----------|------------|
| Symlink AND in skill-lock.json | **CLI-installed** (`npx skills`) |
| Symlink target contains `gstack/` | **gstack** (bundled) |
| Real directory, NOT in skill-lock.json | **Hand-crafted** (local) |
| Only in `~/.agents/skills/` (no symlink in `~/.claude/skills/`) | **CLI-installed (not linked to Claude Code)** |

### 1b. Plugin Skill

Read `~/.claude/plugins/installed_plugins.json` to get all plugin `installPath` values.

For each plugin, check:
```bash
test -d {installPath}/skills/<name> && echo "PLUGIN_SKILL_FOUND"
```

If found, extract from `installed_plugins.json`: plugin name (key), `version`, `installedAt`, marketplace (from key format `plugin@marketplace`).

### 1c. Legacy Command

```bash
test -f ~/.claude/commands/<name>.md && echo "LEGACY_COMMAND"
```

### 1d. Agent Definition

```bash
test -f ~/.claude/agents/<name>.md && echo "AGENT_FOUND"
```

### 1e. MCP Server

Read `~/.claude.json` and check if `<name>` is a key in `mcpServers`.
Also Read `~/.claude/.mcp.json` and check `mcpServers`.

If found, note: "MCP Server is a tool provider, not a skill."

### 1f. Built-in Command

Check against the list in `@references/built-ins.md`.

### 1g. No Match — Fuzzy Search

If nothing found:
```bash
ls ~/.claude/skills/ ~/.agents/skills/ ~/.claude/commands/ ~/.claude/agents/ 2>/dev/null | grep -i "<name>"
```

Suggest up to 5 closest substring matches.

## Step 2: Gather Metadata

Based on resolved type, collect fields:

| Type | Read | Fields |
|------|------|--------|
| CLI-installed | SKILL.md frontmatter + skill-lock.json entry | description, argument-hint, source, installedAt, updatedAt |
| Hand-crafted | SKILL.md frontmatter + `git log --format='%ai' -1 -- ~/.claude/skills/<name>` | description, argument-hint, last git commit date |
| gstack | SKILL.md frontmatter + `readlink` target | description, argument-hint, bundle path |
| Plugin Skill | SKILL.md frontmatter + installed_plugins.json | description, plugin@marketplace, version, installedAt |
| Legacy Command | .md frontmatter | description |
| Agent Definition | .md frontmatter | description, model |
| MCP Server | config JSON | transport type (stdio/http), command or url |
| Built-in | @references/built-ins.md | description |

## Step 3: Cross-Tool Availability

For any skill found, check presence across AI Agent tools:

```bash
for dir in ~/.agents/skills ~/.claude/skills ~/.cursor/skills ~/.codex/skills ~/.gemini/skills ~/.vscode/skills ~/.antigravity/skills; do
  tool=$(basename "$(dirname "$dir")")
  tool=${tool#.}
  [ -d "$dir/<name>" ] && echo "✅ $tool" || echo "— $tool"
done
```

## Step 4: Display Info Card

Present using this format:

```
## 🔍 <name>

| Field | Value |
|-------|-------|
| **Type** | <type label> |
| **Description** | <from frontmatter> |
| **Location** | <full path> |
| **Source** | <repo / plugin@marketplace / "local"> |
| **Installed** | <YYYY-MM-DD or "—"> |
| **Updated** | <YYYY-MM-DD or "—"> |
| **Arguments** | <argument-hint or "—"> |

### Available In
✅ claude  ✅ cursor  ✅ codex  ✅ gemini  — vscode  — antigravity

### Capabilities
<First content section of SKILL.md body after frontmatter, up to ~10 lines>
```

**Adapt fields per type:**
- CLI-installed / Hand-crafted / gstack / Plugin: show all fields
- Legacy Command: omit Source, Installed, Updated; show "⚠️ Deprecated — migrate to Skills format"
- Agent Definition: show model field instead of Arguments; omit Available In
- MCP Server: show transport + connection info; omit Available In; add note
- Built-in: show description only; note "Hardcoded in Claude Code application"

If multiple matches found, display one card per match with a separator.

## Boundaries

**Will:** Read files, check symlinks, display info, suggest fuzzy matches.
**Will Not:** Modify files, install/uninstall, execute skills, query running MCP servers.

@references/built-ins.md
