---
name: load
description: |
  Load project context from Serena MCP memory for session initialization.
  Discovers memories, reads project overview and critical rules, explores
  project structure via list_dir, and validates context sufficiency.
  Portable across all Serena-enabled agents (Claude Code, Cursor, Windsurf, etc.).

  Use when: starting a session, resuming work, or needing project context.
  Keywords: session, load, initialize, context, memory, restore, resume
---

# Session Load

Load project context from Serena MCP memory for cross-session continuity.

<essential_principles>

## Core Requirements

- All context loading uses Serena MCP tools exclusively (no agent-specific tools)
- Always read `project_overview` first if it exists (anchor memory)
- Follow cross-references: if any memory contains "MUST read", "CRITICAL", or "also read" directives, obey them
- Never skip `think_about_collected_information` validation at the end
- Report loaded context as a structured summary to the user

</essential_principles>

## Phase 1: Project Activation

1. Call `check_onboarding_performed` to verify Serena knows this project
2. If not onboarded: call `onboarding` to index the project first
3. Call `list_memories` to discover all available memory keys

## Phase 2: Context Loading

**If memories exist (returning session):**

4. Call `read_memory("project_overview")` — the anchor memory
5. Scan loaded content for cross-reference directives:
   - Look for: "CRITICAL", "MUST read", "also read", "see also"
   - Read each referenced memory key
6. Read any `CRITICAL_*` prefixed memories from the list
7. Read the most recent `session_*` memory (sort by date in key name)

**If no memories exist (first session):**

4. Call `list_dir` at project root (depth 2) to understand structure
5. Look for README, project config files (package.json, Cargo.toml, pyproject.toml, etc.)
6. Suggest creating a `project_overview` memory for future sessions

## Phase 3: Structure Discovery

8. Call `list_dir` at project root (depth 1) to confirm folder layout
9. Note key directories (src/, lib/, tests/, docs/, scripts/, etc.)

## Phase 4: Validation

10. Call `think_about_collected_information` to verify context sufficiency
11. If insufficient: read additional memories or explore more directories

## Phase 5: Session Report

Report to the user:

```
## Session Loaded

- **Project**: [name]
- **Memories Loaded**: [count] ([list of keys])
- **Key Context**: [1-2 sentence summary of project state]
- **Previous Session**: [summary from session_* memory, or "None"]
- **Project Structure**: [key directories]
- **Status**: Ready
```

## Memory Prefix Reference

| Prefix | Purpose | Load Priority |
|--------|---------|---------------|
| `project_overview` | Project summary | 1st (always) |
| `CRITICAL_*` | Must-read rules | 2nd (never skip) |
| Cross-referenced | Memories referenced by loaded content | 3rd |
| `session_*` | Session checkpoints | 4th (latest only) |
| `plan_*` | Active plans | 5th (if relevant) |
| `pattern_*` | Learned patterns | On demand |
| `discovery_*` | Brainstorming results | On demand |
| `todo_*` | Persistent TODOs | On demand |

## Success Criteria

- [ ] Serena project is activated/onboarded
- [ ] `project_overview` read (or noted as missing)
- [ ] All `CRITICAL_*` memories read
- [ ] Cross-reference directives followed
- [ ] Project structure discovered via `list_dir`
- [ ] `think_about_collected_information` called
- [ ] Session report presented to user
