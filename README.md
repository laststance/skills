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
| [analyze-app](skills/analyze-app/) | macOS app stack | — |
| [brainstorm-plan](skills/brainstorm-plan/) | Vague idea to approved plan | — |
| [brainstorm-search-plan](skills/brainstorm-search-plan/) | Vague idea via search to plan | — |
| [claude-code-plugin-hacker](skills/claude-code-plugin-hacker/) | Debug Claude Code plugins | — |
| [code-trace](skills/code-trace/) | Trace code flow | — |
| [codebase-litter-audit](skills/codebase-litter-audit/) | Find unfinished code litter | — |
| [codex-context-details](skills/codex-context-details/) | Codex context breakdown | OpenAI Codex CLI/Desktop **(required; Codex-only)** |
| [colorful-type](skills/colorful-type/) | Brand TS types | — |
| [component-hierarchy](skills/component-hierarchy/) | Next.js component tree | — |
| [coderabbit-resolver](skills/coderabbit-resolver/) | CodeRabbit PR loop | — |
| [cookie](skills/cookie/) | Chrome cookies to Playwright | `playwright-cli` **(required)**, Node.js **(required)** |
| [copy](skills/copy/) | Copy last agent reply | Python 3 **(required)**, macOS `pbcopy` **(required)** |
| [core-topic](skills/core-topic/) | React core deep-dive JP | [GitHub CLI](https://cli.github.com/) **(required)** |
| [create-hook](skills/create-hook/) | Build Claude Code hooks | — |
| [create-worktree](skills/create-worktree/) | Git worktree with env copy | — |
| [design](skills/design/) | Architecture plan architect | [Serena MCP](https://github.com/oraios/serena) (recommended), [Context7](https://github.com/upstash/context7) (recommended), [Perplexity MCP](https://github.com/ppl-ai/modelcontextprotocol) (recommended) |
| [deep-trace](skills/deep-trace/) | Line-by-line diff trace | [Serena MCP](https://github.com/oraios/serena) (recommended) |
| [dnd](skills/dnd/) | Coordinate drag-drop QA | `playwright-cli` **(required)**, `ffmpeg` (recommended for frame extraction) |
| [electron-release](skills/electron-release/) | Electron release ship | — |
| [exhaustive-real-world-scenario-qa](skills/exhaustive-real-world-scenario-qa/) | Exhaustive browser scenario QA | `playwright-cli` **(required)**, [Serena MCP](https://github.com/oraios/serena) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |
| [explain](skills/explain/) | Deep code explainer | [Serena MCP](https://github.com/oraios/serena) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |
| [git](skills/git/) | Smart git operations | — |
| [github-actions-pnpm-ci](skills/github-actions-pnpm-ci/) | Secure pnpm GitHub Actions CI | — |
| [hack-feed](skills/hack-feed/) | Deep JS hacker news JP | [Exa MCP](https://github.com/exa-labs/exa-mcp-server) **(required)**, [GitHub CLI](https://cli.github.com/) (recommended) |
| [issue](skills/issue/) | Create or list tracker issues | — |
| [i-write-code](skills/i-write-code/) | Daily coding habit prompts JP | — |
| [laststance-publish-skill](skills/laststance-publish-skill/) | Publish skill to registry | — |
| [load](skills/load/) | Load session from memory | [Serena MCP](https://github.com/oraios/serena) **(required)** |
| [locate-ui-from-code](skills/locate-ui-from-code/) | Code to screen capture | `playwright-cli` **(required)**, chrome-devtools MCP (recommended) |
| [lunch](skills/lunch/) | Casual lunch chat | — |
| [mentor](skills/mentor/) | Interactive code mentor | — |
| [newsletter-digest](skills/newsletter-digest/) | Deep newsletter summary | Gmail MCP **(required)**, sequential-thinking MCP (recommended), [Context7](https://github.com/upstash/context7) (recommended), [Exa MCP](https://github.com/exa-labs/exa-mcp-server) (recommended) |
| [product-inspiration](skills/product-inspiration/) | Top-app UI inspiration | [Tavily MCP](https://github.com/tavily-ai/tavily-mcp-server) (recommended) |
| [prop-drill](skills/prop-drill/) | Trace React prop drilling | [Serena MCP](https://github.com/oraios/serena) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |
| [qa-cli](skills/qa-cli/) | CLI black-box QA | — |
| [qa-electron](skills/qa-electron/) | Electron black-box QA | `playwright-cli` **(required)**; Computer Use MCP (recommended) for native menu/tray checks |
| [qa-ios](skills/qa-ios/) | iOS Simulator QA | [iOS Simulator MCP](https://github.com/nichochar/ios-simulator-mcp) **(required)** |
| [qa-react-native](skills/qa-react-native/) | React Native device QA | [iOS Simulator MCP](https://github.com/nichochar/ios-simulator-mcp) **(required)**, Android SDK / `adb` |
| [qa-team](skills/qa-team/) | Parallel QA agent team | [Serena MCP](https://github.com/oraios/serena) (recommended), platform-dependent MCP (see below) |
| [qa-tui](skills/qa-tui/) | Terminal UI black-box QA | [Shellwright MCP](https://github.com/aorwall/shellwright) **(required)** |
| [react-query-key-jump](skills/react-query-key-jump/) | Jump to queryKey hook | [ripgrep](https://github.com/BurntSushi/ripgrep) **(required)** |
| [save](skills/save/) | Save session to memory | [Serena MCP](https://github.com/oraios/serena) **(required)** |
| [search](skills/search/) | Multi-tool cited research | [Exa MCP](https://github.com/exa-labs/exa-mcp-server) (recommended), [Perplexity MCP](https://github.com/ppl-ai/modelcontextprotocol) (recommended), [Tavily MCP](https://github.com/tavily-ai/tavily-mcp-server) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |
| [search-first](skills/search-first/) | Research before coding | — |
| [show-system-prompt](skills/show-system-prompt/) | Reveal agent system prompt | — |
| [simplify](skills/simplify/) | Review diff for quality | — |
| [source-grounded-research](skills/source-grounded-research/) | Cited research briefs | [Context7](https://github.com/upstash/context7) (recommended), web search / MCP (recommended) |
| [skill-inspect](skills/skill-inspect/) | Inspect skill ecosystem | — |
| [sync-pencil](skills/sync-pencil/) | Sync Pencil pen and code | Pencil MCP **(required)**, `playwright-cli` (Web + Electron via CDP) / [iOS Simulator MCP](https://github.com/nichochar/ios-simulator-mcp) (iOS) |
| [syncing-docs-and-memory](skills/syncing-docs-and-memory/) | Sync docs and memory | [Serena MCP](https://github.com/oraios/serena) (recommended), [GitHub CLI](https://cli.github.com/) (recommended) |
| [task](skills/task/) | Five-phase implementation workflow | [Serena MCP](https://github.com/oraios/serena) **(required)**, [Context7](https://github.com/upstash/context7) (recommended) |
| [troubleshoot](skills/troubleshoot/) | Hypothesis-driven root-cause fix | [Serena MCP](https://github.com/oraios/serena) **(required)**, [Context7](https://github.com/upstash/context7) (recommended) |
| [type-expand](skills/type-expand/) | Expand TS aliases to shapes | [tsx](https://github.com/privatenumber/tsx) (recommended), TypeScript project `tsconfig.json` **(required)** |
| [ts-pattern-refactor](skills/ts-pattern-refactor/) | Refactor branches to ts-pattern | [ts-pattern](https://github.com/gvergnaud/ts-pattern) **(required)**, [Context7](https://github.com/upstash/context7) (recommended), [Serena MCP](https://github.com/oraios/serena) (recommended) |
| [ux-gap-detector](skills/ux-gap-detector/) | SaaS UX gap audit | `playwright-cli` **(required)**, [Serena MCP](https://github.com/oraios/serena) (recommended) |
| [visual-lint](skills/visual-lint/) | Screenshot UI defect lint | `playwright-cli` **(required)** |
| [x-agents-cross-review](skills/x-agents-cross-review/) | Multi-agent parallel review | [Serena MCP](https://github.com/oraios/serena) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |

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
