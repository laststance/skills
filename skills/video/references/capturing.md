# Capturing video per surface

Three capture surfaces, no overlap. Pick by **what is actually moving on
screen**. After capture, run the Core recipe (ffprobe → ffmpeg frames → read).

## 1. Web / Electron renderer — Playwright `recordVideo`

For anything in the DOM / web content (the Electron renderer loads the same web
app, so it's the same path).

**Do NOT use `pnpm e2e:web` locally to record.** The Playwright `webServer` will
not boot on this Mac — localhost IPv6/loopback mismatch; the server itself is
healthy but Playwright's managed launch hangs (MEMORY
`local-web-e2e-webserver-localhost-blocker`). Web E2E *with* its webServer is a
CI-only path here.

Instead: start the dev server yourself, then drive it with a standalone script.

```bash
# Terminal: start the server (kill-port first per global rule)
pnpm dev    # http://localhost:3011
```

Save the script **inside the project** (e.g. `corelive/record.mjs`) and run it
from there. Node resolves `@playwright/test` relative to the script's own
directory, so a copy in `/tmp` fails with `ERR_MODULE_NOT_FOUND` even though the
package is installed in the project.

```ts
// corelive/record.mjs — `node record.mjs` from the project root
import { chromium } from '@playwright/test'        // project's declared Playwright dep

const browser = await chromium.launch()           // headless is fine; video still records
const context = await browser.newContext({
  recordVideo: { dir: '/tmp/vid', size: { width: 1280, height: 800 } },
  storageState: 'e2e/.auth/user.json',            // reuse the seeded Clerk login
})
const page = await context.newPage()
await page.goto('http://localhost:3011/home')

// --- drive the exact interaction that triggers the motion ---
await page.getByRole('button', { name: 'Toggle theme' }).click()
await page.waitForTimeout(1500)                    // let the transition fully play

await context.close()                              // REQUIRED — flushes the .webm
await browser.close()
```

- The `.webm` filename is random; `ls /tmp/vid` to find it.
- One video per page. The file appears only after `context.close()`.
- Auth uses the **real** Clerk dev instance — sign in or reuse
  `e2e/.auth/user.json`. Never mock auth/DB (global rule).
- Within an existing Playwright test, set `use: { video: 'on' }` in the config /
  test options instead of a driver script — but the standalone driver avoids the
  broken `webServer` entirely, which is why it's the local default.

### Electron renderer note

`mcp__electron__*` and the Electron E2E suite drive the **renderer only** — same
DOM paths as web, so renderer motion records the same way. Native Cocoa chrome
(menu/tray/dock/traffic-lights/vibrancy) is invisible to them → use computer-use
(below).

## 2. Native macOS chrome — computer-use + screen recording

The only way to capture menu bar, system tray, dock, traffic-light window
controls, vibrancy, and multi-window flows (main ↔ floating ↔ braindump, startup
pill). Playwright/`mcp__electron__*` cannot see these.

Build and launch the **packaged** app first (packaged-only bugs reproduce only
here, never in `electron:dev`):

```bash
pnpm electron:build:dir && open dist/mac/CoreLive.app
```

Then:

1. `mcp__computer-use__request_access` for **CoreLive** (full tier — native app).
2. Start a screen recording of the region/window. Options:
   - **`screencapture -v`** (built-in, scriptable):
     ```bash
     # Records the whole screen until the process is killed
     screencapture -v /tmp/native.mov &
     # ...drive the UI via mcp__computer-use__* (click menu bar, tray, dock)...
     kill %1            # stop -> flushes /tmp/native.mov
     ```
     (For a specific window, `screencapture -v -R x,y,w,h` to a region.)
   - **QuickTime / Screen Studio** for a guided window capture if scripting is
     awkward.
3. Drive the native surfaces with `mcp__computer-use__*` (screenshot to see,
   then click/key the menu bar, tray menu, dock icon, traffic lights).
4. Stop the recording, then run the Core recipe on the `.mov`.

> This is the "manual macOS smoke" the project asks for before tag pushes / after
> touching Electron main-process or native-integration code.

## 3. iOS simulator — built-in record/stop

For an app running in the iOS simulator, use the dedicated MCP — no ffmpeg
needed to capture (only to extract frames after).

```
mcp__ios-simulator__record_video    # start; returns a path / handle
# ...drive the app: ui_tap / ui_swipe / ui_type / launch_app...
mcp__ios-simulator__stop_recording  # stop -> writes the .mp4
```

Then ffprobe + extract frames from the `.mp4` exactly as for any clip.

## What each surface can and cannot see

| Surface | Sees | Blind to |
| ------- | ---- | -------- |
| Playwright renderer | DOM, CSS transitions, web-content motion | OS window chrome, menu/tray/dock |
| computer-use (macOS) | Entire desktop incl. native chrome, window transitions | nothing — but slower, pixel-level |
| ios-simulator | The simulated app's UI | host-OS chrome |

Reach for the **lowest-overhead surface that can see the motion**: renderer if
it's in the DOM, computer-use only when the motion lives outside the web content.
