# Workflow: Trace HTTP Request Flow

Traces an HTTP request from receipt to response, navigating through middleware,
handlers, and service calls interactively.

<required_reading>
**Read these reference files NOW:**
1. `references/framework-patterns.md` (for detected framework section)
2. `references/control-flow-types.md` (branch presentation)
3. `references/explanation-style.md` (output format)
</required_reading>

<state_structure>
## Trace Session State

Store in Serena Memory as `trace_session_{timestamp}`:

```json
{
  "id": "trace_session_1704067200",
  "created_at": "2024-01-01T00:00:00Z",
  "framework": "express",
  "entry_point": {
    "method": "POST",
    "path": "/api/users",
    "file": "src/routes/users.ts",
    "symbol": "createUser",
    "line": 15
  },
  "current_location": {
    "file": "src/services/userService.ts",
    "symbol": "UserService/validateInput",
    "line": 45,
    "step_number": 3
  },
  "path_history": [
    {
      "step": 1,
      "file": "src/routes/users.ts",
      "symbol": "router.post('/users')",
      "type": "route_definition"
    },
    {
      "step": 2,
      "file": "src/middleware/auth.ts",
      "symbol": "authenticate",
      "type": "middleware",
      "branch_choice": "token_valid"
    }
  ],
  "total_steps": 3,
  "status": "in_progress"
}
```
</state_structure>

<process>
## Step 1: Detect Framework and Load Patterns

```bash
# Run framework detection
./scripts/detect-framework.sh "$PROJECT_ROOT"
```

Output to user:
```
🔍 Detecting project framework...

✅ Framework detected: **{framework_name}**

Loading {framework_name}-specific patterns for entry point detection.
```

## Step 2: Find Entry Point

Based on detected framework, use appropriate Serena search:

### For Express
```python
# Search for route registration
search_for_pattern(
    substring_pattern="(app|router)\\.(get|post|put|delete|patch)\\s*\\(['\"`]/{path}",
    restrict_search_to_code_files=True
)

# Then find the handler symbol
find_symbol(
    name_path_pattern="{handler_name}",
    include_body=True
)
```

### For Next.js App Router
```python
# Find API route file
find_file(
    glob_pattern="**/app/api/{path}/**/route.ts"
)

# Find the HTTP method handler
search_for_pattern(
    substring_pattern="export\\s+(async\\s+)?function\\s+{METHOD}",
    relative_path=route_file
)
```

### For Next.js Pages Router
```python
find_file(
    glob_pattern="**/pages/api/{path}.ts"
)
```

### For Fastify
```python
search_for_pattern(
    substring_pattern="fastify\\.(get|post|route)\\s*\\(",
    restrict_search_to_code_files=True
)
```

**Output to user (Entry Point Found):**

```markdown
🎯 **Entry Point Found**

**Route**: `{METHOD} {PATH}`
**File**: `{file_path}`
**Line**: {line_start}-{line_end}

---

📄 **{file_path}:{line_range}**

```{language}
{full_route_definition_code}
```

---

🤔 **What this does**:
{description_of_route_registration}

🎯 **Execution order**:
{list_of_middleware_and_handler_in_order}

💡 **Key insight**:
{framework_specific_insight}

---

**Ready to trace. Press Enter to start, or type a step number to jump.**
```

## Step 3: Initialize Trace State

```python
# Create initial state in Serena Memory
write_memory(
    memory_file_name=f"trace_session_{timestamp}",
    content=json.dumps({
        "id": f"trace_session_{timestamp}",
        "framework": detected_framework,
        "entry_point": entry_point_info,
        "current_location": first_middleware_or_handler,
        "path_history": [],
        "total_steps": middleware_count + 1,  # middlewares + handler
        "status": "in_progress"
    })
)
```

## Step 4: Trace Loop

For each step until terminal:

### 4a. Get Current Symbol Code

```python
# Retrieve full function body
result = find_symbol(
    name_path_pattern=current_symbol,
    relative_path=current_file,
    include_body=True,
    depth=1  # Get immediate children too
)
```

### 4b. Analyze Code for Control Flow

Identify in the code:
- **Function calls** → Potential deep-dive points
- **Conditionals** (`if`, `switch`, `?:`) → Branch points
- **Try/catch** → Error handling paths
- **Returns/Response sends** → Terminal points
- **External library calls** → Application boundary

### 4c. Present Step to User

Follow format from `references/explanation-style.md`:

```markdown
📍 **Step {N} of {Total}**: `{symbol_name}`

**Location**: `{file_path}:{line_start}-{line_end}`
**Type**: {type_description}

---

📄 **{file_path}:{line_range}** (full source)

```{language}
{complete_code_no_abbreviation}
```

---

🤔 **What this does**:
{numbered_list_of_actions}

🎯 **Why it matters**:
{context_in_flow}

{optional: ⚡📊💡🔐 markers}

---

{branch_point_or_next_step}
```

### 4d. Handle Branch Points

If conditional found, present choices using AskUserQuestion:

```markdown
🔀 **Branch Point**: {description}

Choose the path to follow:

1. {emoji} **{condition_A}** → {outcome_A}
2. {emoji} **{condition_B}** → {outcome_B}

(Deep dive options)
3. 🔍 **Trace into `{function_name}`** → See internal logic
```

Wait for user response via AskUserQuestion.

### 4e. Update State

After user choice:

```python
# Read current state
current_state = read_memory("trace_session_{id}")

# Add to path history
current_state["path_history"].append({
    "step": current_step,
    "file": current_file,
    "symbol": current_symbol,
    "type": step_type,
    "branch_choice": user_choice_if_any
})

# Update current location
current_state["current_location"] = next_location

# Save updated state
write_memory("trace_session_{id}", json.dumps(current_state))
```

### 4f. Check for Terminal

Terminal conditions:
- `res.send()`, `res.json()`, `res.end()` (Express)
- `Response.json()`, `NextResponse` (Next.js)
- `reply.send()` (Fastify)
- `return` at top level of handler
- `throw` without enclosing `try`
- User types "stop", "done", "exit"

## Step 5: Present Summary

When terminal reached:

```markdown
📍 **Terminal Point**: Response sent

**Location**: `{file}:{line}`
**Type**: HTTP Response ({status_code} {status_text})

---

📄 **Response code**:

```{language}
{response_sending_code}
```

---

📤 **HTTP Response**:

```http
HTTP/1.1 {status_code} {status_text}
Content-Type: application/json

{example_response_body}
```

---

✅ **Trace Complete**

**Request path taken**:

```
{METHOD} {PATH}
    │
    ▼
┌─────────────────────────────────────┐
│ 1. {step_1_name}                    │
│    {file}:{line}                    │
│    {emoji} {outcome}                │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 2. {step_2_name}                    │
│    ...                              │
└─────────────────────────────────────┘
{... more steps ...}
```

---

**📊 Key Insights from this trace**:

| Insight | Location | Note |
|---------|----------|------|
| {emoji} {brief} | {file}:{line} | {detail} |

---

**Save this trace?**

1. Save as `trace_{method}_{path}_{outcome}`
2. Don't save
```

## Step 6: Save or Discard

If user chooses to save:
```python
# Update status and finalize
state["status"] = "completed"
state["completed_at"] = timestamp
write_memory(f"trace_{method}_{sanitized_path}", json.dumps(state))
```

If user doesn't save:
```python
delete_memory(f"trace_session_{id}")
```
</process>

<external_boundary_handling>
## Handling External Dependencies

When trace reaches a `node_modules` call:

```markdown
📊 **External dependency**: `{package_name}`

**Package**: {package_name}@{version}
**Function**: `{function_called}`

🤔 **What it does**:
{brief_description}

{if_security_relevant}
🔐 **Security note**: {security_consideration}

📚 **Documentation**: {npm_or_official_docs_link}

---

⬅️ **Returning to**: `{calling_function}` in `{calling_file}`

The return value ({return_type}) is used for {how_its_used}.

Continue tracing from the caller?
```

Do NOT trace into the library. Summarize and return to application code.
</external_boundary_handling>

<error_handling>
## Error Scenarios

### Symbol Not Found
```markdown
⚠️ **Symbol not found**: `{symbol_name}`

This could mean:
- The function is defined elsewhere
- It's a dynamic/computed reference
- The code has been refactored

**Options**:
1. 🔍 Search for similar symbols
2. 📝 Specify a different symbol
3. ⏹️ End trace here
```

### Multiple Matches
```markdown
🔀 **Multiple definitions found** for `{symbol_name}`:

1. `{file_1}:{line}` - {description}
2. `{file_2}:{line}` - {description}
3. `{file_3}:{line}` - {description}

Which one should we trace?
```
</error_handling>

<success_criteria>
This workflow is complete when:
- [ ] Entry point identified and explained
- [ ] User navigated through at least one step
- [ ] Conditional branches presented as choices
- [ ] Trace reached terminal OR user stopped
- [ ] Path history displayed as ASCII flowchart
- [ ] Key insights collected
- [ ] State saved to Serena (if user chose)
</success_criteria>
