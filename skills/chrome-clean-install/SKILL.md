---
name: chrome-clean-install
description: Refresh Chromium-based browsers by backing up profile/cache data, guiding a clean reinstall, and restoring bookmarks only. Use when Chrome, Chrome Canary, Edge, Brave, Arc, Dia, or another Chromium browser has browser-specific corruption, black screens, Meet/video issues, bad flags, GPU/WebGL cache problems, or profile-state bugs.
---

# Chrome Clean Install

## Purpose

Use this skill to perform a clean-install-style refresh for Chromium-based browsers without losing the old profile. The workflow moves profile/cache data to a timestamped backup, lets the browser regenerate clean state, and restores bookmarks only when requested.

Default browser: `Chrome`. If the prompt includes a browser name, use that name.

## When To Use

- Browser-specific video, WebGL, GPU, black-screen, Google Meet, tab, extension, or flag issues.
- Same account/site works in another browser, so network/account is unlikely.
- User wants a clean install, profile refresh, or “only bookmarks back” recovery.

## Core Workflow

1. Normalize the browser name. If omitted, use `Chrome`.
2. Load `references/browser-paths.md` for known macOS paths.
3. Run a dry run before changing files:
   ```bash
   node scripts/chromium-clean-install.mjs backup --browser "Chrome" --dry-run
   ```
4. Run backup when paths look correct:
   ```bash
   node scripts/chromium-clean-install.mjs backup --browser "Chrome"
   ```
5. Tell the user to reinstall or relaunch the browser, then test the issue before Sync/extensions/flags return.
6. If bookmarks should return:
   ```bash
   node scripts/chromium-clean-install.mjs restore-bookmarks --browser "Chrome" --from-backup "/path/to/backup"
   ```

## Safety Rules

- Move data into a backup folder; do not delete profile/cache data.
- Quit the browser before moving or restoring files.
- Restore only `Bookmarks` and `Bookmarks.bak` unless the user explicitly asks for more.
- If the browser is unknown, require explicit `--support-dir` and optional `--cache-dir`.
- If the user has not launched the reinstalled browser yet, ask them to launch once so the destination profile exists.

## References

- Known browser paths: `references/browser-paths.md`
- Detailed procedure and recovery notes: `references/workflow.md`
- Helper script: `scripts/chromium-clean-install.mjs`
