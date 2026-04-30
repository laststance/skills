---
name: sync-pencil
description: .pen<->code sync
---

# Sync Pencil

Bidirectional synchronization between Pencil .pen designs and implementation code.

<essential_principles>
## How This Skill Works

### Platform Abstraction

This skill works across multiple platforms using unified screenshot capture:

| Platform | MCP Server | Screenshot Tool |
|----------|------------|-----------------|
| Electron | electron-playwright-cli | `electron-playwright-cli screenshot` |
| Web | mcp__claude-in-chrome | `read_page` + screenshot |
| iOS Sim | mcp__ios-simulator | `screenshot` |

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
