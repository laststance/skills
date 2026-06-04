---
name: codebase-litter-audit
description: Find unfinished code litter
---

# Codebase Litter Audit

## Codex Compatibility
When running this skill in Codex, translate Claude Code-only primitives before acting: `AskUserQuestion` -> chat/request_user_input, `TodoWrite` -> `update_plan`, `Task`/`TaskCreate`/`TeamCreate`/`SendMessage` -> `spawn_agent`/`send_input`/`wait_agent` when available and allowed, and `EnterPlanMode`/`ExitPlanMode` -> a concise chat plan plus explicit approval.
Resolve `Read`/`Write`/`Edit`/`Bash`/`WebSearch`/`WebFetch` to Codex file/shell/web tools, and map `~/.claude/...` paths to `~/.agents/...` or `~/.codex/...` unless the task explicitly targets Claude Code.

## Cursor Compatibility
When running this skill in Cursor Agent, translate Claude Code-only primitives before acting: `AskUserQuestion` -> `AskQuestion`; `TodoWrite` -> Cursor `TodoWrite` or an equivalent checklist; `Task`/`TaskCreate`/`TeamCreate`/`SendMessage`/multi-agent flows -> Cursor `Task` (subagents), parallel Tasks, or `run_in_background` when allowed (`TeamCreate`/`SendMessage` may have no exact match); `EnterPlanMode`/`ExitPlanMode` -> Plan mode (`SwitchMode` / `CreatePlan`) plus explicit approval.
Resolve `Read`/`Write`/`Edit`/`StrReplace`/`Bash`/web/search/MCP via Cursor Composer or Agent equivalents. MCP names written as `mcp__server__tool` typically map to `call_mcp_tool` with configured server identifiers. Map `~/.claude/...` to `~/.cursor/skills/`, `.cursor/skills/`, and `.cursor/rules/` unless the task explicitly targets Claude Code.

## Overview

Find incomplete or misleading work that is still reachable, visible, or confusing even when dead-code scanners report nothing. Treat the scanner as a lead generator, then verify each finding by reading neighboring code, tests, docs, and issue tracker context.

## Workflow

1. Establish scope.
   - Run `git status --short` and note whether the worktree is dirty.
   - Identify the repo root and primary tracker (`gh issue list` when GitHub is configured).
   - Do not edit files unless the user explicitly asks for cleanup.

2. Collect candidate signals.
   - Prefer the bundled scanner:

```bash
python3 ~/.codex/skills/codebase-litter-audit/scripts/scan_litter.py . --markdown
```

   - If the repo is huge, pass focused paths after the repo root: `--include src --include e2e`.
   - Supplement with `rg` for domain words the scanner cannot infer, such as feature names, issue IDs, or product terminology.

3. Verify candidates manually.
   - Read the candidate line and nearby code.
   - Trace one call site, UI surface, test, or doc reference before calling it real.
   - Search for later migrations, docs, PRs, or issues that may supersede an old TODO.
   - Classify stale comments separately from active defects.

4. Report with evidence.
   - Lead with high-confidence, user-visible, or security-relevant litter.
   - Anchor every claim to a clickable file path and line.
   - Include severity as `High`, `Medium`, or `Low`.
   - State the smallest cleanup path: remove UI, implement behavior, unskip/replace test, update docs, or close as stale.
   - Mention likely duplicate/open issues if found.

## What Counts

Use `references/signal-catalog.md` when deciding whether a candidate is worth reporting.

Strong signals:
- Visible commands, routes, buttons, menus, settings, or CLI options wired to stubs or no-op handlers.
- `TODO`, `FIXME`, `not implemented`, `stub`, `temporary`, or `WIP` attached to reachable product code.
- Tests skipped for real product behavior, especially persistence, auth, security, data loss, or critical flows.
- Comments or docs that contradict later code, migrations, or configuration.
- Placeholder assets or copy that can ship to users.
- Suppressions such as `eslint-disable`, `ts-ignore`, `@ts-expect-error`, or broad ignores with no issue link or expiry.

Weak signals:
- Example text in stories/tests.
- Placeholder attributes in normal forms.
- Historical migration comments already superseded by a later migration.
- Generated files, lockfiles, vendored code, or `.git` hook samples.

## Output Template

```markdown
## Codebase Litter Audit

### Findings

- **Medium: <short title>**
  Evidence: [file.ts](/abs/path/file.ts:12)
  Why it matters: <reachable/visible/confusing behavior>
  Smallest cleanup: <implement/remove/document/issue>

### Probably Benign

- <candidate that looked suspicious but was superseded or test-only>

### Suggested Issues

- <one issue per actionable cleanup, with labels if the tracker supports them>
```

## Bundled Resources

- `scripts/scan_litter.py`: candidate scanner that emits Markdown or JSON.
- `references/signal-catalog.md`: classification guide for deciding what is real litter versus normal code.
