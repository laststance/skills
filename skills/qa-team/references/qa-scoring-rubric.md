# QA Scoring Rubric

Detailed scoring criteria for each QA perspective.

---

## 1. Visual Integrity (Weight: 25%)

### Triple-Criteria Gate (per screenshot)

| Criterion | Weight | Check Items |
|-----------|--------|-------------|
| **Functional** | 40% | Content matches requirements, data binding correct, conditional rendering correct |
| **State Change** | 30% | Hover/Focus/Active states change correctly, loading transitions smooth |
| **Visual Design** | 30% | Notion/YouTube/X quality standard, colors/layout/fonts natural, no corruption |

**Score**: `(Functional * 0.4) + (State * 0.3) + (Visual * 0.3)`
**PASS**: >= 95% weighted average
**Required**: All pages screenshotted, 4 responsive breakpoints (320/768/1024/1440px) for web

### Scoring Guide

| Score | Meaning |
|-------|---------|
| 95-100 | Pixel-perfect, no issues |
| 85-94 | Minor visual imperfections (spacing off by 1-2px) |
| 70-84 | Noticeable issues (misalignment, color inconsistency) |
| < 70 | Layout corruption, broken rendering |

---

## 2. Functional Correctness (Weight: 30%)

### Flow Verification + Impact Propagation

| Criterion | Threshold |
|-----------|-----------|
| Flow coverage | >= 90% of identified flows |
| Pass rate | >= 95% of tested flows |
| P0 bugs | 0 (blocking functional bugs) |
| P1 bugs | <= 3 (major non-blocking) |
| Impact plan | >= 3 impact areas per CRUD operation |
| Impact pass rate | 100% (all impact areas must pass) |

### Severity Classification

| Severity | Definition | Example |
|----------|-----------|---------|
| P0 (Critical) | App crash, data loss, security hole | Form submit crashes app |
| P1 (Major) | Feature broken but workaround exists | Filter doesn't update results (manual refresh works) |
| P2 (Minor) | Cosmetic or low-impact | Success toast appears too briefly |
| Info | Observation, not a defect | Loading takes 2s on slow connection |

---

## 3. Apple HIG Compliance (Weight: 15%)

### Per-Axis Scoring (0-100 each)

| Axis | Check Items | FAIL if |
|------|------------|---------|
| **Typography** | SF Pro usage, readable line-height, letter-spacing, type scale hierarchy | Score < 60 |
| **Tap Areas** | All interactive elements >= 44x44px, keyboard navigation, screen reader | Score < 60 |
| **Colors** | Role-based (Accent/Label/Background/Fill), WCAG 2.2 AA+ (4.5:1 normal, 3:1 large), Light/Dark support | Score < 60 |
| **Spacing** | 4/8 grid adherence, key margins at 16/20/24px | Score < 60 |
| **Motion** | Meaningful transitions only, `prefers-reduced-motion` respected | Score < 60 |
| **Corner Radius** | 4/8/12/20px hierarchy consistency | Score < 60 |

**Composite**: Average of all axes
**PASS**: Composite >= 80 AND no single axis < 60

---

## 4. Edge Cases (Weight: 15%)

### Category Coverage

| Category | Required Tests |
|----------|---------------|
| **Text Input** | Empty, single char, 1000+ chars, Unicode (CJK/emoji/RTL/zero-width), XSS payloads, whitespace-only |
| **Data Volume** | 0 records (empty state), 1 record, 100+ records, max allowed |
| **Boundary Values** | Numeric: 0, -1, MAX_SAFE_INTEGER, NaN; Date: past/future/epoch/invalid; Currency: 0.00/negative/very large |
| **Visual Overflow** | Long unbreakable strings (200-char URL), truncation with ellipsis, scroll containers |
| **State Transitions** | Rapid double-click, navigation during loading, network offline/reconnect |

### Scoring

| Criterion | Threshold |
|-----------|-----------|
| Categories tested | >= 4 of 5 |
| Crash count | 0 |
| Visual overflow (critical) | 0 content hidden without scrollbar |
| Data integrity | 100% (no data loss/corruption) |
| Min edge cases per component | 5 |

---

## 5. UX Sensibility (Weight: 15%)

### PH Visual Axis Scoring (V1-V5, 20pts each)

| Sub-axis | Check Items |
|----------|-------------|
| **V1: Layout/Spacing** | Consistent margins, aligned elements, balanced whitespace |
| **V2: Typography** | Readable hierarchy, consistent font usage, proper line-height |
| **V3: Color/Contrast** | No dark-on-dark, no light-on-light, consistent color roles |
| **V4: Animation** | Meaningful only, not jarring, proper easing |
| **V5: Consistency/Polish** | Uniform button styles, consistent icons, alignment |

### Common Sense Checklist

| Check | Critical? |
|-------|----------|
| Dark text on dark background | Yes |
| Light text on light background | Yes |
| Destructive action without confirm dialog | Yes |
| Buttons that look like labels | No (major) |
| No loading indicator for async ops | No (major) |
| No empty state message | No (minor) |
| No success/error feedback after action | No (major) |
| Inconsistent button styles in same context | No (minor) |
| Missing alt text on images | No (major) |
| Color as only status differentiator | No (major) |

**PASS**: PH Visual >= 75/100 AND 0 critical findings

---

## Final Composite Gate

| Component | Weight | PASS | CONDITIONAL | FAIL |
|-----------|--------|------|-------------|------|
| Visual Integrity | 25% | 100 pts | 70 pts | 0 pts |
| Functional | 30% | 100 pts | 70 pts | 0 pts |
| HIG Compliance | 15% | 100 pts | 70 pts | 0 pts |
| Edge Cases | 15% | 100 pts | 70 pts | 0 pts |
| UX Sensibility | 15% | 100 pts | 70 pts | 0 pts |

**Composite** = Sum of (component_score * weight)

| Composite | Verdict | Action |
|-----------|---------|--------|
| >= 85 | **PASS** | Ready for release |
| 65-84 | **CONDITIONAL PASS** | Release with known issues documented |
| < 65 | **FAIL** | Must fix before release |
