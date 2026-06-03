# Topic Seeds — Legendary GitHub Content

Curated list of inspiring GitHub PRs, Issues, RFCs, and Discussions from the
React/JS/TS/Node core ecosystem. Each entry is worth a deep-dive.

Format: `ID | Category | Title | URL | Author | Era | One-line Hook`

---

## React Architecture

| ID | Title | URL | Author | Era | Hook |
|----|-------|-----|--------|-----|------|
| RA01 | React Fiber Architecture | https://github.com/acdlite/react-fiber-architecture | acdlite | 2016 | スタック再帰をリンクリストに置き換えて中断可能にした、React 史上最大の書き直し |
| RA02 | Initial Fiber commit | https://github.com/facebook/react/pull/8083 | sebmarkbage | 2016 | Fiber の最初の1コミット。ここから全てが始まった |
| RA03 | Concurrent Mode RFC | https://github.com/reactjs/rfcs/pull/109 | acdlite | 2019 | 「レンダリングは中断できる」という革命的アイデアの公式提案 |
| RA04 | Lanes model for Concurrent React | https://github.com/facebook/react/pull/18796 | acdlite | 2020 | 優先度をビットマスクで表現する Lanes モデル。ExpirationTime からの移行 |
| RA05 | React Server Components RFC | https://github.com/reactjs/rfcs/pull/188 | josephsavona | 2020 | サーバーでしか動かないコンポーネントという概念の誕生 |
| RA06 | Server Components — Initial Implementation | https://github.com/facebook/react/pull/22952 | sebmarkbage | 2021 | RSC の flight プロトコル実装。JSON ストリーミングの設計が美しい |
| RA07 | React Compiler (React Forget) announcement | https://github.com/reactwg/react-compiler/discussions/5 | josephsavona | 2024 | useMemo/useCallback を不要にするコンパイラの公式解説 |
| RA08 | Activity (formerly Offscreen) API | https://github.com/reactwg/react-18/discussions/19 | rickhanlonii | 2021 | 非表示コンポーネントの状態を保持する API の設計議論 |
| RA09 | React 19 RC announcement | https://github.com/reactwg/react-19/discussions/1 | rickhanlonii | 2024 | React 19 の全変更点を網羅した公式アナウンス |
| RA10 | Fizz — Streaming SSR implementation | https://github.com/facebook/react/pull/22450 | sebmarkbage | 2021 | Suspense 対応のストリーミング SSR エンジン |

## React APIs & Features

| ID | Title | URL | Author | Era | Hook |
|----|-------|-----|--------|-----|------|
| RF01 | Hooks RFC | https://github.com/reactjs/rfcs/pull/68 | sebmarkbage | 2018 | クラスコンポーネントを過去にした、React 最大の API 変革 |
| RF02 | useState implementation (initial) | https://github.com/facebook/react/pull/13968 | acdlite | 2018 | Hooks の内部実装。リンクリストでフックを管理する仕組み |
| RF03 | Suspense for Data Fetching RFC | https://github.com/reactjs/rfcs/pull/213 | acdlite | 2022 | throw Promise というハックが公式パターンになるまでの議論 |
| RF04 | use() hook RFC | https://github.com/reactjs/rfcs/pull/229 | acdlite | 2022 | Promise を直接 unwrap する新しい hook — async/await 的な React |
| RF05 | Actions (useTransition for mutations) | https://github.com/reactwg/react-19/discussions/2 | rickhanlonii | 2024 | フォーム送信をファーストクラスでサポートする Actions の解説 |
| RF06 | View Transitions support | https://github.com/facebook/react/pull/31975 | sebmarkbage | 2025 | ブラウザの View Transitions API を React に統合 |
| RF07 | useOptimistic hook | https://github.com/facebook/react/pull/27672 | acdlite | 2023 | 楽観的更新をファーストクラスでサポートする hook |
| RF08 | useFormStatus hook | https://github.com/facebook/react/pull/27386 | acdlite | 2023 | フォームの送信状態を子コンポーネントから読める hook |
| RF09 | Suspense for CSS | https://github.com/facebook/react/pull/32106 | sebmarkbage | 2025 | スタイルシートの読み込みを Suspense で制御 |
| RF10 | ref as prop (removing forwardRef) | https://github.com/facebook/react/pull/28348 | sebmarkbage | 2024 | forwardRef を不要にする大胆な API 簡素化 |

## React Internals Deep Cuts

| ID | Title | URL | Author | Era | Hook |
|----|-------|-----|--------|-----|------|
| RI01 | Reconciler — How diffing actually works | https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactChildFiber.js | sebmarkbage | 2018+ | O(n) diff アルゴリズムの実装。key がなぜ重要か一目瞭然 |
| RI02 | Scheduler package extraction | https://github.com/facebook/react/pull/13885 | acdlite | 2018 | MessageChannel を使った自前スケジューラ。requestIdleCallback は使わない理由 |
| RI03 | Symbolic React elements ($$typeof) | https://github.com/facebook/react/pull/4832 | sebmarkbage | 2015 | XSS 対策で Symbol を使って React 要素を識別する仕組み |
| RI04 | React element type — from symbol to object | https://github.com/facebook/react/pull/28813 | sebmarkbage | 2024 | React element の内部表現を変更した大胆なリファクタ |
| RI05 | Flight protocol (RSC wire format) | https://github.com/facebook/react/blob/main/packages/react-server/src/ReactFlightServer.js | sebmarkbage | 2021+ | RSC がサーバーからクライアントにデータを送る独自プロトコル |
| RI06 | Fizz streaming format internals | https://github.com/facebook/react/blob/main/packages/react-dom/src/server/ReactDOMFizzServerBrowser.js | sebmarkbage | 2021+ | HTML ストリーミングの内部実装。template タグの巧みな使い方 |
| RI07 | Transition lane scheduling | https://github.com/facebook/react/pull/20615 | acdlite | 2021 | startTransition の内部実装。Lanes ビットマスクの実際の使われ方 |
| RI08 | SuspenseList implementation | https://github.com/facebook/react/pull/15902 | sebmarkbage | 2019 | 複数 Suspense boundary の表示順序を制御する仕組み |
| RI09 | Hydration mismatch handling | https://github.com/facebook/react/pull/26080 | sebmarkbage | 2023 | SSR ↔ Client のミスマッチをどう検出・修復するか |
| RI10 | Prerender APIs (prerenderToNodeStream) | https://github.com/facebook/react/pull/30939 | sebmarkbage | 2024 | Static Generation 向けのプリレンダリング API |

## sebmarkbage's Notable Work

| ID | Title | URL | Author | Era | Hook |
|----|-------|-----|--------|-----|------|
| SM01 | Primitives for building components | https://github.com/reactjs/rfcs/pull/30 | sebmarkbage | 2017 | コンポーネント設計の哲学。「合成」こそが React の本質 |
| SM02 | Why is setState asynchronous? | https://github.com/facebook/react/issues/11527#issuecomment-360199710 | gaearon (discussion led by SM) | 2018 | setState が同期でない本当の理由を Dan が長文で解説 |
| SM03 | Algebraic Effects inspiration | https://github.com/facebook/react/issues/7942 | sebmarkbage | 2016 | Hooks と Suspense の理論的基盤。代数的効果の影響 |
| SM04 | Server Context RFC | https://github.com/reactjs/rfcs/pull/201 | sebmarkbage | 2021 | RSC でのコンテキスト共有の設計提案 |
| SM05 | Float — Resource loading for React | https://github.com/facebook/react/pull/25243 | sebmarkbage | 2022 | preload, prefetch をReact に統合する仕組み |
| SM06 | Async Server Components | https://github.com/facebook/react/pull/28264 | sebmarkbage | 2024 | async function をコンポーネントとして直接使える実装 |
| SM07 | Owner stacks (component stack improvement) | https://github.com/facebook/react/pull/29236 | sebmarkbage | 2024 | エラースタックをコンポーネントオーナーチェーンで表示 |
| SM08 | Taint API (experimental) | https://github.com/facebook/react/pull/26591 | sebmarkbage | 2023 | 機密データが誤ってクライアントに送られるのを防ぐ API |
| SM09 | Resource preloading (preload, preinit) | https://github.com/facebook/react/pull/26237 | sebmarkbage | 2023 | スクリプト/スタイルの先読みを React レベルで最適化 |
| SM10 | Cache API for RSC | https://github.com/facebook/react/pull/25506 | sebmarkbage | 2022 | RSC リクエスト単位のキャッシュ API |

## gaearon's Notable Work

| ID | Title | URL | Author | Era | Hook |
|----|-------|-----|--------|-----|------|
| GA01 | Strict Mode double-rendering explanation | https://github.com/facebook/react/issues/12856 | gaearon | 2018 | なぜ開発モードで2回レンダリングされるのか、その深い理由 |
| GA02 | New React DevTools (Profiler) | https://github.com/facebook/react/pull/16073 | bvaughn/gaearon | 2019 | React DevTools を完全に書き直したときの設計議論 |
| GA03 | Overreacted: A Complete Guide to useEffect | https://overreacted.io/a-complete-guide-to-useeffect/ | gaearon | 2019 | useEffect のメンタルモデルを根底から変えた伝説的記事 |
| GA04 | Overreacted: Before You memo() | https://overreacted.io/before-you-memo/ | gaearon | 2021 | メモ化の前にやるべき構造的な最適化 |
| GA05 | Overreacted: The Two Reacts | https://overreacted.io/the-two-reacts/ | gaearon | 2024 | サーバーとクライアント、2つの React の哲学 |
| GA06 | React docs rewrite (react.dev) | https://github.com/reactjs/react.dev/pull/4832 | gaearon | 2023 | React 公式ドキュメントの完全リライト |
| GA07 | Overreacted: Algebraic Effects for the Rest of Us | https://overreacted.io/algebraic-effects-for-the-rest-of-us/ | gaearon | 2019 | 代数的効果を非専門家向けに説明した名文 |
| GA08 | ViewTransition with enter/exit crashes iOS Safari | https://github.com/facebook/react/issues/35336 | gaearon | 2025 | WebKit のクラッシュバグを Claude でデバッグした事例 |
| GA09 | Overreacted: How Does setState Know What to Do? | https://overreacted.io/how-does-setstate-know-what-to-do/ | gaearon | 2018 | renderer と reconciler の分離を平易に解説 |
| GA10 | Overreacted: Why Do React Elements Have a $$typeof Property? | https://overreacted.io/why-do-react-elements-have-typeof-property/ | gaearon | 2018 | RI03 の背景を Dan が物語的に解説 |

## React Working Group Discussions

| ID | Title | URL | Author | Era | Hook |
|----|-------|-----|--------|-----|------|
| WG01 | Replacing render with createRoot | https://github.com/reactwg/react-18/discussions/5 | rickhanlonii | 2021 | React 18 の新しいルート API の設計理由 |
| WG02 | Automatic Batching in React 18 | https://github.com/reactwg/react-18/discussions/21 | rickhanlonii | 2021 | Promise/setTimeout 内の更新も自動バッチングする仕組み |
| WG03 | Upgrading to React 18 on the server | https://github.com/reactwg/react-18/discussions/22 | rickhanlonii | 2021 | SSR の renderToPipeableStream への移行ガイド |
| WG04 | React Compiler — How it works | https://github.com/reactwg/react-compiler/discussions/5 | josephsavona | 2024 | コンパイラの内部動作を設計者自身が解説 |
| WG05 | React 19 — What's New | https://github.com/reactwg/react-19/discussions/1 | rickhanlonii | 2024 | React 19 全変更の公式まとめ |
| WG06 | Changes to Suspense in React 18 | https://github.com/reactwg/react-18/discussions/7 | acdlite | 2021 | Legacy Suspense vs Concurrent Suspense の違い |
| WG07 | New Suspense SSR Architecture | https://github.com/reactwg/react-18/discussions/37 | gaearon | 2021 | Selective Hydration と Streaming SSR の設計解説 |
| WG08 | useDeferredValue deep dive | https://github.com/reactwg/react-18/discussions/129 | rickhanlonii | 2022 | useDeferredValue の使いどころと内部動作 |
| WG09 | React Compiler — Opt-in & Opt-out | https://github.com/reactwg/react-compiler/discussions/7 | josephsavona | 2024 | コンパイラの段階的導入戦略 |
| WG10 | RSC From Scratch (Deep Dive) | https://github.com/reactwg/server-components/discussions/5 | gaearon | 2023 | RSC をゼロから理解するための段階的実装ガイド |

## Node.js Core

| ID | Title | URL | Author | Era | Hook |
|----|-------|-----|--------|-----|------|
| ND01 | ESM — Unflagging import/export | https://github.com/nodejs/node/pull/29866 | guybedford | 2019 | Node.js に ESM が正式搭載された歴史的 PR |
| ND02 | Built-in test runner | https://github.com/nodejs/node/pull/42325 | cjihrig | 2022 | Node.js にテストランナーが内蔵された。Jest/Vitest 不要の未来？ |
| ND03 | Single Executable Applications | https://github.com/nodejs/node/pull/45038 | joyeecheung | 2022 | Node.js アプリを単一バイナリにコンパイル |
| ND04 | Permission Model | https://github.com/nodejs/node/pull/44004 | RafaelGSS | 2022 | Deno 的なパーミッションモデルの Node.js 実装 |
| ND05 | require(esm) support | https://github.com/nodejs/node/pull/51977 | joyeecheung | 2024 | CJS から ESM を require できるようにする歴史的変更 |
| ND06 | Type stripping (built-in TypeScript) | https://github.com/nodejs/node/pull/53725 | nicolo-ribaudo | 2024 | Node.js がネイティブで TypeScript を実行 |
| ND07 | AsyncLocalStorage | https://github.com/nodejs/node/pull/26540 | vdeturckheim | 2019 | async_hooks の上に構築された実用的な非同期コンテキスト API |
| ND08 | Diagnostic Channel | https://github.com/nodejs/node/pull/34895 | qard | 2020 | Node.js 内部のイベントをモンキーパッチなしで監視する仕組み |
| ND09 | V8 startup snapshot in Node.js | https://github.com/nodejs/node/pull/38905 | joyeecheung | 2021 | V8 スナップショットで Node.js の起動を高速化 |
| ND10 | Import attributes (assert → with) | https://github.com/nodejs/node/pull/50134 | nicolo-ribaudo | 2023 | import assertions から import attributes への仕様変更対応 |

## TypeScript Milestones

| ID | Title | URL | Author | Era | Hook |
|----|-------|-----|--------|-----|------|
| TS01 | Discriminated Union Types | https://github.com/microsoft/TypeScript/pull/9163 | ahejlsberg | 2016 | tagged union で型安全なパターンマッチを実現 |
| TS02 | Template Literal Types | https://github.com/microsoft/TypeScript/pull/40336 | ahejlsberg | 2020 | 文字列リテラルを型レベルで操作する革命的機能 |
| TS03 | satisfies operator | https://github.com/microsoft/TypeScript/pull/46827 | RyanCavanaugh | 2022 | 型の検証と推論を両立する新演算子 |
| TS04 | const type parameters | https://github.com/microsoft/TypeScript/pull/51865 | ahejlsberg | 2023 | `as const` をジェネリクス側で強制できる |
| TS05 | Variadic Tuple Types | https://github.com/microsoft/TypeScript/pull/39094 | ahejlsberg | 2020 | タプルの spread を型レベルで表現 |
| TS06 | Conditional Types | https://github.com/microsoft/TypeScript/pull/21316 | ahejlsberg | 2018 | 型レベル if 文。Utility Types の基盤 |
| TS07 | infer keyword (Type Inference in Conditional Types) | https://github.com/microsoft/TypeScript/pull/21496 | ahejlsberg | 2018 | 条件型の中で型を抽出する強力な仕組み |
| TS08 | Mapped Types | https://github.com/microsoft/TypeScript/pull/12114 | ahejlsberg | 2016 | オブジェクト型を変換する Partial, Required, Readonly の基盤 |
| TS09 | using keyword (Explicit Resource Management) | https://github.com/microsoft/TypeScript/pull/54505 | rbuckton | 2023 | C# の using、Python の with に相当する構文 |
| TS10 | NoInfer utility type | https://github.com/microsoft/TypeScript/pull/56794 | ahejlsberg | 2024 | 推論を意図的にブロックする utility type |

## V8 Engine & JavaScript Specs

| ID | Title | URL | Author | Era | Hook |
|----|-------|-----|--------|-----|------|
| V801 | V8 Hidden Classes explained | https://v8.dev/blog/fast-properties | verwaest | 2017 | オブジェクトプロパティが内部的にどう最適化されるか |
| V802 | TurboFan — V8's optimizing compiler | https://v8.dev/blog/turbofan-jit | v8-team | 2015 | JS をネイティブコード並みに速くする JIT コンパイラ |
| V803 | Maglev — mid-tier JIT compiler | https://v8.dev/blog/maglev | nicohartmann/verwaest | 2023 | Sparkplug と TurboFan の間を埋める新しい JIT 層 |
| V804 | Promise.withResolvers | https://github.com/nicolo-ribaudo/proposal-promise-with-resolvers | nicolo-ribaudo | 2023 | Deferred パターンを公式化した TC39 提案 |
| V805 | Temporal API (TC39) | https://github.com/nicolo-ribaudo/proposal-temporal | TC39 | 2020+ | Date を置き換える次世代日時 API |
| V806 | Iterator helpers | https://github.com/nicolo-ribaudo/proposal-iterator-helpers | TC39 | 2019+ | map/filter/take をイテレータに直接使える |
| V807 | Signals proposal | https://github.com/nicolo-ribaudo/proposal-signals | nicolo-ribaudo | 2024 | リアクティブプリミティブの標準化提案 |
| V808 | Decorators (Stage 3) | https://github.com/nicolo-ribaudo/proposal-decorators | TC39 | 2022 | 長年議論されたデコレータがついに Stage 3 に |
| V809 | Import Maps | https://github.com/nicolo-ribaudo/import-maps | nicolo-ribaudo | 2019 | バンドラなしで ESM の import を解決する仕組み |
| V810 | Structured Clone algorithm | https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm | MDN | 2010+ | JSON.stringify より賢いオブジェクトの深いコピー |

## Cross-Cutting / Ecosystem

| ID | Title | URL | Author | Era | Hook |
|----|-------|-----|--------|-----|------|
| XC01 | RFC: React Cache (deprecated) → Server Functions | https://github.com/reactjs/rfcs/pull/249 | sebmarkbage | 2023 | Cache API が廃止され Server Functions に進化した経緯 |
| XC02 | Next.js App Router RFC | https://github.com/vercel/next.js/discussions/37136 | timneutkens | 2022 | App Router のアーキテクチャ設計の公式議論 |
| XC03 | Turbopack announcement | https://github.com/vercel/turbo/blob/main/docs/pack/getting-started.md | vercel | 2022 | Rust ベースバンドラの設計思想 |
| XC04 | SWC — Speedy Web Compiler | https://github.com/nicolo-ribaudo/swc | nicolo-ribaudo | 2020+ | Babel を Rust で置き換える高速トランスパイラ |
| XC05 | Million.js — Virtual DOM alternative | https://github.com/aidenybai/million | aidenybai | 2023 | block virtual DOM で React を高速化するアプローチ |
