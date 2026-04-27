# iOS QA Issue Taxonomy

## Severity Levels

| Severity | Definition | iOS examples |
|----------|------------|--------------|
| **critical** | App crashes, data loss, or a core flow is completely blocked | Launch crash, sign-in loop with no escape, tap that dismisses unsaved work without warning, payment submission fires twice |
| **high** | Primary feature broken with no workaround, or an accessibility feature is completely unusable | Main CTA tap does nothing, form submit silently fails, VoiceOver skips over the primary action, keyboard covers the only input field on a screen |
| **medium** | Feature works but with a noticeable problem, or fails only in a specific state | Tap target below 44pt on a non-critical button, Dark Mode has invisible text on one screen, landscape layout overlaps, Dynamic Type XXL truncates a label |
| **low** | Cosmetic or polish issue that a careful user notices | 1pt alignment off, inconsistent corner radius, animation is slightly janky, placeholder color too light but still legible |

## Categories

### 1. HIG compliance

Violations of Apple's [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/).
These are **behavioral defaults Apple enforces in App Review**.

- Tap targets < 44×44 pt on interactive controls
- Custom back-button that doesn't respect the swipe-from-left-edge gesture
- Non-standard alerts (rolled their own instead of `UIAlertController`)
- Modal sheets without a dismiss affordance (no close button AND no
  swipe-down support)
- Tab bar with fewer than 2 or more than 5 tabs
- Navigation bar missing a title OR a back button on a pushed screen
- Destructive action in a non-red style or without confirmation
- Share / export not using `UIActivityViewController`

### 2. Functional

Bugs that are independent of state or appearance.

- Tap does nothing (no navigation, no log entry)
- Wrong destination (tapping "Settings" opens Profile)
- Form validation missing or wrong (accepts obviously bad input;
  rejects obviously good input)
- State not preserved across backgrounding (`applicationWillResignActive`
  → return → field cleared, scroll position lost)
- Double-submit on rapid taps
- Pull-to-refresh not refreshing, or refreshing without user action

### 3. Visual

Layout and rendering bugs visible at default state (Light Mode, default
Dynamic Type, portrait).

- Text clipped or truncated without ellipsis
- Content under the Dynamic Island / notch / home indicator (safe area
  misuse)
- Overlapping UI elements
- Assets missing (empty image frame, broken SF Symbol)
- Inconsistent corner radius or elevation across similar components
- Images pixelated (wrong @2x/@3x variant, or a scaled-up @1x)

### 4. Accessibility

- Interactive element with no `accessibilityLabel` (VoiceOver says
  "button" with no context)
- Image with no `accessibilityLabel` and no surrounding label
- Decorative image not marked `isAccessibilityElement = false` (VoiceOver
  stops on nothing)
- Missing accessibility traits (button that's actually a link, adjustable
  that's actually a slider)
- Focus trap (VoiceOver enters a modal with no way out)
- Color contrast below WCAG 2.2 AA on text
- Hit-test area smaller than the visual element (user can see the button
  but can't tap its edges)

### 5. State / environment

Bugs only visible under non-default OS states.

- Dark Mode: invisible text, wrong-tinted SF Symbols, hardcoded light
  colors, missing dark asset variants
- Dynamic Type XL → XXXL: text clipped, layout broken, buttons unreachable
- Landscape: safe area ignored, layout broken, rotation locked when it
  shouldn't be
- Low Power Mode: animations still running at full rate (they should
  reduce), background fetches still happening
- Reduce Motion: parallax and bounce effects still firing (should honor
  `UIAccessibility.isReduceMotionEnabled`)
- Increase Contrast: thin borders disappear, disabled state
  indistinguishable from enabled
- Offline: no offline state, stale data shown as fresh, retry buttons do
  nothing

### 6. Content

- Placeholder text left in production strings ("Lorem ipsum", "TODO",
  "Test 123")
- Localized string missing (English fallback leaking into a non-English
  locale, or `some.key.name` showing literally)
- Typos, grammar errors, inconsistent terminology ("Log out" vs "Sign
  out" in the same app)
- Wrong label on a button ("Cancel" that actually saves)
- Empty state that says "No data" without explaining what to do

### 7. Crash / runtime error

- `EXC_BAD_ACCESS` / `SIGABRT` — thread stack goes in the issue
- Swift force-unwrap of nil (`Fatal error: Unexpectedly found nil`)
- Index out of range
- Memory warning → screen goes blank
- Background task killed without `beginBackgroundTask` handling

Crash issues **always** have severity = critical regardless of how hard
they are to trigger.

---

## Per-screen exploration checklist

Apply to each screen visited during Phase 2–6:

1. **Visual scan** — screenshot; compare against HIG (safe area, spacing,
   target sizes)
2. **AX dump** — `ui_describe_all`; scan for tap targets < 44pt,
   unlabeled controls, placeholder text
3. **Every button** — tap each tappable node in turn; confirm action,
   confirm back path works
4. **Every field** — empty submit, valid input, invalid input, really
   long input, emoji input
5. **Pull + push navigation** — pull-to-refresh if present; push into
   detail; confirm back gesture works
6. **Dark Mode toggle** — `xcrun simctl ui booted appearance dark` — rescan
7. **Dynamic Type XXL** — `xcrun simctl ui booted content_size extra-extra-extra-large`
   — rescan; restore to `medium`
8. **Landscape rotate** — Cmd+← — rescan; restore with Cmd+→
9. **Backgrounding** — Cmd+Shift+H (home), wait 3s, reopen from Springboard —
   state preserved?
10. **Log check** — tail `/tmp/qa-ios-session/log.txt`; any new errors
    during this screen?
