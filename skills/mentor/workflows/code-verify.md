# Workflow: Code Verification

**Purpose**: Verify human's implementation for behavioral correctness after "done".
**This replaces the old optional review — verification is now MANDATORY.**

---

## Core Philosophy

🔴 **Verify BEHAVIOR, not IMPLEMENTATION.**

The mentor checks that the code **does the right thing**, not that it
**looks like the AI's example**. Human creativity and ownership are paramount.

---

## Acceptance Rules

### ✅ ALLOWED — Different implementation, same behavior

| Category | Example | Verdict |
|----------|---------|---------|
| **Variable names** | `result` vs `output` vs `data` | ✅ Valid |
| **Syntax sugar** | `for-of` vs `forEach` vs `for` | ✅ Valid |
| **Algorithm** | `reduce` vs `filter+map` vs `for` loop | ✅ Valid (if same output) |
| **Code structure** | Inline vs extracted helper | ✅ Valid |
| **Comment style** | JSDoc vs inline vs none | ✅ Valid |
| **Import style** | Named vs default vs barrel | ✅ Valid |
| **String format** | Template literal vs concatenation | ✅ Valid |
| **Conditional style** | Ternary vs if-else vs switch | ✅ Valid |
| **Error message text** | Different wording | ✅ Valid (if same error type) |
| **Function ordering** | Different arrangement in file | ✅ Valid |

### ❌ FLAGGED — Behavioral differences or correctness issues

| Category | Example | Severity |
|----------|---------|----------|
| **Wrong output** | Returns different data structure | 🔴 Critical |
| **Missing functionality** | Skipped a required feature | 🔴 Critical |
| **Edge case bug** | Empty input causes crash | 🟡 Important |
| **Type safety** | Uses `any` where specific type needed | 🟡 Important |
| **Security issue** | SQL injection, XSS, auth bypass | 🔴 Critical |
| **Missing error handling** | Unhandled promise rejection | 🟡 Important |
| **Logic error** | Off-by-one, wrong comparison | 🔴 Critical |
| **Missing side effect** | Forgot to emit event, update cache | 🟡 Important |

---

## Step 1: Read Human's Implementation

After user reports "done" for all TODOs:

Read every file they modified:

```
Read: src/services/auth.ts
Read: src/middleware/auth.ts
Read: src/types/auth.ts
```

---

## Step 2: Behavioral Analysis

For each modified function/component, verify:

### 2.1 Input/Output Contract

| Check | Method |
|-------|--------|
| Same inputs accepted? | Compare parameter types |
| Same outputs produced? | Compare return types and values |
| Same errors thrown? | Compare error conditions |
| Same side effects? | Compare writes, events, logs |

### 2.2 Edge Case Coverage

| Edge Case | Expected Behavior | Check |
|-----------|-------------------|-------|
| Empty input | [Expected] | Does code handle? |
| Null/undefined | [Expected] | Does code handle? |
| Invalid type | [Expected] | Does code handle? |
| Boundary values | [Expected] | Does code handle? |

### 2.3 Integration Points

| Caller | Expected Interface | Matches? |
|--------|-------------------|----------|
| [Caller 1] | [Expected signature] | ✅/❌ |
| [Caller 2] | [Expected signature] | ✅/❌ |

---

## Step 3: Present Verification Report

### All Correct

```markdown
✅ **Code Verification: PASSED**

---

Your implementation is behaviorally correct!

### Verification Summary

| Check | Status |
|-------|--------|
| Input/Output contract | ✅ Matches |
| Edge case handling | ✅ Covered |
| Integration compatibility | ✅ Compatible |
| Type safety | ✅ Sound |
| Security | ✅ No issues |

### Notable Variations

Your code differs from the example in some ways — all are valid:

- 📝 **Naming**: You used `userPermission` instead of `requiredRole` — clear and descriptive.
- 🔄 **Approach**: You used early return pattern instead of nested if — arguably more readable.
- 🎨 **Structure**: You extracted a helper function — good for reusability.

---

**Great work!** You wrote this code, you understand it, you own it. 🎯
```

### Issues Found

```markdown
⚠️ **Code Verification: Issues Found**

---

Your implementation is close! A few behavioral differences to address:

### Issues

#### 1. 🔴 [Critical Issue Title]

**Location**: `src/services/auth.ts:25`

**Expected Behavior**:
[What the code should do]

**Actual Behavior**:
[What the code currently does]

**Why This Matters**:
[Impact on the system]

**Hint**:
[Direction to fix, NOT exact code — let human figure it out]

---

#### 2. 🟡 [Important Issue Title]

**Location**: `src/middleware/auth.ts:42`

**Expected Behavior**:
[What should happen]

**Actual Behavior**:
[What happens instead]

**Hint**:
[Direction to investigate]

---

### What's Working Well

Despite the issues, these parts are excellent:
- ✅ [Positive observation 1]
- ✅ [Positive observation 2]

---

**Your Task**: Fix the issues above, then type **"done"** to re-verify.

🔴 **Note**: I'm showing you WHAT is wrong, not HOW to fix it.
Understanding the fix is part of the learning process.
```

---

## Step 4: Re-verification Loop

If issues were found:

1. Wait for human to fix and report "done"
2. Re-read the modified files
3. Re-run behavioral analysis
4. Present updated verification report
5. Repeat until all issues resolved

---

## Step 5: Completion

After verification passes:

```markdown
🎉 **Implementation Complete!**

---

## Summary

**Task**: [Task description]
**Sections Completed**: [N] of [N]
**Total TODOs**: [X] completed
**Verification**: ✅ Passed

### What You Built

- [Key accomplishment 1]
- [Key accomplishment 2]
- [Key accomplishment 3]

### What You Learned

- [Pattern/concept 1]
- [Pattern/concept 2]
- [Pattern/concept 3]

### Your Creative Variations

- [How their approach differed — positively noted]

---

**You wrote all this code. You understand it. You own it.**
That's the whole point. 🎯
```

---

## Verification Anti-Patterns

### 🔴 NEVER DO

| Anti-Pattern | Why It's Wrong |
|--------------|----------------|
| "You should use `forEach` instead of `for`" | Style preference, not behavioral |
| "My example used `result`, not `output`" | Naming is personal choice |
| "This would be better as a ternary" | Structural preference |
| "You forgot the JSDoc comment" | Documentation is optional variation |
| "Wrong import order" | Linter's job, not verification |

### ✅ ALWAYS DO

| Pattern | Why It's Right |
|---------|---------------|
| "This returns `undefined` when input is empty" | Behavioral difference |
| "The error type here should be X, not Y" | Integration contract |
| "This doesn't handle the case when..." | Missing functionality |
| "Great use of early returns!" | Positive reinforcement |
| "Your approach is actually more efficient" | Acknowledge creativity |

---

## Success Criteria

- [ ] All modified files read
- [ ] Behavioral analysis completed (I/O, edge cases, integration)
- [ ] Verification report presented
- [ ] Creative variations positively acknowledged
- [ ] If issues found: explained WHAT not HOW
- [ ] Re-verification loop completed if needed
- [ ] Completion summary presented
- [ ] 🔴 NEVER criticized style/naming/structural choices
