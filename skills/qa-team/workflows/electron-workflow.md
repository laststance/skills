# Electron Platform QA Workflow

## Prerequisites

| Check | Method | Expected |
|-------|--------|----------|
| Electron app running | `pnpm electron:dev` | App window visible |
| `/electron` skill available | Invoke `/electron` skill | Skill loaded |
| claudedocs/qa/ exists | `mkdir -p claudedocs/qa/screenshots` | Directory ready |

## Verification Tool

Use the `/electron` skill for all Electron UI operations. The skill provides agent-browser based capabilities:

- Screenshot capture
- UI element interaction
- Window inspection
- JS execution in renderer

## Electron-Specific Checks

### Beyond Web Checks

| Check | How |
|-------|-----|
| **Native menus** | Verify menu bar items via `/electron` skill |
| **IPC communication** | Check renderer ↔ main process messaging |
| **Window chrome** | Traffic light buttons (close/minimize/maximize) position and function |
| **Multi-window** | If app supports multiple windows, verify each |
| **Tray icon** | If app has system tray, verify icon and menu |
| **File system access** | If app reads/writes files, test edge cases |
| **Auto-update** | Verify update mechanism doesn't interfere |

### Per-Perspective Workflow

Same as Web workflow but using `/electron` skill:

- **Visual**: Screenshot capture and window resize via `/electron` skill
- **Functional**: Execute JS commands to trigger user flows
- **HIG**: Check window controls, keyboard shortcuts, native menu items
- **Edge Cases**: Test with very large files, concurrent window operations
- **UX**: Verify native feel (window snapping, keyboard shortcuts, context menus)

### Responsive Testing

For Electron, resize the window via `/electron` skill:
```
Test at: 320x600, 768x1024, 1440x900
```
