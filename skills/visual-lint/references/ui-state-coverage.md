# UI state coverage — which states to capture

Display defects hide in **states**, not just the resting view. The `83% / 15px` wrap
only shows when the value is wide enough; a modal's edge-clip only shows when the modal
is open. So `/visual-lint` must reach states, not just screenshot what loads first.

This is the axis where visual-lint is **orthogonal to functional QA**: `/qa-electron`
asks "does opening the modal work?"; visual-lint asks "once open, does it *render*
correctly?".

## v1 (MVP) scope — keep it lean

Capture exactly this, no more:

1. **Default-state full-window pass** — *always*. The screen as it first renders, at the
   default window size.
2. **The five operation-path states** — *where each is reachable on the screen*:
   **modal · context-menu · drag · scroll · hover**. These are the interaction states
   the user explicitly called out as easy to miss because they need a specific action to
   appear.

The full six-axis combinatorial matrix (viewport × theme × content-fullness ×
interaction × async × overlay) is **v2 expansion** — documented in the appendix below
as a roadmap, **not** a v1 runtime instruction. Do not attempt full coverage in v1.

## State-derivation procedure (trimmed)

For each in-scope screen, derive its state plan from the accessibility tree — don't
guess:

1. `playwright-cli --s=default snapshot` — read the a11y tree (roles + `eN` refs).
2. **Interaction candidates:** elements with `button`, `link`, `menuitem`, `option`,
   `tab`, `row`, `gridcell` roles → hover targets; anything that opens something →
   overlay trigger.
3. **Overlay triggers:** buttons/menus that open a dialog, popover, dropdown, or context
   menu → modal / context-menu paths.
4. **Lists / repeaters:** any list, grid, or repeated-row region → a scroll path (and a
   cross-instance alignment check per `defect-rubric.md` C/D4).
5. **Drag affordances:** reorderable rows, draggable widgets, sliders, kanban-style
   regions → a drag path.
6. **Present the plan before capturing.** Emit a short table (below) so the run is
   auditable, then execute it. *(qa-electron convention.)*

### Per-screen state plan table (present before Phase 2 capture)

| Screen | State | How to reach | Capture | Rubric focus |
|--------|-------|--------------|---------|--------------|
| Appearance | default | loads on open | `appearance-default.png` | A, B, C, E |
| Appearance | hover (slider) | `hover e7` | `appearance-hover.png` | F2 |
| Skill list | scroll (bottom) | `mousewheel 0 800` | `skilllist-scroll-bottom.png` | B3, B4 |
| Skill row | context-menu | `click e12 right` | `skillrow-contextmenu.png` | F9, A, B |
| … | … | … | … | … |

## Operation-path recipes

Each recipe: when it applies → how to reach it → what to capture → which `defect-rubric.md`
F-item to check. Re-`snapshot` after every mutating action (`eN` refs go stale).

### Hover
- **Applies:** any interactive element (rows, buttons, tabs, chips).
- **Reach:** `playwright-cli --s=default hover e5`
- **Capture:** screenshot the element/region while hovered.
- **Check:** **F2** — hover clarifies via *tint*, never lift/scale/shadow on dense rows.
  Also re-check A/B in case the hover state introduces a wider label that now wraps.

### Context-menu
- **Applies:** rows/items with a right-click menu.
- **Reach:** `playwright-cli --s=default click e12 right` *(right-button click)*, then
  `snapshot` to capture the opened menu's refs.
- **Capture:** screenshot with the menu open.
- **Check:** **F9** — menu sits above content with correct elevation/z-order, not clipped
  at a screen edge; menu item labels not truncated (A2) and rows not overflowing (B1).
- **Dismiss:** `playwright-cli --s=default press Escape`.

### Drag
- **Applies:** reorderable rows, draggable dashboard widgets, kanban columns.
- **Reach:** `playwright-cli --s=default drag e5 e9` (start → end ref). For files/data
  onto a drop zone: `drop <target>`. For mid-drag inspection, use
  `mousedown`/`mousemove <x> <y>`/`mouseup` to pause and screenshot the drag-ghost.
- **Capture:** screenshot mid-drag (ghost/placeholder) and after drop.
- **Check:** **F9** drag-ghost renders correctly and isn't clipped; **B2** the
  placeholder doesn't collide with siblings; after drop, layout settles without overlap.

### Scroll
- **Applies:** any list, grid, long panel, or scroll area.
- **Reach:** `playwright-cli --s=default mousewheel 0 800` (scroll down 800px); or
  `press PageDown` / `press End`; or `eval "el => el.scrollIntoView()" e30` to reach a
  specific element.
- **Capture:** screenshots at top, mid, and **bottom** of the scroll.
- **Check:** **B3** bottom row isn't clipped/hugging the fold (DESIGN.md wants explicit
  bottom spacing in scroll areas); **B4/B5** scrollbar present iff needed; sticky
  headers/footers don't overlap content while scrolling.

### Modal / dialog
- **Applies:** anything that opens a dialog, sheet, or popover.
- **Reach:** `playwright-cli --s=default click e5` (the trigger), then `snapshot`. For a
  *native* dialog use `dialog-accept` / `dialog-dismiss`.
- **Capture:** screenshot with the modal open (and the backdrop).
- **Check:** **F9** modal centered (C5) with strongest elevation; **B** content fits
  (title/body/buttons not clipped or wrapping); backdrop covers the surface; not clipped
  at a viewport edge on a small window.
- **Dismiss:** `playwright-cli --s=default press Escape`.

---

## Appendix — v2 expansion (roadmap, NOT a v1 runtime instruction)

When visual-lint graduates to a deeper pass, expand from the five op-paths to the full
**six-axis state matrix**, trimmed to avoid combinatorial explosion:

1. **Viewport / window:** min (≈800×600 via `resize 800 600`) · default · wide · narrow.
2. **Theme:** dark (default) · light · each preset · neutral (the status-color stress
   test — see `design-system-criteria.md` E4).
3. **Content fullness:** empty · 1 item · typical · **overflow** *(the calibration bug's
   home)* · boundary values.
4. **Interaction:** resting · hover · focus · active · selected · disabled.
5. **Async:** loading · loaded · error · offline · stale.
6. **Overlay:** dialog · popover · tooltip · mid-drag · mid-scroll · context-menu.

**Trim rule for v2:** a baseline grid (every screen at default × dark × typical ×
resting) + single-axis sweeps + a few high-yield 2-axis pairs (**size:min ×
content:overflow** = the wrap bug's home; theme:neutral × status; theme:light ×
hard-coded color). Evaluate interaction/overlay states **once per component *type***, not
per instance. v2 also adds the deterministic `getComputedStyle`/`getBoundingClientRect`
+ `axe-core` + DESIGN.md token-diff pre-pass that turns the perceptual flags in
`defect-rubric.md` (C4 off-grid, D3 target-size, E1 contrast) into measured pass/fail.
