# Electron Platform QA Workflow

## Prerequisites

| Check | Command | Expected |
|-------|---------|----------|
| Electron app running | `mcp__electron__list_electron_windows` | Window list returned |
| Electron MCP connected | `mcp__electron__get_electron_window_info` | Window info |
| claudedocs/qa/ exists | `mkdir -p claudedocs/qa/screenshots` | Directory ready |

## MCP Tools

| Purpose | Primary Tool |
|---------|-------------|
| Screenshot | `mcp__electron__take_screenshot` |
| Execute JS | `mcp__electron__send_command_to_electron` |
| Window info | `mcp__electron__get_electron_window_info` |
| Window list | `mcp__electron__list_electron_windows` |
| Read logs | `mcp__electron__read_electron_logs` |

## Electron-Specific Checks

### Beyond Web Checks

| Check | How |
|-------|-----|
| **Native menus** | Verify menu bar items via `send_command_to_electron` |
| **IPC communication** | Check renderer ↔ main process messaging |
| **Window chrome** | Traffic light buttons (close/minimize/maximize) position and function |
| **Multi-window** | If app supports multiple windows, verify each |
| **Tray icon** | If app has system tray, verify icon and menu |
| **File system access** | If app reads/writes files, test edge cases |
| **Auto-update** | Verify update mechanism doesn't interfere |

### Per-Perspective Workflow

Same as Web workflow but using Electron MCP tools:

- **Visual**: `mcp__electron__take_screenshot` for captures, resize window via `send_command_to_electron`
- **Functional**: Execute JS commands to trigger user flows
- **HIG**: Check window controls, keyboard shortcuts, native menu items
- **Edge Cases**: Test with very large files, concurrent window operations
- **UX**: Verify native feel (window snapping, keyboard shortcuts, context menus)

### Responsive Testing

For Electron, resize the window instead of viewport:
```js
// Via send_command_to_electron
mainWindow.setSize(320, 600)
mainWindow.setSize(768, 1024)
mainWindow.setSize(1440, 900)
```
