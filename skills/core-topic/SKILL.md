---
name: core-topic
description: React core deep-dive JP
disable-model-invocation: true
---

# Core Topic — Wizard への道

休日にだらだらしてる自分を奮い立たせる。React/JS/TS/Node エコシステムの
伝説的な GitHub コンテンツをランダムに1つ選び、深掘り解説を行う。

全ての出力は日本語で行う。技術用語・コード・変数名は英語のまま。

## Phase 1: ランダムトピック選択

1. `references/topic-seeds.md` を読み、シードリストを取得
2. 現在の日時（秒単位）をエントロピーとして使い、1つをランダムに選択
   - 選択ロジック: `index = (UNIX秒 % シード総数)` — 同じ日でも時刻で変わる
3. 過去に扱ったトピックを避けるため `mcp__serena__list_memories` で
   `core-topic_*` プレフィックスのメモリを検索し、既出IDをスキップ
4. 選んだトピックの `title`, `url`, `category`, `one_line_hook` をユーザーに予告表示

### 代替: ライブ発見モード

ユーザーが「最新のやつ」と言った場合、`references/sources-and-search.md` の
検索クエリを使い `gh` CLI で直近の注目コンテンツを発見する。

## Phase 2: GitHub コンテンツ取得

選んだトピックの実際のコンテンツを取得する。

1. **PR/Issue の場合**: `gh issue view` / `gh pr view` で本文と主要コメントを取得
   ```
   gh issue view <number> -R <repo> --json title,body,comments,author,labels
   gh pr view <number> -R <repo> --json title,body,comments,reviews,files
   ```
2. **Discussion / RFC の場合**: WebFetch で GitHub URL をフェッチ
3. **コードの場合**: `gh api` でファイル内容やコミットメッセージを取得
4. 主要コメント（特に sebmarkbage, gaearon, acdlite, rickhanlonii のもの）を優先的に抽出

## Phase 3: コンテキストリサーチ

トピックの背景を調査し、「なぜこれが重要か」を理解する。

1. **Context7**: 関連ライブラリ/フレームワークの公式ドキュメントを確認
2. **WebSearch / Perplexity**: エコシステムの文脈、ブログ記事、カンファレンストークを調査
3. 調査ポイント:
   - この PR/Issue が解決した問題は何か？
   - 以前はどうやっていたのか（Before/After）？
   - 誰が書いたか、その人の専門性は？
   - エコシステムへの波及効果は？

## Phase 4: 深掘り解説

`references/presentation-format.md` のフォーマットに従い、解説を出力する。

核となる原則:
- **講義ではなく、興奮した先輩エンジニアがコーヒー片手に語る口調**
- introspection markers を使い推論を可視化:
  - 🤔 なぜこうなった？ — 設計判断の背景
  - 🎯 ここがキモ — 核心部分の特定
  - ⚡ 性能/影響 — パフォーマンスやエコシステムへの影響
  - 💡 Wizard ポイント — これを知ってると一段上に行ける知識
- コードは実際の diff やスニペットを引用
- 専門用語は初出時に一言添える（ただし冗長にならない）

## Phase 5: 実践への橋渡し

トピックを「知識」で終わらせず「手を動かす」へつなげる。

1. `utils` または `next-play` リポで試せる小さな実験を提案
2. 例:
   - Fiber の仕組みを学んだ → 簡易 reconciler を `utils` に実装してみる
   - Suspense の設計を学んだ → `next-play` で boundary パターンを試す
   - TypeScript の型推論を学んだ → `utils/types` に型パズルを追加
3. 提案は1つだけ。具体的に。「やってみたい」と思わせる粒度で。

## Phase 6: セッション記録

探索したトピックを Serena メモリに保存し、重複を避ける。

```
mcp__serena__write_memory(
  memory_name="core-topic_YYYY-MM-DD_{topic_id}",
  content="## トピック\n- {title}\n- {url}\n## 学んだこと\n- ...\n## 実践アイデア\n- ..."
)
```

## ツール使用ガイド

| ツール | 用途 |
|--------|------|
| `gh` CLI | PR/Issue/Discussion の取得、GitHub 検索 |
| WebFetch | GitHub ページの直接フェッチ（RFC、Discussion） |
| Context7 | ライブラリ公式ドキュメントの確認 |
| WebSearch / Perplexity | エコシステム文脈の調査 |
| Serena Memory | 探索済みトピックの記録・重複回避 |

## 参照ファイル

- `references/topic-seeds.md` — 80+ のキュレーション済みシードトピック
- `references/sources-and-search.md` — GitHub ユーザー、リポ、検索クエリ
- `references/presentation-format.md` — 出力フォーマットとトーンガイド
