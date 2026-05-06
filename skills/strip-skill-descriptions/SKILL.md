---
name: strip-skill-descriptions
description:
---

# Strip Skill Descriptions

Empty the `description:` field of every `SKILL.md` under `~/.claude/skills/` to reclaim always-loaded preamble context.

## When to Invoke

Trigger when ALL of these signals are present:

1. User reports skill descriptions consuming meaningful preamble context (e.g. `/context` shows Skills using >5% of the window).
2. User explicitly authorizes deletion (e.g. "全削除", "set to 0 chars", "strip them all").
3. User confirms triggers are not needed because skills are invoked explicitly via `/<skill-name>` slash commands.

If any signal is missing, **ask before proceeding**. This skill is destructive: it removes the human-authored descriptions that govern automatic skill activation.

## Pre-flight Checks

Before any edit:

- Confirm the user is OK leaving descriptions empty (not deleting the key, not deleting the skill).
- Check whether each storage tier is git-tracked. Three tiers exist:
  - `~/.claude/skills/<name>/` — Phase 1 dev (Claudia repo, may be gitignored)
  - `~/.claude/skills/<name>/SKILL.md` → symlink into `~/.claude/skills/gstack/<name>/` — separate gstack repo
  - `~/.claude/skills/<name>/` → symlink into `~/.agents/skills/<name>/` — CLI-managed, NOT git-tracked
- Run `git status` in `~/.claude/` AND `~/.claude/skills/gstack/` to confirm clean trees before editing.

## Workflow

### Phase 1 — Discover

Resolve every symlink and dedupe by absolute path. A single target file may be reachable through multiple symlinked tier-1 paths, so resolved-path dedupe avoids editing the same file twice.

```bash
find -L ~/.claude/skills -maxdepth 3 -name "SKILL.md" \
  | xargs -I{} readlink -f {} \
  | sort -u > /tmp/skill_md_paths.txt

wc -l /tmp/skill_md_paths.txt
```

Expected count: ~100-140 unique files (varies by install).

### Phase 2 — Batch

Split the path list into ~4 batches of 25-30 files each:

```bash
TOTAL=$(wc -l < /tmp/skill_md_paths.txt)
PER_BATCH=$(( (TOTAL + 3) / 4 ))
split -l $PER_BATCH -d /tmp/skill_md_paths.txt /tmp/batch
ls /tmp/batch*
```

Why 4? It balances throughput against subagent context overhead. Fewer subagents = serialized work; more = redundant context per agent.

### Phase 3 — Dispatch (Parallel Subagents)

Send all 4 subagent invocations in a **single assistant message** (multiple `Agent` tool blocks) so they run concurrently. Use `subagent_type: "general-purpose"`.

Pass each subagent the path to its batch file and the full edit instruction from `references/subagent-prompt.md`. The prompt must cover all 4 YAML format variants (see Phase 4).

### Phase 4 — YAML Format Variants

Each subagent must handle these four `description:` formats:

| Variant       | Example                                  | Edit                                               |
| ------------- | ---------------------------------------- | -------------------------------------------------- |
| Single-line   | `description: Some text here`            | Replace value with empty string after the colon    |
| Quoted        | `description: "Some text"` / `'...'`     | Same — leave just `description:`                   |
| Literal block | `description: \|`<br>`  Line 1`<br>`  Line 2` | Remove the `\|` and ALL indented continuation lines |
| Folded block  | `description: >`<br>`  Line 1`           | Remove the `>` and ALL indented continuation lines |

**Preserve everything else**: other frontmatter keys (`name`, `version`, `allowed-tools`, `triggers`, `argument-hint`, `preamble-tier`, `skill_api_version`), the closing `---`, and the entire body below it.

The final state of every file must be:

```yaml
---
name: <unchanged>
description:
<other-keys-unchanged>
---

<body unchanged>
```

### Phase 5 — Verify

After all subagents return, run:

```bash
awk_check() {
  awk '/^---$/{c++; next} c==1 && /^description:/{print FILENAME": "$0; exit}' "$1"
}
while read -r f; do awk_check "$f"; done < /tmp/skill_md_paths.txt > /tmp/verify.txt
grep -v "description:$" /tmp/verify.txt
```

The `grep -v` should print nothing. Any output flags a file where `description:` still has a value — re-dispatch a subagent on that subset.

### Phase 6 — Commit

Two repositories may have changes:

- `~/.claude/skills/gstack/` (gstack repo) — commit & push if user authorizes
- `~/.claude/` (Claudia repo) — commit & push if user authorizes

Files under `~/.agents/skills/` are NOT git-tracked; CLI manages them.

**Always confirm with the user before committing.** Use a separate commit per repo with a message like:

```
chore(skills): empty description fields to reclaim preamble context
```

## Decision Boundaries

NEVER do without re-asking:

- Delete the `description:` key entirely (breaks YAML schema expectations).
- Modify the skill body or other frontmatter keys.
- Force-push or skip hooks (`--no-verify`).
- Edit a non-SKILL.md file even if the search returned it.

If a subagent reports it could not safely edit a file (corrupted YAML, missing closing `---`, etc.), STOP and surface the path to the user — do not improvise.

## References

- `references/subagent-prompt.md` — full subagent task prompt template (covers all 4 YAML variants and edge cases).
