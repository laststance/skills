# Baseline Format Reference

This is the canonical output example from JavaScript Weekly #775 (2026-03-03).
All newsletter digest outputs should follow this structure, depth, and style.

---

## 📬 JavaScript Weekly #775 — 詳細サマリー
**発行日: 2026年3月3日 | 編集: Peter Cooper (Cooperpress)**

---

## 🔶 メイン記事

### 1. Bun v1.3.10 リリース — 驚くほど大きなアップデート
**著者: Jarred Sumner**

Bun v1.3.10 は「マイナーパッチ」の番号にもかかわらず、実質的にはメジャーリリースに匹敵する内容を含んでいます。

**REPL の完全書き直し**: Bun の対話型シェル（REPL）がゼロからリビルドされました。実用面ではオートコンプリートの改善やエラー表示の向上があり、見た目の面ではシンタックスハイライトや出力フォーマッティングが大幅に美しくなっています。Node.js の REPL が長年大きな進化をしていない中、Bun はこの領域で差別化を図ろうとしています。

**`--compile --target=browser` による自己完結型 HTML 生成**: これが今回最もインパクトのある新機能です。`bun build --compile --target=browser ./index.html --outdir=dist` というコマンド1つで、HTML ファイルに含まれるすべての `<script>`, `<link>`, `<img>`, `<video>` 等の参照を解析し、JavaScript/TypeScript/JSX を単一モジュールに、CSS（`@import` チェーンやJSからインポートされたCSSを含む）を単一スタイルシートにバンドルした上で、相対アセット参照をすべて base64 `data:` URI に変換し、完全に外部依存のない単一 HTML ファイルとして出力します。シンプルな SPA やプロトタイプ、デモの配布に最適で、生成物をそのまま誰にでも渡せるのが大きな利点です。プログラマティック API (`Bun.build()`) からも利用可能です。

**TC39 Stage 3 ES Decorators の完全サポート**: `tc39/proposal-decorators` 仕様に基づくデコレータが正式にサポートされました。TypeScript 5.0 以降で実験的に導入されているデコレータ構文と互換性があり、クラスのメソッド、アクセサ、フィールドにメタプログラミング的な機能を付与できます。Angular や NestJS 等のフレームワークユーザーにとって嬉しいニュースです。

その他、**イベントループの高速化**（内部的なI/O処理の最適化）と **barrel import の最適化**（`index.ts` から大量にre-exportするパターンでバンドルサイズが不必要に膨らむ問題への対処）も含まれています。

`★ Insight ─────────────────────────────────────`
- Bun の `--compile --target=browser` は Webpack/Vite 等のバンドラーとは設計思想が異なり、「配布可能な単一ファイル」を最終ゴールとしている点がユニーク。サーバーコードと組み合わせれば、フロントエンド＋バックエンドを含むスタンドアロン実行ファイルも生成可能
- barrel import 最適化は tree-shaking の改善とは異なり、re-export チェーンの解決自体を高速化するアプローチ
`─────────────────────────────────────────────────`

---

### 2. External Import Maps, Today! — ブラウザでの依存関係管理の新展開
**著者: Lea Verou**

数週間前に「Webの依存関係管理は壊れている」という問題提起記事を投稿した Lea Verou が、具体的な解決策を提示しました。

**背景**: 現在のブラウザでモジュールを使う場合、`import React from 'react'` のような「bare specifier」はそのままでは解決できず、バンドラーに頼るか、完全な URL を記述する必要があります。Import Maps は `<script type="importmap">` タグでモジュール名とURLのマッピングを定義する標準仕様ですが、**外部ファイルとしてのインポートマップ**（`<script type="importmap" src="...">`）はまだブラウザで広くサポートされていません。

**解決策**: Lea が提案するコアテクニックは「シンプルだが一見明白ではない」方法で、外部インポートマップをエミュレートします。これにより、バンドラーなしでもブラウザ上で npm パッケージを直接利用できる道が開けます。**JSPM 4.0** がこの手法をすでに実装しており、Import Map Package Management として提供しています。

これは特にプロトタイピング、教育用途、小規模プロジェクトにおいて「バンドラーレス開発」の実用性を大きく引き上げる可能性があります。

`★ Insight ─────────────────────────────────────`
- Import Maps はバンドラーの代替ではなく補完的な技術。本番環境では依然としてバンドラーが推奨されるが、開発体験（DX）やプロトタイピングにおけるゼロコンフィグ開発を実現する鍵
- JSPM は CDN ベースの npm パッケージ配信を行うプロジェクトで、Import Maps との相性が設計レベルで良い
`─────────────────────────────────────────────────`

---

### 3. Node.js リリーススケジュールの変更
**（まだプレビュー段階・非公式）**

Node.js のリリーススケジュールが今年後半から根本的に変わることが予告されました。

**主な変更点**:
- **年1回のメジャーリリース**に変更（現行は年2回）
- **すべてのリリースが LTS（Long Term Support）対象に**（現行では奇数バージョンは非LTS）
- **奇数/偶数の区別を廃止**（現行: 偶数=LTS, 奇数=Current のみ）

この変更は開発者にとって大きな朗報です。従来、企業環境では「偶数バージョンだけを追う」という暗黙のルールがありましたが、全バージョンが LTS になることで、どのメジャーバージョンにアップグレードしても長期サポートが保証されます。年1回のリリースサイクルは、破壊的変更の頻度を減らし、エコシステムの安定性を高める効果が期待されます。

---

## 📋 IN BRIEF（短信）

### React Foundation 公式ローンチ
React Foundation が正式に設立され、React、React Native、JSX の所有権を引き継ぎました。Meta を含む8名の創設メンバーで構成され、Meta で React チームを率いていた **Seth Webster** がエグゼクティブディレクターに就任。これは React が一企業のプロジェクトから、より広いコミュニティ主導のガバナンス体制に移行する歴史的な一歩です。

### 月次ラウンドアップ
**Svelte**、**ViteLand / VoidZero**、**Astro** の3つのプロジェクトがそれぞれ2026年2〜3月の月次まとめを公開。フレームワーク選択の判断材料として、各エコシステムの進捗を定期的に追えるのは便利です。

### Angular セキュリティパッチ
Angular チームが最近パッチした2つの脆弱性について説明を公開。セキュリティアドバイザリーとして透明性のある対応が取られています。

### Navigation API が Baseline Newly Available に
ブラウザの履歴操作やナビゲーション管理を行う **Navigation API** が、すべての主要ブラウザで利用可能な「Baseline Newly Available」ステータスに到達。従来の `history.pushState()` / `popstate` イベントに代わる、より直感的で強力なAPI です。SPA フレームワークのルーティング実装が簡素化される可能性があります。

---

## 📦 リリース情報

### Deno 2.7
Deno が **Temporal API** サポートを安定化（日付・時刻操作の次世代標準）。**Windows on ARM** サポート追加、`package.json` の overrides サポートも追加され、Node.js エコシステムとの互換性がさらに向上。

### Expo SDK 55
React Native の人気フレームワーク/ツールチェーン。モバイルアプリ開発の DX 改善が続いています。

### Shiki 4.0
VS Code と同じ TextMate 文法を使うシンタックスハイライターの新メジャーバージョン。ブログやドキュメントサイトでのコードハイライトに広く使われています。

### その他
Angular 21.2、Mediabunny 1.35（メディア処理）、Neo.mjs 12.0（Web Workers ベースの UI フレームワーク）

---

## 📖 記事・動画

### WebAssembly をWebのファーストクラス市民に
**著者: Ryan Hunt (Mozilla)**

WASM は大きな進歩を遂げましたが、Web 上での利用はまだ煩雑です。`console.log` すら大量のグルーコード（JavaScript と WASM を橋渡しするコード）が必要な現状を、**WebAssembly Component Model** が変革する可能性を論じています。Component Model が実現すれば、WASM モジュールがブラウザ API に直接バインドし、`<script>` タグから直接ロードできるようになり、JavaScript なしで WASM だけで Web アプリを構築することも技術的に可能になります。Bytecode Alliance が推進しており、Web 開発の未来を左右する重要な提案です。

### より良い Streams API を JavaScript に
**著者: James M Snell (Cloudflare)**

Cloudflare のエンジニアが、現行の Web Streams 標準には「根本的なユーザビリティとパフォーマンスの問題」があると指摘し、代替アプローチを提示しています。Node.js の Streams 実装に長年関わってきた James の経験に基づく説得力のある議論で、Streams API の使いにくさに悩んだことのある開発者には特に響く内容です。「議論を始めるために公開する」というスタンスで、標準化プロセスへの働きかけを意図しています。

### JavaScript DRM の幻想
**著者: Ahmed Arat**

JavaScript だけで構築された DRM/コピープロテクションが、EME（Encrypted Media Extensions）ベースのアプローチと比較していかに脆弱かを解説。実際にあるプラットフォームの保護を破った経験を通じて、「洗練された摩擦」に過ぎないことを実証しています。

### Cloudflare が AI で1週間で Next.js を再構築 — vinext
**著者: Steve Faulkner (Cloudflare)**

**vinext** は Vite ベースの実験的な Next.js API サーフェス再実装です。既存の Next.js アプリを、Cloudflare Workers 等のより多くの環境で動作させることを目的としています。AI を活用して1週間で構築したという点も注目ですが、未サポート機能があるためプロダクション利用には注意が必要です。

### Val Town で映画情報を取得
**著者: Raymond Camden**

**Val Town** は JavaScript/TypeScript で小さなサービスを素早く書いてデプロイできるプラットフォーム。映画の上映情報を取得するサービスを構築した実践記事です。

### その他の記事
- **Sticky Grid Scroll** — スクロール駆動アニメーションによるグリッドレイアウト効果（Codrops）
- **`Error.isError` vs `instanceof`** — クロスレルム（iframe等）でのエラー判定に `instanceof` が失敗する問題を `Error.isError` で解決する手法
- **Fetch リクエストのプロキシ** — サーバーサイド JavaScript での fetch プロキシパターン（Nicholas C. Zakas）
- **Electron を選んだ理由** — Syntax Podcast で Electron vs ネイティブの選択理由を議論
- **React Native で Meta Quest VR アプリ** — React Native が Meta Quest プラットフォームに正式対応

---

## 🛠 コード＆ツール

### txiki.js — 小さくて強力な JavaScript ランタイム
QuickJS-ng と libuv の上に構築された軽量ランタイム。最新の ECMAScript 機能をサポートしつつ、**WinterTC**（旧 WinterCG — サーバーサイド JavaScript API の標準化団体）準拠を目指しています。

### numpy-ts — TypeScript 版 NumPy
Python の科学計算ライブラリ **NumPy** を TypeScript で再実装。NumPy API の 94% をカバーし、ブラウザ、Node、Bun、Deno で動作します。オンラインプレイグラウンドも用意。

### Yoopta Editor 6.0 — React 用ヘッドレスリッチテキストエディタ
Notion スタイルのブロックベース編集体験を構築するための MIT ライセンスライブラリ。ヘッドレス設計のため UI は自由にカスタマイズ可能。

### AdonisJS v7 — バッテリー同梱の Node.js フレームワーク
認証、ORM、キュー、テスト等を標準搭載。v7 では Web サイトの刷新、**OpenTelemetry 統合**、新しいスターターキットが追加。

### Color Thief 3.0 — 画像からカラーパレットを抽出
画像の支配的な色を Canvas API で抽出。v3.0 で **OKLCH カラースペース対応**、**Web Worker オフローディング**、動画からの**ライブ抽出**が追加。

### その他
- **ng2-charts** — Angular 20 対応の Chart.js ラッパー
- **vue-superselect** — Vue 3 用ヘッドレス Select/Combobox
- **React PDF 10.4** — レンダリング時の色オーバーライド機能追加
- **JSNES 2.0** — ブラウザ/Node.js 用 NES エミュレータ
- **Milkdown 7.19** — プラグイン駆動 WYSIWYG マークダウンエディタ
- **Peggy 5.1** — シンプルなパーサージェネレータ

---

## 🌐 エコシステム情報

### npmx.dev — npm レジストリの新しいブラウジング体験
3週間前に紹介された **npmx.dev** がアルファリリースを正式発表。コミュニティから異例の数のブログ記事が一斉に投稿されました。Peter Cooper 曰く「JavaScript プロジェクトがこれほど同時に多くのブログ記事を集めたのは記憶にない」とのこと。

### TypeScript 5.x → 6.0 移行ノート
GitHub Gist として公開された詳細な移行メモ。著者は「AI エージェントに読ませると便利かも」とコメント。

### Drizzle ORM が PlanetScale に合流
TypeScript ファーストの ORM である **Drizzle** のチームが、MySQL 互換のマネージドデータベースサービス **PlanetScale** に参加。

### State of React Native 2025 調査結果
Software Mansion と Devographics による React Native の年次調査結果が公開。

### その他
- **Locutus** — PHP, Go, Python, Ruby 等15言語の標準ライブラリを TypeScript に移植するプロジェクト
- **xkcd #2347 インタラクティブ版** — 有名な「一人の開発者に依存するプロジェクト」コミックを p5.js で動く形に
- **小さな楽しいプログラミング言語リスト** — 実用性より楽しさを追求した言語たちのキュレーション

---

`★ Insight ─────────────────────────────────────`
- 🤔 今号の最大テーマは **「JavaScript エコシステムの成熟と分権化」**。React Foundation 設立、Node.js リリーススケジュールの安定化、外部インポートマップによるバンドラーレス開発、WASM のファーストクラス化 — いずれも「よりオープンで安定した基盤」への移行を示している
- 🎯 Bun の `--compile --target=browser` と Cloudflare の vinext は、それぞれ異なるアプローチで「デプロイの簡素化」という同じゴールを追求している
- 💡 TypeScript 6.0 移行ノートに「AI エージェントに読ませると便利」というコメントがあるのは、2026年の開発ワークフローにおける AI の浸透度を象徴している
`─────────────────────────────────────────────────`
