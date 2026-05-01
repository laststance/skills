# Web Platform QA Workflow

## Prerequisites

| Check | Command | Expected |
|-------|---------|----------|
| Dev server running | `curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>` | 200 |
| `playwright-cli` available | `which playwright-cli && playwright-cli --version` | Path + version |
| claudedocs/qa/ exists | `mkdir -p claudedocs/qa/screenshots` | Directory ready |

**Before any browser interaction**: invoke `/dnd` to load the drag-and-drop
verification protocol. Ref-based `drag` reports false success on `dnd-kit` and
similar libraries — load preemptively even when DnD is not yet known to be
involved.

## `playwright-cli` Commands

| Purpose | Command |
|---------|---------|
| Launch headed browser | `playwright-cli open <url> --headed` |
| Navigate | `playwright-cli navigate <url>` |
| Get refs / a11y tree | `playwright-cli snapshot` |
| Click | `playwright-cli click <ref>` |
| Fill input | `playwright-cli fill <ref> "<value>"` |
| Press key | `playwright-cli press <Key>` |
| Screenshot | `playwright-cli screenshot --filename=<path>` |
| Run JS | `playwright-cli eval "<expr>"` |
| Console errors | `playwright-cli console error` |
| Resize viewport | `playwright-cli resize <w> <h>` |
| Save / load auth | `playwright-cli state-save <path>` / `state-load <path>` |

Re-snapshot after any DOM mutation — refs are valid only for the most recent
snapshot.

## Per-Perspective Workflow

### Visual Tester

1. Navigate to each page/route (`playwright-cli navigate`)
2. Screenshot at 4 breakpoints: 320px, 768px, 1024px, 1440px
   - Use `playwright-cli resize <w> <h>` between captures
3. Apply RALPH protocol (Triple-Criteria gate at 95%)
4. Name: `visual_<page>_<breakpoint>.png`
5. Check Dark mode if supported (toggle, re-screenshot)

### Functional Tester

1. Enumerate all routes/pages from router config
2. For each CRUD operation:
   - Phase 1: Execute operation, screenshot direct result
   - Phase 2: Plan impact areas (min 3 per CRUD)
   - Phase 3: Navigate to each impact area, screenshot
   - Phase 4: Verify all pass
3. Name: `func_<flow>_direct_<step>.png`, `func_<flow>_impact_<loc>.png`
4. **Drag-and-drop flows**: follow the `/dnd` coordinate-based protocol — do
   not trust ref-based `drag` success.

### HIG Tester

1. For each page, inspect:
   - Typography: `playwright-cli eval "..."` to read computed font sizes
   - Tap areas: query bounding boxes for 44px minimum
   - Colors: extract computed colors and verify WCAG AA contrast ratios
   - Spacing: verify 4/8 grid adherence via computed margins/padding
2. Screenshot evidence: `hig_<page>_<check>.png`

### Edge Case Tester

1. Identify all input fields via page snapshot
2. For each field, test:
   - Empty input → validation message
   - Very long input (1000+ chars) → no overflow
   - Unicode: emoji, CJK, RTL text
   - XSS: `<script>alert(1)</script>`
3. For data lists:
   - Navigate with 0 records (empty state)
   - Create 100+ records via form/API
   - Verify pagination/scroll, no clipping
4. Screenshot: `edge_<category>_<scenario>.png`

### UX Tester

1. Slow scroll through each page, look for:
   - Color contrast issues (dark-on-dark, low contrast states)
   - Missing feedback (no toast, no loading)
   - Inconsistent patterns (mixed button styles, alignment drift)
2. Apply PH Visual axis scoring (V1-V5)
3. Screenshot issues: `ux_<issue>_<page>.png`
