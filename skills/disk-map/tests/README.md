# disk-map tests

All tests use disposable fixtures under `$TMPDIR` with a synthetic home and Trash. None touch real caches, browser profiles, conversations or the real Trash. Read-only probes (`git check-ignore`, and in browser/perf runs `ps`/`lsof`) run for real; package-manager CLIs are fixture adapters in unit tests.

```bash
# Unit + integration (node:test)
node --test skills/disk-map/tests/*.test.mjs

# Browser journeys E1–E8 with video (needs a playwright-core module and its Chromium)
DISK_MAP_PLAYWRIGHT=/abs/path/playwright-core/index.mjs node skills/disk-map/tests/browser/journeys.mjs /abs/out-dir

# Runtime bounds (I12): 100,050 entries / 5,000 folders
DISK_MAP_PLAYWRIGHT=/abs/path/playwright-core/index.mjs node skills/disk-map/tests/perf.mjs
```

Each test carries a card comment: `protects | fails_when | no_claim`.

| ID | File | Test |
|---|---|---|
| U1 | scanner.test.mjs | two hard links to one file count its allocation once |
| U2 | scanner.test.mjs | a symbolic link to a large outside folder is recorded as a boundary, not scanned |
| U3 | policy.test.mjs | a folder with credentials inside stays protected even when the agent calls it safe; credentials, broad folders, repository roots and app bundles are never action targets |
| U4 | policy.test.mjs | a .next folder is not preselected until the agent supplies local and documentation evidence; a build folder whose project has an open working directory is downgraded to review |
| U5 | policy.test.mjs | an item the user unchecked stays unchecked after the agent reassesses it as safe; downgrading a selected safe item unchecks it and invalidates the pending plan |
| U6 | policy.test.mjs | selecting a folder inside an already selected folder is rejected |
| U7 | cleanup.test.mjs | confirmation rejects a wrong hash, nonce, session, revision or an expired plan |
| U8 | cleanup.test.mjs | replaying a used confirmation performs no second operation |
| U9 | bridge.test.mjs | the agent credential cannot use viewer endpoints and the viewer cannot submit assessments |
| U10 | recipes-report.test.mjs | a cache path containing shell syntax stays a single argv element; unknown assessment fields such as `argv` are rejected (bridge.test.mjs) |
| U11 | recipes-report.test.mjs | file names with HTML or formula prefixes are escaped in the CSV and the snapshot |
| U12 | cleanup.test.mjs | space metrics keep Trash moves, estimates, tool receipts and the volume delta separate |
| I1 | scanner.test.mjs | scanning leaves every file, time and mode in the fixture unchanged |
| I2 | scanner.test.mjs | a denied folder makes its ancestors incomplete; cancelling a scan leaves every folder incomplete |
| I3 | bridge.test.mjs | a viewer question reaches the agent with its candidate path and the reply appears in the same session |
| I4 | bridge.test.mjs | an expired lease redelivers the same message ID and a repeated answer is ignored |
| I5 | cleanup.test.mjs | a folder replaced after planning is skipped and the replacement survives |
| I6 | cleanup.test.mjs | a credential file added inside a planned folder stops its removal |
| I7 | cleanup.test.mjs | a trashed recording restores to its original place, and an occupied place is preserved |
| I8 | cleanup.test.mjs | a cross-device rename error and an unwritable Trash both leave the item in place |
| I9 | cleanup.test.mjs | an intent without an outcome is closed as interrupted and the target is untouched |
| I10 | bridge.test.mjs | wrong Host, foreign or null Origin, reused bootstrap token and missing credentials are rejected; unknown fields, non-JSON and oversized bodies are rejected |
| I11 | cleanup.test.mjs | an npm cache cleaned by the tool is reported as observed-missing, not a direct deletion |
| I12 | perf.mjs | peak RSS < 512 MiB, first progress < 2 s, ≤ 300 tiles, keyboard drawer < 200 ms |
| E1–E8 | browser/journeys.mjs | drill-down, checkbox totals, review dialog, manifest = execution, chat + disconnect, keyboard/mobile/reduced motion, inert export, results + restore |
| H1–H6 | ../references/host-compatibility.md | live host round trips (only Claude Code verified so far) |

Extra cases: 14 (odd names, sparse files, empty folders), metadata digest change, CSP headers, recipe leaf verification, CLI receipt parsing, disconnected agent refuses plans, review items need a decision.
