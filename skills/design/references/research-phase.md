# Research Phase — Codebase Investigation + Web Research

## Step 1: Codebase Investigation

Understand the existing system before designing anything.

### 1.1 Project Structure

```
mcp__serena__list_dir(".")                    → Top-level structure
mcp__serena__list_dir("src")                  → Source code layout
mcp__serena__find_file("package.json", ".")   → Dependency manifest
mcp__serena__find_file("tsconfig.json", ".")  → TypeScript config
```

Read `package.json` to identify:
- Current dependencies and their versions
- Build tools and scripts
- Project type (app, library, monorepo)

### 1.2 Symbol Analysis

```
mcp__serena__get_symbols_overview(<relevant-dirs>)
  → Classes, functions, interfaces, exports

mcp__serena__find_symbol(<target-related-patterns>)
  → Existing code related to the design target

mcp__serena__find_referencing_symbols(<key-symbols>)
  → Dependency graph, usage patterns
```

Focus on:
- Entry points and public APIs
- Data models and type definitions
- Existing patterns (middleware, hooks, services, etc.)
- Test patterns and coverage approach

### 1.3 Architecture Pattern Detection

Identify the codebase's established patterns:

| Pattern | How to Detect |
|---------|---------------|
| Layer structure | Directory naming (controllers/, services/, repos/) |
| State management | Redux, Zustand, Context imports |
| API pattern | REST routes, GraphQL schema, tRPC routers |
| Testing approach | Test file locations, framework (vitest, jest, playwright) |
| Error handling | Custom error classes, error boundaries |

## Step 2: Web Research

Research optimal approaches for the design target.

### 2.1 Library Documentation (Context7)

For EVERY library currently used AND every candidate library:

```
mcp__context7__resolve-library-id("<library-name>")
  → Get library ID

mcp__context7__query-docs("<library-id>", "<relevant-topic>")
  → Current API, best practices, migration guides
```

### 2.2 Architecture Research (Perplexity)

```
mcp__perplexity__perplexity_research(
  query: "<target> architecture best practices <tech-stack> 2025 2026",
  search_context_size: "high"
)
```

Research topics:
- Architecture patterns for the target domain
- Performance considerations and trade-offs
- Security best practices for the target
- Scalability patterns used in production systems

### 2.3 Code Examples (Exa)

```
mcp__exa__web_search_exa(
  query: "<target> implementation example <tech-stack>",
  num_results: 5
)
```

Look for:
- Real-world implementations of similar systems
- Open-source projects with proven architecture
- Common pitfalls and how they were solved

### 2.4 Repository Analysis (DeepWiki, optional)

If a relevant open-source repo is identified:

```
mcp__deepwiki__ask_question(
  repo_name: "<owner>/<repo>",
  question: "How does <target-feature> architecture work?"
)
```

## Step 3: Research Synthesis

Compile findings into a structured summary:

```markdown
## Research Summary

### Current State
- Architecture: [detected patterns]
- Relevant code: [key files and symbols]
- Dependencies: [relevant packages@versions]

### Recommended Approach
- Architecture pattern: [chosen pattern + justification]
- New libraries: [each with justification from research]
- Key trade-offs: [what was considered and why]

### Sources
- [Context7 docs consulted]
- [Perplexity research findings]
- [Exa code examples referenced]
```

This summary feeds into Phase 2 (Architecture Design) and is provided
to all reviewers in Phase 3 for context.
