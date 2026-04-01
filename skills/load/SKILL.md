---
name: load
description: |
  Load project context from Serena MCP memory for session initialization.
  Portable across all Serena-enabled agents (Claude Code, Cursor, Windsurf, etc.).

  Use when: starting a session, resuming work, or needing project context.
  Keywords: session, load, initialize, context, memory, restore, resume
argument-hint: "[project]"
---

# Session Load

Load project context from Serena MCP memory.

<essential_principles>

- All context loading uses Serena MCP tools exclusively (no agent-specific tools)
- Follow cross-references found in loaded memories ("MUST read", "also read")

</essential_principles>

## Step 1: Activate

1. Call `check_onboarding_performed`
2. If not onboarded: call `onboarding`
3. Call `list_memories` to discover all memory keys

## Step 2: Read Memories

**If memories exist:**

4. Read all `CRITICAL_*` memories
5. Follow cross-references: if any loaded memory says "MUST read", "also read", or "see also" — read those keys
6. Read the most recent `session_*` memory (by date in key name)

**If no memories exist:**

4. Note this is a first session — suggest running `/save` at end of session

## Step 3: Report

Present to the user:

```
## Session Loaded

- **Project**: [name]
- **Memories Loaded**: [count] ([list of keys])
- **Key Context**: [1-2 sentence summary of project state]
- **Previous Session**: [summary from session_* memory, or "None"]
- **Status**: Ready
```
