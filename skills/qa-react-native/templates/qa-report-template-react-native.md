# React Native QA Report: {APP_NAME}

| Field | Value |
|-------|-------|
| **Date** | {DATE} |
| **App** | {APP_NAME} |
| **Bundle ID / Package** | {BUNDLE_ID} |
| **App version** | {VERSION} ({BUILD}) |
| **RN version** | {e.g., 0.76.3} |
| **Expo SDK** | {e.g., 52 / bare RN} |
| **JS engine** | Hermes / JSC |
| **Mode tested** | dev / release |
| **Metro reachable** | yes / no |
| **Scope** | {SCOPE or "Full app"} |
| **Duration** | {DURATION} |
| **Screens visited** | iOS: {N}, Android: {N} |
| **Screenshots** | {COUNT} |
| **Platforms tested** | iOS only / Android only / **both** |

### iOS environment

| Field | Value |
|-------|-------|
| **Device** | {DEVICE_NAME} ({DEVICE_TYPE}) |
| **iOS version** | {IOS_VERSION} |
| **Simulator UDID** | {UDID} |
| **Appearance tested** | Light / Dark / both |
| **Font scale tested** | Default / XXL / both |
| **Orientation tested** | Portrait / Landscape / both |

### Android environment

| Field | Value |
|-------|-------|
| **Device / emulator** | {e.g., Pixel 7 API 34} |
| **Android version** | {e.g., 14} |
| **API level** | {e.g., 34} |
| **Screen size** | {e.g., 1080×2400} |
| **Density** | {e.g., 420 dpi} |
| **Dark mode tested** | yes / no |
| **Font scale tested** | 1.0 / 1.3 / both |
| **Orientation tested** | Portrait / Landscape / both |

## Health Score: {SCORE}/100

| Category | Score | Notes |
|----------|-------|-------|
| Redbox / runtime errors | {0-100} | zero redboxes in a ship-ready build |
| LogBox warnings | {0-100} | warnings that block ship vs deprecation noise |
| Platform parity | {0-100} | iOS vs Android behavior consistency |
| Functional | {0-100} | every button does what it says, on both |
| Visual | {0-100} | layout, assets, alignment per platform |
| Accessibility | {0-100} | labels, traits, contrast, font scale |
| State handling | {0-100} | Dark Mode, font scale, rotation, offline |
| Content | {0-100} | typos, placeholders, localization |
| Performance | {0-100} | list scroll, animations, bundle size |
| Stability | {0-100} | native crashes, ANRs, bridge failures |

Scoring guide: subtract 20 for each critical, 8 for each high, 3 for each
medium, 1 for each low, clamp to [0, 100]. Rough health number — the
issue list is what matters.

## Top 3 Things to Fix

1. **{ISSUE-NNN}: {title}** ({platform}) — {one-line description and why
   it ships first}
2. **{ISSUE-NNN}: {title}** ({platform}) — {…}
3. **{ISSUE-NNN}: {title}** ({platform}) — {…}

## Redbox / JS runtime errors

Every redbox observed during the session. Always critical.

| Platform | Screen | Error message | First occurrence |
|----------|--------|---------------|------------------|
| iOS | {screen} | {message} | step {N} |
| Android | {screen} | {message} | step {N} |

## LogBox warnings

Yellow warnings seen. Triage by severity.

| Platform | Screen | Warning | Severity assigned |
|----------|--------|---------|-------------------|
| iOS | {screen} | {warning text} | high / medium / low |
| Android | {screen} | {…} | |

## Platform parity findings

Differences between iOS and Android that looked like bugs (not
expected conventions). Each row links to its ISSUE below.

| Area | iOS behavior | Android behavior | Severity | Issue |
|------|--------------|------------------|----------|-------|
| {e.g., Shadow on card} | shadow visible | flat (no elevation) | medium | ISSUE-007 |
| {…} | | | | |

## Native crash reports

| Platform | File / timestamp | Reason |
|----------|------------------|--------|
| iOS | `~/Library/Logs/DiagnosticReports/{name}.ips` | {exception type or signal} |
| Android | logcat `{timestamp}` | `FATAL EXCEPTION: {thread}` — {exception} |

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
| Redbox | | | | |
| LogBox | | | | |
| Parity | | | | |
| Functional | | | | |
| Visual | | | | |
| Accessibility | | | | |
| State | | | | |
| Content | | | | |
| Performance | | | | |
| Crash / native | | | | |

---

## Issues

### ISSUE-001: {Short title}

| Field | Value |
|-------|-------|
| **Severity** | critical / high / medium / low |
| **Category** | redbox / logbox / parity / functional / visual / accessibility / state / content / performance / crash |
| **Platforms affected** | iOS / Android / both |
| **Screen** | {screen name or route} |
| **State** | {default / dark mode / landscape / font scale XL / offline …} |
| **JS engine affected** | Hermes / JSC / both / N/A |

**What's wrong:** {expected vs actual in one or two sentences}

**Repro (iOS):**

1. Launch from cold (via `launch_app`)
   ![iOS Step 1](screenshots/ios/issue-001-step-1.png)
2. {Action — "Tap Settings tab"}
   ![iOS Step 2](screenshots/ios/issue-001-step-2.png)
3. **Observe:** {what goes wrong}
   ![iOS Result](screenshots/ios/issue-001-result.png)

**Repro (Android):**

1. Launch from cold: `adb shell am force-stop <pkg> && adb shell monkey -p <pkg> -c android.intent.category.LAUNCHER 1`
   ![Android Step 1](screenshots/android/issue-001-step-1.png)
2. {Action}
   ![Android Step 2](screenshots/android/issue-001-step-2.png)
3. **Observe:** {what goes wrong}
   ![Android Result](screenshots/android/issue-001-result.png)

**AX / UI-hierarchy evidence** (if applicable):

```json
// iOS AX
{
  "AXRole": "AXButton",
  "AXLabel": "",
  "frame": { "x": 340, "y": 52, "width": 24, "height": 24 }
}
```

```xml
<!-- Android uiautomator -->
<node class="android.widget.Button"
      content-desc=""
      bounds="[340,52][364,76]" />
```

iOS frame 24×24 pt (< 44 HIG min); Android 24×24 dp (< 48 Material min).
Neither has an accessibility label.

**Log excerpt** (if applicable):

```
ReactNativeJS: Possible Unhandled Promise Rejection (id: 2):
TypeError: Network request failed
    at /app/api/client.js:18
```

---

(Repeat for each issue — group under `## Critical`, `## High`, `## Medium`,
`## Low` subheadings for navigability.)

---

## Coverage notes

Things intentionally **not** tested in this run (and why):

- {e.g., Release build — tested against dev build only, redbox behavior
  won't reflect release}
- {e.g., Physical device — simulators only}
- {e.g., Push notifications — requires Firebase / APNs config}
- {e.g., In-app purchases — sandbox accounts not configured}
- {e.g., Only iOS tested — no Android emulator available on this host}
- {e.g., Screen reader — VoiceOver / TalkBack require manual activation}

## Ship readiness

| Metric | Value |
|--------|-------|
| Critical issues | {N} |
| High issues | {N} |
| Redbox in dev | {N} |
| Native crashes observed | {N} |
| Platform-parity bugs | {N} |
| Missing from one platform | {N} |

**Recommendation:** {ship / hold for fixes / needs platform-specific
work / needs release-build retest}

Short justification: {one sentence — e.g., "Two redboxes in the main flow
and Android hardware back button corrupts state — must fix before
TestFlight / Internal Testing."}

## Environment tested

- **macOS**: {version}
- **Xcode**: {version — `xcodebuild -version`}
- **iOS Simulator runtime**: iOS {version}
- **Android SDK**: API {level}
- **Android emulator**: {system image}
- **Node**: {`node -v`}
- **RN CLI or Expo CLI**: {version}
- **Locale**: {e.g., en_US}

If the defect list looks different under another locale, device type, or
Android API level, that's worth a separate run.
