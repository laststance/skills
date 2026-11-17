# Laststance Skills

[![Agent Skills](https://img.shields.io/badge/Agent_Skills-open_standard-2F855A?style=flat-square)](https://agentskills.io/)
[![Claude Code](https://img.shields.io/badge/Claude_Code-compatible-D97757?style=flat-square&logo=claude&logoColor=white)](https://code.claude.com/docs/en/skills)
[![Cursor](https://img.shields.io/badge/Cursor-compatible-000000?style=flat-square&logo=cursor&logoColor=white)](https://cursor.com/docs/skills)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI_Codex-compatible-111827?style=flat-square&logo=openai&logoColor=white)](https://developers.openai.com/codex/skills)
[![Skills](https://img.shields.io/badge/skills-25-2563EB?style=flat-square)](#available-skills)

Agent skills for AI coding assistants. Install via [skills.sh](https://skills.sh).

<a id="mac-security-sweep"></a>

## 🛡️ mac-security-sweep — 最新の脆弱性情報を収集、実行したMacに被害がないか確認

[English](docs/mac-security-sweep/README.en.md)

### インストール

```bash
npx skills add -g laststance/skills --skill mac-security-sweep
```

### 使い方(お使いのAIエージェントでスキルを起動)

```text
/mac-security-sweep
```

### mac-security-sweep 動作の流れ

![mac-security-sweep 動作の流れ](docs/mac-security-sweep/walkthrough.gif)

[SKILL.md（スキル本文）](skills/mac-security-sweep/SKILL.md)

[MP4動画をダウンロード](https://github.com/laststance/skills/raw/refs/heads/main/docs/mac-security-sweep/walkthrough.mp4) · [静止画](docs/mac-security-sweep/walkthrough-poster.png) · [操作できるHTML](docs/mac-security-sweep/walkthrough.html)


## Installation

Install all skills:

```bash
npx skills add laststance/skills
```

Install a specific skill:

```bash
npx skills add laststance/skills --skill chrome-clean-install
npx skills add laststance/skills --skill code-step-tour
npx skills add laststance/skills --skill code-trace
npx skills add laststance/skills --skill codebase-litter-audit
npx skills add laststance/skills --skill colorful-type
npx skills add laststance/skills --skill component-hierarchy
npx skills add laststance/skills --skill cookie
npx skills add laststance/skills --skill deep-trace
npx skills add laststance/skills --skill disk-map
npx skills add laststance/skills --skill dnd
npx skills add laststance/skills --skill explain
npx skills add laststance/skills --skill explain-diff-html
npx skills add laststance/skills --skill generating-codebase-wiki
npx skills add laststance/skills --skill learn-html
npx skills add laststance/skills --skill locate-ui-from-code
npx skills add laststance/skills --skill mac-security-sweep
npx skills add laststance/skills --skill pr-tour
npx skills add laststance/skills --skill product-inspiration
npx skills add laststance/skills --skill prop-drill
npx skills add laststance/skills --skill search
npx skills add laststance/skills --skill source-grounded-research
npx skills add laststance/skills --skill ts-pattern-refactor
npx skills add laststance/skills --skill type-expand
npx skills add laststance/skills --skill ux-gap-detector
npx skills add laststance/skills --skill visual-lint
```

## Available Skills

| Skill | Description | Dependencies |
|-------|-------------|--------------|
| [chrome-clean-install](skills/chrome-clean-install/) | Refresh Chromium-based browsers by backing up profile/cache data, guiding a clean reinstall, and restoring bookmarks only. Handles Chrome, Chrome Canary, Edge, Brave, Arc, Dia, and custom Chromium browser paths. | [Node.js](https://nodejs.org/) **(required)** |
| [code-step-tour](skills/code-step-tour/) | Step-through sequence of a real code path: file tree on the left, one arrow per click, and the functions or callbacks on that step. For React, also shows the hook caller, the component hierarchy, and the Props or Context path. | [Node.js](https://nodejs.org/) **(required)** |
| [code-trace](skills/code-trace/) | Interactive code execution path tracer. Explains how code flows from entry point to output with step-by-step navigation. | — |
| [codebase-litter-audit](skills/codebase-litter-audit/) | Audit repositories for half-finished features, stale TODOs, no-op handlers, visible UI wired to stubs, disabled tests, stale docs, placeholder assets, suppressions, and other codebase litter that dead-code tools miss. | — |
| [colorful-type](skills/colorful-type/) | Replace colorless primitives (`string`, `number`, `boolean`) with domain-rich types. Adds branded types, JSDoc, and named type aliases to communicate intent. | — |
| [component-hierarchy](skills/component-hierarchy/) | Visualize where a React component sits in the Next.js tree (Page → target) as an ASCII diagram with file paths. Supports App Router and Pages Router. | — |
| [cookie](skills/cookie/) | Copy Google Chrome's cookies into `playwright-cli` (macOS) so its browser inherits every logged-in session (GitHub, etc.). Decrypts via the macOS Keychain, loads per-cookie, verifies before navigating, and deletes the plaintext token files after. | `playwright-cli` **(required)**, Node.js **(required)** |
| [deep-trace](skills/deep-trace/) | Line-by-line execution path tracer for PR diffs, git diffs, or specified code sections. Maps every line to its screen/URL, data flow, and execution context like a debugger's step-through. | [Serena MCP](https://github.com/oraios/serena) (recommended) |
| [disk-map](skills/disk-map/) | Interactive macOS disk map with agent Chat, sanitized metadata probes, size-ordered candidate pages, and evidence-based cleanup after exact-manifest confirmation. Protects VM data and user Keep decisions; distinguishes parent-only protection from whole-subtree preservation. Reports cleanup and Trash restore completion, pauses idle sessions with explicit resume, and exports localized reports with honest space accounting. | [Node.js](https://nodejs.org/) 22+ **(required)**, macOS **(required)** |
| [dnd](skills/dnd/) | Browser drag-and-drop QA via coordinate-based pointer ops, plus video + drop+10-frame evidence for motion-sensitive bugs (DragOverlay rollback, ghost return). Knowledge-injection skill loaded by browser-using skills (e.g. `ux-gap-detector`) before any browser interaction — ref-based `drag` returns false success on `dnd-kit` and similar libraries. | `playwright-cli` **(required)**, `ffmpeg` (recommended for frame extraction) |
| [explain](skills/explain/) | Deep, systematic explanation of code, concepts, and system behavior. Always operates at advanced level with introspection markers and validation. | [Serena MCP](https://github.com/oraios/serena) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |
| [explain-diff-html](skills/explain-diff-html/) | Explains a diff, branch, or PR as one self-contained interactive HTML page — deep background, core intuition with toy-data figures, a grouped code walkthrough, and a five-question multiple-choice quiz that checks the reader actually understood the change. Explores surrounding code for context; diagrams are HTML, never ASCII. | — |
| [generating-codebase-wiki](skills/generating-codebase-wiki/) | Generate a local DeepWiki-style static HTML site that explains a codebase with numbered chapters, mermaid diagrams that name real symbols, and path:line citations. | — |
| [learn-html](skills/learn-html/) | Answers a general "how does X work?" question as one self-contained interactive HTML explainer (background → intuition → mechanics → quiz). Every factual claim must be sourced — docs lookup, a live measurement, or a repo grep — and anything unverified is flagged inline rather than smoothed into confident prose. Output language follows the question's language. | [Context7 MCP](https://github.com/upstash/context7) (recommended) |
| [locate-ui-from-code](skills/locate-ui-from-code/) | Code → screen: locate UI with on-screen highlight overlay (ring + file badge), reach logic branches (`debugger`, `if`, `useEffect`, handlers) by executing the user operations that trigger them, and capture DOM dump + highlighted screenshots. Agent runs the reach recipe itself and leaves the browser open for DevTools. Tool-agnostic — `cursor-ide-browser` MCP (Cursor), `playwright-cli` (Codex/Claude Code), chrome-devtools MCP when available. | `playwright-cli` (Codex/Claude Code), cursor-ide-browser MCP (Cursor), chrome-devtools MCP (recommended) |
| [mac-security-sweep](skills/mac-security-sweep/) | Collects current security news before a read-only Mac inspection, then reports relevant vulnerabilities, scoped non-affected checks and compromise indicators in the conversation language. Preserves unknown coverage and keeps secrets local; remediation is proposal-only. | macOS **(required)**, [Node.js](https://nodejs.org/) 22+ **(required)**, [OSV-Scanner](https://github.com/google/osv-scanner) (recommended) |
| [pr-tour](skills/pr-tour/) | Live onboarding tour of newly implemented code. Runs the target app in a debug session — the vscode-debug-mcp bridge and playwright-cli attach to the same Chrome — pauses at curated breakpoints inside the new code while driving the real UI, narrates each stop in chat mapping UI moments to exact file:line, and writes a replayable tour artifact (before/after screenshots + deep-trace-extension replay table). | `playwright-cli` **(required)**, [Debug MCP Bridge](https://github.com/laststance/vscode-debug-mcp) **(required)**, [Serena MCP](https://github.com/oraios/serena) (recommended) |
| [product-inspiration](skills/product-inspiration/) | Provides UI/feature implementation inspiration by researching top-tier apps. Implements all proposed patterns in _trials/ folder for hands-on evaluation. | [Tavily MCP](https://github.com/tavily-ai/tavily-mcp-server) (recommended) |
| [prop-drill](skills/prop-drill/) | Trace React prop-drilling paths from origin definition to leaf consumers. Shows the original prop definition as a clickable code block, the full drilling route as a table, and a Mermaid flowchart. | [Serena MCP](https://github.com/oraios/serena) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |
| [search](skills/search/) | Iterative multi-tool research. Picks the best-fit tool (WebSearch, WebFetch, Exa, Perplexity, Tavily, Context7, DeepWiki) for the question type, then switches tool families across up to 3 passes until a citation-backed answer is reached. | [Exa MCP](https://github.com/exa-labs/exa-mcp-server) (recommended), [Perplexity MCP](https://github.com/ppl-ai/modelcontextprotocol) (recommended), [Tavily MCP](https://github.com/tavily-ai/tavily-mcp-server) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |
| [source-grounded-research](skills/source-grounded-research/) | Produces source-grounded research briefs with citations, contradiction handling, and query logs. Research-only — no implementation or speculative answers without sources. | [Context7](https://github.com/upstash/context7) (recommended), web search / MCP (recommended) |
| [ts-pattern-refactor](skills/ts-pattern-refactor/) | Detect and refactor conditional code to ts-pattern's `match().with().exhaustive()`. Refactors JSX branching, chained ternaries, and discriminated-union dispatch — but deliberately leaves plain single-condition if-chains alone. Codifies syntactic-form × context judgment criteria. | [ts-pattern](https://github.com/gvergnaud/ts-pattern) **(required)**, [Context7](https://github.com/upstash/context7) (recommended), [Serena MCP](https://github.com/oraios/serena) (recommended) |
| [type-expand](skills/type-expand/) | Expands TypeScript type aliases into concrete, primitive-resolved shapes — unions, intersections, generics, conditional types, infer-based types, and common utility types as far as statically resolvable. Use when IDE hover only shows alias names. | [tsx](https://github.com/privatenumber/tsx) (recommended), TypeScript project `tsconfig.json` **(required)** |
| [ux-gap-detector](skills/ux-gap-detector/) | Detects UI/UX quality gaps in authenticated SaaS web apps via `playwright-cli`. Crawls app interior, captures screenshots, scores across 4 dimensions (Typography & Spacing, Interactive States, Content Hierarchy, Loading & Error UX), and generates an actionable Markdown gap report. Optionally creates GitHub Issues. | `playwright-cli` **(required)**, [Serena MCP](https://github.com/oraios/serena) (recommended) |
| [visual-lint](skills/visual-lint/) | ESLint for rendered UI. Screenshots a running app via `playwright-cli` to detect wrapping, clipping, overlap, misalignment, and unreadable badge text. Checks colored badges against their backgrounds and explicit foreground requirements in light/dark themes. Baseline-free and read-only — reports cited findings without editing source or claiming unmeasured contrast ratios. | `playwright-cli` **(required)** |

## Usage

After installation, invoke skills as slash commands in your AI coding assistant:

```
/chrome-clean-install Chrome Canary # Clean-refresh a Chromium browser profile/cache
/code-step-tour checkout submit     # Step through a call path, including React props and context
/code-trace                         # Trace code execution paths
/codebase-litter-audit              # Find half-finished codebase litter
/colorful-type                       # Replace primitives with domain types
/component-hierarchy Button.tsx      # ASCII tree from Page down to target component
/cookie                             # Import Chrome cookies into a playwright-cli session
/deep-trace 42                      # Trace PR #42 line-by-line
/disk-map                           # Map Mac storage, chat about it, reviewed cleanup
/dnd                                # Load drag-and-drop coordinate-based verification protocol
/explain src/auth/middleware.ts      # Deep code explanation
/explain-diff-html 42               # Interactive HTML PR walkthrough + quiz
/generating-codebase-wiki <repo>    # DeepWiki-style static HTML wiki of a codebase
/learn-html compositionend          # Sourced HTML explainer: background → mechanics → quiz
/locate-ui-from-code FolderHeader     # Locate render target with screenshot + DOM dump
/locate-ui-from-code src/Foo.tsx:139  # Locate UI + reach debugger/effect/handler at pinned line
/mac-security-sweep                 # Security news first, then a read-only Mac assessment
/pr-tour                             # Live debug-session tour of newly written code
/product-inspiration                # Get UI/feature inspiration
/prop-drill orderData OrderTable    # Trace prop-drilling path
/search what changed in React 19    # Iterative multi-tool research (Web + MCPs) until satisfied
/source-grounded-research React 19  # Cited research brief (no code changes)
/ts-pattern-refactor                # Sweep codebase for ts-pattern refactor opportunities
/type-expand OrderItemSetting       # Expand a TypeScript type alias to its concrete shape
/ux-gap-detector                    # Detect UX gaps in authenticated SaaS web app
/visual-lint                        # Check rendered UI defects and badge readability across themes
```

## License

MIT
