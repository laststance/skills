# Workflow: Validation

**Purpose**: Verify code works via automated checks + visual verification.

---

## Step 1: Run Automated Validation Suite

### 1.1 Parallel Checks (Independent)

Run these in parallel:

```bash
# Lint check
pnpm lint  # or npm run lint / eslint .

# Type check
pnpm typecheck  # or tsc --noEmit
```

### 1.2 Sequential Checks (Dependent)

Run these in order:

```bash
# Unit tests
pnpm test  # or npm test / jest

# Build (if tests pass)
pnpm build  # or npm run build

# E2E tests (if build succeeds)
pnpm e2e  # or npm run e2e / playwright test
```

---

## Step 2: Platform-Specific Validation

Reference `references/validation-matrix.md` for platform-specific commands.

### Web (Next.js / React)

```bash
pnpm lint && pnpm typecheck  # Parallel
pnpm test && pnpm build      # Sequential
```

Visual: Use Browser MCP tools for verification

### Mobile (React Native / Expo)

```bash
npx eslint . && npx tsc --noEmit  # Parallel
npm test && npx expo build        # Sequential
```

Visual: Use iOS Simulator MCP tools

### Desktop (Electron)

```bash
npm run lint && tsc --noEmit  # Parallel
npm test && npm run build     # Sequential
```

Visual: Use Electron MCP tools

---

## Step 3: Present Results

### All Passed

```markdown
✅ **Validation Passed**

| Check | Status | Time |
|-------|--------|------|
| Lint | ✅ Pass | 2.3s |
| TypeCheck | ✅ Pass | 4.1s |
| Tests | ✅ Pass (15/15) | 8.2s |
| Build | ✅ Pass | 12.5s |

**Visual Verification**: [Screenshot attached]
- UI renders correctly
- No console errors

---

Ready to proceed to the next section?
```

### Some Failed

```markdown
⚠️ **Validation Issues Found**

| Check | Status | Details |
|-------|--------|---------|
| Lint | ✅ Pass | - |
| TypeCheck | ❌ Fail | 2 errors |
| Tests | ⏸️ Skipped | Blocked by type errors |
| Build | ⏸️ Skipped | Blocked by type errors |

---

## TypeCheck Errors

### Error 1 of 2

📄 `src/services/auth.ts:25:10`

```
error TS2345: Argument of type 'string' is not assignable to parameter of type 'UserRole'.
```

**What This Means**:
TypeScript found a type mismatch. The function expects a `UserRole` enum value,
but received a plain string.

**Likely Cause**:
The role value from the token is a string, but `requiredRole` expects `UserRole` type.

**Suggested Fix**:
```typescript
// Before
if (requiredRole && decoded.role !== requiredRole) {

// After - Cast the string to UserRole or validate it
if (requiredRole && (decoded.role as UserRole) !== requiredRole) {
```

Or better, validate the role:
```typescript
const userRole = decoded.role as UserRole;
if (!Object.values(UserRole).includes(userRole)) {
  throw new UnauthorizedError('Invalid role in token');
}
```

---

**Your Task**: Fix the issues shown above, then let me know when ready to re-validate.

🔴 **Note**: I will NOT auto-fix these. Understanding the error is part of learning.
```

---

## Step 4: Handle Failures

### 🔴 Critical Rule: NEVER Auto-Fix

Explain the issue clearly:
1. **What**: The error message
2. **Where**: File and line number
3. **Why**: What caused it
4. **How**: Suggested approach (not exact code if possible)

Let the human figure out the exact implementation.

### Loop Until Fixed

```
User: I fixed the type error

AI: Great! Let me re-run validation...

[Runs validation again]

AI: ✅ TypeCheck now passes! But tests found an issue...
[Shows test failure details]
```

---

## Step 5: Visual Verification (If Applicable)

### When to Do Visual Verification

- After implementing UI changes
- After full feature completion
- When user requests it

### Web Visual Check

```markdown
📸 **Visual Verification**

I'll check the UI in the browser:

1. Navigate to the relevant page
2. Take a screenshot
3. Verify expected elements are present
4. Check for console errors

---

[Screenshot]

**Observations**:
- ✅ Login form renders correctly
- ✅ Error messages display properly
- ⚠️ Loading spinner doesn't appear (optional enhancement)

**Console**: No errors
```

### Mobile Visual Check

```markdown
📱 **iOS Simulator Check**

Launching app in simulator...

[Screenshot]

**Observations**:
- ✅ Screen loads without crash
- ✅ Navigation works
- ⚠️ Text slightly cut off on smaller screens

Would you like to address the text issue now or note it for later?
```

---

## Step 6: Save Validation State

Save validation results:

```json
{
  "section": "S01",
  "timestamp": "ISO_TIMESTAMP",
  "results": {
    "lint": "pass",
    "typecheck": "pass",
    "tests": { "status": "pass", "passed": 15, "failed": 0 },
    "build": "pass",
    "visual": "pass"
  },
  "notes": "All checks passed on second attempt after fixing type error"
}
```

---

## Step 7: Route to Next Step

### If More Sections Remain

→ `workflows/section-guidance.md` (next section)

### If All Sections Complete

→ `workflows/review.md` (final code review)

---

## Validation Matrix Quick Reference

| Platform | Lint | TypeCheck | Test | Build |
|----------|------|-----------|------|-------|
| **Next.js** | `pnpm lint` | `pnpm typecheck` | `pnpm test` | `pnpm build` |
| **React** | `npm run lint` | `tsc --noEmit` | `npm test` | `npm run build` |
| **React Native** | `npx eslint .` | `npx tsc` | `npm test` | `npx expo build` |
| **Electron** | `npm run lint` | `tsc` | `npm test` | `npm run build` |
| **Express** | `npm run lint` | `tsc` | `npm test` | `npm run build` |

---

## Success Criteria

- [ ] All lint errors resolved
- [ ] All type errors resolved
- [ ] All tests passing
- [ ] Build succeeds
- [ ] Visual verification completed (if applicable)
- [ ] Validation results saved
- [ ] Human understood any errors they fixed
- [ ] Routed to appropriate next step
