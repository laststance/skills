#!/bin/bash
# copy-to-clipboard.sh - OS-aware clipboard copy helper for deep-trace skill
#
# Usage:   command-that-prints | ./copy-to-clipboard.sh
# Stdin:   raw text to copy (UTF-8)
# Stdout:  (silent on success)
# Stderr:  one-line status message (which tool was used, or skip reason)
# Exit:    always 0 — never blocks the workflow if no clipboard tool exists
#
# Detection order:
#   macOS                       -> pbcopy
#   Linux (Wayland)             -> wl-copy
#   Linux (X11)                 -> xclip -> xsel
#   WSL (Linux on Windows)      -> clip.exe
#   Cygwin / MinGW / MSYS       -> clip
#   Anything else / no tool     -> skip with a stderr notice

set -e

content="$(cat)"

if [ -z "$content" ]; then
  echo "copy-to-clipboard: empty input — nothing to copy" >&2
  exit 0
fi

# Pipe $content into the given command. Use printf (not echo) to avoid
# stripping trailing newlines and to keep backslashes literal.
copy_with() {
  printf '%s' "$content" | "$@"
}

case "$(uname -s)" in
  Darwin)
    if command -v pbcopy >/dev/null 2>&1; then
      copy_with pbcopy
      echo "copy-to-clipboard: copied via pbcopy (macOS)" >&2
      exit 0
    fi
    ;;

  Linux)
    # Prefer Wayland when the session advertises it
    if [ -n "${WAYLAND_DISPLAY:-}" ] && command -v wl-copy >/dev/null 2>&1; then
      copy_with wl-copy
      echo "copy-to-clipboard: copied via wl-copy (Wayland)" >&2
      exit 0
    fi
    if command -v xclip >/dev/null 2>&1; then
      copy_with xclip -selection clipboard
      echo "copy-to-clipboard: copied via xclip (X11)" >&2
      exit 0
    fi
    if command -v xsel >/dev/null 2>&1; then
      copy_with xsel --clipboard --input
      echo "copy-to-clipboard: copied via xsel (X11)" >&2
      exit 0
    fi
    # WSL exposes clip.exe on PATH
    if command -v clip.exe >/dev/null 2>&1; then
      copy_with clip.exe
      echo "copy-to-clipboard: copied via clip.exe (WSL)" >&2
      exit 0
    fi
    ;;

  CYGWIN*|MINGW*|MSYS*)
    if command -v clip >/dev/null 2>&1; then
      copy_with clip
      echo "copy-to-clipboard: copied via clip (Windows)" >&2
      exit 0
    fi
    ;;
esac

echo "copy-to-clipboard: no clipboard tool detected on this OS — skipped (manual copy required)" >&2
exit 0
