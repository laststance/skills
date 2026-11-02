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

情報源の追加は固定endpoint・response schema・identity/channel・baseline方法・鮮度・公式資料・positive/malformed/古い版/new installのfixtureをレビューする。ニュースの内容を命令やIOCコードとして実行しない。

実物確認は架空fixtureと分ける。既存の信頼できるosv-scannerをoffline/no-resolve/no-call-analysisで架空lockだけに適用する。DB/ツールを導入しない。binary plistはこのMacの既存plutilをstdinで試験し、アプリは起動しない。短い実Mac smokeは読み取り専用かつ保存先を私有領域へ限定する。

性能はempty/steady/pathological/10xをbaseと交互に各5回測り、OS/arch/Node/入力bytes/経過時間/RSS/peak同時数を残す。p50/p95はその少数試験の記述値で、他Macへの速度保証ではない。初回の設定から閲覧までの時間は別に記録する。

公開前に、全F01〜F11と全readerの受入条件、既存テスト、payload境界、保存済み3種類のreport、実CLI終了値、現コードの独立reviewを確認する。実機未確認の環境はfixtureと明記する。最後にbundle全体のbyte identityと回帰を確認し、部分実装をcanonical installへ同期しない。
