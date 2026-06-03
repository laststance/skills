# Source-Grounded Research Reference

## Lane Matrix

| Lane | Primary Start | Secondary Support | Final Verification |
| --- | --- | --- | --- |
| `library-framework` | Context7 | Exa code context | Perplexity, WebSearch, or official docs |
| `oss-repository` | DeepWiki | Exa, GitHub docs, repo pages | official docs or second independent source |
| `recent-changes` | Perplexity Search or WebSearch | Exa breadth | release notes, changelog, official docs |
| `local-plus-external` | local repo evidence | Context7 or DeepWiki | Perplexity only if comparison is needed |
| `comparison-decision` | breadth discovery | authority pass | contradiction pass |

## Recommended Sequences

### Library or framework question

1. Scope with sequential thinking.
2. Resolve the library in Context7.
3. Query the official docs with a precise question.
4. Pull Exa code context for implementation examples.
5. Run a contradiction pass only if behavior is disputed or recent changes matter.

### OSS repository question

1. Scope with sequential thinking.
2. Use `read_wiki_structure` to map the repo topics.
3. Use `read_wiki_contents` to read the main documentation body.
4. Use `ask_question` for a focused repository question.
5. Corroborate with GitHub docs, release notes, Exa, or a second independent source.

### Recent changes question

1. Scope with sequential thinking.
2. Use `Perplexity Search` or `WebSearch` to build the source map.
3. Use `Perplexity Ask` or `Reason` if a cited synthesis is needed.
4. Confirm with official release notes, changelog pages, or docs.

### Local plus external question

1. Gather local evidence first.
2. Choose `Context7` if the external target is a framework or library.
3. Choose `DeepWiki` if the external target is an open-source repository.
4. Use broader web tools only for contradiction checks or recent policy changes.

## DeepWiki Guidance

Use DeepWiki when the question is about a public repository as a system.

Good triggers:

- "How is this repository structured?"
- "Where is this feature documented or implemented?"
- "What is the design intent of this repo?"
- "I do not want to read the whole codebase."

Do not rely on DeepWiki alone for:

- exact API guarantees
- release-day changes
- fast-moving news
- local repo behavior

For major claims, corroborate with at least one of:

- official documentation site
- GitHub README or docs page
- changelog or release notes
- second independent retrieval source

## Evidence Quality Rules

Prefer source classes in this order:

1. official documentation, specs, release notes
2. repository-owned docs or README content
3. code host artifacts such as issues, discussions, and PRs
4. community explanations
5. AI-generated synthesis

If forced to rely on lower-tier evidence, state the limitation explicitly.

## Contradiction Pass

Before final synthesis:

1. Search for recent updates that could invalidate older guidance.
2. Look for counter-evidence from an equally strong or stronger source.
3. Preserve unresolved disagreements instead of flattening them.
4. Lower confidence when contradictions remain unresolved.

## Failure Handling

### Tool unavailable

- swap in another tool with the same role
- note the failure in the query log

### Thin evidence

- say `insufficient evidence`
- stop short of a firm recommendation
- propose exact follow-up queries or target domains

### No primary source

- downgrade the claim to supporting evidence
- reduce confidence

### Stale evidence

- note the date boundary of the research
- explicitly check for newer sources on fast-moving topics
