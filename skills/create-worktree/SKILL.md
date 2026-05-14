---
name: create-worktree
description: Creates a git worktree as a sibling directory to the current project (e.g., ../project-feat-x), copies .gitignored config files (.env, .env.local, etc.) while skipping heavy build/dependency directories (node_modules, .next, dist, build, coverage), then navigates into the new worktree. Use when the user asks to "create a worktree", "新しいworktreeを作って", "set up a worktree", "worktree作って", or wants to work on a parallel branch in an isolated checkout that retains local config.
---

# Create Worktree

## Codex Compatibility
When running this skill in Codex, translate Claude Code-only primitives before acting: `AskUserQuestion` -> chat/request_user_input, `TodoWrite` -> `update_plan`, `Task`/`TaskCreate`/`TeamCreate`/`SendMessage` -> `spawn_agent`/`send_input`/`wait_agent` when available and allowed, and `EnterPlanMode`/`ExitPlanMode` -> a concise chat plan plus explicit approval.
Resolve `Read`/`Write`/`Edit`/`Bash`/`WebSearch`/`WebFetch` to Codex file/shell/web tools, and map `~/.claude/...` paths to `~/.agents/...` or `~/.codex/...` unless the task explicitly targets Claude Code.

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

4. **Navigate into the new worktree** in a separate Bash call (the script cannot change the agent's CWD):
   ```bash
   cd /absolute/path/to/new-worktree
   ```

5. **Confirm to the user** in Japanese (per global preference):
   - 新しいworktreeのパス
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
- `cd` must be issued by the agent after the script returns; shell state does not propagate out of the script.
