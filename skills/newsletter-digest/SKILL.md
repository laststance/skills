---
name: newsletter-digest
description: Email digest
argument-hint: [newsletter-subject-or-name]
---

# Newsletter Digest — Deep Technical Summary

Reads a tech newsletter from Gmail and produces a comprehensive, structured summary with 5x the normal detail depth. Each article gets technical background, ecosystem impact, and contextual analysis.

<essential_principles>

## Always Active

- **5x Detail Depth**: Every article gets technical background, "why it matters", and ecosystem context — not just a one-line summary
- **Adaptive Categorization**: Match the newsletter's own section structure (headers, topics), don't force a fixed template
- **Technical Accuracy**: Use Context7 and Exa to verify claims and add supplementary technical details for main articles
- **Structured Thinking**: Use sequential-thinking to organize the analysis before writing output
- **Language**: Follow user's language preference. Default to Japanese per user config (respond in the language the user uses)
- **Preserve Links**: Keep all article URLs as markdown links for easy access

</essential_principles>

## Phase 1: Retrieve Newsletter

1. Search Gmail using `mcp__claude_ai_Gmail__gmail_search_messages`:
   - If user provides exact subject → `subject:"exact subject here"`
   - If user provides newsletter name only → `subject:"{name}" OR from:"{name}"` with `maxResults: 5`, let user pick
   - If user says "latest" → search by newsletter name, sort by recent
2. Read the full message with `mcp__claude_ai_Gmail__gmail_read_message`
3. If the email body is truncated or too short, try `gmail_read_thread` for the full content

## Phase 2: Analyze & Structure

Use `mcp__sequential-thinking__sequentialthinking` to:

1. **Identify all articles/items** in the newsletter — count them, note categories
2. **Classify by section** — detect the newsletter's own section headers (e.g., "IN BRIEF", "RELEASES", "ARTICLES", "CODE & TOOLS")
3. **Prioritize main articles** (typically 2-4 featured items with longer descriptions) vs brief mentions
4. **Plan the output structure** — map newsletter sections to output sections

## Phase 3: Enrich Main Articles

For the top 2-4 featured/main articles:

1. **Context7** (`mcp__context7__resolve-library-id` → `mcp__context7__query-docs`): Look up technical details for libraries/frameworks mentioned
2. **Exa** (`mcp__exa__web_search_exa` or `mcp__exa__get_code_context_exa`): Search for additional context, code examples, or related announcements
3. Add technical background that the newsletter's brief description omits

## Phase 4: Generate Output

Follow the format in [references/baseline-format.md](references/baseline-format.md).

### Output Structure

```
---

## 📬 {Newsletter Name} #{Issue Number} — 詳細サマリー
**発行日: {Date} | 編集: {Editor} ({Publisher})**

---

## 🔶 メイン記事
[Each main article: 500-800 chars with technical depth]
[Include ★ Insight blocks after major articles]

## 📋 短信 (IN BRIEF)
[Each brief: 100-200 chars]

## 📦 リリース情報
[Each release: 50-150 chars with version + key changes]

## 📖 記事・動画
[Each article: 200-400 chars]

## 🛠 コード＆ツール
[Each tool: 100-300 chars]

## 🌐 エコシステム情報
[Each item: 100-300 chars]

---

★ Insight (号全体のテーマ分析)
```

### Writing Rules

| Element | Rule |
|---------|------|
| Main articles | 500-800 chars each, include "why it matters", technical background, ecosystem impact |
| Brief items | 100-200 chars, key takeaway only |
| Releases | Version number + top 2-3 changes |
| Tools/Libraries | What it does + why it's notable |
| ★ Insight blocks | After main articles AND at the end (overall theme analysis) |
| Sponsor content | Include with (SPONSOR) tag, keep brief |
| Section headers | Use emoji + Japanese section names, adapt to newsletter's own categories |
| Links | Preserve original URLs as markdown links |

### Section Emoji Map

| Category | Emoji |
|----------|-------|
| Main/Featured | 🔶 |
| Brief/Short | 📋 |
| Releases | 📦 |
| Articles/Tutorials | 📖 |
| Code/Tools | 🛠 |
| Ecosystem/Community | 🌐 |
| Videos | 🎬 |
| Opinions/Commentary | 💬 |

Adapt categories based on what the newsletter actually contains. Not every section needs to appear.

<success_criteria>
A successful newsletter digest:
- [ ] All articles from the newsletter are covered (none skipped)
- [ ] Main articles have 5x depth with technical context
- [ ] Sequential-thinking was used to structure the analysis
- [ ] Context7/Exa enriched at least the main articles
- [ ] Output follows the baseline format structure
- [ ] ★ Insight block provides cross-cutting theme analysis
- [ ] All original URLs are preserved as markdown links
</success_criteria>
