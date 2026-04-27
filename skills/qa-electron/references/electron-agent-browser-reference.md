# playwright-cli + CDP + OS driving cheat sheet

Quick lookup for the operations used during an Electron QA run. Only the
commands the main SKILL.md flow references are listed. Full CLI docs:
`playwright-cli --help`.

> Historical note: this skill previously used `agent-browser` and then
> `electron-playwright-cli`. Both were dropped — `agent-browser` was
> deprecated and `electron-playwright-cli@0.1.3` ships an unresolvable
> `playwright/lib/mcp/browser/*` `require()`. The current path is
> `playwright-cli` (Microsoft's standalone CLI) attached to Electron's
> CDP port. Trade-off: CDP attach reaches the renderer (≈95% of practical
> QA), but native `BrowserWindow` inventory and main-process introspection
> are out of reach.

## App lifecycle

| Goal | Command |
|------|---------|
| Launch with CDP (macOS) | `open -a "<AppName>" --args --remote-debugging-port=9222` |
| Launch with CDP (Linux) | `<appname> --remote-debugging-port=9222 &` |
| Launch with CDP (Windows) | `Start-Process "<path>.exe" -ArgumentList "--remote-debugging-port=9222"` |
| Launch dev inner binary (macOS) | `./<App>.app/Contents/MacOS/<App> --remote-debugging-port=9222` |
| Launch project dev server | `pnpm dev` (must pass `--remote-debugging-port=9222` through to Electron) |
| Check if app is running | `pgrep -f "<AppName>"` |
| Check port availability | `lsof -i :9222` |
| Quit gracefully (macOS) | `osascript -e 'quit app "<AppName>"'` |

**The flag must be set at launch.** If the app was already running, CDP is
not available — quit and relaunch with `--remote-debugging-port`.

## Connecting with playwright-cli

| Goal | Command |
|------|---------|
| Attach to CDP port | `playwright-cli attach --cdp=http://localhost:9222` |
| Detach (keeps app alive) | `playwright-cli --s=default detach` |
| List active sessions | `playwright-cli list` |
| Force-kill all sessions | `playwright-cli kill-all` |
| Named session (for >1 app) | `playwright-cli attach --cdp=http://localhost:9222 slack` (then `--s=slack` on every command) |

`attach` is one-shot per session; subsequent commands target the session
via `--s=<name>` (defaults to `default` when no name is given to attach).

## Inspecting targets (windows + webviews)

| Goal | Command |
|------|---------|
| List all CDP-visible tabs | `playwright-cli --s=default tab-list` |
| Switch by index | `playwright-cli --s=default tab-select 2` |

An Electron app typically has: 1 main `page` target + N `webview` targets.
Dev mode may show an extra `devtools` target.

**Limitation:** unattached / hidden `BrowserWindow` instances are NOT
enumerable via CDP. For those, fall back to `mcp__computer-use__screenshot`
plus `osascript` (macOS) / PowerShell (Windows).

## Driving the renderer

| Goal | Command |
|------|---------|
| Screenshot current target | `playwright-cli --s=default screenshot --filename=<path>.png` |
| Element-only screenshot | `playwright-cli --s=default screenshot eN --filename=<path>.png` |
| Accessibility snapshot | `playwright-cli --s=default snapshot` |
| Snapshot to file | `playwright-cli --s=default snapshot --filename=<path>.yaml` |
| Click by element ref | `playwright-cli --s=default click eN` |
| Fill input | `playwright-cli --s=default fill eN "text"` |
| Press key | `playwright-cli --s=default press Enter` (Tab, Escape, ArrowDown, etc.) |
| Type at focus | `playwright-cli --s=default type "text"` |
| Hover | `playwright-cli --s=default hover eN` |
| Select option | `playwright-cli --s=default select eN <value>` |
| Evaluate JS in renderer | `playwright-cli --s=default eval 'document.title'` |
| Resize window | `playwright-cli --s=default resize 1280 800` |
| Reload page | `playwright-cli --s=default reload` |
| Navigate | `playwright-cli --s=default goto <url>` |

The `eN` refs come from the most recent `snapshot` — re-snapshot after
any action that changes the DOM.

## Renderer console + CDP probing

Used for security spot-checks and runtime-error detection:

```bash
# Is nodeIntegration enabled here?
playwright-cli --s=default eval 'typeof require'
# "function" → nodeIntegration is ON

# Is contextIsolation enabled?
playwright-cli --s=default eval 'typeof __electron_preload__'
# "undefined" in strict-isolated renderers

# CSP meta tag
playwright-cli --s=default eval 'document.querySelector("meta[http-equiv=Content-Security-Policy]")?.content'

# Electron version
playwright-cli --s=default eval 'process.versions.electron'
# Only works if nodeIntegration is on — useful diagnostic either way

# Chrome version
playwright-cli --s=default eval 'navigator.userAgent'

# Console messages since attach
playwright-cli --s=default console
```

## Native OS driving (macOS)

`osascript` can drive the menu bar, Dock, and system dialogs when
`playwright-cli` can't.

| Goal | Command |
|------|---------|
| List menu bar top items | `osascript -e 'tell application "System Events" to tell process "<App>" to get title of every menu of menu bar 1'` |
| List items of a menu | `osascript -e 'tell application "System Events" to tell process "<App>" to get title of every menu item of menu "File" of menu bar 1'` |
| Click a menu item | `osascript -e 'tell application "System Events" to tell process "<App>" to click menu item "New Window" of menu "File" of menu bar 1'` |
| Activate app (bring to front) | `osascript -e 'tell application "<App>" to activate'` |
| Quit app | `osascript -e 'quit app "<App>"'` |
| Check if app frontmost | `osascript -e 'tell application "System Events" to get name of first process whose frontmost is true'` |

**macOS permission:** `osascript` that clicks UI requires Accessibility
permission for the host Terminal (System Settings → Privacy & Security →
Accessibility). If commands return `"not authorized"`, the user needs to
grant this.

## Native OS driving (Windows / Linux)

Windows has less mature CLI tooling for menu-bar driving. Two approaches:

- **Keyboard shortcut** (preferred): every menu item usually has an Alt+X
  mnemonic. `playwright-cli --s=default press Alt+F` (if the app has focus)
  opens File.
- **Computer-use MCP**: use `mcp__computer-use__*` to right-click tray icons
  and click native menu items by coordinate.

Linux: `xdotool`, `ydotool` (Wayland), or the computer-use MCP. `xdotool
search --name "<AppName>" windowactivate` brings a window forward.

## Log tailing

| Goal | Command |
|------|---------|
| Tail app log file | `tail -F <log-path> > /tmp/qa-electron-session/app.log &` |
| macOS: stream OS-level messages | `log stream --process "<AppName>"` |
| Kill the tail | `kill "$(cat /tmp/qa-electron-session/log.pid)"` |

Electron apps commonly write to:
- macOS: `~/Library/Logs/<AppName>/main.log` (electron-log default)
- Windows: `%APPDATA%\<AppName>\logs\main.log`
- Linux: `~/.config/<AppName>/logs/main.log`

If the app uses a custom logger, ask the user for the path.

## Crash reports

| Platform | Location |
|----------|----------|
| macOS | `~/Library/Logs/DiagnosticReports/<AppName>*.ips` |
| Windows | `%LOCALAPPDATA%\<AppName>\Crashpad\reports\` |
| Linux | `~/.config/<AppName>/Crashpad/completed/` |

macOS `.ips` files are JSON; the crashed thread has `triggered: true`.
Windows / Linux Crashpad dumps are `.dmp` (minidump) — opening them
requires `minidump_stackwalk` and symbols, which is out of scope for this
skill. Quote the metadata (date, executable, reason) only.

## Multi-app sessions

Named sessions let one QA run cover >1 app or >1 instance:

```bash
# Instance A on port 9222
playwright-cli attach --cdp=http://localhost:9222 a

# Instance B on port 9223
playwright-cli attach --cdp=http://localhost:9223 b

# Each command targets its session
playwright-cli --s=a snapshot
playwright-cli --s=b click e3
```

Useful when testing IPC between apps that expect to find each other (e.g.,
an Electron editor calling out to another Electron plugin host).

## Common gotchas

- **Screenshots taken via `playwright-cli` only capture the renderer**, not
  the macOS menu bar or native chrome. For menu-bar evidence, use
  `mcp__computer-use__screenshot` (full screen).
- **`eval` runs in the renderer context**. It cannot access Node APIs
  unless `nodeIntegration: true` (which is itself a finding).
- **CDP disconnects silently if the app crashes.** If commands start
  returning connection errors, the app may have died — check the log tail
  and `pgrep`.
- **Multiple Electron apps on the same port will collide.** Pick a unique
  port per app if you're running more than one.
- **Detach ≠ quit.** `playwright-cli --s=default detach` only ends the CDP
  session; the Electron app keeps running. To stop the app, quit it via
  the dev server (`Ctrl-C`), `osascript -e 'quit app "<App>"'`, or `pkill`.
- **Native BrowserWindow without an attached page is invisible to CDP.**
  Open the window via the UI / menu so its renderer attaches; for
  permanently hidden BrowserWindows used as background workers, screenshot
  via computer-use isn't possible either — read the app's main-process logs.
