# Laststance Skills

[![Agent Skills](https://img.shields.io/badge/Agent_Skills-open_standard-2F855A?style=flat-square)](https://agentskills.io/)
[![Claude Code](https://img.shields.io/badge/Claude_Code-compatible-D97757?style=flat-square&logo=claude&logoColor=white)](https://code.claude.com/docs/en/skills)
[![Cursor](https://img.shields.io/badge/Cursor-compatible-000000?style=flat-square&logo=cursor&logoColor=white)](https://cursor.com/docs/skills)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI_Codex-compatible-111827?style=flat-square&logo=openai&logoColor=white)](https://developers.openai.com/codex/skills)
[![Skills](https://img.shields.io/badge/skills-32-2563EB?style=flat-square)](#available-skills)

Agent skills for AI coding assistants. Install via [skills.sh](https://skills.sh).

## Installation

Install all skills:

```bash
npx skills add laststance/skills
```

Install a specific skill:

```bash
npx skills add laststance/skills --skill apollousa
npx skills add laststance/skills --skill claude-code-plugin-troubleshoot
npx skills add laststance/skills --skill chrome-clean-install
npx skills add laststance/skills --skill code-trace
npx skills add laststance/skills --skill codebase-litter-audit
npx skills add laststance/skills --skill colorful-type
npx skills add laststance/skills --skill component-hierarchy
npx skills add laststance/skills --skill coderabbit-resolver
npx skills add laststance/skills --skill cookie
npx skills add laststance/skills --skill create-worktree
npx skills add laststance/skills --skill deep-trace
npx skills add laststance/skills --skill dnd
npx skills add laststance/skills --skill electron-release
npx skills add laststance/skills --skill explain
npx skills add laststance/skills --skill feature-tour
npx skills add laststance/skills --skill github-actions-pnpm-ci
npx skills add laststance/skills --skill laststance-publish-skill
npx skills add laststance/skills --skill load
npx skills add laststance/skills --skill locate-ui-from-code
npx skills add laststance/skills --skill product-inspiration
npx skills add laststance/skills --skill prop-drill
npx skills add laststance/skills --skill react-query-key-jump
npx skills add laststance/skills --skill rec
npx skills add laststance/skills --skill save
npx skills add laststance/skills --skill search
npx skills add laststance/skills --skill simplify
npx skills add laststance/skills --skill source-grounded-research
npx skills add laststance/skills --skill type-expand
npx skills add laststance/skills --skill ts-pattern-refactor
npx skills add laststance/skills --skill ux-gap-detector
npx skills add laststance/skills --skill video
npx skills add laststance/skills --skill visual-lint
```

## Available Skills

| Skill | Description | Dependencies |
|-------|-------------|--------------|
| [apollousa](skills/apollousa/) | Creates a GitHub PR for completed work, then runs the full CodeRabbit review, CI, merge, and cleanup loop. | [coderabbit-resolver](skills/coderabbit-resolver/) **(required)** |
| [claude-code-plugin-troubleshoot](skills/claude-code-plugin-troubleshoot/) | Debug, audit, and fix Claude Code plugin system issues — hook errors, plugin misbehavior, cache investigation. Knows that `enabledPlugins: false` is not a true kill switch (hooks still execute, skills still accessible). | — |
| [chrome-clean-install](skills/chrome-clean-install/) | Refresh Chromium-based browsers by backing up profile/cache data, guiding a clean reinstall, and restoring bookmarks only. Handles Chrome, Chrome Canary, Edge, Brave, Arc, Dia, and custom Chromium browser paths. | [Node.js](https://nodejs.org/) **(required)** |
| [code-trace](skills/code-trace/) | Interactive code execution path tracer. Explains how code flows from entry point to output with step-by-step navigation. | — |
| [codebase-litter-audit](skills/codebase-litter-audit/) | Audit repositories for half-finished features, stale TODOs, no-op handlers, visible UI wired to stubs, disabled tests, stale docs, placeholder assets, suppressions, and other codebase litter that dead-code tools miss. | — |
| [colorful-type](skills/colorful-type/) | Replace colorless primitives (`string`, `number`, `boolean`) with domain-rich types. Adds branded types, JSDoc, and named type aliases to communicate intent. | — |
| [component-hierarchy](skills/component-hierarchy/) | Visualize where a React component sits in the Next.js tree (Page → target) as an ASCII diagram with file paths. Supports App Router and Pages Router. | — |
| [coderabbit-resolver](skills/coderabbit-resolver/) | Automates the full CodeRabbit PR review cycle — fix comments, resolve threads, pass CI, merge, and clean up. Supports `--bulk` for all open PRs. | — |
| [cookie](skills/cookie/) | Copy Google Chrome's cookies into `playwright-cli` (macOS) so its browser inherits every logged-in session (GitHub, etc.). Decrypts via the macOS Keychain, loads per-cookie, verifies before navigating, and deletes the plaintext token files after. | `playwright-cli` **(required)**, Node.js **(required)** |
| [create-worktree](skills/create-worktree/) | Creates a git worktree as a sibling directory to the current project (e.g., `../project-feat-x`), copies `.gitignore`d config files (`.env`, `.env.local`, etc.) while skipping heavy build/dependency directories (`node_modules`, `.next`, `dist`, `build`, `coverage`), then navigates into the new worktree. | — |
| [deep-trace](skills/deep-trace/) | Line-by-line execution path tracer for PR diffs, git diffs, or specified code sections. Maps every line to its screen/URL, data flow, and execution context like a debugger's step-through. | [Serena MCP](https://github.com/oraios/serena) (recommended) |
| [dnd](skills/dnd/) | Browser drag-and-drop QA via coordinate-based pointer ops, plus video + drop+10-frame evidence for motion-sensitive bugs (DragOverlay rollback, ghost return). Knowledge-injection skill loaded by browser-using skills (e.g. `ux-gap-detector`) before any browser interaction — ref-based `drag` returns false success on `dnd-kit` and similar libraries. | `playwright-cli` **(required)**, `ffmpeg` (recommended for frame extraction) |
| [electron-release](skills/electron-release/) | Guides Electron app release process including build, code signing, notarization, and GitHub Release with auto-update support. | — |
| [explain](skills/explain/) | Deep, systematic explanation of code, concepts, and system behavior. Always operates at advanced level with introspection markers and validation. | [Serena MCP](https://github.com/oraios/serena) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |
| [feature-tour](skills/feature-tour/) | Live onboarding tour of newly implemented code. Runs the target app in a debug session — the vscode-debug-mcp bridge and playwright-cli attach to the same Chrome — pauses at curated breakpoints inside the new code while driving the real UI, narrates each stop in chat mapping UI moments to exact file:line, and writes a replayable tour artifact (before/after screenshots + deep-trace-extension replay table). | `playwright-cli` **(required)**, [Debug MCP Bridge](https://github.com/laststance/vscode-debug-mcp) **(required)**, [Serena MCP](https://github.com/oraios/serena) (recommended) |
| [github-actions-pnpm-ci](skills/github-actions-pnpm-ci/) | Creates secure pnpm/Node GitHub Actions CI with SHA-pinned actions, pnpm store caching, frozen installs, lint/test/build/typecheck workflows, and Dependabot updates. | — |
| [laststance-publish-skill](skills/laststance-publish-skill/) | Publishes a stable skill to the laststance/skills GitHub registry for distribution via `npx skills add`. Updates README install commands, skills table, and usage examples in alphabetical order. | — |
| [load](skills/load/) | Load project context from Serena MCP memory for session initialization. Discovers memories, reads project overview, and validates context sufficiency. | [Serena MCP](https://github.com/oraios/serena) **(required)** |
| [locate-ui-from-code](skills/locate-ui-from-code/) | Code → screen: locate UI with on-screen highlight overlay (ring + file badge), reach logic branches (`debugger`, `if`, `useEffect`, handlers) by executing the user operations that trigger them, and capture DOM dump + highlighted screenshots. Agent runs the reach recipe itself and leaves the browser open for DevTools. Tool-agnostic — `cursor-ide-browser` MCP (Cursor), `playwright-cli` (Codex/Claude Code), chrome-devtools MCP when available. | `playwright-cli` (Codex/Claude Code), cursor-ide-browser MCP (Cursor), chrome-devtools MCP (recommended) |
| [product-inspiration](skills/product-inspiration/) | Provides UI/feature implementation inspiration by researching top-tier apps. Implements all proposed patterns in _trials/ folder for hands-on evaluation. | [Tavily MCP](https://github.com/tavily-ai/tavily-mcp-server) (recommended) |
| [prop-drill](skills/prop-drill/) | Trace React prop-drilling paths from origin definition to leaf consumers. Shows the original prop definition as a clickable code block, the full drilling route as a table, and a Mermaid flowchart. | [Serena MCP](https://github.com/oraios/serena) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |
| [react-query-key-jump](skills/react-query-key-jump/) | Jump from a TanStack React Query `queryKey` string (e.g. `getDrawing`) to the `useQuery` / `useInfiniteQuery` hook line where that key is defined. Skips `invalidateQueries` usage sites. | [ripgrep](https://github.com/BurntSushi/ripgrep) **(required)** |
| [rec](skills/rec/) | Record a web or Electron-renderer flow as an annotated video with playwright-cli — action callouts + chapter cards — then extract frames to confirm how it actually looks. For vague "record that part / 動作確認して録画" asks: real-time driver code paced for a human to watch (typing delay, pauses, chapter cards), not an E2E-runner replay. | `playwright-cli` **(required)**, `ffmpeg` **(required)** |
| [save](skills/save/) | Save session context to Serena MCP memory for cross-session persistence. Analyzes accomplishments, persists learnings, and creates session checkpoints. | [Serena MCP](https://github.com/oraios/serena) **(required)** |
| [search](skills/search/) | Iterative multi-tool research. Picks the best-fit tool (WebSearch, WebFetch, Exa, Perplexity, Tavily, Context7, DeepWiki) for the question type, then switches tool families across up to 3 passes until a citation-backed answer is reached. | [Exa MCP](https://github.com/exa-labs/exa-mcp-server) (recommended), [Perplexity MCP](https://github.com/ppl-ai/modelcontextprotocol) (recommended), [Tavily MCP](https://github.com/tavily-ai/tavily-mcp-server) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |
| [simplify](skills/simplify/) | Faithful recreation of Anthropic's removed `/simplify` Claude Code bundled skill. Reviews `git diff` via three parallel agents (Code Reuse, Code Quality, Efficiency) and fixes any issues found. Accepts free-form focus args appended under `## Additional Focus`. | — |
| [source-grounded-research](skills/source-grounded-research/) | Produces source-grounded research briefs with citations, contradiction handling, and query logs. Research-only — no implementation or speculative answers without sources. | [Context7](https://github.com/upstash/context7) (recommended), web search / MCP (recommended) |
| [type-expand](skills/type-expand/) | Expands TypeScript type aliases into concrete, primitive-resolved shapes — unions, intersections, generics, conditional types, infer-based types, and common utility types as far as statically resolvable. Use when IDE hover only shows alias names. | [tsx](https://github.com/privatenumber/tsx) (recommended), TypeScript project `tsconfig.json` **(required)** |
| [ts-pattern-refactor](skills/ts-pattern-refactor/) | Detect and refactor conditional code to ts-pattern's `match().with().exhaustive()`. Refactors JSX branching, chained ternaries, and discriminated-union dispatch — but deliberately leaves plain single-condition if-chains alone. Codifies syntactic-form × context judgment criteria. | [ts-pattern](https://github.com/gvergnaud/ts-pattern) **(required)**, [Context7](https://github.com/upstash/context7) (recommended), [Serena MCP](https://github.com/oraios/serena) (recommended) |
| [ux-gap-detector](skills/ux-gap-detector/) | Detects UI/UX quality gaps in authenticated SaaS web apps via `playwright-cli`. Crawls app interior, captures screenshots, scores across 4 dimensions (Typography & Spacing, Interactive States, Content Hierarchy, Loading & Error UX), and generates an actionable Markdown gap report. Optionally creates GitHub Issues. | `playwright-cli` **(required)**, [Serena MCP](https://github.com/oraios/serena) (recommended) |
| [video](skills/video/) | Inspect video frame-by-frame and capture-then-verify UI motion. Extract frames from any clip with ffmpeg and read them as images; record interactions (Playwright, computer-use, iOS simulator) to verify animations and transitions that static screenshots and `getComputedStyle` cannot reveal. | `ffmpeg` **(required)**, Playwright (recommended for web/Electron renderer capture), [iOS Simulator MCP](https://github.com/nichochar/ios-simulator-mcp) (iOS capture), Computer Use MCP (native macOS chrome capture) |
| [visual-lint](skills/visual-lint/) | ESLint for rendered UI. Screenshots a running app via `playwright-cli` and runs a structured defect rubric over the pixels to catch display breakage that code lint/typecheck can't see — unintended wrapping, overflow/clipping, element overlap, misalignment, broken layout. Baseline-free (no golden image) and read-only — reports findings with cited evidence, never edits source. | `playwright-cli` **(required)** |

## Usage

After installation, invoke skills as slash commands in your AI coding assistant:

```
/apollousa                        # Create PR, resolve CodeRabbit, merge, and clean up
/claude-code-plugin-troubleshoot    # Debug Claude Code plugin issues
/chrome-clean-install Chrome Canary # Clean-refresh a Chromium browser profile/cache
/code-trace                         # Trace code execution paths
/codebase-litter-audit              # Find half-finished codebase litter
/colorful-type                       # Replace primitives with domain types
/component-hierarchy Button.tsx      # ASCII tree from Page down to target component
/coderabbit-resolver 17             # Process PR #17
/cookie                             # Import Chrome cookies into a playwright-cli session
/create-worktree feat/new-thing     # Create git worktree at ../project-feat-new-thing
/deep-trace 42                      # Trace PR #42 line-by-line
/dnd                                # Load drag-and-drop coordinate-based verification protocol
/coderabbit-resolver --bulk         # Process all open PRs
/electron-release                   # Electron release workflow
/explain src/auth/middleware.ts      # Deep code explanation
/feature-tour                        # Live debug-session tour of newly written code
/github-actions-pnpm-ci             # Add secure pnpm GitHub Actions CI
/laststance-publish-skill           # Publish a stable skill to laststance/skills
/load                               # Load session context from Serena MCP
/locate-ui-from-code FolderHeader     # Locate render target with screenshot + DOM dump
/locate-ui-from-code src/Foo.tsx:139  # Locate UI + reach debugger/effect/handler at pinned line
/product-inspiration                # Get UI/feature inspiration
/prop-drill orderData OrderTable    # Trace prop-drilling path
/react-query-key-jump getDrawing    # Jump to useQuery queryKey definition line
/rec あそこの部分                     # Record a pointed-at flow, annotate, verify on frames
/save                               # Save session context to Serena MCP
/search what changed in React 19    # Iterative multi-tool research (Web + MCPs) until satisfied
/simplify                           # Review changed code (reuse + quality + efficiency) and fix issues
/source-grounded-research React 19  # Cited research brief (no code changes)
/type-expand OrderItemSetting       # Expand a TypeScript type alias to its concrete shape
/ts-pattern-refactor                # Sweep codebase for ts-pattern refactor opportunities
/ux-gap-detector                    # Detect UX gaps in authenticated SaaS web app
/video clip.webm                    # Extract frames with ffmpeg and verify UI motion
/visual-lint                        # Screenshot a running app and lint the render for display breakage
```

## License

MIT
