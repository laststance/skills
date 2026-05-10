# Tool Equivalents Across Environments

Cross-reference for the same operation in chrome-devtools MCP (Claude Code) vs playwright-cli (universal). Pick the column that matches your environment; the workflow shape is identical.

## Operation table

| Operation | chrome-devtools MCP | playwright-cli |
|---|---|---|
| List open pages | `list_pages` | `playwright-cli list` |
| Open new page | `new_page(url)` | `playwright-cli open <url>` |
| Navigate current page | `navigate_page(url)` | `playwright-cli goto <url>` |
| A11y snapshot | `take_snapshot()` | `playwright-cli snapshot` |
| Element ref format | `uid="2_19"` | `e15` |
| Screenshot (page) | `take_screenshot()` | `playwright-cli screenshot` |
| Screenshot (element) | `take_screenshot({ uid })` | `playwright-cli screenshot e15` |
| Save screenshot to file | `take_screenshot({ filePath })` | `--filename=path.png` |
| Click | `click({ uid })` | `playwright-cli click e15` |
| Type text | `fill({ uid, value })` | `playwright-cli fill e15 "text"` |
| Press key | `press_key({ key })` | `playwright-cli press Enter` |
| Hover | `hover({ uid })` | `playwright-cli hover e15` |
| Drag | `drag({ from_uid, to_uid })` | `playwright-cli drag e3 e7` |
| Eval JS | `evaluate_script({ function, args })` | `playwright-cli eval "fn" e15` |
| Wait for text | `wait_for({ text })` | `playwright-cli --wait-for "text"` (or use `eval` polling) |
| Cookies / auth | manual via dedicated tools | `playwright-cli state-save / state-load` |
| Console messages | `list_console_messages()` | `playwright-cli console` |
| Network requests | `list_network_requests()` | `playwright-cli network` |

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

Neither IDE exposes a chrome-devtools MCP equivalent in shell. Use playwright-cli:

```sh
# install once
npm install -g @playwright/cli@latest

# verify
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

- **Claude Code, MCP available** — either works; chrome-devtools MCP avoids shell spawn overhead for many small ops.
- **Claude Code, no MCP / unfamiliar repo** — playwright-cli (commands paste-able into any environment).
- **Cursor / Codex / shell agent** — playwright-cli.
- **Mixed-IDE collaboration** (multiple devs on different tools) — playwright-cli, so command snippets are reproducible.
