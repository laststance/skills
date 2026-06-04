---
name: copy
description: Copy last agent reply
disable-model-invocation: true
---

# Copy — Agent メッセージをクリップボードにコピー

直近のエージェントメッセージを Cursor のトランスクリプトから抽出し、
macOS クリップボードにコピーする。

## 使い方

### 基本: 直前のメッセージをコピー

```bash
python ~/.agents/skills/copy/scripts/copy_last_message.py \
  "<transcripts_dir>"
```

（Claude Code: `~/.claude/skills/...`、Cursor: `~/.cursor/skills/...` に symlink される）

`<transcripts_dir>` は現在のワークスペースの agent-transcripts ディレクトリ。
パスはシステム情報の `agent_transcripts` セクションから取得できる。

### N個前のメッセージをコピー

```bash
python ~/.agents/skills/copy/scripts/copy_last_message.py \
  "<transcripts_dir>" --nth 2
```

### 確認してからコピー (dry-run)

```bash
python ~/.agents/skills/copy/scripts/copy_last_message.py \
  "<transcripts_dir>" --dry-run
```

## ワークフロー

1. ユーザーのリクエストを解釈し、何番目のメッセージをコピーしたいか特定する
   - `/copy` → 直前の assistant メッセージ (--nth 1)
   - 「2つ前のやつ」→ --nth 3 (user, assistant の交互を考慮)
   - 「Floatの解説全部」のように内容で指定 → --dry-run で確認してから判断
2. スクリプトを実行してクリップボードにコピー
3. コピーした文字数とメッセージ番号をユーザーに報告
4. 必要なら --dry-run で先頭部分を見せて確認を取る

## 注意事項

- トランスクリプトにはツール呼び出しの結果も含まれるが、
  スクリプトは `type: "text"` のみを抽出するので、ツール出力は含まれない
- macOS の `pbcopy` を使用。Linux の場合は `xclip` に置き換える必要あり
- 複数の assistant メッセージにまたがる内容をコピーしたい場合は、
  複数回実行して手動で結合するか、エージェントが結合して出力する
