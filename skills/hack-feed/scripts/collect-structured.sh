#!/usr/bin/env bash
# hack-feed structured source collector (GitHub + HN + RSS)
# Usage: bash collect-structured.sh [period]
# period: 24h (default) | 3d | week | month
# Env: HACK_FEED_FIXTURE_MODE=1 to use tests/fixtures/ instead of live APIs
set -euo pipefail

# ── Period parser ──
# Converts period string → seconds (integer)
# 24h → 86400, 3d → 259200, week → 604800, month → 2592000
parse_period() {
  case "$1" in
    24h)   echo 86400 ;;
    3d)    echo 259200 ;;
    week)  echo 604800 ;;
    month) echo 2592000 ;;
    *)
      # Generic regex: \d+[dhw]
      # Note: `m` is deliberately excluded. In Unix convention `m` means "minute",
      # but month is 2_592_000s; mapping `m` → month would turn `5m` into 150 days
      # of backlog and cause a thundering-herd fetch. Users who want months must
      # write `month` literally (matches the exact-case branch above).
      if [[ "$1" =~ ^([0-9]+)([dhw])$ ]]; then
        local num="${BASH_REMATCH[1]}"
        local unit="${BASH_REMATCH[2]}"
        case "$unit" in
          h) echo $((num * 3600)) ;;
          d) echo $((num * 86400)) ;;
          w) echo $((num * 604800)) ;;
        esac
      else
        echo "ERROR: unknown period '$1'" >&2
        return 1
      fi
      ;;
  esac
}

# ── Config paths ──
DATA_DIR="$HOME/.claude/data"
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCES_JSON="$SKILL_DIR/data/sources.json"
TRACKED_JSON="$DATA_DIR/tracked-engineers.json"

# ── Fixture mode detection ──
is_fixture_mode() { [ "${HACK_FEED_FIXTURE_MODE:-0}" = "1" ]; }
fixture_dir() { echo "${HACK_FEED_FIXTURE_DIR:-$SKILL_DIR/tests/fixtures}"; }

# ── GitHub fetch: issues+PRs for one user since ISO timestamp ──
# Prints a JSON array to stdout. In fixture mode, returns pre-baked fixture file.
fetch_github_for_user() {
  local user="$1" since="$2"
  if is_fixture_mode; then
    local fx_issues="$(fixture_dir)/gh-issues-${user}.json"
    local fx_prs="$(fixture_dir)/gh-prs-${user}.json"
    local issues="[]" prs="[]"
    [ -f "$fx_issues" ] && issues=$(cat "$fx_issues")
    [ -f "$fx_prs" ] && prs=$(cat "$fx_prs")
    # Merge and tag with source_kind
    jq -n --argjson i "$issues" --argjson p "$prs" --arg u "$user" \
      '($i + $p) | map(. + {author: $u, source_kind: "tracked_user", type: "github"})'
    return
  fi
  # Real mode: hit gh api
  local issues prs
  issues=$(gh api "search/issues?q=author:${user}+type:issue+created:>=${since}&sort=created&order=desc&per_page=10" \
    --jq '[.items[] | {title, url: .html_url, repo: .repository_url, state, published_at: .created_at, raw_excerpt: (.body // "" | .[0:300])}]' 2>/dev/null || echo "[]")
  prs=$(gh api "search/issues?q=author:${user}+type:pr+created:>=${since}&sort=created&order=desc&per_page=10" \
    --jq '[.items[] | {title, url: .html_url, repo: .repository_url, state, draft, published_at: .created_at, raw_excerpt: (.body // "" | .[0:300])}]' 2>/dev/null || echo "[]")
  # Defensive guard: on non-2xx (rate limit, 5xx, 422) `gh api` prints the error body on
  # stdout BEFORE `--jq` fails. The `|| echo "[]"` fallback then APPENDS `[]` instead of
  # replacing the polluted stdout, yielding e.g. `{"message":"..."}[]` — two JSON values,
  # not one. `jq -e 'type == "array"'` does not catch this (it evaluates the predicate
  # per-value; the final `[]` tests truthy). Use `jq --argjson` as the gate: it requires
  # exactly one JSON value and is the same check the producer call uses below.
  jq -cn --argjson x "$issues" '$x | type == "array"' >/dev/null 2>&1 || issues="[]"
  jq -cn --argjson x "$prs"    '$x | type == "array"' >/dev/null 2>&1 || prs="[]"
  jq -n --argjson i "$issues" --argjson p "$prs" --arg u "$user" \
    '($i + $p) | map(. + {author: $u, source_kind: "tracked_user", type: "github"})'
}

# ── HN fetch: front-page stories since epoch timestamp ──
# Prints a JSON array tagged with source_kind: "hn"
fetch_hn() {
  local since_epoch="$1"
  if is_fixture_mode; then
    local fx="$(fixture_dir)/hn-algolia-24h.json"
    if [ -f "$fx" ]; then
      jq '[.hits[] | {
        title,
        url: (.url // "https://news.ycombinator.com/item?id=\(.objectID)"),
        author,
        published_at: .created_at,
        source_kind: "hn",
        type: "hn",
        raw_excerpt: .title
      }]' "$fx"
    else
      echo "[]"
    fi
    return
  fi
  # Real mode
  local response
  response=$(curl -sf --max-time 10 \
    "https://hn.algolia.com/api/v1/search_by_date?tags=story,front_page&numericFilters=created_at_i%3E${since_epoch}&hitsPerPage=30" \
    2>/dev/null || echo '{"hits":[]}')
  # Defensive guards for the real branch: curl `-sf` catches HTTP error status, but not:
  #   1) HTTP 200 with empty body (204-like, unusual but possible) — jq then gets no input
  #      and exits 0 with empty output, so the `|| echo "[]"` fallback never fires. Guard
  #      by forcing `$response` to a valid empty-hits object on blank input.
  #   2) HTTP 200 with valid JSON that lacks `.hits` (e.g. `{"error":"..."}`) — `.hits[]`
  #      would iterate null and kill jq. Use `(.hits // [])[]` so a missing/null key
  #      yields an empty iteration.
  #   3) HTTP 200 with malformed body (truncated stream, HTML WAF page) — jq parse error.
  #      Suppress the error and fall back to `[]`.
  [ -z "$response" ] && response='{"hits":[]}'
  echo "$response" | jq '[(.hits // [])[] | {
    title,
    url: (.url // "https://news.ycombinator.com/item?id=\(.objectID)"),
    author,
    published_at: .created_at,
    source_kind: "hn",
    type: "hn",
    raw_excerpt: .title
  }]' 2>/dev/null || echo "[]"
}

# ── RSS fetch: tier1 feeds (v8, bun, webkit) with 1h cache ──
# Prints JSON array tagged with source_kind: "tier1_rss"
fetch_rss_tier1() {
  local cache_dir="$HOME/.claude/cache/hack-feed/rss"
  mkdir -p "$cache_dir"
  local feeds
  feeds=$(jq -r '.tier1_autopass.rss_feeds[]' "$SOURCES_JSON")

  local all_items="[]"
  for feed_url in $feeds; do
    local slug cache_file
    slug=$(echo "$feed_url" | sed 's|https://||; s|/|_|g')
    cache_file="$cache_dir/$slug.xml"

    if is_fixture_mode; then
      # Map known feed URL → fixture file
      case "$feed_url" in
        *v8.dev*)   cache_file="$(fixture_dir)/v8-blog.atom" ;;
        *) continue ;;
      esac
    else
      # Real mode: check cache age (< 1h = valid)
      if [ -f "$cache_file" ] && [ $(( $(date -u +%s) - $(stat -f %m "$cache_file" 2>/dev/null || stat -c %Y "$cache_file") )) -lt 3600 ]; then
        : # cache valid
      else
        curl -sf --max-time 10 "$feed_url" -o "$cache_file" 2>/dev/null || continue
      fi
    fi

    [ -f "$cache_file" ] || continue

    # Atom XML parsing via python3 stdlib (xml.etree.ElementTree).
    # Namespace registered as 'atom'. Only v8/webkit are Atom; bun is RSS 2.0
    # and will yield [] until a second parser is added. Falls back to [] on
    # any parse error.
    local feed_items
    feed_items=$(python3 -c "
import sys, json, re, xml.etree.ElementTree as ET
try:
    tree = ET.parse('$cache_file')
    root = tree.getroot()
    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    items = []
    for entry in root.findall('atom:entry', ns):
        title_el = entry.find('atom:title', ns)
        link_el = entry.find('atom:link', ns)
        summary_el = entry.find('atom:summary', ns)
        updated_el = entry.find('atom:updated', ns)
        items.append({
            'title': title_el.text if title_el is not None else '',
            'url': link_el.get('href') if link_el is not None else '',
            'author': None,
            'published_at': updated_el.text if updated_el is not None else '',
            'source_kind': 'tier1_rss',
            'type': 'rss',
            'raw_excerpt': (summary_el.text if summary_el is not None else '')[:300]
        })
    print(json.dumps(items))
except Exception:
    print('[]')
" 2>/dev/null || echo "[]")
    all_items=$(jq -n --argjson a "$all_items" --argjson b "$feed_items" '$a + $b')
  done
  echo "$all_items"
}

# ── Main guard ──
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  PERIOD="${1:-24h}"
  SECONDS_BACK=$(parse_period "$PERIOD")
  NOW=$(date -u +%s)
  SINCE_EPOCH=$((NOW - SECONDS_BACK))
  SINCE_ISO=$(date -u -r "$SINCE_EPOCH" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "@${SINCE_EPOCH}" +"%Y-%m-%dT%H:%M:%SZ")

  # Atomic write pattern
  OUT_FINAL="/tmp/hack-feed-structured-$$.json"
  OUT_TMP="${OUT_FINAL}.tmp"

  # Placeholder: collect GitHub for tracked engineers only
  ENGINEERS=$(jq -r '.engineers[].github' "$TRACKED_JSON")
  ITEMS_JSON="[]"
  for USER in $ENGINEERS; do
    USER_ITEMS=$(fetch_github_for_user "$USER" "$SINCE_ISO")
    ITEMS_JSON=$(jq -n --argjson a "$ITEMS_JSON" --argjson b "$USER_ITEMS" '$a + $b')
    is_fixture_mode || sleep 2
  done

  # Fetch HN
  HN_ITEMS=$(fetch_hn "$SINCE_EPOCH")
  ITEMS_JSON=$(jq -n --argjson a "$ITEMS_JSON" --argjson b "$HN_ITEMS" '$a + $b')

  # Fetch tier1 RSS
  RSS_ITEMS=$(fetch_rss_tier1)
  ITEMS_JSON=$(jq -n --argjson a "$ITEMS_JSON" --argjson b "$RSS_ITEMS" '$a + $b')

  # Write atomically
  jq -n \
    --arg collected_at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    --arg period "$PERIOD" \
    --arg since "$SINCE_ISO" \
    --argjson items "$ITEMS_JSON" \
    '{version: 1, collected_at: $collected_at, period: $period, since: $since, items: $items}' \
    > "$OUT_TMP"
  mv "$OUT_TMP" "$OUT_FINAL"

  # Emit path to stdout for caller
  echo "$OUT_FINAL"
fi
