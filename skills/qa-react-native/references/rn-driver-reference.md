# React Native driver cheat sheet (simctl + adb + Metro)

Quick lookup for the operations used during an RN QA run. Three surfaces:
iOS Simulator (via `mcp__ios-simulator__*` + `xcrun simctl`), Android
Emulator (via `adb` + `uiautomator`), and Metro (via HTTP).

## iOS Simulator — same as `qa-ios`

Full reference is in the `qa-ios` skill. The hot-path commands:

| Goal | Command |
|------|---------|
| Get booted UDID | `mcp__ios-simulator__get_booted_sim_id` |
| Launch app (cold) | `mcp__ios-simulator__launch_app({ bundle_id, terminate_running: true })` |
| Screenshot | `mcp__ios-simulator__screenshot` |
| AX dump | `mcp__ios-simulator__ui_describe_all` |
| Tap by coord | `mcp__ios-simulator__ui_tap({ x, y })` |
| Type text | `mcp__ios-simulator__ui_type({ text })` |
| Dark mode | `xcrun simctl ui booted appearance dark` |
| Font scale | `xcrun simctl ui booted content_size extra-extra-extra-large` |
| Log stream RN | `xcrun simctl spawn booted log stream --predicate 'eventMessage CONTAINS "ReactNativeJS"' --level debug` |

## Android Emulator — adb + uiautomator

### Device lifecycle

| Goal | Command |
|------|---------|
| List devices | `adb devices` |
| Device model / OS | `adb shell getprop ro.product.model ; adb shell getprop ro.build.version.release` |
| Screen size / density | `adb shell wm size ; adb shell wm density` |
| Reconnect if offline | `adb kill-server && adb start-server` |

### App lifecycle

| Goal | Command |
|------|---------|
| Install APK | `adb install -r <path>.apk` |
| Uninstall | `adb uninstall <package>` |
| Launch | `adb shell monkey -p <package> -c android.intent.category.LAUNCHER 1` |
| Launch explicit activity | `adb shell am start -n <package>/.MainActivity` |
| Force stop (cold start prep) | `adb shell am force-stop <package>` |
| Clear app data (fresh state) | `adb shell pm clear <package>` |
| List installed packages | `adb shell pm list packages \| grep <name>` |
| Get package version | `adb shell dumpsys package <package> \| grep versionName` |

### Screenshots

```bash
# In one shot, no file on device
adb exec-out screencap -p > screen.png

# With device copy (slower but lets you keep it)
adb shell screencap -p /sdcard/screen.png && adb pull /sdcard/screen.png
```

### Accessibility / UI hierarchy

```bash
# Dump the UI tree as XML
adb shell uiautomator dump /sdcard/ui.xml
adb pull /sdcard/ui.xml

# Or dump directly to stdout
adb exec-out uiautomator dump /dev/stdout 2>/dev/null
```

The XML contains `<node>` elements with attributes:

- `resource-id="com.example:id/button_login"` — element ID (if set)
- `class="android.widget.Button"` — Android widget class
- `text="Log In"` — visible text
- `content-desc="Log In button"` — accessibility description
- `clickable="true"` — tap target
- `bounds="[100,200][400,280]"` — pixel rectangle `[x1,y1][x2,y2]`

Parse `bounds` to get the center:
```
x = (x1 + x2) / 2
y = (y1 + y2) / 2
```

### Input

| Goal | Command |
|------|---------|
| Tap | `adb shell input tap <x> <y>` |
| Long press (500ms) | `adb shell input swipe <x> <y> <x> <y> 500` |
| Swipe | `adb shell input swipe <x1> <y1> <x2> <y2> <duration_ms>` |
| Type text | `adb shell input text "hello"` (spaces: use `%s`) |
| Press keycode | `adb shell input keyevent <KEYCODE>` |

Useful keycodes:

| Key | Keycode |
|-----|---------|
| Back | `KEYCODE_BACK` (4) |
| Home | `KEYCODE_HOME` (3) |
| Recents | `KEYCODE_APP_SWITCH` (187) |
| Menu | `KEYCODE_MENU` (82) — doubles as "shake" for RN dev menu |
| Power | `KEYCODE_POWER` (26) |
| Enter | `KEYCODE_ENTER` (66) |

### RN dev menu (Android)

The dev menu opens on "shake" — in the emulator, send the menu key:

```bash
adb shell input keyevent 82
```

From there: Reload, Debug, Inspector, Perf Monitor, Settings.

### State overrides

| Goal | Command |
|------|---------|
| Dark mode on | `adb shell "cmd uimode night yes"` |
| Dark mode off | `adb shell "cmd uimode night no"` |
| Font scale 1.3 | `adb shell settings put system font_scale 1.3` |
| Font scale default | `adb shell settings put system font_scale 1.0` |
| Rotate landscape | `adb shell settings put system accelerometer_rotation 0 && adb shell settings put system user_rotation 1` |
| Rotate portrait | `adb shell settings put system user_rotation 0` |
| Wi-Fi off | `adb shell svc wifi disable` |
| Wi-Fi on | `adb shell svc wifi enable` |
| Data off | `adb shell svc data disable` |
| Airplane mode on | `adb shell cmd connectivity airplane-mode enable` |

### Logs

```bash
# Clear before starting
adb logcat -c

# RN JS + RN bridge + any error-level
adb logcat ReactNativeJS:* ReactNative:* *:E

# Or all logs from one process (find PID first)
adb shell pidof <package>       # get PID
adb logcat --pid=<pid>

# Save to file
adb logcat -f /sdcard/rn.log ReactNativeJS:*
```

Key tags:

- `ReactNativeJS` — `console.log/warn/error` from JS
- `ReactNative` — the RN bridge itself (rarely useful unless debugging native)
- `AndroidRuntime` — native fatal exceptions
- `ActivityManager` — app lifecycle events (useful to see if the app is
  being killed in background)

## Metro dev server

The bundler runs at `http://localhost:8081` by default.

| Goal | Endpoint |
|------|----------|
| Health check | `GET /status` → expect `packager-status:running` |
| Version info | `GET /version` |
| Reload app via Metro | `GET /reload` — triggers a JS reload on connected clients |
| Open dev menu | N/A via HTTP — send shake / menu key to device |
| Bundle size estimate | `GET /index.bundle?platform=ios&dev=true` (fetch it, check `Content-Length`) |

Quick sanity check loop:
```bash
# Is Metro alive?
curl -s http://localhost:8081/status

# Is the bundle building?
curl -s "http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false" > /dev/null \
  && echo "bundle OK" || echo "bundle FAIL"
```

## Expo-specific

Expo apps add another layer:

```bash
# Which Expo SDK?
cat package.json | grep '"expo":'
cat app.json | grep '"sdkVersion":'

# Is the Expo dev server up?
curl -s http://localhost:19000/status
curl -s http://localhost:19002/api/status  # newer versions
```

Expo Go is a separate app with its own bundle ID:
- iOS: `host.exp.Exponent`
- Android: `host.exp.exponent`

Expo dev client (`npx expo install expo-dev-client`) builds a custom
dev client with the app's own bundle ID.

## Dual-platform automation pattern

Boot both sims before Phase 0, then interleave in Phase 2 onward:

```
screen A:
  iOS:    screenshot + AX
  Android: screenshot + uiautomator
  diff → any layout divergence?

screen B:
  iOS:    screenshot + AX
  Android: screenshot + uiautomator
  diff → ...
```

Keep per-platform directories (`/tmp/qa-rn-session/ios/`,
`/tmp/qa-rn-session/android/`) so evidence doesn't get mixed up.

## Common gotchas

- **`adb shell input text`** doesn't handle special chars well. Spaces
  must be `%s`; quotes get eaten. For anything complex, use the clipboard:
  `adb shell "echo 'your text' | pbcopy"` equivalent is `echo 'text' |
  adb shell input keyevent 279` (paste from host clipboard — needs setup).
  Simpler: `input keyevent <X>` one character at a time.
- **Android hardware back button** — emulator sometimes has a software
  "home" overlay instead of hardware buttons. `adb shell input keyevent
  KEYCODE_BACK` is always authoritative.
- **Metro on a different port** — if `.env` or `app.json` sets a custom
  port, adapt. Check by `lsof -i -P | grep metro` or similar.
- **`uiautomator dump` returns Accessibility-disabled error** — some
  emulator images (older/older API) need Accessibility services enabled.
  Run `adb shell settings put secure enabled_accessibility_services
  com.android.talkback/com.google.android.marvin.talkback.TalkBackService`
  — but don't do this invasively, ask the user.
- **Expo Go caches aggressively** — reloading via Metro's `/reload` may
  not pick up all changes on Expo Go. Shake → "Clear cache and reload"
  is authoritative but slow.
