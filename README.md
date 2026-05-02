# Laststance Skills

Agent skills for AI coding assistants. Install via [skills.sh](https://skills.sh).

## Installation

Install all skills:

```bash
npx skills add laststance/skills
```

Install a specific skill:

```bash
npx skills add laststance/skills --skill analyze-app
npx skills add laststance/skills --skill bulk-issues
npx skills add laststance/skills --skill claude-code-plugin-hacker
npx skills add laststance/skills --skill code-trace
npx skills add laststance/skills --skill colorful-type
npx skills add laststance/skills --skill coderabbit-resolver
npx skills add laststance/skills --skill create-hook
npx skills add laststance/skills --skill design
npx skills add laststance/skills --skill deep-trace
npx skills add laststance/skills --skill dnd
npx skills add laststance/skills --skill electron-release
npx skills add laststance/skills --skill english-conversation
npx skills add laststance/skills --skill exhaustive-real-world-scenario-qa
npx skills add laststance/skills --skill explain
npx skills add laststance/skills --skill gif-analyzer
npx skills add laststance/skills --skill git
npx skills add laststance/skills --skill goal
npx skills add laststance/skills --skill hack-feed
npx skills add laststance/skills --skill issue
npx skills add laststance/skills --skill laststance-publish-skill
npx skills add laststance/skills --skill load
npx skills add laststance/skills --skill lunch
npx skills add laststance/skills --skill mentor
npx skills add laststance/skills --skill newsletter-digest
npx skills add laststance/skills --skill product-inspiration
npx skills add laststance/skills --skill prop-drill
npx skills add laststance/skills --skill qa-cli
npx skills add laststance/skills --skill qa-electron
npx skills add laststance/skills --skill qa-ios
npx skills add laststance/skills --skill qa-react-native
npx skills add laststance/skills --skill qa-team
npx skills add laststance/skills --skill qa-tui
npx skills add laststance/skills --skill save
npx skills add laststance/skills --skill skill-inspect
npx skills add laststance/skills --skill sync-pencil
npx skills add laststance/skills --skill task
npx skills add laststance/skills --skill troubleshoot
npx skills add laststance/skills --skill ux-gap-detector
npx skills add laststance/skills --skill x-agents-cross-review
```

## Available Skills

| Skill | Description | Dependencies |
|-------|-------------|--------------|
| [analyze-app](skills/analyze-app/) | Analyze macOS .app bundles to identify technology stacks (Electron, Flutter, Qt, SwiftUI, native, etc.) by delegating to a specialized subagent. | — |
| [bulk-issues](skills/bulk-issues/) | Resolves all open GitHub Issues in bulk on a single feature branch, then creates a PR and runs a CodeRabbit review loop until merged. Each issue follows the full `/task` 5-phase cycle with mandatory frontend verification, E2E, and unit tests. | [GitHub CLI](https://cli.github.com/) **(required)**, [Serena MCP](https://github.com/oraios/serena) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |
| [claude-code-plugin-hacker](skills/claude-code-plugin-hacker/) | Debug, audit, and fix Claude Code plugin system issues — hook errors, plugin misbehavior, cache investigation. Knows that `enabledPlugins: false` is not a true kill switch (hooks still execute, skills still accessible). | — |
| [code-trace](skills/code-trace/) | Interactive code execution path tracer. Explains how code flows from entry point to output with step-by-step navigation. | — |
| [colorful-type](skills/colorful-type/) | Replace colorless primitives (`string`, `number`, `boolean`) with domain-rich types. Adds branded types, JSDoc, and named type aliases to communicate intent. | — |
| [coderabbit-resolver](skills/coderabbit-resolver/) | Automates the full CodeRabbit PR review cycle — fix comments, resolve threads, pass CI, merge, and clean up. Supports `--bulk` for all open PRs. | — |
| [create-hook](skills/create-hook/) | Creates, debugs, and extends Claude Code hooks. Builds reliable hooks that survive real-world event firing — covers SessionStart, PostCompact, PreToolUse, PostToolUse, UserPromptSubmit, Stop, and Notification handlers, `additionalContext` injection, and tool gating. | — |
| [design](skills/design/) | Architecture-driven plan creation with 5-phase pipeline: Research → Architecture → 3-reviewer loop (max 5 rounds) → Final Review → Plan Output. "Weakest LLM Proof" principle ensures plans are executable by any AI agent. | [Serena MCP](https://github.com/oraios/serena) (recommended), [Context7](https://github.com/upstash/context7) (recommended), [Perplexity MCP](https://github.com/ppl-ai/modelcontextprotocol) (recommended) |
| [deep-trace](skills/deep-trace/) | Line-by-line execution path tracer for PR diffs, git diffs, or specified code sections. Maps every line to its screen/URL, data flow, and execution context like a debugger's step-through. | [Serena MCP](https://github.com/oraios/serena) (recommended) |
| [dnd](skills/dnd/) | Browser drag-and-drop QA via coordinate-based pointer ops. Knowledge-injection skill loaded by browser-using skills (`task`, `troubleshoot`, `qa-team`, `qa-electron`, `ux-gap-detector`, `exhaustive-real-world-scenario-qa`, `sync-pencil`, `bulk-issues`) before any browser interaction — ref-based `drag` returns false success on `dnd-kit` and similar libraries. | `playwright-cli` (recommended) |
| [electron-release](skills/electron-release/) | Guides Electron app release process including build, code signing, notarization, and GitHub Release with auto-update support. | — |
| [english-conversation](skills/english-conversation/) | English conversation practice partner for Japanese learners. Responds naturally in English with implicit recast and session summary with corrections. | macOS `say` command (for TTS) |
| [exhaustive-real-world-scenario-qa](skills/exhaustive-real-world-scenario-qa/) | Exhaustive Real World Scenario QA via `playwright-cli` (headed mode). Generates 99.9% happy-path coverage + TC3-style edge cases from source + spec, loops 3x to catch state-dependent bugs. Three modes: Main Claude (default), Fresh Agent (`--fresh-agent`), Team (`--team`) with Design Checker + Bug Hunter. | `playwright-cli` **(required)**, [Serena MCP](https://github.com/oraios/serena) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |
| [explain](skills/explain/) | Deep, systematic explanation of code, concepts, and system behavior. Always operates at advanced level with introspection markers and validation. | [Serena MCP](https://github.com/oraios/serena) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |
| [gif-analyzer](skills/gif-analyzer/) | Analyze animated GIF files by extracting and viewing frames as sequential video. | — |
| [git](skills/git/) | Git operations with intelligent commit messages and workflow optimization. Analyzes changes to generate Conventional Commit messages automatically. | — |
| [goal](skills/goal/) | Pursuit-mode autonomy: pursue a single strongly-desired objective to verifiable completion. Auto-derives 3-5 success criteria, suppresses sub-skill interruptions (auto-selects recommended options), logs concerns to GitHub/Linear instead of blocking on the user, and runs an adversarial review gate before declaring achievement. | [GitHub CLI](https://cli.github.com/) (recommended), [Linear MCP](https://linear.app/docs/mcp) (recommended) |
| [hack-feed](skills/hack-feed/) | OSS hacker news feed for JavaScript/React/Next.js internals (TC39, V8, fiber/scheduler, transpilation, JIT). Two-phase: ToC display → numbered selection → Explain-skill-level deep dive. Hybrid sourcing from GitHub, HN, RSS, and Exa web search. Output: Japanese (MVP). | [Exa MCP](https://github.com/exa-labs/exa-mcp-server) **(required)**, [GitHub CLI](https://cli.github.com/) (recommended) |
| [issue](skills/issue/) | Creates issues on the project's tracker (GitHub Issues or Linear) and lists open issues. Auto-detects which tracker the project uses; feature requests follow a strict non-engineer-voice template. | — |
| [laststance-publish-skill](skills/laststance-publish-skill/) | Publishes a stable skill to the laststance/skills GitHub registry for distribution via `npx skills add`. Updates README install commands, skills table, and usage examples in alphabetical order. | — |
| [load](skills/load/) | Load project context from Serena MCP memory for session initialization. Discovers memories, reads project overview, and validates context sufficiency. | [Serena MCP](https://github.com/oraios/serena) **(required)** |
| [lunch](skills/lunch/) | Relaxed mealtime conversation companion. Claude declares a food choice with trivia, then chats about any topic in a casual tone. | — |
| [mentor](skills/mentor/) | Interactive code mentoring with pseudo-Plan mode. AI analyzes, designs, and presents a visual blueprint — human approves then writes code with AI guidance. | — |
| [newsletter-digest](skills/newsletter-digest/) | Summarizes tech newsletter emails from Gmail with 5x detail depth, structured analysis, and technical context. Adapts to each newsletter's section structure and enriches main articles with library docs and web context. | Gmail MCP **(required)**, sequential-thinking MCP (recommended), [Context7](https://github.com/upstash/context7) (recommended), [Exa MCP](https://github.com/exa-labs/exa-mcp-server) (recommended) |
| [product-inspiration](skills/product-inspiration/) | Provides UI/feature implementation inspiration by researching top-tier apps. Implements all proposed patterns in _trials/ folder for hands-on evaluation. | [Tavily MCP](https://github.com/tavily-ai/tavily-mcp-server) (recommended) |
| [prop-drill](skills/prop-drill/) | Trace React prop-drilling paths from origin definition to leaf consumers. Shows the original prop definition as a clickable code block, the full drilling route as a table, and a Mermaid flowchart. | [Serena MCP](https://github.com/oraios/serena) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |
| [qa-cli](skills/qa-cli/) | Systematic black-box QA for command-line tools (one-shot commands, flags, subcommands, pipes). Covers `--help` / `--version` sanity, flag parsing, exit codes, stdout vs stderr, error message quality, stdin / file / pipe I/O, env + config precedence, signal handling. Report-only — does not modify the tool. | — |
| [qa-electron](skills/qa-electron/) | Systematic black-box QA for a running Electron app via `playwright-cli` (CDP attach to Electron's `--remote-debugging-port=9222`): evidence capture, structured bug reports with severity, accessibility, native OS integration, and security spot-checks. Report-only — does not modify app source. | `playwright-cli` **(required)**; Computer Use MCP (recommended) for native menu/tray checks |
| [qa-ios](skills/qa-ios/) | Systematic black-box QA for iOS apps in the iOS Simulator. Severity-graded bug reports with screenshots, AX-tree evidence, and HIG compliance findings. Report-only — does not modify Swift source. | [iOS Simulator MCP](https://github.com/nichochar/ios-simulator-mcp) **(required)** |
| [qa-react-native](skills/qa-react-native/) | Systematic black-box QA for React Native (bare RN or Expo) on iOS Simulator and Android Emulator. Bug reports with screenshots, AX evidence, redbox / LogBox findings, native log excerpts, and platform-parity observations. | [iOS Simulator MCP](https://github.com/nichochar/ios-simulator-mcp) **(required)**, Android SDK / `adb` |
| [qa-team](skills/qa-team/) | Launch comprehensive QA Agent Team for post-implementation verification. Tests 5 perspectives in parallel: Visual Integrity, Functional Correctness, Apple HIG, Edge Cases, and UX Sensibility. | [Serena MCP](https://github.com/oraios/serena) (recommended), platform-dependent MCP (see below) |
| [qa-tui](skills/qa-tui/) | Systematic black-box QA for TUI apps (htop, vim, lazygit, tmux, k9s, etc.) running in a shellwright PTY session. Bug reports with screenshots, key-sequence repros, and terminal-compatibility findings. Report-only — does not modify the tool. | [Shellwright MCP](https://github.com/aorwall/shellwright) **(required)** |
| [save](skills/save/) | Save session context to Serena MCP memory for cross-session persistence. Analyzes accomplishments, persists learnings, and creates session checkpoints. | [Serena MCP](https://github.com/oraios/serena) **(required)** |
| [skill-inspect](skills/skill-inspect/) | Read-only diagnostic. Resolves any name across the skill ecosystem (skills, plugins, agents, MCP servers, legacy commands) and displays a structured info card with provenance, metadata, and cross-tool availability across `~/.claude`, `~/.cursor`, `~/.codex`, `~/.gemini`, `~/.vscode`, `~/.antigravity`. | — |
| [sync-pencil](skills/sync-pencil/) | Bidirectional sync between `.pen` design files and implementation code. Supports Electron, Web, and iOS Simulator. Use when updating designs from code, generating code from designs, or resolving drift. | Pencil MCP **(required)**, `playwright-cli` (Web + Electron via CDP) / [iOS Simulator MCP](https://github.com/nichochar/ios-simulator-mcp) (iOS) |
| [task](skills/task/) | Standard implementation workflow with systematic 5-phase cycle: Investigate → Plan → Implement → Verify → Complete. Integrates quality gates and introspection markers. | [Serena MCP](https://github.com/oraios/serena) **(required)**, [Context7](https://github.com/upstash/context7) (recommended) |
| [troubleshoot](skills/troubleshoot/) | Diagnose and fix issues in code, builds, deployments, and system behavior. Hypothesis-driven 6-phase debugging with evidence-based verification and `--frontend-verify` support. | [Serena MCP](https://github.com/oraios/serena) **(required)**, [Context7](https://github.com/upstash/context7) (recommended) |
| [ux-gap-detector](skills/ux-gap-detector/) | Detects UI/UX quality gaps in authenticated SaaS web apps via `playwright-cli`. Crawls app interior, captures screenshots, scores across 4 dimensions (Typography & Spacing, Interactive States, Content Hierarchy, Loading & Error UX), and generates an actionable Markdown gap report. Optionally creates GitHub Issues. | `playwright-cli` **(required)**, [Serena MCP](https://github.com/oraios/serena) (recommended) |
| [x-agents-cross-review](skills/x-agents-cross-review/) | Multi-agent parallel cross-review. Launches X agents in parallel (Opus, full tool access) to independently review the same scope from different perspectives (baseline, devil's advocate, type safety, security, etc.), then consolidates findings into a unified consensus report. | [Serena MCP](https://github.com/oraios/serena) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |

### Platform-dependent MCP for `--frontend-verify` (task, troubleshoot) and qa-team

| Platform | MCP Server |
|----------|------------|
| Web | `playwright-cli` (CLI via Bash) |
| Electron | `/qa-electron` skill (`playwright-cli` CDP-attach based) |
| iOS / Expo | [iOS Simulator MCP](https://github.com/nichochar/ios-simulator-mcp) |
| macOS native | [Mac MCP Server](https://github.com/nichochar/mac-mcp-server) |
| CLI / TUI | [Shellwright MCP](https://github.com/aorwall/shellwright) |

## Usage

After installation, invoke skills as slash commands in your AI coding assistant:

```
/analyze-app Linear                 # Analyze macOS app technology stack
/bulk-issues                        # Resolve all open GitHub issues in one PR
/claude-code-plugin-hacker          # Debug Claude Code plugin issues
/code-trace                         # Trace code execution paths
/colorful-type                       # Replace primitives with domain types
/coderabbit-resolver 17             # Process PR #17
/create-hook                        # Build/debug Claude Code hooks
/design user authentication system   # Create detailed implementation plan
/deep-trace 42                      # Trace PR #42 line-by-line
/dnd                                # Load drag-and-drop coordinate-based verification protocol
/english-conversation               # Start English conversation practice
/exhaustive-real-world-scenario-qa  # Exhaustive QA via playwright-cli (3x loop, 3 modes)
/coderabbit-resolver --bulk         # Process all open PRs
/electron-release                   # Electron release workflow
/explain src/auth/middleware.ts      # Deep code explanation
/gif-analyzer ./demo.gif            # Analyze a GIF animation
/git commit                         # Smart git commit with Conventional Commits
/goal <objective>                   # Pursue a single objective autonomously
/hack-feed week                     # Browse top OSS hacker news for a period
/issue <description>                # Create issue on GitHub or Linear (auto-detects)
/laststance-publish-skill           # Publish a stable skill to laststance/skills
/load                               # Load session context from Serena MCP
/lunch                              # Casual mealtime chat companion
/mentor                             # Interactive code mentoring
/newsletter-digest JS Weekly        # Summarize tech newsletter from Gmail with 5x detail
/product-inspiration                # Get UI/feature inspiration
/prop-drill orderData OrderTable    # Trace prop-drilling path
/qa-cli mytool --version            # QA test a CLI tool (black-box)
/qa-electron                        # Systematic Electron desktop QA (playwright-cli CDP-attach + report)
/qa-ios                             # QA test iOS app in Simulator
/qa-react-native                    # QA test React Native app on iOS + Android
/qa-team                            # Launch QA verification team
/qa-tui lazygit                     # QA test a TUI app via shellwright
/save                               # Save session context to Serena MCP
/skill-inspect mentor               # Display info card for any skill/agent/MCP server
/sync-pencil                        # Sync .pen design ↔ code
/task fix the login button          # Systematic implementation workflow
/troubleshoot "build failing"       # Hypothesis-driven debugging
/ux-gap-detector                    # Detect UX gaps in authenticated SaaS web app
/x-agents-cross-review              # Multi-agent parallel review of code/specs/PRs
```

## License

MIT
