---
name: sync-pencil
description: .pen<->code sync
---

# Sync Pencil

## Codex Compatibility
When running this skill in Codex, translate Claude Code-only primitives before acting: `AskUserQuestion` -> chat/request_user_input, `TodoWrite` -> `update_plan`, `Task`/`TaskCreate`/`TeamCreate`/`SendMessage` -> `spawn_agent`/`send_input`/`wait_agent` when available and allowed, and `EnterPlanMode`/`ExitPlanMode` -> a concise chat plan plus explicit approval.
Resolve `Read`/`Write`/`Edit`/`Bash`/`WebSearch`/`WebFetch` to Codex file/shell/web tools, and map `~/.claude/...` paths to `~/.agents/...` or `~/.codex/...` unless the task explicitly targets Claude Code.

Bidirectional synchronization between Pencil .pen designs and implementation code.

<essential_principles>
## How This Skill Works

### Platform Abstraction

This skill works across multiple platforms using unified screenshot capture:

| Platform | Tool | Screenshot Command |
|----------|------|--------------------|
| Electron | `playwright-cli` (attached to Electron CDP) | `playwright-cli --s=default screenshot --filename=<name>.png` |
| Web | `playwright-cli` | `playwright-cli screenshot --filename=<name>.png` |
| iOS Sim | `mcp__ios-simulator` | `mcp__ios-simulator__screenshot` |

**Before any browser interaction**: invoke `/dnd` to load the drag-and-drop
verification protocol. Required even when DnD is not yet known to be involved —
ref-based `drag` returns false success on `dnd-kit` and similar libraries.

### Component Matching

Components are matched between .pen and code using:

1. **Name convention**: `Button` in .pen ↔ `Button.tsx` in code
2. **Node ID**: `.pen` node `id` attribute (e.g., `id="NavBar"`)
3. **Frame name**: `.pen` frame `name` attribute

### Sync Direction Rules

| Scenario | Recommended Direction |
|----------|----------------------|
| Design finalized, code outdated | `pencil-to-code` |
| Code evolved, design stale | `code-to-pencil` |
| Both have good changes | `sync` (merge) |
| Initial implementation | `pencil-to-code` |
</essential_principles>

<intake>
What would you like to do?

1. **code-to-pencil** - Update .pen design from current implementation
2. **pencil-to-code** - Generate/update code from .pen design
3. **sync** - Compare and merge changes bidirectionally
4. **exhaustive** - Full element-by-element audit with progress tracking (Roller Strategy)

**Wait for response before proceeding.**
</intake>

<routing>
| Response | Workflow |
|----------|----------|
| 1, "code-to-pencil", "update design", "update pen" | `workflows/code-to-pencil.md` |
| 2, "pencil-to-code", "generate code", "export" | `workflows/pencil-to-code.md` |
| 3, "sync", "compare", "merge", "diff" | `workflows/sync.md` |
| 4, "exhaustive", "full", "audit", "all elements", "roller", "complete" | `workflows/exhaustive-sync.md` |

**After reading the workflow, follow it exactly.**
</routing>

<reference_index>
## References

| File | Purpose |
|------|---------|
| `references/platform-detection.md` | Detect and use correct MCP for platform |
| `references/diff-algorithm.md` | Visual and structural diff detection |
| `references/merge-strategies.md` | Conflict resolution strategies |
| `references/node-mapping.md` | .pen node ↔ React component mapping |
| `references/element-extraction.md` | Extract all UI elements from .pen (for exhaustive sync) |
</reference_index>

<workflows_index>
## Workflows

| Workflow | Direction | Purpose |
|----------|-----------|---------|
| `code-to-pencil.md` | Code → .pen | Update design from implementation |
| `pencil-to-code.md` | .pen → Code | Generate code from design |
| `sync.md` | Bidirectional | Compare, diff, and merge |
| `exhaustive-sync.md` | Full audit | Element-by-element roller strategy with progress tracking |
</workflows_index>

<success_criteria>
## Success Criteria

- [ ] Platform correctly detected and MCP available
- [ ] Components matched between .pen and code
- [ ] Changes identified with visual diff
- [ ] User approved sync direction
- [ ] Target updated without losing work
</success_criteria>
