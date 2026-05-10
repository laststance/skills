# End-to-end walkthrough

Real example: locate the `FolderHeader` component in a Next.js + Chakra UI + dnd-kit app, capture a screenshot + DOM dump, and present the result.

## Setup

- App: Next.js Pages Router, served on `localhost:8080`
- Auth: Auth0
- Project rule: "URL direct navigation forbidden after login — use 正規動線" (normal user navigation flow)

## Phase 1 — Identify

```sh
grep -rn "FolderHeader" --include="*.tsx" -l
# src/views/.../folder/FolderHeader.tsx                  (definition)
# src/views/.../folder/PcFolderDocumentTabInner.tsx      (only render site)
```

Walking up from `PcFolderDocumentTabInner` → `DocumentTabInner` → `MenuTabsWrapper` → `DrawingDetail` → page `/drawings/[id]`.

URL: `http://localhost:8080/drawings/<id>?documentTypeMasterId=<doc-type>`

Locator candidate: `data-insp-path*="FolderHeader"` (project ships this attribute).

## Phase 2 — Open + login + navigate via UI

```sh
playwright-cli open http://localhost:8080/
playwright-cli snapshot                              # find email/password input refs
playwright-cli fill e7 "dev1@example.com"
playwright-cli fill e9 "<password>"
playwright-cli click e13                              # Continue button
playwright-cli state-save .auth.json
```

After login lands on `/drawings`, click into a drawing card with folders, then click the target tab (don't `goto` to the deep URL; the project forbids it for QA-like flows).

## Phase 3 — Locate

```sh
playwright-cli snapshot
# Output excerpt:
#   uid=2_19 button "フォルダ１ (14)" roledescription="sortable"
#   uid=2_35 button "F-3検証フォルダ２ (5)" roledescription="sortable"
```

Two folder headers on screen. The user wants the first one → `uid=2_19` (chrome-devtools MCP) or `e19` (playwright-cli; refs may differ).

## Phase 4 — Capture (parallel)

```sh
# Screenshot of just this element (not full page)
playwright-cli screenshot 2_19 \
  --filename=.claude/tasks/assets/task_0018/spec_reference/folder_header_visual.png

# DOM dump
playwright-cli eval "(el) => ({
  outerHtmlPreview: el.outerHTML.slice(0, 600),
  rect: el.getBoundingClientRect().toJSON(),
  computed: Object.fromEntries(['display','height','padding','gap','cursor','transform','transition']
    .map(p => [p, getComputedStyle(el)[p]])),
  ariaAttrs: Object.fromEntries(['role','aria-roledescription','aria-label','tabindex']
    .map(p => [p, el.getAttribute(p)])),
  children: Array.from(el.children).map(c => ({
    tag: c.tagName.toLowerCase(),
    classes: (c.className?.toString() || '').slice(0, 50),
    text: (c.textContent ?? '').slice(0, 30)
  }))
})" 2_19
```

## Phase 5 — Result presented to user

> **Visual**
> ![folder_header_visual.png](folder_header_visual.png) — `📁 フォルダ１ (14)              ▲`
>
> **Elements tree** (outerHTML, 600 chars)
> ```html
> <div role="button" tabindex="0" aria-roledescription="sortable"
>      data-insp-path="...PcFolderDocumentTabInner.tsx:693:19:FolderHeader"
>      class="css-tc2q9">
>   <div class="css-1wee57o"><svg color="#999"><!-- MdFolderOpen --></svg></div>
>   <p class="chakra-text">フォルダ１</p>
>   <p class="chakra-text">(14)</p>
>   <div class="css-1rr4qq7"></div>
>   <svg><!-- MdExpandLess --></svg>
> </div>
> ```
>
> **Computed styles**
> | property | value |
> |---|---|
> | display | flex |
> | height | 32px |
> | padding | 0 24px |
> | gap | 6px |
> | cursor | grab |
> | transform | none (idle; dnd-kit writes translate3d during drag) |
>
> **A11y**: `role=button`, `aria-roledescription=sortable`, `tabindex=0`, `aria-disabled=false`
>
> **Source mapping**: `data-insp-path` decodes to `PcFolderDocumentTabInner.tsx:693:19:FolderHeader` — direct file:line link.

## Lessons

1. **Prefer source-attribution attrs when present.** `data-insp-path` made the locator selector trivial and survives className renames. Look for `data-component-line`, `data-source-loc`, or `__source` in your stack.
2. **Element-only screenshots are dramatically clearer** than full-page screenshots when the element is small and the surrounding UI is busy.
3. **Truncate `outerHTML` to ~600 chars in the response.** Full DOM trees on Chakra / styled-components apps blow token budgets fast; route the full dump to a file with `--filename` if needed.
4. **Project rules trump shortcuts.** If the repo says "no URL direct navigation," follow that even though `goto` is faster — the rule probably encodes a real requirement (auth flow correctness, route guards, etc).
5. **When duplicates exist, list them first.** Use `--raw eval` to enumerate `[i, text, rect]` for all matches before picking one. Cheaper than guessing wrong and re-screenshotting.
