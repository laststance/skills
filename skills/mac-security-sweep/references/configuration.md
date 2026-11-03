# ローカル設定と状態

保存場所は `~/.local/state/mac-security-sweep/state.json`。設定は利用者の意図した変更だけをmergeし、未知キー・既存の継続情報を削除しない。本文・未知キー名・値をチャットへ貼り付けない。認識したキーだけを検証し、未知キーは元の私有stateに保持する。

`--profile id` を付けると、stateは `~/.local/state/mac-security-sweep/profiles/id/state.json`、レポートは `~/security-reports/profiles/id/` に保存する。新しいprofileは既存の走査設定だけを引き継ぎ、結果・成功日時・ロックは分離する。調査対象のホームは変わらない。省略時の保存先は従来どおり。

| キー | 型・既定値・上限 | 意味 |
|---|---|---|
| `schemaVersion` | 整数1または2。未設定は旧形式 | 将来版は上書きせず拒否。保存時は2 |
| `scanRoots` | `{path,scope}[]`、最大20 | 未設定時Projects/repository/work。scopeはpersonalまたはwork。`~/`と絶対パスのみ。root変更で関連探索を再検証 |
| `queryUnknownGlobals` | boolean、既定true | 由来不明installed-globalの既存例外。falseならその照会を除外。lockには例外を適用しない |
| `homebrewPrefixes` | 絶対パス配列、追加0件、最大20 | /opt、/usr/local、~/homebrew下の既存Homebrew配置を確認。任意wrapper実行の許可ではない |
| `applicationRoots` | 絶対パス配列、追加0件、最大20 | homeまたは/Applications配下の追加アプリ配置。既知配置は残す |
| `browserProfiles` | `{product,root}[]`、追加0件、最大30 | Chrome/Canary/Edge/Brave/Firefox/Safari。home内のcustom metadata root |
| `editorRoots` | `{editor,root}[]`、追加0件、最大30 | VS Code/Cursor/Insiders/Portable。home内のcustom extension root |
| `runtimeRoots` | `{family,root}[]`、追加0件、最大30 | nvm/fnm/Volta/asdf/mise/Vite+/Homebrew/uv/pipx/conda/venv/Java/Ruby/rbenv/rvm/chruby、node/python。既知familyだけ |
| `sbomFiles` | 絶対パス配列、既定空、最大20 | 既存CycloneDX/SPDX。画像digest・由来を確認できた部分だけ利用 |

custom metadata rootでもCookie/認証DB/秘密鍵/.env等の本文禁止は解除されない。`Library` 内の既知metadata readerは狭い個別位置だけを読み、project scanRootとしてLibraryを許可しない。環境差のfixture用注入は公開設定に含めない。

`generation`、source cursor、discovery/package/advisory継続情報、`adaptiveNews`、transport cooldown、前回判定はスキルが管理する。未知schema・不正JSONを空stateへ置換しない。未完了のpackage照会cycleは24時間で再検証し、queryと詳細の両方が完了したcycleは次回に新しく開始する。詳細が未処理なら、検証済み24時間以内の全ページIDを維持する。設定・現在のcatalog・origin・root identityが変わる場合は関連継続を無効化して安全に再発見する。

上限: state/各世代証拠/レポート32MiB、metadata8MiB、lock25MiB、一般HTTP6MiB、詳細2MiB、展開後の通信本文は1実行合計96MiB。ニュースは合計10,000件・各情報源5,000件・正規化後16MiB、IOC添付資料は16件、OSV batchは100件、告知詳細は80件/実行。各readerはさらに小さい件数・深さ・行長制限を持つ。容量を黙って切り捨てずpartialまたは明示失敗にする。履歴レポートの自動pruneはない。

実行予算は `--budget-ms` で指定し、12,000〜1,680,000ms。最後の保存用に `max(10秒,min(60秒,予算の10%))` を確保する。初期ニュース取得は最大180,000msか残り収集予算の3分の1で打ち切り、通信終了と保存を確認してからローカル調査を始める。段階ごとに全体予算をリセットしない。同時実行上限はコマンド全体4、scanner2（コマンド枠も消費）、HTTP全体6/host2。同じ公開request/pageは1実行で計2回まで。cooldownは実際の応答を使い、最大24時間。

`--language EN|JA|es|language-tag` は説明文の言語を指定する。`locale` に要求言語・原文言語・翻訳状況を保存する。EN/JAはそのまま出力し、その他は英語の原文とホストによる翻訳を対応付けて保存する。次回の明示指定や現在の会話の言語を優先し、設定変更のためにstateを手編集する必要はない。

由来が既知のprivate/Git/localなど、方針除外だけが残る場合は`complete-with-exclusions`。由来不明lockや不正recordは`partial`。由来不明installed-globalの既定例外も`partial`に残す。`queryUnknownGlobals: false`で明示的に除外した場合は由来をunknownのまま保持し、方針除外として扱う。別の失敗や未確認があれば全体は引き続き`partial`。
