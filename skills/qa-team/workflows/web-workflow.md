# Web Platform QA Workflow

## Prerequisites

| Check | Command | Expected |
|-------|---------|----------|
| Dev server running | `curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>` | 200 |
| Chrome MCP connected | `mcp__claude-in-chrome__tabs_context_mcp` | Tab info returned |
| claudedocs/qa/ exists | `mkdir -p claudedocs/qa/screenshots` | Directory ready |

## MCP Tools

| Purpose | Primary Tool | Fallback |
|---------|-------------|----------|
| Navigate | `mcp__claude-in-chrome__navigate` | `mcp__plugin_playwright_playwright__browser_navigate` |
| Click | `mcp__claude-in-chrome__click` | `mcp__plugin_playwright_playwright__browser_click` |
| Type | `mcp__claude-in-chrome__form_input` | `mcp__plugin_playwright_playwright__browser_fill_form` |
| Screenshot | `mcp__claude-in-chrome__computer` (screenshot) | `mcp__plugin_playwright_playwright__browser_take_screenshot` |
| Read page | `mcp__claude-in-chrome__read_page` | `mcp__plugin_playwright_playwright__browser_snapshot` |

## Per-Perspective Workflow

### Visual Tester

1. Navigate to each page/route
2. Screenshot at 4 breakpoints: 320px, 768px, 1024px, 1440px
   - Use `mcp__claude-in-chrome__resize_window` for each
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

### HIG Tester

1. For each page, inspect:
   - Typography: Use browser DevTools via `mcp__claude-in-chrome__javascript_tool` to check computed font sizes
   - Tap areas: Query element bounding boxes for 44px minimum
   - Colors: Extract computed colors and verify WCAG AA contrast ratios
   - Spacing: Verify 4/8 grid adherence via computed margins/padding
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
