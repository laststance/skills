# Gold-standard anchors (freezer / author only)

Do not give this file to raters or to generation units.

This repo copy has **no frozen 12**. Do not invent URLs, screenshots, or labels to fill it. A freeze is valid only when label freezers (not the generator, not band raters) agree on every item.

Required shape: 9 band items (3 per official band) + 3 \(F\).

\(F\) 3: one from {8, 9, 10}, one clause-2 non-contrast kind, one from {1, 3–7}. `floor_137` is `yes` on that last item only.

Each item: screen key (URL + reach state), before+after evidence, dominant-surface pointer, official Japanese gold label.

The 12 screen keys must be disjoint from the frozen 50. Pass `{items: [...12]}` with `gold` and `votes` (3) to `scripts/toc_alpha.py`. Do not hand-count 8/9 or 10/12.
