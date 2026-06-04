---
name: brainstorm-search-plan
description: Vague idea via search to plan
argument-hint: "<vague idea or open-ended goal>"
---

# /brainstorm-search-plan — Vague → Concrete via Brainstorm + Search + Plan

## Codex Compatibility
When running this skill in Codex, translate Claude Code-only primitives before acting: `AskUserQuestion` -> chat/request_user_input, `TodoWrite` -> `update_plan`, `Task`/`TaskCreate`/`TeamCreate`/`SendMessage` -> `spawn_agent`/`send_input`/`wait_agent` when available and allowed, and `EnterPlanMode`/`ExitPlanMode` -> a concise chat plan plus explicit approval.
Resolve `Read`/`Write`/`Edit`/`Bash`/`WebSearch`/`WebFetch` to Codex file/shell/web tools, and map `~/.claude/...` paths to `~/.agents/...` or `~/.codex/...` unless the task explicitly targets Claude Code.

## Cursor Compatibility
When running this skill in Cursor Agent, translate Claude Code-only primitives before acting: `AskUserQuestion` -> `AskQuestion`; `TodoWrite` -> Cursor `TodoWrite` or an equivalent checklist; `Task`/`TaskCreate`/`TeamCreate`/`SendMessage`/multi-agent flows -> Cursor `Task` (subagents), parallel Tasks, or `run_in_background` when allowed (`TeamCreate`/`SendMessage` may have no exact match); `EnterPlanMode`/`ExitPlanMode` -> Plan mode (`SwitchMode` / `CreatePlan`) plus explicit user approval.
Resolve `Read`/`Write`/`Edit`/`StrReplace`/`Bash`/web/search/MCP via Cursor Composer or Agent equivalents. MCP names written as `mcp__server__tool` typically map to `call_mcp_tool` with configured server identifiers. Map `~/.claude/...` to `~/.cursor/skills/`, `.cursor/skills/`, and `.cursor/rules/` unless the task explicitly targets Claude Code.


Converge a fuzzy request into an actionable, approved plan by interleaving three phases:

1. **Brainstorm** — clarify intent with `AskUserQuestion`
2. **Search** — gather missing facts via the `/search` skill
3. **Plan** — structure the work inside Claude Code plan mode (`EnterPlanMode` → `ExitPlanMode`)

Phases are NOT strictly sequential — loop until the request is concrete enough to approve.

## When to use

Trigger this skill when:

- User invokes `/brainstorm-search-plan <fuzzy request>`
- User says "I want to do something with X but I'm not sure what" / "help me figure this out"
- The request is missing critical decisions (tech, scope, constraints, success criteria)
- Going straight to `/task` or `/design` would be premature — too many unknowns

If the request is already concrete (clear goal + scope + tech), skip this skill and go straight to `/task` or `/design`.

## Workflow

### Phase 1 — Brainstorm (clarify intent)

Goal: turn one vague sentence into a structured intent doc.

1. **Restate** the request in one sentence and confirm understanding before probing.
2. **Identify gaps** along these axes:
   - **Goal** — what does success look like?
   - **Scope** — what's in / out?
   - **Constraints** — tech, deadline, team size, compliance
   - **Context** — existing code, prior decisions, stakeholders
   - **Quality bar** — prototype / production / shippable
3. **Ask 2–4 targeted questions** in a single `AskUserQuestion` call. Bundle related questions. Always offer concrete options, not open prompts.
4. **Record answers** into the working intent doc (in conversation memory).

Stop probing when each axis has a clear answer or an explicit "don't care".

### Phase 2 — Search (gather facts)

Goal: replace assumptions with citations.

For every claim in the intent doc that depends on external facts — library capabilities, API behavior, vendor comparison, current best practice — invoke the `/search` skill. `/search` iterates across web + MCP tools until citation-backed.

Common search triggers:

- "Which library for X?" → `/search compare X libraries`
- "Does framework Y support Z?" → `/search Y Z capability`
- "What's the current best practice for ABC?" → `/search ABC best practice`

Feed search results back into Phase 1 as new options to ask the user about.

**Don't search what only the user can answer** — preferences, internal context, business priorities. Those are Phase 1 questions.

### Phase 3 — Plan (lock structure)

Goal: turn the **settled** intent doc into an approved plan inside Claude Code plan mode.

`EnterPlanMode` is a one-shot transition; `ExitPlanMode` is the approval gate — not a generic toggle. Enter plan mode only after the Brainstorm ↔ Search loop has fully exited per the Stopping criteria.

1. **Verify readiness** against the Stopping criteria below. If anything fails → return to Phase 1 or Phase 2 first; do NOT call `EnterPlanMode` yet.
2. Call `EnterPlanMode`.
3. Draft the plan in one pass with these sections:
   - **Objective** — one paragraph
   - **Success criteria** — 3–5 verifiable items (pass/fail by inspection)
   - **Approach** — key decisions + rationale, citing Phase 2 results
   - **Steps** — ordered, atomic, ~5–12 items
   - **Open questions** — only if any remain
4. Call `ExitPlanMode` with the plan content for user approval. After approval → hand off to `/task`.

## Iteration rule

```
Brainstorm ←──┐
   │          │
   ↓          │
 Search ──────┘
   │
   ↓
  Plan ──→ ExitPlanMode (approval)
```

A single brainstorm turn often surfaces a fact that needs searching, whose result triggers a follow-up brainstorm question. That's expected.

## Stopping criteria

Exit the Brainstorm ↔ Search loop and enter Phase 3 only when **all** are true:

- User has answered every targeted question (or marked it "don't care")
- Every factual claim in the intent doc has a citation or explicit assumption tag
- Success criteria are verifiable
- Scope is small enough that the plan will have < 12 steps

If after 3 brainstorm rounds the request still feels fuzzy, stop and surface the blocker explicitly to the user — don't loop indefinitely.

## Anti-patterns

- **Skipping Phase 1** — jumping straight to Search or Plan wastes effort on the wrong question.
- **One mega-question** — bundling 8 unrelated questions into one `AskUserQuestion` makes the user pick the first option for everything. Stay within 2–4.
- **Search-as-procrastination** — searching when the gap is preference-based (only the user can answer).
- **Plan-mode whiplash** — entering/exiting plan mode repeatedly. Stay in Brainstorm/Search until the plan is ready.
- **Solo plan delivery** — writing a plan without `ExitPlanMode` bypasses approval.
- **Implementation drift** — once `ExitPlanMode` is approved, hand off to `/task` instead of editing inline.

## Example

User: `/brainstorm-search-plan add a search bar to the docs site`

**Phase 1 (Brainstorm)** — `AskUserQuestion`:
- Q1 (Scope): page titles only, or full-text body?
- Q2 (Backend): client-side index, or hosted (Algolia / MeiliSearch / Typesense)?
- Q3 (Quality bar): working prototype this week, or production with analytics?

User: full-text, hosted, production.

**Phase 2 (Search)** — `/search compare Algolia MeiliSearch Typesense for docs sites`
Returns: feature/pricing/DX comparison with citations.

**Phase 1 again** — `AskUserQuestion`:
- Q (Vendor): MeiliSearch self-hosted (cheap, more ops) vs Algolia (fast setup, $)?

User: MeiliSearch.

**Phase 3 (Plan)** — `EnterPlanMode`:
1. Spin up MeiliSearch via Docker Compose
2. Write indexer for existing markdown
3. Build search UI component (debounced input + result list)
4. Wire client → MeiliSearch with API key
5. Add analytics hook for queries with zero hits
6. Deploy + monitor

`ExitPlanMode` for approval. After approval → `/task` for implementation.

## Integration with other skills

- After approval → hand off to `/task` for implementation
- For deep architectural decisions → run `/design` after this skill, before `/task`
- `/search` is invoked liberally during Phase 2 — that's the whole point
