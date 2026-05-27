# Calibration fixture — expected finding

**Fixture:** `opacity-blur-wrap.png` — the skills-desktop Settings → Appearance pane,
"Opacity / Blur" row, captured when the value readout was `83% / 15px`. The value span
was fixed at `w-14` (56px), narrower than the ~75px content, so the readout wrapped onto
two lines (`83% /` on line 1, `15px` on line 2).

This is the worked-example bug that motivated the skill. It is the **dev-time regression
anchor**: when you edit the rubric (`defect-rubric.md` / `anti-false-positive.md` /
`design-system-criteria.md`), run the rubric once against the PNG and confirm it still
produces a finding that matches the one below. A rubric edit that stops catching this is
a regression.

## Expected finding (must be emitted)

```
- element:            the `83% / 15px` value readout at the right end of the
                      "Opacity / Blur" slider row
- defect:             the readout wraps onto two lines — `83% /` on the first line,
                      `15px` on the second
- expected_vs_actual: a percent value, its separator, and its unit should read as one
                      token on a single line (other numeric readouts in this UI are
                      single-line); here the containing span is narrower than its content,
                      forcing a wrap after the `/`
- severity:           2   (clearly wrong and looks unintentional, but the screen is still usable)
- confidence:         high (the two-line wrap is plainly visible in the screenshot)
```

## Pass criteria for the calibration

The run **passes** if the report contains a finding that:
1. cites the `83% / 15px` readout specifically (rule 2: cite-or-drop),
2. names the defect as an unintended two-line wrap (rubric **A1** / **A7**, structural
   home **B**),
3. grounds the expectation in the single-line norm or the narrow-container reason
   (rule 3),
4. assigns **severity 2** and **high** confidence.

It **fails** if the rubric returns "looks fine" (rubber-stamp, anti-FP rule 7), invents
an unrelated defect with no citation (hallucination, rule 2), or asserts a fabricated
measurement like an exact pixel width (rule 6).

## Notes
- This is a **gross** defect (text on two lines) — squarely in the VLM's reliable range,
  which is why pure-VLM v1 is sufficient for this class. It does **not** exercise the
  sub-10px / off-token precision that v1 intentionally defers to Hybrid v2.
- The fix that resolved the real bug (widening the span to `w-20` + `whitespace-nowrap`)
  is *not* this skill's concern — visual-lint reports; it does not fix.
