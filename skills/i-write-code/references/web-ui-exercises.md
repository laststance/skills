# Web UI 実装練習メニュー

ブラウザネイティブAPIとCSS機能を活用したUI実装練習。
フレームワーク依存を減らし、基礎力を鍛える。

**実装先**: 主に `next-play`（UIプロトタイプ）

---

## CSS Grid

**難易度**: ⭐⭐

| 課題 | 説明 |
|------|------|
| 2Dダッシュボード | `grid-template-areas` でヘッダー/サイド/メイン/フッターレイアウト |
| レスポンシブカード | `auto-fill` / `auto-fit` + `minmax()` で流動的グリッド |
| マガジンレイアウト | `grid-column: span 2` で記事カードの大小混在 |
| Masonryレイアウト | CSS Grid + `align-items: start` での近似Masonry |

**学べること**: 2Dレイアウトの概念、暗黙的グリッド、名前付きライン

## アコーディオン

**難易度**: ⭐

| 課題 | 説明 |
|------|------|
| HTML標準版 | `<details>` + `<summary>` のみ（JS不要） |
| アニメーション付き | `grid-template-rows: 0fr → 1fr` トランジション |
| 排他制御 | 1つ開くと他が閉じる（`name` 属性 or JS制御） |

**学べること**: セマンティックHTML、CSS-onlyアニメーション、アクセシビリティ

## モーダル / ダイアログ

**難易度**: ⭐⭐

| 課題 | 説明 |
|------|------|
| `<dialog>` 基本 | `showModal()` + `::backdrop` スタイリング |
| フォーカストラップ | Tab/Shift+Tab でダイアログ内循環 |
| スタック管理 | 複数ダイアログの重なり順制御 |

**学べること**: `<dialog>` API、`inert` 属性、フォーカス管理

## タブUI

**難易度**: ⭐⭐

| 課題 | 説明 |
|------|------|
| ARIA Tabs | `role="tablist/tab/tabpanel"` + `aria-selected` |
| キーボード操作 | ←→キーでタブ切替、Home/End対応 |
| 遅延ロード | 非アクティブタブのコンテンツを遅延レンダリング |

**学べること**: WAI-ARIA Authoring Practices、ロービングタブインデックス

## カルーセル / スライダー

**難易度**: ⭐⭐⭐

| 課題 | 説明 |
|------|------|
| CSS Scroll Snap | `scroll-snap-type` + `scroll-snap-align` |
| Intersection Observer | スライド表示検知 + インジケーター連動 |
| 自動再生 | `setInterval` + ホバー時停止 + `prefers-reduced-motion` |

**学べること**: Scroll Snap、IntersectionObserver API、アニメーション制御

## ドロップダウンメニュー

**難易度**: ⭐⭐

| 課題 | 説明 |
|------|------|
| Popover API | `popover` 属性 + `popovertarget` |
| 位置計算 | ビューポート端での反転（flip）ロジック |
| ネストメニュー | サブメニューの展開/収束 |

**学べること**: Popover API、Anchor Positioning（CSS）、イベント伝播

## トースト通知

**難易度**: ⭐⭐

| 課題 | 説明 |
|------|------|
| 基本トースト | Portal + 自動消去タイマー |
| キュー管理 | 最大表示数制限、FIFO順序 |
| アクション付き | Undo ボタン + タイマー一時停止 |

**学べること**: ポータルパターン、タイマー管理、`aria-live` リージョン

## ドラッグ&ドロップ

**難易度**: ⭐⭐⭐

| 課題 | 説明 |
|------|------|
| Pointer Events | `pointerdown` → `pointermove` → `pointerup` 基本フロー |
| ソート可能リスト | ドラッグ中のプレースホルダー表示 |
| カンバン | 複数カラム間のカード移動 |

**学べること**: Pointer Events API、座標計算、衝突検出アルゴリズム

---

## 進め方のコツ

1. **HTML標準APIを最初に試す** — `<dialog>`, `<details>`, `popover` 等
2. **CSSだけでどこまでできるか挑戦** — JSは最小限に
3. **アクセシビリティを常に意識** — キーボード操作、スクリーンリーダー
4. **next-playに各UIのページを追加** — `/accordion`, `/tabs` 等のルートとして
