# 部分結果・中断からの復旧

`runStatus` は実行全体、`collectionCoverage` はローカル収集、`queryCoverage` は公開照合、`impact` は証拠の意味。収集completeは感染なしの保証ではない。lock宣言、実物metadata、稼働metadata、digest対応SBOM、固有IOCを区別する。既知の不一致だけを「影響なし」にし、不明を安全へ変換しない。

| 終了値 | 意味 | 次の操作 |
|---|---|---|
| 0 | 完了または方針除外のみ。所見ありでも0 | 保存済みレポートを読む |
| 2 | 部分レポート保存済み、または翻訳待ち | 未確認範囲を確認。翻訳待ちは下記の翻訳手順だけを再開 |
| 64 | 引数・設定・状態形式を実行前に拒否 | MSS_USAGEは `--help` を確認。状態の問題は元ファイルを保って形式・スキルのバージョンを確認 |
| 75 | 別実行中またはowner不明 | 実行終了を待って一度再試行。不明ownerは下記の確認 |
| 1 | 実行または保存失敗 | 診断コードとwriteOutcomeを確認。次回起動の世代照合を待つ |

旧版はpartialでも0を返していた。監視やshellの呼出側は2を「保存済み未完了」として扱う。stdin入力を待つ処理はない。未知の例外は生成診断IDだけを表示し、message/stack/cause/stdout/stderr本文は保存しない。

## report-backed世代

各世代に `evidence.json`、`continuation.json`、`report.md` を原子的に保存し、hash付き `commit.json` を最後に公開する。その後だけstateの世代を進める。途中経過のreportも成功cursorと未完了queueを区別する。

- report成功/state失敗: 次回、以前のstateと新しいcommitの連結・hashを確認して再開する。
- commitなし: 成功cursorを進めない。未commitの段階を安全判定に使わない。
- hash/世代/ID不一致・不正JSON・将来schema: 元stateを保持して停止する。空state化や黙った巻戻しはしない。
- 容量不足: 既存レポートは自動削除しない。利用者が保存先の空き容量を確認する。失敗前のpositives/pendingを保つ。

Node標準APIには原子的なopenatによる祖先探索がない。no-follow、同一FDのbounded read、前後の祖先identity確認で観測可能な差し替えを拒否する。侵害済みkernelや全てのcloud providerのhydrationを防ぐ保証ではない。既知placeholder/evicted metadataは本文を開かず延期する。

## owner不明lock

場所: `~/.local/state/mac-security-sweep/.run.lock/owner.json`。取得/回収の短い競合を防ぐ専用guard `.run.lock.acquire` も同じstate directoryに作る。guardが残っている場合も推測で削除せず75で停止する。PIDだけでなくnonce/run ID/開始時刻/boot identityを照合する。PID再利用・owner欠損・確認不能は自動回収しない。独立にdeadを確認した同じownerだけ回収する。

以下は**読むだけの手順説明**。通常の監査は実行しない。利用者が別途、進行中の監査がないとプロセス情報から確認し、所有権も確認した場合に限り、このスキル専用 `.run.lock` または残存する `.run.lock.acquire` だけを私有証拠領域へ隔離する手動復旧を検討する。stateや監査対象の削除、プロセス停止、sudo、FDA/認証設定変更は提案しない。不確実ならそのまま停止する。

## rollbackと安全な問い合わせ

旧版はschema2を安全に扱えるとは限らない。利用者が管理する互換版stateのバックアップまたは独立した検証用homeで戻し方を確認する。スキルは生stateの追加バックアップや破壊的migrationを自動作成しない。

問い合わせにはスキルrevision、Node major、macOS/arch、MSSコード、秘密を含まない架空再現だけを使う。棚卸し・state・config・ログを送らない。テレメトリーや監視付きsupport SLAは提供しない。

## 翻訳だけを再開する

対象は `translationStatus: pending` の保存済みレポート。元の `report.md` と `commit.json` のSHA-256を保持し、同じ世代から翻訳する。ニュース取得やローカル調査は繰り返さない。

1. `reportPath` の原文を読み、同じ世代ディレクトリの `translation-es.input.md` にスペイン語訳をモード0600で保存する。別の言語ではファイル名の `es` を正規化された `requestedLanguage` に置き換える。
2. 原文と訳文を照合し、判定、未確認範囲、前回からの継続、数値、識別子、日時、リンク先とその出現回数を保つ。OpenSourceMalwareなど、情報源・製品の固有名詞は原綴りを残す。単語の一括置換で固有名詞まで翻訳しない。意味の確認はホストが行う。
3. スキルの実体ディレクトリで次のコマンドを入力する。`ID` と `SHA256` は実行結果の `generation` と `reportHash` に置き換える。profileを使った実行なら同じ `--profile` も付ける。

```bash
node scripts/deliver-translation.mjs --generation ID --canonical-hash SHA256 --language es --semantic-reviewed
```

`--semantic-reviewed` はホストが意味を確認したという記録。機械による保証ではない。成功時は `translatedPath` と `manifestPath` が返る。完成稿は原文と同じ世代ディレクトリの `translation-es-<SHA256>.md` に保存される。対応する `.commit.json` はschema 2で、元の世代・原文ハッシュ・訳文ハッシュを記録する。原文や走査の継続位置は変更しない。

ローカルリンクは同じ世代の `evidence.json`、`continuation.json`、`report.md`、`commit.json` に限る。原文のリンク先をそのまま残し、`../` や絶対パスへ書き換えない。参照形式のリンク、HTML、自動リンク、画像の追加は受け付けない。

旧版が `translations/` に保存した完成稿と記録は残す。そこでは `evidence.json` のリンク先がずれるため、上の手順で同じ原文から完成稿を保存し直し、新しい `translatedPath` を提示する。旧ファイルの移動や証拠のコピー、再スキャンは不要。

保存途中で停止した場合は、同じ原文・訳文・引数で一度だけ再試行する。既存の完成稿と保存記録が一致すれば再利用し、不一致なら停止する。未確定ファイルがあるだけでは翻訳完了と扱わない。
