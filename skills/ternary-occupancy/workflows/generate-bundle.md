# Generate a three-band bundle (runtime)

Orchestrator only. Do procedures 0–6 in this order. Self-check discards an after only when the judge-tree leaf is \(F\). Retry that band at most 3 times (first try + 2 regenerations). \(H \neq I\) and “three afters, same face” are not regeneration conditions.

Official band names stay Japanese: めちゃくちゃ良い \(G^\star\), まあまあ良い \(G\), 悪くない \(G^-\).

## Same face

For each after, write the 7-dimension vector (each face dimension is 不変 / 局所 / 決断) with the same function as judge-tree step 0. Same face = the three vectors are identical. All-不変 vectors match each other. The 余白リズム triad in `references/judge-tree.md` is not the same face: only \(G^\star\) is 決断 on rhythm.

## Runtime vs later calibration

**Runtime (this file):** a band that is \(F\) three times, or three afters with the same face, makes the run **incomplete**. Do not ship two outputs as a TOC bundle. Same-face afters may be shown; do not call the run complete. Dominant-surface points may be < 3; still emit intended three bands. \(I=G\) applies existing table rules to every existing point. Do not regenerate when a later \(H\) is \(G^-\). Do not mention calibration \(N\) or raters.

**Calibration (authors, `references/calibration.md`):** three-times-\(F\) is generation-incomplete and is not rated. Same face is rated.

## Procedure 0 — Evidence

Look at the live UI of the named screen. Do not assign bands from code or memory alone. Identify the styling system (Tailwind / CSS / CSS-in-JS). Do not add a second system.

## Procedure 1 — Floor

“Floor” means judge-tree clauses **1, 3–7** only. Clause 2 stays in the generation check but is not the floor inspector’s job. Copy floor 1, 3–7 and clause 2 into all three worktree contracts as the same wording. Do not land those fixes on a shared base commit and then branch. No band is exempt.

## Procedure 2 — Current face

In one sentence, say what the screen is remembered by, using the 7 face dimensions: キーカラー / 骨格レイアウト / タイプ骨格 / 反復モチーフ / リズム / モーション原則 / 素材. Hero and nav are examples of 骨格レイアウト, not extra dimensions.

## Procedure 3 — Freeze band contracts

`references/band-*.md` are 4-axis templates. Translate each into this screen’s vocabulary and write **one contract file in that band’s worktree only**.

Examples:

- \(G^-\): radius on one Card inside the hero (do not touch shared tokens)
- \(G\): raise 余白リズム 解消点 to ≥ 3 on the dominant surface; add no new principle
- \(G^\star\): recompose the skeleton for density; do not touch key color

The generation unit reads only the contract file in its own worktree. Do not load the three static templates into one context.

**Dominant surface (runtime):** the open dialog body, else `main`, else one parent-chosen body block. Write that pointer into every contract. Do not remeasure with any other area algorithm.

## Procedure 4 — Isolated generation

Implement the three bands in **separate contexts and separate git worktrees (or clones)**. Do not produce three versions in one conversation.

Launch isolation with `Task` × 3 (or the host map in `SKILL.md`), or three brand-new conversations. Done means three worktrees remain. Checkout/revert on one tree does not count as three implementations.

Prefer four running instances (before + 3 after) on separate ports. If the host cannot hold four ports, launch the saved worktrees in sequence.

Each `Task` prompt may include only: the shared floor wording, that worktree path, and that one contract file. Do not attach the other two contracts or `judge-tree.md`.

## Procedure 5 — Self-check

Only the orchestrator reads `references/judge-tree.md`. Generation units do not. Walk each after through the tree with \(I\) hidden.

- Leaf is \(F\) → regenerate that band (max 3 tries)
- Three afters, same face → record it. Do not regenerate. Runtime = incomplete
- \(H \neq I\) → do not regenerate

## Procedure 6 — Present

Show each after as **before + that after only**, in sequence. No 3-up. Hide intended-band names. If a band contracted motion, keep recorded frames. Use `templates/bundle-report.md`.

## Runtime checklist (all required)

- [ ] Named screen live before confirmed
- [ ] Three afters remain as separate worktrees or clones; before + afters can be launched
- [ ] Self-check: no \(F\) leaf on the three shipped afters. A band \(F\) three times → incomplete
- [ ] Same face → incomplete
- [ ] Each generation unit read exactly one band-contract file
- [ ] Intended bands are the three bands, one each
- [ ] Presentation is isolated before+after pairs. Intended-band names hidden
- [ ] Did not maximize toward one best look
