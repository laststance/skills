# Explanation Style Guide

Guidelines for presenting code examples and explanations in the mentor skill.

---

## Thinking Markers

Use these markers for clarity:

| Marker | Meaning | When to Use |
|--------|---------|-------------|
| 🤔 | Reasoning | Explaining thought process |
| 🎯 | Decision | Key choice or approach |
| ⚡ | Performance | Performance consideration |
| 📊 | Architecture | Structural/design aspect |
| 💡 | Insight | Key learning point |
| 🔐 | Security | Security consideration |
| 🔄 | Pattern | Design pattern being used |
| ⚠️ | Caution | Potential pitfall |

### Example Usage

```markdown
🤔 **Why async here?**
The database query is I/O-bound, so async prevents blocking the event loop.

🎯 **Decision**: Use optional parameter for backward compatibility.

⚡ **Performance Note**: Consider caching this result if called frequently.
```

---

## Code Block Format

### File Header

Always include full path:
```markdown
📄 **src/services/auth.ts**
```

### For Mode A: CURRENT → MODIFIED

```markdown
📄 **CURRENT**: `src/services/auth.ts:functionName`

```typescript
// Existing code exactly as it appears
export function functionName(param: Type): Return {
  // implementation
}
```

**What This Does**: [Explanation]

---

📄 **MODIFIED**: `src/services/auth.ts:functionName`

```typescript
// CHANGED: Description of change
export function functionName(
  param: Type,
  newParam?: NewType  // ADDED: Reason for addition
): Return {
  // ADDED: New logic
  if (newParam) {
    // explanation of what this does
  }

  // Original implementation (unchanged)
  // implementation
}
```

**What Changed**: [Summary table]
**Why**: [Rationale]
```

### For Mode B: New Code

```markdown
📄 **NEW FILE**: `src/services/auth.ts`

```typescript
/**
 * Module Description
 *
 * Purpose and responsibility of this module.
 *
 * @module services/auth
 */

import { Dependency } from '@/lib/dependency';

/**
 * Function description.
 *
 * @param param - Description of parameter
 * @returns Description of return value
 * @throws ErrorType - When this error occurs
 *
 * @example
 * ```typescript
 * const result = functionName('input');
 * // result: { ... }
 * ```
 */
export function functionName(param: Type): Return {
  // Explain non-obvious logic
  const step1 = someOperation(param);

  // Another explanation
  return step1.transform();
}
```
```

---

## Change Markers (Mode A)

Use clear markers to indicate modifications:

```typescript
// ADDED: Explanation of why this was added
const newFeature = implementation();

// CHANGED: What was here before → What it is now
const modified = newApproach();

// REMOVED: What was here and why it's gone
// (Delete the line, but comment if explaining removal)

// MOVED: This came from [location], moved for [reason]
const relocated = existingCode();
```

---

## Comment Style

### DO: Explain WHY

```typescript
// Validate role before proceeding to prevent unauthorized access
// This check is separate from auth to enable granular error messages
if (!hasPermission(user, requiredRole)) {
  throw new UnauthorizedError('Insufficient permissions');
}
```

### DON'T: Explain WHAT (obvious from code)

```typescript
// Check if user has permission (BAD - obvious)
if (!hasPermission(user, requiredRole)) {
  // Throw error (BAD - obvious)
  throw new UnauthorizedError('Insufficient permissions');
}
```

---

## JSDoc Standards

### Function Documentation

```typescript
/**
 * Brief description of what the function does.
 *
 * More detailed explanation if needed, including:
 * - Important behavior notes
 * - Side effects
 * - Related functions
 *
 * @param param1 - Description including expected format/values
 * @param param2 - Optional parameter with default behavior
 * @returns Description of return value and structure
 * @throws ErrorType - Specific condition that causes this error
 *
 * @example
 * ```typescript
 * // Basic usage
 * const result = myFunction('input');
 *
 * // With optional param
 * const result2 = myFunction('input', { option: true });
 * ```
 */
export function myFunction(param1: Type, param2?: Options): Return {
  // implementation
}
```

### Type/Interface Documentation

```typescript
/**
 * Represents a user in the system.
 *
 * Users are created during registration and persist
 * throughout the session lifecycle.
 */
interface User {
  /** Unique identifier (UUID v4) */
  id: string;

  /** Email address (validated format) */
  email: string;

  /** User's role determining permissions */
  role: UserRole;

  /** ISO 8601 timestamp of account creation */
  createdAt: string;
}
```

---

## "Wait for Done" Pattern

Always end code guidance with clear action item:

```markdown
---

**Your Task**: [Specific action to take]

- Create the file at `path/to/file.ts`
- Implement the function as shown
- You may adapt styling/naming to match your preferences

Type **"done"** when complete, or ask questions about any part.

---
```

### While Waiting

Respond to questions conversationally:

```
User: Why do we need the try/catch here?

AI: Good question! The try/catch handles...
[Full explanation]
Does that make sense? Let me know when you're ready to continue.

User: done

AI: [Proceed to next TODO]
```

---

## Diff Visualization (Mode A)

For complex changes, use side-by-side comparison:

```markdown
### Before vs After

| Aspect | Before | After |
|--------|--------|-------|
| Parameters | `(token: string)` | `(token: string, role?: UserRole)` |
| Returns | `User` | `User` (unchanged) |
| Throws | `TokenExpiredError` | `TokenExpiredError`, `UnauthorizedError` |
| Behavior | Validates token only | Validates token + optional role |
```

---

## Key Patterns Section

After showing code, highlight important patterns:

```markdown
**Key Patterns to Notice**:

1. 📊 **Pattern Name**: Brief explanation of the pattern and why it's used here

2. 🔐 **Security Pattern**: How security is handled

3. 🔄 **Existing Convention**: How this matches the codebase's existing style
```

---

## Error Explanation Format

When explaining validation failures:

```markdown
### Error 1 of 2

📄 `src/services/auth.ts:25:10`

```
error TS2345: Argument of type 'string' is not assignable to parameter of type 'UserRole'.
```

**What This Means**:
TypeScript found a type mismatch at this location.

**Likely Cause**:
[Specific explanation based on context]

**Suggested Approach**:
[Direction without exact code, to encourage learning]

---

**Your Task**: Fix this issue, then let me know when ready to re-validate.
```
