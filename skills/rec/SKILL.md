---
name: rec
description: Record a web or Electron-renderer flow as an annotated video with playwright-cli, then extract frames to confirm how it actually looks. Use when the user points at a flow to capture — "record that part", "あそこの部分", "この一連の動作", "動作確認して録画して", QA-ing a screen's motion/behavior, or proving a web / Electron-renderer interaction works on video. For analyzing a clip you were handed or generic cross-surface motion verification, use the `video` skill; for native macOS chrome (menu / tray / dock / traffic-lights) use computer-use — playwright cannot see those.
---

# rec — record a renderer flow, then verify it on frames

Drive the app's renderer with **playwright-cli**, record an **annotated** video,
then **extract frames and read them**. The annotations (action callouts, chapter
cards) are the point: they make the clip self-explaining, so a vague "record that
part" becomes a video you both read the same way — no re-explaining each time.

## Read the vague ask, then just record it

The user rarely spells out a script. Map the pointing to a take:

| They say | You record |
| ------- | ---------- |
| "あそこの部分 / that part" | the route they last looked at → one focused interaction there |
| "この一連の動作 / this sequence" | the multi-step flow just discussed → one continuous take, a chapter per step |
| "動作確認して録画 / verify + record" | run the interaction AND judge it from the frames — don't stop at "file produced" |

Don't interview them for a storyboard — pick the obvious flow, shoot it, show frames,
correct on the next take. Decide and record.

## 0. Server + auth (once)

Start the project's dev server first — **the port is project-specific** (check the
project's `package.json` dev/start script or CLAUDE.md; don't assume a number).
Free it per the global rule, then point playwright-cli at that `localhost:<port>`.

```bash
kill-port <port>    # global rule: free the dev port first (substitute the real port)
pnpm dev            # whatever command starts this project's dev server
```

- **Dev** (`localhost:<port>`): reuse a seeded/test login via `playwright-cli
  state-load` — e.g. the `storageState` JSON an E2E `web` project already saves
  (commonly `e2e/.auth/user.json`), or the driver's `storageState:` (see Fallback).
  Never mock auth/DB.
- **Prod** (your deployed URL): load the real Chrome session with the **`cookie`**
  skill into a `--persistent` playwright-cli session, then navigate.

## 1. Default tier — quick annotated take

For "record that real quick". `video-show-actions` labels each click/type as it
fires; `video-chapter` drops a titled card between steps.

```bash
playwright-cli open
playwright-cli state-load ./e2e/.auth/user.json    # your project's saved storageState
playwright-cli goto http://localhost:<port>/home   # <port> = this project's dev port
playwright-cli video-start /tmp/rec/flow.webm --size=1280x800
playwright-cli video-show-actions --duration=600 --position=top-right
playwright-cli snapshot                         # get refs (e3, e4, …)
playwright-cli video-chapter "Complete a todo" --duration=1200
playwright-cli click e7                          # drive the exact interaction
playwright-cli video-stop                        # REQUIRED — flushes the .webm
playwright-cli close
```

Gotchas (verified on playwright-cli 0.1.14):
- `file:` URLs are **blocked** — record against the running server (or a `data:`
  URL for a throwaway page), never `file://`.
- The `.webm` exists only after `video-stop`.
- Target elements by snapshot ref (`e7`) or a Playwright locator
  (`"getByRole('button', { name: 'Complete' })"`).

## 2. Polish tier — annotated hero script

For a clip meant to *show* (chapters, sticky callouts, element highlights), drive
it with one `run-code` script using `page.screencast` (`start` / `showChapter` /
`showOverlay` / `highlight` all confirmed present in 0.1.14). Overlays are
`pointer-events: none`, so they never block the clicks underneath. Pace it for a
human to watch: `pressSequentially(text, { delay: ~110 })`, a `waitForTimeout`
after each step, and a chapter card (≈2.5s) between steps.

```bash
playwright-cli run-code --filename=/tmp/rec/hero.js
```

```js
// /tmp/rec/hero.js
async page => {
  await page.screencast.start({ path: '/tmp/rec/hero.webm', size: { width: 1280, height: 800 } })
  await page.screencast.showChapter('Complete a todo', { description: 'Tap the check', duration: 1500 })
  await page.getByRole('button', { name: 'Complete' }).click()
  await page.waitForTimeout(1200)                // let the motion fully play
  await page.screencast.stop()
}
```

Full overlay / highlight API: the `playwright-cli` skill →
`references/video-recording.md`.

## 3. Verify on frames (never skip)

A screenshot proves a final state; `getComputedStyle` proves wiring. Only frames
show jank, easing, flashes, layout shift. **Reading the frames IS the QA** — the
global Testing rule, not an optional extra.

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=r_frame_rate,width,height -show_entries format=duration \
  -of default=noprint_wrappers=1 /tmp/rec/flow.webm
ffmpeg -loglevel error -i /tmp/rec/flow.webm -vf fps=6 /tmp/rec/frame_%03d.png
# then Read the frames around the transition — start / mid / end — and judge.
```

Long clip? `-vf "fps=5,scale=320:-1,tile=4x3"` for a contact sheet. Deeper ffmpeg
recipes: the `video` skill → `references/ffmpeg-recipes.md`.

## Fallback — headless driver script

When you want it scripted / headless, or the login won't restore from `state-load`,
write a tiny driver **inside the repo** (node resolves `@playwright/test` from the
script's own folder — a copy in `/tmp` throws `ERR_MODULE_NOT_FOUND`):

```js
// <project>/record.mjs — run: node record.mjs
import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const context = await browser.newContext({
  recordVideo: { dir: '/tmp/rec', size: { width: 1280, height: 800 } },
  storageState: 'e2e/.auth/user.json',           // your saved auth state (as an E2E web project saves)
})
const page = await context.newPage()
await page.goto('http://localhost:<port>/home')  // this project's dev port
await page.getByRole('button', { name: 'Complete' }).click()
await page.waitForTimeout(1200)
await context.close()                             // flushes the .webm
await browser.close()
```

No action callouts here — that absence is why the playwright-cli tiers are the default.

## Scope

Renderer / web content only (an Electron renderer typically loads the same web app).
**Native macOS chrome** — menu bar, tray, dock, traffic-lights, vibrancy, window
transitions — is invisible to playwright; record those with computer-use + screen
recording (see the `video` skill, capturing §2).
