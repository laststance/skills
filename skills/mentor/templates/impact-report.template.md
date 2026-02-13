# Impact Report Template

Use this template for documenting the impact of changes in the understand workflow.

---

## Template

```markdown
# Impact Analysis: [Change/Feature Name]

**Generated**: [Date]
**Task Type**: [Feature Change / Feature Addition / Bug Fix / Refactor]

---

## Summary

| Metric | Value |
|--------|-------|
| Files to modify | [N] |
| Functions to change | [N] |
| Callers affected | [N] |
| Tests to update | [N] |
| Breaking change risk | [Low/Medium/High] |

---

## Task Description

[Brief description of what needs to be changed and why]

---

## Files Involved

| File | Purpose | Change Type |
|------|---------|-------------|
| `path/to/file1.ts` | [Description] | Modify |
| `path/to/file2.ts` | [Description] | Modify |
| `path/to/file3.ts` | [Description] | Add |

---

## Functions to Modify

| Function | File | Current Signature | Proposed Signature |
|----------|------|-------------------|-------------------|
| `functionName` | `path/file.ts` | `(param: Type): Return` | `(param: Type, newParam?: New): Return` |

---

## Callers Affected

| Caller | File:Line | Update Required | Reason |
|--------|-----------|-----------------|--------|
| `callerFunction` | `path/file.ts:42` | No | Optional param |
| `anotherCaller` | `path/other.ts:15` | Yes | Needs new param |

---

## Test Coverage

### Existing Tests

| Test File | Test Cases | Status |
|-----------|------------|--------|
| `path/__tests__/file.test.ts` | 5 tests | ✅ Should pass |
| `path/__tests__/other.test.ts` | 3 tests | ⚠️ May need update |

### New Tests Needed

| Test Description | File Location |
|------------------|---------------|
| [Test for new feature X] | `path/__tests__/file.test.ts` |
| [Edge case Y] | `path/__tests__/file.test.ts` |

---

## Breaking Change Risk

**Level**: [🟢 Low / 🟡 Medium / 🔴 High]

**Reason**: [Why this risk level]

**Mitigation**:
1. [Mitigation step 1]
2. [Mitigation step 2]

---

## Dependencies

### Environment
- [ENV_VAR_1]: [Purpose]
- [ENV_VAR_2]: [Purpose]

### External Services
- [Service name]: [How it's used]

### Internal Dependencies
- [Module/Package]: [How it's used]

---

## Existing Patterns to Follow

| Pattern | Example Location | Usage |
|---------|------------------|-------|
| [Error handling] | `src/services/other.ts:25` | [How to apply here] |
| [Type definitions] | `src/types/index.ts` | [How to apply here] |

---

## Rollback Plan

1. [Step to revert if needed]
2. [Additional rollback steps]

**Rollback complexity**: [Simple / Moderate / Complex]

---
```

---

## Example: Filled Template

```markdown
# Impact Analysis: Role-Based Permission System

**Generated**: 2024-01-15
**Task Type**: Feature Addition

---

## Summary

| Metric | Value |
|--------|-------|
| Files to modify | 3 |
| Functions to change | 2 |
| Callers affected | 8 |
| Tests to update | 4 |
| Breaking change risk | 🟡 Medium |

---

## Task Description

Add role-based permission checking to the authentication system.
Users should have roles (admin, editor, viewer) that determine
their access to different features and API endpoints.

---

## Files Involved

| File | Purpose | Change Type |
|------|---------|-------------|
| `src/types/auth.ts` | Type definitions | Modify - add Role type |
| `src/services/auth.ts` | Auth logic | Modify - add role validation |
| `src/middleware/auth.ts` | Route protection | Modify - add requireRole |

---

## Functions to Modify

| Function | File | Current Signature | Proposed Signature |
|----------|------|-------------------|-------------------|
| `validateUser` | `src/services/auth.ts` | `(token: string): User` | `(token: string, role?: UserRole): User` |
| `authMiddleware` | `src/middleware/auth.ts` | `(req, res, next)` | No signature change, add role param support |

---

## Callers Affected

| Caller | File:Line | Update Required | Reason |
|--------|-----------|-----------------|--------|
| `loginHandler` | `src/routes/login.ts:42` | No | Optional param |
| `getUser` | `src/routes/users.ts:28` | No | Optional param |
| `updateUser` | `src/routes/users.ts:56` | Optional | May want role check |
| `deleteUser` | `src/routes/admin.ts:34` | Yes | Needs admin role |
| `getSettings` | `src/routes/settings.ts:15` | No | Optional param |
| `updateSettings` | `src/routes/settings.ts:45` | Optional | May want role check |
| `createPost` | `src/routes/posts.ts:22` | No | Optional param |
| `deletePost` | `src/routes/posts.ts:67` | Optional | May want editor+ role |

---

## Test Coverage

### Existing Tests

| Test File | Test Cases | Status |
|-----------|------------|--------|
| `src/__tests__/auth.test.ts` | 5 tests | ✅ Should pass (backward compatible) |
| `src/__tests__/middleware.test.ts` | 3 tests | ⚠️ Add role tests |
| `src/__tests__/routes/admin.test.ts` | 4 tests | ⚠️ Update for role check |
| `src/__tests__/integration/auth.test.ts` | 3 tests | ✅ Should pass |

### New Tests Needed

| Test Description | File Location |
|------------------|---------------|
| validateUser with valid role | `src/__tests__/auth.test.ts` |
| validateUser with invalid role | `src/__tests__/auth.test.ts` |
| validateUser with missing role | `src/__tests__/auth.test.ts` |
| requireRole middleware | `src/__tests__/middleware.test.ts` |
| Admin route protection | `src/__tests__/routes/admin.test.ts` |

---

## Breaking Change Risk

**Level**: 🟡 Medium

**Reason**:
- Adding optional parameter is backward compatible
- However, behavior change may affect existing tests
- Admin routes will start rejecting non-admin users

**Mitigation**:
1. Use optional parameter for backward compatibility
2. Update admin tests before deploying
3. Communicate role requirements to team
4. Consider grace period before enforcing on all routes

---

## Dependencies

### Environment
- `JWT_SECRET`: Used for token validation (existing)

### External Services
- None new required

### Internal Dependencies
- `@/lib/errors`: Need to add UnauthorizedError type
- `@/types/auth`: Need to add UserRole enum

---

## Existing Patterns to Follow

| Pattern | Example Location | Usage |
|---------|------------------|-------|
| Error handling | `src/services/user.ts:45` | Throw specific error types |
| Type definitions | `src/types/index.ts` | Export from central location |
| Middleware | `src/middleware/cors.ts` | Follow existing middleware pattern |
| Route protection | `src/middleware/auth.ts` | Extend existing pattern |

---

## Rollback Plan

1. Revert the 3 modified files to previous version
2. No database changes needed
3. No environment changes needed

**Rollback complexity**: Simple (code-only change)

---
```
