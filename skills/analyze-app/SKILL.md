---
name: analyze-app
description: macOS app stack
argument-hint: "[app-path]"
---

# Analyze App — macOS Application Stack Analyzer

## Codex Compatibility
When running this skill in Codex, translate Claude Code-only primitives before acting: `AskUserQuestion` -> chat/request_user_input, `TodoWrite` -> `update_plan`, `Task`/`TaskCreate`/`TeamCreate`/`SendMessage` -> `spawn_agent`/`send_input`/`wait_agent` when available and allowed, and `EnterPlanMode`/`ExitPlanMode` -> a concise chat plan plus explicit approval.
Resolve `Read`/`Write`/`Edit`/`Bash`/`WebSearch`/`WebFetch` to Codex file/shell/web tools, and map `~/.claude/...` paths to `~/.agents/...` or `~/.codex/...` unless the task explicitly targets Claude Code.

## Cursor Compatibility
When running this skill in Cursor Agent, translate Claude Code-only primitives before acting: `AskUserQuestion` -> `AskQuestion`; `TodoWrite` -> Cursor `TodoWrite` or an equivalent checklist; `Task`/`TaskCreate`/`TeamCreate`/`SendMessage`/multi-agent flows -> Cursor `Task` (subagents), parallel Tasks, or `run_in_background` when allowed (`TeamCreate`/`SendMessage` may have no exact match); `EnterPlanMode`/`ExitPlanMode` -> Plan mode (`SwitchMode` / `CreatePlan`) plus explicit user approval.
Resolve `Read`/`Write`/`Edit`/`StrReplace`/`Bash`/web/search/MCP via Cursor Composer or Agent equivalents. MCP names written as `mcp__server__tool` typically map to `call_mcp_tool` with configured server identifiers. Map `~/.claude/...` to `~/.cursor/skills/`, `.cursor/skills/`, and `.cursor/rules/` unless the task explicitly targets Claude Code.


Determines the technology stack of any macOS `.app` by inspecting its bundle structure, frameworks, binary, and metadata.

## Workflow

**All analysis MUST be delegated to the `app-stack-analyzer` subagent via the Task tool.**

### Step 1: Parse Input

Extract the `.app` path from the user's input. Accept:
- Full path: `/Applications/Linear.app`
- App name only: `Linear` → resolve to `/Applications/Linear.app`
- Relative path: `./MyApp.app`

If the path doesn't end with `.app`, append `.app`.
If no directory prefix, prepend `/Applications/`.

### Step 2: Validate Path

Confirm the app exists:
```bash
test -d "<resolved_path>/Contents" && echo "Valid" || echo "Invalid"
```

If invalid, inform the user and suggest checking the path or listing `/Applications/`.

### Step 3: Delegate to Subagent

**CRITICAL: Always use the Task tool to delegate analysis.**

```
Task(
  subagent_type: "Bash",
  description: "Analyze <AppName> tech stack",
  prompt: "Analyze the macOS application at '<app_path>' to determine its technology stack.

Execute these commands and report findings:

1. Info.plist analysis:
   plutil -p '<app_path>/Contents/Info.plist'

2. Frameworks inspection:
   ls '<app_path>/Contents/Frameworks/' 2>/dev/null || echo 'No Frameworks directory'

3. Binary analysis:
   file '<app_path>/Contents/MacOS/'*

4. Code signing:
   codesign -dv '<app_path>' 2>&1

5. If Electron detected (Electron Framework.framework exists):
   strings '<app_path>/Contents/Frameworks/Electron Framework.framework/Electron Framework' 2>/dev/null | grep -E '^Chrome/[0-9]' | head -1

6. Resources scan:
   ls '<app_path>/Contents/Resources/' | head -30

Based on ALL collected evidence, provide a structured analysis report:

## App Analysis: <AppName>

### Basic Info
| Property | Value |
|----------|-------|
| Name | ... |
| Bundle ID | ... |
| Version | ... |
| Min macOS | ... |
| Architecture | ... |
| Signed By | ... |

### Technology Stack
| Layer | Technology | Confidence | Evidence |
|-------|-----------|------------|----------|
| Runtime | ... | High/Medium/Low | ... |
| UI Framework | ... | ... | ... |
| Language | ... | ... | ... |
| Build Tool | ... | ... | ... |

### Frameworks Detected
List each framework with its purpose.

### Notable Details
Any interesting architectural or technical findings.

Detection rules:
- Electron: ElectronAsarIntegrity in plist OR Electron Framework.framework in Frameworks
- Flutter: Flutter.framework or FlutterMacOS.framework OR flutter_assets in Resources
- Qt: QtCore.framework or any Qt*.framework
- SwiftUI: SwiftUI references or modern Swift frameworks
- Native (AppKit): No cross-platform framework detected, Apple-only frameworks
- Catalyst: UIOKit.framework presence"
)
```

### Step 4: Present Results

Relay the subagent's analysis report to the user. Add any additional context if relevant.

## Multiple Apps

If the user provides multiple app paths, launch **parallel** Task calls — one per app.

## Examples

**Single app:**
```
/analyze-app /Applications/Linear.app
```

**App name only:**
```
/analyze-app Figma
```

**Multiple apps:**
```
/analyze-app Linear Notion Discord
```

## Success Criteria
- [ ] App path resolved and validated
- [ ] Analysis delegated to subagent (never done inline)
- [ ] Structured report returned with confidence levels
- [ ] Technology stack correctly identified with evidence
