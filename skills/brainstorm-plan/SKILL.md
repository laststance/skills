---
name: brainstorm-plan
description: Take a vague or open-ended request and converge it into an approved plan via two interleaved phases — Brainstorm (clarify intent with AskUserQuestion) and Plan (structure the work inside Claude Code plan mode). Skips external research; use for self-contained tasks that don't need new knowledge — shell scripts, refactors, internal code reorganization, dev tooling, file ops. Loops Brainstorm until concrete, then enters plan mode for `ExitPlanMode` approval. Use when the user invokes `/brainstorm-plan <fuzzy request>`, when the unknowns are preference-based (only the user can answer), or when `/brainstorm-search-plan` would be overkill.
argument-hint: "<vague idea or open-ended goal>"
---

# /brainstorm-plan — Vague → Concrete via Brainstorm + Plan (no search)

## Codex Compatibility
When running this skill in Codex, translate Claude Code-only primitives before acting: `AskUserQuestion` -> chat/request_user_input, `TodoWrite` -> `update_plan`, `Task`/`TaskCreate`/`TeamCreate`/`SendMessage` -> `spawn_agent`/`send_input`/`wait_agent` when available and allowed, and `EnterPlanMode`/`ExitPlanMode` -> a concise chat plan plus explicit approval.
Resolve `Read`/`Write`/`Edit`/`Bash`/`WebSearch`/`WebFetch` to Codex file/shell/web tools, and map `~/.claude/...` paths to `~/.agents/...` or `~/.codex/...` unless the task explicitly targets Claude Code.

Converge a fuzzy request into an actionable, approved plan with two phases:

1. **Brainstorm** — clarify intent with `AskUserQuestion`
2. **Plan** — structure the work inside Claude Code plan mode (`EnterPlanMode` → `ExitPlanMode`)

This is the **search-free** sibling of `/brainstorm-search-plan`. Use it when ambiguity is about user preferences/scope, not external facts.

## When to use

Trigger this skill when:

- User invokes `/brainstorm-plan <fuzzy request>`
- The request is self-contained — shell script, refactor, internal code reorganization, dev tooling, file/dir ops
- The unknowns are preference-based (only the user can answer), not fact-based
- Going straight to `/task` would be premature, but `/search` would be wasted effort

If the request needs external research (library comparison, API behavior, current best practice) → use `/brainstorm-search-plan` instead.

If the request is already concrete (clear goal + scope) → skip this skill, go straight to `/task`.

## Workflow

### Phase 1 — Brainstorm (clarify intent)

Goal: turn one vague sentence into a structured intent doc.

1. **Restate** the request in one sentence and confirm understanding before probing.
2. **Identify gaps** along these axes:
   - **Goal** — what does success look like?
   - **Scope** — what's in / out?
   - **Constraints** — tech stack rules, dependencies allowed, file paths, performance budget; for shell tasks: target runtime (bash/zsh/fish) and portability (macOS only? Linux too?)
   - **Context** — existing code, prior decisions, conventions to follow
   - **Quality bar** — quick prototype / polished one-off / committed-to-repo
3. **Ask 2–4 targeted questions** in a single `AskUserQuestion` call. Bundle related questions. Always offer concrete options, not open prompts.
4. **Record answers** into the working intent doc (in conversation memory).

Stop probing when each axis has a clear answer or an explicit "don't care".

### Phase 2 — Plan (lock structure)

Goal: turn the **settled** intent doc into an approved plan inside Claude Code plan mode.

`EnterPlanMode` is a one-shot transition; `ExitPlanMode` is the approval gate — not a generic toggle. Enter plan mode only after Phase 1 has fully exited per the Stopping criteria.

1. **Verify readiness** against the Stopping criteria below. If anything fails → return to Phase 1 first; do NOT call `EnterPlanMode` yet.
2. Call `EnterPlanMode`.
3. Draft the plan in one pass with these sections:
   - **Objective** — one paragraph
   - **Success criteria** — 3–5 verifiable items (pass/fail by inspection)
   - **Approach** — key decisions + rationale
   - **Steps** — ordered, atomic, ~5–12 items
   - **Open questions** — only if any remain
4. Call `ExitPlanMode` with the plan content for user approval. After approval → hand off to `/task`.

## Iteration rule

```
Brainstorm ──┐
   │         │ (one more round if answers reveal new gaps)
   ↓         │
   └─────────┘
   │
   ↓
  Plan ──→ ExitPlanMode (approval)
```

A single brainstorm round is often enough for self-contained tasks. If the user's answers reveal new questions, do one more `AskUserQuestion` round before moving on.

## Stopping criteria

Exit Phase 1 and enter Phase 2 only when **all** are true:

- User has answered every targeted question (or marked it "don't care")
- Success criteria are verifiable
- Scope is small enough that the plan will have < 12 steps
- No claim in the intent doc depends on external facts you haven't verified — if any does, switch to `/brainstorm-search-plan`

If after 2 brainstorm rounds the request still feels fuzzy, stop and surface the blocker explicitly to the user — don't loop indefinitely.

## Anti-patterns

- **Searching when the user can answer** — preference-based gaps belong in Phase 1, not in `/search`.
- **Using this skill when external facts are needed** — switch to `/brainstorm-search-plan`. Don't guess at library APIs or vendor behavior.
- **Skipping Phase 1** — jumping straight to Plan wastes effort on the wrong question.
- **One mega-question** — bundling 8 unrelated questions into one `AskUserQuestion` makes the user pick the first option for everything. Stay within 2–4.
- **Plan-mode whiplash** — entering/exiting plan mode repeatedly. Stay in Brainstorm until the plan is ready.
- **Solo plan delivery** — writing a plan without `ExitPlanMode` bypasses approval.
- **Implementation drift** — once `ExitPlanMode` is approved, hand off to `/task` instead of editing inline.

## Example

User: `/brainstorm-plan write a script to back up my dotfiles`

**Phase 1 (Brainstorm)** — `AskUserQuestion`:
- Q1 (Scope): which dotfiles — `~/.config/` only, or also top-level (`~/.zshrc`, `~/.gitconfig`)?
- Q2 (Destination): local copy, git repo, or rsync to remote?
- Q3 (Trigger): one-off command, shell alias, or scheduled (launchd / cron)?
- Q4 (Shell): bash (portable) or zsh (macOS default)?

User: `~/.config/` + top-level dotfiles, git repo, alias, zsh.

**Phase 2 (Plan)** — `EnterPlanMode`:

1. Create `~/scripts/backup-dotfiles.zsh`
2. Define source list (`.config/`, `.zshrc`, `.gitconfig`, `.tmux.conf`)
3. `rsync` into `$DOTFILES_REPO` working tree (preserving structure)
4. `git add -A`, commit with timestamp message, push
5. Add `alias bd='~/scripts/backup-dotfiles.zsh'` to `~/.zshrc`
6. Dry-run test (`--dry-run` flag) and full run
7. Verify remote has the new commit

`ExitPlanMode` for approval. After approval → `/task` for implementation.

## Integration with other skills

- After approval → hand off to `/task` for implementation
- For requests needing external research → use `/brainstorm-search-plan` instead
- For deep architectural decisions → run `/design` after this skill, before `/task`
