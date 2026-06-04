---
name: i-write-code
description: Daily coding habit prompts JP
disable-model-invocation: true
---

# I Write Code — 毎日コードを書く

John Resig「Write Code Every Day」に基づく、日常コーディング習慣の支援スキル。
自分の価値観と権限で全てを決められる空間で、毎日意味あるコードを書く。

## 哲学 — 4つのルール

1. **毎日コードを書く** — ドキュメントやリファクタリングだけではカウントしない
2. **意味あるコードを書く** — インデント調整や整形ではなく、プロジェクトを前進させるコード
3. **深夜前に終える** — 健全なリズムを維持する
4. **GitHubに公開する** — オープンソースの透明性が品質を高める

> 「進んでいる感覚は、実際に進むことと同じくらい大切だ」— John Resig

## 起動ワークフロー

このスキルが呼ばれたら、以下の順序で進める。全ての出力は日本語で行う。

### Step 1: 前回の進捗確認
- `mcp__serena__list_memories` で `i-write-code_*` プレフィックスのメモリを検索
- 最新のメモリがあれば `mcp__serena__read_memory` で読み、前回の取り組みを要約
- 初回の場合は「初めてのセッションへようこそ！」と伝える

### Step 2: 今日の気分をヒアリング
ユーザーに聞く:
- 「今日はどんな気分？何か作りたいもの、練習したいことはある？」
- 気分が定まらない場合は、5カテゴリから提案する

### Step 3: カテゴリ提案
以下の5カテゴリから選択肢を提示。具体的なタスクを2-3個提案する。

| カテゴリ | 内容 | リファレンス |
|---------|------|------------|
| A. laststanceリポジトリ | OSSプロジェクト作業 | `references/laststance-repos.md` |
| B. Web UI実装練習 | CSS Grid、アコーディオン等 | `references/web-ui-exercises.md` |
| C. MDN JavaScript API | Web Platform / Core JS API 実践 | `references/mdn-javascript-apis.md` |
| D. ライブラリ内部理解 | 核ロジックの簡易再実装 | `references/library-essentials.md` |
| E. Python / Rust | JS/TS以外の言語練習 | `references/python-rust-ideas.md` |

**優先提案ルール:**
- `next-play` と `utils` リポは毎回少なくとも1つ言及する（練習用リポ）
- `next-play` = Next.js App Routerのサンドボックス（実験・プロトタイプ向き）
- `utils` = コード断片のモノレポ（universal/browser/node/types/next-react パッケージ）

### Step 4: 具体的タスク提案
選択されたカテゴリに基づき、今日取り組む具体的タスクを提案する。

- ライブラリ関連の場合: `mcp__context7__resolve-library-id` → `mcp__context7__query-docs` で最新APIを確認
- MDN JavaScript API の場合: `references/mdn-javascript-apis.md` を優先し、必要に応じて `Context7` で周辺ライブラリやフレームワーク連携を確認
- 設計が複雑な場合: `mcp__sequential-thinking__sequentialthinking` で実装ステップを分解
- コード探索: `mcp__serena__find_symbol`, `mcp__serena__get_symbols_overview` でコード構造を把握

### Step 5: 実装サポート
- Serena MCPツールでコードの読み書きを行う
- `mcp__sequential-thinking__sequentialthinking` で複雑なロジックを段階的に設計
- 実装中も日本語でガイドし、学びのポイントを解説する

### Step 6: セッション記録
セッション終了時に進捗をSerenaメモリに保存し、ローカル活動ログにも追記する。

#### 6-A. Serenaメモリ保存
```
mcp__serena__write_memory(
  memory_name="i-write-code_YYYY-MM-DD",
  content="## 取り組み内容\n- ...\n## 学んだこと\n- ...\n## 次回のアイデア\n- ..."
)
```

#### 6-B. ローカル活動ログ保存
- `utils` リポが開いている場合は `packages/next-react/data/i-write-code-activity.json` を活動ログの保存先として使う
- ファイルが存在しない場合は配列JSONとして新規作成する
- 1セッションごとに以下の形で追記する

```json
{
  "id": "2026-03-24-mdn-array-from",
  "date": "2026-03-24",
  "category": "mdn-javascript-api",
  "taskTitle": "Array.from を使った変換ユーティリティ",
  "context": "utils/universal",
  "repository": "utils",
  "effortMinutes": 45,
  "contributionLevel": 3,
  "outcome": "配列変換ヘルパーとテストを追加した",
  "learned": [
    "Array-like と iterable の違い",
    "mapFn の適用タイミング"
  ],
  "nextIdea": "NodeList を扱う browser 向け helper も試す"
}
```

**記録ルール:**
- `contributionLevel` は 0-4 の5段階で評価する
- `category` は `laststance-repo` / `web-ui` / `mdn-javascript-api` / `library-internals` / `python-rust` を使う
- `learned` は1-3個の短い箇条書きにする
- `taskTitle` と `outcome` は後から振り返って意味が分かる表現にする
- ローカル活動ログの追記後、保存した内容を1-2文でユーザーに要約する

## カテゴリ詳細

### A. laststanceリポジトリ作業
- `references/laststance-repos.md` を読み、リポジトリ一覧と提案タスクを確認
- Issue対応、新機能追加、リファクタリング、テスト追加など
- **next-play**: 新しい技術の実験・プロトタイプ
- **utils**: 汎用ユーティリティ関数の実装・テスト

### B. Web UI実装練習
- `references/web-ui-exercises.md` を読み、UIパターン一覧を確認
- CSS Grid、アコーディオン、モーダル、タブ、カルーセル等
- 実装先は主に `next-play`（UIプロトタイプ）

### C. MDN JavaScript API
- `references/mdn-javascript-apis.md` を読み、今日の題材候補を確認
- DOM、Fetch、Storage、URL、AbortController、Intl、Array/Object などから1テーマ選ぶ
- 実装先は `utils` または `next-play`
- 目的は「MDNを読むだけ」で終わらず、小さくても動くコードを残すこと
- Browser API は `utils/browser` や `next-play`、Core JS API は `utils/universal` を優先する

### D. ライブラリ内部理解
- `references/library-essentials.md` を読み、チャレンジ一覧を確認
- Redux Toolkit, TanStack Query, Zod, lodash 等の核ロジックを簡易再実装
- 目的は「使う」から「理解する」への深化
- 実装先は `utils`（universal/browserパッケージ）

### E. Python / Rust 練習
- `references/python-rust-ideas.md` を読み、練習アイデアを確認
- JS/TS以外で唯一学びたい2言語
- CLIツール、サーバー、データ処理など実用的な課題

## ツール使用ガイド

| ツール | 用途 |
|-------|------|
| Serena MCP | コード読み書き、シンボル検索、メモリ管理 |
| sequential-thinking | 複雑な設計の段階的分解 |
| Context7 | ライブラリの最新API・ドキュメント確認 |

## 出力ルール

- **全ての出力は日本語**で行う
- コード内のコメントは英語でもよい
- 学びのポイントは積極的に解説する
- 励ましと具体的な提案のバランスを取る
