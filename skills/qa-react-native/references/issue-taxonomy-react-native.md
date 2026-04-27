# React Native QA Issue Taxonomy

## Severity Levels

| Severity | Definition | RN examples |
|----------|------------|-------------|
| **critical** | App crashes, data loss, or a core flow is fully blocked on any platform | Redbox in dev / white screen in release, Android hardware back button corrupts state, bridge crash when calling a native module, force-unwrap of nil on iOS native, `TypeError: undefined is not a function` in the main render path |
| **high** | Primary feature broken with no workaround on a platform, or accessibility fully unusable | Main CTA fires on iOS only, keyboard permanently covers the only input on Android, screen reader skips the primary action, form submission silently fails on one platform, `Unhandled Promise Rejection` on every session |
| **medium** | Feature works but with a noticeable problem, or fails only in a specific state | Tap target < 44pt on iOS (or < 48dp on Android) for a secondary button, Dark Mode has a single invisible label, landscape layout overlaps on Android only, font scale 1.3 truncates a secondary label, shadow renders on iOS but not Android |
| **low** | Cosmetic or polish issue that a careful user notices | 1-pixel alignment between platforms, corner radius slightly different iOS vs Android, placeholder color a touch too light on Android, animation slightly janky on one platform |

## Categories

### 1. Redbox / JS runtime error

A dev-mode full-screen red overlay (or a white screen + logcat error in
release). Every redbox is **critical** because the code that fired it is
shipping, and in release it becomes a silent crash or a broken screen.

- `TypeError: Cannot read property 'X' of undefined`
- `Invariant Violation: Element type is invalid` (component imported
  wrong)
- `Unhandled Promise Rejection`
- Network error surfaced as redbox (rather than gracefully handled)

Source of truth: the app's screen + `ReactNativeJS` tag in logs.

### 2. LogBox / warning

Yellow warnings. Less severe individually, but noisy ones indicate
underlying problems that will bite later.

- `Each child in a list should have a unique "key" prop` — high: causes
  incorrect reconciliation
- `Possible Unhandled Promise Rejection` — high: unhandled error path
- `VirtualizedList: You have a large list that is slow to update` — medium:
  perf smell
- `ViewPropTypes will be removed...` — low: deprecation
- `Non-serializable values were found in the navigation state` (React
  Navigation) — medium: breaks state persistence / deep-linking

### 3. Platform parity

The RN-specific class — differences between iOS and Android that shouldn't
exist.

- Feature present on iOS, absent on Android (or vice versa) with no
  documented reason
- Layout differs beyond legitimate platform conventions (see
  `platform-parity-checklist.md`)
- Navigation behaves differently (Android hardware back doesn't mirror
  iOS swipe back)
- Haptics on iOS but not Android, or vice versa
- Custom fonts loaded on one platform only
- Shadow / elevation mismatch — shadow shows on iOS, no elevation set on
  Android (element looks flat)

### 4. Functional

Bugs independent of state or appearance, and present on one or both
platforms.

- Tap does nothing (no navigation, no network call, no log entry)
- Wrong destination (tap on "Settings" opens Profile)
- Form validation missing or wrong
- State not preserved across backgrounding → return → field cleared
- Double-submit on rapid taps (common in RN; iOS's lack of ripple means
  users tap twice)
- Pull-to-refresh not refreshing
- Deep link doesn't route correctly

### 5. Visual

Layout and rendering bugs visible in the default state.

- Text clipped / truncated without ellipsis
- Content under notch / Dynamic Island (iOS) or display cutout (Android)
- Overlapping UI elements
- Missing assets (empty image, broken require)
- FlatList / ScrollView with extra whitespace at bottom (Android often
  needs `contentContainerStyle={{ paddingBottom: insets.bottom }}`)
- Shadow cut off by parent's `overflow: "hidden"` (iOS) — Android unaffected

### 6. Accessibility

- Interactive element with no `accessibilityLabel`
- Image with no label and no surrounding text
- `accessibilityRole` wrong (role="button" on a link, etc.)
- Decorative image not marked `accessible={false}`
- Focus trap — modal that screen reader can't escape
- Touch target smaller than visual element (common with tight
  `TouchableOpacity` wrappers)
- Font scale: text clipped at 1.3× system scale

### 7. State / environment

Bugs only visible under non-default OS states.

- Dark Mode: hardcoded white colors, invisible text, missing dark asset
- Font scale XL: truncation, buttons off-screen
- Landscape: safe area ignored, layout broken
- Offline: no offline state, stale data shown as fresh
- Backgrounding: long background drains battery (timers / intervals not
  cleaned up)
- Low memory: Android kills the JS context → cold-start shown as warm (bug
  if state was supposed to persist)

### 8. Content

- Placeholder text in production strings (`"Lorem ipsum"`, `"TODO"`)
- Localization missing — English fallback leaking, or key shown literally
- Inconsistent terminology across screens
- Wrong label on a button ("Cancel" that saves)
- Empty state says "No data" without explaining what to do

### 9. Performance

- FlatList / ScrollView jitter — visible lag while scrolling
- Long render — blank frames during navigation transition
- Excessive re-renders — LogBox warns, or devtools Profiler shows it
- Image load causes layout shift — no `width/height` + no placeholder
- Animation jank — especially without `useNativeDriver: true`
- Bundle size — note if Metro reports >5MB for a simple screen (over-
  import of libs)

### 10. Crash / native

Uncaught in the native layer — the redbox can't catch these because JS
isn't running when it happens.

- iOS: `EXC_BAD_ACCESS`, Swift force-unwrap, iOS app delegate crash
- Android: `FATAL EXCEPTION` in logcat, `NullPointerException`, ANR
  (application not responding)
- RN bridge crash: `RCTFatal` / `com.facebook.react.bridge` crash
- Native module crash: third-party libraries (camera, Bluetooth, push)
  crashing before JS sees it

Crash issues always have severity = critical.

---

## Per-surface exploration checklist

Apply to each screen on each platform during Phase 2–8:

1. **Visual scan** — screenshot; compare against platform-parity checklist
2. **AX dump** — `ui_describe_all` (iOS) / `uiautomator dump` (Android);
   scan for tap targets <44pt/<48dp, unlabeled controls, placeholder text
3. **Redbox scan** — if a red overlay appeared anywhere, that's an issue
4. **LogBox scan** — yellow warning visible? Tap for detail
5. **Every button** — tap each; confirm action + back path
6. **Every field** — empty submit / valid / invalid / long / emoji
7. **Pull + push navigation** — pull-to-refresh if present; push into
   detail; confirm back (iOS swipe + nav button, Android hardware button +
   nav button)
8. **Dark Mode** — toggle on platform; rescan
9. **Font scale XL** — toggle on platform; rescan
10. **Landscape** — rotate; rescan; restore
11. **Backgrounding** — home → wait 3s → reopen; state preserved?
12. **Log check** — tail `/tmp/qa-rn-session/<platform>.log`; any new
    errors during this screen?
13. **Android-only: hardware back** — does it do the right thing
    (navigate back / close modal / prompt to exit at root)?
