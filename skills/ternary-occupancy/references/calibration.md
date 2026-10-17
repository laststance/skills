# Author calibration (not a runtime document)

Runtime agents do not read this file. Do not put \(N\), rater IDs, or bootstrap numbers in `SKILL.md`. Numbers that decide adoption come only from `scripts/toc_gate.py` and `scripts/toc_alpha.py` (paper appendices C and D). Pin `krippendorff==0.8.2`. numpy>=1.22 for the gate script.

This repo copy ships the method, not a passed freeze. Do not write that this skill “is TOC” in README until the paper §4.5 checklist is satisfied. Until then the implementation is a method prototype, not an adopted artifact.

Canon method text: `docs/papers/ternary-occupancy-calibration.md`. If this file and the paper disagree, the paper wins.

## Official names and JSON

| Official name | \(I\) | JSON after id | ASCII cell |
|---|---|---|---|
| 悪くない | \(G^-\) | `Ym` | `G-` |
| まあまあ良い | \(G\) | `Y` | `G` |
| めちゃくちゃ良い | \(G^\star\) | `Ys` | `G*` |
| 不合格 | — | — | `F` |

Reverse maps are banned. Raters write Japanese official names (or 不合格). The matcher encodes after rating.

## Roles

- **Generator:** runs the skill. Does not rate.
- **Floor inspector:** clauses 1, 3–7. Not a band rater.
- **Band raters:** 3 people, external ≥1 (default 2 internal + 1 external). Same one sheet (`judge-tree.md` print). Walk the tree from step 0 once.

## Gates

- **Gold 3-gate** (entry): \(\alpha \ge 0.67\) on the 9 band items, band accuracy ≥ 8/9, F/non-F ≥ 10/12. Use `toc_alpha.py` `{items: [...12]}` only.
- **Revision 4-gate** (`N=30`): A (\(\varepsilon=0.08\) and bootstrap 95th \(\le 0.15\)) and B (\(\tau_0=0.45\) and bootstrap 2.5th \(>2/9\)) and \(q_{\mathrm{inc}}\) and position gap ≤ 0.15. Bootstrap: trial unit, 2000, PCG64(20250911), Hyndman–Fan type 7.
- **Holdout 3-gate** (`N=10`): count-window A \(|n_k-N_c|\le 2\), \(n_\tau \ge 5\), \(\hat{q}_{\mathrm{inc}}\le 0.10\). No position gap.

Name the method only when holdout 3-gate passes **and** the revision-arm position gap already passed.

Frozen set: revision 30 + holdout 10 + reserve 10 (50 screens), disjoint from gold 12. Viewport default `1440×900`. Same product ≤4 of 50, ≤2 in one layer.

`toc_gate.py` input uses `incomplete` (count) plus `completed` trials. `incomplete + len(completed)` must equal `N`.
