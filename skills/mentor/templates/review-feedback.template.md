# Review Feedback Template

Use this template for the optional code review in the review workflow.

---

## Template

```markdown
## 🔍 Code Review: [Component/Feature Name]

---

### ✅ What's Working Well

[List 2-4 specific positive observations about the code]

- **[Aspect 1]**: [Specific praise with explanation]
- **[Aspect 2]**: [Specific praise with explanation]
- **[Aspect 3]**: [Specific praise with explanation]

---

### 💡 Suggestions (Optional)

These are ideas for consideration, not requirements.

1. **[Suggestion Title]**

   [Current observation]

   [Why this might be worth considering]

   [Optional: brief example or direction, not full implementation]

2. **[Suggestion Title]**

   [Current observation]

   [Why this might be worth considering]

---

### ⚠️ Potential Issues

[If none: "None detected! Your implementation is solid."]

[If issues exist:]

1. **[Issue Title]**

   **Location**: `file:line`

   **Current Code**:
   ```[language]
   [problematic snippet]
   ```

   **Potential Problem**: [What could go wrong]

   **Suggested Approach**: [Direction to fix, not exact code]

---

### 📊 Summary

| Aspect | Rating |
|--------|--------|
| Correctness | [✅ Good / ⚠️ Minor Issues / ❌ Needs Work] |
| Readability | [✅ Good / ⚠️ Minor Issues / ❌ Needs Work] |
| Performance | [✅ Good / ⚠️ Minor Issues / ❌ Needs Work] |
| Security | [✅ Good / ⚠️ Minor Issues / ❌ Needs Work] |
| Test Coverage | [✅ Good / ⚠️ Minor Issues / ❌ Needs Work] |

---

**Remember**: These are suggestions, not requirements.
Your code works correctly. Any changes are at your discretion.
```

---

## Example: Positive Review

```markdown
## 🔍 Code Review: validateUser with Role Validation

---

### ✅ What's Working Well

- **Clear Error Handling**: Your approach of using specific error types
  (`UnauthorizedError` vs `TokenExpiredError`) makes it easy to return
  appropriate HTTP status codes downstream.

- **Backward Compatibility**: Excellent decision to make the role parameter
  optional. This ensures existing callers continue to work without changes.

- **Type Safety**: Good use of TypeScript - the `UserRole` enum prevents
  invalid role values at compile time.

- **Documentation**: The JSDoc comments clearly explain what the function
  does, its parameters, and possible errors.

---

### 💡 Suggestions (Optional)

These are ideas for consideration, not requirements.

1. **Consider Role Hierarchy**

   Currently each role is checked independently. If you later need
   "admin can do everything editor can do", you might want a helper:

   ```typescript
   const roleHierarchy = { admin: 3, editor: 2, viewer: 1 };
   const hasMinRole = (user: User, minRole: UserRole) =>
     roleHierarchy[user.role] >= roleHierarchy[minRole];
   ```

   Not needed now, but could be useful if requirements expand.

2. **Logging for Security Auditing**

   Role validation failures might be worth logging for security monitoring.
   Something like `logger.warn('Role mismatch', { userId, required, actual })`.

   This is optional and depends on your logging strategy.

---

### ⚠️ Potential Issues

None detected! Your implementation is solid.

---

### 📊 Summary

| Aspect | Rating |
|--------|--------|
| Correctness | ✅ Good |
| Readability | ✅ Good |
| Performance | ✅ Good |
| Security | ✅ Good |
| Test Coverage | ✅ Good |

---

**Remember**: These are suggestions, not requirements.
Your code works correctly. Any changes are at your discretion.
```

---

## Example: Review With Issues

```markdown
## 🔍 Code Review: validateUser with Role Validation

---

### ✅ What's Working Well

- **Core Logic Correct**: The role validation logic correctly checks
  the user's role against the required role.

- **Optional Parameter**: Good choice making the role parameter optional
  for backward compatibility.

---

### 💡 Suggestions (Optional)

These are ideas for consideration, not requirements.

1. **Error Message Clarity**

   Current error message reveals the user's actual role:
   ```
   Required role: admin, actual: viewer
   ```

   Consider if exposing the actual role is a security concern.
   Alternative: `"Insufficient permissions for this action"`

---

### ⚠️ Potential Issues

1. **Empty Token Handling**

   **Location**: `src/services/auth.ts:15`

   **Current Code**:
   ```typescript
   export async function validateUser(token: string, role?: UserRole) {
     const decoded = jwt.verify(token, JWT_SECRET);
     // ...
   }
   ```

   **Potential Problem**: If `token` is an empty string or whitespace,
   `jwt.verify` throws a generic error that's hard to debug.

   **Suggested Approach**: Add an early check for empty/invalid token format
   before calling jwt.verify. This gives a clearer error message.

2. **Type Assertion Safety**

   **Location**: `src/services/auth.ts:16`

   **Current Code**:
   ```typescript
   const decoded = jwt.verify(token, JWT_SECRET);
   if (role && decoded.role !== role) {
   ```

   **Potential Problem**: `decoded` is typed as `JwtPayload | string`.
   Accessing `.role` assumes it's an object with that property.

   **Suggested Approach**: Consider validating the decoded payload structure
   or using a type guard before accessing properties.

---

### 📊 Summary

| Aspect | Rating |
|--------|--------|
| Correctness | ⚠️ Minor Issues |
| Readability | ✅ Good |
| Performance | ✅ Good |
| Security | ⚠️ Minor Issues |
| Test Coverage | ✅ Good |

---

**Remember**: These are suggestions, not requirements.
Your code works correctly for the expected use cases.
The issues noted are edge cases that may or may not be relevant to your context.
```

---

## Guidelines for Reviewers

### DO
- Praise specific good decisions
- Explain WHY something might be an issue
- Offer alternatives, not demands
- Acknowledge their creativity and variations
- Keep feedback constructive and encouraging
- Rate based on working code, not style preferences

### DON'T
- Compare to AI's example as "the answer"
- Insist on specific naming or style
- Mark working code as "wrong"
- Overwhelm with minor nitpicks
- Make them feel judged for differences
- Say "you should have done it my way"

### Remember
🔴 **The human wrote this code. They own it.**

The goal is learning and growth, not conformity.
Different approaches that work are valid.
