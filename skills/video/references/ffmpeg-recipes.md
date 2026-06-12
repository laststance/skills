# ffmpeg / ffprobe recipes for frame inspection

All commands below are verified working with ffmpeg 8.x on macOS. Use absolute
paths for outputs. Every recipe ends the same way: you then **read the PNGs as
images** — extraction is a means, looking is the verification.

## Table of contents

- [Inspect before extracting (ffprobe)](#inspect-before-extracting)
- [Extract every frame](#extract-every-frame)
- [Throttle frame rate (long clips)](#throttle-frame-rate)
- [One frame at a precise timestamp](#one-frame-at-a-precise-timestamp)
- [Contact sheet / montage](#contact-sheet)
- [Scene-change detection](#scene-change-detection)
- [Before/after side-by-side](#beforeafter-side-by-side)
- [Crop to a region](#crop-to-a-region)
- [Formats & codecs](#formats--codecs)
- [Gotchas](#gotchas)

## Inspect before extracting

Always read the clip's shape first so you know how many frames to expect and
where moments fall in time. `-count_frames` walks the stream for an exact count.

```bash
ffprobe -v error -count_frames \
  -select_streams v:0 \
  -show_entries stream=r_frame_rate,nb_read_frames,width,height \
  -show_entries format=duration \
  -of default=noprint_wrappers=1 clip.webm
# -> r_frame_rate=30/1  nb_read_frames=60  width=640  height=360  duration=2.0
```

frame N occurs at `t = N / fps` seconds. At 30fps, frame 24 ≈ 0.8s.

## Extract every frame

Zero-pad the index (`%04d`) so PNGs sort lexically = chronologically.

```bash
ffmpeg -i clip.webm frame_%04d.png        # frame_0001.png ... frame_0060.png
```

Good for short clips (≤ ~3s). For anything longer, throttle (next).

## Throttle frame rate

Hundreds of near-identical PNGs waste context. Sample N frames/second instead —
6–10 fps is plenty to see easing and any flash.

```bash
ffmpeg -i clip.webm -vf fps=6 thumb_%03d.png      # 6 evenly-spaced frames/sec
ffmpeg -i clip.webm -vf fps=10 thumb_%03d.png     # finer, for fast motion
```

## One frame at a precise timestamp

Put `-ss` **before** `-i` for a fast keyframe-accurate seek. Use this to grab
the exact mid-transition moment named by `t = frame/fps`.

```bash
ffmpeg -ss 0.8 -i clip.webm -frames:v 1 at_0p8s.png
ffmpeg -ss 00:00:01.250 -i clip.mp4 -frames:v 1 at_1p25s.png
```

## Contact sheet

One image, many moments — fastest way to scan a whole transition. `tile=COLSxROWS`
lays sampled frames in a grid; `scale` keeps it readable.

```bash
ffmpeg -i clip.webm -vf "fps=5,scale=240:-1,tile=4x3" sheet.png   # up to 12 moments
ffmpeg -i clip.webm -vf "fps=8,scale=200:-1,tile=5x4" sheet.png   # up to 20 moments
```

Read `sheet.png` first to locate the interesting span, then extract that span
full-res with `-ss`.

## Scene-change detection

Find *where* motion/cuts happen so you extract only there. `scene` is 0..1
(higher threshold = bigger change required).

```bash
ffmpeg -i clip.mp4 -vf "select='gt(scene,0.3)',showinfo" -vsync vfr -f null - \
  2>&1 | grep -oE "pts_time:[0-9.]+"
# each pts_time is a scene-cut timestamp -> feed to -ss above
```

Continuous animations (no hard cuts) may report none — that is expected; fall
back to fps sampling or a contact sheet.

## Before/after side-by-side

Compare two recordings (e.g. old vs new easing) in one frame. `hstack` =
horizontal, `vstack` = vertical. Inputs should share dimensions. Left = first
input (before), right = second (after).

```bash
# Single comparison frame
ffmpeg -i before.webm -i after.webm -filter_complex "[0:v][1:v]hstack" \
  -frames:v 1 compare.png

# Full comparison video, side by side
ffmpeg -i before.webm -i after.webm -filter_complex "[0:v][1:v]hstack" compare.mp4
```

> `drawtext` (text labels burned into the frame) is **not in every ffmpeg build**
> — it failed with `Filter not found` on the build tested here. Don't rely on it;
> left/right position already tells before from after.

## Crop to a region

Isolate the moving element so frames aren't dominated by static chrome.
`crop=W:H:X:Y` (top-left origin). Chain crop and fps in **one** `-vf` — a second
`-vf` silently overrides the first, dropping the crop.

```bash
ffmpeg -i clip.webm -vf "crop=400:300:100:50,fps=8" region_%03d.png
```

## Formats & codecs

- Playwright records `.webm` (VP8/VP9) — extracts identically to `.mp4`.
- macOS screen recording / iOS sim give `.mov` / `.mp4` (H.264) — same commands.
- Output `.png` for lossless inspection (banding/aliasing show truthfully).
  Use `.jpg` only to shrink a huge contact sheet.

## Gotchas

- **Empty/locked file?** Playwright only flushes the `.webm` on
  `context.close()`. Close the context before ffprobe.
- **`-ss` after `-i`** is frame-accurate but slow (decodes from 0); **before
  `-i`** is fast (keyframe seek). For a single grab, before is fine.
- **Odd-dimension scale error** with libx264: use `scale=W:-2` (multiple of 2),
  not `-1`.
- **`fps` filter vs `-r`**: prefer `-vf fps=N` for sampling; `-r` can duplicate
  or drop unpredictably on variable-frame-rate sources.
