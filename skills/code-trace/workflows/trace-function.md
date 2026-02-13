# Workflow: Trace Function Call Chain

Traces a specific function through the codebase, exploring what it calls
and how data flows through it.

<required_reading>
**Read these reference files NOW:**
1. `references/control-flow-types.md` (branch presentation)
2. `references/explanation-style.md` (output format)
</required_reading>

<process>
## Step 1: Identify Target Function

User provides one of:
- Function name: `validateUser`
- File + function: `src/utils/auth.ts:checkToken`
- Pattern: "the function that hashes passwords"

### If function name only:

```python
# Search for the function definition
results = find_symbol(
    name_path_pattern="{function_name}",
    include_body=False,
    substring_matching=True
)
```

If multiple matches:
```markdown
🔀 **Multiple functions found** matching `{name}`:

1. `{file_1}:{line}` - `{full_symbol_path}` ({description})
2. `{file_2}:{line}` - `{full_symbol_path}` ({description})
3. `{file_3}:{line}` - `{full_symbol_path}` ({description})

Which one would you like to trace?
```

### If file + function:

```python
result = find_symbol(
    name_path_pattern="{function_name}",
    relative_path="{file_path}",
    include_body=True,
    depth=1
)
```

## Step 2: Present Function Overview

```markdown
🎯 **Function Found**: `{function_name}`

**Location**: `{file_path}:{line_start}-{line_end}`
**Type**: {function_type} (async function | class method | arrow function | etc.)
**Exported**: {yes/no}

---

📄 **{file_path}:{line_range}** (full source)

```{language}
{complete_function_code}
```

---

🤔 **What this does**:
{description}

📊 **Structure**:
- Parameters: `{params_with_types}`
- Returns: `{return_type}`
- Calls: {list_of_function_calls}
- Branches: {count} decision points

---

**Start tracing?** Press Enter to begin step-by-step, or:
- Type a line number to jump there
- Type a function name to trace into that call
```

## Step 3: Find Callers (Optional Context)

```python
# Find who calls this function
callers = find_referencing_symbols(
    name_path_pattern="{function_name}",
    relative_path="{file_path}"
)
```

```markdown
📞 **Who calls this function**:

| Caller | Location | Context |
|--------|----------|---------|
| `{caller_1}` | `{file}:{line}` | {snippet} |
| `{caller_2}` | `{file}:{line}` | {snippet} |

Would you like to trace from a specific caller? (Optional)
```

## Step 4: Trace Through Function Body

For each significant code block:

### 4a. Variable Declarations / Assignments

```markdown
📍 **Line {N}**: Variable assignment

```{language}
const {name} = {expression};
```

🤔 **What this does**: {explanation}

{if expression is function call}
🔍 **Trace into `{function_name}`?** This call is evaluating the expression.
```

### 4b. Function Calls

```markdown
📍 **Line {N}**: Function call

```{language}
const result = someFunction(arg1, arg2);
```

🤔 **What this does**: Calls `{function_name}` with {args_description}

**Options**:
1. 🔍 **Trace into** `{function_name}` → See what happens inside
2. ➡️ **Skip** → Continue to next line (assume it returns successfully)
```

### 4c. Conditionals

Follow `references/control-flow-types.md` for presentation.

### 4d. Loops

```markdown
📍 **Lines {N}-{M}**: Loop

```{language}
for (const item of items) {
  await processItem(item);
}
```

🤔 **What this does**: Iterates over `{collection}`, calling `{body_description}` for each

**Options**:
1. 🔍 **Trace loop body** → See what happens in each iteration
2. ➡️ **Skip loop** → Continue after loop completes
```

### 4e. Returns

```markdown
📍 **Line {N}**: Return statement

```{language}
return { success: true, data: result };
```

🤔 **What this does**: Function exits here, returning {return_description}

{if inside conditional}
⚠️ **Note**: This is an early return inside a conditional branch.

---

{if this is the final return in the function}
✅ **End of function**
```

## Step 5: Summary

When trace completes:

```markdown
✅ **Function Trace Complete**: `{function_name}`

**Path taken through function**:

```
{function_name}({params})
    │
    ├─ Line {N}: {action}
    │
    ├─ Line {M}: {action}
    │     └─ Called: {sub_function}
    │
    ├─ Line {P}: Branch → {choice_made}
    │
    └─ Line {Q}: return {value}
```

**📊 Key Insights**:

| Insight | Line | Note |
|---------|------|------|
| {emoji} {brief} | {line} | {detail} |

**📞 Callers of this function**: {count}
**🔗 Functions called by this**: {list}

---

**Options**:
1. 🔍 Trace one of the called functions
2. 🔍 Trace from a caller's perspective
3. 💾 Save this trace
4. ✅ Done
```
</process>

<deep_dive_handling>
## Handling Deep Dive Requests

When user chooses to trace into a called function:

1. **Save current position** in path history
2. **Push onto call stack** in state
3. **Load new function** as current
4. **Continue trace loop**

When returning from deep dive:

```markdown
⬅️ **Returning to**: `{caller_function}` at line {line}

We traced `{callee_function}`, which returned `{return_value_or_type}`.

Continuing from where we left off...
```

Pop from call stack, restore previous position.
</deep_dive_handling>

<state_structure>
## Function Trace State

```json
{
  "id": "trace_func_{timestamp}",
  "type": "function_trace",
  "target": {
    "name": "validateUser",
    "file": "src/utils/validation.ts",
    "line_start": 15,
    "line_end": 45
  },
  "current_line": 23,
  "call_stack": [
    {
      "function": "validateUser",
      "file": "src/utils/validation.ts",
      "paused_at_line": 23
    }
  ],
  "path_history": [
    { "line": 16, "action": "param_destructure" },
    { "line": 18, "action": "call", "callee": "checkEmail" },
    { "line": 23, "action": "branch", "choice": "email_valid" }
  ],
  "status": "in_progress"
}
```
</state_structure>

<success_criteria>
This workflow is complete when:
- [ ] Target function located and displayed
- [ ] User navigated through function body
- [ ] Branch points presented as choices
- [ ] Deep dives into called functions (if requested)
- [ ] Return value / exit point reached
- [ ] Path through function summarized
- [ ] Call relationships shown
</success_criteria>
