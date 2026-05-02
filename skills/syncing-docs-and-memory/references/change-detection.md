# Change Detection

Heuristics for Step 4: given a diff, which docs are likely stale?

## Path-based reverse lookup

Map changed file paths to the docs most likely to mention them.

| Diff path pattern | Likely-stale docs |
|-------------------|-------------------|
| `agents/**` or `.claude/agents/**` | AGENTS.md, README.md (agent count) |
| `skills/**` or `.claude/skills/**` | README.md (skill count), SPEC.md |
| `bin/**`, `scripts/**` | README.md (commands), CLAUDE.md |
| `package.json` `scripts.*` change | CLAUDE.md (commands), README.md, CONTRIBUTING.md |
| `src/**` API surface (exports change) | SPEC.md, README.md (examples) |
| `migrations/**`, `prisma/**` | SPEC.md (schema), ARCHITECTURE.md |
| `Dockerfile`, `docker-compose.*` | README.md (setup), CONTRIBUTING.md |
| `.github/workflows/**` | CONTRIBUTING.md (CI), README.md (badges) |
| Any new directory at repo root | README.md (project structure), CLAUDE.md |
| File rename | every doc — names propagate broadly |
| File deletion | every doc — surface for review |

## Change category → impacted doc map

Apply after Step 1's classification.

| Category | Likely-impacted docs |
|----------|----------------------|
| New feature | README, SPEC, AGENTS (if agent), CLAUDE |
| Changed behavior | SPEC, ARCHITECTURE (if data flow), README (examples) |
| Removed functionality | every doc (search for the removed name) |
| Infrastructure | README (setup), CONTRIBUTING, CLAUDE |

## Name-presence check

For every renamed / deleted symbol or path, grep all candidate docs:

```bash
grep -rn "<old_name>" README.md AGENTS.md CLAUDE.md SPEC.md docs/ 2>/dev/null
```

Hits are stale references. Auto-update for plain renames; ask for deletions.

## Diff signal types

| Signal | Implication |
|--------|-------------|
| New file with public-looking name | likely needs README mention |
| Renamed file | every doc referencing old name is stale |
| Deleted file | every doc referencing it is stale |
| In-place edit, large hunks | possible behavior change → SPEC / ARCHITECTURE review |
| In-place edit, small hunks | likely fact-only updates → factual auto-update |

## gstack-learnings reverse lookup (opt-in)

If `gstack-learnings` was activated in Step 3, each learning record has a `files[]` field. Use it to find learnings tied to changed files:

```bash
~/.claude/skills/gstack/bin/gstack-learnings-search --skill <name> --limit 50 \
  | jq -r 'select(.files != null) | select(.files[] | IN($CHANGED[]))'
```

Surface any learning whose `insight` contradicts the current code as a likely doc-update candidate.

## ASCII diagram skew

For each ARCHITECTURE.md or doc containing ASCII diagrams:

1. Extract identifier-looking tokens from the diagram (CamelCase, snake_case, `kebab-case`)
2. Check whether each token still appears in the codebase (`grep -r <token>`)
3. Tokens with zero hits are likely stale node labels — ask user (don't auto-edit diagrams)

## Confidence levels

When generating Step 6 questions, rank candidates:

- **High** (auto-update OK): rename in 1 path, count off by 1, broken link
- **Medium** (ask): rename touching ≥3 paths, behavior change with narrative impact
- **Low** (ask, default to skip): philosophy/design rationale skew, security-model wording
