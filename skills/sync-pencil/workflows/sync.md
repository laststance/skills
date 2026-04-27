# Workflow: Bidirectional Sync

Compare design and implementation, then merge changes with "best of both" strategy.

<required_reading>
**Read these reference files NOW:**
1. `references/platform-detection.md`
2. `references/diff-algorithm.md`
3. `references/merge-strategies.md`
</required_reading>

<process>
## Step 1: Capture Both States

### Design State (.pen)
```javascript
// Get design screenshot
mcp__pencil__get_screenshot({ nodeId: "targetFrame" })

// Get structure
mcp__pencil__batch_get({
  nodeIds: ["targetFrame"],
  readDepth: 10
})

// Get tokens
mcp__pencil__get_variables()
```

### Implementation State (Platform-specific)
```javascript
// Electron (electron-playwright-cli — config-based auto-launch)
electron-playwright-cli screenshot --filename=impl-screenshot.png
electron-playwright-cli snapshot  // get page structure

// Web
const implScreenshot = mcp__claude-in-chrome__read_page(...)

// iOS
const implScreenshot = mcp__ios-simulator__screenshot()
const implStructure = mcp__ios-simulator__ui_describe_all()
```

## Step 2: Visual Diff Analysis

Compare screenshots and identify differences:

```markdown
## Visual Differences Detected

| Area | Design (.pen) | Implementation | Severity |
|------|---------------|----------------|----------|
| Button color | #2563EB | #3B82F6 | Minor |
| Card padding | 24px | 16px | Major |
| Font size | 16px | 14px | Minor |
| Border radius | 12px | 8px | Minor |
```

## Step 3: Structural Diff

Compare component structure:

```markdown
## Structural Differences

| Component | In .pen | In Code | Action Needed |
|-----------|---------|---------|---------------|
| Button | ✓ | ✓ | Sync props |
| Card | ✓ | ✓ | Sync styles |
| NewModal | ✗ | ✓ | Add to .pen |
| OldBanner | ✓ | ✗ | Remove or add |
```

## Step 4: Present Merge Options

Ask user for merge strategy:

```markdown
## Sync Strategy

For each difference, choose:

1. **Design wins** - Update code to match .pen
2. **Code wins** - Update .pen to match code
3. **Manual** - I'll specify the value
4. **Skip** - Keep both as-is

### Button Color
- Design: `#2563EB` (darker blue)
- Code: `#3B82F6` (lighter blue)
- Recommendation: Design wins (matches design system)

[1] Design wins | [2] Code wins | [3] Manual | [4] Skip
```

## Step 5: Execute Merge

Based on user choices, apply changes:

### Update .pen (code wins)
```javascript
mcp__pencil__batch_design({
  operations: `
    U("ButtonDef", { fill: "#3B82F6" })
    U("CardComponent", { padding: [16, 16, 16, 16] })
  `
})
```

### Update Code (design wins)
```javascript
Edit({
  file_path: "src/components/Button.tsx",
  old_string: 'bg-blue-500',
  new_string: 'bg-blue-600'
})
```

### Add Missing Components

**To .pen:**
```javascript
mcp__pencil__batch_design({
  operations: `
    // Insert new component from code
    foo=I("ComponentsFrame", {
      type: "frame",
      name: "NewModal",
      reusable: true,
      // ... properties from code
    })
  `
})
```

**To Code:**
```javascript
// Generate from .pen using pencil-to-code workflow
```

## Step 6: Verify Sync

Take new screenshots of both:

```javascript
// Updated .pen
mcp__pencil__get_screenshot({ nodeId: "targetFrame" })

// Updated implementation
electron-playwright-cli screenshot --filename=updated-impl.png  // or platform equivalent
```

Compare visually to confirm sync achieved.

## Step 7: Sync Report

```markdown
## Sync Complete

### Changes Applied

| Component | Property | Previous | New | Direction |
|-----------|----------|----------|-----|-----------|
| Button | fill | #3B82F6 | #2563EB | .pen → code |
| Card | padding | 16px | 24px | .pen → code |
| Modal | - | (missing) | added | code → .pen |

### Visual Verification
| Source | Screenshot |
|--------|------------|
| Design (.pen) | [attached] |
| Implementation | [attached] |

### Sync Status: ✅ Complete
- Components matched: 12/12
- Properties synced: 8
- Manual decisions: 2
```
</process>

<success_criteria>
This workflow is complete when:
- [ ] Both design and implementation states captured
- [ ] Visual differences identified and documented
- [ ] Structural differences analyzed
- [ ] User approved merge strategy for each difference
- [ ] Changes applied to both .pen and code as needed
- [ ] Visual verification confirms sync
- [ ] Comprehensive report generated
</success_criteria>
