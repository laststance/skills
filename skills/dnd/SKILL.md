---
name: dnd
description: DnD QA helper
---

# Drag-and-Drop QA — Coordinate-Based Verification

Agent browser tools often report ref-based `drag` as successful even when custom
DnD libraries (`dnd-kit`, `react-dnd`, native HTML5 DnD wrappers) drop on the
wrong target. Treat any `drag <sourceRef> <targetRef>` success as **unverified**
unless the rendered state proves the move landed.

## When to apply

Load this protocol whenever browser-driven verification touches drag-and-drop:

- `dnd-kit` DragOverlay / SortableContext flows
- Kanban / list reorder
- File / item drop zones
- Tree / outline reparenting

If a browser-using skill cannot rule out DnD ahead of time, load this skill
preemptively before opening the browser.

## Verification protocol

1. Start the app with the project dev command, using `kill-port <port>` first
   when a fixed port is used.
2. Open the target page and capture a fresh snapshot.
3. Get fresh bounding boxes for the source and target **immediately** before
   dragging.
4. Pointer sequence: move to source center → `mousedown` → at least one
   intermediate move → move to target center → `mouseup`.
5. Verify the rendered UI state changed (text, count, group label) — not just
   that the command returned success.
6. Check browser console errors after the drop.

## Example (`playwright-cli`)

```bash
playwright-cli --raw eval "el => JSON.stringify(el.getBoundingClientRect())" eSource
playwright-cli --raw eval "el => JSON.stringify(el.getBoundingClientRect())" eTarget
playwright-cli mousemove 250 426
playwright-cli mousedown
playwright-cli mousemove 360 426
playwright-cli mousemove 640 426
playwright-cli mouseup
playwright-cli snapshot
playwright-cli console error
```

## Recalculation rule

Coordinates must come from the **current viewport and current layout**.
Recalculate bounding boxes before another drag attempt whenever any of the
following has happened since the last measurement:

- page scrolled
- viewport resized
- hot reload fired
- React / Vue / framework rerendered (state change, route change, modal toggle)

## `dnd-kit`-specific success criteria

A valid verification confirms a **textual mutation** that corresponds to the
move:

- Group transition — `Backlog 3 -> 2`, `Doing 2 -> 3`
- Group label — `group: doing`
- Index annotation — `position: 2`

A snapshot that "looks moved" without a matching text change usually means the
drop landed on a parent container rather than the sortable item — and the store
never updated.
