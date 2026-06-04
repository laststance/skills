---
name: create-worktree
description: Git worktree with env copy
---

# Create Worktree

## Codex Compatibility
When running this skill in Codex, translate Claude Code-only primitives before acting: `AskUserQuestion` -> chat/request_user_input, `TodoWrite` -> `update_plan`, `Task`/`TaskCreate`/`TeamCreate`/`SendMessage` -> `spawn_agent`/`send_input`/`wait_agent` when available and allowed, and `EnterPlanMode`/`ExitPlanMode` -> a concise chat plan plus explicit approval.
Resolve `Read`/`Write`/`Edit`/`Bash`/`WebSearch`/`WebFetch` to Codex file/shell/web tools, and map `~/.claude/...` paths to `~/.agents/...` or `~/.codex/...` unless the task explicitly targets Claude Code. `EnterWorktree` is Claude Code–only — on Codex, switch into the worktree with `cd /absolute/path/to/new-worktree` instead (the script already ran `git worktree add`).

## Cursor Compatibility
When running this skill in Cursor Agent, translate Claude Code-only primitives before acting: `AskUserQuestion` -> `AskQuestion`; `TodoWrite` -> Cursor `TodoWrite` or an equivalent checklist; `Task`/`TaskCreate`/`TeamCreate`/`SendMessage`/multi-agent flows -> Cursor `Task` (subagents), parallel Tasks, or `run_in_background` when allowed (`TeamCreate`/`SendMessage` may have no exact match); `EnterPlanMode`/`ExitPlanMode` -> Plan mode (`SwitchMode` / `CreatePlan`) plus explicit user approval.
Resolve `Read`/`Write`/`Edit`/`StrReplace`/`Bash`/web/search/MCP via Cursor Composer or Agent equivalents. MCP names written as `mcp__server__tool` typically map to `call_mcp_tool` with configured server identifiers. Map `~/.claude/...` to `~/.cursor/skills/`, `.cursor/skills/`, and `.cursor/rules/` unless the task explicitly targets Claude Code. `EnterWorktree` is Claude Code–only — on Cursor, switch into the worktree with `cd /absolute/path/to/new-worktree` instead (the script already ran `git worktree add`).


Creates a git worktree at `<parent>/<project>-<branch>`, copies `.gitignore`d configuration files (excluding heavy build/dependency dirs), and navigates into it.

## Steps

1. **Get the branch name.** Ask the user via `AskUserQuestion` if not provided. Suggested format: `feat/...`, `fix/...`, or any topic name.

2. **Run the script** from the current project root:
   ```bash
   bash ~/.claude/skills/create-worktree/scripts/create-worktree.sh <branch-name>
   ```

3. **Read the printed `Path:` line** from the script output. The script ends with:
   ```
   Path: /absolute/path/to/new-worktree
   ```

4. **Switch the session into the new worktree** using the `EnterWorktree` tool with the printed path. The script already registered the worktree via `git worktree add`, so it appears in `git worktree list` and `EnterWorktree` can enter it directly:
   ```
   EnterWorktree({ path: "/absolute/path/to/new-worktree" })
   ```
   This actually moves the agent's working directory into the worktree (unlike a bare `cd`, whose shell state does not propagate out of a `Bash` call). On non–Claude Code agents that lack `EnterWorktree`, fall back to `cd /absolute/path/to/new-worktree` (see compat notes).

5. **Confirm to the user** in Japanese (per global preference):
   - 新しいworktreeのパス
   - 現在の作業ディレクトリがその worktree に切り替わったこと
   - `.env` 等の ignored ファイルがコピー済みであること
   - `node_modules` 等の重いディレクトリはスキップしたので `pnpm install` が必要な旨

## What gets copied

All entries listed by `git ls-files --others --ignored --exclude-standard --directory` — typically `.env`, `.env.local`, `.vercel/` config, `.tsbuildinfo`, etc.

## What gets excluded (always skipped)

`node_modules`, `.next`, `dist`, `build`, `.cache`, `coverage`, `.turbo`, `.vercel/output`, `.serena`, `test-results`, `playwright-report`, `storybook-static`, `out`, `html`, `.yarn`

## Branch handling

- **Existing local branch** → checks it out in the new worktree
- **New branch name** → creates it from current `HEAD`
- Branch names with `/` (e.g., `feat/foo`) → directory uses `-` (e.g., `corelive-feat-foo`)

## Failure modes

- Not in a git repo → error
- Target directory already exists → error (will not overwrite)
- Branch already checked out in another worktree → git's own error surfaces

## Notes

- Sibling-of-current-worktree placement: works whether invoked from the main checkout or another worktree.
- The directory switch must be issued by the agent after the script returns; shell state does not propagate out of the script. Prefer `EnterWorktree({ path })` so the switch persists for the rest of the session; a bare `cd` in a `Bash` call does not.
