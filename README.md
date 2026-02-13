# Laststance Skills

Agent skills for AI coding assistants. Install via [skills.sh](https://skills.sh).

## Installation

```bash
npx skills add laststance/skills
```

## Available Skills

| Skill | Description |
|-------|-------------|
| [coderabbit-resolver](skills/coderabbit-resolver/) | Automates the full CodeRabbit PR review cycle — fix comments, resolve threads, pass CI, merge, and clean up. Supports `--bulk` for all open PRs. |

## Usage

After installation, invoke skills as slash commands in Claude Code:

```
/coderabbit-resolver 17          # Process PR #17
/coderabbit-resolver --bulk      # Process all open PRs
```

## License

MIT
