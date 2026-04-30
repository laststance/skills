# Review Perspectives Library

Catalog of review lenses. Assign based on review target relevance.

## Universal Perspectives (always applicable)

| ID | Name | Slug | Focus |
|----|------|------|-------|
| U1 | Baseline | `baseline` | 全要件を均等にチェック。漏れなく網羅。 |
| U2 | Devil's Advocate | `devils-advocate` | 仕様の曖昧さ、隠れたリスク、仕様に書かれていない境界条件。常に最後のエージェントに割り当て。 |

## Code Review Perspectives

| ID | Name | Slug | Focus |
|----|------|------|-------|
| C1 | Request Shape | `request-shape` | API リクエスト/レスポンス構造が spec と一致するか |
| C2 | Type Safety | `type-safety` | TypeScript 型定義とスキーマの対応、型安全性、ジェネリクス |
| C3 | Converter Logic | `converter-logic` | データ変換関数のロジック、入出力の正確性 |
| C4 | Integration Flow | `integration-flow` | E2E フロー、エンドポイント選択、ヘッダー注入、キャッシュ無効化 |
| C5 | Regression | `regression` | 既存機能への影響、後方互換性、既存呼び出し元の破壊 |
| C6 | Error Handling | `error-handling` | エラーハンドリング、非同期処理、ポーリング、タイムアウト |
| C7 | Coding Standards | `coding-standards` | プロジェクト固有のコーディング規約準拠 |
| C8 | Performance | `performance` | N+1、不要な再レンダリング、メモ化、バンドルサイズ |
| C9 | Security | `security` | XSS、インジェクション、認証/認可、CORS、機密情報漏洩 |

## Spec Compliance Perspectives

| ID | Name | Slug | Focus |
|----|------|------|-------|
| S1 | UI/UX Accuracy | `ui-ux` | ボタンラベル、disabled 状態、モーダル、レイアウト |
| S2 | Permission & Guards | `permission-guards` | 権限チェック、ガード条件、アクセス制御 |
| S3 | Modal & Component | `modal-component` | モーダル動作、コンポーネント共有度、Props 設計 |
| S4 | Data Flow | `data-flow` | ユーザー操作→API→レスポンス→画面更新の全フロー |
| S5 | i18n & Labels | `i18n-labels` | 翻訳キー、ラベル正確性、エラーメッセージ、トースト |
| S6 | Async & Polling | `async-polling` | 非同期処理、ジョブポーリング、キャンセル、タイムアウト |

## Domain-Specific Perspectives

| ID | Name | Slug | Focus |
|----|------|------|-------|
| D1 | Database & Migration | `database` | スキーマ変更、マイグレーション、インデックス |
| D2 | API Design | `api-design` | RESTful 設計、ステータスコード、ページネーション |
| D3 | State Management | `state-mgmt` | グローバル/ローカル状態、Context、TanStack Query キー |
| D4 | Accessibility | `a11y` | キーボードナビ、スクリーンリーダー、ARIA、コントラスト |
| D5 | Mobile | `mobile` | レスポンシブ、タッチ操作、モバイル固有 UI |

## Perspective Assignment Examples

### API 整合性レビュー (4 agents)
`U1(baseline)` → `C1(request-shape)` → `C2(type-safety)` → `U2(devils-advocate)`

### Backlog 仕様充足レビュー (6 agents)
`U1` → `S1(ui-ux)` → `S2(permission)` → `S4(data-flow)` → `C7(coding-standards)` → `U2`

### PR コードレビュー (8 agents)
`U1` → `C1` → `C2` → `C4(integration)` → `C5(regression)` → `C6(error)` → `C7(standards)` → `U2`

### セキュリティレビュー (5 agents)
`U1` → `C9(security)` → `C6(error)` → `S2(permission)` → `U2`

### フル品質レビュー (10 agents)
`U1` → `S1` → `S2` → `S4` → `C5` → `S5` → `S6` → `C7` → `C8` → `U2`
