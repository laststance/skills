# Reference: Element Extraction from .pen Files

Precise methodology for extracting all UI elements from Pencil design files.

## Element Types

### Included (UI Elements)

| Type | Description | Extraction Priority |
|------|-------------|---------------------|
| `frame` with `reusable: true` | Component definition | P1 - Critical |
| `ref` | Component instance | P1 - Critical |
| `frame` with layout props | Container/layout | P2 - High |
| `rectangle` | Visual shape | P2 - High |
| `ellipse` | Visual shape | P2 - High |
| `line` | Divider/border | P3 - Medium |
| `text` inside component | UI label/content | P2 - High |
| `group` | Grouped elements | P3 - Medium |

### Excluded (Non-UI Elements)

| Type | Reason for Exclusion | Detection Pattern |
|------|---------------------|-------------------|
| Standalone text | Documentation/annotation | Text at root level, outside frames |
| Header text | Section label | Text with "Header" in name or very large fontSize (>32) |
| Description text | Explanation | Text containing "description", "note", or outside component bounds |
| Annotation frames | Design notes | Frames with "annotation", "note", "comment" in name |
| Hidden elements | Not rendered | `visible: false` property |

## Extraction Algorithm

### Step 1: Get Root Structure

```javascript
const state = mcp__pencil__get_editor_state()
const root = mcp__pencil__batch_get({
  nodeIds: [state.documentId],
  readDepth: 1
})

// Find main design frame (usually named "Design" or similar)
const designFrame = root.children.find(c =>
  c.type === "frame" &&
  !c.name.toLowerCase().includes("annotation") &&
  !c.name.toLowerCase().includes("documentation")
)
```

### Step 2: Recursive Traversal

```javascript
function extractElements(node, path = [], depth = 0) {
  const elements = []

  // Skip excluded types
  if (isExcluded(node)) return elements

  // Add this element
  if (isUIElement(node)) {
    elements.push({
      id: `E${String(elements.length + 1).padStart(2, '0')}`,
      nodeId: node.id,
      name: node.name,
      type: node.type,
      path: [...path, node.name].join(' > '),
      depth: depth,
      reusable: node.reusable || false,
      properties: extractProperties(node)
    })
  }

  // Recurse into children
  if (node.children) {
    for (const child of node.children) {
      elements.push(...extractElements(
        child,
        [...path, node.name],
        depth + 1
      ))
    }
  }

  return elements
}
```

### Step 3: Classification Functions

```javascript
function isExcluded(node) {
  // Name-based exclusion
  const excludedNames = [
    'annotation', 'note', 'comment', 'description',
    'documentation', 'spec', 'readme'
  ]
  if (excludedNames.some(n => node.name?.toLowerCase().includes(n))) {
    return true
  }

  // Standalone text exclusion (text at root or outside components)
  if (node.type === 'text' && node.depth <= 1) {
    return true
  }

  // Hidden element exclusion
  if (node.visible === false) {
    return true
  }

  // Large header text exclusion
  if (node.type === 'text' && node.fontSize > 32) {
    return true
  }

  return false
}

function isUIElement(node) {
  const uiTypes = ['frame', 'rectangle', 'ellipse', 'line', 'text', 'ref', 'group']
  return uiTypes.includes(node.type)
}
```

### Step 4: Property Extraction

```javascript
function extractProperties(node) {
  const props = {}

  // Visual properties
  if (node.fill) props.fill = node.fill
  if (node.stroke) props.stroke = node.stroke
  if (node.cornerRadius) props.cornerRadius = node.cornerRadius
  if (node.opacity !== undefined) props.opacity = node.opacity

  // Layout properties
  if (node.layout) props.layout = node.layout
  if (node.gap) props.gap = node.gap
  if (node.padding) props.padding = node.padding
  if (node.alignItems) props.alignItems = node.alignItems
  if (node.justifyContent) props.justifyContent = node.justifyContent

  // Size properties
  if (node.width) props.width = node.width
  if (node.height) props.height = node.height
  if (node.minWidth) props.minWidth = node.minWidth
  if (node.maxWidth) props.maxWidth = node.maxWidth

  // Typography (for text)
  if (node.fontSize) props.fontSize = node.fontSize
  if (node.fontWeight) props.fontWeight = node.fontWeight
  if (node.fontFamily) props.fontFamily = node.fontFamily
  if (node.lineHeight) props.lineHeight = node.lineHeight
  if (node.letterSpacing) props.letterSpacing = node.letterSpacing
  if (node.textColor) props.textColor = node.textColor

  return props
}
```

## Code Mapping Heuristics

### Naming Convention Mapping

| .pen Name Pattern | Code Path Pattern |
|-------------------|-------------------|
| `Button` | `components/ui/Button.tsx` or `components/Button.tsx` |
| `NavBar` | `components/NavBar.tsx` |
| `Card` | `components/ui/Card.tsx` |
| `{Name}Icon` | `components/icons/{Name}Icon.tsx` |
| `{Page}Layout` | `app/{page}/layout.tsx` |

### Search Strategy

```javascript
// 1. Direct name match
const direct = Glob({ pattern: `**/components/**/${name}.tsx` })

// 2. Case-insensitive search
const caseInsensitive = Glob({
  pattern: `**/components/**/${name.toLowerCase()}*.tsx`
})

// 3. Grep for component definition
const definition = Grep({
  pattern: `export.*function ${name}|export.*const ${name}`,
  path: "src/"
})
```

## Output Format

### Element Registry

```json
{
  "meta": {
    "extraction_date": "2026-02-01T10:00:00Z",
    "pen_file": "design.pen",
    "total_elements": 47,
    "by_type": {
      "frame": 12,
      "ref": 18,
      "rectangle": 5,
      "text": 10,
      "ellipse": 2
    },
    "excluded_count": 8
  },
  "elements": [
    {
      "id": "E01",
      "nodeId": "pencil_abc123",
      "name": "NavBar",
      "type": "frame",
      "path": "Root > MainLayout > NavBar",
      "depth": 2,
      "reusable": true,
      "properties": {
        "fill": "#1F2937",
        "cornerRadius": 8,
        "padding": [16, 24, 16, 24],
        "layout": "horizontal",
        "gap": 16
      },
      "code_mapping": {
        "file": "src/components/NavBar.tsx",
        "line": null,
        "verified": true
      },
      "status": "pending",
      "validation_result": null
    }
  ]
}
```

## Validation Checklist

Before proceeding to validation phase:

- [ ] Root design frame identified
- [ ] Recursive traversal completed
- [ ] Non-UI elements filtered out
- [ ] Element IDs assigned (E01-ENN)
- [ ] Properties extracted for each element
- [ ] Code mappings attempted
- [ ] Unverified mappings flagged
