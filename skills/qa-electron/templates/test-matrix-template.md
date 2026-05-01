# Test Matrix — {{APP_NAME}} v{{VERSION}}

| Field | Value |
|---|---|
| App | {{APP_NAME}} v{{VERSION}} |
| Electron | {{ELECTRON_VERSION}} |
| Scope | {{SCOPE}} |
| Host | {{HOST_OS}} |
| Date | {{DATE}} |
| Matrix generated from | Phase 1 surface inventory |

## Coverage summary

Fill in as cases are executed. `Coverage = (Total - NotRun) / Total`. Happy-path target is **≥ 95%**.

| Surface | Total | PASS | FAIL | BLOCKED | NOT RUN | Coverage |
|---|---|---|---|---|---|---|
| Main window | 0 | 0 | 0 | 0 | 0 | 0% |
| Secondary windows | 0 | 0 | 0 | 0 | 0 | 0% |
| Preferences | 0 | 0 | 0 | 0 | 0 | 0% |
| Menu bar | 0 | 0 | 0 | 0 | 0 | 0% |
| Tray | 0 | 0 | 0 | 0 | 0 | 0% |
| Deep links | 0 | 0 | 0 | 0 | 0 | 0% |
| End-to-end flows | 0 | 0 | 0 | 0 | 0 | 0% |
| **Total** | **0** | **0** | **0** | **0** | **0** | **0%** |

Status glyphs: `PASS` / `FAIL` / `BLOCKED` / `NOT RUN`

## Test cases

Rows grouped by surface. Each row is independently runnable from a cold app state unless **Preconditions** says otherwise.

### Main window

| TC# | Feature | Action | Preconditions | Expected | Status | Evidence | Notes |
|---|---|---|---|---|---|---|---|
| TC-001 | {{feature}} | {{action}} | cold launch | {{expected}} | NOT RUN | — | — |
| TC-002 | ... | ... | ... | ... | NOT RUN | — | — |

### Secondary windows

| TC# | Window | Action | Preconditions | Expected | Status | Evidence | Notes |
|---|---|---|---|---|---|---|---|
| TC-NNN | {{window}} | {{action}} | {{preconditions}} | {{expected}} | NOT RUN | — | — |

### Preferences

| TC# | Panel | Setting / action | Preconditions | Expected | Status | Evidence | Notes |
|---|---|---|---|---|---|---|---|
| TC-NNN | {{panel}} | {{setting}} | open Preferences | {{expected}} | NOT RUN | — | — |

### Menu bar

| TC# | Menu | Item | Shortcut | Preconditions | Expected | Status | Evidence |
|---|---|---|---|---|---|---|---|
| TC-NNN | File | New Window | Cmd+N | cold launch | new window opens | NOT RUN | — |

### Tray

| TC# | Trigger | Expected | Status | Evidence | Notes |
|---|---|---|---|---|---|
| TC-NNN | right-click tray icon | menu appears with N items | NOT RUN | — | — |

### Deep links

| TC# | URL | Expected | Status | Evidence | Notes |
|---|---|---|---|---|---|
| TC-NNN | `{{proto}}://{{path}}` | app opens to matching view | NOT RUN | — | — |

### End-to-end flows

For multi-step user journeys (onboarding, create-edit-delete, share, bulk action, undo). Each row is ONE complete flow from cold launch to success confirmation.

| TC# | Flow | Starting state | Steps (brief) | Ending state | Status | Evidence | Notes |
|---|---|---|---|---|---|---|---|
| TC-NNN | {{flow_name}} | cold launch | 1→2→3→4 | {{success_state}} | NOT RUN | — | — |

## Failures detail

For each case with Status = `FAIL`, expand here. Link to ISSUE-NNN in the main QA report.

### TC-NNN — {{title}}

| Field | Value |
|---|---|
| Severity | critical / high / medium / low |
| Repro | (steps from cold launch) |
| Expected | (copied from matrix row) |
| Actual | (what actually happened) |
| Evidence | `screenshots/TC-NNN-before.png`, `screenshots/TC-NNN-after.png`, `snapshots/TC-NNN.txt` |
| Log excerpt | (relevant lines from `/tmp/qa-electron-session/app.log`) |
| Issue ID | ISSUE-NNN (in main report) |

## Deferred / blocked

Cases that could not be executed this run. Tag each with a reason the reviewer can resolve.

| TC# | Reason deferred | Follow-up needed |
|---|---|---|
| TC-NNN | destructive on user data, needs staging account | provision test account |
| TC-NNN | requires second physical display | run on dev laptop with external monitor |

## Matrix execution notes

- Pre-flight verified `pnpm dev` running with CDP 9222 and `playwright-cli attach --cdp=http://localhost:9222`
- Cases were executed in surface order (Main → Secondary → Preferences → Menu → Tray → Deep links → E2E flows)
- Any case touching filesystem, DB, or network was followed by a **truth check** (compare UI state vs on-disk state)
- Each surface was screenshot-baselined before running cases on it

---

Generated: {{DATE}}
Matrix source: Phase 1 inventory at `snapshots/00-snapshot.txt`
