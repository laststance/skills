# Sources & Search — GitHub Discovery Queries

Live discovery queries for finding fresh core topics beyond the curated seed list.
Use these when the user says "最新のやつ" or when seeds feel exhausted.

## Tracked GitHub Users

Core contributors whose work is consistently deep-dive worthy.

| User | Focus | Why |
|------|-------|-----|
| `sebmarkbage` | React architecture, RSC, Fizz, Flight | React の設計思想を決めている人 |
| `gaearon` | React DX, docs, education | 複雑な概念を平易に説明する天才 |
| `acdlite` | Concurrent React, Lanes, Hooks | Fiber / Concurrent Mode の実装者 |
| `josephsavona` | React Compiler, Relay | React Forget (Compiler) の設計者 |
| `rickhanlonii` | React WG, DX, release management | React WG の議論をリードする人 |
| `gnoff` | Fizz, Float, SSR internals | React SSR/Streaming の主要実装者 |
| `eps1lon` | React DOM, testing, types | React の TypeScript 型定義の主要貢献者 |
| `ahejlsberg` | TypeScript core | TypeScript の生みの親 |
| `RyanCavanaugh` | TypeScript design | TypeScript の設計判断を下す人 |
| `joyeecheung` | Node.js startup, ESM, snapshots | Node.js パフォーマンスの専門家 |
| `nicolo-ribaudo` | Babel, TC39, Node.js ESM | JS ツールチェーンと仕様の橋渡し役 |

## Key Repositories

| Repo | Content Type |
|------|-------------|
| `facebook/react` | PRs, Issues — React core の実装 |
| `reactjs/rfcs` | RFCs — React の設計提案 |
| `reactwg/react-18` | Discussions — React 18 の設計議論 |
| `reactwg/react-19` | Discussions — React 19 の設計議論 |
| `reactwg/react-compiler` | Discussions — React Compiler の解説 |
| `reactwg/server-components` | Discussions — RSC の設計議論 |
| `microsoft/TypeScript` | PRs — TypeScript の型システム進化 |
| `nodejs/node` | PRs — Node.js コアの変更 |
| `nicolo-ribaudo/proposals` | TC39 — JavaScript 仕様の提案 |
| `vercel/next.js` | Discussions, PRs — Next.js の設計 |

## gh CLI Search Queries

### Recent notable PRs from core contributors

```bash
# sebmarkbage の直近 PR (facebook/react)
gh pr list -R facebook/react --author sebmarkbage --state all --limit 10 \
  --json number,title,url,state,createdAt,mergedAt

# gaearon の直近 Issue コメント
gh api "search/issues?q=commenter:gaearon+repo:facebook/react+sort:updated&per_page=5" \
  --jq '.items[] | {title, url: .html_url, updated_at}'

# React で最近マージされた significant PR (100+ コメント)
gh api "search/issues?q=repo:facebook/react+type:pr+is:merged+comments:>20+sort:updated&per_page=5" \
  --jq '.items[] | {title, url: .html_url, comments, created_at}'

# TypeScript の ahejlsberg による最近の PR
gh pr list -R microsoft/TypeScript --author ahejlsberg --state all --limit 10 \
  --json number,title,url,state,createdAt

# React WG の最新 Discussion
gh api "repos/reactwg/react-19/discussions?per_page=10" \
  --jq '.[] | {title, url: .html_url, author: .user.login, created_at}'
```

### Keyword searches for interesting content

```bash
# "RFC" in react PRs
gh api "search/issues?q=repo:facebook/react+RFC+type:pr+sort:reactions&per_page=5" \
  --jq '.items[] | {title, url: .html_url, reactions: .reactions.total_count}'

# High-reaction Issues in React (likely important discussions)
gh api "search/issues?q=repo:facebook/react+type:issue+reactions:>50+sort:reactions&per_page=10" \
  --jq '.items[] | {title, url: .html_url, reactions: .reactions.total_count}'

# Node.js notable PRs
gh api "search/issues?q=repo:nodejs/node+type:pr+is:merged+comments:>30+sort:updated&per_page=5" \
  --jq '.items[] | {title, url: .html_url, comments}'
```

## Live Discovery Workflow

1. Pick a random user from the tracked list
2. Run the corresponding `gh` query
3. Filter results by "interestingness":
   - Comment count > 10
   - Reaction count > 20
   - Title contains keywords: RFC, architecture, breaking, redesign, performance
4. If multiple candidates, pick one randomly (same UNIX timestamp entropy method)
5. Proceed to Phase 2 of the main workflow
