---
name: product-inspiration
description: |
  Provides UI/feature implementation inspiration with wireframes by researching top-tier apps.
  Implements ALL proposed patterns in _trials/ folder, then user picks the best one after hands-on evaluation.

  Use when user:
  - Asks for UI/feature implementation ideas or inspiration
  - Wants to know how top-tier apps implement a feature
  - Needs wireframe proposals for a feature
  - Requests inspiration, asks "how do other apps do this", "show patterns"

  開発中のプロダクトの機能/UIインスピレーションを提供。
  トップティアアプリを調査し、5パターン前後のデザイン提案を全て実装。
  実物を見比べてから最良のパターンを選択する「Try All, Pick Best」ワークフロー。
allowed-tools: "Read,Write,WebSearch,WebFetch,Task,AskUserQuestion,TodoWrite,Bash,Skill"
---

# Product Inspiration Skill

プロダクト開発時の機能/UIインスピレーションを、トップティアアプリのリサーチに基づいて提供するスキル。

## Quick Start

1. ユーザーが実装したい機能/UIを特定
2. WebSearch + Tavily でトップティアアプリを調査
3. 5パターンのインスピレーションをワイヤーフレーム付きで提示
4. **全パターンを `_trials/` フォルダに実装**
5. スクリーンショット付きで比較レポート生成
6. 実物を見てから最良のパターンを選択
7. 選択したパターンを `src/` に昇格、不要なものをクリーンアップ

```
例: "ダッシュボード画面のインスピレーションが欲しい"
→ Linear, Vercel, Stripe 等を調査
→ 5パターン提示
→ 全パターン実装 (_trials/)
→ 比較して選択
→ 勝者を src/ に昇格
```

---

## Philosophy

> 「実物を見てから決める」

ワイヤーフレームだけでは伝わらないニュアンスがある。全パターンを実際に実装し、動作するUIを見比べてから最良を選ぶことで、より確信を持った意思決定ができる。

---

## Workflow Overview

```
Phase 1: Clarification → ユーザー要望の理解
Phase 2: Research → トップティアアプリの徹底調査
Phase 3: Present → 5パターンのインスピレーション提示（ワイヤーフレーム付き）
Phase 4: Quick Preview → 実装スコープの確認
Phase 5: Implement All → _trials/ に全パターン実装
Phase 6: Compare → 比較レポート生成（スクリーンショット付き）
Phase 7: Select → 実物を見て最良を選択
Phase 8: Finalize → 勝者昇格 + クリーンアップ
```

---

## Phase 1: Clarification（要望の明確化）

ユーザーの要望から以下を把握する（不明なら質問）：

| 項目 | 例 |
|------|-----|
| **実装したい機能/UI** | 「ユーザー設定画面」「検索フィルター」「ダッシュボード」 |
| **プロダクトのコンテキスト** | 「SaaSの管理画面」「ECサイト」「SNSアプリ」 |
| **ターゲットプラットフォーム** | Web / Mobile / Desktop |
| **既存の技術スタック** | Next.js + Tailwind, React Native等 |
| **参考にしたい具体的なアプリ**（あれば） | Notion, Linear, Figma等 |

**AskUserQuestionで確認する場合の例**:
```
question: "どんな機能/UIのインスピレーションが必要ですか？"
options:
- label: "Settings / Preferences画面"
- label: "Dashboard / Analytics画面"
- label: "List / Table表示"
- label: "Form / Input画面"
```

---

## Phase 2: Research（徹底リサーチ）🔴 CRITICAL

**このフェーズが最重要**。複数の検索ツール/エージェントを**並列で**フル活用する。

### 2.1 利用するツール

| ツール | 用途 | 優先度 |
|--------|------|--------|
| **WebSearch** | 最新のUI/UXトレンド検索 | 🔴 必須 |
| **mcp__tavily__tavily_search** | 深掘り検索、技術記事 | 🔴 必須 |
| **Task (deep-research-agent)** | 包括的な複数ソース調査 | 🟡 推奨 |
| **WebFetch** | 特定URLの詳細取得 | 必要に応じて |

### 2.2 検索クエリテンプレート

```
一般検索:
- "[feature] UI design patterns 2024"
- "[feature] UX best practices"
- "best [feature] design examples"
- "[app名] [feature] how it works"

トップティアアプリ調査:
- "Notion [feature] design"
- "Linear [feature] implementation"
- "Figma [feature] UX"
- "Stripe [feature] dashboard"
- "Vercel [feature] UI"

日本語検索:
- "[機能] UI デザイン 事例"
- "[機能] UX パターン"
```

### 2.3 トップティアアプリリスト

参照: `references/top-tier-apps.md`

カテゴリ別のトップティアアプリリストを参照し、対象機能に関連するアプリを調査。

### 2.4 調査項目

各パターンについて以下を記録：

- **アプリ名・URL**
- **スクリーンショット/参照リンク**
- **レイアウト構造**（ヘッダー/サイドバー/メインコンテンツ等）
- **インタラクションパターン**（クリック、ホバー、トランジション）
- **差別化ポイント**（このアプリならではの工夫）
- **技術的実装のヒント**

**最低5つ以上のアプリ**を調査すること。

---

## Phase 3: Present（インスピレーション提示）

調査結果から**5パターン前後**のインスピレーションを提示。

### 3.1 提示フォーマット

各パターンは以下の構造で提示：

```markdown
## Pattern [N]: [パターン名] - [参考アプリ名]

### 概要
[1-2文でパターンの特徴を説明]

### 参考アプリ
- **アプリ**: [アプリ名]
- **URL**: [参考URL]
- **特徴**: [このアプリの工夫ポイント]

### ワイヤーフレーム
[ASCII/Unicode ワイヤーフレーム]

### 設計ポイント
- [ポイント1]
- [ポイント2]
- [ポイント3]

### 実装の複雑さ
⭐⭐⭐☆☆ (3/5) - [簡潔な理由]
```

### 3.2 ワイヤーフレーム記法

参照: `references/wireframe-guide.md`

**基本構造例**:
```
┌─────────────────────────────────────────────┐
│  Header / Navigation                        │
├──────────┬──────────────────────────────────┤
│          │                                  │
│  Sidebar │        Main Content              │
│          │                                  │
│  [nav]   │  ┌────────────────────────────┐  │
│  [nav]   │  │  Card / Component          │  │
│  [nav]   │  └────────────────────────────┘  │
│          │                                  │
├──────────┴──────────────────────────────────┤
│  Footer (optional)                          │
└─────────────────────────────────────────────┘
```

---

## Phase 4: Quick Preview（実装スコープ確認）

5パターン提示後、どのパターンを実装するか確認。

### 4.1 目的
- 全パターン実装は時間がかかるため、スコープを絞る機会を提供
- ただし**最低2パターン**は必須（比較のため）

### 4.2 AskUserQuestion

```typescript
AskUserQuestion({
  questions: [{
    question: "どのパターンを実装しますか？（実物を見比べて最終決定できます）",
    header: "Implementation Scope",
    options: [
      { label: "全パターン実装 (推奨)", description: "5パターン全て実装して比較" },
      { label: "Top 3 を実装", description: "複雑さのバランスが良い上位3つ" },
      { label: "自分で選ぶ", description: "実装するパターンを指定" }
    ],
    multiSelect: false
  }]
})
```

### 4.3 マニフェストファイル作成

実装開始時に `_trials/.manifest.json` を作成：

```json
{
  "session_id": "pi_[timestamp]",
  "feature": "[機能名]",
  "patterns_to_implement": ["pattern-1", "pattern-2", "pattern-3"],
  "started_at": "[ISO timestamp]",
  "status": "implementing"
}
```

---

## Phase 5: Implement All（全パターン実装）🔴 CRITICAL

### 5.1 フォルダ構造

```
project/
├── src/                          # 既存ソース
├── _trials/                      # 試作フォルダ（一時的）
│   ├── .manifest.json            # セッション状態
│   ├── pattern-1-[name]/
│   │   ├── PATTERN.md            # パターンメタデータ
│   │   ├── components/           # 実装コード
│   │   │   └── [Feature]/
│   │   │       ├── index.tsx
│   │   │       └── styles.css
│   │   └── screenshots/
│   │       └── preview.png
│   ├── pattern-2-[name]/
│   │   └── ...
│   └── COMPARISON.md             # 比較レポート（Phase 6で生成）
└── plan.md                       # 最終プラン（Phase 8で生成）
```

### 5.2 PATTERN.md テンプレート

各パターンフォルダに作成：

```markdown
---
pattern_id: [N]
name: "[パターン名]"
source_app: "[参考アプリ名]"
complexity: [N]/5
implemented_at: "[ISO timestamp]"
---

## Overview
[パターンの概要]

## Key Features
- [特徴1]
- [特徴2]
- [特徴3]

## Files Created
- components/[Feature]/index.tsx
- components/[Feature]/styles.css

## Implementation Notes
[実装時の注意点やカスタマイズ内容]

## Screenshot
![Preview](./screenshots/preview.png)
```

### 5.3 実装ルール

| ルール | 詳細 |
|--------|------|
| **完全動作** | インタラクションも含めて動作する状態で実装 |
| **既存スタック準拠** | プロジェクトの技術スタック（Tailwind, shadcn/ui等）に合わせる |
| **最小限の依存** | 新規依存関係は必要最小限に |
| **コードスタイル** | プロジェクトの既存パターンに従う |

### 5.4 進捗報告

各パターン実装後に報告：

```
✅ Pattern 1 (Linear Sidebar) - 実装完了
   Files: 3 | Lines: 147
   Screenshot: _trials/pattern-1-linear/screenshots/preview.png

🔄 Pattern 2 (Notion Modal) - 実装中...

⏳ Pattern 3 (Stripe Tabs) - 待機中
```

### 5.5 スクリーンショット取得

Electronプロジェクトの場合：
`/electron` スキルを使用してスクリーンショット撮影・UI操作を行う。

撮影したスクリーンショットは `_trials/pattern-N/screenshots/preview.png` に保存。

### 5.6 エラーハンドリング

実装失敗時：
1. `_trials/pattern-N/ERROR.md` にエラー内容を記録
2. ユーザーに確認：続行 or 中止

---

## Phase 6: Compare（比較レポート生成）

### 6.1 COMPARISON.md 生成

`_trials/COMPARISON.md` を作成：

```markdown
# Pattern Comparison Report

Generated: [timestamp]
Feature: [機能名]

## Summary Table

| Aspect | Pattern 1 | Pattern 2 | Pattern 3 |
|--------|-----------|-----------|-----------|
| Name | Linear Sidebar | Notion Modal | Stripe Tabs |
| Complexity | ⭐⭐⭐☆☆ | ⭐⭐⭐⭐☆ | ⭐⭐☆☆☆ |
| Lines of Code | ~150 | ~250 | ~100 |
| New Dependencies | 0 | 1 | 0 |
| Accessibility | Good | Excellent | Good |
| Mobile Ready | Partial | Yes | Yes |
| Keyboard Navigation | Full | Full | Partial |

## Screenshots

### Pattern 1: Linear Sidebar
![Pattern 1](./pattern-1-linear/screenshots/preview.png)

### Pattern 2: Notion Modal
![Pattern 2](./pattern-2-notion/screenshots/preview.png)

### Pattern 3: Stripe Tabs
![Pattern 3](./pattern-3-stripe/screenshots/preview.png)

## Detailed Analysis

### Pattern 1: Linear Sidebar

**Pros:**
- コンパクトで場所を取らない
- キーボードナビゲーション完備
- 実装がシンプル

**Cons:**
- 設定項目が多い場合はスクロールが必要
- モバイル対応に追加作業が必要

### Pattern 2: Notion Modal
[同様に Pros/Cons を記載]

### Pattern 3: Stripe Tabs
[同様に Pros/Cons を記載]

## Recommendation

**総合評価**: Pattern [N] ([名前]) を推奨

**理由**:
- [理由1]
- [理由2]
```

### 6.2 比較表示

比較レポートの内容をユーザーに表示。スクリーンショットがある場合は並べて見せる。

---

## Phase 7: Select（最終選択）

### 7.1 AskUserQuestion

```typescript
AskUserQuestion({
  questions: [{
    question: "全パターンを確認しました。どのパターンを採用しますか？",
    header: "Final Selection",
    options: [
      { label: "Pattern 1: Linear Sidebar", description: "コンパクト、キーボード重視" },
      { label: "Pattern 2: Notion Modal", description: "フルページ、a11y優秀" },
      { label: "Pattern 3: Stripe Tabs", description: "シンプル、実装最軽量" },
      { label: "ハイブリッド", description: "複数パターンの要素を組み合わせ" }
    ],
    multiSelect: false
  }]
})
```

### 7.2 ハイブリッド選択時

ユーザーが「ハイブリッド」を選んだ場合：
1. どのパターンからどの要素を使うか確認
2. マージした実装プランを作成

---

## Phase 8: Finalize（最終化）

### 8.1 勝者の昇格

選択されたパターンを `src/` に移動：

```bash
# 例: pattern-2 が選ばれた場合
cp -r _trials/pattern-2-notion/components/Settings src/components/
```

### 8.2 不要パターンのアーカイブ

```bash
mkdir -p _trials/_archived
mv _trials/pattern-1-* _trials/_archived/
mv _trials/pattern-3-* _trials/_archived/
```

### 8.3 クリーンアップ確認

```typescript
AskUserQuestion({
  questions: [{
    question: "不採用のパターンは _trials/_archived/ に移動しました。どうしますか？",
    header: "Cleanup",
    options: [
      { label: "参考用に保持", description: "後で比較したい場合に便利" },
      { label: "今すぐ削除", description: "ディスク容量を節約" },
      { label: "7日後に自動削除", description: "しばらく様子を見る" }
    ],
    multiSelect: false
  }]
})
```

### 8.4 plan.md 生成

プロジェクトルートに最終 `plan.md` を作成：

```markdown
# Implementation Plan: [機能名]

> Generated by product-inspiration skill (Try All, Pick Best workflow)

## Selected Pattern
**Pattern [N]: [名前]** - [参考アプリ名]

[パターンの概要]

## Files Promoted
- src/components/[Feature]/index.tsx (from _trials/pattern-N)
- src/components/[Feature]/styles.css

## Post-Selection Tasks
- [ ] インポートパスの調整
- [ ] 既存コンポーネントとの統合
- [ ] テストの追加
- [ ] ドキュメント更新

## Comparison Summary
| Pattern | Status |
|---------|--------|
| Pattern 1 | Archived |
| Pattern 2 | **Selected** |
| Pattern 3 | Archived |

## References
- [参考URL1]
- [参考URL2]
```

### 8.5 マニフェスト更新

```json
{
  "session_id": "pi_[timestamp]",
  "feature": "[機能名]",
  "patterns_to_implement": ["pattern-1", "pattern-2", "pattern-3"],
  "started_at": "[ISO timestamp]",
  "completed_at": "[ISO timestamp]",
  "status": "completed",
  "selected_pattern": "pattern-2",
  "archived_patterns": ["pattern-1", "pattern-3"]
}
```

---

## Quality Checklist

最終確認項目：

### リサーチ
- [ ] 最低5つのトップティアアプリを調査した
- [ ] WebSearch + Tavily を両方使用した
- [ ] 最新情報（2024-2025）を優先した

### インスピレーション提示
- [ ] 5パターン前後を提示した
- [ ] 各パターンにワイヤーフレームがある
- [ ] 参考アプリとURLが明記されている

### 実装
- [ ] 選択されたパターンが `_trials/` に実装された
- [ ] 各パターンにスクリーンショットがある
- [ ] 各パターンに PATTERN.md がある

### 比較
- [ ] COMPARISON.md が生成された
- [ ] 比較テーブルに全パターンが含まれている

### 最終化
- [ ] 勝者が `src/` に昇格された
- [ ] 不採用パターンがアーカイブされた
- [ ] plan.md が生成された

---

## Language

- ユーザーが日本語 → 日本語で出力
- ユーザーが英語 → 英語で出力
- コード、技術用語は英語のまま

---

## Reference Files

- トップティアアプリリスト: `references/top-tier-apps.md`
- ワイヤーフレームガイド: `references/wireframe-guide.md`

---

## Success Criteria

このスキルの実行が成功した時：

- [ ] 最低5つのトップティアアプリを調査した
- [ ] 5パターン前後のインスピレーションをワイヤーフレーム付きで提示した
- [ ] 選択されたパターンが全て `_trials/` に実装された
- [ ] スクリーンショット付き比較レポートが生成された
- [ ] ユーザーが実物を見て最良のパターンを選択した
- [ ] 勝者が `src/` に昇格され、plan.md が生成された
