# On-screen highlight overlay (mandatory when target is visible)

When the located element (render target) or nearest UI anchor (logic target) is **visible in the headed browser**, draw a clear overlay so the user can instantly see which node maps to the code. Do **not** rely on a short-lived tool flash alone.

## Goals

1. Thick colored ring around the target element
2. Floating badge with the **source file name** (e.g. `NewDrawingFilesModal.tsx`)
3. Optional one-line locator (`role=dialog` / `aria-label` / `data-insp-path`)
4. Dim the rest of the page so only the target pops
5. Leave the overlay until the user asks to remove it or reloads

## Prefer order

| Priority | Tool | Use when |
|---|---|---|
| 1 | Persistent DOM overlay (below) | Always — works in Cursor / chrome-devtools / playwright-cli eval |
| 2 | `browser_highlight` (Cursor) | Extra pulse on a snapshot ref after the overlay is in place |
| 3 | Element screenshot only | Overlay injection blocked; still save `*_highlighted.png` if possible |

## Overlay script (copy-paste into Runtime.evaluate / playwright eval)

Replace `TARGET_SELECTOR` and `LABEL` (and optionally `SUBLABEL`).

```js
(() => {
  const TARGET_SELECTOR = '[aria-label="NewDrawingFilesModal"]'; // or [data-insp-path*="FolderHeader"]
  const LABEL = 'NewDrawingFilesModal.tsx';
  const SUBLABEL = 'role=dialog  aria-label="NewDrawingFilesModal"'; // optional; '' to hide

  const el = document.querySelector(TARGET_SELECTOR);
  if (!el) return JSON.stringify({ ok: false, reason: 'target not found' });

  document.getElementById('__locate-ui-highlight-root')?.remove();

  const rect = el.getBoundingClientRect();
  const root = document.createElement('div');
  root.id = '__locate-ui-highlight-root';
  root.style.cssText =
    'position:fixed;inset:0;z-index:2147483646;pointer-events:none;';

  const pad = 6;
  const ring = document.createElement('div');
  ring.style.cssText = [
    'position:fixed',
    `top:${rect.top - pad}px`,
    `left:${rect.left - pad}px`,
    `width:${rect.width + pad * 2}px`,
    `height:${rect.height + pad * 2}px`,
    'border:4px solid #FF3B30',
    'border-radius:10px',
    'box-shadow:0 0 0 9999px rgba(0,0,0,0.35), 0 0 0 4px rgba(255,59,48,0.35)',
    'box-sizing:border-box',
  ].join(';');

  const badgeTop = Math.max(8, rect.top - 44);
  const badge = document.createElement('div');
  badge.textContent = LABEL;
  badge.style.cssText = [
    'position:fixed',
    `top:${badgeTop}px`,
    `left:${rect.left - pad}px`,
    'background:#FF3B30',
    'color:#fff',
    'font:700 14px/1.2 ui-sans-serif,system-ui,sans-serif',
    'padding:10px 14px',
    'border-radius:8px',
    'box-shadow:0 4px 14px rgba(0,0,0,0.35)',
  ].join(';');

  root.appendChild(ring);
  root.appendChild(badge);

  if (SUBLABEL) {
    const sub = document.createElement('div');
    sub.textContent = SUBLABEL;
    sub.style.cssText = [
      'position:fixed',
      `top:${badgeTop + 36}px`,
      `left:${rect.left - pad}px`,
      'background:#111',
      'color:#fff',
      'font:500 12px/1.2 ui-monospace,Menlo,monospace',
      'padding:6px 10px',
      'border-radius:6px',
      'opacity:0.92',
    ].join(';');
    root.appendChild(sub);
  }

  document.body.appendChild(root);
  return JSON.stringify({ ok: true, rect: rect.toJSON() });
})()
```

### How to run

| Environment | Command |
|---|---|
| Cursor `cursor-ide-browser` | `browser_cdp` → `Runtime.evaluate` with `returnByValue: true` |
| chrome-devtools MCP | `evaluate_script` with the IIFE (no element arg) |
| playwright-cli | `playwright-cli eval "<IIFE>"` (quote carefully) |

After the overlay is on:

1. Call `browser_highlight` on the snapshot ref when available (Cursor).
2. Take a full-viewport screenshot named `<name>_highlighted.png`.
3. Leave the overlay; tell the user how to clear it (reload, or ask the agent to remove `#__locate-ui-highlight-root`).

## Clear overlay

```js
document.getElementById('__locate-ui-highlight-root')?.remove();
```

## Multiple matches

If several nodes match:

1. Enumerate with index + short text + rect (see SKILL Phase 5).
2. Highlight **each** candidate with a numbered badge (`1`, `2`, …) **or** highlight the chosen one and list the others in the report.
3. Prefer the instance that matches the user's pinned line / `data-insp-path` when possible.

## Logic targets

There may be no single DOM node for an `if` / `useEffect` body. Highlight the **nearest UI anchor** that proves the branch is live (e.g. enabled Save button, open modal, dirty row) and set `LABEL` to the source file + a short branch hint (`Foo.tsx — dirty Save`).
