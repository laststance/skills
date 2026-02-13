# Control Flow Types and Branch Handling

This reference defines how to present different control flow structures as interactive choices.

---

## General Principle

Every control flow structure that can take multiple paths becomes an **AskUserQuestion** choice.
The goal is to let users explore the code path they're interested in.

---

## Conditional Statements

### if/else

**Code pattern:**
```typescript
if (user.isAdmin) {
  // Admin path
  return adminDashboard(user);
} else {
  // Regular user path
  return userDashboard(user);
}
```

**Presentation:**
```
🔀 **Branch Point**: Admin check

Choose the path to follow:

1. ✅ `user.isAdmin` is **true** → Execute admin logic, return `adminDashboard(user)`
2. ❌ `user.isAdmin` is **false** → Execute regular user logic, return `userDashboard(user)`
```

### if without else

**Code pattern:**
```typescript
if (!user.email) {
  return res.status(400).json({ error: 'Email required' });
}
// Continue with main logic
```

**Presentation:**
```
🔀 **Branch Point**: Email guard clause

Choose the path to follow:

1. ✅ `user.email` **exists** → Skip guard, continue to main logic
2. ❌ `user.email` is **missing** → Return 400 error (early exit)
```

### else if chain

**Code pattern:**
```typescript
if (status === 'pending') {
  return processPending();
} else if (status === 'approved') {
  return processApproved();
} else if (status === 'rejected') {
  return processRejected();
} else {
  return handleUnknown();
}
```

**Presentation:**
```
🔀 **Branch Point**: Status handling

Choose the path to follow:

1. `status === 'pending'` → Process pending items
2. `status === 'approved'` → Process approved items
3. `status === 'rejected'` → Process rejected items
4. Default (unknown status) → Handle unknown status
```

---

## Switch Statements

### Basic switch

**Code pattern:**
```typescript
switch (req.method) {
  case 'GET':
    return handleGet(req, res);
  case 'POST':
    return handlePost(req, res);
  case 'PUT':
    return handlePut(req, res);
  default:
    return res.status(405).json({ error: 'Method not allowed' });
}
```

**Presentation:**
```
🔀 **Branch Point**: HTTP method routing

Choose the path to follow:

1. `GET` → Execute `handleGet(req, res)`
2. `POST` → Execute `handlePost(req, res)`
3. `PUT` → Execute `handlePut(req, res)`
4. Other methods → Return 405 Method Not Allowed
```

### Switch with fall-through

**Code pattern:**
```typescript
switch (role) {
  case 'superadmin':
  case 'admin':
    canDelete = true;
    // fall through
  case 'moderator':
    canEdit = true;
    break;
  default:
    canEdit = false;
}
```

**Presentation:**
```
🔀 **Branch Point**: Role permissions (with fall-through)

Choose the path to follow:

1. `superadmin` or `admin` → Set canDelete=true, then fall through to moderator
2. `moderator` → Set canEdit=true
3. Other roles → Set canEdit=false

⚠️ Note: Cases 1-2 use fall-through pattern
```

---

## Error Handling

### try/catch

**Code pattern:**
```typescript
try {
  const user = await db.user.create(data);
  return res.json(user);
} catch (error) {
  if (error instanceof PrismaClientKnownRequestError) {
    return res.status(409).json({ error: 'Duplicate entry' });
  }
  throw error;
}
```

**Presentation:**
```
🔀 **Branch Point**: Database operation

Choose the path to follow:

1. ✅ **Success path** → User created, return JSON response
2. ❌ **PrismaClientKnownRequestError** → Return 409 Conflict (duplicate entry)
3. ❌ **Other errors** → Re-throw error (propagate to error handler)
```

### try/catch/finally

**Code pattern:**
```typescript
try {
  await connection.open();
  const result = await connection.query(sql);
  return result;
} catch (error) {
  logger.error('Query failed', error);
  throw error;
} finally {
  await connection.close();
}
```

**Presentation:**
```
🔀 **Branch Point**: Database query with cleanup

Choose the path to follow:

1. ✅ **Success path** → Query executes, return result
2. ❌ **Error path** → Log error, re-throw

📌 **Note**: `finally` block ALWAYS runs (closes connection) regardless of path
```

---

## Promise Handling

### Promise .then/.catch chain

**Code pattern:**
```typescript
fetchUser(id)
  .then(user => fetchOrders(user.id))
  .then(orders => calculateTotal(orders))
  .catch(error => handleError(error))
  .finally(() => cleanup());
```

**Presentation:**
```
🔀 **Branch Point**: Promise chain

The chain has multiple potential failure points:

1. ✅ **All succeed** → fetchUser → fetchOrders → calculateTotal → return result
2. ❌ **fetchUser fails** → Jump to catch → handleError
3. ❌ **fetchOrders fails** → Jump to catch → handleError
4. ❌ **calculateTotal fails** → Jump to catch → handleError

📌 **Note**: `finally` ALWAYS runs after chain completes

Which step would you like to trace?
```

### async/await with multiple awaits

**Code pattern:**
```typescript
async function processOrder(orderId: string) {
  const order = await getOrder(orderId);        // Can fail
  const inventory = await checkInventory(order); // Can fail
  const payment = await processPayment(order);   // Can fail
  const shipment = await createShipment(order);  // Can fail
  return { order, payment, shipment };
}
```

**Presentation:**
```
🔀 **Branch Point**: Multi-step async operation

Each `await` is a potential failure point:

1. `getOrder(orderId)` → Fetch order from database
2. `checkInventory(order)` → Verify stock availability
3. `processPayment(order)` → Charge customer
4. `createShipment(order)` → Create shipping label

Which step would you like to trace? (Or choose "success" to see the happy path)

- 1-4: Trace into that specific step
- ✅ Success: Assume all steps pass, show return value
- ❌ Fail at step N: See error handling for that step
```

---

## Loops

### for/while/do-while

**Principle**: Don't ask for each iteration. Summarize the loop behavior.

**Code pattern:**
```typescript
for (const item of items) {
  await processItem(item);
  if (item.priority === 'high') {
    await notifyAdmin(item);
  }
}
```

**Presentation:**
```
📍 **Loop**: Processing items array

**Behavior**: Iterates over `items` array (${items.length} items)

For each item:
1. Call `processItem(item)` - async processing
2. If `item.priority === 'high'` → Also call `notifyAdmin(item)`

**Options**:
1. 🔍 **Trace `processItem()`** → See what happens inside
2. 🔍 **Trace `notifyAdmin()`** → See notification logic
3. ➡️ **Skip loop** → Continue to code after loop
```

### Loop with early exit (break/continue)

**Code pattern:**
```typescript
for (const user of users) {
  if (user.inactive) continue;

  const result = await processUser(user);
  if (result.error) break;
}
```

**Presentation:**
```
📍 **Loop**: Processing users with early exit

**Behavior**: Iterates over `users` array

For each user:
1. If `user.inactive` → **continue** (skip to next user)
2. Call `processUser(user)`
3. If `result.error` → **break** (exit loop entirely)

**Options**:
1. ✅ User is active, no error → Process and continue
2. ⏭️ User is inactive → Skip (continue)
3. ❌ Processing error → Exit loop (break)
4. 🔍 Trace `processUser()` → See processing logic
```

---

## Ternary Expressions

**Principle**: Don't make a choice point. Explain both paths inline.

**Code pattern:**
```typescript
const greeting = user.isVIP ? `Welcome back, ${user.name}!` : 'Hello!';
```

**Presentation (inline, no choice)**:
```
📍 **Expression**: Ternary assignment

```typescript
const greeting = user.isVIP ? `Welcome back, ${user.name}!` : 'Hello!';
```

🤔 **What this does**:
- If `user.isVIP` is true → greeting = "Welcome back, {name}!"
- If `user.isVIP` is false → greeting = "Hello!"

(No branch choice - this is a single expression)
```

---

## Nullish/Optional Chaining

### Nullish coalescing (??)

**Code pattern:**
```typescript
const port = process.env.PORT ?? 3000;
```

**Presentation (inline)**:
```
📍 **Expression**: Nullish coalescing

`port` = `process.env.PORT` if defined, otherwise `3000`
```

### Optional chaining (?.)

**Code pattern:**
```typescript
const city = user?.address?.city ?? 'Unknown';
```

**Presentation (inline)**:
```
📍 **Expression**: Optional chaining with fallback

Safely access nested property. If any part is null/undefined, returns 'Unknown'.
```

---

## Short-Circuit Evaluation

### Logical AND (&&)

**Code pattern:**
```typescript
user.isAdmin && logAdminAccess(user);
```

**Presentation**:
```
📍 **Expression**: Short-circuit AND

If `user.isAdmin` is true → Execute `logAdminAccess(user)`
If `user.isAdmin` is false → Skip (short-circuit)

(Function only called for admins)
```

### Logical OR (||)

**Code pattern:**
```typescript
const name = user.displayName || user.email || 'Anonymous';
```

**Presentation**:
```
📍 **Expression**: Short-circuit OR chain

Returns first truthy value:
1. `user.displayName` (if truthy)
2. `user.email` (if displayName falsy)
3. 'Anonymous' (fallback)
```

---

## Summary: When to Ask vs. Explain Inline

| Pattern | Behavior |
|---------|----------|
| if/else | **Ask** - Major branch point |
| switch | **Ask** - Multiple distinct paths |
| try/catch | **Ask** - Success vs error paths |
| Loops | **Summarize** - Don't ask per iteration |
| Ternary | **Inline** - Single expression |
| ?. / ?? | **Inline** - Safe access pattern |
| && / \|\| | **Inline** - Short-circuit pattern |
