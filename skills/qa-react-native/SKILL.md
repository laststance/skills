---
name: qa-react-native
version: 0.1.0
description: React Native QA
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
  - mcp__ios-simulator__get_booted_sim_id
  - mcp__ios-simulator__open_simulator
  - mcp__ios-simulator__launch_app
  - mcp__ios-simulator__install_app
  - mcp__ios-simulator__screenshot
  - mcp__ios-simulator__record_video
  - mcp__ios-simulator__stop_recording
  - mcp__ios-simulator__ui_describe_all
  - mcp__ios-simulator__ui_describe_point
  - mcp__ios-simulator__ui_tap
  - mcp__ios-simulator__ui_type
  - mcp__ios-simulator__ui_swipe
  - mcp__ios-simulator__ui_view
---

# /qa-react-native — Systematic React Native QA (iOS + Android)

Drive a React Native app on iOS Simulator and/or Android Emulator, collect
evidence (screenshots + AX dumps + native logs + Metro logs), grade issues,
and produce a platform-aware report. Fixing is out of scope — this skill
reports. If the user wants to fix bugs, hand the report to a session that
has access to the JS/TS and native source.

## Why this exists

React Native multiplies the surfaces a QA run needs to cover:

- **Two platforms** — same codebase, different runtime. A bug can exist on
  iOS only, Android only, or both. "Platform parity" is itself a category.
- **Four layers** — JS (Hermes), the RN bridge, native iOS (Obj-C/Swift),
  native Android (Kotlin/Java). A bug might live in any of them; the
  symptom is what you see in the UI.
- **Dev vs release** — redbox and LogBox appear in dev only. A redbox you
  see today might be silent in release (bad) or the release version might
  crash where dev only warned (worse).
- **Metro** — the dev server is a third moving piece, separate from the
  app. Metro unreachable = hot reload broken, but the app may still run.
- **Expo vs bare** — launch paths diverge. Expo Go, Expo dev client, and
  bare RN each behave slightly differently.

This skill codifies the systematic path that catches the most common
classes of RN bugs across both platforms without reading the source.

## Scope and non-goals

**In scope:** Black-box testing on iOS Simulator + Android Emulator of a
running RN app (bare or Expo), driving via accessibility APIs, capturing
screenshots, parsing AX trees, reading native + JS logs, comparing
platform behavior.

**Out of scope:**
- Physical device testing (simulators/emulators only)
- JS/TS or native source reading / editing (delegate fixes elsewhere)
- Jest / Detox / Maestro test authoring — this is black-box QA, not test
  generation
- Metro config / Babel debugging — assume Metro is running and healthy
- Release-build-specific bugs that don't reproduce in dev mode (note them
  as "needs release-build retest" in coverage)
- EAS Build / App Store / Play Store submission pipeline

## Required context before starting

If any of these are unknown, use `AskUserQuestion` to collect them:

1. **App type** — Bare RN vs Expo (managed, dev client, Go). Different
   launch paths.
2. **Platforms to test** — iOS only / Android only / both. Default to
   "both" if the user doesn't say.
3. **Bundle ID / package name**:
   - iOS: `com.example.myapp` (for `launch_app`)
   - Android: `com.example.myapp` (for `adb shell am start`)
4. **Launch method**:
   - Bare RN iOS: `npx react-native run-ios` or manual Xcode build already
     installed
   - Bare RN Android: `npx react-native run-android` or `adb install`
   - Expo: `npx expo start` + open Expo Go / dev client
5. **Metro dev server URL** — usually `http://localhost:8081`. Confirm
   reachable: `curl -s http://localhost:8081/status` should return "packager-status:running".
6. **Scope** — "whole app" vs specific flow.
7. **Target devices** — which simulator + emulator. Confirm with
   `mcp__ios-simulator__get_booted_sim_id` + `adb devices`.
8. **Hermes or JSC** — determinable from Metro (`curl
   http://localhost:8081/status` shows it, or the redbox header). Just
   note in the report.

Do not guess — missing context causes the skill to test the wrong app, the
wrong platform, or skip a layer entirely.

---

## Phase 0: Boot both targets + baseline

Goal: both simulators ready, Metro reachable, app launched cold on each,
log taps running, baseline screenshots + AX captured.

### iOS side

1. `mcp__ios-simulator__get_booted_sim_id` — UDID. If none booted, ask
   the user which device + iOS version to boot.
2. Device metadata:
   ```bash
   xcrun simctl list devices booted -j | head -50
   ```
3. Start iOS log stream, filtered to RN JS errors:
   ```bash
   mkdir -p /tmp/qa-rn-session
   xcrun simctl spawn booted log stream \
     --predicate 'subsystem == "<bundle-id>" OR eventMessage CONTAINS "RCTLog" OR eventMessage CONTAINS "ReactNativeJS"' \
     --level debug > /tmp/qa-rn-session/ios.log 2>&1 &
   echo $! > /tmp/qa-rn-session/ios-log.pid
   ```
4. Launch: `mcp__ios-simulator__launch_app({ bundle_id, terminate_running: true })`.
5. Baseline:
   - Screenshot → `/tmp/qa-rn-session/00-ios-baseline.png`
   - AX → `/tmp/qa-rn-session/00-ios-ax.json` (from `ui_describe_all`)

### Android side

1. Check emulator is running: `adb devices` → expect `<serial>   device`.
   If none, ask user to start one (`emulator -avd <name>` or Android
   Studio's device manager).
2. Device metadata:
   ```bash
   adb shell getprop ro.product.model
   adb shell getprop ro.build.version.release
   adb shell wm size   # screen size
   adb shell wm density
   ```
3. Start logcat, filtered:
   ```bash
   adb logcat -c                    # clear existing
   adb logcat ReactNativeJS:* ReactNative:* *:E \
     > /tmp/qa-rn-session/android.log 2>&1 &
   echo $! > /tmp/qa-rn-session/android-log.pid
   ```
   The `ReactNativeJS` tag carries JS console output. `ReactNative` is
   the bridge. `*:E` catches any error-level log from anywhere else.
4. Launch the app:
   ```bash
   adb shell am force-stop <package-name>    # clean cold start
   adb shell monkey -p <package-name> -c android.intent.category.LAUNCHER 1
   ```
   (Or use an explicit activity:
   `adb shell am start -n <package>/.MainActivity`.)
5. Wait ~3 seconds for bundle to load. For Expo Go, longer (5–8s).
6. Baseline:
   - Screenshot: `adb exec-out screencap -p > /tmp/qa-rn-session/00-android-baseline.png`
   - UI hierarchy: `adb shell uiautomator dump /sdcard/ui.xml && adb pull /sdcard/ui.xml /tmp/qa-rn-session/00-android-ui.xml`

### Metro

Confirm Metro is alive:
```bash
curl -s http://localhost:8081/status
# expect: packager-status:running
```

If Metro is down, note it — the app may still work (bundle cached), but
redbox navigation, fast refresh, and remote debugging won't.

If either sim fails to launch, STOP that side and continue with the other
— a single-platform run is still valuable. Note the failure explicitly in
the report.

## Phase 1: Surface mapping (per platform)

For EACH platform, walk the app's top-level nav breadth-first and inventory
screens. Use the same methodology as single-platform QA:

- Tab bar (if present) → each tab's root → first-level detail screens
- Modal sheets → screenshot + AX dump before dismissing
- Drawer (Android-common pattern) → each item

Per screen, record:
- Screenshot → `NN-<platform>-<screen-slug>.png`
- AX dump → `NN-<platform>-<screen-slug>-ax.json` / `.xml`
- One-line description
- **Note where the two platforms diverge** already (different layouts,
  different affordances). These are Phase 4 issues.

Navigation-without-coordinates patterns:

**iOS**: `ui_describe_all` → find node by label → tap center:
```
node.frame.x + node.frame.width/2, node.frame.y + node.frame.height/2
```

**Android**: `uiautomator dump` returns XML with `<node bounds="[x1,y1][x2,y2]" />`
attributes. Parse the bounds, tap center:
```bash
adb shell input tap $(( (X1+X2)/2 )) $(( (Y1+Y2)/2 ))
```

Budget: 3–8 minutes (longer than single-platform because you walk each
side). If the app has >15 top-level screens per platform, ask the user
which matter most.

## Phase 2–7: Systematic exploration (per platform)

For every screen from Phase 1, run the checklist on BOTH platforms. Most
bugs fall out of this loop — the point is systematic parity.

### Phase 2 — Visual scan

- Screenshot → compare iOS vs Android for each screen (place side-by-side
  mentally): any layout differences? Any assets missing on one side?
  Colors identical?
- AX dump → find interactive nodes with frames < 44pt on iOS or < 48dp on
  Android — these are tap-target violations (HIG on iOS, Material on
  Android)
- Look for clipped text (bounds smaller than typical text for the length)
- Look for placeholder text ("Lorem ipsum", "TODO", "Untitled") in AX values

### Phase 3 — Interactive surface

Per platform, enumerate every tappable element. Tap each in turn. After
each tap:

- Screenshot
- Check for redbox (iOS: look for a red overlay covering the screen;
  Android: red screen with yellow stack trace) — **always critical**
- Check for LogBox warning (yellow bar or modal at bottom of screen)
- Log tail check — any new `ReactNativeJS` errors? Unhandled promise
  rejections?
- If the tap opens something, verify the back-path works:
  - iOS: swipe-from-left or nav bar back
  - Android: hardware back button (`adb shell input keyevent KEYCODE_BACK`)
    AND any in-app back affordance

### Phase 4 — Forms and keyboard

Every text input (`AXTextField` on iOS, `EditText` on Android):

- Tap → keyboard appears
- Type: empty submit, valid, invalid, long (1000+ chars), emoji
- **Critical**: Confirm the keyboard doesn't cover the active field.
  This is common in RN apps — visible only in the screenshot, not the
  AX tree.
  - iOS: the keyboard inflates from bottom; `KeyboardAvoidingView` is
    often misconfigured
  - Android: default `windowSoftInputMode` may be `adjustPan` (pushes up)
    or `adjustResize` (rebuilds layout) — different behaviors, both can
    hide fields
- On Android also test: hardware back button closes keyboard (expected)
  without dismissing the form

### Phase 5 — States

Force non-default conditions on each platform:

| State | iOS how | Android how | What to check |
|-------|---------|-------------|---------------|
| Dark Mode | `xcrun simctl ui booted appearance dark` | `adb shell "cmd uimode night yes"` | Color inversions, missing dark assets |
| Light Mode | `...appearance light` | `...night no` | Restore |
| Font scale / Dynamic Type | `xcrun simctl ui booted content_size extra-extra-extra-large` | `adb shell settings put system font_scale 1.3` | Text overflow, layout breaks |
| Restore font | `...content_size medium` | `adb shell settings put system font_scale 1.0` | |
| Landscape | Simulator → Device → Rotate Left (Cmd+←) | `adb shell settings put system user_rotation 1` + `adb shell content insert --uri content://settings/system --bind name:s:accelerometer_rotation --bind value:i:0` | Layout breaks; some RN apps lock portrait |
| Network off | Simulator → Features → Network Link Conditioner 100% loss | `adb shell svc wifi disable && adb shell svc data disable` | Offline states, error messages |
| Background | Cmd+Shift+H (home) → wait 3s → reopen | `adb shell input keyevent KEYCODE_HOME` → `adb shell monkey -p <pkg> 1` | State preserved? |

At minimum: **Dark Mode + Font scale XL + Landscape + Offline** on each
platform. These catch the state bugs that RN apps most commonly ship.

### Phase 6 — Platform parity (the critical RN-specific phase)

Walk the same primary flow on iOS AND Android back-to-back. Capture
matching screenshots. Compare:

- Layout — spacing, shadows (shadows on iOS ≠ shadows on Android;
  Android uses `elevation`, iOS uses `shadow*` props — often one works
  and the other is flat)
- Fonts — iOS falls back to SF, Android to Roboto unless custom loaded;
  if the app bundles a custom font, both should show it
- Haptics — iOS has fine-grained `Haptics`, Android has coarser vibrate;
  parity is hard but absence on one side when present on the other is
  usually wrong
- Animations — `useNativeDriver: true` vs `false` changes iOS vs Android
  feel significantly
- Gestures — react-native-gesture-handler gives same behavior on both
  sides IF installed correctly; without it, Android back-swipe and iOS
  edge-swipe diverge
- Back navigation — iOS relies on nav bar back + edge swipe; Android
  relies on hardware back button. An RN app that doesn't wire the
  Android back button breaks Android's fundamental navigation.
- Status bar — translucent vs opaque, color matching, safe area on
  notched iOS vs Android's display cutouts
- Modals / sheets — iOS pageSheet vs Android bottomSheet; RN defaults
  differ

Record each divergence as a separate issue, category `parity`, with
screenshots from both platforms side-by-side.

### Phase 7 — Accessibility

Per platform:

- Every interactive element has `accessibilityLabel` (or text content).
  iOS AX tree: non-empty `AXLabel`. Android XML: non-empty
  `content-desc` or `text`.
- Images: `accessibilityLabel` or `accessible={false}` for decorative.
  On Android: `contentDescription` or `importantForAccessibility="no"`.
- Focus order — Tab (iOS hardware keyboard) / directional pad (Android
  emulator) cycles through elements in reading order
- Font scale XL — did Phase 5 reveal any clipping? Cross-reference.
- Contrast — eye-check. Note in report that rigorous contrast audit
  requires dedicated tools (Xcode Accessibility Inspector, Android
  Accessibility Scanner).
- VoiceOver / TalkBack smoke test — note in coverage if skipped (they
  require the device to be activated; sim/emulator support is limited)

See `references/issue-taxonomy-react-native.md` for the full category
list.

### Phase 8 — RN-specific: redbox, LogBox, Fast Refresh

Dev-only affordances that reveal most RN bugs.

- **Redbox scan** — after every surface in Phase 3, check for a red full-
  screen overlay with a stack trace. Redbox = uncaught JS error. Every
  redbox is critical.
  - iOS: screenshot shows bright red rectangle with text; AX shows
    `AXStaticText` nodes with the error message
  - Android: similar red screen; `adb logcat ReactNativeJS` logs the
    error with stack
- **LogBox scan** — yellow warning at bottom. Tap for details, or on
  Android shake → Dev Menu → "Logs" → see all. Common entries:
  - "VirtualizedList: You have a large list that is slow to update" — perf
  - "Each child in a list should have a unique 'key' prop" — correctness
  - "Possible Unhandled Promise Rejection" — correctness; often high
  - "ViewPropTypes will be removed from React Native" — medium / code
    hygiene
- **Fast Refresh sanity check** — if Metro is running, shake device →
  "Reload". The app should return to the same logical state. If a
  subsequent interaction yields different behavior than a fresh cold
  launch, Fast Refresh is masking or creating bugs. Note in report.
- **Bundle load time** — measure rough time from launch to first
  interactive frame. Expo Go / dev client first-launch can be 10+
  seconds; release should be <2s. Note what was measured in what mode.

## Phase 9: Triage

Classify every issue:

- **severity**: critical / high / medium / low
- **category**: `redbox` / `logbox` / `parity` / `functional` / `visual`
  / `accessibility` / `state` / `content` / `performance` / `crash` /
  `native`
- **platforms affected**: iOS only / Android only / both
- **repro**: minimum steps from cold launch, per platform
- **evidence**: screenshots from each affected platform, AX snippet, log
  excerpts

De-duplicate aggressively. A shared component with a missing
`accessibilityLabel` that appears on six screens is one issue with six
affected screens, not six issues. Same goes for platform-agnostic bugs —
one issue, two platforms affected.

## Phase 10: Report

Use `templates/qa-report-template-react-native.md` as the skeleton. Fill:

- App metadata (bundle ID / package, RN version from
  `curl http://localhost:8081/status` or package.json, Expo SDK version
  if applicable, Hermes or JSC, dev mode flag)
- Platform environment (iOS: device, version; Android: device, API level,
  density)
- Health score per category
- Top 3 things to fix
- Full issue list, severity-grouped, each tagged with affected platforms

Save to `./qa-reports/rn-<date>-<app>.md`. Screenshots and dumps into
`./qa-reports/rn-<date>-<app>/` — organize into `ios/` and `android/`
subdirs.

**Don't embed full AX JSON / uiautomator XML in the report** — they're
big. Save alongside and link. Only embed the specific snippet relevant
to an issue.

## Phase 11: Session cleanup

Always, even on partial runs:

```bash
# Kill log tails
[ -f /tmp/qa-rn-session/ios-log.pid ] && kill "$(cat /tmp/qa-rn-session/ios-log.pid)" 2>/dev/null
[ -f /tmp/qa-rn-session/android-log.pid ] && kill "$(cat /tmp/qa-rn-session/android-log.pid)" 2>/dev/null

# iOS state restore
xcrun simctl status_bar booted clear 2>/dev/null
xcrun simctl ui booted appearance light 2>/dev/null
xcrun simctl ui booted content_size medium 2>/dev/null

# Android state restore
adb shell "cmd uimode night no" 2>/dev/null
adb shell settings put system font_scale 1.0 2>/dev/null
adb shell svc wifi enable 2>/dev/null
adb shell svc data enable 2>/dev/null
```

Leaving either simulator in a non-default state wastes the user's time
later.

---

## Deliverables checklist

Before telling the user "done":

- [ ] `qa-reports/rn-<date>-<app>.md` exists and opens cleanly
- [ ] At least one screenshot per issue; per affected platform if both
- [ ] Each issue has severity, category, platforms-affected, repro
- [ ] Health score table is filled
- [ ] "Top 3 Things to Fix" has actual issue titles
- [ ] Platform parity section is filled (not "N/A" unless only one
      platform was tested)
- [ ] Redbox + LogBox findings are called out in their own section
- [ ] Coverage notes mention what was skipped (one platform? release
      mode? screen reader?)
- [ ] Log tails killed, state restored on both sims

---

## Reference files

- `references/issue-taxonomy-react-native.md` — severity + category
  definitions (RN-specific categories included)
- `references/rn-driver-reference.md` — simctl + adb + uiautomator +
  Metro cheat sheet
- `references/platform-parity-checklist.md` — what should look/work
  identically on iOS and Android, and what legitimately differs
- `templates/qa-report-template-react-native.md` — fill-in report
  skeleton

Load the references on demand. When you hit a category question during
triage, read the taxonomy. When you need an `adb` recipe you don't
remember, read the driver reference.

---

## Escape hatches

- **Metro unreachable:** `curl http://localhost:8081/status` fails. App
  may still run off cached bundle, but LogBox / Fast Refresh / remote
  debugging won't. Note in coverage.
- **Expo Go refuses to load project:** version mismatch between Expo Go
  and project SDK. Ask user to run `npx expo start --tunnel` or switch
  to a dev client.
- **Android emulator offline / `adb devices` shows "offline":** try
  `adb kill-server && adb start-server`. If still offline, user needs to
  check Android Studio / emulator directly.
- **`uiautomator dump` returns "ERROR: Could not get UiAutomation":**
  some emulator images don't ship it. Fall back to `adb exec-out
  screencap -p` and pixel-based tapping, noting reduced AX coverage.
- **App white-screens on Android:** usually a JS bundle load failure.
  `adb logcat | grep -i "bundle"` for the error. If Metro is down,
  restart it. If it's an actual JS error, redbox should show in dev mode.
- **Redbox won't dismiss:** shake device (iOS: Device → Shake; Android:
  `adb shell input keyevent 82`) → Reload. If reload loops, you have a
  bug that breaks at module load — file as critical, note that no
  further testing was possible on that platform.
- **Crash on launch, native-side:**
  - iOS: `ls -lt ~/Library/Logs/DiagnosticReports/ | head -5`
  - Android: `adb logcat -d | grep -i "FATAL EXCEPTION"`
  Quote first 20 lines + the crashed thread into the report.
