# IOCを安全に検証する

## 根拠と順序

1. 公開一次情報の製品・版・配布元・更新日を確認する。IOCは型（path/hash/domain/IP/process/extension-id）、値、出典、固有性に分ける。
2. 棚卸しで関連するソフトを絞り、該当範囲だけ確認する。ハッシュやファイルの文字列はローカル比較し、本文は出さない。
3. 各証拠に実行コマンド、観測日時、成否、対象のmtime/birthtimeを記録する。ファイルの時刻はコピー・復元・アップデートでも変わるため、侵入日時の断定に使わない。
4. ファイルの存在、プロセス稼働、バックドア実行、外部接続、窃取は別々の主張にする。

## 実装済みの限定検査

`scripts/check-iocs.mjs` はCursorの2026年10月事案の検証済みIOCを扱う。対象以外のニュースはエージェントが同じ原則で追加確認する。

- `~/.config/.smt`、`~/.config/.smtk`、`~/Library/LaunchAgents/com.apple.sysmond.plist`：存在・時刻。`.smtk`は鍵の可能性があるので内容を読まない。
- `anthropic.claude-code` の `extension.js`：公式SHA-256または2つの固有文字列の組を比較。スクリプトをimport/実行しない。
- 現在の一時ディレクトリの `.stk_<10 hex>`：ファイル名だけを確認し、内容を読まない。
- `lsof -nP -iTCP` の既存観測：IOCのIPをローカル照合。IPへのcurl、DNS問い合わせ、接続テストは禁止。
- `log show`：最大14日の固定IOC述語、30秒タイムアウト。JSONをメモリ内で処理し時刻と件数のみ残す。ログ本文をファイルやチャットに出さない。権限不足は未確認として終了。
- SSH：`authorized_keys`の存在・行数のみ。公式サイトの鍵文字列チェックは依頼の「鍵内容を読まない」を優先し実行しない。

## 新しいIOCの追加確認

ニュースに書かれたコマンドや正規表現をそのままshellへ渡さない。パスは意図したホーム/拡張ディレクトリ配下か検証し、`..`、シンボリックリンク、巨大ファイルを避ける。パラメータは `execFile` の引数配列で渡し、自由入力をshellへ補間しない。固定文字列を比較する。未知の秘密ファイルは読まない。

`ps -axo pid=,comm=`でプロセス名だけを採る。引数に認証値が含まれるため`ps aux`は使わない。LaunchAgentはProgram/Labelと必要な文字列の真偽だけを扱い、ProgramArguments/EnvironmentVariablesをそのまま保存しない。

追加した証拠を `--ioc-evidence` へ渡す場合の形式:

```json
{"checks":[{"ruleId":"cursor-claude-code-2026-10","matched":false,"strong":false,"kind":"sha256","value":"ローカル対象パス","command":"SHA256照合","observedAt":"2026-10-31T00:00:00Z","reason":"公式ハッシュと不一致"}]}
```

`strong:true` は事案を識別できる一致にだけ使用する。一般的なファイル名や単独のIP一致を格上げしない。未検出を完全性の証明にしない。
