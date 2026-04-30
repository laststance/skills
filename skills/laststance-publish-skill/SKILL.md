---
name: laststance-publish-skill
description: Publish skill
---

# Publish Skill to laststance/skills

Publish a tested skill to the `laststance/skills` repository for distribution via `npx skills add`.

## Prerequisites

- Skill is stable (passed Phase 2 testing in ~/.codex/skills/ and ~/.vscode/skills/)
- Repository cloned at `~/laststance/skills`
- Skill has a valid `SKILL.md` with frontmatter (`name`, `description`)

## Publish Steps

### 1. Copy skill to repository

```bash
mkdir -p ~/laststance/skills/skills/<name>
cp -r ~/.claude/skills/<name>/* ~/laststance/skills/skills/<name>/
```

Only copy files needed for the skill (SKILL.md + supporting files). Do NOT copy test artifacts or local-only files.

### 2. Update README.md (3 places)

All three sections maintain **alphabetical order**.

**A. Install commands** — Add to the specific skill install list:

```bash
npx skills add laststance/skills --skill <name>
```

**B. Available Skills table** — Add row in alphabetical position:

```markdown
| [<name>](skills/<name>/) | <description> | <dependencies or —> |
```

Dependencies format:
- No deps: `—`
- Optional: `[Name](url) (recommended)`
- Required: `[Name](url) **(required)**`

**C. Usage examples** — Add entry in alphabetical position:

```
/<name> <typical-args>              # Short description
```

### 3. Commit and push

```bash
cd ~/laststance/skills
git add skills/<name>/ README.md
git commit -m "$(cat <<'EOF'
feat: add <name> skill — <short description>
EOF
)"
git push
```

## Checklist

- [ ] Skill directory copied to `~/laststance/skills/skills/<name>/`
- [ ] README install command added (alphabetical)
- [ ] README skills table row added (alphabetical)
- [ ] README usage example added (alphabetical)
- [ ] Committed with `feat: add <name> skill` format
- [ ] Pushed to remote

## After Publish (CLI Install)

Once merged, install via CLI to create symlinks across all AI tools:

```bash
npx skills add laststance/skills
# or specific skill:
npx skills add laststance/skills --skill <name>
```

This installs to `~/.agents/skills/<name>/` and creates symlinks in `~/.claude/skills/`, `~/.codex/skills/`, `~/.vscode/skills/`, etc. The hand-created original in `~/.claude/skills/` is replaced by the symlink.
