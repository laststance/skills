# 最初の巡回

条件: macOSで既存の信頼できるNode 22以上（24推奨）が動作すること。ツールの自動インストールはしない。以下は**入力して実行する手順**。スキルの実体パスはホストが検出した値を使い、特定利用者のホームやNode管理方法を仮定しない。

1. ターミナルの実行場所を、検出した `mac-security-sweep` ディレクトリにする。`scripts/run-sweep.mjs` とこの文書が存在する場所を確認する。読み込み確認だけならここで終了し、下のスキャンは実行しない。
2. その場所で `node scripts/run-sweep.mjs --language JA --budget-ms 120000` を実行する。認証入力は不要。標準出力はレポートパス・状態・件数・診断コードなどの実行結果。データ保存先は `~/security-reports/mss-<run-id>-<世代>/`、状態は `~/.local/state/mac-security-sweep/state.json`。終了値2でも部分レポートは保存されている。情報収集だけで時間切れになった場合は、ローカル調査が未開始であることも記録する。
3. JSONの `reportPath` をローカルで開き、重要ニュース・このMacへの影響・未確認範囲・今回の情報取得時刻を読む。同じコマンドで続きから再開する。通常上限28分で実行する場合は `--budget-ms` を省略する。

最初のレポートまで5分以内を設計目標とする。2分の収集例、試験時間、実際の初回設定から閲覧までの時間は別々に測定する。fixtureの所要時間を利用者の初回体験の実測値とは呼ばない。

英語で実行する場合のコマンド（同じスキルディレクトリで入力）:

```bash
node scripts/run-sweep.mjs --language EN --budget-ms 120000
```

AIエージェントから起動する場合は、明示した言語か会話の言語を `--language` に渡す。英語・日本語以外は、英語の原文を保存してからホストが翻訳する。`requestedLanguage`、`canonicalLanguage`、`translationStatus` で進行状況を確認する。翻訳待ちの復旧は [recovery.md](recovery.md#翻訳だけを再開する) を参照。

独立した検証では `--profile evaluation-en` を追加する。保存先は両ディレクトリの `profiles/evaluation-en/`。新しいprofileは既存の走査設定だけを引き継ぎ、実際のホームを調べる。結果・成功日時・ロックは共有しない。profile名は英数字で始まる48文字以内の英数字・`_`・`-`。再開には同じprofileを指定する。

JSONの `firstSavedMs` は最初の保存まで、`elapsedMs` は終了までの時間。取得できなかった情報源は原因や再試行可能時刻を確認し、復旧・期限解除・形式修正後に再開する。

## プロジェクトの既定位置が存在しない場合だけ

既定は `~/Projects`、`~/repository`、`~/work`。全部不在でもホーム全体を再帰走査せず、部分レポートと安全な直下候補を示す。候補は自動採用しない。

**編集する設定の例**（実行コマンドではない）: `~/.local/state/mac-security-sweep/state.json` をエディターで開き、既存キーを保ったまま `scanRoots` だけを次の形へ変更する。利用者が設定変更を指定した場合にだけ編集する。ファイル全体をこの例で置換しない。

```json
"scanRoots": [
  { "path": "~/Projects", "scope": "personal" },
  { "path": "~/work", "scope": "work" }
]
```

次回の通常実行で新しい範囲を検証する。home全体、Library、認証領域、ルートまたは祖先のsymlinkは指定できない。state削除・権限変更・ログイン・プロセス停止は復旧手順ではない。
