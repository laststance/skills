# Merge Strategies Reference

How to resolve conflicts when design and code differ.

## Strategy Types

### 1. Design Wins (pencil-first)

Use when:
- Design is source of truth
- Recent design review completed
- Brand/visual consistency is priority
- Code drifted from approved design

**Action:** Update code to match .pen

```javascript
// Update Tailwind classes to match .pen values
Edit({
  file_path: "src/components/Button.tsx",
  old_string: 'bg-blue-500 py-2 px-4 rounded',
  new_string: 'bg-blue-600 py-3 px-6 rounded-lg'
})
```

### 2. Code Wins (code-first)

Use when:
- Accessibility improvements in code
- Performance optimizations applied
- Bug fixes changed implementation
- Design needs to catch up

**Action:** Update .pen to match code

```javascript
mcp__pencil__batch_design({
  operations: `
    U("ButtonDef", {
      fill: "#3B82F6",
      padding: [8, 16, 8, 16],
      cornerRadius: [4, 4, 4, 4]
    })
  `
})
```

### 3. Manual Merge (best of both)

Use when:
- Both have valid improvements
- Need hybrid approach
- Specific value preferred

**Action:** User specifies exact value

```markdown
## Manual Merge Decision

**Property:** Button padding

| Source | Value | Reasoning |
|--------|-------|-----------|
| Design | 24px | More spacious, modern look |
| Code | 16px | Better for dense UIs |
| **Decision** | 20px | Compromise |

Apply 20px to both design and code.
```

### 4. Property-Level Merge

For complex components, merge at property level:

```markdown
## Component: Card

| Property | Design | Code | Resolution |
|----------|--------|------|------------|
| padding | 24px | 16px | Design (24px) |
| cornerRadius | 8px | 12px | Code (12px) |
| shadow | none | md | Code (md) |
| background | #FFF | #FAFAFA | Manual (#F9FAFB) |
```

## Conflict Resolution Flow

```
┌─────────────────────────────────────────┐
│         Difference Detected             │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│   Is this a Critical/Brand property?    │
└─────────────────┬───────────────────────┘
          Yes     │     No
          ▼       │     ▼
┌─────────────────┴───────────────────────┐
│ Design Wins     │ Check code intent     │
│ (brand          │                       │
│ consistency)    │                       │
└─────────────────┴───────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────┐
│  Was code change intentional (commit)?  │
└─────────────────┬───────────────────────┘
          Yes     │     No
          ▼       │     ▼
┌─────────────────┴───────────────────────┐
│ Code Wins       │ Design Wins           │
│ (intentional    │ (likely drift)        │
│ improvement)    │                       │
└─────────────────┴───────────────────────┘
```

## Batch Operations

### Sync Multiple Components

```javascript
// Collect all updates first
const updates = []

for (const diff of diffs) {
  if (diff.resolution === 'design') {
    // Code update needed
    codeUpdates.push(generateCodeUpdate(diff))
  } else if (diff.resolution === 'code') {
    // .pen update needed
    updates.push(`U("${diff.nodeId}", { ${diff.property}: ${diff.codeValue} })`)
  }
}

// Apply all .pen updates in one batch
mcp__pencil__batch_design({
  operations: updates.join('\n')
})
```

## User Prompts

### Quick Selection

```markdown
**Button color differs:**
- Design: `#2563EB` (darker)
- Code: `#3B82F6` (lighter)

Quick action: [D]esign | [C]ode | [M]anual | [S]kip
```

### Batch Approval

```markdown
## Sync Summary

**12 differences found**

| # | Component | Property | Recommendation |
|---|-----------|----------|----------------|
| 1 | Button | color | Design |
| 2 | Card | padding | Code |
| 3 | Modal | radius | Design |
| ... | ... | ... | ... |

Apply all recommendations? [Y]es | [N]o, review each
```

## Edge Cases

### Missing on One Side

| Scenario | Action |
|----------|--------|
| In .pen, not in code | Generate code from .pen |
| In code, not in .pen | Add to .pen from code |
| Neither wants it | Remove from both |

### Incompatible Values

When values can't be directly mapped:

```markdown
**Design uses gradient, code uses solid color**

Options:
1. Convert gradient to primary color for code
2. Add gradient support to code
3. Change design to solid color
4. Keep both (accept visual difference)
```

### Theme Token Conflicts

```markdown
**Design uses CSS variable, code uses hardcoded**

Design: `var(--color-primary)`
Code: `#2563EB`

Resolution:
- If values match: Change code to use variable
- If values differ: Update variable definition
```

## Post-Merge Validation

Always verify after merge:

1. **Visual check** - Screenshot both, compare
2. **Functionality check** - Test interactions
3. **Responsive check** - Multiple viewport sizes
4. **Theme check** - Light/dark mode
