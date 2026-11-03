# 検証記録

## 2026-11-04：ニュースを先に取得する改修

通信禁止preload付きの全回帰 **464件が成功**した。失敗・skipともに0。既存の299件を含め、ニュース取得と保存の後に棚卸しが始まる順序、途中停止、過去の陽性の保持、配布元ごとの判定、私有profile、日本語・英語の表示、翻訳の保存を確認した。通常の保存15境界に加え、翻訳の保存6境界でも検証用プロセスを強制終了し、原文と状態を保った復旧を確認した。

新しい公式情報源は実際の応答本文でもschemaを検証した。Red HatのJSON文字列による応答と、AppleのHTMLにある余分な閉じタグに対応した。Dockerの公式RSSは最初の確認で24件とも記事の日付がなかったため、日付を確認できる公式告知ページを使用する。月まで分かる記事は年月を保持し、月初を公開日とは扱わない。収集期間との境界が曖昧な記事と、日付不明の記事は確定件数から分ける。日付不明や取得上限を「記事なし」「全履歴確認済み」に変換しない。

独立した最終レビューで、月単位の日付の欠落、情報源の対象カテゴリを全記事へ付ける誤分類、翻訳先の相対リンク切れ、IOCの未確認結果の誤表示、英語説明からの制約の欠落が見つかった。修正後、公式Apple一覧の13記事がmacOS 3件・iOS 4件・Macアプリ2件・その他4件へ分かれることを実本文で確認した。翻訳は原文と同じ世代ディレクトリへ別名で保存し、実際の保存先から証拠リンクが解決することを検証する。権限拒否や部分取得のIOCは未確認のまま表示し、英語でもTCPのみ・履歴未確認・公証検証の限界などを残す。

再レビューで見つかった、取得一覧全体の件数を保存対象の件数として説明する誤りも修正した。情報源ごとの説明では期間外を含む一覧全体の集計だと明示する。カテゴリの0件表示は取得済み範囲に限定し、収集期間全体の確認が未完了なら同じ行に併記する。翻訳では固有名詞を保持し、レポート自身の説明や表ラベルに訳し残しがないことも確認する。

実機評価で見つかったHomebrewのindex件数超過と、GitHub Advisoryの日時検索の拒否も修正した。Homebrewは2万件の有限indexと既存の容量制限を維持し、最新commitの変更ファイルを現在のblob SHAへ結び付けて先に取得する。実取得では15,979件のindex、最新63変更、更新日が2026-11-02の本文を確認した。GitHubは秒精度で取得して元の正確な期間へ絞り込み、reviewed・malwareとも実APIの200応答を確認した。

多数の依存記録がある場合も、1ページ15,000件の上限内で照会し、次回へ続けるようにした。照会・告知詳細が未完了なら同じページを保持し、前ページの陽性を処理対象から外れただけで解消しない。pnpm 12の2文書構成とuvの複数行条件式にも対応した。実ロックファイル87個を通信なし・照会応答差替えで検証し、4ページで全ファイルを処理した。これは構文と継続処理の検証であり、実APIによる脆弱性照合とは区別する。pnpmの別registry revisionや由来不明の依存は未確認として外部照会から除外する。

証拠JSONは全fieldを保持したまま字下げを省き、保存時の膨張を抑えた。字下げ付きで44.7 MBになる合成証拠を21.7 MBで保存・再開し、全記録の一致を確認した。旧形式も元のhashで検証する。32 MiB・構造200万要素の上限は維持し、内容自体が上限を超えた場合は前の保存済み世代を守って拒否する。全入力や任意件数の陽性を保存できるという保証ではない。

実レポートの確認で、取り下げ済み告知の優先表示、関連ニュースが多い場合の世界的な悪用情報の埋没、XcodeをmacOSと呼ぶ英語説明、英語JSON診断への日本語混入を修正した。日英で取り下げを明示し、重要ニュース5件の枠に関連製品と世界的な悪用・重大情報の両方を残す回帰を追加した。インストール済みと確認した結果を、同じ行で未確認とは説明しない。

公開例は実際のrendererと保存処理を通した合成データ4種。日本語の完了・部分取得・陽性と部分取得、および英語の陽性と部分取得を含む。実Macの棚卸しや所見は公開例に含まない。

解説HTMLと49.4秒のMP4を更新し、操作動画と書き出し後のフレームを確認した。画面幅320／768／1440、CSSによる200%拡大、長い文字列、キーボード操作、縮小モーション、再生・一時停止・再開を検証した。本文16px、ボタン高49.18px以上、フォーカス枠3px、静止時の文字コントラスト4.5:1以上。非表示時の停止はhiddenイベントの再現による試験であり、実OSのタブ切替による検証とは区別する。ユーザーのChromeプロファイルは使用していない。

## 3モデルによる独立した実Mac評価

実行コード `af1831d6ec13443182a171a3ef8ef8a2d57536a8` を固定し、同じ実Mac・走査設定で、私有profileを分けて順番に実行した。ニュースや棚卸しの結果は共有していない。モデル名は実際の起動指定と実行記録で確認した。修正前の実行や、GitHubの取得制限で必須カテゴリが欠けた実行は最終合格へ含めず、制限解除を待って取得からやり直した。

| 実行モデル | レポート言語 | 最初の保存 | 走査終了 | 必須11カテゴリの最新応答 | 検出・限定した対象外判定 |
|---|---|---:|---:|---|---|
| gpt-6-astra | 日本語 | 18.5秒 | 82.2秒 | 全カテゴリで確認 | 実証した範囲で合格 |
| gpt-6.1-sol | 英語 | 13.6秒 | 69.9秒 | 全カテゴリで確認 | 実証した範囲で合格 |
| gpt-6.1-terra | スペイン語 | 14.7秒 | 70.1秒 | 全カテゴリで確認 | 実証した範囲で合格 |

表の時間は走査開始から計測した。翻訳と独立レビューの時間は含まない。3回とも、ニュース取得・保存がローカル調査より先に完了した。実際に存在するパッケージの対象バージョンとの一致と、製品・バージョン・告知・出典・時刻を限定した対象外判定を確認した。最終世代のhashと私有権限、既存の既定stateが変わっていないことも照合した。

スペイン語は英語の原文を保ち、同じ世代ディレクトリへ別名で保存した。固有名詞、記事の原題、見出し・表ラベル、判定と未確認範囲を原文と照合し、最後に見つかった訳し残しと原題の部分翻訳は翻訳だけを再確定して修正した。完成稿の9か所の証拠リンクは、同じ実在ファイルへ解決する。旧訳文・原文・走査状態は保持した。

**独立した敵対的レビュー3件が、最終実装と実機証拠を確認してすべてPASS。** 情報源・日時・カテゴリ、安全境界・保存・未知の保持、翻訳・配信・動画を確認した。先行レビューの不合格理由を消さず、修正後の再現試験と新しい実機結果で解消を確認した。公開用には合成例だけを保存し、実Macのレポートと証拠は私有領域に保持している。

**3回とも収集状態はpartial、終了値は2。** 保留ページ・未取得の告知詳細・未対応の調査対象を残している。最新の公式応答を得たことは、全履歴の取得完了とは異なる。OpenSSLの0件は取得済み範囲での確認件数で、期間全体の未確認を同じ行に示す。適用可能な検証済みIOCがないため、侵害がないとは判断していない。3モデル・1台での再現結果であり、あらゆるモデル・Macの動作や無脆弱性を保証しない。

## 2026-11-03：前回の検証記録

以下はニュース優先化前の実装に対する記録。299件の回帰と限定smokeは当時の結果であり、今回の実Mac検証を代用しない。さらに前の版は `51005b68bad3f0f87462448c553d5d1dbd4d31ff` 内のスキルで、変更前の92テストを保存したうえで改修した。実行・公開の成功を、Mac全体の安全や全ソフトへの対応と読み替えない。

## 変更と回帰の対応

| 指摘 | 修正した動作 | 主な回帰ファイル |
|---|---|---|
| F01 私有依存の外部送信 | record単位の由来、曖昧な構文の拒否、private/Git/localとglobal例外の分離、FDを束縛したoffline scanner | [formats](../tests/package-formats.test.mjs)、[scan](../tests/scan-packages.test.mjs)、[境界](../tests/foundation.test.mjs) |
| F02 root境界 | case・祖先リンク・FD同一性・認証本文禁止・macOS statによるdataless防護（合成対象で検証） | [discovery](../tests/discovery.test.mjs)、[境界](../tests/foundation.test.mjs) |
| F03 他Macの配置 | Intel/arm/customの固定ツール候補、短いPATH、実行環境の秘密除外 | [境界](../tests/foundation.test.mjs)、[reader](../tests/environment-readers.test.mjs) |
| F04 探索欠落 | 不在をcompleteにしない、有限frontier、page ack、深さ上限の持越し、root変更時の再発見 | [discovery](../tests/discovery.test.mjs)、[複合再開](../tests/compound-continuation.test.mjs) |
| F05 形式/識別子 | 能力registry、全必須形式のexact名・版・由来、Maven colon、Bun binary/Swift照会の明示除外 | [formats](../tests/package-formats.test.mjs)、[discovery](../tests/discovery.test.mjs) |
| F06 Homebrew | 公式DBのsnapshot検証、formula/revision/tap/patchの区別、未収録/caskをunknown | [Homebrew](../tests/homebrew-advisories.test.mjs) |
| F07 ページ/詳細 | query単位token・24時間のidentity・全ページ陽性保持、詳細未完了時のcycle維持 | [pagination](../tests/package-pagination.test.mjs)、[details](../tests/advisory-details.test.mjs)、[複合再開](../tests/compound-continuation.test.mjs) |
| F08 適応情報源 | 共通feed後の製品baseline、新規/旧版/期限切れの別管理、概要言及を確認候補に保持 | [sources](../tests/source-baselines.test.mjs)、[assessment](../tests/assessment-hardening.test.mjs) |
| F09 reader不足 | 下記19 family、enabled/registered/実物/稼働を分離、拒否・上限・不正由来を未確認に保持 | [reader](../tests/environment-readers.test.mjs)、[IOC](../tests/check-iocs.test.mjs) |
| F10 severity/alias | 元方式を残す、未計算vectorをLOWより安全扱いしない、aliasだけを推移結合、対象数を別計数 | [assessment](../tests/assessment-hardening.test.mjs)、[match](../tests/match.test.mjs) |
| F11 並列/耐中断 | 共有pool・monotonic期限・cooldown・子孫回収、排他、commit→state、再開時のhash照合 | [境界](../tests/foundation.test.mjs)、[state](../tests/state-store.test.mjs)、[E2E](../tests/runner-e2e.test.mjs) |

初回レビューの10再現も同じ契約へ対応する。1=既定root不在、2=Library symlink、3=新lock形式、4=Maven名、5=ページ継続、6=CVSS vector、7=Firefox概要、8=Homebrew関連付け、9=alias、10=Composer private Git。欠陥が存在したことをassertする旧probeを「修正後成功」とは数えず、上表の修正後期待値を使う。

## reader familyの受入範囲

共通の不在試験、秘密canary、権限拒否・不正schema試験も各readerの入口を通す。以下は実物のprofileを集めた結果ではなく、架空home内の実ファイルと注入したOS応答による回帰である。[reader試験](../tests/environment-readers.test.mjs)、[IOC試験](../tests/check-iocs.test.mjs)

| family | positiveと対になる失敗・保護ケース |
|---|---|
| Chrome/Canary/Edge/Brave | manifest/選択版、有効版不明、残存旧版、不正/拒否、認証field破棄 |
| Firefox | profiles.ini/addons、無効化、不正profile、拒否、2001件上限 |
| Safari | .appex plist、有効状態unknown、不正/拒否、canary |
| VS Code/Cursor/Insiders | 登録版/残存版、登録と有効状態の分離、manifest不正/拒否 |
| Portable/custom editor | 指定root、未知editor、リンク先未読、不在/拒否 |
| Applications | plist射影、追加root、不正/拒否、アプリ非起動 |
| 同梱Electron/Node/Chromium | 静的版、metadata不在/不正/拒否、componentごとのunknown |
| 署名・公証 | 表示/既存ticket、不在/command失敗、オンラインassessなし |
| nvm/fnm/Volta/asdf/mise/Vite+/Homebrew | 各layout/header、Volta npm/Yarn/pnpm、版不正/拒否、globalリンク |
| uv/pipx/conda/project venv | 各layout/METADATA、direct_url不正/拒否で送信除外、importなし |
| Java/Ruby | release/rbconfig literal、架空headerを使わない、動的gemspec非評価、不正/拒否 |
| MCP/project/VS Code | JSON/JSONC、project root、不正/拒否、env/args/URL破棄、件数上限 |
| Cloud | 設定の存在metadata、credential本文openなし、拒否/不在 |
| Docker/OrbStack | 全許可local socket、image/稼働ID、remote拒否、名称/env破棄 |
| CycloneDX/SPDX | 現在のimage digest束縛、unbound/private混在/非標準port拒否、容量上限 |
| Launch/background | plist/静的fallback、個別失敗の集約、raw argv破棄 |
| cron/shell hooks | cron行数/shell存在のみ、不在/拒否、本文非保存 |
| OS保護 | XProtect/Gatekeeper/SIP/FileVault/Firewall、無効と不明の区別、不正/拒否 |
| IOC | 期限/source/selector、path/process/hash、対象未確認/適用不能/深さ制限、弱いIP一致 |

## 統合・機密・停止

公開用stagingの同一コードで、通信禁止preload付き全回帰299件が成功した（失敗・skipともに0）。外部fetch/http/https/net/tls/dns/undiciは遮断し、fixture応答だけを使う。実macOSの固定statとplutil、隔離childの強制終了は別途実行する。

- CP01–09（由来/全形式/探索/ツール/ページ/情報源/Homebrew/reader/判定）は上表の各試験に対応。
- CP10/EC02–03：command≤4、scanner≤2、HTTP≤6、host≤2を計測。429と複合継続で4 lock/8 detailを完走。10倍の固定探索対象も欠落しない。時刻変更・終わらない本文・遅い子孫を中止。
- CP11/EC04–05：実childを15保存境界でkillし再開。2プロセス排他、owner不明、PID再利用、hash不一致、書込/rename失敗、32MiB内の大きなsnapshotを確認。
- CP12：三つの保存済みreport、state、receiptと終了値の一致。usage64、busy75、fatal1、helpはscanなし。
- CP13/EC01/EC06–10：FIFO/リンク/差替え、空/拒否/429、混在由来、alias/withdrawn、IOC不正、stage再入、閉じたstdin、全出力のsecret canaryを確認。
- 私有stateの未知キーは元stateだけに残し、継続snapshotへ複製しない。既知fieldの不正型は作業前に拒否し、正常なGitHub修正版文字列は保存・再開できる。
- 方針除外だけのprivate/Git/localとunknown-global opt-outはcomplete-with-exclusions、unknown/invalidはpartial。opt-outでも由来unknownをprivateへ書き換えない。単独scan CLIの終了値も同じ分類に従う。

次の例はE2Eと同じ合成入力を実際のrenderer・保存処理へ通したMarkdown。**実Macの監査結果ではない**。

- [完了・一致なし](examples/complete/report.md)：終了0、所見0。
- [部分取得・一致なし](examples/partial/report.md)：終了2、所見0、未確認を明示。
- [陽性と部分取得](examples/positive-partial/report.md)：終了2、合成告知1件。侵害と断定しない。

## 実Macと実ツール

macOS 27.2 build 26B123、arm64、Node 24.22.1で確認。限定smokeはシステム側アプリ146件、OS/process metadataと公開ニュース203件を収集し、61.13秒で部分レポートを保存した。既存監査stateのidentityは前後一致、stderrは0 bytes。実ユーザーのprofile・project rootは含めず、隔離homeを使い、由来不明global照会を無効化した。固定の匿名公開情報源へ実通信した。

GitHub Advisory 2種は取得失敗、RSSの履歴不足なども残り、run/collection/queryはすべてpartial、侵害は未確認。実測peakはcommand4、HTTP4、host2、scanner0。完了した収集と未確認範囲を分けている。

文書読取→隔離設定→実行→レポート冒頭/coverage確認の自動通し時計は61.14秒。人の理解・設定作業時間は測定していないため、利用者の初回5分目標の実証にはしない。

既存OSV-Scanner 2.7.0は合成Composer lockを検証済みFDからoffline/no-resolve/no-call-analysisで読み、2 record中公開1だけを照会候補にした。非公開Git recordは除外。HTTP0、DB/cache作成なし。DB未導入の終了127はpartialであり、scannerによる脆弱性照合の成功とはしていない。実plutilは合成binary plistをstdinから読取成功。実statは通常local fileで成功し、合成dataless祖先・flags取得不能では子stat/openが0。実cloudのevict/downloadは行っていない。

## 性能観測

同じMac/Node上で旧版と新版を交互に各5回。比較可能な静的npm由来抽出のみを測定し、探索・API・保存を含む全巡回の速度比較にはしない。各回はempty=1000、steady=20、pathological=5、10x=2反復の平均。p50/p95は5標本の記述値で、p95は最大値に相当する。計測段階のcommand/scanner/HTTP peakはすべて0。

| 入力 | bytes | 旧版 p50/p95 ms | 新版 p50/p95 ms | 旧/新 peak RSS MiB | 旧/新の公開record数 |
|---|---:|---:|---:|---:|---:|
| empty | 44 | 0.0011 / 0.0011 | 0.0046 / 0.0052 | 60.1 / 67.1 | 0 / 0 |
| steady | 17182 | 0.1735 / 0.1760 | 0.5084 / 0.5157 | 63.3 / 74.0 | 100 / 100 |
| pathological | 163214 | 1.4408 / 1.4941 | 4.3769 / 4.4632 | 65.7 / 77.1 | 250 / 250 |
| 10x-pathological | 1654214 | 12.9674 / 13.1059 | 37.6120 / 39.1787 | 90.0 / 118.4 | 2500 / 2500 |

新版の静的抽出は追加の構造・由来検証とrecord identity生成を行い、今回の入力では旧版より遅く、RSSも増えた。10,000 recordでp95約39.18ms、peak約118.4MiB。並列化による高速化は主張しない。実巡回の上限・継続と秘密保護は別の機能試験で確認した。

## 独立レビューとホスト

実装担当とは別の担当が、root基盤、package/source、environment/IOCを相互にレビューし、指摘を同じ合成入力で再現した。元のR/PS/EN指摘は修正後再現で解消。コードhashを記録し、後発の実Darwin dataless防護も別担当が確認した。

Codex/Claude Code/OpenClawで現SKILLと参照文書を読み、レビューだけではscanしない、未知はpartial、global例外/opt-out、秘密アップロード・修復命令拒否、実物/宣言/実行/侵害の分離を評価した。公開前のCodexはworkspaceの新版を自動発見した。Claude Codeの明示skill呼出しとOpenClawの通常agentは既存globalを発見し、新版は指定パスから別に読んだ。配布後のcanonical自動発見は配布receiptで別途確認し、旧globalの検出を新版の検出成功と数えない。ホスト/モデルのすべての版での動作保証ではない。

## 残る制限

- 別の物理Intel/Rosetta Mac、Node22、古いmacOSの実機は未確認。配置fixtureの成功を実機成功に数えない。
- 検出できる形式・製品・配置は有限。新schema、未知vendor、protected領域、未取得期間、削除済み履歴、到達性、実行・窃取は自動的に確認済みにならない。
- Nodeにopenat相当の原子的祖先探索はない。前後identity検証は行うが、敵対的な同一ユーザーやkernelの完全な封じ込めではない。
- 外部情報源の変更と期限を監視し、取得失敗を残す。RSS/更新表は全履歴や全CVEの影響開始版を保証しない。Homebrew DBの未収録/caskも安全とは扱わない。
