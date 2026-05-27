# Anti-false-positive process rules — read this FIRST

A VLM applied naively fails in **two opposite ways**, and a useful linter must defend
against both:

- **Hallucination (false positive):** inventing defects that aren't there, or asserting
  precise numbers it cannot actually see. Erodes trust → the report gets ignored.
- **Rubber-stamping (false negative):** glancing at the screenshot, saying "looks fine",
  and missing real breakage. Defeats the purpose.

These rules bound the judgment. They override the rubric: a finding that violates a rule
does not ship, and a category skipped in violation of rule 7 is an incomplete run.

---

### 1. Describe before you judge
First pass: describe what's on screen in **neutral language with no defect vocabulary**
("a slider with a two-line value to its right"). Only on a second pass turn descriptions
into verdicts. This stops the model from inventing a defect to match an expectation it
formed before looking.

### 2. Cite or it didn't happen *(the strongest lever)*
Every finding MUST quote a **specific visible element** — its text and screen location.
A finding that cannot point at something concrete in the pixels is a hallucination →
**drop it.** "The spacing feels off somewhere" is not a finding. "The gap between the
`Sync` and `Remove` buttons is visibly larger than between `Remove` and `Hide`" is.

### 3. `expected_vs_actual` needs an inferable source
The "expected" half must come from something **observable or citable**, not pure
assertion. Valid sources: a sibling that does it right ("other readouts are one line"),
a DESIGN.md rule ("cards get no resting shadow"), an obvious functional intent ("a button
label must be fully readable"). A bare "this should be different" with no grounds →
downgrade to low-confidence or drop.

### 4. Severity is mandatory
Every finding gets `3`, `2`, or `1`. Forcing the choice prevents vague middle-ground
hedging and makes the report triageable. If you can't assign severity, you haven't
characterized the defect well enough — go back to rule 3.

### 5. Low confidence → phrase as a question, never an assertion
If the pixels are ambiguous, do **not** state the defect as fact. Write it as:
> *Possible (low confidence): the `Reset` button may be a hair below the others —
> needs measurement / a human glance.*
Low-confidence items go in a separate "Needs confirmation" section, not among confirmed
findings.

### 6. Defer measurable claims — never fabricate a number
v1 is pure-VLM and **cannot measure**. So:
- Never assert an exact contrast ratio ("3.1:1"), an exact pixel offset ("4px low"), or
  an exact size. Say "appears low-contrast" / "looks slightly misaligned — borderline".
- Anything that *should* be a number is flagged "borderline — needs measurement". The
  future Hybrid v2 deterministic layer measures these; v1 only raises the suspicion.

### 7. Enumerate, don't fill a quota
- **Never** instruct "find N defects" — that manufactures false positives to hit a count.
- **Do** walk every category A–F for every captured state and explicitly record
  "A: no defect found", "B: …" etc. The forced enumeration is what prevents
  rubber-stamping: a blanket "looks fine" is not acceptable output; a per-category clear
  is.

### 8. Scan dense regions per element
In lists, toolbars, grids, and repeated rows, examine instances **individually** and
**compare across instances** (this is how C-alignment and D4-consistency defects surface
— each row looks fine alone, the misalignment only shows in comparison).

### 9. Resolve the pixels before you judge
playwright-cli captures at **1× CSS resolution** (it hardcodes `scale: 'css'`), not the
2× device pixels of a DPR-2 render — so fine detail can be unresolvable in a full-window
shot even though `window.devicePixelRatio` reads `2`. If a suspected defect is too small
to resolve, **do not guess** — take a zoomed crop (element-scoped screenshot, or a CSS
`zoom`/transform on the region) and re-judge from that.
"I can't resolve this" is a valid outcome; a confident verdict on unreadable pixels is not.

### 10. Use a baseline only if one exists
If the project supplies a reference image for the screen, compare against it (a real
diff collapses both failure modes). v1 ships **no** baseline machinery and does not
require one — this rule only applies when a baseline is volunteered.

### 11. Adversarial self-check (final pass)
Before writing the report, take each candidate finding and argue the **opposite**:
*"Could this be intentional design?"* A truncated path in a fixed-width cell, a
deliberately muted disabled control, a single primary button drawn larger on purpose —
these are *correct*, not defects. Anything that survives its own counter-argument ships;
anything that doesn't is dropped or demoted to low-confidence.

---

## One-line summary
**Cite a visible element, ground the expectation, force a severity, question what you
can't resolve, never fabricate a number, enumerate every category, and argue the opposite
before you commit.**
