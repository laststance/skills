# Impact Analysis Guide

How to analyze the impact of changes in existing codebases.

---

## Overview

Impact analysis answers: "If I change X, what else needs to change?"

This prevents:
- Breaking callers of modified functions
- Failing tests that depend on changed behavior
- Missing updates to related documentation
- Regressions in production

---

## Step 1: Symbol Lookup

### Find Target Functions/Classes

Use semantic search or grep to locate the target functions/classes:

```
Grep: "functionName" path="src/**/*.ts"
```

For methods within classes:
```
Grep: "class ClassName" path="src/**/*.ts"
```

### Find All Symbols in a File

```
Read: src/services/auth.ts
```

---

## Step 2: Find Callers

### Direct Callers

Use grep to find all locations where the function is called:

```
Grep: "functionName(" path="src/**/*.ts"
```

### Indirect Callers (Callers of Callers)

For deeper impact analysis:
1. Find direct callers
2. For each direct caller, find its callers
3. Continue as needed (usually 2 levels is sufficient)

---

## Step 3: Dependency Mapping

### Build Dependency Graph

| Target | Direct Callers | Indirect Callers |
|--------|---------------|------------------|
| `validateUser` | `authMiddleware`, `loginHandler` | `userRouter`, `adminRouter` |

### Document Dependencies

```markdown
## Dependency Map: validateUser

### Direct Dependencies (6)
- `src/middleware/auth.ts:authMiddleware` (line 15)
- `src/routes/api/login.ts:POST` (line 42)
- `src/routes/api/users.ts:GET` (line 28)
- `src/routes/api/users.ts:PUT` (line 56)
- `src/routes/api/admin.ts:DELETE` (line 34)
- `src/services/session.ts:refreshSession` (line 89)

### Test Dependencies (3)
- `src/__tests__/auth.test.ts` (5 test cases)
- `src/__tests__/middleware.test.ts` (2 test cases)
- `src/__tests__/integration/auth.test.ts` (3 test cases)

### Configuration Dependencies
- `JWT_SECRET` from environment
- `TOKEN_EXPIRY` constant
```

---

## Step 4: Breaking Change Detection

### Change Types and Risk Levels

| Change Type | Risk | Breaking? | Mitigation |
|-------------|------|-----------|------------|
| Add optional parameter | 🟢 Low | No | None needed |
| Add required parameter | 🔴 High | Yes | Update all callers |
| Remove parameter | 🔴 High | Yes | Update all callers |
| Change parameter type | 🔴 High | Yes | Update all callers |
| Change return type | 🔴 High | Yes | Update all consumers |
| Rename function | 🔴 High | Yes | Update all references |
| Change behavior (same signature) | 🟡 Medium | Maybe | Update tests |
| Add new function | 🟢 Low | No | None needed |
| Add new property to return | 🟢 Low | No | Consumers can ignore |

### Signature Analysis

Before:
```typescript
function validateUser(token: string): User
```

After:
```typescript
function validateUser(token: string, role?: UserRole): User
```

Analysis:
- **Parameter added**: Yes (optional)
- **Breaking**: No (optional params are backward compatible)
- **Behavior change**: Yes (new role checking)
- **Tests affected**: Yes (need new tests for role checking)

---

## Step 5: Test Impact Analysis

### Find Related Tests

Use Grep to find test files:
```
Grep: "validateUser" path="**/*.test.ts"
Grep: "validateUser" path="**/*.spec.ts"
```

### Categorize Test Impact

| Test File | Test Cases | Impact |
|-----------|------------|--------|
| `auth.test.ts` | "validates token", "rejects expired" | ✅ Should still pass |
| `auth.test.ts` | (new) "validates role" | 🆕 Need to add |
| `middleware.test.ts` | "protects routes" | ⚠️ May need update |

---

## Step 6: Risk Assessment

### Risk Matrix

| Factor | Low | Medium | High |
|--------|-----|--------|------|
| Caller count | 1-3 | 4-10 | 11+ |
| Test coverage | >80% | 50-80% | <50% |
| Production traffic | Low | Medium | High |
| Rollback ease | Simple | Moderate | Complex |

### Overall Risk Calculation

```markdown
## Risk Assessment: validateUser Modification

### Factors
| Factor | Value | Risk |
|--------|-------|------|
| Direct callers | 6 | 🟡 Medium |
| Test coverage | 85% | 🟢 Low |
| Breaking signature | No | 🟢 Low |
| Behavior change | Yes | 🟡 Medium |

### Overall Risk: 🟡 MEDIUM

### Mitigation Plan
1. ✅ Add optional parameter (backward compatible)
2. ⚠️ Update tests to cover new behavior
3. ⚠️ Add migration path for callers wanting role checking
```

---

## Step 7: Document Impact

### Impact Report Template

```markdown
# Impact Analysis: [Change Description]

## Summary
- **Target**: [function/class being modified]
- **Change Type**: [add/modify/remove/rename]
- **Risk Level**: [Low/Medium/High]

## Files Involved
| File | Purpose | Change Needed |
|------|---------|---------------|
| src/services/auth.ts | Target file | Modify function |
| src/middleware/auth.ts | Caller | No change (optional param) |

## Functions to Modify
| Function | Current | Proposed |
|----------|---------|----------|
| validateUser | `(token: string)` | `(token: string, role?: UserRole)` |

## Callers Affected
| Location | Update Required | Reason |
|----------|-----------------|--------|
| authMiddleware | Optional | Can use role param if desired |
| loginHandler | No | Existing behavior unchanged |

## Test Changes
| Test File | Action | Details |
|-----------|--------|---------|
| auth.test.ts | Add tests | 3 new tests for role validation |
| middleware.test.ts | Review | May need role-specific tests |

## Breaking Changes
- None (optional parameter is backward compatible)

## Rollback Plan
1. Revert commit
2. No database migration needed
3. No config changes needed
```

---

## Quick Reference: Impact Commands

| Task | Tool | Command |
|------|------|---------|
| Find symbol | Grep | `pattern="functionName" path="src/**/*.ts"` |
| Find callers | Grep | `pattern="functionName(" path="src/**/*.ts"` |
| Find in tests | Grep | `pattern="name" path="**/*.test.ts"` |
| File overview | Read | `path="src/services/auth.ts"` |
| Search usage | Grep | `pattern="functionName("` |
