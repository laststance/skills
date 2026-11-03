# 検証記録

## 2026-11-04：ニュースを先に取得する改修

通信禁止preload付きの全回帰 **414件が成功**した。失敗・skipともに0。既存の299件を含め、ニュース取得と保存の後に棚卸しが始まる順序、途中停止、過去の陽性の保持、配布元ごとの判定、私有profile、日本語・英語の表示、翻訳の保存を確認した。通常の保存15境界に加え、翻訳の保存6境界でも検証用プロセスを強制終了し、原文と状態を保った復旧を確認した。

新しい公式情報源は実際の応答本文でもschemaを検証した。Red HatのJSON文字列による応答と、AppleのHTMLにある余分な閉じタグに対応した。Dockerの公式RSSは24件とも記事の日付がなかったため、日付を確認できる公式告知ページを使用する。確認した24件中12件は日付不明で、期間内の記事数とは分ける。日付不明や取得上限を「記事なし」「全履歴確認済み」に変換しない。

実機評価で見つかったHomebrewのindex件数超過と、GitHub Advisoryの日時検索の拒否も修正した。Homebrewは2万件の有限indexと既存の容量制限を維持し、最新commitの変更ファイルを現在のblob SHAへ結び付けて先に取得する。実取得では15,979件のindex、最新63変更、更新日が2026-11-02の本文を確認した。GitHubは秒精度で取得して元の正確な期間へ絞り込み、reviewed・malwareとも実APIの200応答を確認した。

公開例は実際のrendererと保存処理を通した合成データ4種。日本語の完了・部分取得・陽性と部分取得、および英語の陽性と部分取得を含む。実Macの棚卸しや所見は公開例に含まない。

解説HTMLと49.4秒のMP4を更新し、操作動画と書き出し後のフレームを確認した。画面幅320／768／1440、CSSによる200%拡大、長い文字列、キーボード操作、縮小モーション、再生・一時停止・再開を検証した。本文16px、ボタン高49.18px以上、フォーカス枠3px、静止時の文字コントラスト4.5:1以上。非表示時の停止はhiddenイベントの再現による試験であり、実OSのタブ切替による検証とは区別する。ユーザーのChromeプロファイルは使用していない。

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
