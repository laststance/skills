# Logic-branch reach walkthrough

Real example: reach `debugger` at `AvailableOrderIemSettingsTabInner.tsx:139` — an `useEffectOnAny` **else** branch that runs when `isChanged === true` and `orderItemSettings` updates.

This is the pattern the skill must follow for pinned logic lines (not only JSX).

## Phase 1 — Classify + read code

**Classification:** Logic target (not a DOM node).

```tsx
useEffectOnAny(() => {
  if (!isChanged) {
    // 初回 / 保存直後: API データをそのまま反映
  } else {
    const newSettingsMap = new Map(/* ... */);
    debugger; // ← L139: user pinned here
    // 並び順維持 + 新規項目マージ
  }
}, [availableOrderItemSettings, isChanged, orderItemSettings, ...]);
```

**Guards for L139:**

| Guard | Meaning |
|-------|---------|
| `isChanged === true` | User reordered show/hide lists (DnD) and has **not** saved |
| `orderItemSettings` changes | e.g. query invalidates after POST 新規項目, or refetch |

**Reach recipe (ordered):**

1. Login as admin with settings access (`dev3@example.com`).
2. 正規動線: グローナビ「設定」→ サイドナビ「案件項目の設定」.
3. Tab「利用する項目の設定」 (default) — confirm URL `/settings/order_item_settings`.
4. **DnD:** drag one item from「利用する項目」to「利用しない項目」(or reorder within a column) → save button「表示設定の保存」becomes enabled.
5. **Refetch trigger:** click「+ 新規項目追加」→ complete modal → POST succeeds → `orderItemSettings` updates while `isChanged` still true.
6. Effect re-runs → **`debugger` pauses** (if DevTools open).

Nearest UI anchor when paused: whole tab panel (DnD two-column layout), not a single row.

## Phase 2–3 — Browser (Cursor / zumen-fe)

```
kill-port 8080 && pnpm dev -p 8080
browser_navigate https://local.zume-n.com/
browser_lock
# 設定 → 案件項目の設定
```

## Phase 4 — Execute reach ops

**Step 4 — DnD (coordinate-based, dnd-kit):**

```
browser_get_bounding_box  # source drag handle
browser_get_bounding_box  # target column
browser_mouse_click_xy    # mousedown on source center
# move through intermediate point
browser_mouse_click_xy    # mouseup on target center
browser_snapshot          # verify item moved columns; save button enabled
```

**Step 5 — Trigger refetch:**

```
browser_click  # 「+ 新規項目追加」
# … modal step 1 type pick, step 2 fill, submit …
browser_snapshot  # new row visible; still unsaved order (isChanged true)
```

Do **not** click「表示設定の保存」between steps 4 and 5 — that clears `isChanged`.

## Phase 5 — Capture

Screenshot: `screenshots/AvailableOrderIemSettingsTabInner_isChanged-refetch_visual.png`

DOM anchor: `[data-insp-path*="AvailableOrderIemSettingsTabInner"]` tabpanel.

Highlight:「+ 新規項目追加」or the moved item row.

## Phase 6 — Present to user

> **Target classification:** Logic — `useEffectOnAny` else branch, L139 `debugger`.
>
> **Reach recipe (executed):**
> 1. `dev3@example.com` — 設定 → 案件項目の設定
> 2. DnD で「利用する」→「利用しない」へ1件移動（未保存）
> 3. 「+ 新規項目追加」で項目作成完了（query invalidate）
>
> **Guard flip:** Step 2 → `isChanged=true`. Step 3 → `orderItemSettings` updates → effect else → L139.
>
> **DevTools:** Breakpoint on L139; repeat steps 2–3 with Sources open.
>
> **Screen:** `https://local.zume-n.com/settings/order_item_settings` — タブ「利用する項目の設定」

## Lessons

1. **Logic pins need recipes, not just routes.** The same component renders on page load, but L139 never runs until guards align.
2. **Order matters.** Save before refetch → `isChanged` false → wrong branch.
3. **No DOM for pure logic.** Present the nearest panel screenshot + reach recipe; say explicitly that the line is not a visible widget.
4. **Agent executes, user inspects.** Leave browser open on post-step-5 state for DevTools.
