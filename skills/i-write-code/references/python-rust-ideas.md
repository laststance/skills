# Python & Rust 練習アイデア

JS/TS以外で唯一学びたい2言語の実践的な練習課題。
小さく始めて、動くものを毎日作る。

---

## Python

### 入門（⭐）

| 課題 | 説明 | 使うもの |
|------|------|---------|
| ファイルリネーマー | ディレクトリ内ファイルの一括リネーム | `pathlib`, `os` |
| JSON整形CLI | JSONファイルを読み込み、整形して出力 | `json`, `argparse` |
| Markdownリンク抽出 | .mdファイルからURL一覧を抽出 | `re`, 正規表現 |

### 中級（⭐⭐）

| 課題 | 説明 | 使うもの |
|------|------|---------|
| CLIタスク管理 | タスクのCRUD（JSONファイル保存） | `click`, `rich` |
| Webスクレイパー | 指定URLからタイトル・メタ情報を取得 | `httpx`, `BeautifulSoup` |
| FastAPI TODO API | RESTful CRUD API | `FastAPI`, `Pydantic` |
| CSVアナライザー | CSV読み込み → 統計情報出力 | `pandas`, `tabulate` |

### 応用（⭐⭐⭐）

| 課題 | 説明 | 使うもの |
|------|------|---------|
| GitHub Issue Viewer | GitHub APIからIssue一覧を取得・表示 | `httpx`, `rich` |
| ファイル同期ツール | 2ディレクトリ間のdiff + 同期 | `pathlib`, `hashlib` |
| MCP Server | MCPプロトコル準拠のサーバー実装 | `mcp` SDK |

---

## Rust

### 入門（⭐）

| 課題 | 説明 | 使うもの |
|------|------|---------|
| echo CLI | 引数を整形して出力 | 標準ライブラリのみ |
| ファイル行数カウント | 指定ファイルの行数・単語数 | `std::fs`, `std::io` |
| 温度変換器 | 摂氏⇔華氏の変換CLI | `std::env` |

### 中級（⭐⭐）

| 課題 | 説明 | 使うもの |
|------|------|---------|
| CLIツール | 引数パース + サブコマンド | `clap` |
| JSONパーサー | 簡易JSONパーサー実装 | 手書き（再帰下降） |
| grep簡易版 | パターンマッチ + ファイル検索 | `regex`, `walkdir` |
| HTTPクライアント | APIにリクエストして結果表示 | `reqwest`, `tokio` |

### 応用（⭐⭐⭐）

| 課題 | 説明 | 使うもの |
|------|------|---------|
| Wasm カウンター | Rust → Wasm → ブラウザ表示 | `wasm-pack`, `wasm-bindgen` |
| 簡易HTTPサーバー | TCPソケットからHTTPレスポンス | `std::net::TcpListener` |
| Markdown → HTML | Markdownパーサー + HTML出力 | 手書きパーサー |

---

## 進め方のコツ

1. **JS/TSとの比較で理解する** — 「JSならこう書くけど、Pythonでは…」の視点
2. **1課題 = 1リポ or 1ディレクトリ** — 小さく保つ
3. **READMEに学びを書く** — 言語固有の概念（所有権、GIL等）のメモ
4. **Context7で公式ドキュメントを確認** — API仕様は常に最新を参照
5. **Rustは所有権・借用を意識** — コンパイラエラーを恐れず、理解の糧にする
