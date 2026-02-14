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
npx skills add laststance/skills --skill code-trace
npx skills add laststance/skills --skill coderabbit-resolver
npx skills add laststance/skills --skill electron-release
npx skills add laststance/skills --skill explain
npx skills add laststance/skills --skill gif-analyzer
npx skills add laststance/skills --skill git
npx skills add laststance/skills --skill load
npx skills add laststance/skills --skill mentor
npx skills add laststance/skills --skill product-inspiration
npx skills add laststance/skills --skill qa-team
npx skills add laststance/skills --skill save
npx skills add laststance/skills --skill task
npx skills add laststance/skills --skill troubleshoot
```

## Available Skills

| Skill | Description |
|-------|-------------|
| [analyze-app](skills/analyze-app/) | Analyze macOS .app bundles to identify technology stacks (Electron, Flutter, Qt, SwiftUI, native, etc.) by delegating to a specialized subagent. |
| [code-trace](skills/code-trace/) | Interactive code execution path tracer. Explains how code flows from entry point to output with step-by-step navigation. |
| [coderabbit-resolver](skills/coderabbit-resolver/) | Automates the full CodeRabbit PR review cycle — fix comments, resolve threads, pass CI, merge, and clean up. Supports `--bulk` for all open PRs. |
| [electron-release](skills/electron-release/) | Guides Electron app release process including build, code signing, notarization, and GitHub Release with auto-update support. |
| [explain](skills/explain/) | Deep, systematic explanation of code, concepts, and system behavior. Always operates at advanced level with introspection markers and validation. |
| [gif-analyzer](skills/gif-analyzer/) | Analyze animated GIF files by extracting and viewing frames as sequential video. |
| [git](skills/git/) | Git operations with intelligent commit messages and workflow optimization. Analyzes changes to generate Conventional Commit messages automatically. |
| [load](skills/load/) | Load project context from Serena MCP memory for session initialization. Discovers memories, reads project overview, and validates context sufficiency. |
| [mentor](skills/mentor/) | Interactive code mentoring with pseudo-Plan mode. AI analyzes, designs, and presents a visual blueprint — human approves then writes code with AI guidance. |
| [product-inspiration](skills/product-inspiration/) | Provides UI/feature implementation inspiration by researching top-tier apps. Implements all proposed patterns in _trials/ folder for hands-on evaluation. |
| [qa-team](skills/qa-team/) | Launch comprehensive QA Agent Team for post-implementation verification. Tests 5 perspectives in parallel: Visual Integrity, Functional Correctness, Apple HIG, Edge Cases, and UX Sensibility. |
| [save](skills/save/) | Save session context to Serena MCP memory for cross-session persistence. Analyzes accomplishments, persists learnings, and creates session checkpoints. |
| [task](skills/task/) | Standard implementation workflow with systematic 5-phase cycle: Investigate → Plan → Implement → Verify → Complete. Integrates quality gates and introspection markers. |
| [troubleshoot](skills/troubleshoot/) | Diagnose and fix issues in code, builds, deployments, and system behavior. Hypothesis-driven debugging with root cause tracing and validated fixes. |

## Usage

After installation, invoke skills as slash commands in your AI coding assistant:

```
/analyze-app Linear                 # Analyze macOS app technology stack
/code-trace                         # Trace code execution paths
/coderabbit-resolver 17             # Process PR #17
/coderabbit-resolver --bulk         # Process all open PRs
/electron-release                   # Electron release workflow
/explain src/auth/middleware.ts      # Deep code explanation
/gif-analyzer ./demo.gif            # Analyze a GIF animation
/git commit                         # Smart git commit with Conventional Commits
/load                               # Load session context from Serena MCP
/mentor                             # Interactive code mentoring
/product-inspiration                # Get UI/feature inspiration
/qa-team                            # Launch QA verification team
/save                               # Save session context to Serena MCP
/task fix the login button          # Systematic implementation workflow
/troubleshoot "build failing"       # Hypothesis-driven debugging
```

## License

MIT
