# Electron QA Report: {APP_NAME}

| Field | Value |
|-------|-------|
| **Date** | {DATE} |
| **App** | {APP_NAME} |
| **Version** | {APP_VERSION} |
| **Electron version** | {ELECTRON_VERSION} |
| **Chromium version** | {CHROME_VERSION} |
| **Host OS** | {OS_NAME} {OS_VERSION} |
| **Host arch** | {ARCH (arm64 / x64)} |
| **CDP port** | {PORT} |
| **Scope** | {SCOPE or "Full app"} |
| **Duration** | {DURATION} |
| **Windows inspected** | {COUNT} |
| **Webviews inspected** | {COUNT} |
| **Menu items walked** | {COUNT} |
| **Screenshots** | {COUNT} |
| **OS theme tested** | Light / Dark / both |
| **Network states tested** | online / offline / both |

## Health Score: {SCORE}/100

| Category | Score | Notes |
|----------|-------|-------|
| Security | {0-100} | nodeIntegration, contextIsolation, external links, CSP |
| Functional | {0-100} | every menu item, every button, every field |
| Visual | {0-100} | layout, assets, alignment, HiDPI |
| Accessibility | {0-100} | keyboard nav, screen reader, contrast, zoom |
| State handling | {0-100} | Dark Mode, offline, resize, multi-monitor |
| Content | {0-100} | typos, placeholders, localization |
| Platform | {0-100} | native conventions for {OS_NAME} |
| Stability | {0-100} | crashes, runtime errors, memory growth |

Scoring guide: subtract 20 for each critical, 8 for each high, 3 for each
medium, 1 for each low, clamp to [0, 100]. This is a rough health-check
number, not a benchmark — the issue list is what matters.

## Top 3 Things to Fix

1. **{ISSUE-NNN}: {title}** — {one-line description and why it ships first}
2. **{ISSUE-NNN}: {title}** — {…}
3. **{ISSUE-NNN}: {title}** — {…}

## Runtime health

Errors and crashes surfaced during the session.

### Main-process log excerpts

| Level | Message | Count | First surface |
|-------|---------|-------|---------------|
| error | {message} | {N} | {window / menu} |
| warn  | {message} | {N} | {…} |

### Renderer console errors

Captured via `playwright-cli --s=default eval` + log tail.

| Level | Message | Target | Count |
|-------|---------|--------|-------|
| error | {message} | main window | {N} |
| error | {message} | webview-N | {N} |

### Crash reports picked up (if any)

| File | Process | Reason |
|------|---------|--------|
| {filename}.ips | main / renderer | {exception type or signal} |

## Security posture

| Check | Result |
|-------|--------|
| `nodeIntegration` in main window | true / **false** / unknown |
| `contextIsolation` in main window | **true** / false / unknown |
| `sandbox` in main window | true / **false** / unknown |
| CSP set on main window | present / missing |
| External links open in OS default browser | yes / no |
| DevTools accessible in production | no / **yes (flag)** |
| `allowRunningInsecureContent` anywhere | no / **yes (flag)** |
| `webSecurity` disabled anywhere | no / **yes (flag)** |

Bold values are the ones that would typically be findings. If a bold value
applies, link to the corresponding ISSUE in the details section.

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |
| **Total** | **0** |

By category:

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Security | | | | |
| Functional | | | | |
| Visual | | | | |
| Accessibility | | | | |
| State | | | | |
| Content | | | | |
| Platform | | | | |
| Crash | | | | |

---

## Issues

### ISSUE-001: {Short title}

| Field | Value |
|-------|-------|
| **Severity** | critical / high / medium / low |
| **Category** | security / functional / visual / accessibility / state / content / platform / crash |
| **Scope** | main window / preferences window / webview-N / menu bar / tray icon |
| **Host OS** | {OS_NAME} {OS_VERSION} |
| **State** | {default / dark mode / offline / small window / zoomed 200% …} |
| **Affected versions** | {app-version} |

**What's wrong:** {expected vs actual in one or two sentences}

**Repro:**

1. Launch from cold: `open -a "<App>" --args --remote-debugging-port=9222`
   ![Step 1](screenshots/issue-001-step-1.png)
2. {Action — "File → New Window via menu bar"}
   ![Step 2](screenshots/issue-001-step-2.png)
3. **Observe:** {what goes wrong}
   ![Result](screenshots/issue-001-result.png)

**Snapshot evidence** (if applicable):

```
- button "Send" [ref=e12]
- button "" [ref=e13]      ← missing accessible name
```

**Renderer evaluation evidence** (for security findings):

```
$ playwright-cli --s=default eval 'typeof require'
"function"
```
Indicates `nodeIntegration: true` on this window — the renderer has
access to Node APIs including `fs`, `child_process`, and `require`.

**Log excerpt** (if applicable):

```
2026-04-15T12:34:56.789Z [error] IPC handler 'load-config' threw:
TypeError: Cannot read properties of undefined (reading 'path')
    at /app/src/main/config.ts:42:18
```

---

(Repeat for each issue — group under `## Critical`, `## High`, `## Medium`,
`## Low` subheadings for navigability.)

---

## Cross-platform notes

Things that behave differently than documented conventions:

| Convention | Expected on {OS} | Observed | Severity |
|------------|-----------------|----------|----------|
| `Cmd+Q` quits | yes (macOS) | no | high |
| App menu present | yes (macOS) | absent | medium |
| {…} | | | |

If this run tested only one OS, flag that explicitly and recommend running
the skill again on the other platform(s) before release.

## Coverage notes

Things intentionally **not** tested in this run (and why):

- {e.g., Auto-updater E2E — requires a staged release channel}
- {e.g., Code-signing chain — requires `spctl` deep audit}
- {e.g., Crashpad minidump decoding — no symbols available}
- {e.g., Performance profiling — out of scope}
- {e.g., Windows / Linux — host is macOS; run skill on those OSes for parity}

## Ship readiness

| Metric | Value |
|--------|-------|
| Critical issues | {N} |
| High issues | {N} |
| Security findings (any severity) | {N} |
| Platform-convention violations | {N} |
| Crashes observed | {N} |

**Recommendation:** {ship / hold for fixes / needs security pass / needs
design pass}

Short justification: {one sentence — e.g., "One critical `nodeIntegration:
true` on the main window renders remote chat content — hold for security
fix before release."}

## Environment tested

- **Host OS**: {e.g., macOS 15.2}
- **Host arch**: {arm64 / x64}
- **Electron**: {version — from `playwright-cli --s=default eval 'process.versions.electron'` or app's package.json}
- **Chromium**: {version — from `navigator.userAgent`}
- **playwright-cli**: {version — `playwright-cli --version`}
- **Locale**: {e.g., en_US}
- **Display scale**: {1x / 2x / 3x}
- **Secondary display**: {present / absent}

If the defect list looks different on another OS, architecture, or
display configuration, that's worth a separate run.
