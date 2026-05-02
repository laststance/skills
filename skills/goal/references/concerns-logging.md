# Concerns Logging — Format Reference

The `issue_tracker` field of `goal.json` selects one of three destinations.
Always log first, then continue work — never pause to discuss concerns
with the user.

## Triggers (when to log)

Log to concerns destination when:
- You face an uncertain choice and resolve it under R2 (auto-proceed) in
  a way that is non-obvious or you suspect could be wrong.
- You encounter unexpected file content, missing dependency, undocumented
  behavior, or anything that surprises you.
- A sub-skill emits AskUserQuestion under R5; log its full options + your
  selection.
- A criterion looks ambiguous mid-pursuit; log how you interpreted it.
- The completion gate fails; log violations before fixing.

## When NOT to log

- Routine commands and their outputs (already in conversation history).
- Decisions where there was no real ambiguity (one obviously-right answer).
- Trivial typo fixes or formatting.
- Internal reasoning steps already visible in tool calls.

## Destination 1 — `issue_tracker: "github"`

```bash
gh issue create \
  --title "[goal-concern] <≤60 chars topic>" \
  --body "$(cat <<'EOF'
**Goal:** <objective from goal.json>

**Context:** <where in pursuit you are>

**What surprised / what was uncertain:**
<2-4 sentences>

**Decision taken (under R2):**
<what you chose, briefly>

**Why:**
<one sentence reason>

**Reversibility:**
<easy to roll back / hard to roll back / N/A>
EOF
)"
```

Capture the resulting issue URL into the next assistant message so the
user can find it later. Do NOT add labels (project-specific).

## Destination 2 — `issue_tracker: "linear"`

Use the MCP tool. Title and body follow the same format as github above.

```
mcp__claude_ai_Linear__save_issue
  title:  "[goal-concern] <≤60 chars topic>"
  description: <same body template as github>
  team:   <prompt user once at /goal start IF Linear chosen, else skip>
```

If team is unknown and cannot be inferred, fall back to file destination
for this single concern.

## Destination 3 — `issue_tracker: "file"`

Append to `<cwd>/.claude/goal-notes.md` (created on first use). Section
header format:

```markdown
## YYYY-MM-DDTHH:MM <≤60 chars topic>

**Context:** <where in pursuit>

**What surprised / what was uncertain:**
<2-4 sentences>

**Decision taken (under R2):**
<choice, briefly>

**Why:** <one sentence>

**Reversibility:** <easy / hard / N/A>

---
```

Use ISO-8601 UTC for the timestamp. The trailing `---` separates entries.

## Sub-skill question logging (R5)

When a sub-skill emits AskUserQuestion, the body adds an extra section:

```markdown
**Sub-skill question:** <verbatim question>

**Options offered:**
- A) <label> — <description> [recommended]
- B) <label> — <description>
- C) <label> — <description>

**Selected:** A) <label> (recommended)
```

For github/linear, include the same section in the body.
