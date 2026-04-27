# Diff Algorithm Reference

How to detect differences between .pen design and code implementation.

## Property Extraction

### From .pen Design

```javascript
// Get component properties
const penProps = {
  fill: node.fill,                    // "#2563EB" or gradient object
  padding: node.padding,              // [top, right, bottom, left]
  gap: node.gap,                      // number
  cornerRadius: node.cornerRadius,    // [tl, tr, br, bl]
  fontSize: node.fontSize,            // number
  fontWeight: node.fontWeight,        // number or string
  textColor: node.textColor,          // hex color
  stroke: node.stroke,                // hex color
  strokeThickness: node.strokeThickness,
  layout: node.layout,                // "vertical" | "horizontal" | "grid"
  alignItems: node.alignItems,
  justifyContent: node.justifyContent,
  width: node.width,                  // number or "fill_container"
  height: node.height,
}
```

### From Code (Tailwind Classes)

Parse Tailwind classes to extract values:

```javascript
function parseClasses(className) {
  const classes = className.split(' ')
  const props = {}

  for (const cls of classes) {
    // Background colors
    if (cls.startsWith('bg-')) {
      props.fill = tailwindToHex(cls)
    }
    // Padding
    else if (cls.startsWith('p-')) {
      props.padding = tailwindToPx(cls, 'padding')
    }
    else if (cls.startsWith('py-') || cls.startsWith('px-')) {
      props.padding = mergePadding(props.padding, cls)
    }
    // Gap
    else if (cls.startsWith('gap-')) {
      props.gap = tailwindToPx(cls, 'gap')
    }
    // Border radius
    else if (cls.startsWith('rounded')) {
      props.cornerRadius = tailwindToRadius(cls)
    }
    // Font size
    else if (cls.startsWith('text-') && !cls.includes('text-[#')) {
      props.fontSize = tailwindToFontSize(cls)
    }
    // Font weight
    else if (cls.startsWith('font-')) {
      props.fontWeight = tailwindToFontWeight(cls)
    }
    // Layout
    else if (cls === 'flex') {
      props.layout = 'flex'
    }
    else if (cls === 'flex-col') {
      props.layout = 'vertical'
    }
    else if (cls === 'flex-row') {
      props.layout = 'horizontal'
    }
    else if (cls === 'grid') {
      props.layout = 'grid'
    }
    // Alignment
    else if (cls.startsWith('items-')) {
      props.alignItems = cls.replace('items-', '')
    }
    else if (cls.startsWith('justify-')) {
      props.justifyContent = cls.replace('justify-', '')
    }
  }

  return props
}
```

## Tailwind Value Tables

### Colors
```javascript
const tailwindColors = {
  'bg-white': '#FFFFFF',
  'bg-black': '#000000',
  'bg-blue-500': '#3B82F6',
  'bg-blue-600': '#2563EB',
  'bg-gray-100': '#F3F4F6',
  'bg-gray-200': '#E5E7EB',
  // ... extend as needed
}
```

### Spacing (gap, padding, margin)
```javascript
const tailwindSpacing = {
  '0': 0, '0.5': 2, '1': 4, '1.5': 6, '2': 8,
  '2.5': 10, '3': 12, '4': 16, '5': 20, '6': 24,
  '7': 28, '8': 32, '9': 36, '10': 40, '11': 44,
  '12': 48, '14': 56, '16': 64, '20': 80, '24': 96,
}
```

### Font Sizes
```javascript
const tailwindFontSizes = {
  'text-xs': 12,
  'text-sm': 14,
  'text-base': 16,
  'text-lg': 18,
  'text-xl': 20,
  'text-2xl': 24,
  'text-3xl': 30,
  'text-4xl': 36,
  'text-5xl': 48,
  'text-6xl': 60,
}
```

### Border Radius
```javascript
const tailwindRadius = {
  'rounded-none': [0, 0, 0, 0],
  'rounded-sm': [2, 2, 2, 2],
  'rounded': [4, 4, 4, 4],
  'rounded-md': [6, 6, 6, 6],
  'rounded-lg': [8, 8, 8, 8],
  'rounded-xl': [12, 12, 12, 12],
  'rounded-2xl': [16, 16, 16, 16],
  'rounded-3xl': [24, 24, 24, 24],
  'rounded-full': [9999, 9999, 9999, 9999],
}
```

## Diff Comparison

### Compare Function

```javascript
function compareProps(penProps, codeProps) {
  const diffs = []

  for (const key of Object.keys(penProps)) {
    const penVal = penProps[key]
    const codeVal = codeProps[key]

    if (!deepEqual(penVal, codeVal)) {
      diffs.push({
        property: key,
        design: penVal,
        code: codeVal,
        severity: getSeverity(key, penVal, codeVal)
      })
    }
  }

  return diffs
}
```

### Severity Levels

| Severity | Criteria | Examples |
|----------|----------|----------|
| **Critical** | Core brand values differ | Primary color, logo size |
| **Major** | Layout/structure differs | Padding > 8px off, layout direction |
| **Minor** | Subtle visual diff | 2px padding, slight color shade |
| **Info** | Implementation detail | Arbitrary values vs Tailwind |

```javascript
function getSeverity(property, penVal, codeVal) {
  // Critical: brand colors
  if (property === 'fill' && isBrandColor(penVal)) {
    return 'critical'
  }

  // Major: layout changes
  if (property === 'layout' || property === 'alignItems') {
    return 'major'
  }

  // Major: large spacing differences
  if (property === 'padding' || property === 'gap') {
    const diff = Math.abs(penVal - codeVal)
    if (diff > 8) return 'major'
    return 'minor'
  }

  // Minor: font weight, border radius
  return 'minor'
}
```

## Visual Diff (Screenshots)

For visual comparison when structural diff is insufficient:

1. Capture both screenshots at same dimensions
2. Overlay with difference highlighting
3. Report pixel difference percentage

```markdown
## Visual Diff Report

| Metric | Value |
|--------|-------|
| Dimensions | 1200x800 |
| Pixel diff | 3.2% |
| Regions | Header: 0%, Card: 8.5%, Footer: 0% |
```
