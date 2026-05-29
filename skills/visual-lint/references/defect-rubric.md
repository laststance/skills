# Defect rubric — what to look for

This is the core detection rubric. Each item below is a **direct verification prompt**:
read it, look at the screenshot, and answer it. Apply it under the process rules in
`anti-false-positive.md` (read that first — it governs how you turn an observation into
a finding without hallucinating).

## The finding scaffold (every finding MUST have all 5 fields)

```
- element:            <quote the visible text + name the screen region; e.g.
                       "the `83% / 15px` readout at the right end of the Opacity / Blur slider row">
- defect:             <one sentence: what is wrong>
- expected_vs_actual: <what it should look like vs what it does, with an inferable
                       reason; e.g. "neighboring readouts all sit on one line, so this
                       one is intended single-line; it renders on two → its container is
                       narrower than its content">
- severity:           <3 | 2 | 1>
- confidence:         <high | med | low>
```

**Severity scale:**
- **3 — information-hiding / readability-breaking.** Content is hidden, unreadable, or
  the layout is broken enough to block use. (Truncated text the user needs, overlapping
  text, content clipped off-screen, invisible text.)
- **2 — clearly wrong but usable.** An obvious render defect a careful user notices and
  that looks unintentional. (The `83% / 15px` wrap is severity 2.)
- **1 — cosmetic / polish.** A small inconsistency that doesn't impair use.

**Confidence:** `high` = the screenshot plainly shows it. `med` = likely but the pixels
are ambiguous. `low` = suspected only — **phrase the finding as a question**, never an
assertion (see anti-false-positive rule 5). If a claim is *measurable* (an exact
ratio, an exact pixel offset), do not assert a number — mark it "borderline, needs
measurement" (v2 deterministic layer will measure it).

---

## A. Text rendering

- **A1 — Unintended wrap.** Does any label, value, or button text wrap to a second line
  where the design clearly intends one line? *(The calibration bug: `83% / 15px` on two
  lines.)* Tell intent from neighbors: if sibling readouts are one line, this one is too.
- **A2 — Truncation of text that should be full.** Is text cut with `…` (or hard-cut)
  where the full string matters and there was room, or where the container should have
  grown/wrapped? (Distinguish from *intended* truncation — a long path in a fixed cell
  is fine; a truncated button verb is not.)
- **A3 — Clipping without ellipsis.** Is text sliced mid-glyph at a container edge with
  no ellipsis and no scroll — i.e. silently lost? *(The clipping fixture: a `100%` card
  value with its top sliced off at the card edge.)*
- **A4 — Orphan / widow.** Does a single word or character drop alone onto its own line,
  or a heading's last word strand awkwardly?
- **A5 — Text overlap.** Does text overlap other text, an icon, a control, or a border?
- **A6 — Glyph corruption.** Tofu boxes (□), mojibake, the wrong font family (e.g. a UI
  label rendered in mono), or a missing icon glyph.
- **A7 — Number + unit integrity.** Do a value, its separator, and its unit stay on one
  line and read as one token (`83% / 15px`, `1,024 KB`, `3 / 12`)? A unit orphaned onto
  the next line is a defect even if technically "wrapped, not clipped".

## B. Containment *(the structural home of the calibration bug)*

**Core assertion — apply to every container in the shot:** *does this container's
content fit inside it without (a) wrapping unintentionally, (b) clipping, (c) overlapping
a sibling, or (d) producing an unwanted scrollbar?* If any of those, it's a containment
defect.

- **B1 — Container overflow.** Content visibly exceeds its box (spills past the border /
  background / rounded corner).
- **B2 — Element collision.** Two siblings that should be spaced overlap or touch.
- **B3 — Edge cut-off.** Content is sliced at a panel or viewport edge — especially the
  *bottom* of a scroll area (DESIGN.md asks for explicit bottom spacing in scroll areas;
  flag the last row hugging/clipped at the fold).
- **B4 — Unwanted scrollbar.** A scrollbar appears where content should have fit (a few
  px overflow), signalling a sizing mistake.
- **B5 — Missing scrollbar.** Content clearly extends beyond the viewport but there's no
  way to reach it (no scroll affordance).

## C. Alignment & spacing

- **C1 — Edge misalignment.** Elements that should share a left/right/top edge don't
  (a label baseline-left that's a few px off its siblings).
- **C2 — Baseline misalignment.** Text in a row sits on visibly different baselines
  (e.g. a number and its label not vertically centered together).
- **C3 — Uneven gaps.** Repeated items (list rows, toolbar buttons, chips) have visibly
  unequal spacing between them.
- **C4 — Off-grid.** Spacing that visibly breaks the 4px grid rhythm (a 13px pad among
  8/12/16). *Perceptual only in v1 — if it's a 1–2px judgment call, mark borderline.*
- **C5 — Centering failure.** Something meant to be centered (icon in a button, text in
  a chip, a modal in the viewport) sits visibly off-center.
- **C6 — Asymmetric margins.** A symmetric layout has visibly unequal margins on the two
  sides (left padding ≠ right padding on a centered panel).

## D. Size & proportion

- **D1 — Image distortion.** A logo/avatar/thumbnail is squished or stretched (wrong
  aspect ratio).
- **D2 — Disproportionate scale.** An element is jarringly over- or under-sized for its
  role (an icon dwarfing its label; a giant heading in a dense panel).
- **D3 — Tap target too small.** An interactive control's hit area looks below the
  minimum (DESIGN.md: standalone icon buttons need a 44×44px target). *Perceptual flag;
  exact measurement is v2.*
- **D4 — Inconsistent sizing.** Instances of the *same* component render at different
  sizes in the same view (two cards of differing height with equal content; rows of
  varying height).
- **D5 — Collapsed dimension.** An element rendered at zero/near-zero width or height
  (an empty bar, a collapsed cell) where it should have size.

## E. Color & contrast

- **E1 — Insufficient contrast.** Text or an essential UI element looks too low-contrast
  to read comfortably (DESIGN.md baseline: 4.5:1 text, 3:1 UI). *Report as "appears
  low-contrast — needs measurement"; don't assert a ratio.*
- **E2 — Invisible / near-invisible.** Text the same (or nearly the same) color as its
  background — effectively gone.
- **E3 — Theme token error / mode bleed.** A light-mode color leaking into dark mode (or
  vice-versa): a white card on a dark canvas, a hard-coded color that ignores the theme.
- **E4 — Status-color integrity.** Status colors must stay semantic and theme-invariant:
  linked/valid stays green, destructive stays red, **even in neutral themes** (they must
  *not* collapse to gray and must *not* follow the accent hue). Flag any status signal
  that has drifted to the theme color or gone gray.
- **E5 — Color-only signal.** State conveyed by color alone with no text/icon/position
  backup (a red dot with no label) — fails for color-blind users.
- **E6 — Surface indistinct.** Two surfaces that should read as distinct layers
  (card vs background, popover vs panel) are indistinguishable; or visible color banding.

## F. State-specific *(reached via `ui-state-coverage.md` operation paths)*

Only evaluate these for states you actually captured. Per component *type*, once.

- **F1 — Focus.** Is there a visible focus ring on keyboard focus? (DESIGN.md: never
  remove the outline without a visible replacement.)
- **F2 — Hover.** Hover clarifies clickability via tint — **not** by lifting/scaling. A
  dense row that grows or casts a shadow on hover is a defect.
- **F3 — Active/pressed.** Does the pressed state read distinctly without breaking layout?
- **F4 — Loading.** Does the loading→loaded transition cause a layout shift (content
  jumping as a spinner is replaced)? Compare before/after frames.
- **F5 — Empty.** Empty states are calm and informative, not a broken-looking blank or a
  noisy placeholder.
- **F6 — Error.** Error states are legible and contained (not overflowing, not clipped).
- **F7 — Selected.** Selected reads with *stronger* contrast than hover (DESIGN.md), and
  the two are distinguishable.
- **F8 — Disabled.** Disabled is visibly de-emphasized but its label still legible.
- **F9 — Overlay.** Dialogs/popovers/menus/tooltips/drag-ghosts sit above their trigger
  with correct elevation and z-order, are not clipped at a screen edge, and don't overlap
  the wrong content.

---

## Coverage discipline

Walk **every** category A–F for each captured state and explicitly record "no defect
found" per category you clear — do not stop at the first hit, and do not chase a fixed
count. (See anti-false-positive rule 7: enumeration, not quota.)
