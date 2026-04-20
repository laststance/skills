# Exploratory testing heuristics — Electron edition

Phase 9 begins after the matrix (Phase 3) plus systematic passes (Phases
4-8) are done. The matrix tells you "every advertised feature works in its
happy path." Exploratory testing tells you what the matrix can't:

- What happens **between** steps of two features?
- What happens when the user does things in an **order the designer didn't
  anticipate**?
- When the UI says something changed, did the **filesystem / DB / main
  process** actually change?
- What happens during the **moments of transition** — sleep, focus loss,
  network flap?

This file gives you **tours** — structured lenses for generating test cases
on the fly. Pick 2-4 tours per run based on the app's shape.

## Budget

Allocate **15-25% of total QA time** to exploratory. For a 60-minute run,
that's 10-15 minutes. If you blow past 25 minutes without finding anything
interesting, stop — either the app is robust here or you need a different
tour.

## Tour selection — match the tour to the app

| If the app primarily... | Start with these tours |
|---|---|
| Manages files on disk (notes, photos, symlinks) | Truth-vs-Appearance, Goldfish |
| Syncs in real time (chat, collab, presence) | Two-at-Once, Goldfish, Truth-vs-Appearance |
| Runs background work (downloads, builds, indexing) | Before-It-Finishes, Goldfish |
| Has heavy forms / validation | Wrong-Order, Input-Boundary |
| Has many navigable views (IDE, browser, mail) | Wrong-Order, Recursion-Reentry |
| Persists across restart (pretty much any Electron app) | Goldfish (mandatory) |

## Mindset

Exploratory is **curiosity-first**, not checklist-first. For each tour,
**state the question out loud before running it**, and note the answer
whether interesting or boring. A boring answer ("the app handled it
correctly") is still a signal — it's evidence the underlying invariant is
well-protected.

Every interesting finding is a **candidate issue** for Phase 10 (Triage).
Don't pre-filter during exploration; note everything.

---

## Tour 1 — Truth vs Appearance

**Core question**: Does what the UI shows match what is actually on disk /
in the database / in the main process?

Electron apps show the user a **view** of state held by the main process,
filesystem, or database. When those diverge, the user sees ghosts: deleted
items that come back, items that look saved but disappear on relaunch,
toggles that stick visually but don't persist, counts that don't add up.

This is **the highest-ROI Electron-specific tour**. Do it on every run.

### Prompts

- UI says "Deleted". Open a shell: `ls <path>` — is the file actually gone,
  or moved to trash, or still there as `.filename.bak`?
- UI shows "3 items". Find the source of truth (the database file, the JSON
  file, the directory). Count rows there. Do the counts match?
- Click "Save" → close the window WITHOUT waiting for the save-confirmed
  toast → reopen. Did it actually save?
- Flip a preference → quit the app → relaunch. Did the preference stick?
- UI shows a symlink as "valid". `readlink -f <symlink>` from shell — is
  the target the same one the UI names? Is the target alive?
- Rename something in the UI. `ls` — is the on-disk name updated? Any
  orphan left behind?
- Two windows show the same data. Change it in window A. Does window B
  update? Immediately? Only after refocus?
- The app "synced" something. `curl` / check the server side — did the
  server actually receive it?

### How to verify (shell-side)

Keep a shell open alongside the app. After every state-change action in the
UI, inspect the underlying store:

```bash
# Filesystem-backed state
ls -la <path>
readlink <symlink>
stat <file>

# SQLite-backed state (common in Electron apps)
sqlite3 ~/Library/Application\ Support/<AppName>/db.sqlite "SELECT COUNT(*) FROM <table>"

# JSON / YAML config
cat ~/Library/Application\ Support/<AppName>/config.json | jq '.thatField'

# Electron app userData dir locations
#   macOS:   ~/Library/Application Support/<AppName>
#   Windows: %APPDATA%\<AppName>
#   Linux:   ~/.config/<AppName>
```

### Example finding shape

- Title: "Deleted skill reappears after app restart"
- Repro: select skill `foo` → click Delete → confirm → quit app → relaunch
- Expected: `foo` does not appear in the main list
- Actual: `foo` reappears. `ls ~/.agents/skills/foo` confirms the directory
  was never actually removed — only the in-memory Redux state was updated.
- Severity: high (data integrity — user thinks they deleted something that
  isn't deleted)

---

## Tour 2 — What If I...

**Core question**: What happens between the matrix's steps?

The matrix says "click X → see Y". Real users do weird things in the gap.

### Prompts

- Double-click where the matrix says single-click
- Press Enter during an entry/exit animation
- Click the same button twice in rapid succession (race condition?)
- Press Esc during a dialog's opening animation
- Right-click where the matrix says left-click
- Scroll wheel over a button or slider
- Tab out of a field mid-typing — does what you typed commit?
- Click outside a dropdown while it's still opening
- Keyboard shortcut for an action while that action's menu item is highlighted by mouse hover

---

## Tour 3 — Before It Finishes

**Core question**: What if I interrupt a long-running operation?

Electron's main process and renderer are separate. Long operations show
spinners in the renderer while the main process (or a worker) is doing the
actual work. Interruption during that gap is a bug farm.

### Prompts

- Start a bulk operation → navigate away before it finishes
- Start an upload → disable network mid-stream
- Start a delete → quit the app (`Cmd+Q`) before the delete completes
- Start a rename → rename something else before the first rename commits
- Trigger a background task → send the app to background (`Cmd+Tab`)
- Trigger a confirmation dialog → quit via menu before confirming
- Paste into a slow-to-render editor → hit Cmd+S before paste is displayed

### Example for Skills Desktop bulk delete

The app's bulk delete shows a 15-second undo toast. Exploratory scenarios:

- Click Delete → switch to another tab during the 15s → is the toast still
  visible? Still undoable?
- Click Delete → quit the app during the 15s → relaunch → are the items
  actually deleted, or was the deletion cancelled?
- Click Delete → click Delete AGAIN on a different set during the first
  15s — does the second action clobber the first undo?
- Click Delete → click Undo within 1 second → is the full state restored
  including symlinks on disk?

---

## Tour 4 — Two At Once

**Core question**: Does the app handle concurrent operations from different
surfaces, processes, or timing?

### Prompts

- Perform the same action from two windows simultaneously
- Main window triggers X; preferences window triggers X at the same time
- Bulk action + single-item action racing on the same item
- Open the same record from two places, edit both, save both — who wins?
- The Electron main process does work while the renderer is also doing work
  on the same data (IPC race)
- External CLI (if the app has one) modifies data while the UI is open —
  does the UI notice?
- Sibling process reading the same file/DB (two Electron instances, or the
  user's shell editor) — file lock respected?

---

## Tour 5 — Goldfish

**Core question**: Does the app remember? Does it forget? Does it re-learn?

Every Electron app is persistent. The user expects state to survive restart,
system sleep, long backgrounding. Few apps actually test this.

### Prompts

- Action → quit → relaunch. Still there?
- Action → `sleep 30` → same window still responsive?
- Minimize for 5 minutes → restore → same state? Subscriptions still live?
- Background the app for an hour → foreground → reconnects? Silent errors?
- Put laptop to sleep with app running → wake → app still responsive?
  Network reconnects cleanly? No zombie retry loop?
- System date changes while app is backgrounded — does the app cope with
  time going "backwards" if user fixed their clock?
- User's network changes (wifi → different wifi) — does the app re-auth?

---

## Tour 6 — Wrong Order

**Core question**: Does the app survive sequences the designer didn't plan?

### Prompts

- Undo → redo → undo again → redo → delete → undo (chain)
- Open dialog → Esc → reopen → interact — stale state in the reopened
  dialog?
- Go back → go forward → go back — breadcrumb / history coherent?
- Multi-step wizard: step 3 → back → step 1 → forward → skip step 2 → submit
- Select item → sort list → is selection still on the same item, or same
  position?
- Toggle setting A → toggle setting B → undo → what got undone?
- Delete item → rename a different item → undo — which one got restored?

---

## Tour 7 — Recursion & Reentry

**Core question**: What if the thing references itself?

### Prompts

- Can I drag a folder into itself?
- Can I set A's parent as B, then set B's parent as A (create a cycle)?
- Can I open Preferences from inside a modal opened from Preferences?
- Can I trigger a notification that's also a deep link that reopens this
  same window?
- Can I assign a keyboard shortcut that conflicts with a system shortcut?
  With another app's shortcut? With the app's own existing shortcut?
- Can I create a symlink pointing to itself?

---

## Tour 8 — Input Boundary

**Core question**: What's beyond the expected input range?

### Prompts

- Empty string, whitespace only, single character
- 10K characters, 100K characters, paste from a book
- Emoji (including emoji ZWJ sequences — "👨‍👩‍👧‍👦" is one glyph but several
  codepoints)
- RTL (Hebrew, Arabic), mixed LTR + RTL
- Zero-width characters, soft-hyphens, BOM
- Path with spaces, quotes, backticks, `../..`, shell metachars
- Timestamps in the past (1970-01-01), in the distant future (2099), at DST
  transitions
- Negative numbers where positive expected, zero, NaN, Infinity
- Filenames with reserved characters (`:` on macOS, `?*<>|` on Windows)
- URLs with fragments, query strings, Unicode in path, IDN domains

---

## Tour 9 — Platform Reality

**Core question**: What OS quirks did the app forget to handle?

### Prompts

- Permission denied — `chmod 000` the target directory, try to save there
- Disk almost full — `diskutil info /` to check space
- OS in Dark Mode while app sets Light explicitly — does it flash? Render a
  hybrid?
- Non-ASCII filenames (Japanese, emoji in the filename)
- Accessibility permission revoked mid-session (macOS System Settings →
  Privacy → Accessibility → remove)
- Secondary display unplugged while a window is on it
- User renames their home directory (this rarely works on any OS, but worth
  trying on a dev machine)
- Auto-update triggers while app has unsaved work

---

## Recording findings

For each finding, note:

| Field | Example |
|---|---|
| Tour | Truth-vs-Appearance |
| Prompt used | "UI says 'Deleted'. Check filesystem." |
| What I expected | Directory gone from `~/.agents/skills/foo` |
| What I saw | Directory still present; only the symlink in `~/.claude/skills/foo` was removed |
| Severity hint | high (data integrity) |
| Repro | select foo → Delete → confirm → `ls ~/.agents/skills/` shows foo still present |
| Evidence | screenshot of UI, shell output showing the file |

Move each finding into the main issues list during Phase 10 (Triage),
de-duplicating against matrix failures.

## When to stop

Stop exploratory testing when:

- You've run 2-4 tours and each produced at least one reflective note (even
  if "no finding — the app handled this well"), OR
- You've hit the time budget (15-25% of total QA run), OR
- You have enough findings that Phase 10 (Triage) will run long — better to
  triage what you have than pile on.

Do NOT stop just because the first tour produced nothing. Try a second
tour first — different tour, different class of bugs.
