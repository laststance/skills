# Cross-platform conventions for Electron apps

Electron apps render the same Chromium UI everywhere, but the OS surrounding
that UI has strong conventions. Apps that ignore them feel "off" — the
complaint is usually "doesn't feel native" without the user being able to
point at one thing.

This file lists the specific things this skill checks against, per
platform. Source: the operating-system HIGs (Apple HIG, Microsoft Fluent,
GNOME HIG / KDE HIG) plus de-facto Electron community conventions.

## macOS

### Window chrome

- **Traffic lights** (red/yellow/green) at top-left corner, in the usual
  positions. Distance from edge should match native apps (~8pt from top,
  ~12pt from left).
- **Title bar** — either the standard title bar with window title centered,
  or `titleBarStyle: 'hiddenInset'` with the traffic lights visible against
  a custom background. Apps that hide the traffic lights entirely are
  breaking macOS UX unless there's a strong reason.
- **Full-screen button** (green traffic light): expanding/collapsing should
  work. Apps that disable it without replacing it with a native fullscreen
  are broken.

### Menu bar

macOS apps have a global menu bar with standard items:

- **App menu** (app name): About <App>, Preferences… (`Cmd+,`), Services
  submenu, Hide <App> (`Cmd+H`), Hide Others (`Cmd+Option+H`), Show All,
  Quit <App> (`Cmd+Q`)
- **File**: New (`Cmd+N`), Open (`Cmd+O`), Close Window (`Cmd+W`), Save
  (`Cmd+S`) if applicable, Print (`Cmd+P`) if applicable
- **Edit**: Undo (`Cmd+Z`), Redo (`Cmd+Shift+Z`), Cut/Copy/Paste/Select All
  (`Cmd+X/C/V/A`), Find (`Cmd+F`) if applicable
- **View**: Toggle Full Screen (`Ctrl+Cmd+F`) — app may add its own
- **Window**: Minimize (`Cmd+M`), Zoom, Bring All to Front
- **Help**: at least a Search field

An Electron app that ships with only a File/Edit/Help menu and no App or
Window menu is a red flag. Electron's default menu template covers most
of this — apps usually break it by replacing with a custom menu that omits
standard items.

### Keyboard shortcuts

- Cmd, not Ctrl, for most shortcuts
- `Cmd+Q` must quit
- `Cmd+W` must close the focused window (or tab in tabbed apps)
- `Cmd+,` opens Preferences (almost universal)
- Standard editing shortcuts (`Cmd+Z/X/C/V/A`) must work in every text
  input, without the app re-implementing them (breaking VoiceOver etc.)

### Dark Mode

- Follow the OS setting by default. Apps that force Light mode when the
  OS is Dark need a visible reason.
- No white flash on launch before the dark theme applies — use
  `backgroundColor` in the `BrowserWindow` config to match

### Notifications

- Use the native notification API, not an in-app overlay
- Notification click focuses the relevant window and navigates to the
  relevant content

### Tray (menu bar extra)

If the app has a tray icon:

- Left-click toggles the main window (common) OR opens a menu (less common)
- Right-click always opens a menu (system convention)
- Menu always has Quit as the last item
- Icon should be template-style (monochrome), so macOS can tint it for
  Dark Mode / accent color

## Windows

### Window chrome

- **Window controls** (minimize / maximize / close) at **top-right** corner
- **Title bar** shows app icon on the left, title centered or left-aligned
- **Aero / Fluent snap** support — dragging to edges should dock

### Menu bar

Windows apps have two acceptable menu patterns:

1. **Classic menu bar** below the title bar (File, Edit, View, Help)
2. **Hamburger menu / ribbon** (more modern; used in VS Code, Teams)

Unlike macOS there's no global menu bar. Whichever pattern the app uses,
be consistent. A bare Electron app that just has an Electron-default
menu bar on Windows that mirrors the macOS menu (App menu and all) looks
wrong — the App menu with Preferences/Quit doesn't belong on Windows.

### Keyboard shortcuts

- Ctrl, not Cmd, for most shortcuts
- `Alt+F4` must close the window
- `Ctrl+W` close tab/document (if applicable)
- `F11` toggle fullscreen
- Alt+X mnemonics on menu items (underlined letter)

### System tray

Common on Windows — many apps minimize to tray by default. If present:

- Right-click opens menu with at least "Open" and "Quit"
- Double-click opens the main window
- Icon visible in "Show hidden icons" tray region, or the primary tray

### Notifications

- Use Windows toast (Action Center)
- Click routes to the correct window

### Dark Mode

- Windows 10/11 has a system setting — apps should follow it
- Windows title-bar theming is a separate toggle (`DwmSetWindowAttribute`)
  — if the app goes dark but the title bar stays light, it's a bug

## Linux

Linux is the hardest platform to get right because of DE fragmentation
(GNOME vs KDE vs others). Minimum bar:

### Window chrome

- Window controls location follows the DE (right on most GNOME / KDE,
  left on some Ubuntu variants) — do NOT force a location; let the DE
  decide
- CSD (client-side decorations) vs SSD (server-side) — GNOME prefers
  CSD, KDE prefers SSD; most Electron apps use CSD and that's usually
  accepted

### Menu bar

- Classic in-window menu bar (File, Edit, View, Help) — no global menu
  bar expected unless the user has Unity / KDE global menu enabled
- App menu (Quit, Preferences) may or may not be expected depending on
  DE

### Keyboard shortcuts

- Ctrl, same as Windows
- `Ctrl+Q` quits (GNOME convention; KDE uses `Ctrl+Q` too)
- `Super+H` may be intercepted by the DE — if so, don't also bind it

### System tray

- GNOME dropped StatusNotifier support; may require an extension
- KDE supports it natively
- Apps that rely on a tray on Linux should degrade gracefully when the
  DE doesn't show one

### Desktop integration

- `.desktop` file in `~/.local/share/applications/` or
  `/usr/share/applications/` makes the app appear in the launcher and the
  "Default Applications" system settings
- MIME types / protocol handlers registered via the `.desktop` file

## Cross-platform parity — what SHOULD look the same

Users moving between platforms expect:

- **Features** — if you can drag-drop a file onto the main window on
  macOS, you should be able to on Windows/Linux
- **Keyboard behavior** — `Cmd+C / Ctrl+C` both copy; the modifier swaps
  but the verb doesn't
- **Content rendering** — text layout, fonts (SF Pro on macOS / Segoe UI
  on Windows / system default on Linux is fine), image rendering, Dark
  Mode colors
- **IPC / API surface** — if a plugin works on macOS, it should work on
  Windows unless there's a platform-specific reason (filesystem case
  sensitivity, path separators)

## Cross-platform parity — what SHOULD differ

- **Where window controls are** — follow the OS
- **Which menus exist** — App menu on macOS, no App menu on Windows
- **Which shortcuts** — Cmd vs Ctrl, `Cmd+Q` vs `Alt+F4`
- **Which OS integrations fire** — tray icon on Windows (expected),
  menu-bar extra on macOS (optional), etc.
- **Dock badge** (macOS) vs taskbar overlay (Windows) vs dock badge-
  equivalent (Linux varies)

An app that uses `process.platform` branches for these is doing it right.
An app that forces one platform's conventions everywhere is doing it
wrong.

---

## How this file is used by the skill

During Phase 2 (visual scan) and Phase 4 (native OS integration), the
SKILL.md prompt tells Claude to "compare against
`cross-platform-conventions.md`". What that means in practice: sanity-
check each screen / menu / window against the list above for the **host
OS the skill is running on**, and raise a severity-medium issue for each
violation found (severity-high if the violation breaks a core shortcut
like Cmd+Q).

This file is not exhaustive — it's the subset of platform conventions
checkable from screenshots + menu-bar driving + a log tail. For shipping,
each platform has a full HIG that's authoritative.
