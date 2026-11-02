# 影響が見つかったときの報告・提案

この文書は提案の書き方。封じ込め・認証変更・クライアント連絡は実行しない。

## 事案の説明

- **何が**：製品/拡張/パッケージ、版、入手元、具体的な悪性処理または脆弱性。OSV該当は「影響版」の証拠であり、感染や悪用成功ではない。
- **いつ**：公開された配布時間帯、拡張のinstallTimestamp、mtime/birthtime、実際のログ時刻をJSTとUTCで並べる。「推定」「現在の状態」「履歴未保存」を明記する。
- **どうやって**：確認できた配布経路を記載。不明なら更新経由などと断定しない。
- **何を読めたか**：実際の実行ユーザーと権限に照らし、以下のパスの存在だけを確認する。アクセス可能性と窃取の証拠を区別する。

## 秘密情報の場所だけを挙げる

`~/.ssh/`、`~/.config/gh/hosts.yml`、`~/.npmrc`、対象リポジトリ直下の `.env`/`.env.*`、`~/.local/share/com.vercel.cli/`、`~/.config/vercel/`、`~/.supabase/`、`~/.config/supabase/`、`~/.config/neonctl/`、`~/.config/gcloud/`、Chrome/Canaryの各プロファイル、`~/.config/op/`、`~/.openclaw/` 内の認証ストア、`~/.claude/.credentials.json`、`~/.codex/auth.json`、macOS Keychain。製品によるパスの差異は未確認とする。鍵・トークン・ブラウザDB・Keychainの中身は読まない。

1PasswordやKeychainの存在だけで中身を読めたと断定しない。ロック状態・CLIセッション・プロセス権限・利用履歴が未確認ならその限界を記す。

## 個人と仕事の切り分け

| 領域 | 記載する内容 |
|---|---|
| 個人 | scanRootsでpersonalに分類したプロジェクト、個人用ブラウザ/アカウント、個人が管理するサービス |
| 仕事 | scanRootsでworkに分類したプロジェクト、仕事用ブラウザ/アカウント、雇用主・クライアントのサービス |

同じmacOSユーザーで起動した悪性プロセスは、ブラウザやGitHubアカウントが別でも双方の読めるファイルへ到達し得る。到達性は調べた事実と推定を分ける。仕事側に及ぶ可能性があれば「クライアントのインシデント手順に従った報告が必要な可能性」を明記する。自動で連絡しない。

## 提案する順序

1. **実行痕跡あり**：対象Macをネットワークから隔離し、被害拡大防止と証拠保全を優先する提案。疑わしい拡張の削除だけでは永続化が残る場合がある。プロセス/LaunchAgentの停止・削除、再構築の要否を確認後に実施する計画を示す。
2. **信頼できる別端末から**：主要メール/SSO、GitHubのセッションとトークン、クラウド権限の強い資格情報を優先して失効・再発行。新しい秘密を疑わしいMacへ置かない。
3. SSH鍵を新規作成し、各接続先の古い公開鍵を除外する計画。npmトークン、Vercel、Supabase、Neon、gcloud、AIエージェントの認証を使用状況に応じて更新する。
4. GitHub/クラウドの監査ログ、デプロイ、公開パッケージ、リポジトリ変更を点検する提案。漏えい範囲が未確定なら「未確定」と書く。
5. 通常の脆弱性該当だけなら、修正版への更新・実行条件の削減・再テストを先行する。実行/窃取の根拠なしに全資格情報ローテーションを必須としない。

## 再発行・失効画面の入口

開くのは本人の確認後。画面の文言・製品仕様は実施時に公式資料で再確認する。

| 対象 | 入口と提案 |
|---|---|
| GitHub | [Tokens](https://github.com/settings/tokens)、[Applications](https://github.com/settings/applications)、[Sessions](https://github.com/settings/sessions)、[SSH keys](https://github.com/settings/keys)。個人と仕事を各ブラウザで区別する。`gh auth switch`は使わない。 |
| npm | [Access tokens](https://www.npmjs.com/settings/~/tokens)。使っているpublish/CIトークンを再発行し、古いものを失効。 |
| Vercel | [Tokens](https://vercel.com/account/tokens)。利用しているチーム・組織の用途と対象プロジェクトを確認。 |
| Supabase | [Access tokens](https://supabase.com/dashboard/account/tokens)。プロジェクトのDB/APIキーは対象プロジェクト設定で別途判断。 |
| Neon | [Console](https://console.neon.tech/)。アカウントAPI keysと各プロジェクトのDB接続情報を区別。 |
| Google Cloud | [Credentials](https://console.cloud.google.com/apis/credentials)、[Service accounts](https://console.cloud.google.com/iam-admin/serviceaccounts)。個人CLI認証とサービスアカウントキーを区別。 |
| 1Password | [紛失・盗難時の対応](https://support.1password.com/lost-device/)。端末の認可/セッションと、保管している各サービスの資格情報を区別。 |
| OpenAI/Codex | [API keys](https://platform.openai.com/api-keys)、ChatGPTのSettings > Security。APIキーとOAuthセッションを区別。 |
| Anthropic/Claude | [Console](https://console.anthropic.com/settings/keys)、ClaudeのSettings > Account。APIキーとClaude Codeのログインを区別。 |
| OpenClaw | 使用している各プロバイダの管理画面。認証ストアを表示せず、どの連携を再認可するかだけ列挙。 |

費用が必要なフォレンジックサービスや有料製品は、無料の既存設定と区別し費用がかかることを明記する。
