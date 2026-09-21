# Quality bar — match real DeepWiki

Gold standard pages (read before writing if DeepWiki MCP / web is available):

- https://deepwiki.com/facebook/react — Overview
- https://deepwiki.com/facebook/react/2-core-reconciler-architecture
- https://deepwiki.com/vercel/next.js — Overview

A generated site **passes** only if a reviewer who just read those pages would say: same *kind* of document (map → mechanism → code), not a prettier README.

## What DeepWiki pages actually do

1. **Relevant source files** — a chip list of real paths the page will discuss (20+ on overview, 10–18 on a deep page).
2. **Thesis opening** — what the subsystem is, what problem it solves, what this page covers. Not "this repo contains many folders".
3. **Architecture before inventory** — subsystems and runtime phases first; directories second, as evidence.
4. **Code-entity tables** — Package / Role / Key code entities (`BaseServer`, `renderToHTMLOrFlight`, `FiberNode`).
5. **Mermaid that is a citation** — nodes are files or symbols (`ReactFiberBeginWork.js`, `beginWork`). Edges are real call/data relationships. Title: `Diagram: …`.
6. **path:line citations** — `packages/react-reconciler/src/ReactFiber.js:134-207` after the claim, and a `Sources:` block after the section.
7. **Progressive disclosure** — overview maps; child pages walk the algorithm (`beginWork` descend, `completeWork` ascend, commit sub-phases).
8. **How pieces fit** — a closing diagram or section that reconnects modules.
9. **Next steps / child links** — numbered, specific, not "see also".
10. **On this page** — heading TOC.

## Voice

- Active, concrete, second person only when giving a contributor setup step
- Name the symbol, then say what it does
- No "easy / simple / robust / comprehensive / seamless"
- Gloss domain jargon once, then use the term
- Japanese product repos: Japanese prose, keep symbol/path names in English

## Fail patterns (automatic Fail in review)

| Fail | Why DeepWiki does not look like this |
| --- | --- |
| README restated as HTML | No new mechanism, no file:line |
| Folder tour ("src/ has components/") | Inventory without runtime |
| Diagram nodes: Client, Server, Database | Not a code map |
| Citation to a file never opened | Hallucinated authority |
| Cite `package.json:1-24` or an import block for a symbol later in the file | Span does not contain the named token |
| Mermaid label adds gloss (`Foo rebuild`) the span does not contain | Node labels are citations, not captions |
| Prose writes `/auth/` or `owner/repo` while the span has `/^\/auth\//` or `repo_owner` | Tokens are character sequences, not paraphrases |
| Names `axiosClient.post` / `chinese` / `//` / `zod` / a negated `RequireX` the span never writes | Mapping, alias, regex, and negation are still tokens |
| One long page for a 300+ file repo | No progressive disclosure |
| Marketing hero + feature bullets | Product landing, not wiki |
| Missing glossary on a domain-heavy app | Terms undefined |
| Overview table is 領域/役割 only, or has no Key-code-entities column | DeepWiki Overview maps packages to `BaseServer` / `FiberNode` |
| Overview entity table has fewer than 12 rows | Next.js Package Ecosystem Mapping is a 12-row table |
| `AxiosError` licensed by `isAxiosError`, or mermaid Sources starts on `getLimiter` | Type names and sibling helpers are their own cites |
| `createClient` hung on `getBoardBundle` | Hang a name only on its defining `export` |
| Prose `ErrorBoundary` while span has `CustomErrorBoundary` | Wrapper names are not the wrapped type |
| Chip `SortableColumn.tsx` licensed by a drag-type in another file | Chips need that file’s path or that file’s export |
| `<code class="cite">undefined</code>` | A missing ledger row is not a citation |
| Quota-phase sentence names `decodeImage` at `end+6` | Phase tokens must sit inside the inclusive span |
| Shortest leaf is a 3-step redirect or 3-node `proxy` stub | That leaf itself needs a ≥4-phase in-function walk + matching mermaid |
| Mermaid node `FAILED` licensed by `JOB_FAILED` / `failWith` | Enum members are exact identifiers |
| `asPath` hung on `storeTargetPathIfNeeded` | `requestedPath` is a different token |
| Chip licensed only by a child-link caption | Parent prose / mermaid / inline cite must name the path |
| Factory header names `getAll` / `post` / `401` outside the span | Grow `end` through that statement, or drop the word |
| Mermaid Sources starts on `function getLimiter` even when it is a node | Hang the helper on the prose sentence only |
| Prose `60000` licensed by `60_000` | Numeric literals are character sequences |
| `INTERNAL_LOGIN_REDIRECT_PATH` hung on `CUSTOMER_LOGIN_REDIRECT_PATH` | First line must declare the sentence subject |
| `logSecurityEvent` hung on `const WARNING_EVENTS` | Sibling declarations are their own cites |
| Login phases start on `useEffectOnMount(` | Same illegal first line as inner `useEffect` |
| `NEXT_PUBLIC_API_HOST` hung on `export const env = parsed.data` | The parsed-object export names `env` only |
| Tied-shortest leaf is Provider wrap / “then getLayout” | Each shortest file needs a ≥4-phase in-function walk |
| Hook “returns `t`” cited on `export const useXxx = () => {` only | Grow through `return { t:` or drop `t` |
| `createClient` named on `getCachedClaims` / mermaid without `server.ts` export | Factory names hang only on the defining `export` |
| Glossary `TARGET_PATH` dd names `storeTargetPathIfNeeded` on `defineKey` | A key-constant line names only that key |
| Tied-shortest leaf is `configureStore` field inventory | Sequential object construction is not a 4-phase walk |
| Overview table Sources dump on `_app` / `proxy.ts` | One row → one sentence → one cite |
| Tied-shortest leaf is `requireClaims` → map → `DEFAULT_*` | Fetch/transform checklist is not a 4-phase walk |
| Prose `occupiedY` licensed by `occupiedYByLevel` / `getOccupiedY` | CamelCase stems are not tokens |
| Mermaid `FAILED` licensed by `VALIDATION_FAILED` / `failWith` | Enum members need a whole-token match |
| Glossary `occupiedYByLevel` hung on enclosing `export` | Inner `const` subject starts on that inner line |
| “starts by copying headers” cited on an `isTestMode` arm | First executable statements must be X |
| `decodeImage` licensed by a `//` comment / `end+1` | Comments do not license call tokens |
| Glossary writes bare `decodeImage` beside `UTIF.decodeImage` | Dotted callee does not license the separately named property |
| Glossary stacks all `<dt>` then all `<dd>` | Adjacent `<dt>`+`<dd>` pairs only |
| `UTIF.decodeImage` hung on `convertTiffBufferToImages` export | Call-expression subjects start on the call line |
| Prose `PUT` on `useUploadFilesToGcs` | HTTP verbs are tokens; name `axios.put` or a span that writes `PUT` |
| `/drawing_files` on `usePostDrawingFile` mutation header | Route tokens must be in-span |
| Overview row lists `upsertProjectInfoCore` with a `parseSlateValue` cite | Both entities belong in that row’s one sentence and one span |
| `createFirstBoardIfNeeded` hung on callback `GET` | Hang a name only on its defining `export` |
| `setRepoCards` hung on `export const boardSlice = createSlice({` | Slice header names the slice only |
| `LOGIN` hung on `export const ROUTES = {` | Object-map header names the const only |
| Mermaid Sources starts on `(error: unknown) => {` | Anonymous interceptor / arrow is an illegal first line |
| Tied-shortest leaf is interceptor `match` status arms | Status checklist is not a named-function 4-phase walk |
| `INTERNAL_LOGIN_REDIRECT_PATH` hung on `return {` | `return {` is the same illegal first line as `return (` |
| Overview entities cell uses `children` / `baseURL` | Second identifier must be an export |
| Shortest leaf is `return (a && b && c)` numbered as four phases | Conjunction is not a 4-phase walk |
| Glossary is a stub `<dl>` plus term `<p>` blocks | Every term is a `<dt>` / `<dd>`; cite lives in the `<dd>` |
| Prose `5xx` licensed by a `//` comment | Status-class gloss is a token; comments do not count |
| Overview entities cell names `TreeLayoutPosition` only in the `<td>` | Entity tokens must already appear in Overview prose or mermaid |
| `requireClaims` hung on `MaintenancePage` export | Guard / factory names hang only on the defining `export` |
| Leaf page is “X calls Y” with no algorithm walk | Reconciler pages walk `beginWork` → commit sub-phases |
| `repo_card_id` licensed by `repoCardId`, or `setActiveBoard` at `end+1` | Tokens are exact; “later” still needs the identifier in-span |

## Pass pattern (one paragraph)

> The React reconciler, commonly known as Fiber, processes updates and coordinates rendering to a host. Each `Fiber` is built by `FiberNode` (`ReactFiber.js:134-207`). `beginWork` walks down (`ReactFiberBeginWork.js:233-235`); `completeWork` walks up. Commit applies mutations synchronously via `commitMutationEffects` (`ReactFiberWorkLoop.js:249`).

That density — **named symbol + verb + path:line** — is the bar.
