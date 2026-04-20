# agent-browser + CDP + OS driving cheat sheet

Quick lookup for the operations used during an Electron QA run. Only the
commands the main SKILL.md flow references are listed. Full agent-browser
docs: `agent-browser --help`.

## App lifecycle

| Goal | Command |
|------|---------|
| Launch with CDP (macOS) | `open -a "<AppName>" --args --remote-debugging-port=9222` |
| Launch with CDP (Linux) | `<appname> --remote-debugging-port=9222 &` |
| Launch with CDP (Windows) | `Start-Process "<path>.exe" -ArgumentList "--remote-debugging-port=9222"` |
| Launch dev inner binary (macOS) | `./<App>.app/Contents/MacOS/<App> --remote-debugging-port=9222` |
| Check if app is running | `pgrep -f "<AppName>"` |
| Check port availability | `lsof -i :9222` |
| Quit gracefully (macOS) | `osascript -e 'quit app "<AppName>"'` |

**The flag must be set at launch.** If the app was already running, CDP is
not available — quit and relaunch with `--remote-debugging-port`.

## Connecting with agent-browser

| Goal | Command |
|------|---------|
| Connect to port | `agent-browser connect 9222` |
| One-off with port | `agent-browser --cdp 9222 snapshot -i` |
| Auto-discover running Chromium | `agent-browser --auto-connect snapshot -i` |
| Disconnect | `agent-browser disconnect` |
| Named session (for >1 app) | `agent-browser --session slack connect 9222` |

## Inspecting targets (windows + webviews)

| Goal | Command |
|------|---------|
| List all targets | `agent-browser tab` |
| Switch by index | `agent-browser tab 2` |
| Switch by URL pattern | `agent-browser tab --url "*settings*"` |

An Electron app typically has: 1 main `page` target + N `webview` targets.
Dev mode may show an extra `devtools` target.

## Driving the renderer

| Goal | Command |
|------|---------|
| Screenshot current target | `agent-browser screenshot <path>.png` |
| Full-page screenshot | `agent-browser screenshot --full <path>.png` |
| Annotated screenshot | `agent-browser screenshot --annotate <path>.png` |
| Accessibility snapshot | `agent-browser snapshot -i` |
| JSON snapshot | `agent-browser snapshot --json > snapshot.json` |
| Click by element ref | `agent-browser click @e5` |
| Fill input | `agent-browser fill @e3 "text"` |
| Press key | `agent-browser press Enter` (Tab, Escape, ArrowDown, etc.) |
| Type at focus | `agent-browser keyboard type "text"` |
| Bypass key events | `agent-browser keyboard inserttext "text"` |
| Get text of element | `agent-browser get text @e5` |
| Wait ms | `agent-browser wait 1000` |
| Evaluate JS in renderer | `agent-browser evaluate 'document.title'` |

The `@eN` refs come from the most recent `snapshot -i` — re-snapshot after
any action that changes the DOM.

## Renderer console + CDP probing

Used for security spot-checks and runtime-error detection:

```bash
# Is nodeIntegration enabled here?
agent-browser evaluate 'typeof require'
# "function" → nodeIntegration is ON

# Is contextIsolation enabled?
agent-browser evaluate 'typeof __electron_preload__'
# "undefined" in strict-isolated renderers

# CSP meta tag
agent-browser evaluate 'document.querySelector("meta[http-equiv=Content-Security-Policy]")?.content'

# Electron version
agent-browser evaluate 'process.versions.electron'
# Only works if nodeIntegration is on — useful diagnostic either way

# Chrome version
agent-browser evaluate 'navigator.userAgent'
```

## Native OS driving (macOS)

`osascript` can drive the menu bar, Dock, and system dialogs when
`agent-browser` can't.

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
  mnemonic. `agent-browser press Alt+F` (if the app has focus) opens File.
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
# Instance A
agent-browser --session a connect 9222

# Instance B
agent-browser --session b connect 9223

# Each command targets its session
agent-browser --session a snapshot -i
agent-browser --session b click @e3
```

Useful when testing IPC between apps that expect to find each other (e.g.,
an Electron editor calling out to another Electron plugin host).

## Common gotchas

- **Screenshots taken via `agent-browser` only capture the renderer**, not
  the macOS menu bar or native chrome. For menu-bar evidence, use
  `mcp__computer-use__screenshot` (full screen).
- **`evaluate` runs in the renderer context**. It cannot access Node APIs
  unless `nodeIntegration: true` (which is itself a finding).
- **CDP disconnects silently if the app crashes.** If commands start
  returning connection errors, the app may have died — check the log tail
  and `pgrep`.
- **Multiple Electron apps on the same port will collide.** Pick a unique
  port per app if you're running more than one.
