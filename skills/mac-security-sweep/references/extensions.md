# エディタ・ブラウザ拡張の調査

通常の棚卸しで収集し、告知一致の有無にかかわらず日本語・英語のレポートに専用表を出す。拡張やIDEのCLIを起動せず、以下の既知metadataだけを読む。認証DB、Cookie、履歴、拡張のstorage、任意のユーザー設定本文は保存しない。

## 対応する配置

| 対象 | 読むmetadata | 残る制限 |
|---|---|---|
| VS Code・Cursor・Insiders | 既知のextensionsディレクトリのpackage.jsonとextensions.json | publisher.nameと版を記録。導入登録だけでは有効・実行中と判断しない。Portableは配置と製品を区別する。 |
| Zed | `~/Library/Application Support/Zed/extensions/installed/*/extension.toml` | root直下のid・name・versionの限定literalだけ。WASM、work配下、言語サーバーは起動しない。有効状態は不明。 |
| JetBrains IDE | `~/Library/Application Support/JetBrains/<product><version>/plugins`のMETA-INF/plugin.xml、または通常JAR中の同名記述子 | PhpStorm・WebStorm・IntelliJ等の製品／版ごとにユーザープラグインを確認。disabled_plugins.txtに明示されたIDだけ無効と判断。それ以外の有効状態・旧profileの現在利用は不明。同梱プラグイン・独自配置を網羅したとは言わない。 |
| Chrome・Canary・Edge・Brave | 各profileのmanifest.json、Preferences／Secure Preferencesの限定enablement情報 | IDのstateを全残存版に流用しない。設定に結び付かない版は有効状態不明。配布元は未検証。 |
| Firefox・Zen | profiles.iniとprofileごとのextensions.json | Zenは既知の`Library/Application Support/zen`を独立した製品として読む。無効状態と登録済みactiveを保持。絶対profileも許可rootの外へ出ない。 |
| Safari | 導入アプリのPlugIns/*.appex/Contents/Info.plist | Safariの拡張pointに一致したID・版だけ。有効状態は不明。 |

独自配置は既存stateの`editorRoots`／`browserProfiles`で指定できる。Zedのrootはinstalledディレクトリ、JetBrainsのrootはpluginsディレクトリを指定する。設定変更は依頼された場合だけ行う。リンクは追跡せず、権限拒否・不正・上限を不在へ変換しない。

## 記述子と上限

JetBrainsは単体JAR、またはplugin/libのJARを最大16件／pluginまで確認する。JARは25MiB、展開するplugin.xmlは128KiB、central-directory entryは2000件以下。記述子1つだけをメモリ内で展開し、ZIPの長さ・CRC・local/central名を照合する。ファイル展開やclassの起動はしない。暗号化・multidisk・ZIP64・重複記述子・未対応圧縮は未確認として残す。

XMLのDTD・外部entityを拒否し、root直下のid・name・versionのみ射影する。ZedのTOMLもrootの限定literalのみを射影する。形式を解釈できない場合はコードを評価せずpartialとする。各readerは共通の時間・件数・安全なfilesystem境界を使う。

## 告知との照合

- 取得済み・検証済みの構造化affected記録と、拡張ID・ホスト・版を照合する。同じ表示名、同じnpm名、別エディタの同一publisher IDだけでは影響版と判断しない。
- 対応identityはVSCode、Zed、JetBrains、Chrome Web Store、Firefox Add-ons、Safari。BrowserExtension形式はbrowserの明示が必要。自然言語の記事は確認候補にとどめる。情報源の対応形式がなければ未確認のまま残す。
- 単純な数値範囲または明示的な版一覧だけを比較する。撤回済み告知は除外。配布元の指定を検証できない場合や版体系が不明な場合は「可能性あり」。無効な影響版や残存版も保持する。
- 「影響なし」はその導入記録と個別告知の範囲だけ。悪性配布は現在版が変わっただけで解消にしない。ホスト・profile別の陽性を独立保持し、今回見えない古い記録を削除しない。
- 未一致の拡張も導入表に掲載し、既知告知の未取得や履歴の不足を明記する。汎用の全拡張脆弱性DBを照会したとは言わない。拡張一覧・ローカルパスを外部へ送信しない。

## 公式資料

- [VS Code extension manifest](https://code.visualstudio.com/api/references/extension-manifest)
- [Zed installation locations](https://zed.dev/docs/extensions/installing-extensions)
- [JetBrains plugin descriptor](https://plugins.jetbrains.com/docs/intellij/plugin-configuration-file.html)
- [JetBrains IDE directories](https://www.jetbrains.com/help/phpstorm/directories-used-by-the-ide-to-store-settings-caches-plugins-and-logs.html)
- [Zen profile metadata](https://docs.zen-browser.app/guides/manage-profiles)

形式・配置を確認した日: 2026-11-07。これらの資料にある設定変更やコピーの手順は監査中に実行しない。
