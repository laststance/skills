# MDN JavaScript API 実践アイデア

MDN の API ドキュメントを読んで終わりにせず、毎日小さなコードとして残すための題材集。
目的は「知識のメモ」ではなく「動くコードの蓄積」。

## 実装先の目安
- **`utils/universal`**: Core JavaScript API、文字列・配列・URL・Intl の小さな helper
- **`utils/browser`**: Browser API を包む utility
- **`next-play` / `packages/next-react`**: DOM、イベント、Fetch、Storage を使う UI 実験

## 進め方
1. API を1つ選ぶ
2. 「何を楽にするAPIか」を1文で言語化する
3. 最小ユースケースを1つ実装する
4. 余力があればテストや失敗ケースを足す
5. 学んだことを `learned` に1-3個残す

---

## 1. Core JavaScript API

### `Array.from`
- **学べること**: array-like と iterable の違い、`mapFn` の適用タイミング
- **アイデア**:
  - `Set` や `Map.keys()` を配列に変換する helper を作る
  - `NodeList` を配列に変換して処理する browser helper を試す
- **実装先**: `utils/universal`

### `Object.groupBy`
- **学べること**: コレクション分類、キー生成、集約
- **アイデア**:
  - 記事一覧を `published` / `draft` / `archived` に分類する helper
  - 活動ログをカテゴリ別にまとめる関数
- **実装先**: `utils/universal`

### `Intl.DateTimeFormat`
- **学べること**: locale-aware formatting、タイムゾーン、parts 分解
- **アイデア**:
  - 日付表示 helper を作る
  - UI で `formatToParts()` を使って日付の見た目をカスタマイズする
- **実装先**: `utils/universal`, `next-play`

### `Intl.Segmenter`
- **学べること**: 単語境界、国際化、テキスト分割
- **アイデア**:
  - 日本語の短文を単語単位に分割する実験
  - 検索候補のハイライト範囲を作る helper
- **実装先**: `utils/universal`

### `URL` / `URLSearchParams`
- **学べること**: クエリ組み立て、パス正規化、検索条件のシリアライズ
- **アイデア**:
  - フィルター状態を URL に保存する helper
  - API クエリ生成関数を作る
- **実装先**: `utils/universal`, `next-play`

---

## 2. Async / Networking

### `fetch`
- **学べること**: Request/Response、エラーハンドリング、JSON 変換
- **アイデア**:
  - API wrapper を1本作る
  - タイムアウトやリトライ方針を実験する
- **実装先**: `utils/browser`, `next-play`

### `AbortController`
- **学べること**: キャンセル可能な非同期処理、競合リクエストの整理
- **アイデア**:
  - 検索入力で古い fetch をキャンセルする
  - タイムアウト付き fetch helper を作る
- **実装先**: `utils/browser`, `next-play`

### `Promise.allSettled`
- **学べること**: 成功/失敗混在の一括処理
- **アイデア**:
  - 複数エンドポイントのまとめ取得 utility
  - 失敗した項目だけ再試行する小さな orchestrator
- **実装先**: `utils/universal`, `utils/node`

---

## 3. Browser / Storage API

### `localStorage`
- **学べること**: 永続化、バージョニング、JSON serialize/parse
- **アイデア**:
  - UI の表示設定を保存する hook/helper
  - 保存データに schema version を持たせる
- **実装先**: `utils/browser`, `next-play`

### `sessionStorage`
- **学べること**: タブ単位の一時状態保持
- **アイデア**:
  - フォーム入力の一時保存
  - リダイレクト前後の一時 state 保持
- **実装先**: `utils/browser`, `next-play`

### `navigator.clipboard`
- **学べること**: 非同期 clipboard 操作、ユーザー操作制約
- **アイデア**:
  - Copy button utility
  - コピー成功/失敗を表示する UI
- **実装先**: `utils/browser`, `next-play`

### `IntersectionObserver`
- **学べること**: viewport 監視、遅延読み込み、スクロール連動
- **アイデア**:
  - 無限スクロールの土台
  - 現在見えているセクションをナビで強調表示する
- **実装先**: `next-play`, `packages/next-react`

---

## 4. DOM / Event API

### `addEventListener` with options
- **学べること**: `once`, `passive`, `capture` の違い
- **アイデア**:
  - スクロールイベント最適化の実験
  - Escape キーで閉じる簡易 dialog utility
- **実装先**: `next-play`, `packages/next-react`

### `FormData`
- **学べること**: フォーム値収集、ファイル入力、multipart
- **アイデア**:
  - HTML form から payload を生成する helper
  - file input を含む送信フローの実験
- **実装先**: `next-play`

### `DOMParser`
- **学べること**: 文字列から DOM 生成、抽出、変換
- **アイデア**:
  - HTML スニペットからリンク一覧を抽出
  - RSS/Atom 文字列を軽く読む実験
- **実装先**: `utils/browser`, `utils/node`

---

## 5. 今日の提案例

### 軽めに 20-30 分
- `URLSearchParams` で検索条件を組み立てる utility を作る
- `Array.from` で iterable を扱う helper を1本書く
- `localStorage` の read/write wrapper を作る

### しっかり 45-60 分
- `AbortController` を使った cancellable fetch helper を作る
- `IntersectionObserver` でスクロール連動 UI を試す
- `Intl.DateTimeFormat` で locale-aware な表示 utility を整える

### UI つきで 60-90 分
- `navigator.clipboard` を使った copy UI を実装する
- `FormData` と簡易バリデーション付きフォームを作る
- `fetch` + `AbortController` で検索サジェスト UI を試作する

---

## 学びを深くする問い
- この API は「どんな面倒」を減らすのか？
- 自前実装すると何が壊れやすいのか？
- Node と Browser で挙動差はあるか？
- util に切り出す価値があるのはどこまでか？
- テストで押さえるべき失敗ケースは何か？
