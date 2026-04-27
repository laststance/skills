# iOS QA Report: {APP_NAME}

| Field | Value |
|-------|-------|
| **Date** | {DATE} |
| **Bundle ID** | {BUNDLE_ID} |
| **Version / Build** | {CFBundleShortVersionString} / {CFBundleVersion} |
| **Device** | {DEVICE_NAME} ({DEVICE_TYPE}, iOS {IOS_VERSION}) |
| **Simulator UDID** | {UDID} |
| **Scope** | {SCOPE or "Full app"} |
| **Duration** | {DURATION} |
| **Screens visited** | {COUNT} |
| **Screenshots** | {COUNT} |
| **Appearance tested** | Light / Dark / both |
| **Orientation tested** | Portrait / Landscape / both |
| **Dynamic Type tested** | Default / XXL / both |

## Health Score: {SCORE}/100

| Category | Score | Notes |
|----------|-------|-------|
| HIG compliance | {0-100} | tap targets, safe area, nav |
| Functional | {0-100} | every button does what it says |
| Visual | {0-100} | layout, assets, alignment |
| Accessibility | {0-100} | VoiceOver labels, contrast, traits |
| State handling | {0-100} | Dark Mode, Dynamic Type, rotation |
| Content | {0-100} | typos, placeholders, localization |
| Stability | {0-100} | crashes, memory warnings |

Scoring guide: subtract 20 for each critical, 8 for each high, 3 for
each medium, 1 for each low, clamp to [0, 100]. This is a rough
health-check number, not a benchmark — the issue list is what matters.

## Top 3 Things to Fix

1. **{ISSUE-NNN}: {title}** — {one-line description and why it ships
   first}
2. **{ISSUE-NNN}: {title}** — {…}
3. **{ISSUE-NNN}: {title}** — {…}

## Runtime health

Errors and crashes surfaced during the session.

| Level | Message | Count | First screen |
|-------|---------|-------|--------------|
| error | {message} | {N} | {screen} |
| fault | {message} | {N} | {screen} |

Crash reports picked up (if any):

| File | Thread | Reason |
|------|--------|--------|
| {filename}.ips | {N} | {exception type or signal} |

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
| HIG | | | | |
| Functional | | | | |
| Visual | | | | |
| Accessibility | | | | |
| State | | | | |
| Content | | | | |
| Crash | | | | |

---

## Issues

### ISSUE-001: {Short title}

| Field | Value |
|-------|-------|
| **Severity** | critical / high / medium / low |
| **Category** | hig / functional / visual / accessibility / state / content / crash |
| **Screen** | {screen name or route} |
| **State** | {default / dark mode / landscape / dynamic type XXL / offline …} |
| **Affected builds** | {version-build} |

**What's wrong:** {expected vs actual in one or two sentences}

**Repro:**

1. Launch app from cold state
   ![Step 1](screenshots/issue-001-step-1.png)
2. {Action — "Tap Settings tab"}
   ![Step 2](screenshots/issue-001-step-2.png)
3. **Observe:** {what goes wrong}
   ![Result](screenshots/issue-001-result.png)

**AX evidence** (if applicable):

```json
{
  "AXRole": "AXButton",
  "AXLabel": "",
  "frame": { "x": 340, "y": 52, "width": 24, "height": 24 }
}
```

Frame is 24×24 pt — below the 44 pt HIG minimum, and there's no
`AXLabel` so VoiceOver can't announce it.

**Log excerpt** (if applicable):

```
2026-04-15 12:34:56.789 MyApp[1234:5678] [Error] Failed to decode
response: keyNotFound(CodingKeys(stringValue: "id"))
```

---

(Repeat for each issue — group under `## Critical`, `## High`, `## Medium`,
`## Low` subheadings for navigability.)

---

## Coverage notes

Things intentionally **not** tested in this run (and why):

- {e.g., Push notifications — requires physical device}
- {e.g., In-app purchases — sandbox account not configured}
- {e.g., Location — sim location API not exercised}

## Ship readiness

| Metric | Value |
|--------|-------|
| Critical issues | {N} |
| High issues | {N} |
| HIG violations | {N} |
| Crashes observed | {N} |

**Recommendation:** {ship / hold for fixes / needs design pass}

Short justification: {one sentence — e.g., "Two critical crashes and a
HIG tap-target violation on the primary CTA — fix before TestFlight."}

## Environment tested

- **macOS**: {version}
- **Xcode**: {version} (if known — `xcodebuild -version`)
- **Simulator runtime**: iOS {version}
- **Device type**: {e.g., iPhone 15 Pro, iPad Pro 13-inch (M4)}
- **Locale**: {e.g., en_US}
- **Time zone**: {…}

If the defect list looks different under another locale or device type,
that's worth a separate run.
