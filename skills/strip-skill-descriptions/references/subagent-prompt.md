# Subagent Prompt Template

Pass this verbatim to each `general-purpose` subagent during Phase 3 of `strip-skill-descriptions`. Substitute `{{BATCH_FILE}}` with the per-batch path list (e.g. `/tmp/batch00`).

---

## Task

Empty the `description:` field in the YAML frontmatter of every SKILL.md path listed in `{{BATCH_FILE}}`. Each line in that file is one absolute path.

## Goal State

After your edits, each file's frontmatter must look like:

```yaml
---
name: <unchanged>
description:
<other-keys-unchanged>
---

<body unchanged>
```

The `description:` line must remain (do not delete the key) but its value must be empty (no characters after the colon, no continuation lines).

## YAML Format Variants You Will Encounter

You MUST handle all four variants below. Read each file first to identify which variant it uses before editing.

### 1. Single-line scalar

```yaml
description: Some text on one line
```

→ Edit to:

```yaml
description:
```

### 2. Quoted scalar

```yaml
description: "Some text"
description: 'Some text'
```

→ Edit to:

```yaml
description:
```

### 3. Literal block scalar (pipe)

```yaml
description: |
  Line one of description.
  Line two continues.
  Line three.
next-key: value
```

→ Edit to (remove `|` and ALL indented continuation lines):

```yaml
description:
next-key: value
```

### 4. Folded block scalar (greater-than)

```yaml
description: >
  Line one folded.
  Line two folded.
next-key: value
```

→ Edit to (remove `>` and ALL indented continuation lines):

```yaml
description:
next-key: value
```

## Constraints

1. **Only touch the `description:` field.** Leave `name`, `version`, `allowed-tools`, `triggers`, `argument-hint`, `preamble-tier`, `skill_api_version`, and any other key untouched.
2. **Preserve the closing `---`** on its own line.
3. **Do not modify the body** below the closing `---` (a single byte change there is a bug).
4. **Use the `Edit` tool** with the full multi-line `old_string` so the match is unique within the file.
5. **Read each file before editing.** This is required by the `Edit` tool and protects against assumptions about format.

## Edge Cases

- If a file has no `description:` field at all, **skip it** and report the path.
- If the closing `---` is missing or YAML is malformed, **skip it** and report the path — do not attempt to fix.
- If multiple `description:` lines appear (rare), only edit the one inside the YAML frontmatter (between the first two `---` lines).
- Symlinks have already been resolved upstream — every path in `{{BATCH_FILE}}` is an absolute, real-file path.

## Output Format

After processing all files, report:

- Number of files successfully edited.
- List of any files skipped (with reason).
- The first 3 edited files' new frontmatter (sanity sample).

Keep the report under 300 words. The orchestrator will run an `awk` verification pass over all files afterwards.
