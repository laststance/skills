# iOS MCP + simctl cheat sheet

Quick lookup for the operations used during a QA run. Only the commands
that show up in the main SKILL.md flow are listed; anything else, read
`xcrun simctl --help` or the ios-simulator MCP tool descriptions.

## Sim lifecycle

| Goal | Command |
|------|---------|
| List all simulators | `xcrun simctl list devices -j` |
| List only booted | `xcrun simctl list devices booted -j` |
| Boot a specific one | `xcrun simctl boot <udid>` |
| Shut down the booted one | `xcrun simctl shutdown booted` |
| Open the Simulator app window | `open -a Simulator` |
| Get currently booted UDID (from MCP) | `mcp__ios-simulator__get_booted_sim_id` |

## App lifecycle

| Goal | Command |
|------|---------|
| List installed apps | `xcrun simctl listapps booted` |
| Install a .app bundle | `xcrun simctl install booted <path>` or `mcp__ios-simulator__install_app` |
| Launch app | `mcp__ios-simulator__launch_app({ bundle_id, terminate_running: true })` |
| Force quit | `xcrun simctl terminate booted <bundle-id>` |
| Uninstall | `xcrun simctl uninstall booted <bundle-id>` |
| Get app info | `xcrun simctl appinfo booted <bundle-id>` |

## Driving the UI

| Goal | Command |
|------|---------|
| Take screenshot | `mcp__ios-simulator__screenshot({ output_path })` |
| Dump full AX tree | `mcp__ios-simulator__ui_describe_all` |
| Describe a point | `mcp__ios-simulator__ui_describe_point({ x, y })` |
| Tap coordinate | `mcp__ios-simulator__ui_tap({ x, y })` |
| Long-press | `mcp__ios-simulator__ui_tap({ x, y, duration: "1.0" })` |
| Type text | `mcp__ios-simulator__ui_type({ text })` — ASCII only, max 500 chars |
| Swipe | `mcp__ios-simulator__ui_swipe({ x_start, y_start, x_end, y_end, duration: "0.3" })` |
| Record video | `mcp__ios-simulator__record_video` → `stop_recording` |

### The tap-by-AX pattern

```
// 1. dump tree
const tree = mcp__ios-simulator__ui_describe_all();

// 2. find target node
const node = findByLabel(tree, 'Settings');  // your search

// 3. tap center
mcp__ios-simulator__ui_tap({
  x: node.frame.x + node.frame.width / 2,
  y: node.frame.y + node.frame.height / 2,
});
```

Always prefer this over hard-coding coordinates from a screenshot — the
AX frame is resilient to layout changes; pixel coordinates aren't.

## OS state overrides

Every override should be reverted in the cleanup step.

| Goal | Set | Clear |
|------|-----|-------|
| Dark / Light mode | `xcrun simctl ui booted appearance dark` | `xcrun simctl ui booted appearance light` |
| Dynamic Type | `xcrun simctl ui booted content_size extra-extra-extra-large` | `xcrun simctl ui booted content_size medium` |
| Status bar time / battery / signal | `xcrun simctl status_bar booted override --time "09:41" --batteryLevel 100 --cellularBars 4 --wifiBars 3` | `xcrun simctl status_bar booted clear` |
| Data network | `xcrun simctl status_bar booted override --dataNetwork none` | `xcrun simctl status_bar booted clear` |

Valid `content_size` values: `extra-small`, `small`, `medium`, `large`,
`extra-large`, `extra-extra-large`, `extra-extra-extra-large`,
`accessibility-medium`, `accessibility-large`, `accessibility-extra-large`,
`accessibility-extra-extra-large`, `accessibility-extra-extra-extra-large`.

## Logs and crashes

```bash
# Live stream for one bundle + any error-level messages
xcrun simctl spawn booted log stream \
  --predicate 'subsystem == "com.example.myapp" OR eventMessage CONTAINS "error"' \
  --level debug

# Most recent crash reports (across all apps)
ls -lt ~/Library/Logs/DiagnosticReports/ | head -10

# Read a specific crash
cat ~/Library/Logs/DiagnosticReports/<name>.ips | head -60
```

Crash files are JSON; the first object is the summary. The `threads`
array contains stack traces — the crashed thread is the one where
`triggered: true`.

## Hardware gestures via keyboard shortcuts

These work when the Simulator app window is frontmost.

| Gesture | Shortcut |
|---------|----------|
| Home | Cmd+Shift+H |
| Lock | Cmd+L |
| Rotate left | Cmd+← |
| Rotate right | Cmd+→ |
| Shake | Ctrl+Cmd+Z |
| Screenshot (to Desktop) | Cmd+S |
| Toggle soft keyboard | Cmd+K |
| Paste | Cmd+V |

## Keyboard quirks

- `ui_type` only takes ASCII printable characters (regex
  `^[\x20-\x7E]+$`). For emoji or non-Latin, paste instead: put the text
  in the macOS clipboard (`pbcopy`), focus the field, then Cmd+V.
- If the on-screen keyboard is hidden (hardware keyboard attached),
  `ui_type` still works, but what you're testing may not match a real
  iPhone user's experience. Toggle with Cmd+K.
- Return / enter / tab / backspace are not sent by `ui_type` — find the
  Return key in the AX tree of the keyboard view and tap it.
