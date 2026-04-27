# Workflow: Exhaustive Sync (Roller Strategy)

Complete element-by-element synchronization with progress tracking.
Ensures 100% coverage - no element left unchecked.

<required_reading>
**Read these reference files NOW:**
1. `references/element-extraction.md`
2. `references/platform-detection.md`
3. `references/diff-algorithm.md`
</required_reading>

## When to Use This Workflow

| Scenario | Use This? |
|----------|-----------|
| Quick fix for 1-2 elements | No → Use `sync.md` |
| Full audit needed | **Yes** |
| Design handoff verification | **Yes** |
| Post-refactor validation | **Yes** |
| Time-sensitive fix | No → Use `sync.md` |

<process>

## Phase 1: Element Extraction

### Step 1.1: Get Complete .pen Structure

```javascript
// Get all frames and components
const editorState = mcp__pencil__get_editor_state()

// Get full structure with maximum depth
const structure = mcp__pencil__batch_get({
  nodeIds: [editorState.rootFrameId],
  readDepth: 20,  // Deep traversal
  resolveInstances: true,
  resolveVariables: true
})

// Get all design tokens
const variables = mcp__pencil__get_variables()
```

### Step 1.2: Build Element Registry

Extract all UI elements (exclude description text and headers):

**Inclusion Criteria:**
| Node Type | Include? | Criteria |
|-----------|----------|----------|
| `frame` with `reusable: true` | ✅ | Component definition |
| `frame` with layout | ✅ | Container/layout |
| `ref` (instance) | ✅ | Component usage |
| `rectangle` | ✅ | Visual element |
| `ellipse` | ✅ | Visual element |
| `text` (in component) | ✅ | UI text |
| `text` (standalone description) | ❌ | Documentation only |
| `text` (header/title outside frames) | ❌ | Documentation only |

**Registry Format:**
```json
{
  "extraction_date": "2026-02-01T10:00:00Z",
  "pen_file": "design.pen",
  "total_elements": 47,
  "elements": [
    {
      "id": "E01",
      "nodeId": "pencil_node_abc123",
      "name": "NavBar",
      "type": "frame",
      "path": "Root > MainLayout > NavBar",
      "reusable": true,
      "properties": {
        "fill": "#1F2937",
        "cornerRadius": 8,
        "padding": [16, 24, 16, 24]
      },
      "code_mapping": {
        "file": "src/components/NavBar.tsx",
        "verified": false
      },
      "status": "pending"
    }
  ]
}
```

### Step 1.3: Identify Code Mappings

For each element, find corresponding code:

```javascript
// Pattern-based search
const mappings = [
  { pen_name: "NavBar", code_file: "src/components/NavBar.tsx" },
  { pen_name: "Button", code_file: "src/components/ui/Button.tsx" },
  // ... derive from .pen component names
]

// Verify each mapping exists
for (const m of mappings) {
  const exists = Glob({ pattern: `**/${m.code_file}` })
  m.verified = exists.length > 0
}
```

## Phase 2: Progressive Validation (Roller Strategy)

### Step 2.1: Initialize Progress Tracking

Create TodoWrite task list for all elements:

```markdown
## Element Sync Progress

- [ ] E01: NavBar (frame, reusable)
- [ ] E02: NavBar > Logo (ref)
- [ ] E03: NavBar > MenuItems (frame)
- [ ] E04: Button (frame, reusable)
- [ ] E05: Button > Label (text)
... (all 47 elements)
```

### Step 2.2: Validate Each Element (One by One)

**For each unchecked element:**

```markdown
### Checking E{N}: {ElementName}

**Design (.pen):**
- Type: {type}
- Properties: {properties}
- Screenshot: [captured via mcp__pencil__get_screenshot]

**Implementation:**
- File: {code_file}
- Tailwind classes: {extracted_classes}
- Screenshot: [captured via platform MCP]

**Comparison:**
| Property | .pen | Code | Match? |
|----------|------|------|--------|
| fill | #1F2937 | bg-gray-800 | ✅ |
| padding | [16,24,16,24] | p-4 px-6 | ✅ |
| cornerRadius | 8 | rounded-lg | ❌ (8px vs 12px) |

**Result:** ⚠️ 1 difference found
```

### Step 2.3: Record Result and Continue

Update progress tracking:

```markdown
## Element Sync Progress

- [x] E01: NavBar ✅ match
- [x] E02: NavBar > Logo ✅ match
- [x] E03: NavBar > MenuItems ⚠️ 1 diff
- [x] E04: Button ❌ 3 diffs
- [ ] E05: Button > Label (text)  ← CURRENT
...
```

### Step 2.4: Collect All Differences

Build diff registry as you go:

```json
{
  "validation_date": "2026-02-01",
  "total_checked": 47,
  "matches": 43,
  "differences": [
    {
      "element_id": "E03",
      "element_name": "MenuItems",
      "property": "gap",
      "pen_value": 16,
      "code_value": 12,
      "severity": "minor"
    },
    {
      "element_id": "E04",
      "element_name": "Button",
      "property": "cornerRadius",
      "pen_value": 8,
      "code_value": 12,
      "severity": "minor"
    }
  ]
}
```

## Phase 3: Batch Sync

### Step 3.1: Present Complete Diff Report

After ALL elements are checked, show summary:

```markdown
## Exhaustive Sync Report

### Summary
- Total elements: 47
- Perfect matches: 43 (91.5%)
- With differences: 4 (8.5%)

### Differences Found

| # | Element | Property | .pen | Code | Severity |
|---|---------|----------|------|------|----------|
| 1 | E03 MenuItems | gap | 16 | 12 | minor |
| 2 | E04 Button | cornerRadius | 8 | 12 | minor |
| 3 | E04 Button | fill | #2563EB | #3B82F6 | minor |
| 4 | E04 Button | fontWeight | 600 | 500 | minor |

### Sync Options

For ALL differences, choose sync direction:
1. **Design wins** - Update code to match .pen
2. **Code wins** - Update .pen to match code
3. **Review each** - Decide per-difference
```

### Step 3.2: Apply Changes (Batch)

Based on user decision:

**Design wins (batch):**
```javascript
// All code updates
Edit("src/components/MenuItems.tsx", ...)
Edit("src/components/ui/Button.tsx", ...)
```

**Code wins (batch):**
```javascript
mcp__pencil__batch_design({
  operations: `
    U("MenuItems", { gap: 12 })
    U("Button", { cornerRadius: 12, fill: "#3B82F6", fontWeight: 500 })
  `
})
```

## Phase 4: Verification

### Step 4.1: Re-validate Changed Elements

Only re-check elements that were modified:

```markdown
## Re-validation (4 elements)

- [x] E03: MenuItems ✅ now matches
- [x] E04: Button ✅ now matches
```

### Step 4.2: Final Report

```markdown
## Exhaustive Sync Complete

### Before
- Matches: 43/47 (91.5%)
- Differences: 4

### After
- Matches: 47/47 (100%)
- Differences: 0

### Changes Applied
| Element | Property | Old | New | Direction |
|---------|----------|-----|-----|-----------|
| MenuItems | gap | 12 | 16 | .pen → code |
| Button | cornerRadius | 12 | 8 | .pen → code |
| Button | fill | #3B82F6 | #2563EB | .pen → code |
| Button | fontWeight | 500 | 600 | .pen → code |

### Visual Verification
- Design (.pen): [screenshot]
- Implementation: [screenshot]
- Status: ✅ Pixel-perfect match
```

</process>

<important_rules>
## Critical Rules

1. **NEVER stop early** - Check ALL elements, even if first few match
2. **Track progress visibly** - Update TodoWrite after each element
3. **Batch changes at end** - Don't apply changes until all checked
4. **Exclude non-UI elements** - Skip description text, headers, annotations
5. **Deep traversal** - Check nested elements (Button > Label > Icon)
</important_rules>

<success_criteria>
## Success Criteria

This workflow is complete when:
- [ ] All .pen UI elements extracted into registry
- [ ] Each element checked one by one with progress tracking
- [ ] All differences documented with property-level detail
- [ ] User approved sync direction
- [ ] Changes applied in batch
- [ ] Re-validation confirms 100% match
- [ ] Final report generated with before/after comparison
</success_criteria>
