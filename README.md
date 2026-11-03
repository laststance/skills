# Laststance Skills

[![Agent Skills](https://img.shields.io/badge/Agent_Skills-open_standard-2F855A?style=flat-square)](https://agentskills.io/)
[![Claude Code](https://img.shields.io/badge/Claude_Code-compatible-D97757?style=flat-square&logo=claude&logoColor=white)](https://code.claude.com/docs/en/skills)
[![Cursor](https://img.shields.io/badge/Cursor-compatible-000000?style=flat-square&logo=cursor&logoColor=white)](https://cursor.com/docs/skills)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI_Codex-compatible-111827?style=flat-square&logo=openai&logoColor=white)](https://developers.openai.com/codex/skills)
[![Skills](https://img.shields.io/badge/skills-35-2563EB?style=flat-square)](#available-skills)

Agent skills for AI coding assistants. Install via [skills.sh](https://skills.sh).

## 🛡️ mac-security-sweep — 最新の脆弱性情報を収集し、実行したMacに被害がないか確認します

### インストール

```bash
npx skills add -g laststance/skills --skill mac-security-sweep
```

### 使い方(お使いのAIエージェントでスキルを起動)

```text
/mac-security-sweep
```

### mac-security-sweep 動作の流れ

![mac-security-sweepの5段階。名前と版を読む、公開の注意報を調べる、照合する、侵害の根拠と未確認範囲を分ける、日本語レポートを保存する。](docs/mac-security-sweep/walkthrough.gif)

[⏯ MP4動画をダウンロード](https://github.com/laststance/skills/raw/refs/heads/main/docs/mac-security-sweep/walkthrough.mp4) · [🖼 静止画](docs/mac-security-sweep/walkthrough-poster.png) · [👆 自分のペースで進めるHTML](docs/mac-security-sweep/walkthrough.html)

MP4はダウンロード後、お使いの動画プレーヤーで再生・一時停止できます。HTMLはリポジトリを取得してブラウザで開くと、「前へ・次へ・再生」で操作できます。図を見るだけでMacのスキャンが始まることはありません。

**ここからは読むだけの説明です。** 動画の `example 1.0.0` と `GHSA-fixture-positive` は、[同梱の合成テストを実行した結果](skills/mac-security-sweep/references/examples/positive-partial/report.md)に基づきます。実在の脆弱性や、誰かのMacの監査結果ではありません。理解しやすい順に見せており、実際にはニュース取得と棚卸しなどの一部を並列に進めます。

### ① Macの中にあるものの「名前と版」を読む

まず、何を使っているMacなのかを調べます。アプリ、アプリに同梱されたNode/Electronなどの実行基盤、ブラウザやエディタの拡張、開発プロジェクトの依存関係、OSの保護設定などが対象です。

たとえば依存関係の記録から、`名前: example / 版: 1.0.0 / 種類: npm` が分かります。この時点で分かるのは**「記録にその版がある」こと**です。実際に入っているか、動いているかも、それぞれ確認できた根拠を分けて残します。

プロジェクトの既定の探索先は `~/Projects`、`~/repository`、`~/work`。別の場所は `scanRoots` で指定できます。ホーム全体を無制限に読む構成ではありません。見つからない、権限が足りない、形式に対応していない、という違いも残します。[対象と制限の一覧](skills/mac-security-sweep/references/capabilities.md)

### ② そのソフトに関係する「公開の注意報」を調べる

手元の一覧とは別に、インターネットから公開情報を集めます。情報源にはそれぞれ役割があります。

| 情報 | 何を知るために使うか |
|---|---|
| Apple・Node.js・Mozillaなどの公式情報 | 製品の更新、対象の版、修正版を確認する。検出した製品に応じて対象を選ぶ。 |
| OSV・GitHub Advisory・Homebrewの脆弱性DB | パッケージの名前・版に関係する告知を探す。 |
| CISA KEV | 実際に悪用が確認された脆弱性を優先するための材料にする。 |
| IPA・JPCERT/CC・セキュリティニュースなど | 新しい事案を見つけ、一次資料を確認する入口にする。 |

ニュースに出てこなかった古い問題も取りこぼしにくくするため、新しいニュースの収集と、導入済み製品の既知情報の確認を分けています。記事の見出しだけで「この版は危険」と決めず、版や配布元が分からなければ確認候補として残します。[情報源と取得方法](skills/mac-security-sweep/references/sources.md)

### ③ 「手元の名前と版」と「告知の対象」を突き合わせる

動画の例では、手元の記録にも告知の対象にも `example 1.0.0` がありました。そこで**優先して確認する対象が1件**できます。

さらに、名前が同じでも配布元や版の体系が違わないか、同じ問題を別の告知IDで二重に数えていないかを確認します。レポートに出る「一致1件」は、感染件数ではなく**対象と告知の組み合わせ**です。

### ④ 侵害の根拠と、調べきれなかった範囲を分ける

次に、その事案に固有のファイルの指紋（ハッシュ）やプロセスなど、確認できる侵害の手掛かりを調べます。この手掛かりを **IOC** と呼びます。怪しいIPへ試しに接続したり、記事に載った修復スクリプトを実行したりはしません。

| 分かったこと | そこから言えること |
|---|---|
| 影響版の記録がある | 実物・利用状況・攻撃が届く条件を優先して確認する。 |
| 事案固有の悪性ファイルのハッシュが一致 | そのファイルの存在が確認できた。実行や情報窃取は別に確かめる。 |
| IOCの確定が0件 | 今回の方法・時点・権限では確定しなかった。過去の侵害まで否定する材料にはならない。 |
| 読めない場所や取得できない情報がある | 未確認として残し、追加で何を確認するか示す。 |

動画の例は、**優先確認1対象・IOCの確定0件・未確認範囲1件**です。この3つは別々の数字です。

### ⑤ 日本語で「分かったこと・未確認・次の行動」を残す

レポートの先頭は、**被害の有無／要対応／いちばん急ぐこと**の3行です。続いて、対象と版、告知のURL、判断の根拠、未確認の理由、優先する対策を載せます。

動画の例の要点を短くすると、「侵害は未確認。優先確認は1対象。まず実際の利用状況を確認して更新を計画する」です。**更新、削除、停止、認証の変更は自動で行いません。** 対策は理由と手順を提案し、実行するかは本人が決めます。

| 調査の状態 | 読み方 |
|---|---|
| `complete` | 今回対象にした確認が完了した。所見ゼロやMac全体の安全という意味ではない。 |
| `complete-with-exclusions` | 方針による対象外を明示したうえで、対象の確認が完了した。 |
| `partial` | 時間切れ・取得失敗・未対応などで、未確認が残っている。得られた結果は保存される。 |

レポートと証拠は `~/security-reports/`、再開用の状態は `~/.local/state/mac-security-sweep/state.json` に保存します。次に実行すると未処理の探索・照会などを再開し、前回からの変化を「新規／継続／解消／今回は確認不能」に分けます。取得できなかっただけの対象を「解消」にしません。

### 秘密保護と、調査の限界

- `.env`、秘密鍵、トークン、Cookie、認証ストアの秘密値を表示・保存しません。認証ファイルは場所や存在などのメタデータだけを扱い、`authorized_keys`も本文・行数・鍵文字列を読みません。
- パッケージ照会は、許可した名前・版・ecosystemを送ります。続きのページ用tokenや取得済み結果の公開告知IDも使用します。ファイル本文、Macの棚卸し一覧、ローカルパス、Git URLを照会へアップロードしません。
- private/local/Git/workspace由来と、由来不明のlockレコードは外部照会から除外します。**由来不明のインストール済みglobalは既定で照会候補になる例外**があり、`queryUnknownGlobals: false` で除外できます。
- macOS・既存のNode 22以上が前提です。OSV-Scannerがあればオフライン解析に使い、不在なら対応形式をNodeで静的に読みます。ツールを自動インストールしません。
- 対応する製品・形式・配置は有限です。権限が必要な領域、未取得期間、未対応形式は未確認として残します。他の物理Intel/Rosetta Macや古いmacOSでの実機確認状況も、[検証記録](skills/mac-security-sweep/references/verification.md)で区別しています。

重い処理は、コマンド全体4・scanner 2・HTTP全体6・同一host 2の同時上限を共有します。設定した時間内に終わらない分は持ち越します。**調査が途中でも、得られた根拠と残りを一緒に読める**のが、このスキルの使い方です。

### 実際に使うとき

未導入の場合に**自分でターミナルへ入力するインストールコマンド**です。実行場所は任意。スキルを導入する操作で、Macのセキュリティ巡回はまだ始まりません。

```bash
npx skills add -g laststance/skills --skill mac-security-sweep
```

導入後、対応するエージェントのチャットで **Codexなら `$mac-security-sweep`、Claude Codeなら `/mac-security-sweep`、OpenClawなら `mac-security-sweep を実行`** と依頼すると巡回を開始します。読み込みだけを確かめたい場合は「読み込み確認のみ」と付けます。

最初の時間制限つき実行は[3手順のクイックスタート](skills/mac-security-sweep/references/quickstart.md)、探索先や照会方針の変更は[設定ガイド](skills/mac-security-sweep/references/configuration.md)を参照してください。


## Installation

Install all skills:

```bash
npx skills add laststance/skills
```

Install a specific skill:

```bash
npx skills add laststance/skills --skill apollousa
npx skills add laststance/skills --skill chrome-clean-install
npx skills add laststance/skills --skill ci-hardening
npx skills add laststance/skills --skill code-step-tour
npx skills add laststance/skills --skill code-trace
npx skills add laststance/skills --skill codebase-litter-audit
npx skills add laststance/skills --skill coderabbit-resolver
npx skills add laststance/skills --skill colorful-type
npx skills add laststance/skills --skill component-hierarchy
npx skills add laststance/skills --skill cookie
npx skills add laststance/skills --skill deep-trace
npx skills add laststance/skills --skill disk-map
npx skills add laststance/skills --skill dnd
npx skills add laststance/skills --skill electron-release
npx skills add laststance/skills --skill explain
npx skills add laststance/skills --skill explain-diff-html
npx skills add laststance/skills --skill generating-codebase-wiki
npx skills add laststance/skills --skill github-actions-pnpm-ci
npx skills add laststance/skills --skill laststance-publish-skill
npx skills add laststance/skills --skill learn-html
npx skills add laststance/skills --skill load
npx skills add laststance/skills --skill locate-ui-from-code
npx skills add laststance/skills --skill mac-security-sweep
npx skills add laststance/skills --skill oss-repo-setup
npx skills add laststance/skills --skill pr-tour
npx skills add laststance/skills --skill product-inspiration
npx skills add laststance/skills --skill prop-drill
npx skills add laststance/skills --skill react-query-key-jump
npx skills add laststance/skills --skill save
npx skills add laststance/skills --skill search
npx skills add laststance/skills --skill source-grounded-research
npx skills add laststance/skills --skill ts-pattern-refactor
npx skills add laststance/skills --skill type-expand
npx skills add laststance/skills --skill ux-gap-detector
npx skills add laststance/skills --skill visual-lint
```

## Available Skills

| Skill | Description | Dependencies |
|-------|-------------|--------------|
| [apollousa](skills/apollousa/) | Creates a GitHub PR for completed work, then runs the full CodeRabbit review, CI, merge, and cleanup loop. Pass `cli` to put `@coderabbitai ignore` in the PR body and review with the CodeRabbit CLI. | [coderabbit-resolver](skills/coderabbit-resolver/) **(required)**, [CodeRabbit CLI](https://docs.coderabbit.ai/cli) (required for `cli`) |
| [chrome-clean-install](skills/chrome-clean-install/) | Refresh Chromium-based browsers by backing up profile/cache data, guiding a clean reinstall, and restoring bookmarks only. Handles Chrome, Chrome Canary, Edge, Brave, Arc, Dia, and custom Chromium browser paths. | [Node.js](https://nodejs.org/) **(required)** |
| [ci-hardening](skills/ci-hardening/) | Port the skills-desktop GitHub Actions hardening baseline — CodeQL, Dependency Review, Scorecard, Dependabot, CODEOWNERS, pinned actions, least-privilege permissions, and branch/security settings. | [Node.js](https://nodejs.org/) **(required)**, [GitHub CLI](https://cli.github.com/) (recommended) |
| [code-step-tour](skills/code-step-tour/) | Step-through sequence of a real code path: file tree on the left, one arrow per click, and the functions or callbacks on that step. For React, also shows the hook caller, the component hierarchy, and the Props or Context path. | [Node.js](https://nodejs.org/) **(required)** |
| [code-trace](skills/code-trace/) | Interactive code execution path tracer. Explains how code flows from entry point to output with step-by-step navigation. | — |
| [codebase-litter-audit](skills/codebase-litter-audit/) | Audit repositories for half-finished features, stale TODOs, no-op handlers, visible UI wired to stubs, disabled tests, stale docs, placeholder assets, suppressions, and other codebase litter that dead-code tools miss. | — |
| [coderabbit-resolver](skills/coderabbit-resolver/) | Audits inline and outside-diff CodeRabbit findings, validates fixes, rechecks review evidence before merge, and cleans up. Supports `--bulk` for all open PRs. Pass `cli` to disable the GitHub bot (`@coderabbitai ignore`) and review with the CodeRabbit CLI. | [GitHub CLI](https://cli.github.com/) **(required)**, [jq](https://jqlang.org/) **(required)**, [CodeRabbit CLI](https://docs.coderabbit.ai/cli) (required for `cli`) |
| [colorful-type](skills/colorful-type/) | Replace colorless primitives (`string`, `number`, `boolean`) with domain-rich types. Adds branded types, JSDoc, and named type aliases to communicate intent. | — |
| [component-hierarchy](skills/component-hierarchy/) | Visualize where a React component sits in the Next.js tree (Page → target) as an ASCII diagram with file paths. Supports App Router and Pages Router. | — |
| [cookie](skills/cookie/) | Copy Google Chrome's cookies into `playwright-cli` (macOS) so its browser inherits every logged-in session (GitHub, etc.). Decrypts via the macOS Keychain, loads per-cookie, verifies before navigating, and deletes the plaintext token files after. | `playwright-cli` **(required)**, Node.js **(required)** |
| [deep-trace](skills/deep-trace/) | Line-by-line execution path tracer for PR diffs, git diffs, or specified code sections. Maps every line to its screen/URL, data flow, and execution context like a debugger's step-through. | [Serena MCP](https://github.com/oraios/serena) (recommended) |
| [disk-map](skills/disk-map/) | Interactive macOS disk map in a local browser viewer: a read-only scan sized by allocated space, Chat that the invoking agent answers itself, evidence-based cleanup recommendations, review questions for uncertain items, and Clean Up only after the exact manifest is confirmed. Verified caches and build output are removed permanently; reviewed personal files go to the Trash with restore; every operation is journaled and reported. | [Node.js](https://nodejs.org/) 22+ **(required)**, macOS **(required)** |
| [dnd](skills/dnd/) | Browser drag-and-drop QA via coordinate-based pointer ops, plus video + drop+10-frame evidence for motion-sensitive bugs (DragOverlay rollback, ghost return). Knowledge-injection skill loaded by browser-using skills (e.g. `ux-gap-detector`) before any browser interaction — ref-based `drag` returns false success on `dnd-kit` and similar libraries. | `playwright-cli` **(required)**, `ffmpeg` (recommended for frame extraction) |
| [electron-release](skills/electron-release/) | Guides Electron app release process including build, code signing, notarization, and GitHub Release with auto-update support. | — |
| [explain](skills/explain/) | Deep, systematic explanation of code, concepts, and system behavior. Always operates at advanced level with introspection markers and validation. | [Serena MCP](https://github.com/oraios/serena) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |
| [explain-diff-html](skills/explain-diff-html/) | Explains a diff, branch, or PR as one self-contained interactive HTML page — deep background, core intuition with toy-data figures, a grouped code walkthrough, and a five-question multiple-choice quiz that checks the reader actually understood the change. Explores surrounding code for context; diagrams are HTML, never ASCII. | — |
| [generating-codebase-wiki](skills/generating-codebase-wiki/) | Generate a local DeepWiki-style static HTML site that explains a codebase with numbered chapters, mermaid diagrams that name real symbols, and path:line citations. | — |
| [github-actions-pnpm-ci](skills/github-actions-pnpm-ci/) | Creates secure pnpm/Node GitHub Actions CI with SHA-pinned actions, pnpm store caching, frozen installs, lint/test/build/typecheck workflows, and Dependabot updates. | — |
| [laststance-publish-skill](skills/laststance-publish-skill/) | Publishes a stable skill to the laststance/skills GitHub registry for distribution via `npx skills add`, or ships local edits to an already-published one. A new skill gets its README install command, table row, usage example (alphabetical), and badge count; an update re-checks its table row and resyncs the install with `npx skills update` after the push. | — |
| [learn-html](skills/learn-html/) | Answers a general "how does X work?" question as one self-contained interactive HTML explainer (background → intuition → mechanics → quiz). Every factual claim must be sourced — docs lookup, a live measurement, or a repo grep — and anything unverified is flagged inline rather than smoothed into confident prose. Output language follows the question's language. | [Context7 MCP](https://github.com/upstash/context7) (recommended) |
| [load](skills/load/) | Load project context from Serena MCP memory for session initialization. Discovers memories, reads `CRITICAL_*` rules, cross-referenced memories, and the latest session checkpoint, and keeps tooling decisions recorded by a different agent as history. | [Serena MCP](https://github.com/oraios/serena) **(required)** |
| [locate-ui-from-code](skills/locate-ui-from-code/) | Code → screen: locate UI with on-screen highlight overlay (ring + file badge), reach logic branches (`debugger`, `if`, `useEffect`, handlers) by executing the user operations that trigger them, and capture DOM dump + highlighted screenshots. Agent runs the reach recipe itself and leaves the browser open for DevTools. Tool-agnostic — `cursor-ide-browser` MCP (Cursor), `playwright-cli` (Codex/Claude Code), chrome-devtools MCP when available. | `playwright-cli` (Codex/Claude Code), cursor-ide-browser MCP (Cursor), chrome-devtools MCP (recommended) |
| [mac-security-sweep](skills/mac-security-sweep/) | Read-only macOS security sweep with adaptive software readers, product advisory baselines, provenance-filtered dependency checks, IOC triage, bounded shared concurrency, and recoverable reports in Japanese. Preserves unknown coverage and keeps secrets local; remediation is proposal-only. | macOS **(required)**, [Node.js](https://nodejs.org/) 22+ **(required)**, [OSV-Scanner](https://github.com/google/osv-scanner) (recommended) |
| [oss-repo-setup](skills/oss-repo-setup/) | Bring a TypeScript/pnpm repo to an OSS-ready baseline modeled on laststance/happy-dom-extended — ESLint + Prettier + Fallow + coverage tooling, Test/Build/TypeCheck/Lint/Format/Fallow/Security/Socket/Scorecard workflows with Codecov, SECURITY/CONTRIBUTING/CODE_OF_CONDUCT/TESTING/ARCHITECTURE/TODOS docs, and README badges, in four commits; pushes and repo settings only after confirmation. No Dependabot. | [Node.js](https://nodejs.org/) **(required)**, [pnpm](https://pnpm.io/) **(required)**, [GitHub CLI](https://cli.github.com/) **(required)** |
| [pr-tour](skills/pr-tour/) | Live onboarding tour of newly implemented code. Runs the target app in a debug session — the vscode-debug-mcp bridge and playwright-cli attach to the same Chrome — pauses at curated breakpoints inside the new code while driving the real UI, narrates each stop in chat mapping UI moments to exact file:line, and writes a replayable tour artifact (before/after screenshots + deep-trace-extension replay table). | `playwright-cli` **(required)**, [Debug MCP Bridge](https://github.com/laststance/vscode-debug-mcp) **(required)**, [Serena MCP](https://github.com/oraios/serena) (recommended) |
| [product-inspiration](skills/product-inspiration/) | Provides UI/feature implementation inspiration by researching top-tier apps. Implements all proposed patterns in _trials/ folder for hands-on evaluation. | [Tavily MCP](https://github.com/tavily-ai/tavily-mcp-server) (recommended) |
| [prop-drill](skills/prop-drill/) | Trace React prop-drilling paths from origin definition to leaf consumers. Shows the original prop definition as a clickable code block, the full drilling route as a table, and a Mermaid flowchart. | [Serena MCP](https://github.com/oraios/serena) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |
| [react-query-key-jump](skills/react-query-key-jump/) | Jump from a TanStack React Query `queryKey` string (e.g. `getDrawing`) to the `useQuery` / `useInfiniteQuery` hook line where that key is defined. Skips `invalidateQueries` usage sites. | [ripgrep](https://github.com/BurntSushi/ripgrep) **(required)** |
| [save](skills/save/) | Save session context to Serena MCP memory for cross-session persistence. Analyzes accomplishments, persists learnings, and creates session checkpoints tagged with the authoring agent, so agent-specific tooling decisions don't leak into Claude Code / Cursor / Codex sessions that share the same memory. | [Serena MCP](https://github.com/oraios/serena) **(required)** |
| [search](skills/search/) | Iterative multi-tool research. Picks the best-fit tool (WebSearch, WebFetch, Exa, Perplexity, Tavily, Context7, DeepWiki) for the question type, then switches tool families across up to 3 passes until a citation-backed answer is reached. | [Exa MCP](https://github.com/exa-labs/exa-mcp-server) (recommended), [Perplexity MCP](https://github.com/ppl-ai/modelcontextprotocol) (recommended), [Tavily MCP](https://github.com/tavily-ai/tavily-mcp-server) (recommended), [Context7](https://github.com/upstash/context7) (recommended) |
| [source-grounded-research](skills/source-grounded-research/) | Produces source-grounded research briefs with citations, contradiction handling, and query logs. Research-only — no implementation or speculative answers without sources. | [Context7](https://github.com/upstash/context7) (recommended), web search / MCP (recommended) |
| [ts-pattern-refactor](skills/ts-pattern-refactor/) | Detect and refactor conditional code to ts-pattern's `match().with().exhaustive()`. Refactors JSX branching, chained ternaries, and discriminated-union dispatch — but deliberately leaves plain single-condition if-chains alone. Codifies syntactic-form × context judgment criteria. | [ts-pattern](https://github.com/gvergnaud/ts-pattern) **(required)**, [Context7](https://github.com/upstash/context7) (recommended), [Serena MCP](https://github.com/oraios/serena) (recommended) |
| [type-expand](skills/type-expand/) | Expands TypeScript type aliases into concrete, primitive-resolved shapes — unions, intersections, generics, conditional types, infer-based types, and common utility types as far as statically resolvable. Use when IDE hover only shows alias names. | [tsx](https://github.com/privatenumber/tsx) (recommended), TypeScript project `tsconfig.json` **(required)** |
| [ux-gap-detector](skills/ux-gap-detector/) | Detects UI/UX quality gaps in authenticated SaaS web apps via `playwright-cli`. Crawls app interior, captures screenshots, scores across 4 dimensions (Typography & Spacing, Interactive States, Content Hierarchy, Loading & Error UX), and generates an actionable Markdown gap report. Optionally creates GitHub Issues. | `playwright-cli` **(required)**, [Serena MCP](https://github.com/oraios/serena) (recommended) |
| [visual-lint](skills/visual-lint/) | ESLint for rendered UI. Screenshots a running app via `playwright-cli` to detect wrapping, clipping, overlap, misalignment, and unreadable badge text. Checks colored badges against their backgrounds and explicit foreground requirements in light/dark themes. Baseline-free and read-only — reports cited findings without editing source or claiming unmeasured contrast ratios. | `playwright-cli` **(required)** |

## Usage

After installation, invoke skills as slash commands in your AI coding assistant:

```
/apollousa                        # Create PR, resolve CodeRabbit, merge, and clean up
/apollousa cli                    # Create PR, review with CodeRabbit CLI (bot ignored), merge
/chrome-clean-install Chrome Canary # Clean-refresh a Chromium browser profile/cache
/ci-hardening                        # Port skills-desktop CI security baseline to this repo
/code-step-tour checkout submit     # Step through a call path, including React props and context
/code-trace                         # Trace code execution paths
/codebase-litter-audit              # Find half-finished codebase litter
/coderabbit-resolver 17             # Process PR #17
/coderabbit-resolver 17 cli         # Process PR #17 via CodeRabbit CLI (bot ignored)
/coderabbit-resolver --bulk         # Process all open PRs
/coderabbit-resolver --bulk cli     # All open PRs via CodeRabbit CLI
/colorful-type                       # Replace primitives with domain types
/component-hierarchy Button.tsx      # ASCII tree from Page down to target component
/cookie                             # Import Chrome cookies into a playwright-cli session
/deep-trace 42                      # Trace PR #42 line-by-line
/disk-map                           # Map Mac storage, chat about it, reviewed cleanup
/dnd                                # Load drag-and-drop coordinate-based verification protocol
/electron-release                   # Electron release workflow
/explain src/auth/middleware.ts      # Deep code explanation
/explain-diff-html 42               # Interactive HTML PR walkthrough + quiz
/generating-codebase-wiki <repo>    # DeepWiki-style static HTML wiki of a codebase
/github-actions-pnpm-ci             # Add secure pnpm GitHub Actions CI
/laststance-publish-skill           # Publish or update a skill in laststance/skills
/learn-html compositionend          # Sourced HTML explainer: background → mechanics → quiz
/load                               # Load session context from Serena MCP
/locate-ui-from-code FolderHeader     # Locate render target with screenshot + DOM dump
/locate-ui-from-code src/Foo.tsx:139  # Locate UI + reach debugger/effect/handler at pinned line
/mac-security-sweep                 # Read-only Mac security sweep and Japanese report
/oss-repo-setup                     # OSS-ready repo: CI, badges, community docs
/pr-tour                             # Live debug-session tour of newly written code
/product-inspiration                # Get UI/feature inspiration
/prop-drill orderData OrderTable    # Trace prop-drilling path
/react-query-key-jump getDrawing    # Jump to useQuery queryKey definition line
/save                               # Save session context to Serena MCP
/search what changed in React 19    # Iterative multi-tool research (Web + MCPs) until satisfied
/source-grounded-research React 19  # Cited research brief (no code changes)
/ts-pattern-refactor                # Sweep codebase for ts-pattern refactor opportunities
/type-expand OrderItemSetting       # Expand a TypeScript type alias to its concrete shape
/ux-gap-detector                    # Detect UX gaps in authenticated SaaS web app
/visual-lint                        # Check rendered UI defects and badge readability across themes
```

## License

MIT
