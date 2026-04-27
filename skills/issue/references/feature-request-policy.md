# Feature Request Body Policy

Feature requests must read as if a **non-engineer stakeholder** (PM, designer, end user) wrote them. The engineer who picks up the issue is responsible for technical design via `/plan-eng-review` or equivalent — **not the issue author**.

## Core Principle

> An issue answers **WHAT** and **WHY**.
> A plan answers **HOW**.

Mixing the two prematurely narrows the solution space and couples the ticket to implementation choices that may not survive design review.

## Anti-patterns (reject or rewrite)

| Anti-pattern | Example phrase | Why it's wrong |
|--------------|----------------|----------------|
| Stack prescription | "Use Redis for caching" | Locks in tech before design review |
| File/module targeting | "Update `UserService.ts`" | Presumes current architecture stays |
| API shape | "Add `POST /api/v2/export`" | Design decision, not requirement |
| Schema details | "Add `exported_at TIMESTAMP` column" | DB design belongs in plan |
| Algorithmic hints | "Use debouncing with 300ms" | Implementation detail |
| Library choice | "Use `react-query` for this" | Engineer's call at pickup |
| Perf targets as impl | "Cache this in memory" | State desired *outcome*, not mechanism |

## Rewrite Examples

### Example 1 — CSV export

**❌ Raw input from engineer:**
> Add a CSV export endpoint `GET /api/reports/export.csv` that streams data using Node's stream API to avoid memory issues for large datasets.

**✅ Rewritten feature request body:**
```markdown
## Problem / Motivation
Users need to share report data with external tools (spreadsheets, BI tools) but currently must copy values manually, which is slow and error-prone.

## Acceptance Criteria
- [ ] User can download report data as a CSV file from the reports screen
- [ ] Download works for reports of any size without the app freezing or crashing
- [ ] File opens correctly in Excel, Google Sheets, and Numbers
- [ ] Column headers match what the user sees on screen

---
_Technical design & implementation plan will be produced at pickup time via `/plan-eng-review`._
```

### Example 2 — Session caching

**❌ Raw input:**
> Login feels slow. Add a Redis cache layer for session lookups with 5-minute TTL.

**✅ Rewritten:**
```markdown
## Problem / Motivation
Returning users wait several seconds to see their home screen after login, which makes the app feel sluggish.

## Acceptance Criteria
- [ ] Returning user sees their home screen within 1 second of login
- [ ] First-time login experience is unchanged
- [ ] User's session expires and re-authenticates on the same cadence as today

---
_Technical design & implementation plan will be produced at pickup time via `/plan-eng-review`._
```

### Example 3 — Dark mode

**❌ Raw input:**
> Add dark mode using Tailwind's `dark:` variants and a `theme` cookie.

**✅ Rewritten:**
```markdown
## Problem / Motivation
Users working at night or in low-light environments want a darker interface that's easier on the eyes.

## Acceptance Criteria
- [ ] User can switch between light and dark appearance from settings
- [ ] The chosen appearance persists across sessions and devices where the user is logged in
- [ ] Appearance can follow the OS setting automatically
- [ ] All screens remain readable with sufficient contrast in both modes

---
_Technical design & implementation plan will be produced at pickup time via `/plan-eng-review`._
```

## Acceptance Criteria Writing Style

Good ACs are **observable by a human without reading code**:

| Good | Bad |
|------|-----|
| "User sees an error message within 2 seconds" | "API returns HTTP 400" |
| "Data is preserved after closing and reopening the app" | "Data is persisted to IndexedDB" |
| "Two users editing the same item don't overwrite each other" | "Use optimistic concurrency control" |

Each AC should be:
- **Testable** — QA could verify it by clicking/tapping
- **Atomic** — one behavior per checkbox
- **Unambiguous** — no "should work well" / "should be fast" without a measurable bound

## When Technical Input Is Unavoidable

Some feature requests imply constraints (compliance, performance SLAs, integration requirements). State these as **user-observable outcomes** or **explicit non-functional requirements**, not as implementation prescriptions:

- ❌ "Encrypt passwords with bcrypt at cost factor 12"
- ✅ "User passwords cannot be read by engineers with direct database access" (compliance outcome)

- ❌ "Paginate list with 20 items per page"
- ✅ "List stays responsive when the user has thousands of items" (performance outcome)

If a genuine technical constraint must be captured (e.g., "must integrate with Shopify's existing webhook system"), place it under a separate **Constraints** heading — but do so sparingly, and only for constraints the engineer could not infer from the Problem statement.

## Ambiguity Handling

If the user's input is too bare to produce a Problem statement (e.g., "add export"), ask ONE clarifying question before creating the issue:

> "What problem does this solve for the user? (e.g., 'users need to share data with their accountant')"

Do not invent motivation — a fabricated Problem statement is worse than asking.

## Delegation Footer

Always append this footer verbatim to feature request bodies so the pickup engineer knows where the design work happens:

```
---
_Technical design & implementation plan will be produced at pickup time via `/plan-eng-review`._
```

This makes the division of responsibility explicit and self-documenting in the tracker.
