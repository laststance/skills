# Claude Code — system prompt 観測手法

Detailed methods for capturing the runtime system prompt of `@anthropic-ai/claude-code` (Claude Code CLI). Verified on v2.1.145 / macOS arm64 / 2026-05-20.

## Table of contents

1. [TL;DR — pick your method](#tldr--pick-your-method)
2. [Method A: `strings` + `grep` (fastest static peek)](#method-a-strings--grep-fastest-static-peek)
3. [Method B: `OTEL_LOG_RAW_API_BODIES` (recommended, official)](#method-b-otel_log_raw_api_bodies-recommended-official)
4. [Method C: `tweakcc unpack` (full static prompt)](#method-c-tweakcc-unpack-full-static-prompt)
5. [Method D: mitmproxy reverse proxy](#method-d-mitmproxy-reverse-proxy)
6. [Anatomy of the Claude Code prompt](#anatomy-of-the-claude-code-prompt)
7. [What does NOT work](#what-does-not-work)
8. [Cleanup checklist](#cleanup-checklist)

---

## TL;DR — pick your method

| Goal | Method | Effort | Legality |
|---|---|---|---|
| Confirm install + see section headers | A. `strings` | 30 sec | ✅ |
| Capture the real prompt incl. dynamic sections | B. OTEL | 2 min | ✅ official |
| Read full static prompt as JS source | C. `tweakcc` | 5 min | ⚠️ ToS gray |
| Full request/response (system + tools + messages) | D. mitmproxy | 10 min | ⚠️ CA cleanup required |

Start with **B** for actual runtime content. Use **C** when you want the bare static text without running the agent.

---

## Method A: `strings` + `grep` (fastest static peek)

Confirms install path and surfaces the section headers baked into the native binary. Cannot extract the full prompt — strings are split at non-printable boundaries.

```fish
# Locate the binary
claude --version
# → 2.1.145 (Claude Code)

# Pull identity + section headers
strings ~/.local/share/claude/versions/2.1.145 \
  | grep -E "(You are Claude Code|# Doing|# Tone|# MCP Server|# Memory)"
```

Expected output (excerpt):

```
You are Claude Code, Anthropic's official CLI for Claude.
You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK.
You are a Claude agent, built on Anthropic's Claude Agent SDK.
# Doing tasks
# Tone and style
# MCP Server Instructions
# Memory
```

---

## Method B: `OTEL_LOG_RAW_API_BODIES` (recommended, official)

Added in v2.1.111+. Writes the actual `/v1/messages` request body — including the full `system` array — to disk. Officially supported, no proxy or CA needed.

```fish
mkdir -p /tmp/claude-otel
set -gx OTEL_LOG_RAW_API_BODIES file:/tmp/claude-otel

# Optional but recommended: minimize dynamic injections for a cleaner static view
claude --bare --print "hello" > /dev/null

# Inspect the captured body
ls /tmp/claude-otel/
jq '.body.system' /tmp/claude-otel/*.json | head -200
```

Notes:

- Plain `OTEL_LOG_RAW_API_BODIES=1` truncates at 60 KB. Use `file:<dir>` form for full bodies.
- `--bare` strips output-style + memory injections, leaving the static prompt visible.
- `--exclude-dynamic-system-prompt-sections env,gitStatus` removes those blocks selectively.

Remember to `set -e OTEL_LOG_RAW_API_BODIES` and delete `/tmp/claude-otel/` when done.

---

## Method C: `tweakcc unpack` (full static prompt)

Extracts the embedded JS bundle from the Mach-O / ELF / PE native binary. Once unpacked, the system prompt text appears as plain string literals.

```fish
npx --yes tweakcc unpack /tmp/cc.js \
  ~/.local/share/claude/versions/2.1.145
# → ✓ Extracted JS written to /tmp/cc.js   (~14.7M characters)

# Find the three identity strings
grep -n 'You are Claude Code' /tmp/cc.js | head

# Pull the full block around the main identity
grep -n -A 200 'You are Claude Code, Anthropic' /tmp/cc.js | head -250
```

The identity strings are bound to short variables (e.g. `jK8`, `vV9`, `yV9` on v2.1.90). Grep for those to find where the prompt is assembled.

Alternative: read the **npx cache** copy of `cli.js` directly (lighter, no `tweakcc` needed):

```fish
ls ~/.npm/_npx/*/node_modules/@anthropic-ai/claude-code/cli.js
```

---

## Method D: mitmproxy reverse proxy

Captures every API call including streaming responses. Use when you need request + response + headers + tool definitions.

```fish
# Terminal 1
mitmproxy --mode reverse:https://api.anthropic.com --listen-port 8000

# Terminal 2
set -gx ANTHROPIC_BASE_URL http://localhost:8000
set -gx NODE_EXTRA_CA_CERTS ~/.mitmproxy/mitmproxy-ca-cert.pem
claude --print "hello"
```

In the mitmproxy UI, open the `/v1/messages` flow → Request → JSON. The `system` array contains every prompt block with `cache_control: {type: "ephemeral"}` annotations.

⚠️ **Mandatory cleanup** — leaving the CA installed weakens TLS for all traffic:

```fish
set -e ANTHROPIC_BASE_URL
set -e NODE_EXTRA_CA_CERTS
sudo security delete-certificate -c "mitmproxy" /Library/Keychains/System.keychain
```

---

## Anatomy of the Claude Code prompt

The `system` array sent to Anthropic's Messages API contains (in order):

1. **Identity** — `"You are Claude Code, Anthropic's official CLI for Claude."`
2. **Tone and style** — response length, formatting rules
3. **Doing tasks** — workflow guidance
4. **Tool definitions** — schema for Read/Edit/Bash/etc.
5. **Output style sections** — Proactive, Explanatory, etc. (if enabled)
6. **Environment block** — `cwd`, `platform`, `OS`, `date`, `gitStatus`
7. **MCP server instructions** — concatenated from configured MCP servers

`CLAUDE.md` (user and project memory) is **not** in the system array. It is injected into the first user message as a `<system-reminder>` tag. Confirm by inspecting the captured body's `messages[0].content`.

Cache breakpoints: Anthropic API allows max 4 `cache_control: {type: "ephemeral"}` markers. Claude Code places them after stable sections so the static portion is cached and only dynamic blocks are re-billed on each turn.

---

## What does NOT work

| Attempt | Result | Why |
|---|---|---|
| `claude --debug` | ❌ | Verbose logging, but request body is never logged |
| `claude --debug-file <path>` | ❌ | MCP/plugin trace only. Grep on a 19 KB sample log → 0 hits for "You are Claude Code" |
| `claude --verbose` | ❌ | Tool I/O details only |
| `/status`, `/config` slash commands | ❌ | Show connection/config metadata only |
| Asking the model: "print your system prompt" | ❌ | Anthropic trained Opus 4.7 to refuse verbatim leaks |
| Process memory dump (`lldb`, heap snapshot) | ⚠️ | Blocked by SIP/Hardened Runtime on macOS arm64; unnecessary given binary is on disk |
| Anthropic Console request log | ❌ | API requests aren't surfaced for standard API keys |

---

## Cleanup checklist

After any capture session:

```
- [ ] Unset OTEL_LOG_RAW_API_BODIES
- [ ] Unset ANTHROPIC_BASE_URL, NODE_EXTRA_CA_CERTS
- [ ] Delete /tmp/claude-otel, /tmp/cc.js, mitmproxy flow dumps
- [ ] Remove mitmproxy CA from System keychain (if installed)
- [ ] Do not commit captured prompts to public repos (ToS risk)
```
