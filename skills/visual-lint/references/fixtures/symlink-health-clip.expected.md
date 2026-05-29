# Calibration fixture — expected finding

**Fixture:** `symlink-health-clip.png` — a "Symlink Health" status card. The large
`100%` health value sits at the top-right of the card body, but its top is **sliced off
by the card's content edge**: the upper ~40% of the `100%` glyphs is missing, so the
digits render as flat-topped stubs with no ellipsis and no scroll affordance.

This is the **clipping** calibration anchor — the companion to
`opacity-blur-wrap.png` (which anchors *wrapping*). It exercises rubric **A3**
(clip without ellipsis), **B1** (container overflow), and **B3** (edge cut-off). When
you edit the rubric (`defect-rubric.md` / `anti-false-positive.md` /
`design-system-criteria.md`), run the rubric once against this PNG and confirm it still
produces the finding below. A rubric edit that stops catching this is a regression.

## Expected finding (must be emitted)

```
- element:            the large `100%` health value at the top-right of the
                      "Symlink Health" card body
- defect:             the top of the `100%` value is clipped — the upper portion of the
                      digits is sliced off at the card's content edge, with no ellipsis
                      and no scroll
- expected_vs_actual: a headline metric should sit fully inside its card; the sibling
                      content below (`1323 valid`, `0 needs review`, `Healthy`) renders
                      whole, so this value is intended to be whole too — here its top is
                      cut at the card's top content boundary, so the row's content box is
                      shorter than the value's line height (or its baseline is pushed too
                      high)
- severity:           2   (clearly wrong and looks unintentional; the digits read as
                      "100%" despite the slice, so it stays borderline-usable — adjudicate
                      2 vs 3 from a zoom crop)
- confidence:         high (the flat-topped, sliced digits are plainly visible)
```

## Pass criteria for the calibration

The run **passes** if the report contains a finding that:
1. cites the `100%` value specifically (rule 2: cite-or-drop),
2. names the defect as top-edge clipping with no ellipsis (rubric **A3**, structural
   home **B1/B3**),
3. grounds the expectation in the whole-rendered siblings or the too-short content box
   (rule 3),
4. assigns **severity 2** (or **3**) and **high** confidence.

It **fails** if the rubric returns "looks fine" (rubber-stamp, anti-FP rule 7), invents
an unrelated defect with no citation (hallucination, rule 2), or asserts a fabricated
measurement like an exact pixel offset (rule 6).

## Out of scope for this fixture

The card also repeats the word "Health" three times ("Symlink Health" title, "HEALTH"
label, "Healthy" status). That copy **renders correctly** — nothing is clipped,
overlapped, or misaligned — so it is **not** a visual-lint defect. Redundant labeling is
a content / polish / AI-slop concern that belongs to `/design-review`, per this skill's
scope boundary ("is the render broken?" vs "is it pretty?"). The rubric must **not** grow
a content-redundancy category to satisfy this fixture; this fixture anchors clipping only.

## Notes
- This is a **gross** defect (visibly sliced glyphs) — squarely in the VLM's reliable
  range, so pure-VLM v1 is sufficient. The exact slice fraction is a measurable claim
  v1 defers to Hybrid v2 (anti-FP rule 6); v1 only raises the suspicion and may take a
  zoom crop to settle the 2-vs-3 severity call.
- visual-lint **reports**; the fix (raising the card's content height / fixing the
  value's line-height or baseline) is out of scope.
