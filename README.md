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
npx skills add laststance/skills --skill code-trace
npx skills add laststance/skills --skill colorful-type
npx skills add laststance/skills --skill coderabbit-resolver
npx skills add laststance/skills --skill design
npx skills add laststance/skills --skill deep-trace
npx skills add laststance/skills --skill electron-release
npx skills add laststance/skills --skill english-conversation
npx skills add laststance/skills --skill exhaustive-real-world-scenario-qa
npx skills add laststance/skills --skill explain
npx skills add laststance/skills --skill gif-analyzer
npx skills add laststance/skills --skill git
npx skills add laststance/skills --skill issue
npx skills add laststance/skills --skill laststance-publish-skill
npx skills add laststance/skills --skill load
npx skills add laststance/skills --skill lunch
npx skills add laststance/skills --skill mentor
npx skills add laststance/skills --skill product-inspiration
npx skills add laststance/skills --skill prop-drill
npx skills add laststance/skills --skill qa-cli
npx skills add laststance/skills --skill qa-electron
npx skills add laststance/skills --skill qa-ios
npx skills add laststance/skills --skill qa-react-native
npx skills add laststance/skills --skill qa-team
npx skills add laststance/skills --skill qa-tui
npx skills add laststance/skills --skill save
npx skills add laststance/skills --skill sync-pencil
npx skills add laststance/skills --skill task
npx skills add laststance/skills --skill troubleshoot
npx skills add laststance/skills --skill ux-gap-detector
```

## Available Skills

| Skill | Description | Dependencies |
|-------|-------------|--------------|
| [analyze-app](skills/analyze-app/) | Analyze macOS .app bundles to identify technology stacks (Electron, Flutter, Qt, SwiftUI, native, etc.) by delegating to a specialized subagent. | — |
| [bulk-issues](skills/bulk-issues/) | Resolves all open GitHub Issues in bulk on a single feature branch, then creates a PR and runs a CodeRabbit review loop until merged. Each issue follows the full `/task` 5-phase cycle with mandatory frontend verification, E2E, and unit tests. | [GitHub CLI](https://cli.github.com/) **(required)**, [Serena MCP](https://github.com/oraios/serena) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |
| [code-trace](skills/code-trace/) | Interactive code execution path tracer. Explains how code flows from entry point to output with step-by-step navigation. | — |
| [colorful-type](skills/colorful-type/) | Replace colorless primitives (`string`, `number`, `boolean`) with domain-rich types. Adds branded types, JSDoc, and named type aliases to communicate intent. | — |
| [coderabbit-resolver](skills/coderabbit-resolver/) | Automates the full CodeRabbit PR review cycle — fix comments, resolve threads, pass CI, merge, and clean up. Supports `--bulk` for all open PRs. | — |
| [design](skills/design/) | Architecture-driven plan creation with 5-phase pipeline: Research → Architecture → 3-reviewer loop (max 5 rounds) → Final Review → Plan Output. "Weakest LLM Proof" principle ensures plans are executable by any AI agent. | [Serena MCP](https://github.com/oraios/serena) (recommended), [Context7](https://github.com/upstash/context7) (recommended), [Perplexity MCP](https://github.com/ppl-ai/modelcontextprotocol) (recommended) |
| [deep-trace](skills/deep-trace/) | Line-by-line execution path tracer for PR diffs, git diffs, or specified code sections. Maps every line to its screen/URL, data flow, and execution context like a debugger's step-through. | [Serena MCP](https://github.com/oraios/serena) (recommended) |
| [electron-release](skills/electron-release/) | Guides Electron app release process including build, code signing, notarization, and GitHub Release with auto-update support. | — |
| [english-conversation](skills/english-conversation/) | English conversation practice partner for Japanese learners. Responds naturally in English with implicit recast and session summary with corrections. | macOS `say` command (for TTS) |
| [exhaustive-real-world-scenario-qa](skills/exhaustive-real-world-scenario-qa/) | Exhaustive Real World Scenario QA via `playwright-cli` (headed mode). Generates 99.9% happy-path coverage + TC3-style edge cases from source + spec, loops 3x to catch state-dependent bugs. Three modes: Main Claude (default), Fresh Agent (`--fresh-agent`), Team (`--team`) with Design Checker + Bug Hunter. | `playwright-cli` **(required)**, [Serena MCP](https://github.com/oraios/serena) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |
| [explain](skills/explain/) | Deep, systematic explanation of code, concepts, and system behavior. Always operates at advanced level with introspection markers and validation. | [Serena MCP](https://github.com/oraios/serena) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |
| [gif-analyzer](skills/gif-analyzer/) | Analyze animated GIF files by extracting and viewing frames as sequential video. | — |
| [git](skills/git/) | Git operations with intelligent commit messages and workflow optimization. Analyzes changes to generate Conventional Commit messages automatically. | — |
| [issue](skills/issue/) | Creates issues on the project's tracker (GitHub Issues or Linear) and lists open issues. Auto-detects which tracker the project uses; feature requests follow a strict non-engineer-voice template. | — |
| [laststance-publish-skill](skills/laststance-publish-skill/) | Publishes a stable skill to the laststance/skills GitHub registry for distribution via `npx skills add`. Updates README install commands, skills table, and usage examples in alphabetical order. | — |
| [load](skills/load/) | Load project context from Serena MCP memory for session initialization. Discovers memories, reads project overview, and validates context sufficiency. | [Serena MCP](https://github.com/oraios/serena) **(required)** |
| [lunch](skills/lunch/) | Relaxed mealtime conversation companion. Claude declares a food choice with trivia, then chats about any topic in a casual tone. | — |
| [mentor](skills/mentor/) | Interactive code mentoring with pseudo-Plan mode. AI analyzes, designs, and presents a visual blueprint — human approves then writes code with AI guidance. | — |
| [product-inspiration](skills/product-inspiration/) | Provides UI/feature implementation inspiration by researching top-tier apps. Implements all proposed patterns in _trials/ folder for hands-on evaluation. | [Tavily MCP](https://github.com/tavily-ai/tavily-mcp-server) (recommended) |
| [prop-drill](skills/prop-drill/) | Trace React prop-drilling paths from origin definition to leaf consumers. Shows the original prop definition as a clickable code block, the full drilling route as a table, and a Mermaid flowchart. | [Serena MCP](https://github.com/oraios/serena) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |
| [qa-cli](skills/qa-cli/) | Systematic black-box QA for command-line tools (one-shot commands, flags, subcommands, pipes). Covers `--help` / `--version` sanity, flag parsing, exit codes, stdout vs stderr, error message quality, stdin / file / pipe I/O, env + config precedence, signal handling. Report-only — does not modify the tool. | — |
| [qa-electron](skills/qa-electron/) | Systematic black-box QA for a running Electron app via `electron-playwright-cli` (config-based auto-launch, no CDP port needed): evidence capture, structured bug reports with severity, accessibility, native OS integration, and security spot-checks. Report-only — does not modify app source. | `electron-playwright-cli` **(required)**; Computer Use MCP (recommended) for native menu/tray checks |
| [qa-ios](skills/qa-ios/) | Systematic black-box QA for iOS apps in the iOS Simulator. Severity-graded bug reports with screenshots, AX-tree evidence, and HIG compliance findings. Report-only — does not modify Swift source. | [iOS Simulator MCP](https://github.com/nichochar/ios-simulator-mcp) **(required)** |
| [qa-react-native](skills/qa-react-native/) | Systematic black-box QA for React Native (bare RN or Expo) on iOS Simulator and Android Emulator. Bug reports with screenshots, AX evidence, redbox / LogBox findings, native log excerpts, and platform-parity observations. | [iOS Simulator MCP](https://github.com/nichochar/ios-simulator-mcp) **(required)**, Android SDK / `adb` |
| [qa-team](skills/qa-team/) | Launch comprehensive QA Agent Team for post-implementation verification. Tests 5 perspectives in parallel: Visual Integrity, Functional Correctness, Apple HIG, Edge Cases, and UX Sensibility. | [Serena MCP](https://github.com/oraios/serena) (recommended), platform-dependent MCP (see below) |
| [qa-tui](skills/qa-tui/) | Systematic black-box QA for TUI apps (htop, vim, lazygit, tmux, k9s, etc.) running in a shellwright PTY session. Bug reports with screenshots, key-sequence repros, and terminal-compatibility findings. Report-only — does not modify the tool. | [Shellwright MCP](https://github.com/aorwall/shellwright) **(required)** |
| [save](skills/save/) | Save session context to Serena MCP memory for cross-session persistence. Analyzes accomplishments, persists learnings, and creates session checkpoints. | [Serena MCP](https://github.com/oraios/serena) **(required)** |
| [sync-pencil](skills/sync-pencil/) | Bidirectional sync between `.pen` design files and implementation code. Supports Electron, Web, and iOS Simulator. Use when updating designs from code, generating code from designs, or resolving drift. | Pencil MCP **(required)**, platform-dependent screenshot tool (`electron-playwright-cli` / `playwright-cli` / [iOS Simulator MCP](https://github.com/nichochar/ios-simulator-mcp)) |
| [task](skills/task/) | Standard implementation workflow with systematic 5-phase cycle: Investigate → Plan → Implement → Verify → Complete. Integrates quality gates and introspection markers. | [Serena MCP](https://github.com/oraios/serena) **(required)**, [Context7](https://github.com/upstash/context7) (recommended) |
| [troubleshoot](skills/troubleshoot/) | Diagnose and fix issues in code, builds, deployments, and system behavior. Hypothesis-driven 6-phase debugging with evidence-based verification and `--frontend-verify` support. | [Serena MCP](https://github.com/oraios/serena) **(required)**, [Context7](https://github.com/upstash/context7) (recommended) |
| [ux-gap-detector](skills/ux-gap-detector/) | Detects UI/UX quality gaps in authenticated SaaS web apps via `playwright-cli`. Crawls app interior, captures screenshots, scores across 4 dimensions (Typography & Spacing, Interactive States, Content Hierarchy, Loading & Error UX), and generates an actionable Markdown gap report. Optionally creates GitHub Issues. | `playwright-cli` **(required)**, [Serena MCP](https://github.com/oraios/serena) (recommended) |

### Platform-dependent MCP for `--frontend-verify` (task, troubleshoot) and qa-team

| Platform | MCP Server |
|----------|------------|
| Web | `playwright-cli` (CLI via Bash) |
| Electron | `/qa-electron` skill (`electron-playwright-cli` based) |
| iOS / Expo | [iOS Simulator MCP](https://github.com/nichochar/ios-simulator-mcp) |
| macOS native | [Mac MCP Server](https://github.com/nichochar/mac-mcp-server) |
| CLI / TUI | [Shellwright MCP](https://github.com/aorwall/shellwright) |

## Usage

After installation, invoke skills as slash commands in your AI coding assistant:

```
/analyze-app Linear                 # Analyze macOS app technology stack
/bulk-issues                        # Resolve all open GitHub issues in one PR
/code-trace                         # Trace code execution paths
/colorful-type                       # Replace primitives with domain types
/coderabbit-resolver 17             # Process PR #17
/design user authentication system   # Create detailed implementation plan
/deep-trace 42                      # Trace PR #42 line-by-line
/english-conversation               # Start English conversation practice
/exhaustive-real-world-scenario-qa  # Exhaustive QA via playwright-cli (3x loop, 3 modes)
/coderabbit-resolver --bulk         # Process all open PRs
/electron-release                   # Electron release workflow
/explain src/auth/middleware.ts      # Deep code explanation
/gif-analyzer ./demo.gif            # Analyze a GIF animation
/git commit                         # Smart git commit with Conventional Commits
/issue <description>                # Create issue on GitHub or Linear (auto-detects)
/laststance-publish-skill           # Publish a stable skill to laststance/skills
/load                               # Load session context from Serena MCP
/lunch                              # Casual mealtime chat companion
/mentor                             # Interactive code mentoring
/product-inspiration                # Get UI/feature inspiration
/prop-drill orderData OrderTable    # Trace prop-drilling path
/qa-cli mytool --version            # QA test a CLI tool (black-box)
/qa-electron                        # Systematic Electron desktop QA (electron-playwright-cli + report)
/qa-ios                             # QA test iOS app in Simulator
/qa-react-native                    # QA test React Native app on iOS + Android
/qa-team                            # Launch QA verification team
/qa-tui lazygit                     # QA test a TUI app via shellwright
/save                               # Save session context to Serena MCP
/sync-pencil                        # Sync .pen design ↔ code
/task fix the login button          # Systematic implementation workflow
/troubleshoot "build failing"       # Hypothesis-driven debugging
/ux-gap-detector                    # Detect UX gaps in authenticated SaaS web app
```

## License

MIT
