---
name: ternary-occupancy
description: |
  Ships three finished visual improvements for one existing named Web or GUI
  screen as isolated worktrees — one each for 悪くない, まあまあ良い, and
  めちゃくちゃ良い. Does not collapse the request into a single best design.
  Use when: the user asks to make a live screen もっといい感じ, polish it,
  feel better, or ダサい, and the source is already open as a git working tree.
argument-hint: "[named screen / URL + reach state]"
---

# Ternary Occupancy

| Claude Code | Codex | Cursor |
|---|---|---|
| `Task` / `TaskCreate` | `spawn_agent` / `send_input` / `wait_agent` | `Task` (subagents) |

Produce a 3-output bundle for one existing named screen. Official band names stay Japanese: **めちゃくちゃ良い** / **まあまあ良い** / **悪くない**. Do not translate them. Do not maximize toward one best look.

<essential_principles>

1. Run only on request class \(R\). One run is one named screen → one bundle.
2. Outputs are 3. Intended bands are the three bands, one each.
3. \(F\) is not a band. Never place an \(F\) leaf in any band.
4. Write the band contract into a per-worktree file. Each generation unit reads that one file only.
5. Implement the three bands in separate contexts and separate git worktrees (or clones). A checkout/revert loop on one tree is not three implementations.
6. Present before+after as isolated pairs, in sequence. Hide intended-band names until an author later names TOC.
7. Do not maximize. Do not fold the request into “the single best look.”

Do not use `AskUserQuestion` or plan mode. Isolation uses `Task` (or the host map above), or three brand-new conversations. A `Task` isolation without this table is not this skill.

</essential_principles>

## Request class \(R\)

All of the following must hold:

- The target is an **already existing** Web site or GUI app, **one named screen** (not a from-scratch brand).
- That screen is pointed to by URL plus reach state (login, query, open panel).
- Source is open as the agent’s **git working tree** (or an equivalent clone).
- The asked change is **visual / interaction quality**, not a new feature as the main goal.
- Success is ratable but not numeric: 「もっといい感じ」「なんかダサい」「polish して」.

One \(R\) run is **1 screen → 1 bundle**. A whole-site restyle in one bundle is out of scope. Site-wide work is one TOC run per screen.

**Out of scope:** audit-only (`/visual-lint`, `/ux-gap-detector`), from-scratch design systems, “always make the single best look,” URL overlay with no source tree, generalizing a person’s taste.

## Fail \(F\)

Canonical \(F\) is `references/judge-tree.md`. Generation units must not read that file. The orchestrator reads it only at self-check (procedure 5). `/visual-lint` may help hunt clause-2 pixels; codes outside that table are not \(F\).

## Runtime completion

Follow `workflows/generate-bundle.md` (procedures 0–6). Mark **complete** only when every item in that file’s runtime checklist is true, including:

- Live before UI was inspected on the named screen
- Three afters remain as separate worktrees (or clones) and can be launched with before
- Self-check passed \(F\) on all three outputs. A band that is \(F\) three times → **incomplete**. Three afters with the same face → **incomplete**
- Each generation unit read exactly one band-contract file
- Intended bands are the three bands, one each
- Presentation is one before+after pair at a time (no 3-up). Intended-band names are hidden
- Do not hand two outputs as a TOC bundle

Same-face three afters may be shown, but that is not TOC-complete. If the dominant surface has fewer than 3 points, still emit intended three bands. \(I=G\) applies existing table rules to every existing point. Do not regenerate when \(H=G^-\). Authors who want to name TOC use `references/calibration.md`; runtime runs do not.

## Delayed load

| File | Who reads it |
|---|---|
| `references/band-g-minus.md` | Orchestrator, as the 4-axis template for \(I=G^-\) only |
| `references/band-g.md` | Orchestrator, as the 4-axis template for \(I=G\) only |
| `references/band-g-star.md` | Orchestrator, as the 4-axis template for \(I=G^\star\) only |
| worktree-local contract (one file) | That generation unit only |
| `references/judge-tree.md` | Orchestrator at procedure 5 only |
| `workflows/generate-bundle.md` | Orchestrator |
| `templates/bundle-report.md` | Orchestrator at procedure 6 |
| `references/anchors.md` | Authors only |
| `references/confusion-repair.md` | Authors only |
| `references/calibration.md`, `scripts/toc_gate.py`, `scripts/toc_alpha.py` | Authors only. Runtime agents do not read these |

Do not load the three static `band-*.md` templates into one generation context.

## Sibling skills

This skill owns **three-band occupancy** only. Do not reimplement siblings.

| Skill | Question | Relation |
|---|---|---|
| `/visual-lint` | Is the render broken? | Hunt aid for clause 2. Not the floor (1, 3–7) |
| `/ux-gap-detector` | What UX gaps exist in a SaaS interior? | Input candidates. No bands |
| `/product-inspiration` | What do top apps do? | Thesis search for \(G^\star\). Transplant is fake-peak \(F\) |
| Single-output design-review | Is it beautiful, and then fix it? | Maximizer. Different job |
