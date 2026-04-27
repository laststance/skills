# Tracker Detection Details

## Detection Priority

```
CLAUDE.md mentions "Linear"?       → Linear
Linear MCP connected (has teams)?  → Linear (verify with list_teams)
`gh` available + .git exists?      → GitHub (default)
None of the above?                 → Ask user
```

## Linear Detection

1. Call `mcp__claude_ai_Linear__list_teams` (limit: 5)
2. If returns teams → Linear is active
3. If multiple teams → ask user which team to use, or match by project name
4. Cache team selection for session

## GitHub Detection

Default tracker. Requirements:
- `.git/` directory exists (or `git rev-parse --is-inside-work-tree`)
- `gh auth status` succeeds (authenticated)
- Repo has GitHub remote (`gh repo view` succeeds)

## Caching

After first detection, store result in conversation context.
Do not re-detect on every invocation within the same session.

## Edge Cases

| Situation | Action |
|-----------|--------|
| Both Linear and GitHub configured | Prefer Linear if CLAUDE.md mentions it; otherwise ask user |
| No tracker found | Default to GitHub, confirm with user |
| `gh` not authenticated | Prompt: `! gh auth login` |
| Linear MCP fails / not connected | Fall back to GitHub |
