# HIG Compliance Spot Checks

The rules below are the ones worth checking in a Simulator-only QA run —
i.e., ones where a screenshot + AX tree tell you everything. Deeper HIG
topics (audio, haptics timing, app icon, privacy prompts) usually require
a device or additional tooling.

Source: Apple's [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/).

## Tap targets

- **Minimum 44×44 pt** for any interactive control — buttons, links,
  toggles, segmented controls, tab bar items, collection cells.
- The **visual** size may be smaller (a 20pt icon is fine) as long as the
  **hit area** is ≥44pt. When the AX frame is <44pt, the hit area is
  almost certainly too small.
- Exceptions that don't need 44pt: non-interactive decorations, text
  inside a larger tap target, Apple's own keyboard keys (Apple ignores
  their own rule here).

## Safe area

iPhones with Dynamic Island / notch / home indicator must not draw
content in the unsafe area unless the design is intentional (e.g. full-
screen media). Checkpoints:

- Top bar / first interactive element sits **below** the status bar +
  Dynamic Island region
- Bottom tab bar / floating action button clears the home indicator (34
  pt on most devices)
- Landscape: the sensor housing on the left edge is also unsafe —
  content that was edge-to-edge in portrait will clip under the notch
  in landscape on notched devices
- `UIScrollView` content insets adjust for the keyboard when it appears

Rendering behind the safe area is fine **if** the content is purely
decorative. Text and controls — not fine.

## Navigation

- A pushed screen shows a back button on the nav bar, labeled with the
  previous screen's title (or just an arrow)
- Swipe-from-left-edge goes back, always — no custom gesture overriding
  it unless the screen has a strong reason (camera viewfinder, game)
- Tab bar visible only on the tab's root screen; pushed screens hide it
  (unless intentionally persistent)
- Modal sheets can always be dismissed — either swipe-down on the card
  or a visible Cancel/Done button (or both)

## Alerts and confirmations

- Destructive actions (delete, sign out, discard changes) show a
  confirmation — an `Alert` or `ActionSheet` with a red destructive
  button
- Alert titles are short (under 50 characters), not full sentences with
  periods
- Alert buttons are action verbs ("Delete", "Save", "Discard") not
  generic ("OK", "Yes")

## Typography

- System font (SF Pro) unless there's a brand reason
- Dynamic Type: text uses `UIFont.preferredFont(forTextStyle:)` or the
  SwiftUI `Font` semantic styles (`.body`, `.headline`, etc.) — so it
  scales with the user's Text Size setting
- Line height and letter-spacing follow the SF defaults for the chosen
  style; custom tracking almost always makes text worse

## Color and contrast

- Text contrast meets WCAG 2.2 AA: 4.5:1 for body, 3:1 for large (>18pt
  regular or >14pt bold)
- Uses **semantic** colors (`UIColor.label`, `UIColor.systemBackground`)
  so Dark Mode + Increase Contrast automatically work — not hardcoded
  hex
- "Increase Contrast" accessibility setting: borders, separators, and
  disabled states become more distinct (nothing disappears)

## Motion

- Honors Reduce Motion: parallax effects, bounces, and large
  translations are replaced with fades
- Transitions are short (200-400 ms) unless there's a narrative reason
- No full-screen shake / flash / strobe

## Empty and error states

- Every screen that can be empty has a designed empty state (icon +
  heading + explanation + action, if applicable)
- Every screen that can error shows a useful message ("Couldn't load
  messages. Check your connection." — not "Something went wrong.")
- Error states offer a way forward: Retry, Go Back, Contact Support

---

## How this file is used by the skill

During Phase 2 (Visual scan) and Phase 5 (States), the SKILL.md prompt
tells Claude to "compare the screenshot against `hig-compliance.md`".
What that means in practice: Claude should sanity-check each screen
against the list above and raise an issue in the report for each
violation found. The issue's severity is usually medium (HIG violation)
unless the violation also breaks a functional flow (then it's high).

This file is not exhaustive — it's the subset of HIG that's checkable
from a screenshot + AX tree. For App Store submission, the full HIG site
is authoritative.
