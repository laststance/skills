# iOS / Expo Mobile QA Workflow

## Prerequisites

| Check | Command | Expected |
|-------|---------|----------|
| Simulator booted | `mcp__ios-simulator__get_booted_sim_id` | Simulator ID returned |
| App installed | `mcp__ios-simulator__launch_app` | App launches |
| claudedocs/qa/ exists | `mkdir -p claudedocs/qa/screenshots` | Directory ready |

## MCP Tools

| Purpose | Tool |
|---------|------|
| Screenshot | `mcp__ios-simulator__screenshot` |
| Tap | `mcp__ios-simulator__ui_tap` |
| Type | `mcp__ios-simulator__ui_type` |
| Swipe | `mcp__ios-simulator__ui_swipe` |
| View UI tree | `mcp__ios-simulator__ui_describe_all` |
| View point | `mcp__ios-simulator__ui_describe_point` |
| View element | `mcp__ios-simulator__ui_view` |
| Open simulator | `mcp__ios-simulator__open_simulator` |
| Boot | `mcp__ios-simulator__get_booted_sim_id` |

## Mobile-Specific Checks

### Beyond Web/Desktop Checks

| Check | How |
|-------|-----|
| **Safe area** | Content not hidden behind notch/Dynamic Island/home indicator |
| **Orientation** | Rotate device, verify layout adapts |
| **Gesture navigation** | Swipe back, pull to refresh, scroll bounce |
| **Keyboard** | Text fields push content up properly, no hidden inputs |
| **Status bar** | Content readable over both light and dark status bars |
| **Large text** | Dynamic Type / Accessibility text sizes don't break layout |

### Per-Perspective Workflow

- **Visual**: Screenshot each screen at default + large text sizes. Check safe area insets.
- **Functional**: Tap through all flows. Use `ui_tap` with coordinates from `ui_describe_all`.
- **HIG**: Apple HIG mobile guidelines — 44pt tap targets, SF Symbols, navigation patterns, haptic feedback.
- **Edge Cases**: Very long text in cells, 100+ items in lists (scroll performance), offline mode, app backgrounding.
- **UX**: Native feel (no web-like patterns on mobile), proper use of native components, gesture discoverability.

### Device Testing

Test on multiple simulator sizes if available:
- iPhone SE (compact)
- iPhone 15 Pro (standard)
- iPhone 15 Pro Max (large)
- iPad (if universal app)
