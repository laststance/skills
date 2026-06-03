# Source-Grounded Research Examples

## Example 1: Comparison And Decision Support

### User request

```text
Compare Playwright and Cypress for testing a Next.js 16 app with authenticated flows and CI screenshots.
```

### Recommended lane

`comparison-decision`

### Suggested research path

1. Use sequential thinking to define the comparison axes:
   - auth handling
   - CI stability
   - screenshots and tracing
   - Next.js compatibility
2. Run breadth discovery with Perplexity Search or WebSearch.
3. Verify major claims with official docs for both tools.
4. Run a contradiction pass for disputed claims like flake rate or browser support.

### Good output shape

```markdown
## Executive Summary
- Playwright is the stronger default for end-to-end testing in a Next.js 16 app when authenticated flows, multi-browser coverage, and trace artifacts matter most. [Playwright Docs](https://playwright.dev) [Cypress Docs](https://docs.cypress.io)

## Evidence Map
- Primary: Playwright and Cypress official docs
- Supporting: GitHub issues and migration discussions
- Counter: community reports that Cypress remains faster for local DX in smaller suites

## What We Know
- Playwright supports Chromium, Firefox, and WebKit from a single test API. [Playwright Docs](https://playwright.dev)
- Cypress runs on a different browser support model and has first-party app-centric tooling. [Cypress Docs](https://docs.cypress.io)

## What We Infer
- If CI screenshots, trace playback, and browser matrix coverage are top priorities, Playwright is likely the better fit.

## Contradictions and Unknowns
- Community reports differ on which tool is less flaky in large suites; official docs do not settle this.

## Confidence
- medium
```

### Why this is good

- starts with the decision, not the chronology of the search
- separates facts from the final recommendation
- keeps disputed community claims out of `What We Know`

## Example 2: Library Or Framework Research

### User request

```text
What are the current best practices for React Server Components in Next.js 16?
```

### Recommended lane

`library-framework`

### Suggested research path

1. Use sequential thinking to break the question into:
   - what changed in Next.js 16
   - what remains stable from React guidance
   - where server and client boundaries matter
2. Resolve the relevant library in Context7.
3. Query official docs with a precise question.
4. Pull Exa code context for practical examples.
5. Use Perplexity only if recent changes or conflicting guidance appear.

### Good output shape

```markdown
## Executive Summary
- The safest default in Next.js 16 is to keep data fetching and heavy computation in Server Components, and move only interactive UI boundaries to Client Components. [Next.js Docs](https://nextjs.org/docs) [React Docs](https://react.dev)

## Evidence Map
- Primary: Next.js and React docs
- Supporting: code examples and migration notes
- Counter: older community patterns that overuse `use client`

## What We Know
- Server Components reduce the amount of client JavaScript sent to the browser. [React Docs](https://react.dev)
- Next.js documents the server/client boundary and data fetching model. [Next.js Docs](https://nextjs.org/docs)

## What We Infer
- Many older examples are now too client-heavy and should not be treated as current best practice.

## Confidence
- high
```

### Why this is good

- starts from official docs instead of broad web search
- uses examples as support, not authority
- avoids turning outdated blog guidance into hard facts

## Example 3: OSS Repository Investigation

### User request

```text
How is the `vercel/next.js` repository structured, and where should I look to understand App Router internals?
```

### Recommended lane

`oss-repository`

### Suggested research path

1. Use sequential thinking to define the sub-questions:
   - top-level repo structure
   - likely App Router areas
   - docs vs implementation split
2. Start with DeepWiki:
   - `read_wiki_structure`
   - `read_wiki_contents`
   - `ask_question`
3. Corroborate the important claims with GitHub docs, repository pages, or another independent source.

### Good output shape

```markdown
## Executive Summary
- Start with the repository's top-level structure and documentation map, then narrow into the packages and runtime paths that implement the App Router. [GitHub Repository](https://github.com/vercel/next.js)

## Evidence Map
- Primary: repository-owned docs and source tree
- Supporting: DeepWiki topic map and repo-grounded Q&A
- Counter: none found for the high-level structure

## What We Know
- The repo contains both user-facing documentation and framework internals. [GitHub Repository](https://github.com/vercel/next.js)
- A repo-aware documentation map is useful before reading implementation files one by one.

## What We Infer
- DeepWiki is a better first stop than generic web search when the goal is architectural orientation rather than API syntax.

## Confidence
- medium
```

### Why this is good

- uses DeepWiki for orientation instead of pretending generic search is enough
- still corroborates high-level claims with repository-owned evidence
- keeps the answer scoped to navigation and understanding, not speculative internals

## Example 4: Recent Changes Research

### User request

```text
What changed recently in Next.js 16, and which changes actually matter for teams upgrading from 15?
```

### Recommended lane

`recent-changes`

### Suggested research path

1. Use sequential thinking to separate:
   - what shipped recently
   - what is breaking vs optional
   - what matters for production teams
2. Start with Perplexity Search or WebSearch to build the recent source map.
3. Use Perplexity Ask or Reason for a short cited synthesis if the updates span multiple sources.
4. Verify the final claims against official release notes, upgrade guides, and docs.

### Good output shape

```markdown
## Executive Summary
- The changes that matter most for teams upgrading from Next.js 15 are the ones that affect upgrade steps, renamed APIs, and behavior that can break builds or routing assumptions. [Next.js Releases](https://github.com/vercel/next.js/releases) [Next.js Docs](https://nextjs.org/docs)

## Evidence Map
- Primary: official release notes, upgrade guide, and docs
- Supporting: ecosystem commentary and issue threads clarifying migration pain points
- Counter: community posts that overstate changes which are optional rather than breaking

## What We Know
- Next.js release notes document what changed in each release. [Next.js Releases](https://github.com/vercel/next.js/releases)
- Official docs and upgrade guidance are the authoritative source for migration-impacting changes. [Next.js Docs](https://nextjs.org/docs)

## What We Infer
- Teams should prioritize changes that alter migration steps, naming, or runtime behavior over cosmetic or optional improvements.

## Contradictions and Unknowns
- Community discussions may disagree on how disruptive certain changes are, but those judgments are often context-dependent rather than factual contradictions.

## Confidence
- high
```

### Why this is good

- starts with recent discovery but finishes on official sources
- distinguishes what changed from what matters
- avoids treating community hype as authority

## Pattern Summary

- Use `comparison-decision` when the user wants a recommendation.
- Use `library-framework` when official docs are the strongest authority.
- Use `oss-repository` when the question is about a repository as a system.
- Use `recent-changes` when recency matters, but always verify final claims with official release notes or docs.
