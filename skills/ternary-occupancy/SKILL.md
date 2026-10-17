---
name: ternary-occupancy
description: |
  Produces three isolated implemented visual improvements for one existing named
  web or GUI screen, one intended band each (めちゃくちゃ良い / まあまあ良い / 悪くない).
  Use when: the request is もっといい感じにして, polish, feel better, or ダサい,
  and the asker wants three selectable implemented afters rather than one maximized redesign.
argument-hint: "[url or named screen]"
---

# Ternary occupancy design bundle

| Primitive used here | Codex | Cursor |
|---|---|---|
| `Task` / `TaskCreate` | `spawn_agent` (else three new conversations) | `Task` |
| Parallel generation units | Parallel spawn or three conversations | Parallel `Task` |

## Codex Compatibility

`Task` / `TaskCreate` maps to `spawn_agent`. If unavailable, use three new conversations. Parallel generation units map to parallel spawn or three conversations.

## Cursor Compatibility

`Task` / `TaskCreate` maps to `Task`. Parallel generation units map to parallel `Task`.

`AskUserQuestion` and plan mode are not used. The named screen is already identified by the request.

## Hard constraints

Do not weaken these.

1. Run only for request class \(R\). One run is one named screen → one bundle.
2. Output count is 3. Intended bands are the three official bands, one each.
3. \(F\) (不合格) is in no band.
4. Band contracts live in per-band files. Each generation unit reads exactly one contract file (the copy in its worktree).
5. Implement the three bands in separate contexts and separate git worktrees (or separate clones). A checkout / revert loop on one tree does not count as three implementations.
6. Present before+after as isolated pairs, in sequence. Hide intended-band names until the author procedure in `references/calibration.md` has been satisfied.
7. Do not maximize. Do not collapse the bundle toward one “best” after.

Official band names stay Japanese. English glosses are auxiliary only.

| Official name | Symbol | Gloss |
|---|---|---|
| めちゃくちゃ良い | \(G^\star\) / `G*` / `Ys` | delight |
| まあまあ良い | \(G\) / `G` / `Y` | solid |
| 悪くない | \(G^-\) / `G-` / `Ym` | acceptable |

\(F\) is 不合格. It is not 悪くない.

## Request class \(R\)

All of the following must hold.

- The target already exists: a named web screen, or a GUI screen with browser-runtime evidence. Native-only is outside \(R\).
- The screen is pointed to by URL plus reach state (login, query, open panel, viewport, color-scheme).
- Source is open as a git working tree (or equivalent clone).
- The asked change is visual / interaction quality, not a new feature.
- Success is ratable but not numeric: もっといい感じ, ダサい, polish, feel better, and synonyms.

One \(R\) run = one screen → one bundle. Site-wide restyle as a single bundle is out of scope. Queue one run per screen instead.

**Out of scope:** `/visual-lint` or `/ux-gap-detector` audits (inputs only), greenfield design systems, “always make the best one,” overlay-only work with no source repo.

Clause 2 render defects may use `/visual-lint` as search aid. The fail list is `references/judge-tree.md` only.

## Runtime completion

Mark the run complete only when every item holds.

- Before was confirmed on the running UI of the named screen (not from code or memory alone).
- Three afters remain as separate worktrees (or clones) and can be launched with before. Prefer four ports at once. If the host cannot hold four ports, launch the remaining worktrees in sequence. Swapping one tree does not qualify.
- All three afters are non-\(F\) on the parent self-check in `references/judge-tree.md`. If any band is \(F\) three times, the run is incomplete. If the three afters have the same face, the run is incomplete. Two afters are not a bundle.
- Each generation unit read exactly one band-contract file.
- Intended bands are the three official bands, one each.
- Presentation is before+after pairs in sequence (no three-up). Do not print intended-band names.
- Do not emit calibration \(N\), raters, or bootstrap numbers at runtime.

Same-face and three-times-\(F\) rules above are runtime-only. Author rating procedure is `references/calibration.md` (runtime agents do not read it).

## Parent load vs generation-unit load

**Every run (parent only).** This file. `workflows/generate-bundle.md` for steps 0–6. `references/judge-tree.md` for parent self-check (step 5). Do not duplicate those steps here.

**Generation unit.** Only the one band-contract file in its worktree. Do not load the other two band files, `judge-tree.md`, `anchors.md`, `confusion-repair.md`, `calibration.md`, or the scripts.

**Author / freezer only.** `references/anchors.md`, `references/confusion-repair.md`, `references/calibration.md`, `scripts/toc_gate.py`, `scripts/toc_alpha.py`.

**Rater pack (humans, not generation units).** `references/judge-tree.md` only. Do not hand raters `anchors.md`, band contracts, or worktrees.
