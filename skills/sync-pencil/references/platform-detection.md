# Platform Detection Reference

Detect project platform and select appropriate MCP for screenshots.

## Detection Logic

```javascript
async function detectPlatform() {
  // Check file indicators
  const hasElectronConfig = await exists("electron.vite.config.ts")
    || await exists("electron-builder.json")
    || await exists("electron-builder.yml")

  const packageJson = await readJson("package.json")
  const hasElectronDep = packageJson?.devDependencies?.electron
    || packageJson?.dependencies?.electron

  const hasExpoConfig = await exists("app.json")
    || await exists("app.config.js")
    || await exists("expo.json")

  const hasIosDir = await exists("ios/")
  const hasAndroidDir = await exists("android/")

  const hasNextConfig = await exists("next.config.js")
    || await exists("next.config.ts")
    || await exists("next.config.mjs")

  // Determine platform
  if (hasElectronConfig || hasElectronDep) {
    return { platform: "electron", tool: "electron-playwright-cli" }
  }

  if (hasExpoConfig || (hasIosDir && hasAndroidDir)) {
    return { platform: "ios", mcp: "mcp__ios-simulator" }
  }

  // Default to web
  return { platform: "web", mcp: "mcp__claude-in-chrome" }
}
```

## MCP Capabilities by Platform

### Electron (electron-playwright-cli)

| Command | Purpose |
|---------|---------|
| `electron-playwright-cli snapshot` | Discover interactive elements |
| `electron-playwright-cli screenshot --filename=<name>.png` | Full window screenshot |
| `electron-playwright-cli click @e5` | Click element by ref |
| `electron-playwright-cli fill @e5 "text"` | Fill input field |
| `electron-playwright-cli electron_windows` | List Electron BrowserWindows |
| `electron-playwright-cli tab-list` / `tab-select N` | List/switch tabs |

**Usage:**
```bash
# Verify .playwright/cli.config.json points to ./out/main/index.js
cat .playwright/cli.config.json

# Daemon auto-launches Electron from config on first command
electron-playwright-cli snapshot
electron-playwright-cli click @e5
electron-playwright-cli screenshot --filename=electron-app.png
```

### Web (mcp__claude-in-chrome)

| Tool | Purpose |
|------|---------|
| `read_page` | Page content and screenshot |
| `navigate` | Go to URL |
| `computer` | Mouse/keyboard actions |

**Usage:**
```javascript
// Navigate and capture
mcp__claude-in-chrome__navigate({ url: "http://localhost:3000" })
mcp__claude-in-chrome__read_page()

// Interact
mcp__claude-in-chrome__computer({
  action: "click",
  coordinate: [100, 200]
})
```

### iOS Simulator (mcp__ios-simulator)

| Tool | Purpose |
|------|---------|
| `screenshot` | Simulator screenshot |
| `ui_describe_all` | UI element tree |
| `ui_tap` | Tap element |

**Usage:**
```javascript
// Screenshot
mcp__ios-simulator__screenshot()

// Get UI tree
mcp__ios-simulator__ui_describe_all()

// Tap button
mcp__ios-simulator__ui_tap({ label: "Submit" })
```

## Platform-Specific Considerations

### Electron
- Dev server usually on port 5173 (Vite) or 3000
- Debug port typically 9222
- Window title may differ from web

### Web
- Need Chrome extension active
- Works with any localhost port
- Can target specific tabs

### iOS Simulator
- Simulator must be running
- App must be launched
- Coordinates are point-based, not pixel

## Fallback Strategy

If primary MCP unavailable:

1. **Electron** → Try `playwright-cli` against the dev server URL, or `mcp__claude-in-chrome`
2. **Web** → Try `mcp__plugin_playwright_playwright` for screenshots
3. **iOS** → No fallback, simulator required
