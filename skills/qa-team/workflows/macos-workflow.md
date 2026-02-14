# macOS Native QA Workflow

## Prerequisites

| Check | Command | Expected |
|-------|---------|----------|
| App running | `mcp__mac-mcp-server__list_running_apps` | App in list |
| Mac MCP connected | `mcp__mac-mcp-server__get_system_info` | System info |
| claudedocs/qa/ exists | `mkdir -p claudedocs/qa/screenshots` | Directory ready |

## MCP Tools

| Purpose | Tool |
|---------|------|
| Screenshot | `mcp__mac-mcp-server__take_screenshot` |
| Click | `mcp__mac-mcp-server__click` |
| Type | `mcp__mac-mcp-server__type_text` |
| Key press | `mcp__mac-mcp-server__press_key` / `key_combination` |
| UI elements | `mcp__mac-mcp-server__get_ui_elements` |
| Click UI element | `mcp__mac-mcp-server__click_ui_element` |
| Menu items | `mcp__mac-mcp-server__list_menu_items` / `click_menu_item` |
| Window ops | `mcp__mac-mcp-server__move_window` / `resize_window` |
| Scroll | `mcp__mac-mcp-server__scroll` |

## macOS-Specific Checks

### Beyond Web/Mobile Checks

| Check | How |
|-------|-----|
| **Menu bar** | All menu items accessible via `list_menu_items`, keyboard shortcuts work |
| **Keyboard shortcuts** | Cmd+C/V/Z/S/Q/W/N and app-specific shortcuts |
| **Window management** | Resize, minimize, maximize, full screen, split view |
| **Traffic lights** | Close/minimize/zoom buttons work correctly |
| **Context menus** | Right-click shows appropriate options |
| **Drag and drop** | If supported, test file/item drag |
| **Dark/Light mode** | System appearance change reflects in app |
| **Accessibility** | VoiceOver navigation, UI element labels |

### Per-Perspective Workflow

- **Visual**: Screenshot windows at various sizes. Check `get_ui_elements` for layout structure. Verify Dark/Light appearance.
- **Functional**: Use `click_ui_element` and `type_text` for user flows. Verify `click_menu_item` for menu operations.
- **HIG**: Full macOS HIG — SF Symbols, sidebar patterns, toolbar layout, proper use of NSAlert, sheet/popover patterns.
- **Edge Cases**: Window at minimum size, very large datasets in outline views, rapid keyboard input, concurrent document operations.
- **UX**: Native macOS feel (not web-wrapped), proper use of native controls, keyboard-first design, Undo/Redo support.

### Appearance Testing

```
1. Set light mode: mcp__mac-mcp-server__press_key (or System Preferences)
2. Screenshot all screens
3. Set dark mode
4. Screenshot all screens
5. Compare for consistency
```
