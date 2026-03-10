# Assist Comments Reference

Guidelines for injecting assist comments into implementation-target files during the mentor workflow.

---

## Purpose

Assist comments are **durable scaffolding**:
- They help the human implement the approved TODO
- They clarify intent, constraints, and insertion points
- They may remain in the codebase if still useful after implementation

Assist comments are **not** a substitute for implementation.

---

## When To Use

Inject assist comments only when:
- The TODO is already approved through plan-gate
- A specific file or symbol is the next implementation target
- A short in-file hint will reduce ambiguity better than prose alone
- The comment helps with placement, constraints, sequencing, or edge cases

Do not inject comments just because a file is involved.

---

## Allowed Comment Shapes

### Placement Marker

Use when the human needs to know where to add code:

```typescript
// ASSIST: Add role validation here before returning the decoded user.
```

### Constraint Marker

Use when the human must preserve an existing contract:

```typescript
// ASSIST: Keep this backward-compatible. Existing callers must continue working unchanged.
```

### Edge Case Marker

Use when a non-obvious failure case must be handled:

```typescript
// ASSIST: Handle empty state here so the UI does not render stale results.
```

### Sequencing Marker

Use when work in one file must align with another TODO:

```typescript
// ASSIST: This should match the shape introduced in T02.1 before updating the caller.
```

---

## Comment Style

### Required Prefix

Use a clear prefix so assist comments are searchable:

```typescript
// ASSIST: ...
```

### Writing Rules

- Explain **why here** or **what constraint applies here**
- Prefer one concrete idea per comment
- Keep comments short enough to scan while editing
- Reference a TODO ID when cross-file coordination matters
- Use neutral wording that supports the human rather than commanding them

### Avoid

- Writing the full implementation in prose
- Restating code that is already obvious
- Dumping design notes that only make sense to the AI
- Leaving vague comments like `// ASSIST: implement this`

---

## Injection Rules

Before injecting comments:
1. Confirm the file and TODO are part of the approved plan
2. Choose the smallest useful comment set
3. Place comments directly above the relevant line, branch, or symbol
4. Show the human exactly what was inserted and why

After injection:
1. Continue mentoring from that exact file/symbol
2. Let the human write the implementation
3. Treat leftover comments as valid only if they still help future readers

---

## Examples

### Good

```typescript
// ASSIST: Normalize tab ids here so keyboard and click handlers share one code path.
const nextTab = ...
```

Why this works:
- It identifies the intent
- It does not reveal the full solution
- It remains useful after implementation

### Bad

```typescript
// ASSIST: Call normalizeTabId(tab.id), compare against activeTab, then setActiveTab(nextId).
```

Why this fails:
- It nearly writes the implementation
- It reduces human ownership
- It becomes noisy once the code exists

---

## Anti-Patterns

- Injecting comments before plan approval
- Adding comments to files outside the current TODO
- Using assist comments to sneak in architectural decisions not shown at plan-gate
- Leaving outdated comments that contradict the code
- Using assist comments instead of updating validation expectations or tests

---

## Verification Standard

Assist comments are acceptable to keep when they are:
- Accurate
- Specific
- Non-obvious
- Helpful to future maintainers

Assist comments should be removed or rewritten when they are:
- Stale
- Redundant
- Misleading
- Temporary planning chatter
