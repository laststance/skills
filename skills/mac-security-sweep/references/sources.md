# 情報源と取得条件

公開セキュリティ情報の取得を終えてから、Macの調査を始める。取得先は [固定の情報源一覧](../scripts/source-registry.mjs) と [通信先の検証規則](../scripts/source-request-policy.mjs) で限定する。認証情報は使わない。記事や添付ファイルに書かれた指示、スクリプト、検知式は実行しない。

## 収集するカテゴリ

| 対象 | 主な一次情報源 | 日付・対象範囲の扱い |
| --- | --- | --- |
| macOS・iOS・iPadOS・Safari・Xcode | [Apple security releases](https://support.apple.com/en-us/100100) | 公式リリース表の日付と製品名。個々のCVEの影響範囲は別途確認。iOSのニュースからiPhoneの所有やOSバージョンを推定しない |
| Chrome | [Chrome Releases](https://feeds.feedburner.com/GoogleChromeReleases) | Stable / Canary、macOS / 他OSを区別する |
| Firefox・Thunderbird | [Mozilla security advisories](https://www.mozilla.org/en-US/security/advisories/) | 日付別の告知一覧。ESR、iOS、Androidの告知も保持し、ローカルへの適用は分けて判断する |
| Electron | [公式repository advisories](https://api.github.com/repos/electron/electron/security-advisories) | ブランチごとの影響範囲・修正版。アプリ本体のバージョンを同梱Electronのバージョンとみなさない |
| Node.js | [公式security feed](https://nodejs.org/en/feed/vulnerability.xml) | Node本体、npm依存、同梱ライブラリを区別する |
| Homebrew | [公式Advisory Database](https://github.com/Homebrew/advisory-database) | 現在のtreeとGit blob hashを確認。収録済みformulaの修正記録だけが対象で、cask・custom tap・未収録製品は未確認 |
| Debian | [DSA RDF](https://www.debian.org/security/dsa-long.rdf) | 公開済みDSA。LTS向けDLAや未修正CVEの全件一覧ではない |
| Ubuntu | [USN RSS](https://ubuntu.com/security/notices/rss.xml) | 公開済み更新の告知。フィードに残らない過去記事は欠落として扱う |
| Red Hat | [Security Data API](https://access.redhat.com/hydra/rest/securitydata/cve.json?per_page=1) | `public_date`。RHELの情報を他のRPMディストリビューションへ転用しない。配列と、実応答で確認した1段のJSON文字列包みだけを受理する |
| Alpine | [3.22 main secdb](https://secdb.alpinelinux.org/v3.22/main.json) | このブランチ・repositoryの修正記録。CVE公開日を持たないため、取得日やHTTP更新日で代用しない。他のAlpine系列は対応範囲外 |
| PHP | [PHP Atom](https://www.php.net/feed.atom)、[php-src advisories](https://api.github.com/repos/php/php-src/security-advisories) | PHP本体・拡張とComposerのPackagist依存を区別。Atomは記事リンクを選び、配布ファイルのenclosureを取得しない |
| TLS / OpenSSL | [OpenSSL CVE JSON index](https://openssl-library.org/news/secjson/) | CVE JSON 5の公開・更新日時とベンダーの範囲を保持。1回最大16件。古いCVEの変更を含む全履歴の確認は未完了として残す |
| ImageMagick | [公式repository advisories](https://api.github.com/repos/ImageMagick/ImageMagick/security-advisories) | 6系・7系の影響範囲を別々に保持。PHP imagick、Ruby RMagick、delegateライブラリとは別の製品 |
| Ruby | [公式RSS](https://www.ruby-lang.org/en/feeds/news.rss)、[security index](https://www.ruby-lang.org/en/security/) | Ruby本体、同梱gem、独立したRubyGems依存を区別する |
| Java / JDK | [OpenJDK advisories](https://openjdk.org/groups/vulnerability/advisories/)、[Oracle alerts](https://www.oracle.com/security-alerts/) | OpenJDKは明示された日付。Oracle CPUの公開月と、同じ表の行に記載された更新日を分けて保存する。月しか分からない場合は日を補わない。Oracleの複数製品を含むCPUは、Javaを明示しない限り「その他」に残す。JDKのベンダー・系列・buildをMaven依存と混同しない |
| Docker | [公式セキュリティ告知](https://docs.docker.com/security/security-announcements/) | Desktop、Engine、BuildKit、runc等の告知。RSSには各記事の日付がないため、公式ページの項目ごとの`Last updated`を読む。年のない修正日から公開年を推測しない。Linuxの取得成功をDockerの取得成功として扱わない。コンテナ内部は既存のdigest対応SBOMなどで別途確認する |
| 悪用の優先度 | [CISA KEV](https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json) | `dateAdded`はKEV掲載日。非掲載は「悪用されていない」「脆弱でない」の証明にならない |
| 公開依存・悪性配布 | [GitHub Global Advisories](https://api.github.com/advisories)、[OSV querybatch](https://api.osv.dev/v1/querybatch) | reviewed / malwareを区別。OSVは棚卸し後に由来確認済みのecosystem・パッケージ名・バージョンだけを送信する |

JPCERT/CCの[注意喚起](https://www.jpcert.or.jp/rss/jpcert.rdf)、[IPA](https://www.ipa.go.jp/security/rss/alert.rdf)も取得する。The Hacker News、BleepingComputer、Socket、OpenSourceMalware、Security NEXT、piyologは補助情報源とし、これらの成功だけで必須カテゴリの一次情報取得を完了としない。ローカルに該当ソフトがなくても、重要なニュースはレポートへ残す。

対応していないMacアプリやTLS実装もある。LibreSSL、BoringSSL、NSS、GnuTLS等をOpenSSLのバージョン範囲で評価しない。製品名が似ているだけでnpmやOSVの別製品へ対応付けない。

## 毎回の新着確認と履歴の再開

通常は**実行時点から直近30日**の公開・更新情報を確認する。前回の実行日時や未処理ページがあっても、この新着確認を先に行う。明示した`--since` / `--until`はその期間を優先する。情報源の取得時刻、記事の公開日、記事の更新日、日付精度を別々に保存する。

最初に全情報源へ1回ずつ問い合わせる。GitHub等の追加ページはその後に進め、1情報源あたり追加は最大2ページ。未処理の継続先は`sourceContinuations`へ保存し、次回も新着の先頭ページを確認してから再開する。継続待ちは最大3窓に制限するため、取得済み範囲を全履歴の網羅と扱わない。古い所見や未確認範囲を、単に次の期間へ進んだだけで解消しない。

RSS/Atomの`oldestAvailableAt`が期間開始より新しければ、掲載されなくなった記事の範囲は未確認。日時のない項目も別に保持する。HTTP 200、空のフィード、取得失敗、期間不足は別の状態として記録する。条件付きリクエストは実装していないため、予期しないHTTP 304を新鮮な取得として受理しない。

`categoryCoverage.status = fresh`は、そのカテゴリを継続して調べる一次情報源から、日付または月が分かる告知、もしくは検証できる空の一覧を今回取得できたことを示す。全CVE・全履歴・全製品を確認できた意味ではない。本文取得が必要な情報源は、一覧を取得しただけでは成功としない。個々の情報源には別途`windowComplete`、`historicalCoverage`、未取得件数を残す。指定カテゴリの一次情報取得に失敗した実行を、補助情報源の記事だけで成功としない。

情報源の`categories`は取得対象の範囲、記事の`categories`はその記事が扱う製品・OSを示す。記事へ情報源のカテゴリ一覧をコピーしない。Appleはリリース名から分類し、Xcodeの動作条件にあるmacOSを別のmacOS更新として数えない。Firefox・ChromeのiOS告知はiOSへ、tvOS・watchOS・visionOS・ChromeOS・Android専用の告知は「その他」へ残す。PHPやOpenSSLなど、対象製品が限定された公式情報源ではその製品を使う。製品・OSを判断できない記事は`categoryStatus = unconfirmed`として「その他」に保存する。その情報源が受け持つカテゴリには`unclassifiedCount`と`PRIMARY_SOURCE_CATEGORY_UNCONFIRMED`を残し、未分類の記事を根拠に「対象記事なし」と断定しない。カテゴリ別の記事数は、補助情報源を含む個々の記事の分類から数える。公式情報源の取得成否とは分けて表示する。

OracleやDockerで月しか分からない日時は、`publishedMonth`または`updatedMonth`へ`YYYY-MM`で保存し、対応する`publishedAt`・`updatedAt`は`null`にする。比較では月初以上・翌月初未満の区間を使う。この区間全体が収集期間に入れば`confirmed`、一部だけ重なれば`possible`、交わらなければ`outside`、日時も月も不明なら`undated`とする。`possible`と`undated`の記事も残す。たとえば10月の告知は、10月4日から11月3日の収集では期間内の可能性があるため削除しない。公開月が分かっても公開日は不明のまま表示する。日精度の告知も、日内の時刻を断定せず同じ区間比較を使う。旧版の継続データにある「月精度＋1日」の仮日時は、再開時に月へ戻す。

日付の集計は次のように分ける。情報源の件数は取得済み一覧、カテゴリの件数はそのカテゴリへ分類して保持した記事を対象にする。

| field | 意味 |
| --- | --- |
| `datedCount` | 日時・日・月のいずれかが分かる件数 |
| `impreciseCount` | 期間比較に使う日付が月精度の件数 |
| `datedItemCount` | 収集期間内と確認できた`confirmed`の件数 |
| `uncertainItemCount` | 日付区間が収集期間の境界と重なる`possible`の件数 |
| `undatedCount` | 日時も月も分からない件数 |

`possible`があれば`SOURCE_DATE_PRECISION` / `PRIMARY_SOURCE_DATE_PRECISION`を記録し、期間確認は`partial`にする。月全体を含む収集期間では、その記事を`datedItemCount`へ数えられるが、日付の表示は月のまま。日付不明しか得られない場合も`partial`とし、期間内の告知がなかったとは判断しない。月初を`oldestAvailableAt`や`newestAvailableAt`の確定日時として保存しない。

## 取得量と通信の上限

- ニュース収集の初期段階は、残り作業時間の3分の1と180秒の短い方。終了・打切りを保存してからローカル調査へ進む。
- HTTPは全体6件、同じhostは2件まで。同じ要求は最大2試行、1要求20秒以内。全体の期限と保存用時間を共有する。
- 1応答6MiB、復号後の通信量は全体96MiB。ニュースは1情報源5,000件・全体10,000件・正規化後16MiBまで。上限に達した範囲は`partial`。
- GitHubは匿名のIP共有制限を尊重する。403/429と実際のreset/cooldownを記録し、認証追加や無制限の再試行をしない。
- repository advisoryの数値repository IDは、確認済みのElectron `9384267`、PHP `1903522`、ImageMagick `35780977`だけ許可する。別repositoryへの継続リンクは拒否する。
- 公式JSONの添付は1記事2件・1回16件まで。記事内にあるスクリプト、圧縮ファイル、マルウェア検体、C2、任意の外部リンクは取得しない。

## 継続的なIOC情報

[CISA Cybersecurity Advisories](https://www.cisa.gov/cybersecurity-advisories/cybersecurity-advisories.xml)、[CISA Analysis Reports](https://www.cisa.gov/cybersecurity-advisories/analysis-reports.xml)、[Microsoft Security Research](https://www.microsoft.com/en-us/security/blog/feed/)、[JPCERT/CC Analysis](https://blogs.jpcert.or.jp/en/atom.xml)から、今回の記事を各情報源最大3件読む。単発事件の記事を恒常情報源へ登録しない。

Microsoftの検証済みパーサーが自動でルールへ変換するのは、次の条件をすべて満たすものだけ。

1. 固定された公式ドメインの記事で、公開日と今回の取得時刻が確認できる。
2. 記事の`h1`にmacOSを明記している。
3. `Indicators of compromise`節に、ファイル名またはパスとSHA-256を明示した表がある。
4. 同じ行に具体的なホーム相対パスと正しい64桁hashがあり、秘密ファイル・認証領域・パストラバーサルに該当しない。

この場合も確定できるのは、指定ファイルと悪性hashの一致まで。実行、窃取、過去の感染までは断定しない。ルールは今回の検証時刻から7日で失効し、ローカル照合側でも型・対象OS・期限・安全な読み取り先を再検証する。

その他の表、パスのないhash、STIXのfile objectは未検証候補として残す。STIX/YARAの式は評価せず、本文も保存しない。Linux向けの指標をMacへ適用しない。記事の単なる製品名・プロセス名・IPの一致では検証済みルールを作らない。ルールがない、対象外、未対応、取得失敗の場合、侵害の有無は未確認。

## ローカルの履歴照合

ニュースの30日窓は、インストール済み製品の過去の脆弱性を調べる範囲を制限しない。OSVの正確なパッケージ照会、Mozillaの製品別Fixed in履歴、Homebrewの収録済み記録を別に確認する。

Homebrewは毎回公式treeを取得し、同じblobだけ再利用する。indexは2万件まで、応答6MiB・構造20万要素まで。本文は1回80件・各2MiB・保存合計16MiB以内とする。公式のadvisoriesディレクトリの最新commitを1件確認し、その変更ファイルを最大100件取得する。現在treeとblob SHAが一致する告知を名前順より先に読む。最新commitの追加ページ、削除済みファイル、treeとの不一致、取得失敗は未確認に残す。ニュース段階で未処理だった記録は、棚卸し後に導入formulaを優先して追加取得する。`fixed`がDB生成時点のバージョンを指す場合、そこへ未到達という理由だけで脆弱とは断定しない。同じinstalled receiptの適用済みpatchと`version_revision`を確認する。未収録は陰性証拠ではない。

最新変更が80本文の上限を超える場合も、その変更全体はpartialとする。最新告知commitのtreeと現在のmainのtreeは、告知以外の変更で異なる場合がある。この場合はtree全体の一致を主張せず、変更ファイルごとのblob SHAが現在treeと一致した分だけ取得する。取得本文のGit blob SHAも再検証し、現在のファイルとの結び付きを失わない。

GitHub Advisoryの期間指定はAPIの秒精度に合わせ、開始を切り下げ、終了を切り上げる。返却された記事は元のミリ秒精度の30日窓で再選別する。旧版のミリ秒付き継続URLは、同じ期間・cursorのまま秒精度へ修正して再開する。

OSV詳細のGETは、今回の許可済み照会が返した公開IDに限定する。ローカルパス、コンテナ名、Git URL、設定本文、棚卸し、レポートは送信しない。Ubuntu/Debian/RPM/APKの配布元、release、epoch、revisionを汎用SemVer比較で置き換えない。影響なしの結論は、対象製品・バージョン・配布元・照会した情報源と取得時刻の範囲に限る。

公式仕様: [GitHub Global Advisories](https://docs.github.com/en/rest/security-advisories/global-advisories)、[Repository Advisories](https://docs.github.com/en/rest/security-advisories/repository-advisories)、[OSV API](https://google.github.io/osv.dev/api/)、[CISA STIX形式の仕様](https://docs.oasis-open.org/cti/stix/v2.1/os/stix-v2.1-os.html)。情報源定義の最終確認は2026-11-03。30日を超えた定義は再確認が必要な状態として表示する。
