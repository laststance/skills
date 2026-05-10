#!/usr/bin/env bash
# create-worktree.sh
# Creates a sibling git worktree and copies .gitignored config files.
# Usage: create-worktree.sh <branch-name>
#
# Behavior:
#   - Worktree path: <parent-of-current-toplevel>/<project>-<sanitized-branch>
#   - If <branch-name> is an existing local branch, it is checked out.
#     Otherwise a new branch is created from HEAD.
#   - All ignored files/dirs are copied EXCEPT heavy build/dependency dirs
#     (node_modules, .next, dist, build, coverage, etc.).

set -euo pipefail

BRANCH_NAME="${1:-}"
if [[ -z "$BRANCH_NAME" ]]; then
  echo "Error: branch name required" >&2
  echo "Usage: $0 <branch-name>" >&2
  exit 1
fi

# Resolve project paths from the current git toplevel (works inside any worktree).
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "Error: not inside a git repository" >&2
  exit 1
}
PROJECT_NAME="$(basename "$PROJECT_ROOT")"
PARENT_DIR="$(dirname "$PROJECT_ROOT")"

# Sanitize branch name for use as a directory suffix (replace '/' with '-').
SAFE_BRANCH="$(printf '%s' "$BRANCH_NAME" | tr '/' '-')"
WORKTREE_PATH="$PARENT_DIR/$PROJECT_NAME-$SAFE_BRANCH"

if [[ -e "$WORKTREE_PATH" ]]; then
  echo "Error: target directory already exists: $WORKTREE_PATH" >&2
  exit 1
fi

cd "$PROJECT_ROOT"

# Create the worktree. Reuse existing local branch if one exists; otherwise create.
if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
  git worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
else
  git worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH"
fi

# Heavy directories that must never be copied (saves time/disk; user re-installs deps).
# Note: `.vercel` ships as a collapsed entry from `git ls-files --directory`, so a
# nested-only exclusion (e.g. `.vercel/output`) cannot fire at this stage. The whole
# `.vercel/` is copied here, then `.vercel/output` is pruned post-loop below.
is_excluded() {
  local first_segment="${1%%/*}"
  case "$first_segment" in
    node_modules|.next|dist|build|.cache|coverage|.turbo|.serena \
      |test-results|playwright-report|storybook-static|out|html|.yarn)
      return 0
      ;;
  esac
  return 1
}

copied=0
skipped=0

# `--directory` collapses fully-ignored directories into a single entry with trailing slash.
while IFS= read -r entry; do
  [[ -z "$entry" ]] && continue
  trimmed="${entry%/}"

  if is_excluded "$trimmed"; then
    skipped=$((skipped + 1))
    continue
  fi

  src="$PROJECT_ROOT/$trimmed"
  dst="$WORKTREE_PATH/$trimmed"

  if [[ -d "$src" ]]; then
    mkdir -p "$(dirname "$dst")"
    if cp -R "$src" "$dst"; then
      copied=$((copied + 1))
    else
      echo "warn: failed to copy directory $entry" >&2
    fi
  elif [[ -f "$src" ]]; then
    mkdir -p "$(dirname "$dst")"
    if cp -p "$src" "$dst"; then
      copied=$((copied + 1))
    else
      echo "warn: failed to copy file $entry" >&2
    fi
  fi
done < <(git ls-files --others --ignored --exclude-standard --directory)

# Post-copy cleanup: prune nested heavy dirs that ride along with collapsed parents.
if [[ -d "$WORKTREE_PATH/.vercel/output" ]]; then
  rm -rf "$WORKTREE_PATH/.vercel/output"
fi

echo ""
echo "✓ Worktree created"
echo "  Branch:  $BRANCH_NAME"
echo "  Copied:  $copied ignored entries"
echo "  Skipped: $skipped heavy directories"
echo ""
echo "Path: $WORKTREE_PATH"
echo ""
echo "Next: cd $WORKTREE_PATH && pnpm install"
