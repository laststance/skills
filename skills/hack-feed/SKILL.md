---
name: hack-feed
description: |
  OSS の深いハッカーニュースを収集して一件ずつ丁寧に解説する。
  JavaScript/React/Next.js の internals、TC39、V8、fiber/scheduler、
  transpilation、bytecode、memory model、JIT など
  "Secrets of the JavaScript Ninja" 級の好奇心トピックに特化。
  ToC 表示 → 番号指定 → Explain スキル級の深堀りの2フェーズ。

  Use when: "hack feed", "今日の hack", "ハッカーニュース",
  "OSS の深い話題", "React internals 最新", "JavaScript 深堀り",
  "/hack-feed 3,7" のような番号指定。

argument-hint: "[period: 24h|3d|week|month] or [numbers: 1,2,3] or [all]"
---

# hack-feed — OSS ハッカーニュース深堀り feed

OSS 界隈の深いトピック (React internals, V8, TC39, compiler, scheduler 等) を
Web 全体から収集し、**ToC → 番号指定 → Explain 風深堀り** の2フェーズで提示する。

## アーキテクチャ

- **Step1 (`/hack-feed [period]`)**: 構造化ソース (GitHub/HN/RSS) と Exa web search を
  hybrid で集めて、keyword scoring で10-15件に絞り、ToC を表示
- **Step2 (`/hack-feed N,M` or `/hack-feed all`)**: 前回の ToC から番号指定された記事を
  Explain skill 風に深堀り解説

## 出力言語

**日本語固定** (MVP)。技術用語は原語併記可 (例: "スケジューラ (scheduler)")。

---

## Phase 0: Argument Parsing

ユーザーが渡した引数を **period** と **numbers** に振り分ける。両者は独立で、
両方指定されていれば Step1 (collect) 実行後に Step2 (drill-down) も実行する。

### パース規則

| 引数パターン | 分類 | 例 |
|---|---|---|
| `^\d+[dhw]$` or `^(24h\|3d\|week\|month\|day)$` | period | `24h`, `3d`, `week`, `7d` |
| `^[\d,]+$` (カンマ区切り数字) | numbers | `3`, `3,7`, `1,2,5` |
| `^all$` | special (全件 drill-down) | `all` |
| その他 | error → help 表示 | `foo` |

### 実装手順

1. 引数を空白で分割 (最大2個想定)
2. 各トークンを上記正規表現で判定
3. period が無ければ default=`24h`
4. numbers があれば Step2 も実行、無ければ Step1 のみ
5. `all` が指定されれば Step2 で全件 drill-down

### ヘルプメッセージ (引数不正時)

```
❌ 不明な引数です。使い方:
  /hack-feed                     # 直近24h の ToC
  /hack-feed 3d                  # 直近3日
  /hack-feed week                # 直近1週
  /hack-feed month               # 直近1ヶ月
  /hack-feed 3                   # 既存 ToC の番号3を深堀り
  /hack-feed 3,7                 # 番号3と7を深堀り
  /hack-feed all                 # 既存 ToC 全件を深堀り
  /hack-feed week 3,7            # 1週間分を収集してから3,7を深堀り
```

---

## Phase 1: Collection

構造化ソース (bash script) と Web 検索 (Exa MCP) の2層で集める。

### Phase 1a: 構造化ソース (bash)

```bash
bash ~/.claude/skills/hack-feed/scripts/collect-structured.sh [period]
```

- 戻り値: 出力 JSON のパス (stdout)
- エラー: 非ゼロ exit code

読む: `~/.claude/data/tracked-engineers.json`, `~/.claude/skills/hack-feed/data/sources.json`
取得するもの: tracked engineers の GitHub PR/Issue (12名), HN Algolia (直近 period 内),
tier1 RSS feeds (v8/bun/webkit, 1h cache)
各 item には `source_kind` タグが付く: `tracked_user` / `tier1_rss` / `hn`

**エラー対応** (スクリプトは単一ソースのエラーで停止せず、失敗ソースを空配列にフォールバックして継続する設計):
- GitHub tracked_user items が全 engineer で 0件 → `gh` 認証失敗の可能性大 → `gh auth status` 実行をユーザーに促し、失敗なら `gh auth login` を案内
- 個別 engineer の rate limit / 5xx / 422 → 該当 engineer のみ空配列、ログ出力なしで継続 (他 engineer への影響なし)
- HN API timeout / 5xx → HN items 空配列で継続 (stderr ログなし)
- RSS feed timeout / 404 → 当該 feed のみ skip、他 feed は継続 (stderr ログなし)

### Phase 1b: Exa Web Search (MCP)

`~/.claude/skills/hack-feed/data/sources.json` の `.tier2_filter.exa_queries` を順に読み、各クエリで Exa を呼ぶ:

```
mcp__exa__web_search_exa({
  query: <各クエリ>,
  numResults: 10
})
```

結果の各 item に以下を付与:
- `source_kind: "exa"`
- `type: "web"`
- `author: null` (Exa は著者情報を持たないことが多い)
- `raw_excerpt` = Exa response の snippet (最大300字)

**エラー対応**:
- 個別クエリが 0件 → `⚠️ Exa "X" が 0件` を debug に記録、次のクエリへ
- Exa 全体が落ちている → `⚠️ Exa 層が利用不可` warning、Phase 1a の結果のみで継続

### Phase 1 終了時の状態

2つのソースを merge した in-memory JSON 配列 (構造化から ~47件 + Exa から ~30件 = ~77件候補)。
Phase 2 の入力となる。

---

## Phase 2: Scoring, Dedup, Rank

Phase 1 で集めた ~77件の候補を、top 10-15 に絞る。

### Phase 2a: Source Tier 判定

各 item の `source_kind` フィールドを見て、扱いと `source_tier` を決める:

| source_kind | 扱い | source_tier |
|---|---|---|
| `tracked_user` | **auto-pass** (scoring 無視で通過) | 1 |
| `tier1_rss` | auto-pass | 1 |
| `hn` | scoring 対象 | 2 |
| `exa` | scoring 対象 | 2 |

判定後、各 item に `source_tier` フィールドを追加する (Phase 2d の sort key, Phase 3b の badge 描画で使う)。

加えて、URL が `~/.claude/skills/hack-feed/data/sources.json` の `.tier3_reject.domains_blocklist` の
いずれかを含めば即座に reject。

### Phase 2b: Keyword Scoring (非 auto-pass のみ)

`~/.claude/skills/hack-feed/data/keywords.json` を使う:

```
score = Σ(positive_hit × weight) + Σ(negative_hit × weight)
```

1. `title + raw_excerpt` を小文字化
2. `keywords.json .positive.tier_a.words` の各単語でマッチ → `+10 × 回数`
3. `.positive.tier_b.words` の各単語でマッチ → `+5 × 回数`
4. `.negative.words` の各単語でマッチ → `-15 × 回数`
5. `score >= .pass_threshold` (= 5) なら通過、未満なら drop

### Phase 2c: Dedupe (merge + aggregate sources)

同一 item の検出ルール:

1. **URL 正規化**: `?utm_*` や trailing slash を除去、ホスト名を小文字化
2. 正規化後 URL が一致する items → 1件に merge
3. merge 時は `sources[]` 配列に各元 item の `{type, url, source_kind}` を記録

※ fuzzy title match (Jaro-Winkler) は MVP 対象外。将来拡張。

### Phase 2d: Rank

ソート順:
```
sort by (source_tier ASC, score DESC, published_at DESC)
```

- `source_tier`: tier1 = 1, tier2 = 2 (auto-pass items が先頭に来る)
- `score`: 大きいほど先 (auto-pass は score=inf 扱い)
- `published_at`: 新しいほど先

Top 15 を取る (候補が15未満なら全件)。Top 5 未満なら **"静かな1日"** (Phase 3 で special rendering)。

### Phase 2 終了時の状態

`toc` 配列 (最大15件)。各 item に `index` (1-base) を付与。Phase 3 の入力。

---

## Phase 3: ToC Render + State Write

### Phase 3a: State File Write (Atomic)

`~/.claude/cache/hack-feed/YYYY-MM-DD_HHMM.json` に書く:

```json
{
  "version": 1,
  "collected_at": "2026-04-09T10:32:00Z",
  "period": "24h",
  "toc": [
    {
      "index": 1,
      "title": "React Compiler が bailout を再設計",
      "one_liner": "memo 化を断念する条件が全面的に刷新された",
      "url": "https://github.com/facebook/react/pull/XXXXX",
      "sources": [
        {"type": "github", "url": "https://...", "source_kind": "tracked_user"}
      ],
      "source_tier": 1,
      "score": 100,
      "author": "sebmarkbage",
      "published_at": "2026-04-09T08:15:00Z",
      "raw_excerpt": "..."
    }
  ],
  "debug": {
    "candidates_total": 77,
    "tier1_autopass": 5,
    "tier2_passed": 10,
    "tier3_rejected": 3,
    "dedup_merged": 2
  }
}
```

**Atomic write 手順** (Write tool で `.tmp` ファイルに書き、Bash で mv):

1. `cache/hack-feed/` ディレクトリが無ければ作る: `mkdir -p ~/.claude/cache/hack-feed`
2. 日付時刻ファイル名生成: `YYYY-MM-DD_HHMM.json`
3. `.tmp` suffix 付きで先に書く
4. `mv` で rename (POSIX atomic)
5. `latest.json` symlink を更新: `ln -sf <filename> ~/.claude/cache/hack-feed/latest.json`

### Phase 3b: ToC Rendering (日本語 markdown)

画面出力フォーマット:

```markdown
# 🔥 hack-feed — 直近 [period]

[⚠️ warnings があればここに列挙]

1. **[タイトル日本語訳]** *by author* · tier1
   → [ソース1種別]: url
   → [ソース2種別]: url  (dedup merge された場合)

   一行サマリ (日本語)

2. **[タイトル]** ...

...

---
次は `/hack-feed 3,7` のように番号を指定するか、
`/hack-feed all` で全件を深堀りしてください。
```

**レンダリング規則**:
- `author` が null なら `*by author*` 部分を省略
- `source_tier` が 1 なら `tier1` バッジ、2 なら省略 (目立たせない)
- タイトルは原文が英語でも日本語訳して表示 (内容が伝わるように)
- `one_liner` は 30-50字目安
- 全15件を連続で表示 (ページング無し)

### 静かな1日の扱い

`toc.length < 5` の時:

```markdown
# 🔥 hack-feed — 直近 [period]

🌙 控えめな1日 (N件のみ)

[通常の ToC レンダリング]
```

`toc.length == 0` の時:

```markdown
# 🔥 hack-feed — 直近 [period]

📭 直近 [period] は静かでした。
`/hack-feed week` を試してみては?
```

両方の場合でも空 state を保存する (Step2 の区別用)。

---

## Phase 4: Drill-Down (Step2)

`/hack-feed N,M` or `/hack-feed all` 指定時に実行。**順次** (並列ではない)。

### Phase 4a: State Load

```
read ~/.claude/cache/hack-feed/latest.json
```

エラーハンドリング:

| 状況 | 対応 |
|---|---|
| latest.json が存在しない | `❌ state file なし。先に /hack-feed で収集してください` |
| latest.json が破損 | `.corrupted-YYYYMMDD` にリネーム、ユーザーに再収集促す |
| `toc.length == 0` | `❌ state は空です。/hack-feed week などで再収集してください` |

### Phase 4b: Number Lookup

```
indices = (numbers == "all") ? [1..toc.length] : parse(numbers)
target_items = []
for i in indices:
  if i < 1 or i > toc.length:
    print "⚠️ 番号 {i} は範囲外 ({toc.length}件中)"
    continue
  target_items.append(toc[i-1])  # 1-base → 0-base
```

### Phase 4c: Body Fetch (順次)

各 target item に対して:

```
switch item.sources[0].type:
  case "github":
    body = gh api /repos/<owner>/<repo>/pulls/<num>
           or /repos/<owner>/<repo>/issues/<num>
    (PR description + top 3 comments)
  case "rss":
    body = mcp__exa__web_fetch_exa({ url: item.url })
  case "hn":
    body = HN item.text (if present) + top 3 comments
  case "web" (= exa origin):
    body = mcp__exa__web_fetch_exa({ url: item.url })
  default:
    body = WebFetch(item.url)

if body fetch fails:
  body = item.raw_excerpt
  warn "⚠️ 本文取得失敗、ToC 要約のみで解説"
```

### Phase 4d: Explain Rendering

各 item を Explain skill の Phase 3-4 スタイルで解説:

```markdown
## [item.index]. [item.title]
[tier] · [source types csv] · score: [score or auto-pass]

[コンテキスト: 2-3文。何? なぜ存在?]

🤔 [コア解説: どう動く?]

🎯 [設計判断: なぜこう作った? どんな alternatives があった?]

⚡ [性能/トレードオフ: computational/memory/UX への影響]

📊 [品質/パターン: どんな設計原則に従う/違反する?]

💡 [接続: 広いシステムとの関係? 類似パターン?]

[関連 URL: if body refs code, use file:line format]

---
```

**サイズ規則**:
- 1件あたり 200-400字
- 🤔/🎯/⚡/📊/💡 マーカーは **全部書く必要はない** (該当しない視点は省略)
- コード snippet は必要に応じて引用 (body にあれば)
- 日本語、技術用語原語併記可

### `all` モード時の注意

`toc.length` 件を順次解説 → 最大 15 × 400字 = 6000字の長文出力。
これは意図した挙動 (ユーザーが明示的に all を選んだため)。

### Phase 4 終了

標準出力に全件を表示して終了。state file は変更しない (読むだけ)。
次回 `/hack-feed [period]` で再収集するまで同じ state を使う。

---

## 実行フロー概略

```
/hack-feed               → Phase 0 → Phase 1-3 (Step1 only)
/hack-feed 3,7           → Phase 0 → Phase 4 only (state 読込)
/hack-feed 3,7 week      → Phase 0 → Phase 1-3 → Phase 4
/hack-feed all           → Phase 0 → Phase 4 all
/hack-feed week all      → Phase 0 → Phase 1-3 → Phase 4 all
```
