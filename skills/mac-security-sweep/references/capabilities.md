# 収集能力と互換性

対応範囲は有限であり、全ソフト・全脆弱性・削除済み履歴の網羅保証ではない。未導入、未対応、不正、権限拒否、延期、方針除外を区別する。短いPATHでも既存の固定候補を使い、任意のproject wrapper、アプリ、package codeを実行しない。

## ローカルreader

| 領域 | 対応する静的観測 | 残る境界 |
|---|---|---|
| Chromium | Chrome/Canary/Edge/Braveのmanifest、限定Preference enablement | Cookie・認証DB未読。残存版と有効版を区別 |
| Firefox | profiles.ini/extensions.json、disabled情報 | 未知profile形式は未確認 |
| Safari | .appexのInfo.plist | 有効状態を取得できなければunknown |
| エディタ | VS Code/Cursor/Insiders/Portable/custom rootのID・版・登録状態 | 登録だけでは有効と断定しない。他エディタは検出未対応。拡張コード/CLI未実行 |
| アプリ | Info.plist、bundled Electron/Chromium/Node、署名のローカル表示、既存ticketの存在 | ticket存在は公証検証済みではない。アプリ起動/online assessmentなし |
| Node管理 | nvm/fnm/Volta/asdf/mise/Vite+/Homebrew、global manifest | header等がなければ版不明。バイナリ名だけで版を推測しない |
| Python管理 | uv/pipx/conda/project venv、dist-info等 | import/pip実行なし。private/不明由来は別判定 |
| Java | JDK release metadata | Java実行なし |
| Ruby | rbenv/rvm/asdf/mise/chruby、rbconfigの版literal、静的gemspec | Ruby/gemspecのコード実行なし。API版を実行環境の版に代用しない |
| MCP/クラウド | global/project/VS Code MCPの名前・実行ファイルbasename、cloud設定の存在 | argv/env/認証内容未保存 |
| コンテナ | 全既知local Docker/OrbStack socket、画像ID・稼働container ID/image/status | remote/exec/pull/buildなし。名前・env/argv未保存 |
| SBOM | 既存CycloneDX/SPDX、record由来・画像digest対応 | 未対応/無結合は画像内部の確認済みにしない |
| 永続化 | LaunchAgent/Daemon、background item、静的LoginItems fallback、cron件数、shell hook存在 | raw本文・設定変更なし。permission deniedは不在と区別 |
| OS保護 | XProtect metadata、Gatekeeper/SIP/FileVault/Firewallの読取状態 | macOS差・権限制限はunknown。修復なし |
| IOC | 検証日・期限・出典付きhash/exact-path/process、安全な既存Cursor固定profile | arbitrary regex/command生成なし。単独IPは強い一致ではない |

## lock形式

能力registryは `scripts/package-formats.mjs`。npm v1/v2/v3、pnpm、Yarn classic/Berry、Bun text、Cargo、Go、Poetry/Pipfile/uv/requirements、Composer、Gemfile、Gradle、NuGet packages.lock/packages.config、Dart pubspecを発見・静的解析する。

pnpmは、同じschemaの起動用・プロジェクト用データを含む最大2文書を、それぞれ独立して解析する。[公式のロックファイル仕様](https://github.com/pnpm/pnpm/blob/main/pnpm/docs/lockfile.md)に従い、片方だけを読んで依存なしとは判断しない。文書間で由来を混ぜず、通常版とは異なる `resolution.revision > 0` は記録を保って未確認・外部照会対象外とする。

解析成功と照会許可は別。各依存recordの名前・版・source file/record identity・由来を保持する。同名同版の公開recordが私有recordを公開扱いに変更することはない。既定registryを証明できないGo/Gradle/NuGetやsource欠落は由来不明のまま。関連ファイルを使う場合も、その正確な依存recordへの束縛が必要で、単なるrepository一覧では足りない。

Bun binaryは検出未対応。Swift Package.resolvedは解析するが、OSV SwiftURLはGit URLを名前として必要とするため、このスキルの送信方針では照会除外。[OSV ecosystem定義](https://ossf.github.io/osv-schema/#affectedpackage-field)

## 情報源の適応

初期の共通情報源取得を先に終えて保存し、その後に棚卸しを始める。導入製品が分かったら、パッケージ照会、検証済みIOC照合、製品の過去の告知取得を並列で進める。告知詳細の処理は、参照するニュースとパッケージ照会の完了を待つ。毎回の直近30日ニュースと、過去の告知の照合範囲は別に記録する。Mozilla履歴やAppleの更新表だけで全CVEの影響開始バージョンを確認したとは扱わず、Homebrew DBの範囲や未対応製品も明示する。

## 実機とfixture

設計対象はmacOS 13以降、Node 22以上（24推奨）。OS feature/pathは存在・読取結果で判断する。Intel/Apple Silicon/Rosetta/custom Homebrew/短いGUI PATHは固定候補とfixtureで検証する。fixtureは別Macの実機確認ではない。

今回の開発端末で観測した環境: macOS 27.2 build 26B123、arm64、Node 24.22.1。別の物理Mac、Intel/Rosetta、Node22、古いmacOSでの実行は未確認として扱う。個別検証の最新結果は配布時の検証記録に分けて示す。

ホストはCodex/Claude Code/OpenClawが検出したSKILL.mdの実体位置を使う。リンク設置先・インストール方式は端末ごとに異なる。検出試験は各ホストへ「読み込み確認のみ」を指示し、scan・通信・配信を行わず、スキル名/実体位置/境界を答えられるか確認する。

## 未ダウンロードファイル

macOSのNode Statsには`st_flags`がないため、固定の`/usr/bin/stat`で実体IDと`SF_DATALESS`を確認する。祖先を上から順に確認し、未ダウンロードの親の下をstat/list/openしない。確認不能も`deferred-not-local`とし、ダウンロードを要求しない。mtime/ctimeなどが変わればlocal判定を取り直す。敵対的な同一ユーザーによる観測間の置換まで原子的に防ぐ保証はない。[Apple TN3150](https://developer.apple.com/documentation/technotes/tn3150-getting-ready-for-data-less-files)
