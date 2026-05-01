# Platform Detection Reference

Detect project platform and select the appropriate tool for screenshots and
interaction. All browser/Electron platforms standardize on `playwright-cli`.

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
    return { platform: "electron", tool: "playwright-cli", attachMode: "cdp" }
  }

  if (hasExpoConfig || (hasIosDir && hasAndroidDir)) {
    return { platform: "ios", mcp: "mcp__ios-simulator" }
  }

  // Default to web
  return { platform: "web", tool: "playwright-cli" }
}
```

## Tool Capabilities by Platform

### Electron (`playwright-cli` attached via CDP)

Launch the Electron app with `--remote-debugging-port=9222` (configured in the
project's `pnpm dev` script), then attach `playwright-cli` to that port.

| Command | Purpose |
|---------|---------|
| `playwright-cli attach --cdp=http://localhost:9222` | Attach to running Electron renderer |
| `playwright-cli --s=default snapshot` | Discover interactive elements |
| `playwright-cli --s=default screenshot --filename=<name>.png` | Full window screenshot |
| `playwright-cli --s=default click <ref>` | Click element by ref |
| `playwright-cli --s=default fill <ref> "text"` | Fill input field |
| `playwright-cli --s=default tab-list` / `tab-select N` | List / switch attached pages |
| `playwright-cli --s=default detach` | Release the CDP session (does not quit Electron) |

**Usage:**
```bash
# Launch app with CDP exposed (project-specific dev script)
pnpm dev   # must pass --remote-debugging-port=9222

# Attach and operate
playwright-cli attach --cdp=http://localhost:9222
playwright-cli --s=default snapshot
playwright-cli --s=default click e5
playwright-cli --s=default screenshot --filename=electron-app.png
```

### Web (`playwright-cli`)

| Command | Purpose |
|---------|---------|
| `playwright-cli open <url> --headed` | Launch headed browser to URL |
| `playwright-cli navigate <url>` | Navigate current session |
| `playwright-cli snapshot` | Page accessibility tree + refs |
| `playwright-cli screenshot --filename=<name>.png` | Capture screenshot |
| `playwright-cli click <ref>` | Click element |
| `playwright-cli fill <ref> "text"` | Fill input |
| `playwright-cli eval "<expr>"` | Evaluate JS in page context |

**Usage:**
```bash
playwright-cli open http://localhost:3000 --headed
playwright-cli snapshot
playwright-cli screenshot --filename=web-impl.png
```

### iOS Simulator (`mcp__ios-simulator`)

| Tool | Purpose |
|------|---------|
| `screenshot` | Simulator screenshot |
| `ui_describe_all` | UI element tree |
| `ui_tap` | Tap element |

**Usage:**
```javascript
mcp__ios-simulator__screenshot()
mcp__ios-simulator__ui_describe_all()
mcp__ios-simulator__ui_tap({ label: "Submit" })
```

## Drag-and-Drop

Before invoking any browser interaction (Web or Electron) that may involve
drag-and-drop, load the `/dnd` skill. Ref-based `drag <source> <target>`
returns false success on `dnd-kit` and similar libraries — coordinate-based
pointer ops (`mousemove` / `mousedown` / `mouseup`) are mandatory for
verification.

## Platform-Specific Considerations

### Electron
- Dev server usually on port 5173 (Vite) or 3000
- CDP debug port typically 9222 (must be passed via `--remote-debugging-port`)
- Window title may differ from web

### Web
- `playwright-cli` launches a managed Chromium — no extension required
- Works with any localhost port
- Use `playwright-cli state-save / state-load` to persist authenticated sessions

### iOS Simulator
- Simulator must be running
- App must be launched
- Coordinates are point-based, not pixel
