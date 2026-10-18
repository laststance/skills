# Judge tree (H and parent self-check)

Official band names stay Japanese: めちゃくちゃ良い / まあまあ良い / 悪くない / 不合格.

This file is the print of paper §2.1 + §2.4 + §2.6. Raters and the parent at step 5 use it. Generation units do not read it. Do not put `anchors.md` here. Do not add extra sections.

Walk the tree **once from step 0**. Do not skip steps 1–3.

## Face (7 dimensions only)

key color / skeleton layout / type skeleton / repeating motif / rhythm / motion principle / material

Hero and nav are examples of skeleton layout, not extra dimensions.

## Clause list (不合格 = \(F\))

Any one item puts the after in no band. This list is the only \(F\).

1. Functional regression (an operation that worked no longer works, or wrong state display).
2. Named render defects. The six judgment sentences below are the only canon. visual-lint codes are search aids, not a second \(F\) list. A pixel that hits a sentence is \(F\). A code not in the table that still hits a sentence is \(F\). Outside the six (touch without overlap, orphan words, cosmetics, hover lift only, unreachable scroll content outside the frozen viewport) is not clause 2.

   | Kind | Judgment sentence | Often-hit visual-lint codes |
   |---|---|---|
   | Wrap | A word that should be one line is two or more | A1, A7 |
   | Missing | A required glyph or face is crushed or gone | D5; A6 tofu / missing icon / mojibake |
   | Overlap | Pixels of two elements overlap. Touch alone is not overlap | A5 |
   | Clip | Reachable content inside the frozen viewport is cut by a frame. Unreached scroll outside the viewport is not clip | A2, A3, B1, B3 |
   | Unreadable contrast | On after alone, text or required UI sinks into the ground. Regression that is only worse than before is clause 3, not clause 2 | E1, E2 |
   | Undersized target | A usable control’s hit area is obviously too small | D3 |

3. Accessibility regression (lost focus, lower contrast, lost motion-stop, lost name).
4. Introduction of a second styling system.
5. One-off color / type / shadow that ignores existing tokens. Target is **unnamed** hex, unnamed continuous quantities, and one-off shadow/type at a single repeat only. A named new hue / new token / new role with 2+ repeats is outside clause 5 and is a forced-question decision. Do not drop it to local or to one-step color.
6. Brand break (an unauthorized look the product must not have).
7. Dark pattern, or attention extraction.
8. Template beauty (false peak: purple gradient, mass-produced glass cards, meaningless blobs, silent Inter swap, and similar common AI slop sold as a “thesis”).
9. Scattered edits: decision 0 and face-local count (craft changes only; §2.1-2 repairs do not count) is 2 or more and no unifying principle.
10. Decision-dimension count is 2 or more. Several rules on the same face dimension are one thesis.
11. Observable improvement is 0. Visual only. Isolated before/after; in 3 seconds no one pixel difference can be named. Do not use git diff. Afters that change only invisible attributes are 11. Visible copy changes or an added focus ring are not 11.

## Levels (exactly one per face dimension)

| Level | Judgment sentence |
|---|---|
| Unchanged | No visible change on that dimension |
| Local | Visible change, and the forced question is no (includes crossing an existing rule) |
| Decision | Forced question is yes |

Do not use “one-point edit” as a fourth level.

**Forced question** (this sentence only, per dimension): “On this dimension, can you name a new principle or new token family that was not on before, in one of the 7 face words, and point to 2 or more repeats of it?” Yes → decision. No, and there is a visible change → local. No visible change → unchanged. Crossing an existing rule (align type scale, run spacing rhythm) is not a new principle.

## One-step color

One-step color moves the same color role one neighbor on the project’s existing scale (Tailwind numbers, adjacent design-token stops). A separate freeze list is not required. If there is no scale, change lightness one step while keeping hue. Hue change, a new role, or off-palette hex is not one-step. One-step is not a decision even with 2+ repeats. Color-role change rides the **key color** face dimension.

## Thesis count and unifying principle

**Thesis count** = number of dimensions at decision. Several rules on one face dimension count as 1. Clause 10 uses this count only.

**Unifying principle** = decision count is 0 **and** at least one named rule below has 3+ points on the dominant surface (several rules allowed). Local change sites count toward the 3. If none reach 3, there is no unifying principle.

| Rule name | Rides |
|---|---|
| Type scale | Face: type skeleton |
| Spacing rhythm | Face: rhythm |
| Concentric radius | Face: material |
| Icon weight | Face: repeating motif |
| State alignment | Non-face (do not add to face-local count) |
| Hierarchy | Face: skeleton layout |
| Shadow / border | Face: material (width / style / shadow. Border **color** is key color) |

One-step color is **not** in this table. Any number of one-step color points is not a unifying principle.

## Points

A point is one on-screen component instance you can point to (card, row, heading, body, button, input). Do not collapse an empty state to one block. Count inner heading / body / control each as 1. Changing one CSS variable that paints N cards still counts visible instances. Twelve grid cards aligned on spacing are 12 points. Do not collapse a region to 1.

Calibration sets exclude screens whose dominant surface has fewer than 3 points. Runtime still allows \(I=G\) below 3.

## Dominant surface

**One per screen.** Calibration: freeze one CSS selector or one rectangle on before, before generation. The three afters, the \(G\) contract, and raters use that same pointer. Do not make an after column. Do not include nav/chrome. If a modal is open, write its body node. Runtime: open dialog body, else `main`, else one parent-chosen content block, written into the band contracts. Raters do not re-measure.

## Spacing-rhythm triple (also the gold-standard boundary)

- \(G^-\): spacing align 1–2 points. Rhythm is local. Decision 0. No unifying principle.
- \(G\): spacing rhythm on the dominant surface at 3+ points. Rhythm is local. Decision 0. Unifying principle = spacing rhythm.
- \(G^\star\): a new principle that makes spacing rhythm the product’s weapon. Rhythm is decision.

## Craft vs repair (step-3 face-local count)

Count only face dimensions whose level is local **and** the change is craft. A §2.1-2 repair is the **smallest change** that makes the judgment sentence false. It does not count toward face-local count or toward unifying-principle 3-points (the dimension may be unchanged after the repair). Repeating the same rule past that minimum is craft and counts. Repair-only afters land on step 6 \(G^-\). Clause 9 applies only to scattered **craft**. Non-face edits (state color, etc.) do not add to face-local count. They do count toward state-alignment 3-points.

## Tree

0. Split the 7 dimensions into unchanged / local / decision. Fix thesis count and unifying principle with the definitions above.
1. Any of clauses 1–8 or 11 → \(F\) (clause 5 is unnamed hex / continuous / one-repeat one-off only; a named new hue is on the decision side).
2. Decision-dimension count ≥ 2 → \(F\) (clause 10).
3. Decision 0 and face-local count ≥ 2 and no unifying principle → \(F\) (clause 9).
4. Thesis count is exactly 1 → めちゃくちゃ良い (\(G^\star\)).
5. Decision 0 and a unifying principle exists → まあまあ良い (\(G\)).
6. Else → 悪くない (\(G^-\)).

Step 4 is the only entry to \(G^\star\). Step 5 is the only entry to \(G\). Step 6 is decision 0, no unifying principle, face-local count 0 or 1, and not 11 (includes non-face-only local fixes).

Template-beauty signs (clause 8 examples; thesis or not) and improvement 0 (clause 11) are \(F\) at step 1. “One thesis” means decision-dimension count is **exactly 1**.
