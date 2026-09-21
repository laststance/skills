# Page anatomy

Every HTML page is `page.template.html` filled in. Do not invent a different chrome.

## Placeholders

| Token | Value |
| --- | --- |
| `{{REPO_TITLE}}` | Short product name (ズメーン FE / GitBox) |
| `{{REPO_SLUG}}` | `owner/repo` or folder name |
| `{{PAGE_ID}}` | `1`, `1.1`, `2`, `g` |
| `{{PAGE_TITLE}}` | `1 Repository Overview` |
| `{{SIDEBAR_NAV}}` | Same `<ol>` on every page; current item gets `aria-current="page"` |
| `{{ON_THIS_PAGE}}` | In-page heading links |
| `{{CSS_HREF}}` / `{{JS_HREF}}` | `./wiki.css` from index; `../wiki.css` from `pages/` |
| `{{ARTICLE}}` | Body HTML below |

`index.html` lives at site root and **is** chapter 1. Child pages live in `pages/`.

## Article order (mandatory)

```html
<p class="lede">…thesis…</p>

<section class="sources-strip" aria-label="Relevant source files">
  <h2>Relevant source files</h2>
  <ul class="file-chips">…<li><code>path</code></li>…</ul>
</section>

<!-- H2 sections -->
<h2 id="…">…</h2>
<p>…</p>
<figure class="diagram">
  <figcaption>Diagram: …</figcaption>
  <pre class="mermaid">…</pre>
</figure>
<p class="sources"><strong>Sources:</strong> <code>path:12-40</code> · <code>path:88</code></p>
<table>… Role / Key code entities …</table>
<p class="sources"><strong>Sources:</strong> …cites for the table only…</p>

<h2 id="next-steps">Next steps</h2>
<ul class="child-links">
  <li><a href="…">1.1 …</a> — one-line promise</li>
</ul>
```

**Overview hard requirement:** `index.html` MUST render a `<table>` whose header is exactly `Subsystem` (JA: `サブシステム`) \| `Role` (JA: `役割`) \| `Key code entities` (JA: `主要な記号`). Minimum **12** data rows (DeepWiki Next.js “Package Ecosystem Mapping”). Each Key-code-entities cell MUST name ≥2 exported identifiers that already appear as named tokens in that page’s **prose or mermaid node labels**. Presence only inside the cited source span, or only inside the entities `<td>`, does not count. Both identifiers must also appear in **that row’s** single sentence and that row’s single cite span. A second entity from another file is a second row. A two-column 領域/役割 table, an 8-row table, or any Overview with no entity column, is a G5 Fail even if every cite is path:line-true.

**Leaf chapters:** each architecture child must walk **one** named-function algorithm or permission/apply/query branch (≥3 steps, each cited), not an “X calls Y” inventory. Settings / help / theme pages that only list query names fail G5.

- A leaf that only chains lookups (`useTranslation` → map → dict, `getDocumentFiles` → `axiosClient.get`, `Login` → `loginWithRedirect`) is an inventory, not an algorithm walk. Fail G5 unless the page cites ≥3 decision steps inside one named function (condition / early return / side effect), the way DeepWiki React walks `beginWork` then commit sub-phases.
- Overview + the shortest architecture HTML must still teach a **multi-phase pipeline** (≥4 named phases: e.g. fetch / decode / fallback / commit, or deny / validate / embed / notFound) comparable to `beginWork` / `completeWork` / named commit effects. A 3-step status checklist on the thinnest leaf does not rescue an Overview that is only a table + mermaid.
- The shortest architecture HTML (glossary excluded) must itself contain a ≥4-phase walk inside one named function and a mermaid whose nodes are those phase identifiers or the function plus callees used in those phases. A 3-node `proxy` → helper diagram, or a 3-step `OrdersPage` redirect checklist, fails G5 even when Overview already has a 12+ row Key-code-entities table and a longer pipeline.
- When several architecture HTML files share the shortest line count (glossary excluded), **each** of those files must contain a ≥4-phase walk of condition / early-return / side-effect branches **inside one named function**, plus a mermaid of those phase identifiers or that function plus the callees used in those branches. Sequential Provider wrapping, callee inventory, “X then Y then Z then getLayout”, or sequential object construction (`configureStore({ reducer, middleware, devTools })`, combine-then-wrap-then-concat) labeled as four phases fails G5 even when other same-length leaves are real algorithms. If a page stays a shell / store-wiring inventory, fold it into Overview — do not leave it as a shortest architecture leaf.
- A tied-shortest leaf whose numbered phases are ts-pattern / HTTP-status `match` arms inside an anonymous `axios.interceptors.response` callback is status-checklist inventory and fails G5 even if other same-length leaves walk named functions. Fold it into the parent HTTP chapter, or walk four arms inside one named function.

## Mermaid rules

- Prefer `flowchart TB` or `flowchart LR`
- Node **label** includes the symbol or filename: `BeginWork["beginWork\nReactFiberBeginWork.js"]`
- Subgraphs = layers (Build / Server / Client) or packages
- 6–16 nodes. Split if more
- No `User`, `API`, `DB` as the only labels
- Escape quotes; avoid `end` as a node id
- **No English gloss** in a label (`rebuild`, `flow`, `handler`) unless that word is in this figure’s cited span text. Write the label only after the span exists (`cite-write.md`)

## Citation syntax

In prose: `packages/react-reconciler/src/ReactFiber.js:134-207`

In HTML: `<code class="cite">src/pages/_app.tsx:40-62</code>`

A `path:start-end` is invalid unless that inclusive span contains the symbol, statement, or JSX the adjacent sentence names. A range whose first line is `/**` or a JSDoc `*` line is invalid even if the export appears later — start the cite on the `export` / statement. Illegal first lines also include `'use server'`, `type Props`, `export interface` (when the subject is the function), `const schema`, a `//` comment, a JSX `{/*` comment, and a mid-file `import` / `import type`. Do not cite a file's opening lines (`package.json:1-24`, a hook's type aliases, an import block) as a proxy for a claim elsewhere in the file. If the claim is `DndContext` / `useSensors` / a `next` dependency, the range must include that token. Re-read the file after drafting; a nearby helper is not the cited entity.

If one sentence names N symbols or dependencies, the cited inclusive span must contain all N tokens. Split into N cites when they live in different ranges.

Illegal proxies even when the file is correct:

- a `package.json` slice that starts mid-`dependencies` and omits earlier packages the sentence listed
- a hook file range that only covers `getXxx` / JSDoc while the sentence names `useXxxQuery`
- a constants object (`NR_EXCEPTION_KIND`) cited for a different export (`captureException`)
- a file's opening JSDoc or `import` block (`*:1-20`) cited for a later test or helper
- naming a symbol the cited file does not contain (`useKanbanDnD` on `BoardGrid.tsx`), including in a negation
- A negated path or symbol (`"/public/[slug]` is not on the list", "does not call `loginWithRedirect`") still requires that exact token in the inclusive span (implementation, comment, or test). If the file never writes it, do not name it — describe the allowlist you *can* quote.
- Do not cite a component’s `export const Foo = (` line, a JSDoc `@remarks` / `@example` block, or a sibling `const MAX = 1000` as the home of `Foo`’s queue, an HTTP path, or `boardIdSchema.safeParse`.
- If the sentence’s subject is `Layout` / `BoardGrid` / `TARGET_PATH` / `claims.sub` / `RequireX` / `LoginPage` / `AccessibleCompanies` / `AdminLogin` / `NewOrderFormProvider` / `FileDownloadBox` / `RequireCompanyId` / `useKanbanUndo` / `usePostAssemblyGraphXlsxMatching`, that identifier must appear in the span, not only in the filename, the effect body, or a JSX child (`<AdminLogin />` on `admin/login.tsx` is not enough). The inclusive first line must be that `export` (or the `useXxx` / `function` line), not `useForm`, a polling loop, `useEffectOnMount`, `pushCardHistory`, or `const postXxx = async`.
- A PascalCase type (`DrawingNodeWithChildrenInDb`) is a different token from the camelCase variable. If the sentence names the type, the span must include the `type` / import-usage line, not only `props.drawingNode…`.
- A hook cite must include the `useXxx` identifier, not only a memo inside it (`isAssemblyDrawingTabVisible` ≠ `useIsAssemblyDrawingTabVisible`).
- A route string (`/help`, `/freeword_search`, `/boards/new`) does not license `src/pages/<route>/index.tsx` or `src/app/<segment>/page.tsx` / `route.ts` unless that path or a symbol defined in that file is named in prose, mermaid, or an inline cite (`BoardsPage`, `GitBoxLandingPage`, `NewBoardPage`, `MaintenancePage`, `export async function GET` in that module). A sibling identifier (`MaintenanceClient`, `LoginPage` on a different file) does not license the page module.
- Field keys (`document_type_master_id`, `user_id`) do not license a constants file. An imported helper (`createStorageMiddleware`) or a storage-key string (`gitbox-state`) does not license `store.ts`; name `store` / `storageApi` / `hydratedReducer` or drop the chip.
- A wrapper span (`withAuthResult` body) is not a proxy for `getCachedClaims`. Negation still requires the token in-span (`does not call getUser()` needs `getUser` on a cited line — implementation or comment. JSDoc *above* the `export` does not count). If the file never writes the token in a citable statement, do not name it.
- A `Sources:` extra `path:line` that lands on a sibling `MAX` / `unstable_cache` helper / function signature still fails even when another cite in the same block is correct.

Relevant-source chips: every path must be named in the article or define a symbol the article names.

- A Relevant-source chip for a component module is unused unless prose, a mermaid node, or an inline cite names **that file’s path** or an identifier **whose `export` / `const` is defined in that file**. `SortableColumn.tsx` is not licensed by `COLUMN_DRAG_TYPE` in `StatusColumn.tsx`, nor by `NEW_ROW_DROP_TYPE` / `COLUMN_INSERT_DROP_TYPE` in the zone files.
- A child-link caption (`GET` on the callback route, “3.2 OAuth…”) does not license a Relevant-source chip. `src/app/auth/callback/route.ts` stays only if the parent article’s prose, mermaid, or inline cite names that path or `export async function GET` from that file.
- Prose `ErrorBoundary` is not licensed by `CustomErrorBoundary` (or any `FooErrorBoundary`). If the span only writes the wrapper identifier, name the wrapper. A JSX `{/* ErrorBoundary */}` comment may license the short token only when that comment is inside the cited inclusive range; do not assume a sibling page’s comment.

Pre-ship G3 walk (generator must run, not just remember):

- For every Relevant-source chip, grep the article with the chip `<ul>` stripped. Keep the chip only if prose, a mermaid node label, or a `path:line` cite contains that path or an identifier whose `export` lives in that file. A child-link title (“新規案件モーダル”) or a sibling page symbol (`BoardsPage`, `BoardGrid`) does not keep `NewOrderModal.tsx` / `BoardPageClient.tsx` on the parent chapter.
- Re-read the sentence subject before attaching a cite. If the subject is `NewOrderFormProvider` / `FileDownloadBox` / `RequireCompanyId` / `useKanbanUndo` / `usePostAssemblyGraphXlsxMatching`, the inclusive first line must be that `export` (or the `useXxx` / `function` line), not `useForm`, a polling loop, `useEffectOnMount`, `pushCardHistory`, or `const postXxx = async`.
- A PascalCase type (`DrawingNodeWithChildrenInDb`) is a different token from the camelCase variable. If the sentence names the type, the span must include the `type` / usage line, not only `props.drawingNode…`.
- After drafting, for **every** `path:start-end` (inline and `<p class="sources">`, including blocks under a mermaid `<figure>`): the inclusive **first line** must be the `export` / `function` of the sentence or mermaid-node subject. Illegal first lines include `/**`, a `*` JSDoc continuation, `'use server'`, `type Props`, `export interface` (when the subject is the function), `const schema`, a `//` comment, a JSX `{/*` comment, and a mid-file `import` / `import type`.
- For each mermaid node label token (`deleteDraftNote`, `NoteModal`, `handleSave`, `upsertProjectInfoCore`), at least one cite in **that figure’s** Sources line must contain the token. A wrapper span (`upsertProjectInfo` / `'use server'` file header) is not a proxy for a mermaid node defined in another file.
- After every mermaid `</figure>`, the **next sibling** must be `<p class="sources">`. A table, explanatory `<p>`, or heading in between is Fail — even if a Sources block appears later in the same section.
- Start every hook/action cite on the `export` / named `function` line of the sentence or mermaid-node subject. A preceding sibling (`handleGitHubError`, `getDocumentFiles`, `deriveAssemblyExcelImportOutcome`, a request `type` field, `try {`, a `return (` JSX block, or an inner `const xxx = useCallback`) is Fail even when the named token appears later in the same range. A sentence whose subject is `useXxx` must start on that `export`, not an inner `useCallback`.
- After every `path:start-end` (inline and Sources), re-Read the file. If `end` is greater than the file’s last line, the cite is invalid (`src/app/public/[slug]/page.tsx:45-55` on a 54-line file; `src/lib/constants/routes.ts:5-19` on an 18-line file). Shrink the end line; do not keep a stale range from an older draft.
- If the sentence or mermaid node names a `const FOO` / `export const FOO` / `export function FOO`, the inclusive first line must be that declaration. The first property of an object literal (`english: merge…`), the first `useEffect` inside a hook, or the first `useCallback` inside a component is not a cite for `FOO` (`MERGED_TRANSLATIONS` ≠ the `english:` property; `useTheme` ≠ the `data-theme` effect).
- `const handleX = useCallback` / `const applyLocale = useCallback` / `const enterSelectedCompany = useCallback` is an illegal first line even when the sentence’s verb is that identifier. Start on the enclosing `export` of the component or hook. A 4-line `handleClose` slice does not license `NewDocumentFilesModal`.
- After every mermaid `</figure>`, the next `<p class="sources">` must contain every **node label token**, including phase / string literals (`matched`, `validationFailed`) and tokens that live in another file (`PermissionSettingsPage`, `/user`, `signInWithGitHub`, `mocks/handlers/github.ts`). A hook span that only covers `getDrawing` / `getDocumentFiles` / `getCachedCatalogPage` / `unstable_cache` is not a cite for `useDrawingQuery` / `createTokenFingerprint`. A `useXxx` sentence whose verb is “exposes / waits / returns” must include those identifiers in-span — a 9-line parameter list is not enough. A component/provider sentence must start on that `export`, not an inner `const isCompanyIdPresent = useMemo`.
- Illegal first lines also include `const … = useMemo(` (same class as inner `useCallback`). A mermaid or prose cite whose subject is `Zumen` / `Auth0Provider` / `resolveAuth0ApplicationConfig` must start on that `export` / `function`, not the memo that calls it.
- A mermaid **node label token** must appear **verbatim in that figure’s Sources span text**. The cite **path** does not count. `handle-github-token-missing` ≠ `handleGitHubTokenMissing`. `jest.requireActual`, `axiosClient`, `createClient`, and `ja.json` as labels need those strings in-span — a sibling `E2E_TEST_JWT`, `NODE_GLOBALS`, `AxiosClientProvider` wrapper, or `MERGED_TRANSLATIONS` object is not a proxy.
- `const {` as the inclusive first line is a Fail even when `createStorageMiddleware` / `gitbox-state` appear later in the same range. Start on `export const store` or relabel the node.
- Extra Sources / inline cites on the same page are judged **alone**. A second `path:start-end` that starts on `const {`, `const … = useMemo(`, or an inner `useCallback` Fails even when another cite on that page already starts on the enclosing `export`. Do not add a “tighter” inner range for `sortedStatuses` / `handleDragStart` / `requireUser` destructuring.
- If a mermaid node label is a host, route, or locale filename (`api.github.com`, `/api/auth/github/refresh`, `/user`, `ja.json`, `mocks/handlers/github.ts`), that **exact string must appear in the cited statement span**. JSDoc immediately above the `export` does not count (and you must not start the range on `/**` to reach it). `useQuery({` is not `queryClient`. If the only occurrence of the token is in JSDoc above `export async function GET`, relabel the node to `GET` (or another identifier that is in-span).
- An HTTP-verb token in a mermaid node label (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) must appear **verbatim and uppercase** in that figure’s cited statement span. `api.get('/user')`, `axios.get`, or `useQuery({` does not license `GET`. If the span only has the lowercase client method, relabel the node to the identifier that is actually in-span (`/user`, `getCachedGitHubRepositoryCatalog`, `api.get`).
- Object-literal first lines include JSON/`package.json` script keys (`"test":`), Next `metadata` fields (`manifest:`), `NR_EXCEPTION_KIND` / const-map keys (`FILE_DOWNLOAD:`, `ASSEMBLY_TREE_LAYOUT:`), and type-body fields (`column: 'repo_card_id'`). Start on the enclosing `export const` / `const FOO = {` / `export type Foo`. A sibling cite that already starts on that `export` does not save the tighter key-only range.
- Package.json / JSON first lines are illegal when they are any object key, not only script names: `"scripts":`, `"dependencies":`, `"devDependencies":` are the same class as `"test":`. Start at the file’s opening `{` only if the sentence is about the whole manifest; otherwise do not cite `package.json` for a nested key. A mermaid host/route node (`api.github.com`) does not count as in-span if the only span that contains it has an illegal first line (`//`, object key, sibling helper) — discard that span and require another legal statement range, or relabel the node.
- A mermaid node label that joins several resource names with slashes or spaces (`from board / statuslist / repocard`, `store / draftSlice`) still requires **each** identifier verbatim in that figure’s Sources span text. `.from('board')` does not license `statuslist` or `repocard`. A nearby line in the same file that is **outside** the cited inclusive range does not count.
- When two `path:start-end` cites share one sentence (joined by `·`), each cite is judged alone against **every** named token in that sentence. Do not split `checkCanConvertInWorker` and `useConvertTiffToImages` across two ranges unless you also split the sentence. A shortened route in prose (`/document_files/[id]/3d_preview`) is a token; the file path `[documentFileId]` is not a substitute.

- **Mermaid gloss is a token.** Do not write `ReactFlowDrawingNode rebuild` / `NoteModal handleSave` unless `rebuild` / `NoteModal` appears in **that figure’s** cited span text. Drop the English gloss; keep the symbol. Write labels from `cite-write.md` only after the span is chosen.
- A hook sentence that says it exposes save/close (or returns those handlers) must include `handleSave` **and** `handleClose` in the inclusive span. Cutting the range at `handleSave` so `handleClose` is the next line is Fail. Extend through the `return { … }` object.
- A picker / insert paragraph that names a hook, a combobox, a server action, and a reducer is **four sentences**. Do not leave `useRepositoryCatalog` / `AddRepositoryCombobox` unnamed in any span while citing only `getUserMaintenanceRepoIdentifiers`.
- A Sources `path:start-end` that is an **extra** on a mermaid figure’s `<p class="sources">` (joined by `·`) is Fail when that inclusive span contains **none** of that figure’s node-label tokens. Hang leftover extras (`NR_EXCEPTION_KIND`, `CommandPalette`, `isTestMode`) on the prose sentence that names them, not on the figure. Union coverage of nodes across the figure’s other cites does not save a zero-token extra.
- A prose sentence that writes a dotted/library form (`lodash.merge`) requires that exact token in the cited span. `merge(` plus `import { merge } from 'lodash'` outside the range does not license `lodash.merge`.
- `export const { foo, bar } = …` is the same illegal first line as `const {`. Start on the enclosing `export const slice = createSlice({` / `export const FOO = {`, not the destructuring re-export.
- A route-looking token written `/auth/` or `/admin/` must appear as that exact character sequence. A regex literal `/^\/auth\//` does not contain `/auth/`. Name the regex source or do not write the unescaped path.
- Imported enum tokens (`USAGE_ACTIVE`, `USAGE_OTHER`) used only through an alias array (`AUTO_SELECTABLE_USAGE_STATUSES`) outside the cited `export function` range do not license naming those enums. Include the alias declaration line, or name only identifiers that appear in the span.
- A one-line `export const env = parsed.data` (or any `export const env = <identifier>`) may name `env` only. It does not contain `envSchema.safeParse` or a nested env key (`NEXT_PUBLIC_API_HOST`, any `NEXT_PUBLIC_*`). Do not treat the parsed-object export as a proxy for the schema or `process.env` object.
- A one-line `export const useXxx = () => {` may name the hook only. A sentence that writes returned `t` / `locale` / `handleClose` must include the `return {` object. Backtick `t` is a token.
- Do not name `createClient` / `toPublicBoardSlug` / `useStorageHydrated` / `requireClaims` on a caller cite (`getCachedClaims`, `getBoardBundle`, `useTheme`, `MaintenancePage`) even when the call is in-span. Split the sentence. A mermaid node `createClient` / `requireClaims` needs a Sources cite whose first line is that defining `export`.
- Status-class gloss (`5xx`, `4xx`) is a token. A `//` comment that writes `5xx` does not license it. Name `500` / `599` / `between` or omit the gloss.
- A `<dt>`/`<dd>` sentence is judged like any other sentence. An `export const FOO = defineKey(...)` / one-line key constant span may name only `FOO`. Naming `storeTargetPathIfNeeded` / `RequireCompanyId` on that key line is Fail. Split into two sentences and two cites.
- An Overview Key-code-entities `<table>` plus the following `<p class="sources">` is one sentence that names every token in every entities cell. A single entry-module span (`_app.tsx` / `proxy.ts`) is Fail. ·-joined extras are judged alone against every table token. Write one sentence per row with one cite. Do not put `<p class="sources">` immediately after that table.
- A tied-shortest leaf that only awaits a gate (`requireClaims`), logs an embed `error`, `.map`s rows (`toMaintenanceId`), and applies a `DEFAULT_*` ternary is inventory. Fold it into Overview, or walk four real branches inside one function.
- A camelCase stem is not a token. Prose or mermaid `occupiedY` is not licensed by `occupiedYByLevel` or `getOccupiedY`. JSDoc above the cited `export` does not count.
- `FAILED` is not licensed by `failWith` / `JOB_FAILED` / `VALIDATION_FAILED` (substring is not a token). Hang `FAILED` on `ASSEMBLY_EXCEL_IMPORT_PHASE` or the `failWith` helper that writes `.FAILED`.
- A `<dt>`/`<dd>` or sentence whose subject is an inner `const` / nested `function` (`occupiedYByLevel`, `getOccupiedY`) must start on that inner declaration. Growing `end` through the enclosing `export` does not license the inner name as subject.
- A sentence that says a function “starts by” doing X must cite a span whose first executable statements are X. A later assignment (`let supabaseResponse = NextResponse.next`) is a different sentence.
- A `//` comment that mentions a call (`decodeImage`) does not license that token. Grow `end` through the statement (`UTIF.decodeImage`) or delete the word.
- A separately backticked camelCase callee (`decodeImage`, `safeParse`, `getClaims`, `noticeError`) is not licensed by `UTIF.decodeImage` / `boardIdSchema.safeParse` / `jwt.getClaims`. Write the dotted form only, or cite a span whose statement has the bare identifier not after `.`.
- `export const boardSlice = createSlice({` may name `boardSlice` / `createSlice` only. Hang `setRepoCards` on the `dispatch` call, not the slice header.
- A shortest leaf whose “four phases” are a lookup plus `return (a && b && c)` is inventory. Fold it into Overview, or walk four real branches.
- A format gloss in backticks (`owner/repo`) is a token. `repo_owner` + `/` + `repo_name` is not `owner/repo`.
- A sentence that names a client method (`axiosClient.post`, `api.get`) on a `useXxx` / wrapper cite **fails** unless that exact method call appears in the cited span. The sibling `const postXxx =` range is a different sentence. Indexed access of `z.core.$ZodErrorMap` does not contain the namespace gloss `zod`.
- A mapping claim that names a source locale and a target code (`chinese` → `zh-Hant-TW`) **fails** if those literals live only in JSDoc above the `export`. Start on the map/object arm that contains both strings, or drop the strings.
- A path-punctuation token written in prose as `//` is a token. A regex `/^\/[^\/\\]/` or `\/` **does not** license `//`.
- A namespace / string gloss (`zod`) is not licensed by an alias (`NS`) declared outside the span.
- A negation (`X を置かない` / “does not render X”) still requires identifier `X` in-span. If the file never writes `X`, do not name `X`.
- A constructor / client-factory / Provider-header span may name only identifiers that appear in that inclusive text. `export async function createClient` through `createServerClient(` does not contain `getAll` / `setAll`. `const axiosClient = axios.create({` does not contain `post` / `get` / `put`. An `export const AxiosClientProvider` header through token setup does not contain HTTP status `401` / `403`. Grow `end` through the statement that writes them, or delete the word.
- A mermaid `<p class="sources">` extra whose first line is `function getLimiter` / `const consumeCaptureQuota` / `const buildForwardedQuery` is Fail even when that helper is also a node label. Hang that helper on the prose sentence only.
- Numeric literals are character sequences: prose `60000` is not licensed by `60_000`.
- A cite whose inclusive first line declares identifier A may name only A plus tokens that appear in that same first-line statement. If the sentence subject is a sibling declaration (`INTERNAL_LOGIN_REDIRECT_PATH`, `logSecurityEvent`, any later `export const` / `export function`), start on that line — `export const CUSTOMER_LOGIN_REDIRECT_PATH` is not a cite for `INTERNAL_LOGIN_REDIRECT_PATH`; `const WARNING_EVENTS` is not a cite for `export function logSecurityEvent`. `useEffectOnMount(` / `useEffectOnAny(` / `useEffectOnUpdate(` is the same illegal first line as inner `useEffect`. `return {` is the same illegal first line as `return (`. An anonymous interceptor / arrow (`(error: unknown) => {`) is an illegal first line.
- `export const ROUTES = {` may name `ROUTES` only. A later key (`LOGIN:`) is a different subject.

Line ranges must match the file you Read. If the file changed, re-read.

## Sidebar

```html
<nav class="sidebar-nav" aria-label="Wiki">
  <ol>
    <li><a href="{{overview href}}">1 Repository Overview</a>
      <ol>
        <li><a href="…">1.1 …</a></li>
      </ol>
    </li>
    …
    <li><a href="…">Glossary</a></li>
  </ol>
</nav>
```

Href from `index.html`: `./index.html`, `./pages/1-1-slug.html`  
Href from a page: `../index.html`, `./1-1-slug.html`

## Glossary page

Definition list (`<dl>` / `<dt>` / `<dd>`). Each term: one-sentence meaning + the primary file that implements it. Link back to the chapter that uses the term. A stack of `<p>` blocks is Fail. A one-row stub `<dl>` (dt `記号` / a process note) plus a stack of term `<p>` blocks is Fail. Every defined term (`TARGET_PATH`, `FAILED`, `occupiedYByLevel`, …) must be a `<dt>` / `<dd>` pair; the cite lives inside that `<dd>`. A cited `<p>` outside `<dl>` is Fail. Fewer than 8 `<dt>` terms is Fail. Each `<dt>` must be **immediately followed** by its `<dd>`. A stack of every `<dt>` then every `<dd>` is Fail (all terms share all definitions).
