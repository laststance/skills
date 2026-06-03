# ライブラリ核ロジック簡易実装チャレンジ

人気ライブラリの核となるロジックを簡易実装し、エッセンスを理解する。
「使える」から「わかる」への深化が目的。

## 実装先
- **utils** リポ — 汎用ユーティリティとして保存（universal/browserパッケージ）
- **next-play** リポ — React/Next.js固有の実装を試す

---

## Redux Toolkit — createSlice

**学べるエッセンス**: Reducer + Action Creator の自動生成パターン
**チャレンジ**: Immerを使わず、スプレッド構文でcreateSlice簡易版を実装
**実装先**: utils/universal

```typescript
// 入力: { name, initialState, reducers } → 出力: { reducer, actions }
function createSlice(config) { /* ... */ }
```

**ポイント**: アクションタイプの自動命名（`${name}/${reducerName}`）、reducerマップからswitch生成

## React-Redux — useSelector / useDispatch

**学べるエッセンス**: Context + useSyncExternalStore によるストア購読
**チャレンジ**: useSyncExternalStoreを使ったuseSelector簡易版
**実装先**: next-play

**ポイント**: セレクタの等価比較、不要な再レンダリング防止

## Next.js — File-based Router

**学べるエッセンス**: ファイルシステム → ルートマッピング、動的セグメント
**チャレンジ**: ディレクトリ構造からルートテーブルを生成する関数
**実装先**: utils/node

**ポイント**: `[param]` 動的セグメント解析、`(group)` ルートグループ無視

## TanStack Query — useQuery

**学べるエッセンス**: Stale-While-Revalidate パターン、キャッシュ管理
**チャレンジ**: SWRパターンの簡易useQuery（fetch + cache + refetch）
**実装先**: next-play

```typescript
// staleTime内はキャッシュ返却、超過したらバックグラウンドrefetch
function useQuery(queryKey, queryFn, options) { /* ... */ }
```

**ポイント**: queryKeyによるキャッシュ管理、staleTime/gcTime概念

## React Router — matchPath

**学べるエッセンス**: URLパターンマッチング、パラメータ抽出
**チャレンジ**: パスパターン（`/users/:id`）とURLのマッチング関数
**実装先**: utils/universal

**ポイント**: 正規表現生成、名前付きパラメータ抽出、ワイルドカード `*`

## shadcn/ui — Primitive組立

**学べるエッセンス**: Radix Primitiveの合成パターン、Tailwind Variants
**チャレンジ**: Button + Dialog をRadix Primitiveから手動で組み立て
**実装先**: next-play

**ポイント**: `asChild` パターン、`cn()` ユーティリティ、CVA（class-variance-authority）

## OpenOPRC — RPC Router

**学べるエッセンス**: 型安全なRPCルーティング、入出力スキーマ
**チャレンジ**: Zodバリデーション付き簡易RPCルーター
**実装先**: next-play

**ポイント**: procedure定義、入力バリデーション、型推論チェーン

## React Hook Form — useForm

**学べるエッセンス**: 非制御コンポーネント + ref によるフォーム管理
**チャレンジ**: register/handleSubmit/formState の簡易版
**実装先**: next-play

**ポイント**: ref登録パターン、バリデーション、再レンダリング最小化

## Zod — スキーマバリデーション

**学べるエッセンス**: ビルダーパターン、型推論（z.infer）
**チャレンジ**: z.object / z.string / z.number のチェーン可能なバリデーター
**実装先**: utils/universal

```typescript
// メソッドチェーン: z.string().min(1).max(100).email()
```

**ポイント**: パーサー合成、TypeScript型推論の連動

## lodash — ユーティリティ関数

**学べるエッセンス**: 実用的なJS関数の内部実装
**チャレンジ**: 以下を各1関数ずつ実装
**実装先**: utils/universal

| 関数 | 学べること |
|------|----------|
| `debounce` | タイマー管理、クロージャ |
| `throttle` | 実行間隔制御 |
| `deepClone` | 再帰的オブジェクト複製、循環参照処理 |
| `get` | ドットパスによるネスト値取得 |
| `groupBy` | コレクション操作 |

## Axios — Interceptor付きFetchラッパー

**学べるエッセンス**: リクエスト/レスポンスインターセプター、Promise チェーン
**チャレンジ**: fetch APIベースでinterceptorパターンを実装
**実装先**: utils/browser

**ポイント**: ミドルウェアチェーン、リクエスト/レスポンス変換、エラーハンドリング

## Sonar (SonarQube) — 静的解析ルール

**学べるエッセンス**: AST解析、コード品質ルール検出
**チャレンジ**: TypeScript Compiler APIで「未使用変数検出」ルールを実装
**実装先**: utils/node

**ポイント**: AST走査、スコープ分析、ルールエンジンパターン

---

## 進め方のコツ

1. **最小実装から始める** — 全機能ではなく核ロジック1つだけ
2. **テストを先に書く** — 期待する動作を明確にしてから実装
3. **Context7で本家APIを確認** — 最新の型定義とAPI仕様を参照
4. **実装後に本家コードと比較** — 自分の実装と本家の違いを考察
