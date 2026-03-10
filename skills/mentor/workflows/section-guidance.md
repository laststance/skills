# Workflow: Section Guidance

**Purpose**: Guide human through each TODO with detailed code examples.
**This is the CORE LOOP of the mentor skill.**

---

## Critical Rules

🔴 **Rule 1**: Show COMPLETE code (no abbreviation like "// ... rest")
🔴 **Rule 2**: WAIT for human to report "done" before proceeding
🔴 **Rule 3**: NEVER write full code directly into files
🔴 **Rule 4**: Only inject assist comments when the approved plan explicitly calls for them
🔴 **Rule 5**: Human's creative variations are VALID (don't force conformity)

---

## Step 1: Load Current Progress

Read from approved plan (via plan-gate):
- Current section
- Current TODO
- Completed TODOs
- Design decisions (from deep-design phase)

---

## Step 2: Present TODO Context

For each TODO, start with context:

```markdown
📍 **TODO [ID]**: [Name]

---

**Where We Are**:
- Section: S01 - [Section Name]
- Progress: TODO 2 of 5

**What This Accomplishes**:
[Explanation of what this TODO achieves]

**Why It's Needed**:
[How this fits into the larger feature/fix]

**Where It Fits**:
[Architectural context - what calls this, what this calls]

---
```

---

## Step 3: Inject Assist Comments (Optional)

Reference `references/assist-comments.md`.

If the approved plan includes assist comments for the current TODO:

1. Inject the smallest useful comment set into the target file
2. Show the human exactly what was inserted
3. Explain why the comments were added
4. Continue with the normal code example

Use this presentation format:

```markdown
## Assist Comment Injection

📄 **ASSIST COMMENTS**: `src/services/auth.ts:validateUser`

```typescript
// ASSIST: Keep this backward-compatible so existing callers still work unchanged.
// ASSIST: Add role validation before returning the decoded user.
```

**Why These Were Added**:
- Mark the insertion point for the new behavior
- Preserve the existing caller contract while the human implements the change

**How To Use Them**:
- Implement around these comments
- Keep them if they remain useful after implementation
- Remove or rewrite them if they become stale

---
```

If no assist comments are planned, skip this step.

---

## Step 4: Show Code Example

### For Mode A (Existing Codebase)

**CRITICAL**: Show existing code FIRST, then modified version.

```markdown
📄 **CURRENT**: `src/services/auth.ts:validateUser`

```typescript
/**
 * Validates a user token and returns the decoded user.
 *
 * @param token - JWT token from request
 * @returns Decoded user object
 * @throws TokenExpiredError if token is expired
 */
export async function validateUser(token: string): Promise<User> {
  // Verify the token using the secret key
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  // Return the decoded user data
  return decoded as User;
}
```

**What This Does**:
- Receives a JWT token as input
- Verifies token signature against secret
- Returns decoded user data
- Throws if token is invalid/expired

---

📄 **MODIFIED**: `src/services/auth.ts:validateUser`

```typescript
/**
 * Validates a user token and optionally checks for a required role.
 *
 * @param token - JWT token from request
 * @param requiredRole - Optional role the user must have
 * @returns Decoded user object
 * @throws TokenExpiredError if token is expired
 * @throws UnauthorizedError if user lacks required role
 */
export async function validateUser(
  token: string,
  requiredRole?: UserRole  // ADDED: Optional role requirement
): Promise<User> {
  // Verify the token using the secret key
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  // ADDED: Check role if required
  // This is backward-compatible: existing callers without role parameter still work
  if (requiredRole && decoded.role !== requiredRole) {
    // Throw specific error for role mismatch
    // This allows middleware to return 403 instead of 401
    throw new UnauthorizedError(
      `Required role: ${requiredRole}, actual: ${decoded.role}`
    );
  }

  // Return the decoded user data (unchanged)
  return decoded as User;
}
```

**What Changed**:
| Line | Change | Reason |
|------|--------|--------|
| Param | Added `requiredRole?: UserRole` | Enable role checking |
| Line 15-20 | Added role validation | Enforce permissions |

**Why This Approach**:
- 🔄 **Backward Compatible**: Optional param means existing callers don't break
- 🔐 **Specific Errors**: UnauthorizedError enables proper 403 response
- 📝 **Self-Documenting**: JSDoc explains the new behavior

**Impact on Callers**:
- Existing callers: ✅ No changes needed (still works)
- New callers wanting role check: Pass `requiredRole` parameter

---
```

### For Mode B (New Project)

Show complete new code with comprehensive comments:

```markdown
📄 **NEW FILE**: `src/services/auth.ts`

```typescript
/**
 * Authentication Service
 *
 * Handles user authentication including token validation and generation.
 * Uses JWT for stateless authentication.
 *
 * @module services/auth
 */

import jwt from 'jsonwebtoken';
import { User, UserRole } from '@/types/auth';
import { UnauthorizedError, TokenExpiredError } from '@/lib/errors';

// Load secret from environment
// In production, use a strong, randomly generated secret
const JWT_SECRET = process.env.JWT_SECRET!;

// Token expiration time (1 day)
// Adjust based on security requirements
const TOKEN_EXPIRY = '1d';

/**
 * Validates a user token and returns the decoded user.
 *
 * @param token - JWT token from request header
 * @returns Decoded user object containing id, email, role
 * @throws TokenExpiredError if token has expired
 * @throws UnauthorizedError if token is invalid
 *
 * @example
 * ```typescript
 * const user = await validateUser(request.headers.authorization);
 * console.log(user.email); // "user@example.com"
 * ```
 */
export async function validateUser(token: string): Promise<User> {
  try {
    // jwt.verify() both decodes AND validates the token
    // It checks: signature, expiration, and structure
    const decoded = jwt.verify(token, JWT_SECRET);

    // Type assertion is safe here because we control token generation
    return decoded as User;
  } catch (error) {
    // Handle specific JWT errors with appropriate exceptions
    if (error instanceof jwt.TokenExpiredError) {
      throw new TokenExpiredError('Token has expired');
    }
    throw new UnauthorizedError('Invalid token');
  }
}

/**
 * Generates a JWT token for a user.
 *
 * @param user - User object to encode in the token
 * @returns Signed JWT token string
 *
 * @example
 * ```typescript
 * const token = generateToken({ id: '123', email: 'user@example.com', role: 'user' });
 * // Returns: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 * ```
 */
export function generateToken(user: User): string {
  // Include only necessary data in the token
  // Avoid putting sensitive data like passwords
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}
```

**Key Patterns to Notice**:

1. 📝 **Module-Level JSDoc**: Explains the module's purpose
2. 🔒 **Environment Variables**: Secrets loaded from env
3. 🎯 **Type Safety**: TypeScript types for all inputs/outputs
4. 📖 **JSDoc with Examples**: Every function has usage examples
5. ⚠️ **Error Handling**: Specific error types for different failures

---
```

---

## Step 5: Wait for Completion

**CRITICAL**: Do NOT proceed automatically.

```markdown
---

**Your Task**: [Action to take]

Type **"done"** when complete, or ask questions about any part.

---
```

### While Waiting

User may:
- Ask clarifying questions → Answer and continue waiting
- Report confusion → Explain differently
- Share their implementation → Provide feedback if requested
- Report "done" → Proceed to next TODO
- Ask whether to keep/remove assist comments → Advise based on whether they remain useful and accurate

### Example Interaction

```
User: I don't understand why we need a separate error type for expired tokens.

AI: Great question! The reason is...
[Explanation]
Does that make sense? Let me know when you're ready to continue.

User: Got it. I wrote the code but I added a refresh token check too.

AI: That's a great addition! Your implementation sounds solid.
If you'd like, I can take a look at your code for feedback.
Otherwise, type "done" to proceed to the next TODO.

User: done

AI: [Proceeds to next TODO]
```

---

## Step 6: Update Progress

After "done":
- Mark current TODO as "done"
- Move to next TODO (or next section if section complete)

---

## Step 7: Section Completion Check

After all TODOs in a section:

```markdown
✅ **Section S01 Complete!**

**Completed TODOs**:
- ✓ T01.1: Add Role and Permission types
- ✓ T01.2: Add role parameter to validateUser()
- ✓ T01.3: Implement hasPermission() helper
- ✓ T01.4: Update existing tests
- ✓ T01.5: Add new tests for role validation

**Next Step**: Validation

We'll now run lint, typecheck, and tests to verify everything works.

Ready to validate? (yes/no)
```

→ Route to `workflows/validation.md`

### After All Sections Complete

When the last section's validation passes:

→ Route to `workflows/code-verify.md` for mandatory behavioral verification

---

## Code Presentation Guidelines

### Always Include

1. **Complete File Path**: `src/services/auth.ts`
2. **Full Code**: No `// ... rest of file` abbreviations
3. **JSDoc Comments**: For functions, classes, modules
4. **Inline Comments**: For non-obvious logic
5. **Type Annotations**: All parameters and returns typed
6. **Assist Comment Prefix**: Use `// ASSIST:` for injected scaffolding comments

### Comment Style

```typescript
// GOOD: Explains WHY
// Use optional parameter for backward compatibility with existing callers
const requiredRole?: UserRole

// BAD: Explains WHAT (obvious from code)
// Add the required role parameter
const requiredRole?: UserRole
```

### Assist Comment Style

```typescript
// GOOD: Durable guidance with intent
// ASSIST: Keep this branch side-effect free so later retries stay predictable.

// BAD: Nearly writes the solution
// ASSIST: Call retryRequest(), increment retries, then return the new response.
```

### Change Markers (Mode A)

Use clear markers for changes:

```typescript
// ADDED: [explanation]
// CHANGED: [explanation]
// REMOVED: [explanation] - this line was deleted
// MOVED: [explanation] - this moved from [location]
```

---

## Handling User Variations

When user's code differs from example:

### If It Works
```
✅ Your implementation works and achieves the goal.
Your approach [brief description of difference] is perfectly valid.
Proceeding to next TODO.
```

### If It Has Issues
```
I noticed [specific issue]. This might cause [problem].
Would you like me to explain?

Note: Your overall approach is valid. This is just a potential edge case.
```

🔴 **NEVER**: "You should have done it my way."
✅ **ALWAYS**: Respect working variations.

---

## Success Criteria

- [ ] TODO context clearly presented
- [ ] If planned: assist comments injected and shown to the human
- [ ] Complete code shown (no abbreviation)
- [ ] Mode A: CURRENT → MODIFIED format used
- [ ] Mode B: Full file with comprehensive comments
- [ ] Waited for explicit "done" signal
- [ ] Answered any questions before proceeding
- [ ] User's creative variations respected
- [ ] Progress updated
- [ ] Routed to validation after section complete
