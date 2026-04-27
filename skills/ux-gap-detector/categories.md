# UX Gap Detector -- SaaS App Categories

Scenario definitions for auditing authenticated SaaS web application interiors.
All scenarios assume the user is already logged in via playwright-cli.

---

## dashboard

**Description**: Main dashboard, overview screens, data visualization, KPI displays.

**Top-tier references**: Linear (project overview), Vercel (deployment dashboard), Stripe (payment dashboard), Notion (workspace home)

### Scenarios

#### overview_layout
Focus: First impression after login, information density, visual hierarchy

| Step | Action | Screenshot Name |
|------|--------|----------------|
| 1 | Screenshot the dashboard as-is | `dashboard-initial` |
| 2 | `browser_snapshot` to identify widget/card elements | `dashboard-snapshot` |
| 3 | Scroll down 50% of the page | `dashboard-scroll-50` |
| 4 | Scroll to bottom | `dashboard-scroll-bottom` |

Analyze: Information density, visual hierarchy, whitespace balance, card/widget consistency.

#### widget_interaction
Focus: Dashboard cards, widgets, hover states, clickable areas

| Step | Action | Screenshot Name |
|------|--------|----------------|
| 1 | Hover the first card/widget | `widget-hover-1` |
| 2 | Hover a second card/widget | `widget-hover-2` |
| 3 | Click into a card/widget for detail view | `widget-detail` |
| 4 | Navigate back to dashboard | `widget-return` |

Analyze: Hover transitions, click feedback, detail view quality, back navigation.

#### data_visualization
Focus: Charts, graphs, numbers, status indicators

| Step | Action | Screenshot Name |
|------|--------|----------------|
| 1 | Find chart/graph elements | `chart-default` |
| 2 | Hover data points on chart (if interactive) | `chart-hover` |
| 3 | Find status indicators/badges | `status-indicators` |
| 4 | Check for loading/skeleton states (refresh if possible) | `loading-state` |

Analyze: Chart readability, tooltip quality, status badge clarity, loading experience.

---

## data-management

**Description**: Data tables, list views, CRUD operations, search and filter interfaces.

**Top-tier references**: Linear (issue list), Notion (database view), Stripe (payment list), Airtable (grid view)

### Scenarios

#### table_display
Focus: Table layout, column headers, row density, sorting

| Step | Action | Screenshot Name |
|------|--------|----------------|
| 1 | Navigate to main data list/table page | `table-default` |
| 2 | Hover a table row | `table-row-hover` |
| 3 | Click a column header to sort (if available) | `table-sort` |
| 4 | Scroll the table horizontally (if wide) | `table-scroll-h` |

Analyze: Column alignment, row hover states, sort indicators, overflow handling.

#### search_and_filter
Focus: Search input, filter controls, applied filter states

| Step | Action | Screenshot Name |
|------|--------|----------------|
| 1 | Find search input | `search-default` |
| 2 | Click/focus search input | `search-focus` |
| 3 | Type a search query | `search-typing` |
| 4 | Find filter controls | `filter-controls` |
| 5 | Apply a filter | `filter-applied` |
| 6 | Clear all filters | `filter-cleared` |

Analyze: Search input focus state, autocomplete/suggestions, filter UI, clear action visibility.

#### crud_operations
Focus: Create, edit, delete flows and their feedback

| Step | Action | Screenshot Name |
|------|--------|----------------|
| 1 | Find "Create/Add/New" button | `crud-create-button` |
| 2 | Hover the create button | `crud-create-hover` |
| 3 | Click to open create form/modal (DO NOT submit) | `crud-create-form` |
| 4 | Close/cancel the create form | `crud-create-cancel` |
| 5 | Find an item's edit/action menu | `crud-item-actions` |

Analyze: Button placement, modal/drawer quality, form layout, cancel affordance.

#### empty_state
Focus: What the UI shows when there's no data

| Step | Action | Screenshot Name |
|------|--------|----------------|
| 1 | Search for a term that returns no results | `empty-search` |
| 2 | Navigate to a section with no data (if discoverable) | `empty-section` |

Analyze: Empty state messaging, helpfulness, visual quality, call-to-action.

---

## form-workflow

**Description**: Form inputs, multi-step flows, validation, submission feedback.

**Top-tier references**: Stripe (payment form), Linear (issue creation), Notion (property editing), Vercel (project setup wizard)

### Scenarios

#### input_states
Focus: Text inputs, focus states, placeholder text, labels

| Step | Action | Screenshot Name |
|------|--------|----------------|
| 1 | Find a form with text inputs | `form-default` |
| 2 | Click into first input (focus) | `input-focus` |
| 3 | Type some text | `input-filled` |
| 4 | Tab to next input (focus ring) | `input-tab-focus` |
| 5 | Find a required field and leave it empty (blur) | `input-required-blur` |

Analyze: Focus rings, label positioning, placeholder quality, required field indication.

#### complex_controls
Focus: Dropdowns, toggles, date pickers, rich editors

| Step | Action | Screenshot Name |
|------|--------|----------------|
| 1 | Find a dropdown/select element | `control-dropdown` |
| 2 | Open the dropdown | `control-dropdown-open` |
| 3 | Find a toggle/switch | `control-toggle-off` |
| 4 | Click the toggle | `control-toggle-on` |
| 5 | Find a date picker (if exists) | `control-datepicker` |

Analyze: Dropdown design, option list quality, toggle animation, picker usability.

#### validation_feedback
Focus: Error messages, success states, inline validation

| Step | Action | Screenshot Name |
|------|--------|----------------|
| 1 | Find a form with validation | `validation-form` |
| 2 | Try to submit with empty required fields (if safe) | `validation-errors` |
| 3 | Fix one error and observe inline feedback | `validation-inline` |
| 4 | Look for success/confirmation states elsewhere in app | `validation-success` |

Analyze: Error message clarity, inline vs summary validation, success feedback, loading on submit.

---

## navigation-shell

**Description**: App shell, sidebar, top-bar, breadcrumbs, command palette, mobile responsiveness.

**Top-tier references**: Linear (sidebar + command palette), Notion (sidebar + breadcrumbs), Vercel (top-bar + project switcher), Figma (toolbar)

### Scenarios

#### sidebar_navigation
Focus: Sidebar structure, active states, collapse behavior

| Step | Action | Screenshot Name |
|------|--------|----------------|
| 1 | Screenshot sidebar in default state | `sidebar-default` |
| 2 | Hover a sidebar item | `sidebar-hover` |
| 3 | Click a different section | `sidebar-active-change` |
| 4 | Find collapse/expand control (if exists) | `sidebar-collapse` |
| 5 | Check nested/expandable sections | `sidebar-nested` |

Analyze: Active item highlighting, hover transitions, section grouping, collapse UX.

#### top_bar_and_breadcrumbs
Focus: Header bar, breadcrumbs, user menu, notifications

| Step | Action | Screenshot Name |
|------|--------|----------------|
| 1 | Screenshot top bar | `topbar-default` |
| 2 | Find breadcrumbs (if exists) and hover | `breadcrumbs-hover` |
| 3 | Click user avatar/profile menu | `user-menu-open` |
| 4 | Close user menu | `user-menu-close` |
| 5 | Find notification bell/icon (if exists) | `notifications-icon` |

Analyze: Breadcrumb hierarchy, user menu design, notification indicator, top bar spacing.

#### keyboard_and_command
Focus: Keyboard shortcuts, command palette (Cmd+K), keyboard navigation

| Step | Action | Screenshot Name |
|------|--------|----------------|
| 1 | Press Cmd+K or Ctrl+K for command palette | `command-palette` |
| 2 | Type a search in command palette | `command-search` |
| 3 | Press Escape to close | `command-close` |
| 4 | Tab through main navigation elements | `keyboard-tab-nav` |

Analyze: Command palette presence, search quality, keyboard accessibility, focus management.

---

## settings-profile

**Description**: User settings, preferences, account management, team/org settings.

**Top-tier references**: Linear (settings), Stripe (account settings), Notion (settings & members), Vercel (project settings)

### Scenarios

#### settings_layout
Focus: Settings page structure, section organization, navigation

| Step | Action | Screenshot Name |
|------|--------|----------------|
| 1 | Navigate to settings page | `settings-overview` |
| 2 | Find settings navigation/tabs | `settings-nav` |
| 3 | Click into a settings section | `settings-section` |
| 4 | Scroll settings content | `settings-scroll` |

Analyze: Settings organization, section separation, navigation clarity, content density.

#### profile_editing
Focus: Profile/account editing, save feedback, avatar upload

| Step | Action | Screenshot Name |
|------|--------|----------------|
| 1 | Find profile/account section | `profile-default` |
| 2 | Click an editable field | `profile-edit-focus` |
| 3 | Look for save/cancel buttons | `profile-save-buttons` |
| 4 | Find avatar/photo upload area | `profile-avatar` |

Analyze: Edit affordances, save/discard UX, upload interaction, form layout.

#### preferences_and_toggles
Focus: Preference toggles, theme switching, notification settings

| Step | Action | Screenshot Name |
|------|--------|----------------|
| 1 | Find notification/email preferences | `prefs-notifications` |
| 2 | Find theme/appearance settings (if exists) | `prefs-theme` |
| 3 | Toggle a preference | `prefs-toggle` |
| 4 | Check for auto-save or manual save pattern | `prefs-save-pattern` |

Analyze: Toggle design, auto-save feedback, theme switching smoothness, preference grouping.

---

## playwright-cli Interaction Pattern

For all scenarios, follow this pattern:

```
1. browser_snapshot()          -> Get accessibility tree with element refs
2. browser_click(ref, element) -> Interact with specific element
3. browser_wait(1-2)           -> Wait for transitions/loading
4. browser_screenshot()        -> Capture the result
```

For hover states:
```
1. browser_snapshot()          -> Get refs
2. browser_hover(ref, element) -> Hover the element
3. browser_screenshot()        -> Capture hover state
```

For text input:
```
1. browser_snapshot()                    -> Get refs
2. browser_click(ref, element)           -> Focus the input
3. browser_type(ref, element, text)      -> Type into it
4. browser_screenshot()                  -> Capture filled state
```
