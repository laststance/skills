# UX Gap Detector -- Scoring Rubric

4-dimension scoring system for authenticated SaaS web app UI/UX quality gap analysis.
Each dimension scores 0-25 points. Overall score = sum of all dimensions (0-100).

---

## Dimension 1: Typography & Spacing (0-25)

### Checklist

| Check | Points | How to Verify |
|-------|--------|---------------|
| **Type scale consistency** | 0-5 | Consistent modular scale (e.g., 1.25 ratio)? Or arbitrary font sizes? |
| **Font weight variation** | 0-3 | Purposeful weights (max 3-4)? Or scattered randomly? |
| **Line-height proportions** | 0-3 | Body 1.4-1.6? Headings tighter (1.1-1.3)? |
| **Letter-spacing** | 0-2 | Appropriate on headings and uppercase text? |
| **Spacing rhythm** | 0-5 | Follows a grid (4/8px multiples)? Or mixed arbitrary values? |
| **Margin/padding consistency** | 0-4 | Same spacing patterns across sections? |
| **Whitespace balance** | 0-3 | Appropriate breathing room between elements? |

### Scoring Guide

| Score | Description |
|-------|-------------|
| 22-25 | Professional type system with clear scale and consistent spacing grid |
| 17-21 | Mostly consistent with minor inconsistencies |
| 10-16 | Some patterns visible but many arbitrary values |
| 5-9 | Mostly arbitrary font sizes and spacing |
| 0-4 | No discernible type system or spacing rhythm |

### Top-Tier Reference

> **Linear** uses a tight type scale with SF Pro/Inter, 3 font weights,
> and an 8px spacing grid throughout their app. Every sidebar item, issue
> card, and modal follows identical spacing rules.
>
> **Gap example**: "Linear's issue list uses consistent 8px padding and 3 type
> sizes (13/14/16px). Your table uses 5 different paddings (6/10/12/16/20px)
> and 7 font sizes with no clear ratio.
> **Fix**: Adopt an 8px grid. Standardize to 3-4 type sizes."

---

## Dimension 2: Interactive States (0-25)

### Checklist

| Check | Points | How to Verify |
|-------|--------|---------------|
| **Hover states present** | 0-5 | ALL interactive elements have hover states? (Use `browser_hover` to test) |
| **Focus indicators** | 0-5 | Visible focus rings for keyboard nav? (Use `browser_press_key Tab`) |
| **Active/pressed state** | 0-3 | Visual feedback when clicking? |
| **Transition timing** | 0-4 | 100-300ms with appropriate easing? No jarring snaps? |
| **Cursor changes** | 0-2 | `cursor: pointer` on all clickable elements? |
| **Disabled state styling** | 0-3 | Clear visual distinction for disabled elements? |
| **Animation easing** | 0-3 | Smooth easing (ease-out)? No linear or instant transitions? |

### Scoring Guide

| Score | Description |
|-------|-------------|
| 22-25 | Every interactive element has polished hover/focus/active states with smooth transitions |
| 17-21 | Most elements have states, minor gaps |
| 10-16 | Primary buttons have hover but many elements lack states |
| 5-9 | Only basic browser defaults |
| 0-4 | No custom interactive states |

### How to Verify with playwright-cli

```
1. browser_snapshot()           -> Get element refs
2. browser_hover(ref, element)  -> Hover interactive element
3. browser_screenshot()         -> Capture hover state
4. browser_press_key("Tab")     -> Move focus
5. browser_screenshot()         -> Capture focus state
```

### Top-Tier Reference

> **Stripe's** dashboard buttons have `transition: all 150ms ease-out` with
> subtle shadow lift on hover. Every table row highlights on hover.
> Focus rings are visible and styled consistently.
>
> **Gap example**: "Stripe's action buttons show 150ms ease-out transitions
> with shadow lift. Your buttons snap instantly between states with no
> transition property. Table rows have no hover state at all.
> **Fix**: Add `transition: all 150ms ease-out` to interactive elements.
> Add `hover:bg-muted` to table rows."

---

## Dimension 3: Content Hierarchy (0-25)

### Checklist

| Check | Points | How to Verify |
|-------|--------|---------------|
| **Visual weight distribution** | 0-5 | Clear reading flow? Primary content obvious? |
| **Heading level semantics** | 0-3 | Logical h1->h2->h3 order? No skipped levels? |
| **CTA/action prominence** | 0-5 | Primary action clearly stands out? Secondary distinguishable? |
| **Information density** | 0-3 | Appropriate amount per viewport? Not overwhelming? |
| **Section separation** | 0-3 | Clear boundaries (spacing, dividers, backgrounds)? |
| **Data-to-chrome ratio** | 0-3 | Actual content vs UI chrome (headers, sidebars) balanced? |
| **Above-the-fold priority** | 0-3 | Most important content visible without scrolling? |

### Scoring Guide

| Score | Description |
|-------|-------------|
| 22-25 | Clear visual hierarchy, eye naturally follows intended path |
| 17-21 | Good hierarchy with minor competing elements |
| 10-16 | Some hierarchy exists but unclear focus areas |
| 5-9 | Flat hierarchy -- everything has similar weight |
| 0-4 | Chaotic layout with no clear reading path |

### Top-Tier Reference

> **Notion** has a clean content hierarchy: page title (large, bold) ->
> block content (regular) -> inline metadata (muted). The sidebar uses
> opacity and indentation to convey nesting depth.
>
> **Gap example**: "Notion's workspace has a clear 3-level hierarchy with
> title/content/metadata having distinct visual weights. Your dashboard
> shows 6 cards all with identical styling, font size, and weight -- the
> user doesn't know where to look first.
> **Fix**: Differentiate card importance. Use larger text/bolder weight
> for primary KPIs. Mute secondary information with lighter color."

---

## Dimension 4: Loading & Error UX (0-25)

### Checklist

| Check | Points | How to Verify |
|-------|--------|---------------|
| **Initial load experience** | 0-5 | Skeleton screens or shimmer? Or blank/spinner? |
| **Progressive content loading** | 0-3 | Content appears incrementally? Or all at once? |
| **Empty states** | 0-5 | Helpful empty state with guidance? Or just "No results"? |
| **Form validation** | 0-4 | Inline validation with descriptive messages? |
| **Error recovery** | 0-2 | Clear "try again" or next steps on errors? |
| **Loading indicators** | 0-3 | Spinner/progress on async operations? |
| **Optimistic updates** | 0-3 | UI responds immediately before server confirms? |

### Scoring Guide

| Score | Description |
|-------|-------------|
| 22-25 | Graceful loading, helpful empty states, inline validation, optimistic updates |
| 17-21 | Good loading UX with minor gaps |
| 10-16 | Basic spinner, some custom states |
| 5-9 | Browser defaults for most states |
| 0-4 | No loading indicators, generic errors |

### How to Verify with playwright-cli

```
1. browser_navigate(url)       -> Observe loading state
2. browser_screenshot()        -> Capture loading/skeleton
3. Search for non-existent term -> Capture empty state
4. Submit empty form (if safe)  -> Capture validation errors
```

### Top-Tier Reference

> **Linear** shows branded skeleton screens with shimmer during data
> loading. Issue list items appear progressively. Creating an issue is
> optimistic -- it appears in the list instantly before server confirmation.
>
> **Gap example**: "Linear shows skeleton loaders per-section with shimmer
> animation. Your app shows a full-page spinner for 2 seconds, then
> everything pops in at once. Empty search shows only 'No results found'
> with no suggestions.
> **Fix**: Replace spinner with skeleton screens per content area.
> Add empty state illustration with suggested actions.
> Implement optimistic updates for create/update operations."

---

## Verdict Mapping

| Score (per dimension) | Verdict |
|----------------------|---------|
| 22-25 | Excellent |
| 17-21 | Good |
| 10-16 | Needs Work |
| 5-9 | Poor |
| 0-4 | Critical |

---

## Overall Score Interpretation

| Score | Verdict | Action |
|-------|---------|--------|
| 85-100 | Top Tier | Minor polish only. Matches industry standards. |
| 70-84 | Good | Competitive quality with specific areas to improve. |
| 50-69 | Needs Work | Noticeable gaps. Priority fixes needed. |
| 25-49 | Below Standard | Significant design debt. Users notice the difference. |
| 0-24 | Critical | Fundamental issues. Full design system review needed. |

---

## Priority Classification for GitHub Issues

| Score Range | Priority Label | GitHub Label |
|-------------|---------------|--------------|
| 0-49 in any dimension | Critical | `priority/critical` |
| 50-74 in any dimension | Moderate | `priority/moderate` |
| 75+ in any dimension | Low (strength) | Not registered as issue |
