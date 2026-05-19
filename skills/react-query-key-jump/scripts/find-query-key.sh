#!/usr/bin/env bash
# Resolve a TanStack Query queryKey string to its canonical definition line(s).
# Usage: find-query-key.sh <queryKey> [repo-root]
# Env: REACT_QUERY_APIS_DIR (default: src/apis) — directory under repo root to search
set -euo pipefail

QUERY_KEY="${1:?Usage: find-query-key.sh <queryKey> [repo-root]}"
ROOT="${2:-$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || pwd)}"
APIS_DIR="${REACT_QUERY_APIS_DIR:-src/apis}"
APIS_PATH="${ROOT}/${APIS_DIR}"

if [[ ! -d "$APIS_PATH" ]]; then
  echo "error: ${APIS_DIR} not found under ${ROOT} (set REACT_QUERY_APIS_DIR to override)" >&2
  exit 1
fi

RG_KEY=$(printf '%s' "$QUERY_KEY" | sed 's/[.[\*^$()+?{|]/\\&/g')

hits=$(
  rg -n --glob 'use*.ts' --glob 'use*.tsx' \
    -e "queryKey:[[:space:]]*\\[[[:space:]]*['\"]${RG_KEY}['\"]" \
    -e "^[[:space:]]*['\"]${RG_KEY}['\"][[:space:]]*,?[[:space:]]*$" \
    "$APIS_PATH" 2>/dev/null || true
)

if [[ -z "$hits" ]]; then
  echo "not_found:${QUERY_KEY}" >&2
  exit 1
fi

while IFS= read -r line; do
  rel="${line#"${ROOT}/"}"
  echo "$rel"
done <<< "$hits"
