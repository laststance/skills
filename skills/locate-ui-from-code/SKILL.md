---
name: locate-ui-from-code
description: Bridge code -> screen by capturing a screenshot + DOM dump (outerHTML / computed styles / bounding box / a11y attributes) of the rendered UI element corresponding to a code component, selector, role, or text. Use when the user asks "where is `<Component>` on screen?", "what does X look like?", or needs visual evidence anchored to a code reference. Tool-agnostic — works in Claude Code, Cursor, and Codex via playwright-cli; uses chrome-devtools MCP when available.
---

# Locate UI from Code

Resolve the question: **"this component / selector / class — where does it actually render in the running app?"** by capturing a screenshot of just that element plus the DOM information that DevTools' Elements panel would show.

## When to invoke

- "`<ComponentName>` って画面上のどれ？" / "Where does `<X>` render?"
- Code review needs a visual anchor for a discussion
- Spec / PR / bug report needs a reference image of a specific UI element
- Confirming what DOM a styled component / abstraction collapses into
- Investigating why a selector matches multiple / zero elements

## Inputs (any one of)

- React component name (e.g. `FolderHeader`)
- CSS selector (e.g. `[data-testid="folder-header"]`)
- Visible text (e.g. `フォルダ１`)
- ARIA role + name (e.g. `role=button name="Submit"`)
- A `data-*` source-attribution attribute if your codebase has one (e.g. `data-insp-path`, `data-component-line`)

Plus: **a way to get the app into the right state** (URL + login + any expansion / tab activation needed).

## Workflow (5 phases)

### Phase 1 — Identify the target in code

1. `grep` the codebase for the component / token to find both the **definition** and the **render sites**.
2. Walk up render parents until you reach a page-level component → that gives you the URL path.
3. Pick a unique runtime locator the rendered DOM will have:
   - text content (most stable for simple labels)
   - `aria-label` / `aria-roledescription`
   - `data-testid` / `data-cy`
   - source-attribution attr if available

```sh
grep -rn "FolderHeader" --include="*.tsx" -l
# definition + usages -> trace to the page route
```

If the project ships an inspector attribute like `data-insp-path="<file>:<line>:<col>:<Component>"`, prefer it: `[data-insp-path*="FolderHeader"]` is a one-shot locator that survives className changes.

### Phase 2 — Open the browser at the right state

Pick the tool for the current environment:

| Environment | Primary | Fallback |
|---|---|---|
| Claude Code (chrome-devtools MCP installed) | chrome-devtools MCP | playwright-cli |
| Cursor | playwright-cli | — |
| Codex CLI | playwright-cli | — |
| Any shell | playwright-cli | — |

Install playwright-cli if missing:
```sh
npx --no-install playwright-cli --version || npm install -g @playwright/cli@latest
```

Open + login + persist auth (one-time):
```sh
playwright-cli open http://localhost:8080/
# fill login form, click submit (use snapshot refs)
playwright-cli state-save .auth.json
```

Subsequent runs:
```sh
playwright-cli state-load .auth.json
playwright-cli goto http://localhost:8080/<page>
```

**Respect project rules.** If the repo's `CLAUDE.md` / `AGENTS.md` / `README` forbids URL direct navigation (e.g. "正規動線のみ"), navigate by clicking nav / links instead of `goto`.

### Phase 3 — Locate the element

```sh
playwright-cli snapshot
# Read the a11y tree, note the ref of your target (e.g. e15)
```

When multiple candidates exist (lists, tables, repeated patterns), narrow down with `eval`:

```sh
playwright-cli --raw eval "() => Array.from(
  document.querySelectorAll('[data-insp-path*=\"FolderHeader\"]')
).map((el, i) => ({ i, text: el.textContent.slice(0, 40), rect: el.getBoundingClientRect().toJSON() }))"
```

Pick the index you want, then re-snapshot or use a more specific text-based locator.

### Phase 4 — Capture screenshot + DOM dump (in parallel)

Element-only screenshot:
```sh
playwright-cli screenshot e15 --filename=<save-path>/<name>_visual.png
```

DevTools Elements-panel-equivalent dump (outerHTML / rect / computed styles / a11y / 1-level children):
```sh
playwright-cli eval "(el) => ({
  outerHtmlPreview: el.outerHTML.slice(0, 600),
  rect: el.getBoundingClientRect().toJSON(),
  computed: Object.fromEntries(['display','height','padding','gap','cursor','transform','transition']
    .map(p => [p, getComputedStyle(el)[p]])),
  ariaAttrs: Object.fromEntries(['role','aria-roledescription','aria-label','aria-disabled','tabindex']
    .map(p => [p, el.getAttribute(p)])),
  children: Array.from(el.children).map(c => ({
    tag: c.tagName.toLowerCase(),
    classes: (c.className?.toString() || '').slice(0, 50),
    text: (c.textContent ?? '').slice(0, 30)
  }))
})" e15
```

### Phase 5 — Save & present

**Save path priority** (pick the first that applies):
1. Project has `.claude/tasks/assets/<task>/spec_reference/` → use it
2. Project has `docs/screenshots/` or `docs/images/` → use it
3. Otherwise: `<repo-root>/screenshots/<name>_visual.png` (gitignore as needed)

**Naming**: `<component-or-purpose>_visual.png` — never `screenshot.png` / `image1.png` / `1.png`.

**Present** with these sections (skip any that don't apply):
1. Visual — embed the screenshot
2. Elements tree — `outerHTML` truncated to ~600 chars in a fenced block
3. Computed styles — small table of the key props (display / height / padding / cursor / transform)
4. Children map — 1-level child tag + text preview
5. A11y attributes — role / aria-* / tabindex
6. Source mapping — if `data-insp-path` / similar is present, decode to file:line:component

## Pitfalls

- **Auth redirect loops** — save state once with `state-save`, reload with `state-load`.
- **Multiple matches** — components in lists render N times; filter by index, text, or container.
- **Lazy / collapsed UI** — open tabs, expand accordions, scroll into view *before* `snapshot`.
- **Token-budget blowup** — keep `outerHTML.slice(0, 600)` in responses; for full dumps write to a file via `--filename`.
- **Retina coordinate confusion** — `getBoundingClientRect()` is in CSS px; multiply by `devicePixelRatio` only when comparing against raw screenshot pixels.
- **Element ref drift** — refs (`e15`, `uid=2_19`) are valid only for the snapshot they came from. Re-snapshot after navigation / DOM change.

## See also

- `references/tool-equivalents.md` — Claude Code MCP / playwright-cli command translation table
- `references/example-walkthrough.md` — End-to-end example: locate `FolderHeader` in a Next.js + Chakra + dnd-kit app
