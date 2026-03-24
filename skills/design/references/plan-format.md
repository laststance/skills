# Plan Document Format

## Document Header (Required)

```markdown
# [Target Name] Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Recommended: dispatch one
> subagent per independent task for parallel execution. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** [One sentence — what this builds]

**Architecture:** [2-3 sentences — approach overview]

**Tech Stack:** [Key technologies with versions]

**Research Basis:**
- [Key finding 1 that informed this design]
- [Key finding 2]
- [New library selection rationale]

**Review History:**
- Rounds completed: N/5
- Final review: Approved (confidence: High/Medium/Low)
- Reviewers: Architecture, Completeness, Feasibility, Final

---
```

## Task Structure

Each Task = one logical unit. Each Step = one atomic action (2-5 minutes).

````markdown
### Task N: [Component Name]

**Purpose:** [1 sentence — what this task accomplishes]

**Files:**
- Create: `exact/path/to/file.ts`
- Modify: `exact/path/to/existing.ts:23-45`
- Test: `tests/exact/path/to/file.test.ts`

**Dependencies (if any):**
```bash
pnpm add zod@3.23.8 @tanstack/react-query@5.59.0
```

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { validateUser } from '../src/auth/validate';

describe('validateUser', () => {
  it('returns valid user for correct input', () => {
    const result = validateUser({ email: 'a@b.com', name: 'Test' });
    expect(result).toEqual({ email: 'a@b.com', name: 'Test' });
  });

  it('throws for invalid email', () => {
    expect(() => validateUser({ email: 'bad', name: 'Test' }))
      .toThrow('Invalid email');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- validate.test.ts`
Expected: FAIL — `validateUser is not defined` or `Cannot find module`

- [ ] **Step 3: Write minimal implementation**

```typescript
import { z } from 'zod';

const userSchema = z.object({
  email: z.string().email('Invalid email'),
  name: z.string().min(1),
});

export type User = z.infer<typeof userSchema>;

export function validateUser(input: unknown): User {
  return userSchema.parse(input);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- validate.test.ts`
Expected: `Tests: 2 passed, 2 total`

- [ ] **Step 5: Commit**

```bash
git add src/auth/validate.ts tests/auth/validate.test.ts
git commit -m "feat(auth): add user validation with Zod schema"
```
````

## Quality Rules

### Every Step Must Have

| Element | Rule |
|---------|------|
| Action verb | "Write", "Run", "Add", "Create", "Modify" |
| Target file | Exact path from project root |
| Complete code | No `...`, no `// rest of code`, no ellipsis |
| Expected result | What success looks like after this step |

### Every Task Must Have

| Element | Rule |
|---------|------|
| Purpose | Why this task exists (1 sentence) |
| Files section | Every file touched, with Create/Modify/Test |
| Dependencies | Listed with exact versions before first step |
| Verification step | After implementation steps |
| Commit step | At the end of each task |

### Task Ordering

- Tasks MUST be in dependency-safe order
- Task N's output must not depend on Task N+1
- If Task B imports from Task A, Task A comes first
- Independent tasks can be flagged as parallelizable

## Plan Footer

```markdown
---

## Execution Options

1. **Parallel Subagents (recommended)** — Dispatch one subagent per independent task for concurrent execution
2. **Sequential In-Session** — Execute tasks one-by-one in the current session with checkpoints
3. **Manual** — Developer follows plan steps manually

## Notes

- [Any caveats, known limitations, or follow-up items]
- [Environment requirements if any]
```
