# Laststance Skills

[![Agent Skills](https://img.shields.io/badge/Agent_Skills-open_standard-2F855A?style=flat-square)](https://agentskills.io/)
[![Claude Code](https://img.shields.io/badge/Claude_Code-compatible-D97757?style=flat-square&logo=claude&logoColor=white)](https://code.claude.com/docs/en/skills)
[![Cursor](https://img.shields.io/badge/Cursor-compatible-000000?style=flat-square&logo=cursor&logoColor=white)](https://cursor.com/docs/skills)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI_Codex-compatible-111827?style=flat-square&logo=openai&logoColor=white)](https://developers.openai.com/codex/skills)
[![Skills](https://img.shields.io/badge/skills-57-2563EB?style=flat-square)](#available-skills)

Agent skills for AI coding assistants. Install via [skills.sh](https://skills.sh).

## Installation

Install all skills:

```bash
npx skills add laststance/skills
```

Install a specific skill:

```bash
npx skills add laststance/skills --skill analyze-app
npx skills add laststance/skills --skill brainstorm-plan
npx skills add laststance/skills --skill brainstorm-search-plan
npx skills add laststance/skills --skill claude-code-plugin-hacker
npx skills add laststance/skills --skill code-trace
npx skills add laststance/skills --skill codebase-litter-audit
npx skills add laststance/skills --skill codex-context-details
npx skills add laststance/skills --skill colorful-type
npx skills add laststance/skills --skill component-hierarchy
npx skills add laststance/skills --skill coderabbit-resolver
npx skills add laststance/skills --skill cookie
npx skills add laststance/skills --skill copy
npx skills add laststance/skills --skill core-topic
npx skills add laststance/skills --skill create-hook
npx skills add laststance/skills --skill create-worktree
npx skills add laststance/skills --skill design
npx skills add laststance/skills --skill deep-trace
npx skills add laststance/skills --skill dnd
npx skills add laststance/skills --skill electron-release
npx skills add laststance/skills --skill exhaustive-real-world-scenario-qa
npx skills add laststance/skills --skill explain
npx skills add laststance/skills --skill git
npx skills add laststance/skills --skill github-actions-pnpm-ci
npx skills add laststance/skills --skill hack-feed
npx skills add laststance/skills --skill issue
npx skills add laststance/skills --skill i-write-code
npx skills add laststance/skills --skill laststance-publish-skill
npx skills add laststance/skills --skill load
npx skills add laststance/skills --skill locate-ui-from-code
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
npx skills add laststance/skills --skill react-query-key-jump
npx skills add laststance/skills --skill save
npx skills add laststance/skills --skill search
npx skills add laststance/skills --skill search-first
npx skills add laststance/skills --skill show-system-prompt
npx skills add laststance/skills --skill simplify
npx skills add laststance/skills --skill source-grounded-research
npx skills add laststance/skills --skill skill-inspect
npx skills add laststance/skills --skill sync-pencil
npx skills add laststance/skills --skill syncing-docs-and-memory
npx skills add laststance/skills --skill task
npx skills add laststance/skills --skill troubleshoot
npx skills add laststance/skills --skill type-expand
npx skills add laststance/skills --skill ts-pattern-refactor
npx skills add laststance/skills --skill ux-gap-detector
npx skills add laststance/skills --skill visual-lint
npx skills add laststance/skills --skill x-agents-cross-review
```

## Available Skills

| Skill | Description | Dependencies |
|-------|-------------|--------------|
| [analyze-app](skills/analyze-app/) | Analyze macOS .app bundles to identify technology stacks (Electron, Flutter, Qt, SwiftUI, native, etc.) by delegating to a specialized subagent. | — |
| [brainstorm-plan](skills/brainstorm-plan/) | Converge a vague request into an approved plan via two phases — Brainstorm (clarify intent with `AskUserQuestion`) and Plan (structure inside Claude Code plan mode, exit via `ExitPlanMode`). Search-free; for self-contained tasks where unknowns are preference-based — shell scripts, refactors, internal reorganization, dev tooling. | — |
| [brainstorm-search-plan](skills/brainstorm-search-plan/) | Converge a vague request into an approved plan via three interleaved phases — Brainstorm (clarify intent with `AskUserQuestion`), Search (gather facts via `/search`), Plan (structure inside Claude Code plan mode, exit via `ExitPlanMode`). Loops between phases until concrete. | — |
| [claude-code-plugin-hacker](skills/claude-code-plugin-hacker/) | Debug, audit, and fix Claude Code plugin system issues — hook errors, plugin misbehavior, cache investigation. Knows that `enabledPlugins: false` is not a true kill switch (hooks still execute, skills still accessible). | — |
| [code-trace](skills/code-trace/) | Interactive code execution path tracer. Explains how code flows from entry point to output with step-by-step navigation. | — |
| [codebase-litter-audit](skills/codebase-litter-audit/) | Audit repositories for half-finished features, stale TODOs, no-op handlers, visible UI wired to stubs, disabled tests, stale docs, placeholder assets, suppressions, and other codebase litter that dead-code tools miss. | — |
| [codex-context-details](skills/codex-context-details/) | Codex-only context inspector that summarizes current prompt, tool schema, Skill/MCP/Plugin/Subagent, `AGENTS.md`, memory, and conversation size from local Codex telemetry without printing raw prompt contents. | OpenAI Codex CLI/Desktop **(required; Codex-only)** |
| [colorful-type](skills/colorful-type/) | Replace colorless primitives (`string`, `number`, `boolean`) with domain-rich types. Adds branded types, JSDoc, and named type aliases to communicate intent. | — |
| [component-hierarchy](skills/component-hierarchy/) | Visualize where a React component sits in the Next.js tree (Page → target) as an ASCII diagram with file paths. Supports App Router and Pages Router. | — |
| [coderabbit-resolver](skills/coderabbit-resolver/) | Automates the full CodeRabbit PR review cycle — fix comments, resolve threads, pass CI, merge, and clean up. Supports `--bulk` for all open PRs. | — |
| [cookie](skills/cookie/) | Copy Google Chrome's cookies into `playwright-cli` (macOS) so its browser inherits every logged-in session (GitHub, etc.). Decrypts via the macOS Keychain, loads per-cookie, verifies before navigating, and deletes the plaintext token files after. | `playwright-cli` **(required)**, Node.js **(required)** |
| [copy](skills/copy/) | Copy the last Cursor agent message as clean markdown to the clipboard by extracting text from the agent transcript JSONL. | Python 3 **(required)**, macOS `pbcopy` **(required)** |
| [core-topic](skills/core-topic/) | Motivation igniter for lazy days: randomly picks a legendary GitHub PR/Issue/Discussion from the React/JS/TS/Node core ecosystem and delivers an inspiring deep-dive in Japanese. | [GitHub CLI](https://cli.github.com/) **(required)** |
| [create-hook](skills/create-hook/) | Creates, debugs, and extends Claude Code hooks. Builds reliable hooks that survive real-world event firing — covers SessionStart, PostCompact, PreToolUse, PostToolUse, UserPromptSubmit, Stop, and Notification handlers, `additionalContext` injection, and tool gating. | — |
| [create-worktree](skills/create-worktree/) | Creates a git worktree as a sibling directory to the current project (e.g., `../project-feat-x`), copies `.gitignore`d config files (`.env`, `.env.local`, etc.) while skipping heavy build/dependency directories (`node_modules`, `.next`, `dist`, `build`, `coverage`), then navigates into the new worktree. | — |
| [design](skills/design/) | Architecture-driven plan creation with 5-phase pipeline: Research → Architecture → 3-reviewer loop (max 5 rounds) → Final Review → Plan Output. "Weakest LLM Proof" principle ensures plans are executable by any AI agent. | [Serena MCP](https://github.com/oraios/serena) (recommended), [Context7](https://github.com/upstash/context7) (recommended), [Perplexity MCP](https://github.com/ppl-ai/modelcontextprotocol) (recommended) |
| [deep-trace](skills/deep-trace/) | Line-by-line execution path tracer for PR diffs, git diffs, or specified code sections. Maps every line to its screen/URL, data flow, and execution context like a debugger's step-through. | [Serena MCP](https://github.com/oraios/serena) (recommended) |
| [dnd](skills/dnd/) | Browser drag-and-drop QA via coordinate-based pointer ops, plus video + drop+10-frame evidence for motion-sensitive bugs (DragOverlay rollback, ghost return). Knowledge-injection skill loaded by browser-using skills (`task`, `troubleshoot`, `qa-team`, `qa-electron`, `ux-gap-detector`, `exhaustive-real-world-scenario-qa`, `sync-pencil`) before any browser interaction — ref-based `drag` returns false success on `dnd-kit` and similar libraries. | `playwright-cli` **(required)**, `ffmpeg` (recommended for frame extraction) |
| [electron-release](skills/electron-release/) | Guides Electron app release process including build, code signing, notarization, and GitHub Release with auto-update support. | — |
| [exhaustive-real-world-scenario-qa](skills/exhaustive-real-world-scenario-qa/) | Exhaustive Real World Scenario QA via `playwright-cli` (headed mode). Generates 99.9% happy-path coverage + TC3-style edge cases from source + spec, loops 3x to catch state-dependent bugs. Three modes: Main Claude (default), Fresh Agent (`--fresh-agent`), Team (`--team`) with Design Checker + Bug Hunter. | `playwright-cli` **(required)**, [Serena MCP](https://github.com/oraios/serena) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |
| [explain](skills/explain/) | Deep, systematic explanation of code, concepts, and system behavior. Always operates at advanced level with introspection markers and validation. | [Serena MCP](https://github.com/oraios/serena) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |
| [git](skills/git/) | Git operations with intelligent commit messages and workflow optimization. Analyzes changes to generate Conventional Commit messages automatically. | — |
| [github-actions-pnpm-ci](skills/github-actions-pnpm-ci/) | Creates secure pnpm/Node GitHub Actions CI with SHA-pinned actions, pnpm store caching, frozen installs, lint/test/build/typecheck workflows, and Dependabot updates. | — |
| [hack-feed](skills/hack-feed/) | OSS hacker news feed for JavaScript/React/Next.js internals (TC39, V8, fiber/scheduler, transpilation, JIT). Two-phase: ToC display → numbered selection → Explain-skill-level deep dive. Hybrid sourcing from GitHub, HN, RSS, and Exa web search. Output: Japanese (MVP). | [Exa MCP](https://github.com/exa-labs/exa-mcp-server) **(required)**, [GitHub CLI](https://cli.github.com/) (recommended) |
| [issue](skills/issue/) | Creates issues on the project's tracker (GitHub Issues or Linear) and lists open issues. Auto-detects which tracker the project uses; feature requests follow a strict non-engineer-voice template. | — |
| [i-write-code](skills/i-write-code/) | Daily coding habit assistant inspired by John Resig's "Write Code Every Day". Suggests practice from laststance repos, Web UI exercises, MDN APIs, and library internals. Japanese output. | — |
| [laststance-publish-skill](skills/laststance-publish-skill/) | Publishes a stable skill to the laststance/skills GitHub registry for distribution via `npx skills add`. Updates README install commands, skills table, and usage examples in alphabetical order. | — |
| [load](skills/load/) | Load project context from Serena MCP memory for session initialization. Discovers memories, reads project overview, and validates context sufficiency. | [Serena MCP](https://github.com/oraios/serena) **(required)** |
| [locate-ui-from-code](skills/locate-ui-from-code/) | Bridge code → screen by capturing a screenshot + DOM dump (outerHTML / computed styles / bounding box / a11y attributes) of the rendered UI element corresponding to a code component, selector, role, or text. Tool-agnostic — works in Claude Code, Cursor, and Codex via `playwright-cli`; uses chrome-devtools MCP when available. | `playwright-cli` **(required)**, chrome-devtools MCP (recommended) |
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
| [react-query-key-jump](skills/react-query-key-jump/) | Jump from a TanStack React Query `queryKey` string (e.g. `getDrawing`) to the `useQuery` / `useInfiniteQuery` hook line where that key is defined. Skips `invalidateQueries` usage sites. | [ripgrep](https://github.com/BurntSushi/ripgrep) **(required)** |
| [save](skills/save/) | Save session context to Serena MCP memory for cross-session persistence. Analyzes accomplishments, persists learnings, and creates session checkpoints. | [Serena MCP](https://github.com/oraios/serena) **(required)** |
| [search](skills/search/) | Iterative multi-tool research. Picks the best-fit tool (WebSearch, WebFetch, Exa, Perplexity, Tavily, Context7, DeepWiki) for the question type, then switches tool families across up to 3 passes until a citation-backed answer is reached. | [Exa MCP](https://github.com/exa-labs/exa-mcp-server) (recommended), [Perplexity MCP](https://github.com/ppl-ai/modelcontextprotocol) (recommended), [Tavily MCP](https://github.com/tavily-ai/tavily-mcp-server) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |
| [search-first](skills/search-first/) | Research-before-coding workflow. Search for existing tools, libraries, and patterns (repo, npm/PyPI, MCP servers, skills, GitHub) before writing custom code. Adopt → Extend → Compose → Build decision matrix. | — |
| [show-system-prompt](skills/show-system-prompt/) | Reveals the actual runtime system prompt of AI coding agent CLIs (currently Claude Code; Codex and others planned) via static binary inspection, official OTEL telemetry, and mitmproxy capture. Compares static (baked-in) vs dynamic (per-session) prompt sections. | — |
| [simplify](skills/simplify/) | Faithful recreation of Anthropic's removed `/simplify` Claude Code bundled skill. Reviews `git diff` via three parallel agents (Code Reuse, Code Quality, Efficiency) and fixes any issues found. Accepts free-form focus args appended under `## Additional Focus`. | — |
| [source-grounded-research](skills/source-grounded-research/) | Produces source-grounded research briefs with citations, contradiction handling, and query logs. Research-only — no implementation or speculative answers without sources. | [Context7](https://github.com/upstash/context7) (recommended), web search / MCP (recommended) |
| [skill-inspect](skills/skill-inspect/) | Read-only diagnostic. Resolves any name across the skill ecosystem (skills, plugins, agents, MCP servers, legacy commands) and displays a structured info card with provenance, metadata, and cross-tool availability across `~/.claude`, `~/.cursor`, `~/.codex`, `~/.gemini`, `~/.vscode`, `~/.antigravity`. | — |
| [sync-pencil](skills/sync-pencil/) | Bidirectional sync between `.pen` design files and implementation code. Supports Electron, Web, and iOS Simulator. Use when updating designs from code, generating code from designs, or resolving drift. | Pencil MCP **(required)**, `playwright-cli` (Web + Electron via CDP) / [iOS Simulator MCP](https://github.com/nichochar/ios-simulator-mcp) (iOS) |
| [syncing-docs-and-memory](skills/syncing-docs-and-memory/) | Bidirectional sync between project docs (README/AGENTS.md/CLAUDE.md/SPEC.md/etc.) and memory systems. Serena MCP automatic; gstack-learnings, gbrain, Notion/Obsidian/Inkdrop opt-in via speech. Scale-aware (Small/Medium/Large), AskUserQuestion-gated risky edits, and observed-truth memory write-back. | [Serena MCP](https://github.com/oraios/serena) (recommended), [GitHub CLI](https://cli.github.com/) (recommended) |
| [task](skills/task/) | Standard implementation workflow with systematic 5-phase cycle: Investigate → Plan → Implement → Verify → Complete. Integrates quality gates and introspection markers. | [Serena MCP](https://github.com/oraios/serena) **(required)**, [Context7](https://github.com/upstash/context7) (recommended) |
| [troubleshoot](skills/troubleshoot/) | Diagnose and fix issues in code, builds, deployments, and system behavior. Hypothesis-driven 6-phase debugging with evidence-based verification and `--frontend-verify` support. | [Serena MCP](https://github.com/oraios/serena) **(required)**, [Context7](https://github.com/upstash/context7) (recommended) |
| [type-expand](skills/type-expand/) | Expands TypeScript type aliases into concrete, primitive-resolved shapes — unions, intersections, generics, conditional types, infer-based types, and common utility types as far as statically resolvable. Use when IDE hover only shows alias names. | [tsx](https://github.com/privatenumber/tsx) (recommended), TypeScript project `tsconfig.json` **(required)** |
| [ts-pattern-refactor](skills/ts-pattern-refactor/) | Detect and refactor conditional code to ts-pattern's `match().with().exhaustive()`. Refactors JSX branching, chained ternaries, and discriminated-union dispatch — but deliberately leaves plain single-condition if-chains alone. Codifies syntactic-form × context judgment criteria. | [ts-pattern](https://github.com/gvergnaud/ts-pattern) **(required)**, [Context7](https://github.com/upstash/context7) (recommended), [Serena MCP](https://github.com/oraios/serena) (recommended) |
| [ux-gap-detector](skills/ux-gap-detector/) | Detects UI/UX quality gaps in authenticated SaaS web apps via `playwright-cli`. Crawls app interior, captures screenshots, scores across 4 dimensions (Typography & Spacing, Interactive States, Content Hierarchy, Loading & Error UX), and generates an actionable Markdown gap report. Optionally creates GitHub Issues. | `playwright-cli` **(required)**, [Serena MCP](https://github.com/oraios/serena) (recommended) |
| [visual-lint](skills/visual-lint/) | ESLint for rendered UI. Screenshots a running app via `playwright-cli` and runs a structured defect rubric over the pixels to catch display breakage that code lint/typecheck can't see — unintended wrapping, overflow/clipping, element overlap, misalignment, broken layout. Baseline-free (no golden image) and read-only — reports findings with cited evidence, never edits source. | `playwright-cli` **(required)** |
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
/brainstorm-plan <fuzzy>            # Vague → concrete via Brainstorm + Plan (no search)
/brainstorm-search-plan <fuzzy>     # Vague → concrete via Brainstorm + Search + Plan
/claude-code-plugin-hacker          # Debug Claude Code plugin issues
/code-trace                         # Trace code execution paths
/codebase-litter-audit              # Find half-finished codebase litter
/codex-context-details              # Show Codex-only context usage breakdown
/colorful-type                       # Replace primitives with domain types
/component-hierarchy Button.tsx      # ASCII tree from Page down to target component
/coderabbit-resolver 17             # Process PR #17
/cookie                             # Import Chrome cookies into a playwright-cli session
/copy                               # Copy last agent message to clipboard (markdown)
/core-topic                         # Random React/JS core GitHub deep-dive (Japanese)
/create-hook                        # Build/debug Claude Code hooks
/create-worktree feat/new-thing     # Create git worktree at ../project-feat-new-thing
/design user authentication system   # Create detailed implementation plan
/deep-trace 42                      # Trace PR #42 line-by-line
/dnd                                # Load drag-and-drop coordinate-based verification protocol
/exhaustive-real-world-scenario-qa  # Exhaustive QA via playwright-cli (3x loop, 3 modes)
/coderabbit-resolver --bulk         # Process all open PRs
/electron-release                   # Electron release workflow
/explain src/auth/middleware.ts      # Deep code explanation
/git commit                         # Smart git commit with Conventional Commits
/github-actions-pnpm-ci             # Add secure pnpm GitHub Actions CI
/hack-feed week                     # Browse top OSS hacker news for a period
/issue <description>                # Create issue on GitHub or Linear (auto-detects)
/i-write-code                       # Daily coding practice menu (Write Code Every Day)
/laststance-publish-skill           # Publish a stable skill to laststance/skills
/load                               # Load session context from Serena MCP
/locate-ui-from-code FolderHeader   # Bridge code → screen with screenshot + DOM dump
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
/react-query-key-jump getDrawing    # Jump to useQuery queryKey definition line
/save                               # Save session context to Serena MCP
/search what changed in React 19    # Iterative multi-tool research (Web + MCPs) until satisfied
/search-first add dead link checker # Research existing tools before writing custom code
/show-system-prompt                 # Reveal the running agent's actual system prompt
/simplify                           # Review changed code (reuse + quality + efficiency) and fix issues
/source-grounded-research React 19  # Cited research brief (no code changes)
/skill-inspect mentor               # Display info card for any skill/agent/MCP server
/sync-pencil                        # Sync .pen design ↔ code
/syncing-docs-and-memory            # Sync project docs and memory systems with current branch state
/task fix the login button          # Systematic implementation workflow
/troubleshoot "build failing"       # Hypothesis-driven debugging
/type-expand OrderItemSetting       # Expand a TypeScript type alias to its concrete shape
/ts-pattern-refactor                # Sweep codebase for ts-pattern refactor opportunities
/ux-gap-detector                    # Detect UX gaps in authenticated SaaS web app
/visual-lint                        # Screenshot a running app and lint the render for display breakage
/x-agents-cross-review              # Multi-agent parallel review of code/specs/PRs
```

## License

MIT
