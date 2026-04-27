# Workflow: Code to Pencil

Update .pen design file from current implementation screenshots.

<required_reading>
**Read these reference files NOW:**
1. `references/platform-detection.md`
2. `references/node-mapping.md`
</required_reading>

<process>
## Step 1: Detect Platform

Determine the project type and available MCP:

```javascript
// Check for Electron
if (exists("electron.vite.config.ts") || package.json has "electron") {
  platform = "electron"
  tool = "electron-playwright-cli"  // config-based daemon auto-launch
}
// Check for iOS/React Native
else if (exists("ios/") || exists("app.json" with expo)) {
  platform = "ios"
  mcp = "mcp__ios-simulator"
}
// Default to web
else {
  platform = "web"
  mcp = "mcp__claude-in-chrome"
}
```

## Step 2: Capture Implementation Screenshots

**Electron (electron-playwright-cli):**
```bash
# Verify .playwright/cli.config.json points at ./out/main/index.js
cat .playwright/cli.config.json
# Daemon auto-launches the Electron app on first command
electron-playwright-cli screenshot --filename=electron-impl.png
electron-playwright-cli snapshot  # get page structure
```

**Web:**
```javascript
mcp__claude-in-chrome__read_page({ url: "http://localhost:..." })
// Then screenshot specific elements
```

**iOS Simulator:**
```javascript
mcp__ios-simulator__screenshot()
// Or describe UI
mcp__ios-simulator__ui_describe_all()
```

## Step 3: Get Current .pen Structure

```javascript
// Get the design file state
mcp__pencil__get_editor_state()

// Get component nodes
mcp__pencil__batch_get({
  patterns: ["**/Button*", "**/Card*", "**/Nav*"]
})
```

## Step 4: Analyze Differences

Compare implementation vs design:

| Aspect | How to Extract from Code | How to Extract from .pen |
|--------|-------------------------|-------------------------|
| Colors | Tailwind classes → hex | `fill`, `textColor` props |
| Spacing | gap-*, p-*, m-* classes | `gap`, `padding` props |
| Typography | text-*, font-* classes | `fontSize`, `fontWeight` |
| Layout | flex, grid classes | `layout`, `alignItems` |
| Border | border-*, rounded-* | `stroke`, `cornerRadius` |

## Step 5: Generate .pen Updates

For each detected difference, create batch_design operations:

```javascript
mcp__pencil__batch_design({
  operations: `
    // Update button color
    U("ButtonDef", { fill: "#2563EB" })

    // Update card padding
    U("CardComponent", { padding: [24, 32, 24, 32] })

    // Update text size
    U("HeadingText", { fontSize: 32, fontWeight: 700 })
  `
})
```

## Step 6: Visual Verification

Take screenshot of updated .pen:

```javascript
mcp__pencil__get_screenshot({ nodeId: "updatedFrameId" })
```

Compare with implementation screenshot to verify sync.

## Step 7: Report Changes

```markdown
## Code → Pencil Sync Report

### Updated Components

| Component | Property | Before | After |
|-----------|----------|--------|-------|
| Button | fill | #3B82F6 | #2563EB |
| Card | padding | [16,16,16,16] | [24,32,24,32] |

### Screenshots
- Implementation: [attached]
- Updated .pen: [attached]

### Verification
Visual match: ✅ / ⚠️ / ❌
```
</process>

<success_criteria>
This workflow is complete when:
- [ ] Platform detected and MCP connected
- [ ] Implementation screenshot captured
- [ ] Current .pen structure retrieved
- [ ] Differences analyzed and documented
- [ ] .pen file updated via batch_design
- [ ] Visual verification shows match
- [ ] Change report generated
</success_criteria>
