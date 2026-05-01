# Electron Platform QA Workflow

## Prerequisites

| Check | Method | Expected |
|-------|--------|----------|
| Electron app running | `pnpm electron:dev` | App window visible |
| `/qa-electron` skill available | Invoke `/qa-electron` skill | Skill loaded |
| claudedocs/qa/ exists | `mkdir -p claudedocs/qa/screenshots` | Directory ready |

## Verification Tool

Use the `/qa-electron` skill for all Electron UI operations. The skill drives the Electron renderer via `playwright-cli` attached to the app's CDP port:

- Screenshot capture
- UI element interaction
- Window inspection
- JS execution in renderer

**Before any browser interaction**: invoke `/dnd` to load the drag-and-drop
verification protocol. Required even when DnD is not yet known to be involved —
ref-based `drag` returns false success on `dnd-kit` and similar libraries.

## Electron-Specific Checks

### Beyond Web Checks

| Check | How |
|-------|-----|
| **Native menus** | Verify menu bar items via `/qa-electron` skill |
| **IPC communication** | Check renderer ↔ main process messaging |
| **Window chrome** | Traffic light buttons (close/minimize/maximize) position and function |
| **Multi-window** | If app supports multiple windows, verify each |
| **Tray icon** | If app has system tray, verify icon and menu |
| **File system access** | If app reads/writes files, test edge cases |
| **Auto-update** | Verify update mechanism doesn't interfere |

### Per-Perspective Workflow

Same as Web workflow but using `/qa-electron` skill:

- **Visual**: Screenshot capture and window resize via `/qa-electron` skill
- **Functional**: Execute JS commands to trigger user flows. Drag-and-drop
  flows must follow `/dnd` coordinate-based protocol — ref-based `drag` lies.
- **HIG**: Check window controls, keyboard shortcuts, native menu items
- **Edge Cases**: Test with very large files, concurrent window operations
- **UX**: Verify native feel (window snapping, keyboard shortcuts, context menus)

### Responsive Testing

For Electron, resize the window via `/qa-electron` skill:
```
Test at: 320x600, 768x1024, 1440x900
```
