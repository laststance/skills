# Laststance Skills

Agent skills for AI coding assistants. Install via [skills.sh](https://skills.sh).

## Installation

```bash
npx skills add laststance/skills
```

## Available Skills

| Skill | Description |
|-------|-------------|
| [code-trace](skills/code-trace/) | Interactive code execution path tracer. Explains how code flows from entry point to output with step-by-step navigation. |
| [coderabbit-resolver](skills/coderabbit-resolver/) | Automates the full CodeRabbit PR review cycle — fix comments, resolve threads, pass CI, merge, and clean up. Supports `--bulk` for all open PRs. |
| [electron-release](skills/electron-release/) | Guides Electron app release process including build, code signing, notarization, and GitHub Release with auto-update support. |
| [gif-analyzer](skills/gif-analyzer/) | Analyze animated GIF files by extracting and viewing frames as sequential video. |
| [mentor](skills/mentor/) | Interactive code mentoring with pseudo-Plan mode. AI analyzes, designs, and presents a visual blueprint — human approves then writes code with AI guidance. |
| [product-inspiration](skills/product-inspiration/) | Provides UI/feature implementation inspiration by researching top-tier apps. Implements all proposed patterns in _trials/ folder for hands-on evaluation. |

## Usage

After installation, invoke skills as slash commands in your AI coding assistant:

```
/coderabbit-resolver 17          # Process PR #17
/coderabbit-resolver --bulk      # Process all open PRs
/code-trace                      # Trace code execution paths
/mentor                          # Interactive code mentoring
/product-inspiration             # Get UI/feature inspiration
/gif-analyzer ./demo.gif         # Analyze a GIF animation
/electron-release                # Electron release workflow
```

## License

MIT
