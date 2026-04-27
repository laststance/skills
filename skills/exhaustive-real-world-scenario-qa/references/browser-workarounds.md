# Browser Automation Workarounds

Known issues and solutions for browser automation with common UI frameworks.
Apply relevant sections based on the tech stack detected in Phase 1.

---

## Chakra UI Modals

**Problem**: `snapshot` (accessibility tree snapshot) cannot see elements inside
`[role="dialog"]` overlays. Clicking by `@ref` number fails because the element
isn't in the snapshot output.

**Solution**: Use JavaScript to find and interact with modal elements:

```bash
# Find a button by its text content inside a dialog
playwright-cli evaluate "(() => {
  const dialogs = document.querySelectorAll('[role=\"dialog\"]');
  for (const d of dialogs) {
    const buttons = d.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent.includes('TARGET_TEXT')) {
        btn.click();
        return 'clicked';
      }
    }
  }
  return 'not found';
})()"
```

**Verification**: After clicking, take a screenshot to confirm the action worked:
```bash
playwright-cli screenshot --filename=/tmp/qa_after_modal_click.png
```

---

## React-Select Dropdowns

**Problem**: React-select renders a custom dropdown, not a native `<select>`. The
internal `<input>` element has `disabled` attribute even when the component is enabled.
Checking `input[disabled]` gives false positives.

**Solution**: Check the container's CSS class instead:

```bash
# Check if react-select is actually disabled
playwright-cli evaluate "(() => {
  const containers = document.querySelectorAll('.css-b62m3t-container');
  for (const c of containers) {
    if (c.querySelector('.react-select__control--is-disabled')) {
      return 'disabled';
    }
  }
  return 'enabled';
})()"
```

**To open a react-select dropdown**:
```bash
playwright-cli evaluate "(() => {
  const controls = document.querySelectorAll('[class*=\"-control\"]');
  for (const c of controls) {
    if (!c.closest('[class*=\"--is-disabled\"]')) {
      c.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
      return 'opened';
    }
  }
  return 'no enabled control found';
})()"
```

**To select an option**:
```bash
playwright-cli evaluate "(() => {
  const options = document.querySelectorAll('[class*=\"-option\"]');
  for (const opt of options) {
    if (opt.textContent.includes('TARGET_OPTION')) {
      opt.click();
      return 'selected: ' + opt.textContent;
    }
  }
  return 'option not found';
})()"
```

---

## Hidden File Upload Inputs

**Problem**: File upload inputs (`<input type="file">`) are typically hidden
(display:none or zero opacity) and triggered by a styled button/dropzone.
`playwright-cli upload` needs a visible, identifiable input element.

**Solution**: Find and expose the hidden input before uploading:

```bash
# Expose the file input inside a dialog
playwright-cli evaluate "(() => {
  const dialogs = document.querySelectorAll('[role=\"dialog\"]');
  for (const d of dialogs) {
    const inp = d.querySelector('input[type=\"file\"]');
    if (inp) {
      inp.style.display = 'block';
      inp.style.opacity = '1';
      inp.style.position = 'relative';
      inp.id = 'qa-file-input';
      return 'FOUND: ' + (inp.accept || 'any');
    }
  }
  // Fallback: search entire page
  const allInputs = document.querySelectorAll('input[type=\"file\"]');
  if (allInputs.length > 0) {
    const inp = allInputs[allInputs.length - 1];
    inp.style.display = 'block';
    inp.style.opacity = '1';
    inp.style.position = 'relative';
    inp.id = 'qa-file-input';
    return 'FOUND via fallback';
  }
  return 'NOT_FOUND';
})()"

# Then upload using the exposed input
playwright-cli upload @qa-file-input /path/to/file.pdf
```

---

## Scrolling Inside Modals

**Problem**: `playwright-cli` page-scroll helpers (e.g. `run-code "async page => await page.mouse.wheel(0, 500)"`) control the page scroll, not a modal's internal
scroll. Modal content that overflows is not reachable via the standard scroll command.

**Solution**: Use JavaScript to scroll the modal body:

```bash
playwright-cli evaluate "(() => {
  const modalBody = document.querySelector('[role=\"dialog\"] [class*=\"modal-body\"], [role=\"dialog\"] [style*=\"overflow\"]');
  if (modalBody) {
    modalBody.scrollTop += 500;
    return 'scrolled to: ' + modalBody.scrollTop;
  }
  return 'no scrollable modal body';
})()"
```

---

## Toast Notifications

**Problem**: Toast/snackbar notifications appear briefly and disappear. Screenshots
may miss them.

**Solution**: Take screenshot immediately after the action that triggers the toast:

```bash
# Submit form (triggers toast)
playwright-cli click @submit_button
# Immediately screenshot — don't wait
playwright-cli screenshot --filename=/tmp/qa_toast.png
```

If you need to read the toast text:
```bash
playwright-cli evaluate "(() => {
  const toasts = document.querySelectorAll('[class*=\"chakra-toast\"], [role=\"alert\"]');
  return Array.from(toasts).map(t => t.textContent).join(' | ') || 'no toasts visible';
})()"
```

---

## Loading Spinners / Async Operations

**Problem**: After triggering an async operation (file upload, API call), the UI
shows a spinner. Interacting before it completes causes failures.

**Solution**: Use `run-code` with `waitForFunction` or poll for completion:

```bash
# Preferred: wait for spinner to disappear
playwright-cli run-code "async page => await page.waitForFunction(() => !document.querySelector('[class*=\"spinner\"], [class*=\"loading\"]'))"

# Alternative: poll via JS (max 30 seconds)
playwright-cli evaluate "await new Promise((resolve) => {
  let attempts = 0;
  const check = () => {
    const spinner = document.querySelector('[class*=\"spinner\"], [class*=\"loading\"]');
    if (!spinner || spinner.offsetParent === null || attempts > 60) {
      resolve('done after ' + attempts + ' checks');
    } else {
      attempts++;
      setTimeout(check, 500);
    }
  };
  check();
})"
```

---

## ReactFlow / Interactive Canvas UIs

**Problem**: `playwright-cli snapshot` returns element refs (`@e1`, `@e2`...) that
become stale after any DOM mutation — modal open/close, tab switch, tree expand/collapse,
drag-and-drop, etc. Clicking a stale ref targets the wrong element or fails silently.
This is especially severe with ReactFlow because every node interaction triggers a
re-render of the canvas and its child nodes.

**Solution**: Always re-snapshot immediately before each interaction:

```bash
# ❌ WRONG: refs from earlier snapshot are now stale
playwright-cli snapshot          # refs assigned
playwright-cli click @e5            # opens modal
playwright-cli click @e8            # STALE — @e8 may point to a different element now

# ✅ CORRECT: re-snapshot after every DOM change
playwright-cli snapshot          # refs assigned
playwright-cli click @e5            # opens modal → DOM changed
playwright-cli snapshot          # NEW refs assigned
playwright-cli click @e3            # use fresh ref from latest snapshot
```

**Additional tips for ReactFlow**:
- **Node identification**: Use text content (drawing number, product name) to identify
  the correct node, not positional refs. Two nodes with identical labels can cause
  false positives.
- **Drag vs click conflict**: ReactFlow nodes are draggable. Click handlers must use
  `e.stopPropagation()` to prevent the click from being consumed by the drag handler.
  If a click doesn't trigger the expected action, try `playwright-cli evaluate` with
  `element.click()` as a fallback.
- **Canvas zoom/pan**: After zoom or pan, all element positions change. Always
  re-snapshot before interacting.

---

## General Tips

1. **Always snapshot before clicking** — `playwright-cli snapshot` gives you the ref numbers
2. **Re-snapshot after every DOM change** — refs become stale after modals, tab switches, navigation, or any state change that triggers re-render
3. **Always screenshot after actions** — visual evidence for the report
4. **Use evaluate for anything inside modals** — accessibility tree doesn't capture overlays
5. **Press Enter > click submit** — when a button is hard to target, `playwright-cli press Enter` often works
6. **Wait after navigation** — `playwright-cli open URL` then `playwright-cli snapshot` to confirm page loaded
7. **Use wait for async** — `playwright-cli run-code "async page => await page.waitForLoadState('networkidle')"` after form submissions
