# Signal Catalog

Use this guide to turn scanner output into an evidence-backed audit. Prefer a few high-confidence findings over a long TODO dump.

## Strong Findings

### Visible stub

Report when user-facing UI, commands, routes, or CLI flags are wired to code that only logs, returns a placeholder, throws `not implemented`, or does nothing.

Checklist:
- Is there a visible label, menu item, route, setting, command, or exported API?
- Does selecting it fail silently, warn, or do nothing?
- Is there no nearby feature flag or explicit "coming soon" state?

### No-op callback

Report when a component or service documents a behavior, calls a callback, but the provided callback is empty or TODO-only.

Checklist:
- Is the callback invoked after a user action?
- Does the prop documentation promise behavior?
- Does the implementation pass `() => {}` or a TODO block?

### Skipped behavioral test

Report when a skipped test covers real behavior rather than an environment limitation.

Higher severity examples:
- Auth, permissions, secret handling, data persistence, payments, destructive actions.
- Tests that skip after detecting the behavior failed.

Lower severity examples:
- Visual-only flake with replacement unit coverage.
- Browser or platform limitation clearly documented with an alternative test.

### Stale TODO

Report as stale when a TODO is contradicted by later code, migrations, or docs. This is usually documentation cleanup, not a bug.

Checklist:
- Search for later files that reverse or complete the TODO.
- Check issue tracker status before calling it active.
- Avoid editing applied migrations unless the project already permits it.

### Placeholder that ships

Report when placeholder assets, copy, screenshots, or sample text can appear in production, docs, package output, or public marketing surfaces.

Usually ignore placeholders in tests, stories, skeleton components, and form input examples.

## Weak or Usually Benign

- `placeholder=` attributes in inputs.
- Test data named `Todo`, `WIP`, or `example`.
- Comments explaining temporary files in scripts.
- Historical comments inside generated files, lockfiles, vendored files, and `.git/hooks` samples.
- TODOs in documentation that are already linked to open issues and marked as backlog.

## Severity

- `High`: user-visible broken command, security-sensitive stale state, skipped test hiding auth/data-loss failure.
- `Medium`: reachable no-op, persistence validation gap, misleading docs likely to cause future mistakes.
- `Low`: stale TODO, minor cleanup, low-risk placeholder, test-only debt.
