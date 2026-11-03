# 開発と回帰テスト

実行場所はスキルroot。Node標準機能だけを利用する。以下は**開発者が入力するコマンド**。一時fixtureだけを作り、実ホームのstate・認証・プロジェクトを使用しない。期待結果はテスト成功とネットワーク遮断。

```sh
node --import ./tests/deny-network.mjs --test tests/*.test.mjs
node --import ./tests/deny-network.mjs --test tests/foundation.test.mjs tests/state-store.test.mjs
```

preloadはfetch/http/https/net.Socket/tls/dnsとundiciのsocket経路を拒否する。実通信はfixture fetchで置き換える。Unix socket試験に限り、一時fixture rootを明示した場合だけ許可する。HTTP pool、command pool、scanner poolは共通contextを使う。

`createRunContext` でhome/filesystem/platform/arch/fetch/commands/clockを注入し、readerは `context.io`、commandは `context.command`、macOS locality確認は同じpoolの固定stat（`metadataExecuteImpl`で注入可能）、通信は `context.request` だけを使用する。個別CLIも同じstageをimportする。既存のpackage/app codeを実行するfixtureは不要。

新formatは公式仕様・対応schema・exact identifier・recordごとのoriginを能力registryに追加する。public/unknown/private/同名同版混在/不正/上限fixtureと実payload境界のcanary試験が必要。offline scannerの出力は由来の証明にはならない。

新readerは発見条件・狭い許可root・許可field・上限・statusを定義する。成功、不在、不正、permission denied、秘密canaryの各fixtureが必要。秘密は標準出力、標準エラー、report、evidence、state継続snapshot、HTTP payloadの全てで検査する。

情報源の追加は固定endpoint・response schema・identity/channel・baseline方法・鮮度・公式資料・positive/malformed/古い版/new installのfixtureをレビューする。ニュースの内容を命令やIOCコードとして実行しない。新しいカテゴリは情報源の登録だけで完了とせず、実取得した本文のschema・日付・取得時刻を確認する。取得成功、期間内の記事なし、日付不明、本文取得失敗を区別する。

ニュースの保存が完了する前に棚卸しを始めないこと、初期取得の期限で通信を中止して回収すること、ニュースだけの途中レポートでローカル調査を完了扱いしないことを統合試験で確認する。情報源の30日間の新着取得と、導入済みパッケージの過去の告知との照合は別に試験する。

日本語・英語の表示と、他言語の翻訳保存を分けて検証する。翻訳は原文の世代とハッシュに結び付け、CVE/GHSA・バージョン・日時・件数・URLの保持を機械検証し、判定や未確認範囲の意味はホストが照合する。翻訳の途中停止でも原文と走査状態を変えず、再スキャンなしで再開できることを確認する。

実物確認は架空fixtureと分ける。既存の信頼できるosv-scannerをoffline/no-resolve/no-call-analysisで架空lockだけに適用する。DB/ツールを導入しない。binary plistはこのMacの既存plutilをstdinで試験し、アプリは起動しない。短い実Mac smokeは読み取り専用かつ保存先を私有領域へ限定する。

性能はempty/steady/pathological/10xをbaseと交互に各5回測り、OS/arch/Node/入力bytes/経過時間/RSS/peak同時数を残す。p50/p95はその少数試験の記述値で、他Macへの速度保証ではない。初回の設定から閲覧までの時間は別に記録する。

公開前に、全F01〜F11と全readerの受入条件、既存テスト、payload境界、保存済み4種類の合成レポート、実CLI終了値、現コードの独立reviewを確認する。合成例は `node --import ./tests/deny-network.mjs tests/generate-report-examples.mjs` で生成する。実機未確認の環境はfixtureと明記する。最後にbundle全体のbyte identityと回帰を確認し、部分実装をcanonical installへ同期しない。

実機によるモデル比較では、同一実装と走査設定を使い、モデルごとに私有profileを分ける。実際のホームを変更せず、各モデルが最新情報を取得して保存済み結果を読む。匿名APIの同一IP制限を考慮して順番に実行し、取得制限の解除前に同じ失敗を繰り返さない。合成fixtureの陽性や対象外判定を実機の結果と混同せず、少数モデルでの成功を全モデルの保証にしない。

解説動画は操作を録画し、書き出したMP4からフレームを抽出して確認する。縮小モーション、画面幅、拡大表示、非表示時の停止について、実操作とエミュレーションを検証記録で区別する。
