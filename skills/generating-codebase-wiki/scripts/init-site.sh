#!/usr/bin/env bash
# Copy chrome assets into an output wiki-site. Agent still writes every HTML page.
set -euo pipefail
OUT="${1:?usage: init-site.sh <output-dir>}"
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$OUT/pages"
cp "$SKILL/assets/wiki.css" "$SKILL/assets/wiki.js" "$OUT/"
echo "Scaffolded $OUT"
