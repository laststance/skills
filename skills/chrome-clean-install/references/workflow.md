# Workflow

## Clean Refresh

1. Identify browser; default to `Chrome`.
2. Run `backup --dry-run` and verify app/user data/cache paths.
3. Run `backup`. The script:
   - quits the app with AppleScript,
   - kills the browser process if it is still running,
   - moves user data/cache dirs into a timestamped backup,
   - writes `manifest.json`.
4. Reinstall the app if requested, or relaunch it to regenerate a clean profile.
5. Test the original issue before enabling Sync, installing extensions, or changing flags.
6. Restore bookmarks only after the clean profile is created.

## Restore Bookmarks Only

Run:

```bash
node scripts/chromium-clean-install.mjs restore-bookmarks \
  --browser "Chrome Canary" \
  --from-backup "$HOME/Desktop/google-chrome-canary-clean-backup-YYYYMMDD-HHMMSS"
```

The script copies `Bookmarks` and `Bookmarks.bak` from the backup profile into the current profile. It first backs up any current destination bookmark files to Desktop.

## Profiles

Default profile is `Default`. If the user used a different profile, pass:

```bash
--profile "Profile 1"
```

If unsure, inspect folders under the old user data dir in the backup and look for `Bookmarks`.

## Interpreting Results

- Issue fixed before Sync/extensions: old profile/cache/flags/extension state likely caused it.
- Issue returns after Sync: synced settings/extensions may be reintroducing the problem.
- Issue persists on a clean profile: app binary, OS graphics stack, browser channel bug, or site/browser compatibility remains likely.

## Recovery

Do not delete backups until the user confirms the browser works for several days. To undo the refresh manually, quit the browser, move the regenerated user data/cache dirs aside, and move the backup dirs back to their original locations.
