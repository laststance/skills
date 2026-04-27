# Test Case Taxonomy

Categories for generating Real World Scenario test cases. Each category has a purpose,
coverage target, and examples to guide test case generation.

## HAPPY — Normal User Flows

**Purpose**: Cover 99.9% of how real users actually use the feature.
**Coverage target**: Every button, form field, navigation path, and CRUD operation.

### Generation Checklist

- [ ] Every button in the UI has at least one test case that clicks it
- [ ] Every form can be submitted with valid data
- [ ] Every dropdown/select has its options exercised
- [ ] Every navigation path (forward and back) is tested
- [ ] Every success state (toast, redirect, data update) is verified
- [ ] Every API endpoint involved is triggered at least once

### Examples

| Pattern | Test Case |
|---------|-----------|
| Create | Fill form → submit → verify created |
| Read | Navigate to list → verify data displayed |
| Update | Open edit → change field → save → verify updated |
| Delete | Select item → delete → confirm → verify removed |
| Upload | Select file → upload → verify processed |
| Navigation | Click breadcrumb/tab/link → verify destination |

---

## EDGE — Boundary & Special Cases

**Purpose**: Catch bugs at the boundaries of valid input and unusual-but-valid states.

### Generation Checklist

- [ ] Empty state: what happens with zero items?
- [ ] Single item: minimum viable data
- [ ] Maximum: longest string, most items, largest file
- [ ] Special characters: unicode, emoji, HTML entities in text fields
- [ ] Boundary values: exactly at limit (e.g., max pages, max file size)
- [ ] Permission boundaries: what if user lacks permission for this action?
- [ ] Concurrent state: what if data changed while modal was open?

### Examples

| Pattern | Test Case |
|---------|-----------|
| Empty list | Open page with no data → verify empty state message |
| Max length | Enter 256-char filename → verify truncation/error |
| Single page PDF | Open split modal for 1-page file → verify no split option |
| Special chars | File named `テスト (1).pdf` → verify display and processing |
| Disabled state | All items deleted → verify submit disabled |

---

## EXHAUSTIVE — TC3-Style Overkill Testing

**Purpose**: Test combinations, repetitions, and unexpected operation sequences that
real users stumble into but developers never think to test. This is the "suspicious
teenager" category — what happens if you mash every button?

### Generation Checklist

- [ ] **All-action then undo**: Apply all → undo all → verify clean state
- [ ] **Repeated operation**: Do the same action 5x rapidly → verify no duplication
- [ ] **Combo operation**: Apply 3+ different actions to the same item → verify all applied
- [ ] **Cancel after changes**: Make changes → cancel → reopen → verify changes discarded
- [ ] **Full cycle**: Rotate 360° → verify return to original state
- [ ] **Interleaved operations**: Delete page 2, split at page 3, rotate page 1 → verify layout correct
- [ ] **Undo after dependent action**: Delete page (which resets split) → undo delete → verify split NOT restored
- [ ] **Max then beyond**: Fill to capacity → try one more → verify graceful handling
- [ ] **Rapid state toggling**: Enable/disable/enable/disable rapidly → verify final state correct

### Examples

| Pattern | Test Case |
|---------|-----------|
| All-delete→submit | Delete every page → verify submit button disabled |
| Split-all→reset→partial | Split all → reset all → split only some → verify state |
| Rotate 360° | Rotate same item 4x (90° each) → verify back to original |
| Cancel discards | Make complex changes → cancel → reopen → verify no changes persisted |
| Combo on single item | Split + rotate + change category on same page → verify all applied |
| Undo side effects | Delete resets rotation/split → undo delete → rotation/split stay reset |

---

## REGRESSION — Diff-Based Testing

**Purpose**: Test the specific code paths that changed in this branch to catch regressions.

### Generation Method

1. Get changed files: `git diff <base>..HEAD --name-only`
2. For each changed component:
   - Read the diff to understand what changed
   - Generate test cases that exercise the changed logic
   - If a bug was fixed, generate a test that would have caught the original bug

### Examples

| Trigger | Test Case |
|---------|-----------|
| Changed disabled condition | Verify button disabled/enabled at each threshold |
| Modified API payload | Submit form → inspect network request matches expected |
| New validation rule | Test valid input passes, invalid input shows error |
| Fixed null handling | Submit with missing optional field → no crash |

---

## STATE — Multi-Iteration Tests

**Purpose**: Designed to catch bugs that only appear when data from previous iterations
exists. These tests are specifically crafted to be sensitive to accumulated state.

### Generation Checklist

- [ ] **Duplicate creation**: Create same item twice → verify duplicate handling
- [ ] **Data persistence**: Create in iter 1, verify still exists in iter 2
- [ ] **List growth**: Items from all iterations visible → verify pagination/scroll
- [ ] **Cache staleness**: Update in iter 2 → verify no stale data from iter 1 cache
- [ ] **ID conflicts**: Delete and recreate → verify new ID, no ghost references
- [ ] **Accumulated side effects**: Each iteration adds data → verify performance stable

### Examples

| Pattern | Test Case |
|---------|-----------|
| Duplicate check | Upload same file twice → verify rejection or versioning |
| Ghost reference | Delete file → navigate to bookmark → verify 404 handling |
| List overflow | After 3 iterations of creating items → verify scroll/pagination |
| Stale cache | Edit item in iter 2 → navigate away and back → verify latest data |

---

## DESIGN -- Visual & UI Compliance

**Purpose**: Verify that the implemented UI matches the design reference (Figma, design spec,
or industry guidelines). Catches visual regressions, spacing inconsistencies, color mismatches,
and accessibility violations.

**Reference sources** (priority cascade):
1. Figma URL (via Figma Desktop MCP for screenshot comparison)
2. User-provided design spec (image or document)
3. Apple HIG / industry standard guidelines (fallback)

### Generation Checklist

- [ ] Color accuracy: buttons, backgrounds, text colors match reference
- [ ] Spacing: margins, padding follow 4/8 grid system
- [ ] Typography: font size, weight, line-height match design
- [ ] Element presence: all designed elements exist in implementation
- [ ] Interactive feedback: hover, focus, active states visible
- [ ] Tap target size: >= 44x44px for interactive elements
- [ ] Contrast ratio: WCAG 2.2 AA+ (4.5:1 text, 3:1 large text)
- [ ] Corner radius: consistent with design system (4/8/12/20px)
- [ ] Responsive behavior: layout adapts correctly at breakpoints
- [ ] Dark/light mode: colors adapt if theme support exists

### Severity Levels

| Severity | Criteria | Example |
|----------|----------|---------|
| critical | Functional impact or major visual deviation | Wrong color on CTA button, missing element |
| minor | Noticeable but not blocking | 2px spacing difference, slightly wrong font weight |
| acceptable | Within tolerance or subjective | Minor shadow difference, 1px alignment offset |

### Examples

| Pattern | Test Case |
|---------|-----------|
| Color match | Primary button background matches Figma hex value |
| Spacing grid | Card margins are multiples of 8px |
| Tap area | All buttons/links have >= 44x44px clickable area |
| Contrast | Text on colored backgrounds meets WCAG AA ratio |
| Element presence | All icons, labels, dividers from design exist |
| Responsive | Layout switches from 2-column to 1-column at mobile breakpoint |
