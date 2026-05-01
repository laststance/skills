# Electron QA Issue Taxonomy

## Severity Levels

| Severity | Definition | Electron examples |
|----------|------------|-------------------|
| **critical** | App crashes, data loss, security hole, or a core flow is fully blocked | Main process crash, `nodeIntegration: true` on a window that renders remote content, auto-updater installs over unsaved work, launch on Windows fails with missing DLL, IPC handler that leaks `fs` module to the renderer |
| **high** | Primary feature broken with no workaround, or accessibility fully unusable | Main CTA no-op, Cmd+C/V broken in text fields, screen reader skips the primary action, app unusable under 800×600 min size, tray icon menu doesn't reflect state and there's no other way to trigger the action |
| **medium** | Feature works but with a noticeable problem, or fails only in a specific state | Dark Mode has a white flash on launch, Windows menu uses macOS naming, preference window forgets scroll position, one menu shortcut mis-binds on Linux, label truncates at 200% zoom |
| **low** | Cosmetic or polish issue that a careful user notices | 1-pixel border misalignment between platforms, traffic-light spacing slightly off, app icon in Dock slightly blurry on a HiDPI display, hover state a touch too subtle |

## Categories

### 1. Security

The Electron-specific class. These are the ones most likely to bite in an
App Store review or a security audit — and the ones most users can't spot
themselves.

- `nodeIntegration: true` on a window that loads remote / user-influenced
  content. Detectable via `typeof require === "function"` in the renderer
- `contextIsolation: false` on any window. Default since Electron 12 is
  `true`; finding `false` is almost always a mistake
- `sandbox: false` combined with a preload script that exposes high-privilege
  APIs to the renderer
- External URLs opening inside the Electron window instead of the user's
  default browser (indicates missing `shell.openExternal` + `setWindowOpenHandler`
  logic)
- DevTools enabled in production build (Cmd+Option+I opens on a shipped
  release)
- No Content-Security-Policy on a window that renders any remote content
- Protocol handler (`myapp://`) that passes URL data directly into a renderer
  without validation — deep-link injection
- Auto-updater without signature verification (rare now, but worth checking)
- `allowRunningInsecureContent` or `webSecurity: false` in any window config

Security findings are **always at least high**, usually critical.

### 2. Functional

Bugs that are independent of state or appearance.

- Click / menu-item does nothing (no navigation, no log entry)
- Wrong destination (Preferences menu item opens About)
- Form submits twice on rapid click
- Shortcut key collides with OS (e.g., Cmd+Space in macOS always opens
  Spotlight; a shortcut that tries to override it loses)
- IPC handler errors silently; the user sees a spinner that never resolves
- State not preserved across relaunch (preferences window position, main
  window size, open tabs)
- Deep link / custom protocol doesn't focus an existing instance; spawns a
  second instance instead
- Drag-and-drop receiver doesn't accept a file the user dropped on it
- Clipboard paste inserts the wrong content type (drops HTML formatting,
  or inserts it when plain-text was expected)

### 3. Visual

Layout and rendering bugs visible at default state.

- Text clipped / truncated without ellipsis
- Missing assets (icon shows as broken image, SVG fails to load)
- Overlapping UI elements
- Platform-native controls mixing with web-rendered controls (e.g., a
  native macOS button next to an HTML button that doesn't match)
- Dark Mode: one panel stays light while the rest of the app is dark
- HiDPI: images pixelated (wrong @2x asset, or a scaled @1x)
- Window resize breaks layout — text clips, sidebar collapses without a
  toggle to restore, minimap overlaps content

### 4. Accessibility

- Interactive element with no accessible name (snapshot shows
  `role: "button"` with `name: ""`)
- Image with no alt text and no surrounding label
- Keyboard focus can't reach an interactive element (focusable order skips
  it, or the element never receives focus)
- Focus trap (modal / webview that captures focus with no way out via Esc
  or Tab)
- Color contrast below WCAG 2.2 AA on text (4.5:1 body / 3:1 large)
- Shortcut key that can't be remapped and collides with an assistive
  technology's default
- Reduce Motion / Reduce Transparency not honored (macOS Accessibility
  settings have no effect)

### 5. State / environment

Bugs only visible under non-default conditions.

- OS Dark Mode: invisible text, hardcoded light colors, or a brief white
  flash on launch before the dark theme applies
- Offline: no offline state, stale data shown as fresh, retry buttons are
  no-ops
- Background: timers keep firing, network pings stay aggressive even when
  the app is defocused (drains battery)
- Window resize to minimum: layout breaks and no scroll appears
- Multi-monitor: window loses position when moved between displays, or
  opens off-screen on relaunch if the secondary display isn't attached
- OS sleep / wake: WebSocket / fetch connections don't reconnect, leaving
  the app stuck in a stale state
- Low-storage / low-memory: the app crashes rather than showing an error

### 6. Content

- Placeholder text left in production strings
- Localized string missing (English fallback leaking into a non-English
  locale, or literal `some.key.name` displayed)
- Typos, grammar errors, inconsistent terminology ("Sign out" in one menu,
  "Log out" in another)
- Wrong label on a button (Cancel that actually saves)
- Empty state that says "No data" without explaining what to do
- Version / build string out of date or shows "dev" in a production build

### 7. Platform / cross-platform

Specific to the OS the skill is running on.

- **macOS**: menu bar missing standard items (Services, Hide Others), Cmd+Q
  doesn't quit, window traffic lights in the wrong spot or missing
- **Windows**: window controls on the wrong side, Alt+F4 doesn't close, no
  system-tray presence when one is expected, taskbar icon missing
- **Linux**: incorrect window-decorations theme, shortcut collisions with
  GNOME/KDE defaults, app doesn't appear in system settings "Default
  Applications"
- **Cross-platform parity**: a feature present on macOS is missing on
  Windows without clear reason

See `cross-platform-conventions.md` for the full list of platform-specific
expectations.

### 8. Crash / runtime error

- Main-process crash (the whole app dies; no windows remain)
- Renderer crash (a single window becomes white / "Aw, Snap"; others may
  still work)
- IPC error thrown from a handler that's not caught
- Uncaught promise rejection flooding the log
- Chromium sad-face / out-of-memory
- Auto-updater download failure loop

Crash issues **always** have severity = critical regardless of how hard
they are to trigger.

---

## Per-surface exploration checklist

Apply to every surface visited during Phases 2–6:

1. **Visual scan** — screenshot; compare against cross-platform conventions
   (window controls, menu bar, shortcut keys)
2. **Accessibility snapshot** — `playwright-cli --s=default snapshot`; scan
   for unlabeled controls, empty-name interactive elements, placeholder text
3. **Every button / menu item** — click or fire each in turn; confirm action,
   confirm close/back path works, check log tail for errors
4. **Every field** — empty submit, valid input, invalid input, 2000+ char
   input, paste from clipboard
5. **Every modal** — can it be dismissed? (Esc, click-outside, explicit
   Cancel) — at least one must work
6. **Dark Mode** — flip OS appearance → rescan visually
7. **Offline** — disable network → try the primary flow → restore network
8. **Window resize (small)** — drag to min size → rescan for layout breaks →
   restore
9. **Keyboard-only navigation** — Tab through, every interactive element
   reachable in reading order
10. **Log check** — tail `/tmp/qa-electron-session/app.log`; any new errors
    during this surface?
