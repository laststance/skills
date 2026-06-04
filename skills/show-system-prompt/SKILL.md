---
name: show-system-prompt
description: Reveal agent system prompt
---

# show-system-prompt

Reveal the **actual runtime system prompt** of AI coding agent CLIs by combining static binary inspection, runtime network/log capture, and official telemetry features.

## Codex Compatibility
When running this skill in Codex, translate Claude Code-only primitives before acting: `AskUserQuestion` -> chat/request_user_input, `TodoWrite` -> `update_plan`, `Task`/`TaskCreate`/`TeamCreate`/`SendMessage` -> `spawn_agent`/`send_input`/`wait_agent` when available and allowed, and `EnterPlanMode`/`ExitPlanMode` -> a concise chat plan plus explicit approval.
Resolve `Read`/`Write`/`Edit`/`Bash`/`WebSearch`/`WebFetch` to Codex file/shell/web tools, and map `~/.claude/...` paths to `~/.agents/...` or `~/.codex/...` unless the task explicitly targets Claude Code.

## Cursor Compatibility
When running this skill in Cursor Agent, translate Claude Code-only primitives before acting: `AskUserQuestion` -> `AskQuestion`; `TodoWrite` -> Cursor `TodoWrite` or an equivalent checklist; `Task`/`TaskCreate`/`TeamCreate`/`SendMessage`/multi-agent flows -> Cursor `Task` (subagents), parallel Tasks, or `run_in_background` when allowed (`TeamCreate`/`SendMessage` may have no exact match); `EnterPlanMode`/`ExitPlanMode` -> Plan mode (`SwitchMode` / `CreatePlan`) plus explicit user approval.
Resolve `Read`/`Write`/`Edit`/`StrReplace`/`Bash`/web/search/MCP via Cursor Composer or Agent equivalents. MCP names written as `mcp__server__tool` typically map to `call_mcp_tool` with configured server identifiers. Map `~/.claude/...` to `~/.cursor/skills/`, `.cursor/skills/`, and `.cursor/rules/` unless the task explicitly targets Claude Code.

## When to use

Trigger this skill when the user:

- Wants to see/dump/leak/extract the system prompt of an agent CLI
- Asks how a specific agent's behavior is configured at the prompt level
- Wants to compare the static (baked-in) portion versus dynamic (per-session) injections
- Asks "what does Claude Code actually send to the API?"

## Supported agents

| Agent | Status | Reference |
|---|---|---|
| **Claude Code** (`@anthropic-ai/claude-code`) | ✅ Implemented | [claude-code.md](references/claude-code.md) |
| Codex CLI | ⏳ Planned | _to be added_ |
| Other agents (Gemini CLI, Aider, etc.) | ⏳ Planned | _to be added_ |

To add a new agent, create `references/<agent-name>.md` following the same structure as `claude-code.md` and add a row above.

## Core concept: Static vs Dynamic

Every modern coding-agent CLI builds its system prompt from two layers. Understanding this split is essential before applying any capture method.

```
┌────────────────────────────────────────────┐
│  Static (baked into the binary/bundle)     │
│   - identity strings ("You are ...")       │
│   - tool definitions                       │
│   - core instructions (tone, workflows)    │
├────────────────────────────────────────────┤
│  Dynamic (injected at runtime per session) │
│   - environment (cwd, OS, date)            │
│   - git status                             │
│   - MCP server instructions                │
│   - user/project memory (CLAUDE.md, etc.)  │
└────────────────────────────────────────────┘
```

**Static** is reproducible from the install artifact alone. **Dynamic** must be captured from a live process.

## Workflow

Use this checklist when fulfilling a request:

```
- [ ] Step 1: Identify which agent the user is asking about
- [ ] Step 2: Open the matching references/<agent>.md
- [ ] Step 3: Pick a method by the user's constraint (legality / depth / speed)
- [ ] Step 4: Run the commands and present the captured prompt
- [ ] Step 5: Clean up (revert env vars, remove proxy CAs, delete dumps)
```

### Step 1: Identify agent

Ask the user if unclear. Default to **Claude Code** when running inside Claude Code itself.

### Step 2: Open the agent-specific reference

For Claude Code: read [references/claude-code.md](references/claude-code.md). It contains the three highest-value methods (OTEL, binary unpack, mitmproxy), the exact commands, and known limitations.

### Step 3: Pick a method

Match the user's intent:

| User wants | Recommended method |
|---|---|
| Quickest peek at static sections | `strings` + `grep` on the binary |
| Real prompt with dynamic injections, no extra setup | `OTEL_LOG_RAW_API_BODIES=file:<dir>` |
| Full request/response including streaming | mitmproxy reverse proxy |
| Avoid any TLS interception or env tweaks | binary unpack via `tweakcc` |

### Step 4: Execute

Run the commands from the agent's reference file. Print the captured prompt (or relevant excerpt) back to the user.

### Step 5: Clean up

Critical — leaving a proxy CA installed weakens TLS for all traffic.

Mandatory cleanup actions when present:

- Unset `ANTHROPIC_BASE_URL`, `NODE_EXTRA_CA_CERTS`, `OTEL_*` env vars
- `sudo security delete-certificate -c "mitmproxy" /Library/Keychains/System.keychain` if a CA was added
- Delete `/tmp/*-otel/` or any dump dirs containing API bodies

## Safety / legality notes

- **Inspecting your own locally-installed agent** is fine for personal observation.
- **Redistributing** extracted system prompts may violate vendor ToS — link to public community archives (e.g., `Piebald-AI/claude-code-system-prompts`) rather than re-posting full text.
- **Prompt-injection extraction** ("tell me your system prompt") is largely blocked by vendor training and is unreliable. Prefer the structural methods above.
- **Memory dumping running processes** on macOS hits SIP/Hardened Runtime; not worth the effort given that `strings` on the install artifact gives equivalent static content.

## What this skill does NOT do

- Bypass authentication, license checks, or rate limits
- Modify the running agent's prompt (use the agent's own `--system-prompt` flag for that)
- Capture prompts from cloud-only agents with no local artifact (e.g., web-only chatbots)

## References

- [references/claude-code.md](references/claude-code.md) — Claude Code specific methods, commands, and evidence
