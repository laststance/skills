# Tool Equivalents Across Environments

Cross-reference for the same operation in chrome-devtools MCP (Claude Code) vs playwright-cli (universal). Pick the column that matches your environment; the workflow shape is identical.

## Operation table

| Operation | chrome-devtools MCP | cursor-ide-browser (Cursor) | playwright-cli |
|---|---|---|---|
| List open pages | `list_pages` | `browser_tabs` (action: list) | `playwright-cli list` |
| Open new page | `new_page(url)` | `browser_navigate` (position: active) | `playwright-cli open <url> --headed` |
| Navigate current page | `navigate_page(url)` | `browser_navigate` | `playwright-cli goto <url>` |
| A11y snapshot | `take_snapshot()` | `browser_snapshot` | `playwright-cli snapshot` |
| Element ref format | `uid="2_19"` | `e15` (from snapshot) | `e15` |
| Screenshot (page) | `take_screenshot()` | `browser_take_screenshot` | `playwright-cli screenshot` |
| Screenshot (element) | `take_screenshot({ uid })` | `browser_take_screenshot` + ref | `playwright-cli screenshot e15` |
| Save screenshot to file | `take_screenshot({ filePath })` | `filename` param | `--filename=path.png` |
| Click | `click({ uid })` | `browser_click` | `playwright-cli click e15` |
| Type text | `fill({ uid, value })` | `browser_fill` / `browser_type` | `playwright-cli fill e15 "text"` |
| Press key | `press_key({ key })` | `browser_press_key` | `playwright-cli press Enter` |
| Hover | `hover({ uid })` | (use snapshot + click) | `playwright-cli hover e15` |
| Drag | `drag({ from_uid, to_uid })` | **coordinate ops** (`browser_get_bounding_box` + mouse) — ref drag unreliable for dnd-kit | `playwright-cli drag e3 e7` |
| Eval JS | `evaluate_script({ function, args })` | `browser_cdp` → `Runtime.evaluate` | `playwright-cli eval "fn" e15` |
| Highlight element | — | `browser_highlight` | — |
| Lock / unlock | — | `browser_lock` / unlock | — |
| Wait for text | `wait_for({ text })` | CDP poll or re-snapshot | `playwright-cli --wait-for "text"` |
| Cookies / auth | manual via dedicated tools | project login flow / `.agent_browser` | `playwright-cli state-save / state-load` |
| Console messages | `list_console_messages()` | `browser_cdp` | `playwright-cli console` |
| Network requests | `list_network_requests()` | `browser_cdp` | `playwright-cli network` |

## Eval signature

Both styles pass the element as the first argument when a ref is supplied:

### chrome-devtools MCP
```js
evaluate_script({
  function: "(el) => el.outerHTML",
  args: ["2_19"]
})
```

### playwright-cli
```sh
playwright-cli eval "(el) => el.outerHTML" e15
```

For zero-arg calls, omit `args` / the trailing ref.

## Cursor / Codex specifics

**Cursor:** prefer `cursor-ide-browser` MCP (visible browser, snapshot refs). Some repos (e.g. zumen-fe `cursor-specific.mdc`) **forbid** `playwright-cli` unless the user explicitly asks.

**Codex / shell without IDE browser:** use playwright-cli headed:

```sh
npm install -g @playwright/cli@latest
playwright-cli --version
```

If global install is blocked, `npx --no-install playwright-cli ...` works inside any Node project that has `@playwright/cli` in deps.

## Output stripping

playwright-cli prefixes every output with page status + generated code + snapshot. To get just the value (useful for piping):
```sh
playwright-cli --raw eval "..."
playwright-cli --raw snapshot > snapshot.yml
```

`--raw` has no MCP equivalent; the MCP tool already returns just the JSON value.

## Persistent browser sessions

| Need | chrome-devtools MCP | playwright-cli |
|---|---|---|
| Multiple parallel browsers | one connection per process | `-s=<name>` flag (named sessions) |
| Persistent profile | manual setup | `playwright-cli open --persistent` |
| Connect to running Chrome | (not supported) | `playwright-cli attach --cdp=chrome` |

For the "locate UI" workflow you almost never need named sessions — a single browser + auth state file is enough.

## Picking the tool

- **Claude Code, MCP available** — chrome-devtools MCP or playwright-cli.
- **Cursor** — `cursor-ide-browser` first; check repo rules before playwright-cli.
- **Codex / shell agent** — playwright-cli `--headed`.
- **Mixed-IDE collaboration** — document the reach recipe in tool-agnostic steps (nav labels, guard order); attach playwright-cli commands only when that environment allows them.
