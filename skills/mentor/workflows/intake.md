# Workflow: Intake

Assess context and detect mode (existing codebase vs new project).

---

## Step 1: Determine Mode

Ask the user about their task and determine:

| Mode | Indicators | Next Step |
|------|------------|-----------|
| **A** (Existing) | "modify", "add to", "fix", "refactor", "update", "change" | → understand.md |
| **B** (New) | "learn", "build from scratch", "new project", "unfamiliar with" | → planning.md |

---

## Step 2: Gather Context

### For Mode A (Existing Codebase)

Ask if not clear:

1. **Task Type**:
   - Feature change (modifying existing behavior)
   - Feature addition (adding new capability)
   - Bug fix (correcting unexpected behavior)
   - Refactoring (improving structure without changing behavior)

2. **Target Location** (if known):
   - Specific files: `src/services/auth.ts`
   - Specific functions: `validateUser`, `checkPermissions`
   - Feature area: "the authentication system"

3. **Expected Outcome**:
   - What should happen after the change?
   - Any specific requirements or constraints?

### For Mode B (New Project)

Ask if not clear:

1. **Target Tech Stack**:
   - Framework: Next.js, React Native, Electron, etc.
   - Language: TypeScript, JavaScript, Python, etc.
   - Additional libraries of interest

2. **Learning Goals**:
   - Understand the entire framework
   - Build a specific feature
   - Learn specific patterns (state management, auth, etc.)

3. **Project Scope**:
   - Personal learning project
   - Production application
   - Prototype/POC

---

## Step 3: Detect Tech Stack

If project directory exists, run:

```bash
./scripts/detect-tech-stack.sh /path/to/project
```

This detects: Next.js (App/Pages), React Native, Electron, Express, Fastify, etc.

---

## Step 4: Save Session State

Save session context for later reference:

```json
{
  "mode": "A" | "B",
  "project": {
    "name": "project-name",
    "path": "/path/to/project",
    "tech_stack": "detected-stack"
  },
  "task": {
    "type": "feature-change" | "feature-addition" | "bug-fix" | "refactor" | "learning",
    "description": "user's task description",
    "target_files": ["file1.ts", "file2.ts"],
    "target_functions": ["func1", "func2"]
  },
  "status": "intake_complete"
}
```

---

## Step 5: Route to Next Workflow

| Mode | Next Workflow | Reason |
|------|---------------|--------|
| A (Existing) | `workflows/understand.md` | Must understand existing code before planning |
| B (New) | `workflows/planning.md` | No existing code to understand |

---

## Example Intake Conversation

```
📋 **Mentor Session Started**

What are you working on today?

---

**User**: I need to add role-based permissions to our existing auth system.

---

📊 **Context Assessment**

**Mode Detected**: A (Existing Codebase)
**Task Type**: Feature Addition
**Target Area**: Authentication system

Let me gather a bit more context:

1. Do you know which files handle authentication currently?
2. What roles should be supported (admin, user, etc.)?
3. Should the permission check happen at the API level, middleware, or both?

---

**User**: Auth is in src/services/auth.ts and src/middleware/auth.ts.
Roles are admin, editor, viewer. Check should be at middleware level.

---

✅ **Session Initialized**

**Project**: /Users/dev/my-app (Next.js App Router)
**Task**: Add role-based permissions to authentication
**Target Files**: src/services/auth.ts, src/middleware/auth.ts
**Roles**: admin, editor, viewer
**Scope**: Middleware-level permission checks

**Next Step**: Understanding existing code before planning changes.

Proceeding to code analysis...
```

---

## Success Criteria

- [ ] Mode (A or B) clearly determined
- [ ] Task type and scope identified
- [ ] Target files/functions documented (Mode A)
- [ ] Learning goals documented (Mode B)
- [ ] Tech stack detected
- [ ] Session state saved
- [ ] Routed to correct next workflow
