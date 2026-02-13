# TODO Item Template

Use this template for presenting individual TODOs in the section-guidance workflow.

---

## Template

```markdown
📍 **TODO [ID]**: [Name]

---

**Where We Are**:
- Section: [Section ID] - [Section Name]
- Progress: TODO [N] of [Total]

---

## Context

**What This Accomplishes**:
[Brief explanation of what completing this TODO achieves]

**Why It's Needed**:
[How this fits into the larger feature/fix/task]

**Where It Fits**:
[Architectural context - what calls this, what this calls, etc.]

---

## Code Example

[For Mode A - Existing Codebase]

📄 **CURRENT**: `[file:function]`

```[language]
// Existing implementation
[code]
```

**What This Does**: [Explanation]

---

📄 **MODIFIED**: `[file:function]`

```[language]
// CHANGED: [Description]
[modified code with change markers]
```

**What Changed**:
| Line | Change | Reason |
|------|--------|--------|
| [line] | [change type] | [reason] |

**Why This Change**:
[Explanation of modification purpose]

**Impact**:
- Callers: [Any callers that need updating]
- Tests: [Test changes needed]

---

[For Mode B - New Project]

📄 **NEW FILE**: `[path/to/file]`

```[language]
/**
 * [Module/Function Description]
 */
[full code with comprehensive comments]
```

**Key Patterns to Notice**:
1. [Pattern 1]: [Explanation]
2. [Pattern 2]: [Explanation]

---

## Your Task

[Specific instructions for the human]

- Create/modify the file at `[path]`
- [Additional specific instructions]
- You may adapt styling/naming to match your preferences

Type **"done"** when complete, or ask questions about any part.

---
```

---

## Example: Mode A (Existing Codebase)

```markdown
📍 **TODO T01.2**: Add role parameter to validateUser

---

**Where We Are**:
- Section: S01 - Type Definitions & Auth Service
- Progress: TODO 2 of 5

---

## Context

**What This Accomplishes**:
Enables the validateUser function to optionally check user roles,
allowing for role-based access control throughout the application.

**Why It's Needed**:
Currently, validateUser only confirms the user is logged in.
We need to also verify they have the required permission level.

**Where It Fits**:
- Called by: authMiddleware, loginHandler, API routes
- Calls: jwt.verify, error handlers
- Will enable: requireRole middleware (TODO T02.1)

---

## Code Example

📄 **CURRENT**: `src/services/auth.ts:validateUser`

```typescript
export async function validateUser(token: string): Promise<User> {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  return decoded as User;
}
```

**What This Does**: Validates JWT token and returns decoded user data.

---

📄 **MODIFIED**: `src/services/auth.ts:validateUser`

```typescript
// CHANGED: Added optional role validation parameter
export async function validateUser(
  token: string,
  requiredRole?: UserRole  // ADDED: Optional role requirement
): Promise<User> {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  // ADDED: Role validation when specified
  if (requiredRole && decoded.role !== requiredRole) {
    throw new UnauthorizedError(
      `Required role: ${requiredRole}, actual: ${decoded.role}`
    );
  }

  return decoded as User;
}
```

**What Changed**:
| Line | Change | Reason |
|------|--------|--------|
| Param | Added `requiredRole?: UserRole` | Enable optional role checking |
| L8-12 | Added role validation | Enforce role-based access |

**Why This Change**:
Optional parameter maintains backward compatibility while enabling new functionality.

**Impact**:
- Callers: No changes required (optional param)
- Tests: Need new tests for role validation logic

---

## Your Task

Modify the validateUser function in `src/services/auth.ts`:

- Add the optional `requiredRole` parameter
- Implement the role checking logic
- Keep the existing return behavior unchanged

Type **"done"** when complete, or ask questions about any part.

---
```

---

## Example: Mode B (New Project)

```markdown
📍 **TODO T01.1**: Create authentication service

---

**Where We Are**:
- Section: S01 - Authentication Setup
- Progress: TODO 1 of 5

---

## Context

**What This Accomplishes**:
Creates the core authentication service that handles JWT token
validation and generation for the entire application.

**Why It's Needed**:
This is the foundation for all authenticated features.
Without this, we can't protect routes or identify users.

**Where It Fits**:
- Will be called by: authMiddleware (T01.3), login/logout handlers (T02.x)
- Depends on: JWT library, environment config
- Exports: validateUser, generateToken

---

## Code Example

📄 **NEW FILE**: `src/services/auth.ts`

```typescript
/**
 * Authentication Service
 *
 * Handles JWT token validation and generation.
 * Used by middleware and route handlers for user authentication.
 *
 * @module services/auth
 */

import jwt from 'jsonwebtoken';
import { User } from '@/types/auth';
import { UnauthorizedError, TokenExpiredError } from '@/lib/errors';

// Load from environment - ensure JWT_SECRET is set in production
const JWT_SECRET = process.env.JWT_SECRET!;
const TOKEN_EXPIRY = '1d';

/**
 * Validates a JWT token and returns the decoded user.
 *
 * @param token - JWT token from authorization header
 * @returns Decoded user object
 * @throws TokenExpiredError if token has expired
 * @throws UnauthorizedError if token is invalid
 */
export async function validateUser(token: string): Promise<User> {
  try {
    // jwt.verify checks signature, expiration, and structure
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded as User;
  } catch (error) {
    // Provide specific error types for different failure modes
    if (error instanceof jwt.TokenExpiredError) {
      throw new TokenExpiredError('Token has expired');
    }
    throw new UnauthorizedError('Invalid token');
  }
}

/**
 * Generates a JWT token for a user.
 *
 * @param user - User object to encode
 * @returns Signed JWT token string
 */
export function generateToken(user: User): string {
  // Include only necessary claims - avoid sensitive data
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}
```

**Key Patterns to Notice**:
1. 📝 **Module JSDoc**: Explains the service's purpose and usage
2. 🔐 **Environment Config**: Secrets loaded from env, not hardcoded
3. ⚠️ **Error Specificity**: Different error types for different failures
4. 📊 **Minimal Claims**: Only necessary data in JWT payload

---

## Your Task

Create the authentication service:

- Create file at `src/services/auth.ts`
- Implement both functions as shown
- Ensure error types are imported/created

Type **"done"** when complete, or ask questions about any part.

---
```
