# Cite write recipe (do this while drafting, not after)

Reviewers fail G3 when a sentence or mermaid label names a token the cited span does not contain. **Write the cite before you keep the sentence.** Do not draft a paragraph and then hunt for any range in the same file.

## One sentence → one cite

1. Name only the symbols you will prove in **this** sentence.
2. Open the file. The inclusive **first line** must be the `export` / named `function` / named `const FOO` / JSX tag of **that** subject.
3. Grow `end` until **every** named token is inside the span text. Then stop.
4. Attach **one** `<code class="cite">path:start-end</code>`.
5. Need a second file or a second identifier that lives outside that span? **Split the sentence first.** Never join two cites with `·` on one sentence.

A Sources `<p>` with `·` extras is judged **alone**. Each extra is a second cite: it must start on a legal first line and it does **not** inherit tokens from the sibling cite. If the paragraph names `useRepositoryCatalog` and `AddRepositoryCombobox` and `getUserMaintenanceRepoIdentifiers`, that is three sentences and three cites — not one paragraph plus a Sources dump.

A dotted / library form in prose (`lodash.merge`, `axios.get`) requires that **exact token** in the cited span. `merge(` plus `import { merge } from 'lodash'` **outside** the range does not license `lodash.merge`. Name `merge` only, or start the range on the import line **and** include the call — still do not write `lodash.merge` unless those characters appear.

- A route-looking token written `/auth/` or `/admin/` must appear as that **exact character sequence**. A regex literal `/^\/auth\//` does not contain `/auth/`. Name the regex source or do not write the unescaped path.
- Imported enum tokens (`USAGE_ACTIVE`, `USAGE_OTHER`) used only through an alias array (`AUTO_SELECTABLE_USAGE_STATUSES`) **outside** the cited `export function` range do not license naming those enums. Include the alias declaration line, or name only identifiers that appear in the span.
- A one-line `export const env = parsed.data` (or any `export const env = <identifier>`) may name `env` only. It does not contain `envSchema.safeParse` or a nested env key (`NEXT_PUBLIC_API_HOST`, `NEXT_PUBLIC_AUTH0_CLIENT_ID`, any `NEXT_PUBLIC_*` / `envSchema` field). Naming the parse or a key requires an inclusive span whose text contains that exact token. Do not treat the parsed-object export as a proxy for the schema, `safeParse`, or `process.env` object.
- A format gloss in backticks (`owner/repo`) is a token. `repo_owner` + `/` + `repo_name` is not `owner/repo`.
- A snake_case column / FK token (`repo_card_id`) is not licensed by camelCase `repoCardId` or by an alias (`FK`) whose object literal sits outside the span. Either include the `column: 'repo_card_id'` line in a legal `const FK` / `export` range, or do not write `repo_card_id`.
- A sentence that says a function “later” dispatches / constructs / returns an identifier (`setActiveBoard`) fails if that identifier is `end+1`. Grow the span through that statement, or split the sentence.
- Do not attach a host, route, or caller name (`proxy`, `/auth/callback`) to a helper span that never writes those characters. JSDoc above `export function edgeRateLimit` does not count.
- A sentence that names a client method (`axiosClient.post`, `api.get`) on a `useXxx` / wrapper cite **fails** unless that exact method call appears in the cited span. The sibling `const postXxx =` range is a different sentence. Indexed access of `z.core.$ZodErrorMap` does not contain the namespace gloss `zod`.
- A mapping claim that names a source locale and a target code (`chinese` → `zh-Hant-TW`) **fails** if those literals live only in JSDoc above the `export`. Start on the map/object arm that contains both strings, or drop the strings.
- A path-punctuation token written in prose as `//` is a token. A regex `/^\/[^\/\\]/` or `\/` **does not** license `//`.
- A namespace / string gloss (`zod`) is not licensed by an alias (`NS`) declared outside the span.
- A negation (`X を置かない` / “does not render X”) still requires identifier `X` in-span. If the file never writes `X`, do not name `X`. Contrast from the file that *does* write `X`.

## Illegal first lines (instant Fail)

Do not start a range on any of these, even if the named token appears later:

`/**` · JSDoc `*` · `'use server'` · `type Props` · `export interface` (when the subject is a function) · `const schema` · `//` · JSX `{/*` · mid-file `import` / `import type` · sibling helper · `try {` · `return (` · inner `useCallback` / `useMemo` / `useEffect` · `useEffectOnMount(` / `useEffectOnAny(` / `useEffectOnUpdate(` · `const {` · `export const { foo, bar } = …` (same class as `const {`) · object-literal / JSON key (`"test":`, `"scripts":`, `"dependencies":`, `manifest:`, `FILE_DOWNLOAD:`, `column:`)

Start a slice-actions sentence on `export const draftSlice = createSlice({`, not the destructuring re-export.

After every `path:start-end`, re-Read the file. If `end` > last line, shrink it.

## Hook / component subjects

- Subject `useXxx` / `FooProvider` / `FileDownloadBox` → first line is that `export`, not `useForm`, not an inner memo, not a sibling `const postXxx`.
- “exposes / waits / returns / save/close” must include **every returned identifier you named**. If you wrote close, `handleClose` must be in-span (extend through the `return { … }` lines). A parameter named `onClose` is not `handleClose`.
- A PascalCase type is not the camelCase param.
- A JSX child (`<AdminLogin />`) is not the page/module subject.
- `AxiosError` is not licensed by `isAxiosError` (or `isXxx` for any `Xxx` type). If the sentence writes the type name, that exact identifier must be in-span.
- A mermaid `<p class="sources">` extra must not start on a sibling helper (`const buildForwardedQuery`, `function getLimiter`, `const consumeCaptureQuota`) even when that helper is also a node label. Do not put that helper on the figure. Hang it on the prose sentence that names it; figure extras start on an `export` that already contains a node token.
- A sentence whose subject is `createClient` / `toPublicBoardSlug` / `useStorageHydrated` / `requireClaims` fails if the inclusive first line is the caller (`getPublicBoardBySlug`, `getBoardBundle`, `getCachedPublicBoard`, `useTheme`, `MaintenancePage`). Hang those names only on their defining `export`.

## Mermaid labels are citations

1. Pick a label that is **only** identifiers (or a host / route / filename) you already have in a legal statement span.
2. **Do not add English gloss** (`rebuild`, `flow`, `path`, `handler`, `on save`) unless that exact word is in the cited span text. Prefer `ReactFlowDrawingNode` over `ReactFlowDrawingNode rebuild`. Prefer `handleSave` over `NoteModal handleSave` unless both tokens are in-span.
3. Space- or slash-joined labels need **each** identifier in **that figure’s** Sources spans (`PlateEditor onChange`, `store / draftSlice`, `usePostDrawingFile / usePostDocumentFile`).
4. Host / route / locale-filename nodes (`api.github.com`, `/api/auth/github/refresh`, `/user`, `ja.json`) need that **exact string** in a legal statement span. JSDoc above `export` does not count.
5. HTTP verbs in a label must be **uppercase in-span**. `api.get` does not license `GET`. Relabel to `/user` or `api.get` if that is what the span says.
6. Immediately after `</figure>`, the next sibling is `<p class="sources">` listing those spans. A table or extra `<p>` in between is Fail.
7. Grep each node token against the **union of that figure’s span texts**. The cite **path** does not count. kebab-case ≠ camelCase.
8. Every Sources extra on that figure must contain **at least one** of the figure’s node-label tokens. Union coverage across siblings does not save a zero-token extra (`newrelic.ts` / `NR_EXCEPTION_KIND`, `CommandPalette` copy, `isTestMode`). Hang leftovers on the **prose** sentence that names them, not on the figure.

## Chips

A Relevant-source chip stays only if prose, mermaid, or an inline cite names that path or a symbol **defined in that file**. A route string is not the page module. A field key is not a constants file.

- A Relevant-source chip for a component module is unused unless prose, a mermaid node, or an inline cite names **that file’s path** or an identifier **whose `export` / `const` is defined in that file**. `SortableColumn.tsx` is not licensed by `COLUMN_DRAG_TYPE` in `StatusColumn.tsx`, nor by `NEW_ROW_DROP_TYPE` / `COLUMN_INSERT_DROP_TYPE` in the zone files.
- Prose `ErrorBoundary` is not licensed by `CustomErrorBoundary` (or any `FooErrorBoundary`). If the span only writes the wrapper identifier, name the wrapper. A JSX `{/* ErrorBoundary */}` comment may license the short token only when that comment is inside the cited inclusive range; do not assume a sibling page’s comment.

## Ledger (append to `research-notes.md` while writing)

```
- sentence subject `Foo` → `path:start-end` (first line quoted)
- mermaid node `Bar` → `path:start-end` (token found on line N)
```

If you cannot fill a ledger row, delete the claim or relabel the node.

Never serialize a missing cite as `<code class="cite">undefined</code>` or `path:undefined`. If the ledger row is empty, delete the inline cite. A Sources extra on the same page does not license a broken sibling cite.

A numbered-phase sentence that names a later call (`decodeImage`, `UTIF.decodeImage`, `encodeRgbaToPngDataUrl`) fails unless that exact token is inside the inclusive span. Do not cite only the `export const convertTiffBufferToImages` header plus the `break` and then name a call that lives at `end+1` or later.

A mermaid `<p class="sources">` extra whose first line is `const buildForwardedQuery` Fails even when `buildForwardedQuery` is a node label and the extra does not extend to `OrdersPage`. Put that helper on a prose sentence only; the figure extra for `OrdersPage` starts on `const OrdersPage`.

Do not hang `toPublicBoardSlug` on `const getCachedPublicBoard = cache(… getPublicBoardBySlug(toPublicBoardSlug(slug)))`. The caller span may name `getCachedPublicBoard` and `getPublicBoardBySlug` only. `toPublicBoardSlug` is cited on `export const toPublicBoardSlug`.

A mermaid / prose identifier that is an enum member (`FAILED`, `UPLOADING`) must appear as that exact identifier in the cited span. `failWith()`, `JOB_FAILED`, `VALIDATION_FAILED`, or `phase: 'failed'` do not license `FAILED`. `ASSEMBLY_EXCEL_IMPORT_PHASE.FAILED` must be inside the inclusive range (the helper that writes it, or the const object), not only a caller of `failWith`. Substring match is not enough: `VALIDATION_FAILED` does not contain the token `FAILED`.

A camelCase stem is not a token. Prose or mermaid `occupiedY` is not licensed by `occupiedYByLevel` or `getOccupiedY`. A JSDoc line above the cited `export` that happens to write `occupiedY` does not count. Name the identifier that appears in the inclusive span, or grow `start` only onto a legal first line whose body contains that exact token.

A sentence that writes `asPath` / `router.asPath` fails unless that exact token is in-span. `getRequestedPath({ router })` / `requestedPath` is a different identifier. Do not hang `asPath` on `storeTargetPathIfNeeded`.

Do not hang `useStorageHydrated` on `export function useTheme`. Cite `src/hooks/use-storage-hydrated.ts` on that hook’s `export`, or relabel the node to a token defined in the `useTheme` span (`hasHydrated`, `useMounted`, `selectTheme`).

A one-line `export const boardIdSchema` cite may name `boardIdSchema` / `uuidSchema` only. A sentence that writes `getBoardBundle` must cite the function that calls `boardIdSchema.safeParse`, not the schema line alone.

`export { storageApi }` does not contain `store`. Cite `export const store` for `store`, or delete the word `store` from that sentence.

A constructor / client-factory / Provider-header span may name only identifiers that appear in that inclusive text. `export async function createClient` through `createServerClient(` does not contain `getAll` / `setAll`. `const axiosClient = axios.create({` does not contain `post` / `get` / `put`. An `export const AxiosClientProvider` header through token setup does not contain HTTP status `401` / `403`. Those literals and later methods are tokens; grow `end` through the statement that writes them, or delete the word.

A mermaid `<p class="sources">` extra whose first line is `function getLimiter` / `const consumeCaptureQuota` / `const buildForwardedQuery` is Fail even when that helper is also a node label. Hang that helper on the prose sentence only.

Numeric literals are character sequences: prose `60000` is not licensed by `60_000`.

A cite whose inclusive **first line** declares identifier A may name only A plus tokens that appear in that same first-line statement. If the sentence subject is a **sibling** declaration (`INTERNAL_LOGIN_REDIRECT_PATH`, `logSecurityEvent`, any later `export const` / `export function`), start on **that** line — `export const CUSTOMER_LOGIN_REDIRECT_PATH` is not a cite for `INTERNAL_LOGIN_REDIRECT_PATH`; `const WARNING_EVENTS = …` is not a cite for `export function logSecurityEvent`. `useEffectOnMount(` / `useEffectOnAny(` / `useEffectOnUpdate(` is the same illegal first line as inner `useEffect`.

A one-line `export const env = parsed.data` (or any `export const env = <identifier>`) may name `env` only. Naming a nested env key (`NEXT_PUBLIC_API_HOST`, `NEXT_PUBLIC_AUTH0_CLIENT_ID`, any `NEXT_PUBLIC_*` / `envSchema` field) requires an inclusive span whose text contains that exact key. Do not treat the parsed-object export as a proxy for the schema, `safeParse`, or `process.env` object.

A one-line `export const useXxx = () => {` may name the hook only. A sentence that writes a returned identifier (`t`, `locale`, `handleClose`) must grow through the `return { … }` object. Backtick `t` is a token (do not drop one-letter returned keys).

An identifier whose home is a defining `export` (`createClient`, `toPublicBoardSlug`, `useStorageHydrated`, `requireClaims`) must not be named in a sentence or mermaid node cited only on a caller (`getCachedClaims`, `getBoardBundle`, `useTheme`, `MaintenancePage`), even when the caller span contains `createClient()` / `requireClaims(`. Split: the caller sentence names only the caller and tokens defined in that span; the factory/guard/hook gets its own sentence whose first line is `export async function createClient` / `export function useStorageHydrated` / `export const toPublicBoardSlug` / `export async function requireClaims`. A mermaid node `createClient` / `requireClaims` needs a figure Sources cite whose first line is that `export`.

A `<dt>`/`<dd>` sentence is judged like any other sentence. An `export const FOO = defineKey(...)` / one-line key constant span may name only `FOO`. Naming a different function or component (`storeTargetPathIfNeeded`, `RequireCompanyId`, any hook/guard) on that key line is Fail even when the dd is “about” that key. Split into two sentences and two cites, or drop the extra identifier.

An Overview Key-code-entities `<table>` plus the following `<p class="sources">` is one sentence that names every token in every entities cell. A single entry-module span (`_app.tsx` `Zumen` / `proxy.ts` `publicPaths`) is Fail. ·-joined extras are judged alone against every table token — they do not union. Write one sentence per row with one cite.

A tied-shortest architecture leaf that only awaits a gate (`requireClaims`), logs an embed `error`, `.map`s rows (`toMaintenanceId`), and applies a `DEFAULT_*` ternary is callee/transform inventory, not a ≥4-phase in-function walk. Numbered `<ol>` labels do not convert a Server Component fetch pipeline into `beginWork`. Fold that page into Overview, or walk four real branches inside one function.

A `<dt>`/`<dd>` or sentence whose subject is an inner `const` / nested `function` (`occupiedYByLevel`, `getOccupiedY`, any helper declared inside an `export`) must start on that inner declaration line. The enclosing `export const layoutTreeHorizontalTopSticky` / `export function Foo` span may name only that export plus tokens on its first-line statement. Growing `end` through the inner const does not license the inner name as subject.

A sentence that says a function “starts by” doing X must cite a span whose first executable statements are X. A later assignment (`let supabaseResponse = NextResponse.next`) is a different sentence.

A `//` or `/*` comment that mentions a call (`decodeImage`) does not license that token. The call must appear as a statement in the inclusive span (`UTIF.decodeImage` at `end+1` is Fail).

A separately backticked / `<code>` camelCase callee (`decodeImage`, `safeParse`, `getClaims`, `noticeError`, `signInWithOAuth`, `getLayout`) is not licensed by `Receiver.method` (`UTIF.decodeImage`, `boardIdSchema.safeParse`, `jwt.getClaims`, `newrelic.noticeError`). Hang the bare name only on a statement whose inclusive text contains that identifier **not** after `.` (`function decodeImage`, `decodeImage(`, a `const`). Otherwise write only the dotted form that appears in the statement — do not also write the bare property. A `//` / `/*` comment that writes the bare name does not license it.

A call-expression subject (`UTIF.decodeImage`, `axiosClient.post`) must start on that call statement. Growing `end` through an enclosing `export const convertTiffBufferToImages` / `export const useXxx` does not make that export the first line of the call.

Prose HTTP verbs (`PUT`, `GET`, `POST`, `PATCH`, `DELETE`) are tokens even when they are not mermaid labels and even when they are not wrapped in `<code>`. `uploadFileToGcs` / `useUploadFilesToGcs` does not license `PUT`. Name `axios.put` or grow onto a span that writes `PUT`.

A route token (`/drawing_files`) must appear in the cited span. `export const usePostDrawingFile` through `useMutation` does not contain `/drawing_files` — hang the path on `postDrawingFileFn` / `axiosClient.post`, or drop the path.

An Overview Key-code-entities cell with two exports still needs **both** identifiers in that row’s single sentence and that row’s single span. A second entity from another file is a second row (or drop it). Caller pages (`GET` on `auth/callback`) may not name `createFirstBoardIfNeeded` / `setGitHubTokenCookie` / `getPublicBoardBySlug` as subjects — cite each on its defining `export`.

Glossary: each term is an **adjacent** `<dt>` immediately followed by its `<dd>`. Emitting every `<dt>` and then every `<dd>` (so all terms share all definitions) is Fail even when cites live in `<dd>` and there are ≥8 `<dt>`.

`export const boardSlice = createSlice({` as the first line may name `boardSlice` / `createSlice` only. A later reducer key (`setRepoCards:`) is a different subject. Hang it on the `dispatch(setRepoCards(...))` call, not the slice header.

`export const ROUTES = {` / any const object-map header may name that const only. A later key (`LOGIN:`, `HOME:`) is a different subject — same class as `setRepoCards` on `createSlice({`. Drop the key, or cite a usage statement whose first line is not the map header (object-key first lines stay illegal).

A mermaid `<p class="sources">` cite must not start on an anonymous interceptor / arrow (`(error: unknown) => {`, `(response) => response`). Start on a named `export` whose inclusive text already contains a node token, or hang the helper on the prose sentence only. `return {` is the same illegal first line as `return (`.

When several architecture HTML files share the shortest `wc -l` (glossary excluded), a leaf whose numbered phases are ts-pattern / HTTP-status `match` arms inside an anonymous `axios.interceptors.response` callback is status-checklist inventory and fails G5 even if other same-length leaves walk named functions. Fold that page into a parent, or walk four arms inside one **named** function.

Overview Key-code-entities second identifiers must be exports, not params / axios options (`children`, `baseURL`). Drop them or make a second row whose sentence and span name a real export.

A shortest architecture leaf whose “four phases” are a lookup plus one `return (a && b && c)` / sequential AND is callee/boolean-conjunction inventory, not a ≥4-phase walk. Fold it into Overview, or walk four real condition / early-return / side-effect arms inside one named function.

Glossary must be a `<dl>` / `<dt>` / `<dd>` list. A stack of `<p>` blocks is Fail. A one-row stub `<dl>` (dt `記号` / a process note) plus a stack of term `<p>` blocks is Fail. Every defined term must be a `<dt>` / `<dd>` pair; the cite lives inside that `<dd>`. A cited `<p>` outside `<dl>` is Fail. Fewer than 8 `<dt>` terms is Fail.

Status-class gloss (`5xx`, `4xx`) is a token. A `//` comment that writes `5xx` does not license it. Name the statement identifiers (`500`, `599`, `between`) or omit the gloss.

Overview Key-code-entities identifiers must already appear as named tokens in that page’s prose or mermaid node labels. Presence only inside the cited source span, or only inside the entities `<td>`, does not count (`TreeLayoutPosition`, `MAX_UPLOAD_SIGNED_URL_COUNT`). Drop the cell token, or add a one-sentence row cite whose prose names it.
