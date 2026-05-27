# Design-system criteria — DESIGN.md as the project-aware baseline

A baseline-free linter still gets a free baseline when the project ships a written design
contract. This file turns a project's `DESIGN.md` into **perceptual checks** the v1 VLM
pass can apply.

## Ingestion rule (project-aware vs generic)

- **Detect `./DESIGN.md`** in the target project at Phase 0.
- **Present →** fold the rules below into the rubric and cite them in findings ("DESIGN.md
  § Depth and Elevation: resting cards get no shadow"). Note "project-aware mode" in the
  report header.
- **Absent →** skip the project-specific rows and run the generic `defect-rubric.md`
  only. Note "generic mode" in the header. Never fail because there's no DESIGN.md.

> The concrete values below are extracted from **skills-desktop's** `DESIGN.md`. For a
> *different* project, re-read its DESIGN.md and substitute its tokens — the *structure*
> of the checks carries over, the *values* don't.

## v1 perceptual vs v2 deterministic — the boundary

A rule belongs to **v1 (perceptual, this skill)** if a human can see the violation
without a ruler. It belongs to **v2 (deterministic, future Hybrid)** if confirming it
needs `getComputedStyle`/`getBoundingClientRect` and an exact comparison. v1 *flags*
the borderline ones; v2 *measures* them. Per `anti-false-positive.md` rule 6, v1 never
asserts the number.

| DESIGN.md rule | Rubric tie-in | v1 perceptual check | v2 measures |
|----------------|---------------|---------------------|-------------|
| **Typography** — Inter for UI; JetBrains Mono *only* for paths/code/commands | A6 | Flag mono in a prose label, or sans in a file-path/code cell. Flag hero-scale type inside the app shell (DESIGN.md: "no hero-scale type"). | exact font-family/size |
| **Letter-spacing 0** unless matching a local pattern | A6 | — (not perceptual) | letter-spacing value |
| **Tabular numbers** for counts/ratios | A7, C2 | Flag misaligned digit columns in a numeric list. | font-variant-numeric |
| **Spacing** — 4px grid (4/8/12/16/24) | C3, C4 | Flag *visibly* uneven gaps in repeated items. A 1–2px judgment call → "borderline". | exact px vs grid |
| **Radius** — 6px dense / 8px card / 8–12px dialog; circular for swatches; no 16–24px in operational panels; pills only for filters/chips/swatches | C, D | Flag a pill where it shouldn't be, or a too-round operational panel. | exact border-radius |
| **Elevation** — resting cards get **border + surface color, NOT shadow**; soft shadow only for floating UI (popover/dialog); **no hover-lift on dense rows** | F2, E6 | Flag a resting card/row with a drop shadow, or a row that lifts/shadows on hover. *(High-value perceptual check.)* | box-shadow presence |
| **Status colors theme-invariant** — linked/valid = green (H≈155°), destructive = red (H≈25°); must **survive the neutral theme** (never collapse to gray, never follow the accent hue) | E3, E4 | In the neutral/preset themes, flag a status indicator that has gone gray or taken the accent color. *(The neutral theme is the key stress test.)* | exact OKLCH hue |
| **No color-only signals** — pair color with text/icon/position | E5 | Flag a state shown by color alone. | — |
| **Low-chroma surfaces, high-chroma accents**; no new palette outside the OKLCH tokens | E3, E6 | Flag an obviously off-palette color (a raw saturated hex amid the muted UI). | hex vs token set |
| **Target size** — standalone icon buttons need a 44×44px target (`MIN_TOUCH_TARGET_PX`) | D3 | Flag an icon button that *looks* tiny/cramped. | exact hit-rect |
| **Contrast** — 4.5:1 text, 3:1 UI | E1 | Flag text/UI that *appears* hard to read. Say "appears low-contrast"; never assert a ratio. | exact ratio (axe-core) |
| **Row heights** 36–44px, consistent; **button heights** 28–36px by tier; stable toolbar/counter/tab/widget dimensions | D4 | Flag rows/buttons of the *same* type at visibly different heights, or a control that resizes on hover/active. | exact heights |
| **Motion** — 100–350ms, `cubic-bezier(0.4,0,0.2,1)`; no bouncy easing; no decorative/background movement; toasts don't shift as timers update; `prefers-reduced-motion` honored | F4 | Flag a layout shift during loading or a toast that reflows as it counts down. Motion needs before/after frames. | duration/easing |
| **Scroll areas** — explicit bottom spacing so content isn't clipped at the fold | B3 | Flag the last row hugging/clipped at a scroll-area bottom. | bottom padding |
| **No nested cards; no marketing hero/gradients/orbs in the app shell** | E6, D2 | Flag a card inside a card, or decorative gradient/glow in the operational UI. | — |
| **Text must not overlap** icons/counters/badges/adjacent actions (desktop-first, narrow widths) | A5, B2 | Flag any such overlap, especially at narrow window widths. | bbox intersection |

## How to use this in Phase 3

After the generic `defect-rubric.md` pass, walk this table for the captured states and
add project-cited findings. The **highest-yield perceptual project checks** (a VLM
catches these reliably and they matter):

1. **Resting shadow / hover-lift** on cards and dense rows (Elevation).
2. **Status color drift in the neutral theme** (gray collapse or accent-follow) — capture
   a neutral-theme shot if the app exposes theme controls.
3. **Mono/sans misuse** and hero-scale type in the app shell (Typography).
4. **Text overlapping icons/badges** at narrow widths (Layout).

Leave the measurable rows (exact spacing, exact contrast, exact heights) as borderline
flags for v2 — do not fabricate measurements.
