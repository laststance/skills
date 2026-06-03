"""
Extract the last assistant message from a Cursor agent transcript
and copy it to the macOS clipboard via pbcopy.

Usage:
    python copy_last_message.py <transcripts_dir> [--nth N] [--dry-run]

Arguments:
    transcripts_dir  Path to the agent-transcripts directory
    --nth N          Copy the Nth-to-last assistant message (default: 1 = most recent)
    --dry-run        Print to stdout instead of copying to clipboard
"""

import json
import os
import subprocess
import sys
from pathlib import Path


def find_latest_transcript(transcripts_dir: str) -> Path | None:
    """Find the most recently modified .jsonl transcript file."""
    transcripts = Path(transcripts_dir)
    jsonl_files = []
    for d in transcripts.iterdir():
        if d.is_dir():
            for f in d.iterdir():
                if f.suffix == ".jsonl":
                    jsonl_files.append(f)
    if not jsonl_files:
        return None
    return max(jsonl_files, key=lambda f: f.stat().st_mtime)


def extract_assistant_texts(jsonl_path: Path) -> list[str]:
    """Extract text content from all assistant messages, ordered chronologically."""
    messages = []
    with open(jsonl_path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                continue

            if data.get("role") != "assistant":
                continue

            msg = data.get("message", {})
            if not isinstance(msg, dict):
                continue

            content_items = msg.get("content", [])
            if not isinstance(content_items, list):
                continue

            text_parts = []
            for item in content_items:
                if isinstance(item, dict) and item.get("type") == "text":
                    text = item.get("text", "")
                    if text.strip():
                        text_parts.append(text)

            if text_parts:
                messages.append("\n".join(text_parts))

    return messages


def copy_to_clipboard(text: str) -> bool:
    """Copy text to macOS clipboard using pbcopy."""
    try:
        proc = subprocess.run(
            ["pbcopy"],
            input=text.encode("utf-8"),
            check=True,
            timeout=5,
        )
        return proc.returncode == 0
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        return False


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Copy last agent message to clipboard")
    parser.add_argument("transcripts_dir", help="Path to agent-transcripts directory")
    parser.add_argument("--nth", type=int, default=1, help="Nth-to-last assistant message (default: 1)")
    parser.add_argument("--dry-run", action="store_true", help="Print instead of clipboard")
    args = parser.parse_args()

    transcript = find_latest_transcript(args.transcripts_dir)
    if not transcript:
        print("ERROR: No transcript files found", file=sys.stderr)
        sys.exit(1)

    messages = extract_assistant_texts(transcript)
    if not messages:
        print("ERROR: No assistant messages found", file=sys.stderr)
        sys.exit(1)

    target_index = len(messages) - args.nth
    if target_index < 0:
        print(f"ERROR: Only {len(messages)} assistant messages, cannot get nth={args.nth}", file=sys.stderr)
        sys.exit(1)

    text = messages[target_index]

    if args.dry_run:
        print(text)
        print(f"\n--- ({len(text)} chars, message {args.nth} from end) ---", file=sys.stderr)
    else:
        if copy_to_clipboard(text):
            print(f"OK: Copied {len(text)} chars to clipboard (message {args.nth}/{len(messages)})")
        else:
            print("ERROR: Failed to copy to clipboard", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
