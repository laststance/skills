# Calibration (authors only)

Runtime agents do not read this file. Acceptance numbers come only from `scripts/toc_gate.py`. Gold-12 \(\alpha\) comes only from `scripts/toc_alpha.py` (`krippendorff==0.8.2`).

Do not write “TOC skill” in the repository README until this checklist has passed. An unmeasured implementation is a method prototype, not an accepted artifact.

Method source: `docs/papers/ternary-occupancy-calibration.md`.

## Frozen constants

Do not move these after seeing data: \(\varepsilon=0.08\), \(\gamma=0.15\), \(\tau_0=0.45\), \(\hat{q}_{\mathrm{inc}}\) cap \(0.10\), position-gap cap \(0.15\), bootstrap \(2000\), seed `20250911`. If the model ID changes, restart this file from the top.

## Frozen 40

Revision 30 + holdout 10. Distinct URL+state. Dominant-surface pointer per screen. Layers in **total**, split revision:holdout = 3:1:

| Layer | Total | Rev + hold |
|---|---|---|
| Dense settings / data | 8 | 6+2 |
| Authenticated app interior | 8 | 6+2 |
| Marketing / hero | 4 | 3+1 |
| Empty / error / onboarding | 4 | 3+1 |
| Remainder | 16 | 12+4 |

Max 2 screens from one product. No native-only screens. No screen without runtime evidence. Admission is the one sentence in paper §2.4 (not distributed in `judge-tree.md`): dominant surface has ≥ 3 outer instances, and **the same** table rule has ≥ 1 before application and ≥ 3 欠け or 不揃え.

## Gold 12 (before generation)

Before + after. Disjoint from the frozen 40. Raters receive `judge-tree.md` plus each screen’s dominant-surface pointer only.

- Band 9 (3 per band). Include: 余白リズム as 決断 (one), 余白リズム as 統一原則 (one), 色の 1 段階 as 局所 (one)
- \(F\) 3: (a) clause 11 exactly once, (b) one from \(\{8,9,10\}\), (c) one from \(\{1{-}7\}\)
- Labels frozen by ≥ 2 people who are not the generator, before the gate
- Do not rewrite labels to pass a failed gate

Encoding for `toc_alpha.py`: rows = 3 raters, columns = 9 band gold items, values `0` (\(G^-\)) / `1` (\(G\)) / `2` (\(G^\star\)), gold-band \(F\) → `null`.

All three must hold:

- Band-9 ordinal Krippendorff \(\alpha \ge 0.67\)
- Majority band label matches frozen gold band on ≥ 8 of 9
- Majority \(F\) vs not-\(F\) matches frozen gold on ≥ 10 of 12

Do not claim TOC success from an LLM judge without this human gold.

## Rating

One trial = named screen + before + 3 afters. Never reuse a URL+state for a second bundle.

Three band raters (at least one external) see **before + that after only**, in sequence. No 3-up. Order is the trial Latin square: base rows \((Y^-,Y,Y^\star)\), \((Y,Y^\star,Y^-)\), \((Y^\star,Y^-,Y)\). Trial index \(t\) (frozen screen number, 0-based) left-rotates columns by \(t \bmod 3\). Rows go to raters 0,1,2. `toc_gate.py` reconstructs with `IDS[r][(p+t) mod 3]`.

Each after gets a tree leaf in \(\{G^\star,G,G^-,F\}\). No forced one-of-each assignment.

Roles:

- Generator does not rate. Do not leak \(I\), prompts, or logs
- Floor inspector (1 person): clauses **1, 3–7** on the main measure. That \(F\) is final. Does not generate or band-rate
- Band raters: tree from step 1 on non-floor-\(F\) outputs (clauses 2, 8–11, and missed floor)

Gold 12 uses band raters only for every clause.

A/B labels are the band-rater majority. No majority → \(U\). That trial is rating-incomplete.

## Trial kinds

- **Generation-incomplete:** a band is \(F\) three times; not rated; screen stays in the frozen set
- **Rating-incomplete:** rated, majority has \(F\) or \(U\)
- **Complete:** rated, all three majorities in \(\{G^\star,G,G^-\}\)

\(\hat{q}_{\mathrm{inc}}=(\text{generation-incomplete}+\text{rating-incomplete})/N\). Do not use this symbol for per-output \(F\) rate.

A and B use complete trials only (\(N_c\)). If revision \(N_c<27\) or holdout \(N_c<9\), do not accept A/B; look at incompleteness first.

## Gates

**Revision 30** (script `N=30`): A point + A bootstrap 95th ≤ 0.15; B point \(\hat{\tau}\ge 0.45\) + B bootstrap 2.5th \(> 2/9\); \(\hat{q}_{\mathrm{inc}}\le 0.10\); position gap ≤ 0.15 on individual `view[r][p]` \(P(G^\star)\). Do not measure position on majority labels.

**Holdout 10** (script `N=10`): A point, B point, \(\hat{q}_{\mathrm{inc}}\) only. No bootstrap. No position.

Name TOC only when holdout passes those three **and** revision position already passed.

Report ordinal \(\alpha\) on complete-trial individual ratings. Not a gate.

Bootstrap canonical: complete trials in rising \(t\), `numpy.random.Generator(numpy.random.PCG64(20250911))`, trial-level resample × 2000, NumPy `percentile` `method="linear"` (Hyndman–Fan type 7).

## Author checklist

1. Write freeze conditions (30, 10, surfaces, model, tools, hash, constants above)
2. Freeze `judge-tree.md` and gold 12. Three band raters pass the 3 gold gates. **No generation yet**
3. Generator only: build revision 30. Three-times-\(F\) stays in the 30 as generation-incomplete and is not rated. Same face is not regenerated; in calibration it is rated
4. After generation, the generator does not edit afters / worktrees
5. Rate complete revision bundles with the Latin square and floor inspector. Run `toc_gate.py` with `N=30`
6. If rejected:
   - **Body-only edit** (tree frozen): fix skill body, regenerate the same revision 30 URLs from step 4. If holdout has never been rated, keep those URLs and do not rate them yet. If holdout was rated once, those URLs are burned; freeze a new holdout 10 and wait for step 7
   - **Tree note added:** (1) same gold 12, same 3 raters, retake 3 gates; (2) discard revision-30 artifacts and ratings even if done, regenerate on the same URLs, retake 4 gates; discard holdout artifacts and ratings; **do not regenerate or rate holdout until step 7**; (3) if holdout was ever rated, the claim is void, those URL+states are burned, freeze a new holdout 10 that keeps layer 3:1. If never rated, keep those URLs. If gates still fail, freeze a new 12 and restart
7. When revision passes 4 gates, generate and rate holdout 10 **once** after the tree is fixed (`N=10`: A/B points + incompleteness. No position)
8. If holdout passes A point, B point, and \(\hat{q}_{\mathrm{inc}}\), and revision position already passed, name TOC. If it fails and body and tree stay unchanged, **one** holdout replacement: (1) that freeze’s claim is void; (2) failed holdout URL+states burned; (3) freeze a new holdout 10 that keeps layer 3:1; (4) keep revision 30 URLs, artifacts, ratings — do not repeat steps 1–6; (5) do step 7 once on the new 10. A second failure ends TOC naming for that body. Editing the body resets replacement count to 0 and restarts from revision. Do not fit the body to the failure labels

JSON for `toc_gate.py` uses `G*` / `G` / `G-`. `view` cells are tree leaves only (`G*` / `G` / `G-` / `F`). Never put `U` in `view`. Do not supply majority `labels`. `incomplete` + `completed` must equal `N`.
