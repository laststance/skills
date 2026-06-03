# Laststance リポジトリガイド

https://github.com/orgs/laststance/repositories から、日常コーディングに適したリポジトリ。

## 練習用リポ（毎回言及）

| リポ | 説明 | 用途 |
|------|------|------|
| **next-play** | Next.js App Routerサンドボックス | 新技術の実験、UIプロトタイプ、ページ追加 |
| **utils** | OSSコード断片モノレポ（5パッケージ） | ユーティリティ関数実装、テスト追加 |

### utils パッケージ構成
- `universal` — プラットフォーム非依存の汎用関数
- `browser` — Browser API関連
- `node` — Node.js API関連
- `types` — カスタム型定義
- `next-react` — Next.js + React固有

## プロダクト開発

| リポ | 説明 | 今日やれそうなこと |
|------|------|------------------|
| **gitbox** | GitHub Kanban PWA (Next.js + Redux + Supabase) | Issue対応、UI改善、E2Eテスト追加 |
| **nsx** | 毎日読んだWebページリスト自動投稿 | 機能追加、UI改善 |
| **lain** | Raindrop.io macOSデスクトップクライアント | Electron機能追加 |
| **corelive** | L1 cache for your mind | 新機能実装 |
| **signage** | ダークスクリーンセーバー（脳クールダウン用） | アニメーション追加 |

## ツール / CLI

| リポ | 説明 | 今日やれそうなこと |
|------|------|------------------|
| **git-gpt-commit** ⭐36 | AI Git commit メッセージ生成 | 新モデル対応、オプション追加 |
| **npm-publish-tool** | release-it + GitHub Actions セットアップ | テンプレート改善 |
| **create-web-site** | HTML/CSS/JS最小プロジェクト生成 | テンプレート拡充 |
| **prettier-husky-lint-staged-installer** | lint-staged + husky 1分セットアップ | 設定テンプレート更新 |

## UI実験 / 学習

| リポ | 説明 | 今日やれそうなこと |
|------|------|------------------|
| **react-typescript-todomvc-2022** ⭐540 | React TS TodoMVC | 最新React 19パターン適用 |
| **react-lightbox** | アクセシブルなライトボックス | アニメーション改善、テスト追加 |
| **mui-storybook** ⭐7 | MUI v7 Storybook | 新コンポーネント追加 |
| **chakrawind** | Chakra + Tailwind実験 | スタイル統合パターン検証 |
| **re-render** | React再レンダリング実験 | パフォーマンス計測追加 |

## ESLint / DX

| リポ | 説明 | 今日やれそうなこと |
|------|------|------------------|
| **eslint-config-ts-prefixer** ⭐13 | ESLint設定パッケージ | ルール追加、ESLint v10対応 |
| **react-next-eslint-plugin** | React/Next カスタムLintプラグイン | #163-165 Issue対応 |

## Agent / MCP

| リポ | 説明 | 今日やれそうなこと |
|------|------|------------------|
| **electron-mcp-server** ⭐6 | Electron MCP Server | 新ツール追加 |
| **mac-mcp-server** | macOS MCP Server | コマンド拡充 |
| **skills** | AIエージェントスキル集 | 新スキル作成 |
| **skills-desktop** ⭐5 | スキル管理デスクトップアプリ | UI改善 |
| **claude-plugin-dashboard** ⭐7 | Claude Plugin CLI | 機能追加 |

## テンプレート

| リポ | 説明 | Stars |
|------|------|-------|
| **create-react-app-vite** ⭐161 | CRA + Vite テンプレート | テンプレート更新 |
| **vite-rtk-query** ⭐150 | Vite + RTK Query テンプレート | 最新依存関係更新 |
| **next-msw-integration** ⭐5 | Next.js 16 + MSW デモ | パターン改善 |
