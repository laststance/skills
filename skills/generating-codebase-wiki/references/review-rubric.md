# Review rubric

Reviewer reads: generated site + both codebases (when comparing two sites) + real DeepWiki React / Next.js overview + one deep page each.

Verdict is **PASS** only if every gate is Pass. One Fail = FAIL. Soft praise does not override a Fail.

## Gates

### G1 — Site is a wiki, not a landing page
- [ ] Multi-page numbered IA; Overview + ≥1 architecture chapter + Glossary
- [ ] Shared sidebar on every page; current page marked
- [ ] Mermaid renders in a browser (script present, `pre.mermaid` used)

### G2 — Research depth
- [ ] `research-notes.md` exists and names real symbols
- [ ] Overview is not a restated README
- [ ] Deep pages explain a mechanism (loop, pipeline, permission check), not a folder list

### G3 — Citation integrity
- [ ] Spot-check 8 citations: file exists, **and the inclusive span contains the symbol / JSX / dependency the sentence names**
- [ ] Fail the cite if it is an import block, `package.json` scripts header, or a sibling helper used as a proxy
- [ ] A range whose **first line** is `/**` or a JSDoc `*` continuation is Fail, even if the named export appears later. Cite the `export` / statement body only
- [ ] No invented routes, packages, or env vars
- [ ] Relevant source files on each page are files the article actually uses
- [ ] A chip is unused (Fail) unless **prose, a mermaid node, or an inline cite** names that path or a symbol **defined in that file**. The chip `<ul>` itself does not count. A field key, sibling identifier (`userSettings` rate-limit key, `addRepoCards`, `MaintenanceClient`, imported `createStorageMiddleware`), or **route string** (`/help`, `/freeword_search`, `/boards/new`) does not license a different file, `src/pages/<route>/index.tsx`, or `src/app/<segment>/page.tsx` / `route.ts`. Fail a chip when the only named tokens that could keep it are exports from a **different** file (`SortableColumn.tsx` vs `COLUMN_DRAG_TYPE` in `StatusColumn.tsx`)
- [ ] Fail a sentence that writes `ErrorBoundary` if the inclusive span never contains that exact identifier (`CustomErrorBoundary` / `FooErrorBoundary` is a different token)
- [ ] Fail `FAILED` licensed by `JOB_FAILED` / `failWith`. Fail `asPath` licensed by `getRequestedPath`. Fail a parent-page chip whose only mention is a child-link. Fail `useStorageHydrated` hung on `useTheme`. Fail a one-line `boardIdSchema` cite whose sentence names `getBoardBundle`. Fail `store.ts:43` (`export { storageApi }`) when the sentence names `store`
- [ ] A JSX child (`<AdminLogin />`) or an inner memo (`isAssemblyDrawingTabVisible`) does not stand in for the sentence subject (`AdminLogin`, `useIsAssemblyDrawingTabVisible`). JSDoc above an `export` does not license a negation token (`getUser`)
- [ ] If the subject is `NewOrderFormProvider` / `FileDownloadBox` / `RequireCompanyId` / `useKanbanUndo` / `usePostXxx`, the span’s first line must be that `export`, not `useForm` / a polling loop / `const postXxx`. A PascalCase type is not the camelCase param
- [ ] Illegal first lines: `/**`, JSDoc `*`, `'use server'`, `type Props`, `export interface` (when the subject is the function), `const schema`, a `//` comment, a JSX `{/*` comment, a mid-file `import` / `import type`, `const … = useMemo(`, `const {`, `export const {`, `return {`, anonymous `(error: unknown) => {` / `(response) => response`, JSON/`package.json` keys (`"test":`, `"scripts":`, `"dependencies":`, `"devDependencies":`), Next `metadata` fields (`manifest:`), `NR_EXCEPTION_KIND` / const-map keys (`FILE_DOWNLOAD:`, `ASSEMBLY_TREE_LAYOUT:`), type-body fields (`column:`)
- [ ] A mermaid host/route node does not count as in-span if the only span that contains it has an illegal first line — discard that span and require another legal statement range, or relabel the node
- [ ] Extra Sources / inline cites on the same page are judged **alone**. A tighter inner `useMemo` / `const {` / inner `useCallback` range Fails even when another cite starts on the enclosing `export`
- [ ] Host / route / locale-filename mermaid nodes (`api.github.com`, `/api/auth/github/refresh`, `/user`, `ja.json`, `mocks/handlers/github.ts`) need that **exact string in the cited statement span**. JSDoc above `export` does not count. Do not start the range on `/**`. `useQuery({` is not `queryClient`. If the only occurrence is JSDoc above `GET`, relabel the node to `GET`
- [ ] An HTTP-verb mermaid token (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) must appear **verbatim and uppercase** in that figure’s cited statement span. `api.get` / `axios.get` does not license `GET`
- [ ] Slash-joined mermaid labels still need **each** identifier in that figure’s spans. Two cites joined by `·` on one sentence are judged alone against every named token. A shortened route (`[id]`) is not the file path (`[documentFileId]`)
- [ ] Each mermaid node token must appear in that figure’s Sources spans. A wrapper / `'use server'` header is not a proxy for a node defined in another file
- [ ] After every mermaid `</figure>`, the next sibling must be `<p class="sources">`. A table or explanatory `<p>` in between is Fail
- [ ] Fail sibling-first ranges (`handleGitHubError`, `getDocumentFiles`, `deriveAssemblyExcelImportOutcome`, a request `type` field, `try {`, `return (`, an inner `const xxx = useCallback`) even when the named token appears later. A `useXxx` sentence must start on that `export`
- [ ] `end` > file length is Fail. Re-Read the file; shrink the range
- [ ] A `const FOO` / `export function FOO` cite must start on that declaration, not an object property, inner `useEffect`, or inner `useCallback` (`MERGED_TRANSLATIONS` ≠ `english: merge…`; `handleClose` ≠ `NewDocumentFilesModal`)
- [ ] Mermaid node tokens include phase literals (`matched`, `validationFailed`) and tokens in another file (`PermissionSettingsPage`, `/user`, `signInWithGitHub`). A `getXxx` / `unstable_cache` sibling is not `useXxx` / `createTokenFingerprint`. A hook “exposes / waits / returns” sentence must include those identifiers, not only the parameter list. A provider sentence must start on that `export`, not an inner `useMemo`
- [ ] Sources extras under a figure/paragraph must contain every token that paragraph names. A second sentence that introduces a new token needs its own span
- [ ] Mermaid labels must not contain English gloss (`rebuild`, `flow`, `handler`) unless that exact word is in that figure’s span text. Prefer the symbol alone
- [ ] A hook “exposes / save/close / returns” sentence fails if a named returned identifier (`handleClose`) sits on `end+1`
- [ ] A multi-actor paragraph (hook + component + action + reducer) with one Sources dump fails unless each actor has its own sentence and a span that contains that actor
- [ ] A mermaid Sources extra joined by `·` fails when that span contains **none** of the figure’s node-label tokens. Union coverage across siblings does not save it. Hang `NR_EXCEPTION_KIND` / `CommandPalette` / `isTestMode` on the prose sentence that names them
- [ ] A dotted/library form (`lodash.merge`) requires that exact token in-span. `merge(` plus an out-of-range `import { merge } from 'lodash'` does not license it
- [ ] `/auth/` is not licensed by `/^\/auth\//`. Imported enums used only via an alias array outside the span do not count. `export const env = parsed.data` does not contain `envSchema.safeParse`. Backtick gloss (`owner/repo`) is a token; `repo_owner` + `/` + `repo_name` is not
- [ ] A `useXxx` sentence that names `axiosClient.post` / `api.get` fails unless that call is in-span. Mapping literals (`chinese` → `zh-Hant-TW`) fail if they live only in JSDoc above `export`. Prose `//` is not licensed by `\/`. Alias `NS` outside the span does not license gloss `zod`. Negation still requires identifier `X` in-span; if the file never writes `X`, do not name `X`
- [ ] `repo_card_id` is not licensed by `repoCardId` / out-of-span `FK`. An identifier “later” dispatched at `end+1` fails. Do not hang `proxy` / `/auth/callback` on a helper that never writes those characters (JSDoc above `export` does not count)
- [ ] `AxiosError` is not licensed by `isAxiosError`. A mermaid Sources cite must not start on a sibling helper (`buildForwardedQuery`, `getLimiter`, `consumeCaptureQuota`) even if a later line is the page `export`. Do not hang `createClient` / `toPublicBoardSlug` / `useStorageHydrated` on the caller’s first line. A phase sentence that names `decodeImage` fails if that call is `end+1`. Never emit `<code class="cite">undefined</code>`
- [ ] A constructor / client-factory / Provider-header span may name only identifiers in that inclusive text. `createClient` through `createServerClient(` does not contain `getAll` / `setAll`. `axios.create({` does not contain `post` / `get` / `put`. An `AxiosClientProvider` header through token setup does not contain `401` / `403`. Grow `end` or delete the word
- [ ] A mermaid `<p class="sources">` extra whose first line is `function getLimiter` / `const consumeCaptureQuota` / `const buildForwardedQuery` is Fail even when that helper is also a node label. Hang that helper on the prose sentence only
- [ ] Numeric literals are character sequences: prose `60000` is not licensed by `60_000`
- [ ] A cite whose inclusive first line declares identifier A may name only A plus tokens on that first-line statement. A sibling declaration as subject (`INTERNAL_LOGIN_REDIRECT_PATH` hung on `CUSTOMER_LOGIN_REDIRECT_PATH`, `logSecurityEvent` hung on `WARNING_EVENTS`) must start on that sibling’s line. `useEffectOnMount(` / `useEffectOnAny(` / `useEffectOnUpdate(` is the same illegal first line as inner `useEffect`
- [ ] A one-line `export const useXxx = () => {` may name the hook only. Returned `t` / `locale` / `handleClose` must sit in the `return {` object
- [ ] Naming `createClient` / `requireClaims` on `getCachedClaims` / `getBoardBundle` / `MaintenancePage` fails even when the call is in-span. A mermaid node `createClient` / `requireClaims` needs Sources that start on that defining `export`
- [ ] Status-class gloss (`5xx`, `4xx`) is a token. A `//` comment that writes `5xx` does not license it
- [ ] A `<dt>`/`<dd>` sentence is judged like any other sentence. An `export const FOO = defineKey(...)` / one-line key constant span may name only `FOO`
- [ ] An Overview Key-code-entities `<table>` plus the following `<p class="sources">` names every entities-cell token. A single `_app` / `proxy.ts` span is Fail. · extras are judged alone against every table token. Write one sentence per row with one cite
- [ ] A camelCase stem is not a token. `occupiedY` is not licensed by `occupiedYByLevel` / `getOccupiedY`. JSDoc above the cited `export` does not count
- [ ] `FAILED` is not a substring of `JOB_FAILED` / `VALIDATION_FAILED`. Hang `FAILED` on `ASSEMBLY_EXCEL_IMPORT_PHASE` or `failWith` that writes `.FAILED`
- [ ] An inner `const` / nested `function` as subject (`occupiedYByLevel`, `getOccupiedY`) must start on that inner declaration, not the enclosing `export`
- [ ] A sentence that says a function “starts by” doing X must cite a span whose first executable statements are X
- [ ] A `//` comment that mentions `decodeImage` does not license the call. `end+1` is Fail
- [ ] A separately backticked camelCase callee (`decodeImage`, `safeParse`, `getClaims`, `noticeError`) is not licensed by `Receiver.method`. Write the dotted form only, or cite a span whose statement has the bare identifier not after `.`.
- [ ] `export const boardSlice = createSlice({` may name `boardSlice` / `createSlice` only. `setRepoCards` is a later reducer key
- [ ] `export const ROUTES = {` may name `ROUTES` only. A later key (`LOGIN:`) is a different subject
- [ ] A mermaid Sources extra must not start on an anonymous interceptor / arrow
- [ ] A tied-shortest leaf whose phases are ts-pattern / HTTP-status `match` arms inside an anonymous `axios.interceptors.response` callback fails G5
- [ ] Glossary must be `<dl>` / `<dt>` / `<dd>`. A one-row stub `<dl>` plus a stack of term `<p>` is Fail. Every term is a `<dt>` / `<dd>`; the cite lives in the `<dd>`. A cited `<p>` outside `<dl>` is Fail. Adjacent pairs only — stacked dts-then-dds is Fail
- [ ] A call-expression subject (`UTIF.decodeImage`) must start on that call line, not the enclosing `export const convertTiffBufferToImages`
- [ ] Prose HTTP verbs (`PUT`, `GET`, `POST`, `PATCH`, `DELETE`) are tokens even without `<code>`. `useUploadFilesToGcs` does not license `PUT`. A route (`/drawing_files`) must be in-span
- [ ] Overview entities-cell exports must both appear in that row’s sentence and that row’s one cite. Do not hang `createFirstBoardIfNeeded` / `setGitHubTokenCookie` / `getPublicBoardBySlug` on `GET` / `PublicBoardPage`
- [ ] Overview Key-code-entities identifiers must already appear in that page’s prose or mermaid node labels. Presence only inside the cited source span, or only inside the entities `<td>`, is a G5 Fail

### G4 — Diagrams are code maps
- [ ] Architecture pages have ≥1 mermaid whose nodes are files or symbols
- [ ] Edges are plausible (import, call, data). Reviewer can point to code that justifies 2 edges

### G5 — Comparable to DeepWiki
Read https://deepwiki.com/facebook/react and https://deepwiki.com/vercel/next.js (or DeepWiki MCP). Then judge:

- [ ] Same information *shape*: thesis → subsystems → code-entity table → diagram → sources → child links
- [ ] Same *density*: a skilled engineer learns a runtime fact they could not get from the README
- [ ] Visual chrome is a serious docs site (sidebar, chips, diagrams, readable type), not a bare markdown dump

If the generated page is thinner, vaguer, or less grounded than those overviews, Fail G5 even if G1–G4 pass.

**Fail G5 when Overview lacks the three-column Key-code-entities table, or when Overview plus the thinnest architecture chapter is thinner than DeepWiki Next.js “Package Ecosystem Mapping” / React “Core Reconciler Architecture” (no named-function algorithm walk).** Token-true inventories do not satisfy G5.

- Fail G5 when Overview + the shortest architecture HTML file together are thinner than DeepWiki Next.js “Package Ecosystem Mapping” (12-row Package / Role / Key code entities) plus React “Core Reconciler Architecture” (`beginWork` / `completeWork` / named commit phases). Counting ≥3 “X calls Y” sentences does not count as that walk. An 8-row Overview table fails. A 3-step status checklist on the thinnest leaf does not rescue Overview+leaf vs Fiber work-loop + four commit sub-phases.
- The shortest architecture HTML (glossary excluded) must itself contain a ≥4-phase walk inside one named function and a mermaid whose nodes are those phase identifiers or the function plus callees used in those phases. A 3-node `proxy` → helper diagram, or a 3-step `OrdersPage` redirect checklist, fails G5 even when Overview already has a 12+ row Key-code-entities table and a longer pipeline.
- When several architecture HTML files share the shortest line count (glossary excluded), **each** of those files must contain a ≥4-phase walk of condition / early-return / side-effect branches **inside one named function**, plus a mermaid of those phase identifiers or that function plus the callees used in those branches. Sequential Provider wrapping, callee inventory, or “X then Y then Z then getLayout” labeled as four phases fails G5 even when other same-length leaves are real algorithms and Overview already has a 12+ row entity table.
- Sequential object construction — `configureStore({ reducer, middleware, devTools })`, combine-then-wrap-then-concat, or Provider wrapping / “then getLayout” — labeled as four phases fails G5 even if two other same-length leaves are real algorithms.
- A tied-shortest leaf that only awaits a gate (`requireClaims`), logs an embed `error`, `.map`s rows, and applies a `DEFAULT_*` ternary is callee/transform inventory, not a ≥4-phase in-function walk. Numbered `<ol>` labels do not convert a fetch pipeline into `beginWork`.
- A shortest leaf whose “four phases” are a lookup plus one `return (a && b && c)` / sequential AND is boolean-conjunction inventory, not `beginWork` then named commit sub-phases.
- A `<dt>`/`<dd>` sentence is judged like any other sentence. An `export const FOO = defineKey(...)` / one-line key constant span may name only `FOO`. Naming `storeTargetPathIfNeeded` / `RequireCompanyId` on that key line is Fail.
- A one-line `export const env = parsed.data` may name `env` only. `NEXT_PUBLIC_*` / `envSchema` field names are not in that line.
- A one-line `export const useXxx = () => {` may name the hook only. Returned identifier `t` / `locale` / `handleClose` must sit inside the `return {` object
- Naming `createClient` / `toPublicBoardSlug` / `useStorageHydrated` / `requireClaims` on a caller span (`getCachedClaims`, `getBoardBundle`, `useTheme`, `MaintenancePage`) fails even when the call is in-span. Cite the defining `export`. A mermaid node `createClient` / `requireClaims` needs a Sources cite that starts on that `export`
- Overview Key-code-entities identifiers must already appear as named tokens in that page’s prose or mermaid node labels. Presence only inside the cited source span, or only inside the entities `<td>`, fails G5
- Status-class gloss (`5xx`, `4xx`) licensed only by a `//` comment fails G3

### G6 — Language and honesty
- [ ] Consistent language (JA or EN)
- [ ] No hype adjectives
- [ ] Separate-repo / BE / worker boundaries stated when the FE does not implement them

## Reviewer output format (mandatory)

```markdown
# Wiki review — <repo or pair> — round N
Verdict: PASS | FAIL

## Gate scores
G1 … Pass/Fail — one sentence
G2 …
G3 … (list the 8 citations checked and ok/wrong)
G4 …
G5 … (name which DeepWiki page you compared and the gap)
G6 …

## Must-fix (empty if PASS)
- page / claim / what to change

## Skill change required? (yes/no)
If yes: exact addition to SKILL.md or references/*.md (wording the next generator will follow)
```

A PASS means: "I would send a new teammate to this site the way I would send them to DeepWiki React." Not "pretty good for an AI dump."
