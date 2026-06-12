---
name: video
description: Inspect video frame-by-frame and capture-then-verify UI motion. Extract frames from any clip (handed to you, screen-recorded, or self-captured) with ffmpeg and read them as images; record an interaction (Playwright / computer-use / iOS simulator) and verify animations, transitions, and motion that static screenshots and getComputedStyle cannot reveal. Use when verifying animations/transitions/motion, analyzing a video or .webm/.mp4, extracting frames, checking how something "looks" in motion, or recording a UI flow to inspect.
---

# Video: frame inspection & motion verification

Two jobs. Both end in **reading PNG frames as images** — the only way to judge
how motion actually looks (jank, easing, flashes, layout shift, banding). A
screenshot proves a final state; `getComputedStyle` proves the mechanism is
*wired*. Neither shows what an animation *looks like*. Frames do.

1. **Analyze any video** — a clip the user hands you, a screen recording, an
   observed capture. Extract frames, inspect. No self-capture needed.
2. **Capture → extract → verify loop** — drive a UI interaction, record video,
   extract frames, look. This is the global Testing rule: *verify
   animations/transitions/motion by recording video, not by static checks.*

## When to use

- "Why does this transition feel janky / flash / stutter?"
- "Verify the [crossfade / slide / fade / spinner / stagger] looks right."
- Reviewing motion after touching animation, CSS transitions, or page changes.
- You have a `.webm` / `.mp4` / `.mov` and need to see specific moments.
- Any time you'd otherwise "verify" motion with a screenshot or computed style.

`ffmpeg` + `ffprobe` are required (preinstalled here; `brew install ffmpeg`).

## Core recipe (memorize this)

```bash
# 1. Inspect first — fps, duration, frame count (don't extract blind)
ffprobe -v error -count_frames \
  -select_streams v:0 \
  -show_entries stream=r_frame_rate,nb_read_frames,width,height \
  -show_entries format=duration -of default=noprint_wrappers=1 clip.webm

# 2. Extract every frame to PNGs (zero-padded so they sort)
ffmpeg -i clip.webm frame_%04d.png

# 3. Read the frames as images and judge the motion
#    (Read tool on frame_0001.png, frame_0015.png, ... — actually look)
```

Then **read the frames** — open the ones around the moment of interest (start,
mid-transition, end) with the Read tool. Looking at them IS the verification;
do not stop at "60 frames were produced."

Long clip? Don't make hundreds of PNGs — throttle or contact-sheet (see
[references/ffmpeg-recipes.md](references/ffmpeg-recipes.md)):

```bash
ffmpeg -i clip.webm -vf fps=6 thumb_%03d.png                 # 6 frames/sec
ffmpeg -i clip.webm -vf "fps=5,scale=240:-1,tile=4x3" sheet.png  # 12-up montage
```

## Which capture tool for which surface

You only self-capture for job 2. Match the tool to **what's actually moving** —
they do not overlap. Full setup per tool in
[references/capturing.md](references/capturing.md).

| What's under test | Tool | Output |
| ----------------- | ---- | ------ |
| Web / Electron **renderer** (DOM, web content) | Playwright `recordVideo` (standalone driver) | `.webm` |
| Native **macOS** chrome — menu bar, tray, dock, traffic lights, vibrancy, multi-window | `mcp__computer-use__*` + macOS screen recording | `.mov` / `.mp4` |
| **iOS** simulator app | `mcp__ios-simulator__record_video` / `stop_recording` | `.mp4` |

> The tooling split mirrors QA: Playwright & `mcp__electron__*` drive the
> renderer (same paths as web); `mcp__computer-use__*` is the only thing that
> sees native Cocoa chrome. If the motion lives **outside** the web content,
> Playwright cannot record it — reach for computer-use.

## Capture → verify loop (job 2)

```
[ ] 1. Start the app/server (e.g. `pnpm dev`; native: pnpm electron:build:dir && open the .app)
[ ] 2. Record while driving the interaction that triggers the motion
[ ] 3. Stop recording → flush the video file (Playwright: context.close())
[ ] 4. ffprobe the file, then ffmpeg-extract frames
[ ] 5. READ the frames around the transition — judge jank/easing/flash/shift
[ ] 6. Verdict from the frames. Computed-style/DOM only to confirm wiring, never as the visual verdict.
```

### Playwright renderer — the one-liner that works here

Do **not** record by running `pnpm e2e:web` locally: the Playwright `webServer`
will not boot on this Mac (IPv6/loopback mismatch — see MEMORY
`local-web-e2e-webserver-localhost-blocker`). Instead drive an
**already-running** dev server with a standalone driver script:

Put the driver script **inside the project** (e.g. `corelive/record.mjs`) — node
resolves `@playwright/test` from the script's own folder, so a script in `/tmp`
throws `ERR_MODULE_NOT_FOUND`.

```ts
// corelive/record.mjs — run against a manually-started `pnpm dev` (port 3011)
import { chromium } from '@playwright/test' // the project's declared Playwright dep
const browser = await chromium.launch()
const context = await browser.newContext({
  recordVideo: { dir: '/tmp/vid', size: { width: 1280, height: 800 } },
})
const page = await context.newPage()
await page.goto('http://localhost:3011/home')
await page.getByRole('button', { name: 'Toggle theme' }).click() // trigger motion
await page.waitForTimeout(1500)                                    // let it play
await context.close()  // <- REQUIRED: flushes the .webm to disk
await browser.close()
```

The `.webm` lands in `/tmp/vid/`. Then run the Core recipe on it.

> Auth: the dev server uses real Clerk — sign in in the driven page (or reuse
> `e2e/.auth/user.json` via `storageState`) exactly as the E2E suite does.
> Never mock auth/DB.

## Verify motion with frames, not stills (the rule)

This is a **global Testing rule** (`~/.claude/CLAUDE.md`): screenshots and
`getComputedStyle` sampling cannot reveal jank, easing feel, flashes, or what a
transition actually looks like. Drive the interaction, record video, extract
frames, inspect the frames. Origin: on 2026-06-11 a theme crossfade was "verified"
by sampling a mid-transition computed color — which proved the value interpolated
but not that the motion looked right. Frames are the verdict.

## References

- [references/capturing.md](references/capturing.md) — per-surface recording
  setup: Playwright standalone driver, computer-use macOS screen recording, iOS
  simulator record/stop, and what each can and cannot see.
- [references/ffmpeg-recipes.md](references/ffmpeg-recipes.md) — extraction
  beyond the basics: fps throttling, single frame at a timestamp, contact
  sheets, scene-change detection, before/after side-by-side, format/codec notes.
