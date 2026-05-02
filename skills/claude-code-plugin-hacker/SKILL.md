---
name: claude-code-plugin-hacker
description: Debug, audit, and fix Claude Code plugin hooks, skills, and cache issues. Use when seeing hook errors, plugin misbehavior, or investigating plugin internals.
---

# Claude Code Plugin Hacker

Specialist skill for debugging and fixing Claude Code plugin system issues.

## When to Use

- `SessionStart:startup hook error` or any hook error on launch
- Plugin behavior after enable/disable doesn't match expectations
- Investigating how plugins, hooks, and skills interact
- Fixing broken plugin hooks across projects
- Auditing which plugins inject what into sessions

## Critical Knowledge

### `enabledPlugins: false` Is NOT a Kill Switch

| Component | When `false` | When `true` |
|-----------|-------------|-------------|
| **hooks** | Still execute | Execute |
| **skills** | Still accessible via Skill tool | Accessible |
| **CLAUDE.md** | Likely not loaded | Loaded |
| **agents** | Likely not registered | Registered |

To truly stop a hook: edit `hooks.json` in cache, delete cache dir, or fix the script.

### Plugin Cache Is Versioned

```
~/.claude/plugins/cache/<marketplace>/<plugin>/<hash>/
```

- `<hash>` = git commit hash of `~/.claude` repo (when it's a git repo)
- New commit → new cache directory → new copy of hooks/skills
- Fixing ONE cached version does NOT fix others
- **Always use `find ... -exec` for bulk fixes**

### Hook Execution Environment

Claude Code runs hooks in a minimal environment:
- Restricted `PATH` (may lack `timeout`, `jq`, etc.)
- Minimal environment variables (many unset)
- Short timeout on hook execution
- stdin receives JSON with hook context
- stdout must emit valid JSON for context injection
- Non-zero exit code → "hook error" displayed to user

## Phase 1: Audit

Enumerate ALL hook sources. Run these diagnostics:

```bash
# 1. List ALL plugin hooks.json files
find ~/.claude/plugins/cache -name "hooks.json" -path "*/hooks/*" \
  -exec echo "=== {} ===" \; -exec cat {} \;

# 2. Find ALL SessionStart hooks specifically
find ~/.claude/plugins/cache -name "hooks.json" -path "*/hooks/*" \
  -exec grep -l "SessionStart" {} \;

# 3. User-defined hooks in settings.json
grep -A5 '"SessionStart"' ~/.claude/settings.json

# 4. List enabled plugins
grep -A1 'enabledPlugins' ~/.claude/settings.json | head -30

# 5. Count cached versions per plugin
for d in ~/.claude/plugins/cache/*/*/; do
  plugin=$(echo "$d" | rev | cut -d/ -f3-2 | rev)
  echo "$plugin: $(ls -d ${d}*/ 2>/dev/null | wc -l) versions"
done
```

**Output:** Complete map of hooks × plugins × versions.

## Phase 2: Diagnose

Test each suspicious hook in isolation:

```bash
# Test a hook script directly
echo '{"source":"startup","session_id":"diag-test"}' | \
  CLAUDE_PLUGIN_ROOT="<plugin_root>" \
  <hook_command> 2>&1
echo "EXIT: $?"
```

### Known Failure Patterns

| Pattern | Signature | Root Cause | Fix |
|---------|-----------|------------|-----|
| Permission denied | `EACCES`, exit 126/127 | `.sh` script missing `+x` | `chmod +x` all copies |
| Unset variable | exit 1 with no output | `set -u` in bash script | Remove `-u` from `set` |
| Node module mismatch | `NODE_MODULE_VERSION N vs M` | Native addon for wrong Node.js | `npm rebuild <module>` |
| Database locked | `SqliteError: database is locked` | Concurrent DB access | Retry logic or skip |
| Command not found | `timeout: not found` | Minimal PATH | Use builtins or full paths |
| JSON parse error | `SyntaxError: Unexpected token` | Hook outputs non-JSON to stdout | Fix script output |

### Permission Check (bulk)

```bash
# Find ALL hook scripts without execute permission
find ~/.claude/plugins/cache -name "*.sh" ! -perm -u+x \
  -exec echo "BROKEN: {}" \;
```

### Bash Safety Check

```bash
# Find dangerous set -u in hook scripts
grep -rn "set.*-u" ~/.claude/plugins/cache/*/hooks/ \
  ~/.claude/plugins/cache/*/*/hooks/ 2>/dev/null
```

### Node.js Native Addon Check

```bash
# Find better-sqlite3 or other native addons
find ~/.claude/plugins/cache -name "*.node" -exec sh -c \
  'echo "=== $1 ==="; file "$1"' _ {} \;
```

## Phase 3: Fix

### Fix 1: Bulk chmod (permission denied)

```bash
find ~/.claude/plugins/cache/<plugin> -name "<script>.sh" \
  ! -perm -u+x -exec chmod +x {} \; -exec echo "FIXED: {}" \;
```

### Fix 2: Remove set -u (unset variable errors)

```bash
find ~/.claude/plugins/cache/<plugin> -name "<script>" \
  -exec sed -i '' 's/set -euo pipefail/set -eo pipefail 2>\/dev\/null || true/' {} \; \
  -exec echo "FIXED: {}" \;
```

### Fix 3: Rebuild native addons

```bash
cd ~/.claude/plugins/cache/<plugin>/<version>
npm rebuild <module-name>
```

### Fix 4: Remove problematic hook entirely

Edit `hooks.json` to empty the event:
```json
{ "hooks": { "SessionStart": [] } }
```
**Apply to ALL cached versions** with `find ... -exec`.

### Fix 5: Nuclear option — delete plugin cache

```bash
rm -rf ~/.claude/plugins/cache/<marketplace>/<plugin>/
```
Plugin will be re-cached on next session start.

## Phase 4: Verify

```bash
# Re-test all hooks after fixes
find ~/.claude/plugins/cache -name "hooks.json" -path "*/hooks/*" \
  -exec grep -l "SessionStart" {} \; | while read f; do
    dir=$(dirname "$f")
    root=$(dirname "$dir")
    echo "=== Testing: $root ==="
    # Extract command from hooks.json and test it
    cmd=$(python3 -c "
import json, sys
h=json.load(open('$f'))
for entry in h.get('hooks',{}).get('SessionStart',[]):
  for hook in entry.get('hooks',[]):
    print(hook['command'].replace('\${CLAUDE_PLUGIN_ROOT}','$root'))
" 2>/dev/null)
    if [ -n "$cmd" ]; then
      echo '{"source":"startup"}' | CLAUDE_PLUGIN_ROOT="$root" eval "$cmd" >/dev/null 2>&1
      echo "EXIT: $?"
    fi
  done
```

## Decision Tree

```
Hook error on startup?
├─ Run Phase 1 Audit
│  └─ Which plugins have SessionStart hooks?
│     ├─ Test each hook (Phase 2)
│     │  ├─ Permission denied → Fix 1 (chmod, ALL copies)
│     │  ├─ Exit 1, no output → Fix 2 (remove set -u)
│     │  ├─ NODE_MODULE_VERSION → Fix 3 (npm rebuild)
│     │  ├─ All pass locally but still errors →
│     │  │  Check if there are MORE cached versions
│     │  │  you didn't fix (Phase 1, count versions)
│     │  └─ Unknown error → Fix 4 (remove hook) or Fix 5 (nuke cache)
│     └─ Verify all hooks pass (Phase 4)
│
Plugin behavior unexpected after disable?
├─ Remember: `false` doesn't stop hooks/skills
├─ To stop hooks: edit hooks.json or delete cache
└─ To stop skills: delete cache (no other way)
```

## Anti-Patterns

| Don't | Why | Do Instead |
|-------|-----|-----------|
| Set `enabledPlugins: false` to stop hooks | Doesn't work — hooks still run | Edit hooks.json or delete cache |
| Fix one cached version | Other versions still broken | Use `find -exec` for ALL versions |
| Add `set -euo pipefail` to hook scripts | `-u` kills script in minimal runtime | Use `set -e` or `set -eo pipefail` |
| Test hooks only from your shell | Your shell has richer env than CC runtime | Test with minimal PATH and env |
| Assume manual test = CC runtime | CC may pipe stdin differently, set timeout | Always verify with actual CC launch |
