# RN Platform Parity Checklist

What should look and work identically on iOS and Android (and what
legitimately differs). Used during Phase 6 (platform parity) to decide
whether an observed divergence is a bug or expected behavior.

## What should NOT differ (divergence = bug)

### Feature set

- Same features present on both platforms
- Same flows accessible from the same places
- Same fields on forms, same validation
- Same data shown (once network responses land)
- Same strings / translations — if a localized string is in ja on iOS,
  it's in ja on Android too

### Content

- Image assets load on both platforms
- Custom fonts load on both — if you bundled `Inter.ttf`, it should be
  visible on both, not fallback to SF on iOS and Roboto on Android
- Colors render the same — `#FF0000` is the same red (modulo display
  gamma)
- SVGs render identically (via `react-native-svg`)

### Core interactions

- Tap targets respond on both — if a button works on iOS, it should
  work on Android
- Forms submit the same way with the same validation
- Pull-to-refresh triggers the same refetch
- Deep links route to the same screen

### Accessibility labels

- Every interactive element has a label on both platforms — iOS's
  `AXLabel` should match Android's `content-desc`

### Business logic

- Same calculation results — $1 in the iOS cart equals $1 in Android
- Same sign-in / sign-out flow
- Same offline behavior (both show the same error, or both queue the
  request)

## What SHOULD differ (platform conventions)

These are not bugs — they're the platforms behaving correctly.

### Back navigation

- **iOS**: swipe-from-left-edge and nav bar back button. No hardware back.
- **Android**: hardware / system back button (bottom nav), plus nav bar
  back if present. Swipe-back only works with `react-native-screens`'s
  gesture handler + opt-in.

An RN app must wire both. Not wiring Android back = critical bug.

### Status bar

- **iOS**: occupies the top, has notch / Dynamic Island on newer devices
- **Android**: similar, with display cutouts varying by device

Use `SafeAreaView` + `expo-status-bar` (or equivalent) — and test both
light/dark backgrounds.

### Tab bar

- **iOS**: bottom tab bar is the standard (also "tab bar" in HIG)
- **Android**: bottom nav bar is also standard now (Material 3); older
  Android used top tabs

Both are acceptable — but be consistent about which style you're using
on each platform.

### Modals

- **iOS**: `pageSheet` (swipe down to dismiss) or `fullScreenModal`
- **Android**: `BottomSheet`, full-screen, or overlay — Material 3
  bottom sheet is common

RN's `Modal` component handles this abstractly, but custom sheets may
need platform-specific styling.

### Keyboard behavior

- **iOS**: `KeyboardAvoidingView` with `behavior="padding"` is typical
- **Android**: `behavior="height"` or rely on `windowSoftInputMode` in
  `AndroidManifest.xml`

Both platforms should avoid covering the active field, but the
implementation differs.

### Shadows / elevation

- **iOS**: `shadowColor`, `shadowOffset`, `shadowOpacity`, `shadowRadius`
- **Android**: `elevation` (single prop, renders Material shadow)

A component that sets `shadow*` but no `elevation` looks like it has
shadow on iOS and is flat on Android. **That's a bug** even though the
implementations differ.

### Ripple vs opacity

- **iOS**: `TouchableOpacity` fades the element on press
- **Android**: `TouchableNativeFeedback` renders a ripple (Material)

`Pressable` abstracts both but the visuals still differ — expected.

### Haptics

- **iOS**: `Haptics.impactAsync(ImpactFeedbackStyle.Medium)` etc. —
  fine-grained
- **Android**: `Vibration.vibrate(50)` — coarser, some devices lack the
  hardware for fine haptics

Presence on one but absence on the other is worth noting, though —
common to forget the Android side after adding iOS haptics.

### System fonts

- **iOS**: SF Pro (Text/Display) — semantic sizes map via `fontWeight`
- **Android**: Roboto

If the app bundles a custom font, both should use it. If the app relies
on system font, both platforms will look slightly different — that's
expected.

### Tap target minimum

- **iOS HIG**: 44×44pt
- **Android Material**: 48×48dp

For an RN app, 48×48 covers both. If a button is 44pt on iOS it's
compliant, but make sure Android shows ≥48dp for the same element.

## The "suspicious divergence" sniff test

When you see a difference between platforms, ask:

1. **Is this a platform convention?** (status bar, back navigation,
   ripple) → expected, not a bug
2. **Is this a system-font difference?** (SF vs Roboto with no custom
   font bundled) → expected
3. **Is this something the app author clearly controlled?** (spacing,
   colors, feature presence, labels, haptics, shadows, localization) →
   probably a bug, file it
4. **Is the platform that has the "worse" behavior documented to do so?**
   (e.g., Android doesn't support blurred backgrounds as well without
   `@react-native-community/blur`) → note as platform-limitation, not
   necessarily bug

When in doubt, file it as a medium-severity parity issue with screenshots
from both sides. The app author can close it as "by design" fast if it
is, or fix it if it isn't.

---

## How this file is used by the skill

During Phase 6 (platform parity), the SKILL.md tells Claude to compare
each screen against this file. For each observed divergence, decide:

- Expected (per conventions) → don't file
- Bug → file as category `parity`, severity per impact

If unsure, file as medium with the screenshot pair. The issue list is
better with one false-positive than with a missed real bug.
