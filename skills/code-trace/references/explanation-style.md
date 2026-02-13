# Explanation Style Guide

This reference defines the visual format and tone for code trace explanations.
Adopted from `/sc:explain` for educational clarity and consistency.

---

## Thinking Markers

Use these emoji markers to categorize insights:

| Marker | Category | Usage |
|--------|----------|-------|
| 🤔 | **Reasoning** | Explain what code does and how |
| 🎯 | **Decision Point** | Highlight key choices, entry points |
| ⚡ | **Performance** | Note performance implications |
| 📊 | **Pattern** | Identify design patterns, best practices |
| 💡 | **Insight** | Share tips, gotchas, recommendations |
| 🔐 | **Security** | Highlight security considerations |

### Examples

```
🤔 **What this does**: Validates email format using regex before database query.

🎯 **Entry point**: POST /api/users → createUser handler

⚡ **Performance note**: bcrypt hash takes ~250ms intentionally (security measure).

📊 **Pattern**: Factory function returns middleware - enables reuse with different schemas.

💡 **Tip**: Always hash passwords before storage, never store plain text.

🔐 **Security**: Password excluded from response via `select` - prevents hash leakage.
```

---

## Step Format

Each trace step follows this structure:

```markdown
📍 **Step {N} [of {Total}]**: `{symbol_name}`

**Location**: `{file_path}:{line_start}-{line_end}`
**Type**: {function_type} (e.g., Express middleware, async handler)

---

📄 **{file_path}:{line_range}** (full source)

```{language}
{complete_code_without_abbreviation}
```

---

🤔 **What this does**:
{numbered_list_of_actions}

🎯 **Why it matters**:
{context_in_the_flow}

{optional_additional_markers}

---

{branch_point_or_next_step}
```

### Concrete Example

```markdown
📍 **Step 2 of 4**: `validateBody` middleware

**Location**: `src/middleware/validate.ts:5-38`
**Type**: Higher-order Express middleware (factory pattern)

---

📄 **src/middleware/validate.ts:5-38** (full source)

```typescript
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export const validateBody = <T>(schema: ZodSchema<T>) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validatedData = schema.parse(req.body);
      req.body = validatedData;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }));
        res.status(400).json({
          error: 'Validation failed',
          details: formattedErrors
        });
      }
    }
  };
};
```

---

🤔 **What this does**:
1. Factory function takes Zod schema as parameter
2. Returns middleware function for Express
3. `schema.parse()` validates and transforms `req.body`
4. Success: replaces `req.body` with typed data, calls `next()`
5. Failure: returns 400 with field-specific errors

🎯 **Why it matters**:
After this middleware, `req.body` is guaranteed to match the schema type.
No need for runtime type checking in downstream handlers.

📊 **Pattern**: Higher-order function enables schema reuse across routes.

---

🔀 **Branch Point**: Validation result

Choose the path to follow:

1. ✅ **Validation passes** → `next()` called → Continue to handler
2. ❌ **Validation fails** → 400 response with error details
```

---

## Branch Point Format

```markdown
🔀 **Branch Point**: {description}

Choose the path to follow:

1. {emoji} **{condition}** → {outcome}
2. {emoji} **{condition}** → {outcome}
{...more options}

(Deep dive options)
N. 🔍 **Trace into `{function}`** → {description}
```

### Branch Point Emojis

| Emoji | Meaning |
|-------|---------|
| ✅ | Success path / condition true |
| ❌ | Failure path / condition false |
| ⚠️ | Warning / edge case |
| 🔍 | Deep dive option |
| ⏭️ | Skip / continue |

---

## Terminal Point Format

When trace reaches an endpoint (response sent, return, throw):

```markdown
📍 **Terminal Point**: Response sent

**Location**: `{file}:{line}`
**Type**: HTTP Response ({status_code} {status_text})

---

📄 **Response code**:

```typescript
res.status(201).json({
  message: 'User created successfully',
  user: newUser
});
```

---

📤 **HTTP Response**:

```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "message": "User created successfully",
  "user": {
    "id": "...",
    "email": "...",
    "name": "..."
  }
}
```

---

✅ **Trace Complete**
```

---

## Summary Format (End of Trace)

```markdown
✅ **Trace Complete**

**Request path taken**:

```
{HTTP_METHOD} {PATH}
    │
    ▼
┌─────────────────────────────────────┐
│ 1. {step_name}                      │
│    {file_path}:{line_range}         │
│    {choice_emoji} {outcome}         │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 2. {step_name}                      │
│    ...                              │
└─────────────────────────────────────┘
    │
    ▼
...
```

---

**📊 Key Insights from this trace**:

| Insight | Location | Note |
|---------|----------|------|
| {emoji} {brief} | {file}:{line} | {detail} |
| {emoji} {brief} | {file}:{line} | {detail} |

---

**Save this trace?**

1. Save as `{suggested_name}`
2. Don't save
```

---

## Code Display Rules

### Do NOT abbreviate

❌ **Wrong:**
```typescript
export const authenticate = async (req, res, next) => {
  // ... authentication logic ...
  next();
};
```

✅ **Correct:**
```typescript
export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};
```

### Highlight key lines (when helpful)

```typescript
export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];  // ← Extract Bearer token

  if (!token) {
    return res.status(401).json({ error: 'No token' });  // ← Early exit
  }

  // ...
};
```

### Show referenced code

When the traced code references other files (schemas, types, utilities), include them:

```markdown
📄 **src/middleware/validate.ts:15** (main code)

```typescript
const validatedData = schema.parse(req.body);
```

📄 **src/schemas/user.ts:3-15** (referenced schema)

```typescript
export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string()
});
```
```

---

## Tone Guidelines

### Be educational, not verbose

❌ **Too verbose:**
> This middleware function is called validateBody and it takes a schema parameter.
> The schema parameter is a Zod schema that will be used to validate the request body.
> When a request comes in, the middleware will call schema.parse on req.body...

✅ **Educational and concise:**
> Factory function: `validateBody(schema)` returns a middleware that validates `req.body`
> against the provided Zod schema. On success, replaces `req.body` with typed data.

### Use active voice

❌ **Passive:** "The request is validated by the middleware"
✅ **Active:** "Middleware validates the request"

### Be specific about outcomes

❌ **Vague:** "If validation fails, an error is returned"
✅ **Specific:** "If validation fails, returns 400 with field-specific errors"

---

## External Dependency Handling

When tracing reaches a node_modules dependency:

```markdown
📊 **External dependency**: `bcrypt`

This is a node_modules library. Internal implementation is outside Application boundary.

**What it does**: Password hashing using bcrypt algorithm
**Why it's slow**: Intentionally CPU-intensive to prevent brute-force attacks (12 rounds ≈ 250ms)

📚 Documentation: https://www.npmjs.com/package/bcrypt

⬅️ **Returning to**: `createUser` handler
```
