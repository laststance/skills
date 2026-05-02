# Doc Audit Heuristics

Per-file checklists for Step 4 of `syncing-docs-and-memory`. Each section lists:

- **Check**: what to compare against the diff
- **Auto-updateable**: low-risk factual fixes (apply via `Edit` in Step 5)
- **Ask user**: anything narrative or interpretive (route through Step 6)

## Auto vs Ask — universal split

| Type | Auto-updateable | Ask user |
|------|----------------|----------|
| File paths / counts | ✓ | |
| Table rows (add/remove) | ✓ | |
| File trees | ✓ | |
| Command names | ✓ | |
| Version numbers (non-VERSION-file refs) | ✓ | |
| Intro / project positioning | | ✓ |
| Architecture rationale | | ✓ |
| Security model wording | | ✓ |
| ≥10-line rewrites | | ✓ |
| Section deletions | | ✓ |
| Anything ambiguous | | ✓ |

## README.md

**Check**:

- Feature list — new commands/skills/features added in diff?
- Setup / install steps — still execute correctly? (do a smoke read-through)
- Example snippets — referenced files / commands / flags still exist?
- Troubleshooting — any of the listed errors no longer reachable?
- Counts ("134 skills", "12 agents") — match current repo state?

**Auto-updateable**: feature-list bullet additions when a clearly-named new entry-point appears in the diff; count corrections; updated paths.

**Ask user**: rewording the intro, repositioning the project, removing features even if the code is gone (might be intentional staging).

## AGENTS.md

**Check**:

- Agents/components table — entries match `agents/` (or equivalent) directory listing?
- Counts in headings — match table row count?
- Missing rows for new agents? Stale rows for deleted agents?

**Auto-updateable**: add/remove rows to match filesystem; update count headers.

**Ask user**: changing an agent's stated purpose, reordering for "importance".

## CLAUDE.md

**Check**:

- Project structure section — directories listed match `find . -maxdepth 2 -type d`?
- Commands section — every listed command exists in `package.json` / `Justfile` / `Makefile`?
- Conventions section — code in diff actually follows them, or did the convention change?

**Auto-updateable**: directory listings; command additions when a new script appears verbatim in `package.json`.

**Ask user**: convention changes (these are intentional team decisions, not drift), philosophy edits.

## SPEC.md

**Check**:

- API contracts / interfaces / type signatures — match exported symbols in diff?
- Behavior specifications — diff implements or contradicts them?
- Schema definitions — match source files?

**Auto-updateable**: type signature updates when the change is purely a rename or added optional field; schema field additions.

**Ask user**: behavior contract changes, breaking API edits, anything that affects downstream consumers.

## CONTRIBUTING.md

**Check**:

- Setup steps — pseudo-execute as a new contributor: any command that would now fail?
- PR / commit conventions — diff commits follow them?
- Test commands — still produce green output (don't actually run, just verify they exist)?

**Auto-updateable**: command name fixes (`npm test` → `pnpm test`), path updates.

**Ask user**: process changes (review flow, merge strategy), tone / culture edits.

## ARCHITECTURE.md

**Be conservative here**. Architecture docs encode design rationale, which the diff alone can't disprove.

**Check**:

- ASCII diagrams — do referenced components still exist by name?
- Component descriptions — any clearly contradicted by diff (e.g. "synchronous" but code went async)?
- Data flow — paths / queues / services renamed?

**Auto-updateable**: name updates in diagrams when a single rename happened; broken cross-references.

**Ask user** (default): everything else. Architecture narrative is high-context; prefer to surface drift as a question rather than rewrite.

## TODOS.md (if present)

**Check**:

- Items completed by the diff — should be removed or struck through
- New TODOs implied by `TODO:` / `FIXME:` comments in diff

**Auto-updateable**: striking through completed items.

**Ask user**: adding new items (the user may already track these elsewhere — Linear/GitHub Issues).

## Discovered `*.md` (catch-all)

For any other markdown found in Step 2:

1. Read the first 30 lines to infer purpose
2. Apply the closest matching well-known type's checklist
3. If unclear, default to **ask user** for everything

## Red flags (always surface, never auto-update)

- Security model statements ("we never log X", "Y is encrypted at rest")
- Compliance claims (SOC2, HIPAA, GDPR mentions)
- License or copyright text
- Code of Conduct
- Anything in a `<!-- AUTO-GENERATED -->` block (warn: regenerate with the source script instead)
