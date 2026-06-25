---
name: locate-ui-from-code
description: Code to screen — locate UI, reach logic branches, explain how to trigger debugger/effect/handler paths
---

# Locate UI from Code

## Codex Compatibility
When running this skill in Codex, translate Claude Code-only primitives before acting: `AskUserQuestion` -> chat/request_user_input, `TodoWrite` -> `update_plan`, `Task`/`TaskCreate`/`TeamCreate`/`SendMessage` -> `spawn_agent`/`send_input`/`wait_agent` when available and allowed, and `EnterPlanMode`/`ExitPlanMode` -> a concise chat plan plus explicit approval.
Resolve `Read`/`Write`/`Edit`/`Bash`/`WebSearch`/`WebFetch` to Codex file/shell/web tools, and map `~/.claude/...` paths to `~/.agents/...` or `~/.codex/...` unless the task explicitly targets Claude Code.

## Cursor Compatibility
When running this skill in Cursor Agent, translate Claude Code-only primitives before acting: `AskUserQuestion` -> `AskQuestion`; `TodoWrite` -> Cursor `TodoWrite` or an equivalent checklist; `Task`/`TaskCreate`/`TeamCreate`/`SendMessage`/multi-agent flows -> Cursor `Task` (subagents), parallel Tasks, or `run_in_background` when allowed (`TeamCreate`/`SendMessage` may have no exact match); `EnterPlanMode`/`ExitPlanMode` -> Plan mode (`SwitchMode` / `CreatePlan`) plus explicit user approval.
Resolve `Read`/`Write`/`Edit`/`StrReplace`/`Bash`/web/search/MCP via Cursor Composer or Agent equivalents. MCP names written as `mcp__server__tool` typically map to `call_mcp_tool` with configured server identifiers. Map `~/.claude/...` to `~/.cursor/skills/`, `.cursor/skills/`, and `.cursor/rules/` unless the task explicitly targets Claude Code.


Resolve two related questions in one workflow:

1. **Where** does this code relate to the running app? (component mount point, surrounding UI, DOM)
2. **How** do you reach the specified logic / branch in the live app? (user operations that make `debugger`, an `if` branch, a `useEffect`, or an event handler actually run)

The agent **must execute the reach operations itself** (not only describe them) and **explain the recipe** so the user can reproduce or attach DevTools at the right moment.

## When to invoke

- "`<ComponentName>` って画面上のどれ？" / "Where does `<X>` render?"
- "`file.tsx:139` の `debugger` にどう到達する？" / "What clicks get me into this branch?"
- "`useEffectOnAny` の `else` ブロックを踏みたい" / "How do I trigger this handler?"
- Code review / PR / bug report needs a visual anchor **and** the interaction path that reaches it
- Confirming what DOM a styled component collapses into
- Investigating why a selector matches multiple / zero elements

## Inputs

**Required (at least one):**

- File path + line number (e.g. `@src/.../Foo.tsx:139`) — **preferred when user pins a line**
- React component name (e.g. `FolderHeader`)
- CSS selector / visible text / ARIA role + name
- `data-insp-path` or similar source-attribution attribute

**Implicit:** read surrounding code (±30 lines) to classify the target and derive preconditions.

## Target classification (do this first)

| Kind | Code signals | Skill output focus |
|------|--------------|-------------------|
| **Render target** | JSX return, styled component, `className`, visible `t.*` label | DOM locator + screenshot of that element |
| **Logic target** | `debugger`, `useEffect*`, `if/else`, early `return`, event handler body, mutation `onSuccess` | **Reach recipe** (operations agent ran) + screen state when branch fires + nearest UI anchor |

If the pinned line is **logic** (e.g. `debugger` inside `useEffect`), do **not** stop at "this component renders on tab X". You **must** derive and run the operations that satisfy the branch guard.

### Deriving a reach recipe (logic targets)

1. Read the enclosing function / effect / handler.
2. List **every guard** that must be true (e.g. `isChanged === true`, modal open, API refetch completed).
3. For each guard, identify the **user-visible action** that flips it (DnD reorder, button click, form submit, tab switch).
4. Order steps by dependency (e.g. reorder **before** create-item refetch).
5. Note **account / role / seed data** if guards depend on permissions or existing rows.
6. Execute the sequence in the browser; re-snapshot after each step that changes guards.

Example guard → action mapping:

| Guard in code | User operation |
|---------------|----------------|
| `isChanged === true` | Drag an item between columns or reorder within a list **without** saving |
| `orderItemSettings` updates while `isChanged` | Complete "新規項目追加" (or any action that invalidates the query) **after** step above |
| `isOpen && step === 2` | Open modal → pick type on step 1 → advance |
| `role !== 'admin'` | Log in as the non-admin test account from project docs |

## Workflow (6 phases)

### Phase 1 — Identify target in code

1. Open the file at the pinned line (or grep component name).
2. **Classify** render vs logic (see table above).
3. Walk up render parents to the page route → URL path.
4. For render targets: pick a runtime locator (text, `aria-*`, `data-testid`, `data-insp-path`).
5. For logic targets: write the **reach recipe draft** (guards + ordered UI steps) before opening the browser.

```sh
grep -rn "FolderHeader" --include="*.tsx" -l
# definition + usages -> trace to the page route
```

If the project ships `data-insp-path="<file>:<line>:<col>:<Component>"`, prefer it for render targets.

### Phase 2 — Open the browser at the right state

#### Browser mode (mandatory)

**Default: headed / visible.** The user must be able to follow along and attach DevTools.

| Environment | Primary | Notes |
|---|---|---|
| Claude Code (chrome-devtools MCP) | chrome-devtools MCP | `--headed` equivalent via MCP |
| **Cursor (zumen-fe and repos with `cursor-specific.mdc`)** | **`cursor-ide-browser` MCP** | `playwright-cli` **unless user explicitly requests it** |
| Cursor (generic) | `cursor-ide-browser` if available, else `playwright-cli --headed` | |
| Codex CLI / shell | `playwright-cli --headed` | |

```sh
# playwright-cli (when allowed)
playwright-cli open https://local.zume-n.com/ --headed
playwright-cli state-load .auth.json   # after one-time login + state-save
```

**Cursor IDE browser flow:**

1. `kill-port 8080` → start dev server if needed (`pnpm dev -p 8080`).
2. `browser_tabs` (list) → `browser_navigate` to landing / login URL.
3. `browser_lock` → operate → leave open (see Phase 6).

**Respect project rules.** If the repo forbids URL direct navigation after login (正規動線のみ), navigate by clicking nav / sidebar / tabs — not `goto` to deep paths.

Use project auth: `.agent_browser`, `test_accounts_and_permissions`, or Serena memory.

### Phase 3 — Navigate to the screen

Follow **正規動線** to the page that hosts the component:

1. Login (if needed).
2. Top nav → settings (or equivalent).
3. Side nav / tabs to the feature screen.
4. Activate the correct tab / panel / accordion.

Snapshot after arrival; confirm URL and key labels match expectations.

### Phase 4 — Execute reach operations (logic targets: mandatory)

**For logic targets, this phase is not optional.** Perform each step in the reach recipe:

1. Snapshot → locate refs for buttons, drag handles, tabs.
2. Execute clicks, fills, tab switches.
3. For **dnd-kit / custom DnD**: do **not** trust ref-only `drag` success. Use coordinate pointer ops (`browser_get_bounding_box` → move → mousedown → move → mouseup) per project `browser-dnd-coordinate-qa` rules. Verify list order / column changed in snapshot text.
4. After the final step, snapshot again and confirm guards plausibly hold (e.g. save button enabled = dirty state, new row visible = refetch happened).
5. If the line is `debugger`: leave the browser on that screen state and tell the user **"DevTools open + resume once — next refetch/render will pause here."** Do not remove the user's breakpoint.

**For render targets only:** skip to Phase 5 once the element is visible (tabs expanded, scrolled into view).

### Phase 5 — Locate element + capture evidence

```sh
playwright-cli snapshot
# or browser_snapshot in Cursor
```

When multiple candidates exist, enumerate with eval / CDP:

```sh
playwright-cli --raw eval "() => Array.from(
  document.querySelectorAll('[data-insp-path*=\"FolderHeader\"]')
).map((el, i) => ({ i, text: el.textContent.slice(0, 40), rect: el.getBoundingClientRect().toJSON() }))"
```

Capture in parallel:

- **Screenshot** — element-scoped when possible; full panel acceptable for logic targets where no single node exists.
- **DOM dump** — `outerHTML` (~600 chars), rect, key computed styles, a11y attrs, 1-level children.
- **Highlight** the nearest UI anchor (`browser_highlight` / playwright element screenshot).

Save path priority:

1. `.claude/tasks/assets/<task>/spec_reference/`
2. `docs/screenshots/` or `docs/images/`
3. `<repo-root>/screenshots/<name>_visual.png`

Naming: `<component-or-branch-purpose>_visual.png` — never `screenshot.png`.

### Phase 6 — Save & present

**Always present** (logic targets):

1. **Target classification** — render vs logic; quote the pinned lines and branch condition in plain language.
2. **Reach recipe** — numbered list of operations **the agent already ran** (account, nav path, clicks, DnD). Mark which step flips each guard.
3. **DevTools note** (if `debugger` / breakpoint) — when execution pauses relative to the last user action.
4. **Screen location** — URL, Japanese screen name, tab name, 正規動線 one-liner.

**Also present when applicable:**

5. Visual — embed screenshot
6. Elements tree — truncated `outerHTML`
7. Computed styles — small table
8. Children map — 1-level preview
9. A11y attributes
10. Source mapping — decode `data-insp-path`

### Keep the browser open (do NOT close it)

End with the browser **on the state where the branch is reachable** (logic) or **on the located element** (render):

- **Never** `playwright-cli close` / `browser_close` as cleanup.
- Leave highlight on when used.
- Tell the user the window is open for DevTools / inspection.
- Close only on explicit user request or session recovery.

## Pitfalls

- **Stopping at component mount** — a line inside `useEffect` is not "the whole tab"; explain and **run** the trigger sequence.
- **Wrong guard order** — e.g. creating an item before setting `isChanged` may never enter the `else` branch you want.
- **Headless by default** (playwright-cli) — always headed for this skill.
- **Auth redirect loops** — `state-save` / `state-load` or project login URL (`https://local.zume-n.com`, not raw `localhost:8080` when Auth0 callback requires it).
- **DnD false success** — verify rendered order/group changed, not just tool exit code.
- **Lazy / collapsed UI** — expand tabs and scroll before snapshot.
- **Token budget** — truncate `outerHTML`; full dumps go to files.
- **Ref drift** — re-snapshot after every navigation or DOM-changing action.
- **Cursor vs playwright** — follow repo browser rules; zumen-fe uses `cursor-ide-browser` by default.

## See also

- `references/tool-equivalents.md` — MCP / playwright-cli command translation
- `references/example-walkthrough.md` — render target example (`FolderHeader`)
- `references/example-logic-branch-reach.md` — logic target example (`debugger` in `useEffect` else branch)
