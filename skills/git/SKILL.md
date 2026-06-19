---
name: git
description: Smart git operations
argument-hint: "[operation | task description] [args]"
---

# Git — Intelligent Git Operations

## Codex Compatibility
When running this skill in Codex, translate Claude Code-only primitives before acting: `AskUserQuestion` -> chat/request_user_input, `TodoWrite` -> `update_plan`, `Task`/`TaskCreate`/`TeamCreate`/`SendMessage` -> `spawn_agent`/`send_input`/`wait_agent` when available and allowed, and `EnterPlanMode`/`ExitPlanMode` -> a concise chat plan plus explicit approval.
Resolve `Read`/`Write`/`Edit`/`Bash`/`WebSearch`/`WebFetch` to Codex file/shell/web tools, and map `~/.claude/...` paths to `~/.agents/...` or `~/.codex/...` unless the task explicitly targets Claude Code.

## Cursor Compatibility
When running this skill in Cursor Agent, translate Claude Code-only primitives before acting: `AskUserQuestion` -> `AskQuestion`; `TodoWrite` -> Cursor `TodoWrite` or an equivalent checklist; `Task`/`TaskCreate`/`TeamCreate`/`SendMessage`/multi-agent flows -> Cursor `Task` (subagents), parallel Tasks, or `run_in_background` when allowed (`TeamCreate`/`SendMessage` may have no exact match); `EnterPlanMode`/`ExitPlanMode` -> Plan mode (`SwitchMode` / `CreatePlan`) plus explicit user approval.
Resolve `Read`/`Write`/`Edit`/`StrReplace`/`Bash`/web/search/MCP via Cursor Composer or Agent equivalents. MCP names written as `mcp__server__tool` typically map to `call_mcp_tool` with configured server identifiers. Map `~/.claude/...` to `~/.cursor/skills/`, `.cursor/skills/`, and `.cursor/rules/` unless the task explicitly targets Claude Code.


Smart git workflow with automatic Conventional Commit message generation.

<essential_principles>

## Safety Rules

- **Conventional Commits**: All commit messages MUST follow `type(scope): description` format
  - Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`, `build`, `style`
  - Scope: optional, derived from changed files/directories
  - Description: imperative mood, lowercase, no period
- **Destructive operations require user confirmation**: `push --force`, `reset --hard`, `branch -D`, `rebase` on shared branches, `clean -f`
- **Never skip hooks**: Do not use `--no-verify` unless user explicitly requests it
- **Smart Commit always active**: Analyze staged changes to generate meaningful messages automatically

</essential_principles>

## Argument routing

Inspect the argument before acting:

- **It is empty or whitespace-only** — run the **commit & push** operation below.
- **It names a git subcommand** (`status`, `commit`, `push`, `pull`, `branch`, `merge`,
  `stash`, `log`) — possibly combined (`commit & push`) — run those operations below.
- **It describes a task in natural language** (any language), e.g. `/git README更新して`
  or `/git fix the header typo` — run the **task-then-ship** operation: do the work,
  then commit & push it.

When in doubt (the argument neither matches a subcommand nor reads as a task), ask once
which the user meant rather than guessing.

## Operations

### task-then-ship

Perform a described change, then commit and push it in one shot. This is the default for
any natural-language argument that isn't a git subcommand.

1. Carry out the requested task (edit/create the relevant files). Keep the change scoped
   to what was asked.
2. Run the **commit** operation below — stage only the files this task touched (specific
   names, never `git add -A`/`.`) and generate a Conventional Commit message from the
   change analysis.
3. Run the **push** operation below to sync to the remote.
4. **If the task can't be completed** (ambiguous, blocked, or it produced no file
   changes), stop and report — do **not** create an empty or speculative commit.

Safety rules still apply: never `--no-verify`, never force-push without confirmation, and
honor the destructive-operation confirmations in Safety Rules above.

### commit & push

Commit current changes, then push the resulting commit.

1. Run the **commit** operation below.
2. If the commit operation stops because there are no changes, no clear staging set, or
   another blocker, report that blocker and do **not** push.
3. Run the **push** operation below only after a commit succeeds.

### status

Analyze repository state and provide actionable summary.

1. Run `git status` (never use `-uall` flag)
2. Run `git diff --stat` for change overview
3. Present:
   - Staged / unstaged / untracked file counts
   - Branch info and upstream tracking status
   - Recommended next action (e.g., "Ready to commit", "Changes need staging")

### commit

Generate a Conventional Commit from change analysis.

1. Run `git status` and `git diff --cached` (staged) and `git diff` (unstaged)
2. Run `git log --oneline -5` to match existing commit style
3. Analyze changes:
   - Determine `type` from nature of changes (new feature → `feat`, bug fix → `fix`, etc.)
   - Determine `scope` from affected directories/files
   - Write concise description focusing on "why" not "what"
4. If nothing is staged, ask user what to stage
5. Stage files with specific file names (avoid `git add -A` or `git add .`)
6. Commit using HEREDOC format:
   ```bash
   git commit -m "$(cat <<'EOF'
   type(scope): description
   EOF
   )"
   ```

### push

Sync local commits with remote.

1. Check upstream tracking: `git rev-parse --abbrev-ref --symbolic-full-name @{u}`
2. If no upstream, push with `-u`: `git push -u origin <branch>`
3. If upstream exists: `git push`
4. **Never force-push without user confirmation**

### pull

Fetch and integrate remote changes.

1. `git pull --rebase` (prefer rebase over merge for clean history)
2. If conflicts arise, guide user through resolution

### branch

Create, switch, or manage branches.

1. **Create**: `git checkout -b <name>` with naming convention `type/description` (e.g., `feat/add-login`, `fix/header-alignment`)
2. **Switch**: `git checkout <name>`
3. **List**: `git branch -a` with upstream status
4. **Delete**: `git branch -d <name>` (use `-D` only with user confirmation)

### merge

Guided merge with conflict resolution support.

1. Check target branch is up to date: `git fetch origin`
2. Execute merge: `git merge <source>`
3. If conflicts:
   - List conflicting files
   - Show conflict markers for each file
   - Guide user through resolution options
   - After resolution: `git add <resolved-files> && git commit`

### stash

Temporarily save uncommitted changes.

1. **Save**: `git stash push -m "description"`
2. **List**: `git stash list`
3. **Apply**: `git stash pop` (or `apply` to keep in stash)

### log

View commit history with useful formatting.

1. Default: `git log --oneline -20`
2. Detailed: `git log --oneline --graph --all -20`

## Examples

```
/git                                # Default: commit current changes, then push
/git status
/git commit
/git push
/git commit & push
/git branch feat/dark-mode
/git merge main
/git stash save work in progress
/git log
/git README更新して            # task-then-ship: update the README, then commit & push
/git fix the header typo       # task-then-ship: make the fix, then commit & push
```

## Boundaries

**Will:**
- Execute git operations with intelligent automation
- Perform a natural-language task, then commit & push it (task-then-ship)
- Generate Conventional Commit messages from change analysis
- Provide workflow guidance and best practice recommendations
- Handle conflict resolution with step-by-step guidance

**Will Not:**
- Modify repository configuration without explicit authorization
- Execute destructive operations without user confirmation
- Include project-specific workflow rules (those belong in CLAUDE.md or AGENTS.md)
