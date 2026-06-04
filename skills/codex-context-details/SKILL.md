---
name: codex-context-details
description: Codex context breakdown
---

# Codex Context Details

## Codex Only

This skill is intentionally **OpenAI Codex CLI/Desktop specific**. It reads Codex-local telemetry such as `~/.codex/logs_2.sqlite` and `~/.codex/sessions/*.jsonl`, so it is not expected to work in Claude Code, Cursor, Windsurf, or other agents unless they are inspecting a Codex home directory.

## Codex Compatibility

Run this skill directly in OpenAI Codex CLI/Desktop. Use Codex file and shell tools to execute the bundled script, then summarize its Markdown table without exposing raw prompt, tool schema, log, token, API key, or MCP environment contents.

## Cursor Compatibility

This skill is not a native Cursor-context inspector. Only use it from Cursor when the user explicitly wants to inspect an OpenAI Codex home directory that exists on the same machine; otherwise explain that the telemetry source is Codex-specific.

## Workflow

Use the bundled script first. It reads local Codex telemetry only, avoids printing prompt contents, and emits a category table like:

```bash
python3 "$CODEX_HOME/skills/codex-context-details/scripts/context_details.py"
```

When `CODEX_HOME` is unset, replace it with `~/.codex`:

```bash
python3 "$HOME/.codex/skills/codex-context-details/scripts/context_details.py"
```

## What The Script Reports

- Current context window from the newest session JSONL token-count event.
- Request-level schema categories from the newest `response.create` request in `~/.codex/logs_2.sqlite`.
- Tool schema subtotals for Subagents, MCP helper tools, `tool_search`, plugin/app namespaces, and other local tools.
- Prompt-side subtotals for Skills catalog instructions, Plugin instructions, Apps/Connectors instructions, project `AGENTS.md`, invoked skill payloads, and remaining conversation history.

## Output Rules

- Report the Markdown table directly in Japanese when the user asks for "この表" or "内訳".
- Say the values are approximate unless they come from `last_token_usage` / `model_context_window`.
- Do not paste raw request JSON, tool schemas, logs, prompt text, tokens, API keys, or MCP environment values.
- If the script cannot find a latest request, fall back to:

```bash
codex debug prompt-input 'probe'
codex mcp list
codex plugin list
```

Then explain that only prompt-side and inventory information was available.
