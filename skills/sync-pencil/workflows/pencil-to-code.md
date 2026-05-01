# Workflow: Pencil to Code

Generate or update implementation code from .pen design file.

<required_reading>
**Read these reference files NOW:**
1. `references/node-mapping.md`
2. The existing `/pencil-to-code` skill for detailed mapping rules
</required_reading>

<process>
## Step 1: Get .pen Design Structure

```javascript
// Get editor state
mcp__pencil__get_editor_state()

// Get target frame/component
mcp__pencil__batch_get({
  nodeIds: ["targetFrameId"],
  readDepth: 10,
  resolveInstances: true,
  resolveVariables: true
})

// Get design tokens
mcp__pencil__get_variables()
```

## Step 2: Extract Design Tokens

Transform .pen variables to Tailwind theme:

```css
/* From .pen variables → globals.css */
@theme {
  --color-primary: oklch(0.7 0.18 195);
  --color-background: oklch(0.12 0.02 195);
  --font-sans: "Inter", sans-serif;
  --font-mono: "JetBrains Mono", monospace;
  --radius-md: 0.5rem;
}
```

## Step 3: Map Nodes to Components

Apply mapping from `references/node-mapping.md`:

| .pen Node | React Output |
|-----------|--------------|
| `frame` with `reusable: true` | Extract as component |
| `frame` with layout | `<div className="flex ...">` |
| `text` (large, bold) | `<h1>` - `<h6>` |
| `text` (body) | `<p>` or `<span>` |
| `ref` (instance) | Component usage |

## Step 4: Generate Component Code

**Component Template:**
```tsx
// components/[ComponentName].tsx
import { cn } from "@/lib/utils"

interface [ComponentName]Props {
  className?: string
  children?: React.ReactNode
}

export function [ComponentName]({
  className,
  children
}: [ComponentName]Props) {
  return (
    <div className={cn(
      "[base tailwind classes from .pen]",
      className
    )}>
      {children}
    </div>
  )
}
```

## Step 5: Write or Update Files

**New component:**
```javascript
// Write the new component file
Write({
  file_path: "src/components/[Name].tsx",
  content: generatedCode
})
```

**Update existing:**
```javascript
// Read existing, merge changes
Read({ file_path: "src/components/[Name].tsx" })
// Edit specific sections
Edit({
  file_path: "src/components/[Name].tsx",
  old_string: "...",
  new_string: "..."
})
```

## Step 6: Visual Verification

Before any browser interaction (Web or Electron), invoke `/dnd` to load the
drag-and-drop verification protocol.

Capture both design and implementation for comparison:

```javascript
// Design screenshot
mcp__pencil__get_screenshot({ nodeId: "frameId" })

// Implementation screenshot (platform-specific)
// Electron (playwright-cli via CDP — pnpm dev must expose --remote-debugging-port=9222):
playwright-cli attach --cdp=http://localhost:9222
playwright-cli --s=default screenshot --filename=electron-impl.png
// Web:
playwright-cli open http://localhost:3000 --headed
playwright-cli screenshot --filename=web-impl.png
// iOS:
mcp__ios-simulator__screenshot()
```

## Step 7: Report

```markdown
## Pencil → Code Sync Report

### Generated/Updated Components

| Component | File | Status |
|-----------|------|--------|
| Button | `components/Button.tsx` | Created |
| Card | `components/Card.tsx` | Updated |

### Theme Updates
- Added `--color-primary` to globals.css
- Updated `--radius-md` value

### Visual Comparison
- Design: [screenshot]
- Implementation: [screenshot]
- Match: ✅ / ⚠️ differences noted
```
</process>

<success_criteria>
This workflow is complete when:
- [ ] .pen structure fully parsed
- [ ] Design tokens extracted to Tailwind theme
- [ ] Components generated/updated
- [ ] Files written to correct locations
- [ ] Visual verification shows match
- [ ] Report generated with before/after
</success_criteria>
