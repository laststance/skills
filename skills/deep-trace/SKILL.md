---
name: deep-trace
description: |
  Line-by-line execution path tracer for PR diffs, git diffs, or specified code sections.
  Maps every line to its screen/URL, data flow, and execution context like a debugger's step-through.
  Outputs a structured trace table from entry point to final execution, saved to Serena Memory.

  Use when:
  - User wants to understand what a PR/diff actually does at runtime
  - User asks "this code runs when/where/why?"
  - User wants to map code changes to screens and URLs
  - User wants a debugger-style walkthrough of code flow
  - User is learning a codebase by tracing execution paths

  Keywords: deep trace, step through, line by line, execution path, when does this run,
  where is this called, data flow, screen mapping, debugger, walkthrough
argument-hint: [pr-number-or-file-path]
---

# Deep Trace — Line-by-Line Execution Path Tracer

<essential_principles>

## Core Concept

Trace code like a debugger stepping through line-by-line, but enriched with:
- **Screen**: What the user sees when this code runs
- **URL**: The page/API route where this executes
- **Data flow**: What data enters, transforms, and exits
- **Trigger**: What event/action causes this line to execute

## Trace Table Format

Every trace outputs a structured table:

```
## Trace: [description]

| # | File:Line | Code | Screen/URL | Data Flow | Trigger |
|---|-----------|------|------------|-----------|---------|
| 1 | page.tsx:15 | `const router = useRouter()` | /drawings | — | Page mount |
| 2 | page.tsx:16 | `const { id } = router.query` | /drawings?id=123 | id: string | URL params |
| 3 | hook.ts:8 | `const { data } = useQuery(...)` | /drawings?id=123 | id → API call | React render |
| ... | ... | ... | ... | ... | ... |
```

## Principles

1. **Diff-first**: Start from changed lines, trace outward to entry point and downstream effects
2. **Line granularity**: Every meaningful line gets its own row (skip blank lines, imports, type-only lines)
3. **Screen mapping**: Always identify which screen/URL the user is on when this code runs
4. **Bidirectional**: Trace both UP (who calls this?) and DOWN (what does this call?)
5. **Application boundary**: Summarize library calls in 1 row, don't trace into node_modules
6. **No abbreviation in File:Line**: NEVER truncate or ellipsis file names. Always show the full file name (e.g., `useSetFormValuesFromQueryStrings.tsx:77`, NOT `useSetFormValues...:77`). Code column may be abbreviated if >80 chars, but file names must be exact.

</essential_principles>

## Workflow

### Step 1: Identify Target

Determine input source from user's argument:

| Input | Detection | Action |
|-------|-----------|--------|
| PR number | `#1234` or number | `gh pr diff <number>` |
| Branch diff | `--diff` or no arg | `git diff HEAD~1` or `git diff dev...HEAD` |
| File path | `.ts`, `.tsx`, etc. | Read file, trace from exports |
| Function name | text without path | Serena `find_symbol` |

### Step 2: Extract Changed Code

For PR/diff inputs:
1. Parse diff to get changed files and line ranges
2. Group changes by file
3. Prioritize: components > hooks > utils > types

For file/function inputs:
1. Read the target code
2. Identify exported functions/components

### Step 3: Find Entry Points

For each changed code section, trace UP to find the entry point:

```
Changed line → containing function → caller → ... → page component / API route / event handler
```

Use Serena tools:
- `find_symbol` — locate the function
- `find_referencing_symbols` — find callers
- Repeat until reaching a page/route/event boundary

**Entry point types:**
| Type | Example | Screen/URL |
|------|---------|------------|
| Page component | `pages/drawings/index.tsx` | `/drawings` |
| API route | `pages/api/drawings.ts` | `POST /api/drawings` |
| Event handler | `onClick`, `onSubmit` | Button click on current page |
| Effect | `useEffectOnMount` | Page load |
| Provider | `_app.tsx` wrapper | All pages |

### Step 4: Build Trace Table

Starting from entry point, step through line-by-line:

1. **Read the entry point file** (Serena `find_symbol` with `include_body=True`)
2. **For each meaningful line**, create a table row:
   - `#`: Sequential step number
   - `File:Line`: Full file name + line number. NEVER abbreviate or ellipsis file names
   - `Code`: The actual code (backtick-wrapped, may abbreviate if >80 chars)
   - `Screen/URL`: What screen/page/URL is active
   - `Data Flow`: What data is being read/written/transformed
   - `Trigger`: What causes this line to execute (mount, click, API response, etc.)

3. **When hitting a function call**:
   - If it's application code → trace INTO it (sub-steps like 3.1, 3.2, ...)
   - If it's a library call → summarize in 1 row with `[lib]` prefix

4. **When hitting a conditional**: note both paths, trace the primary path

### Step 5: Annotate with Context

Add these sections after the trace table:

```markdown
## Summary
- **When**: [user action / event that triggers this code]
- **Where**: [screen URL and component location]
- **What**: [1-2 sentence description of what the code accomplishes]
- **Data**: [key data entities involved, their sources and destinations]

## Key Observations
- [Notable patterns, potential issues, or design decisions]
```

### Step 6: Save to Memory (Optional)

If the user wants to remember this trace:
```
Serena write_memory("trace_<descriptive_name>", traceContent)
```

## Examples

### Example: Tracing a PR diff

```
/deep-trace #3548
```

Output:
```
## Trace: PR #3548 — フリーワード検索の種別フィルター追加

### Entry: FreewordSearchFilter.tsx (絞り込みPopover内)

| # | File:Line | Code | Screen/URL | Data Flow | Trigger |
|---|-----------|------|------------|-----------|---------|
| 1 | FreewordSearchFilter.tsx:40 | `const { control } = useFreewordSearchFormContext()` | /freeword_search?query=テスト | form context | Component render |
| 2 | FreewordSearchFilter.tsx:54 | `const targetValues = useWatch({ control, name: 'target' })` | same | target: SelectOption[] | Form state change |
| 3 | FreewordSearchFilter.tsx:65 | `useDocumentTypeSettingsQuery(...)` | same | API → document_type_settings | React Query cache/fetch |
| 4 | FreewordSearchFilter.tsx:70 | `const targetOptions = useMemo(...)` | same | settings → SelectOption[] | Deps change |
| 5 | FreewordSearchFilter.tsx:119 | `<MultiSelectRHF ... options={targetOptions}>` | same (Popover open) | targetOptions → UI | User opens filter |

### Summary
- **When**: User opens 絞り込み popover on freeword search page
- **Where**: /freeword_search (ファイルフリーワード検索モード)
- **What**: Shows multi-select filter for 種別 (drawing + document types)
- **Data**: document_type_settings API → SelectOption[] → form state → API search params
```

## Tools Used

| Tool | Purpose |
|------|---------|
| `gh pr diff` | Get PR diff |
| `git diff` | Get branch diff |
| Serena `find_symbol` | Locate functions |
| Serena `find_referencing_symbols` | Find callers (trace UP) |
| Serena `get_symbols_overview` | Map file structure |
| Serena `write_memory` | Save trace for future reference |

## Success Criteria

- [ ] Entry point correctly identified (page/route/event)
- [ ] Every meaningful changed line has a trace row
- [ ] Screen/URL column populated for all rows
- [ ] Data flow shows inputs → transformations → outputs
- [ ] Trace is readable top-to-bottom as an execution story
- [ ] Summary captures when/where/what/data
