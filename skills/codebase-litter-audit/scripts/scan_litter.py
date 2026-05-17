#!/usr/bin/env python3
"""Scan a repository for unfinished-code and stale-cleanup candidates.

The script is intentionally conservative: it collects leads for Codex to verify,
not final findings. It avoids common generated/vendor directories and emits
evidence with file paths and line numbers.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


DEFAULT_IGNORES = {
    ".git",
    ".next",
    ".turbo",
    ".vercel",
    ".cache",
    "coverage",
    "dist",
    "build",
    "node_modules",
    "playwright-report",
    "storybook-static",
    "test-results",
}

BINARY_EXTENSIONS = {
    ".avif",
    ".bmp",
    ".gif",
    ".ico",
    ".icns",
    ".jpeg",
    ".jpg",
    ".pdf",
    ".png",
    ".webp",
    ".woff",
    ".woff2",
    ".zip",
}

PATTERNS: list[tuple[str, str, re.Pattern[str]]] = [
    (
        "todo-marker",
        "TODO/FIXME/HACK/WIP style marker",
        re.compile(r"\b(TODO|FIXME|HACK|XXX|TBD|WIP)\b"),
    ),
    (
        "unfinished-wording",
        "unfinished, placeholder, or not-implemented wording",
        re.compile(
            r"\b(not implemented|unimplemented|stub|placeholder|coming soon|not available|not installed|temporary|for now|later)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "skipped-test",
        "skipped or focused test",
        re.compile(r"\b(test|it|describe)\.(skip|only)\s*\(|\.skip\s*\(", re.IGNORECASE),
    ),
    (
        "empty-handler",
        "empty inline handler or callback",
        re.compile(r"\b(on[A-Z][A-Za-z0-9_]*|handle[A-Z][A-Za-z0-9_]*)\s*=\s*\{\s*\(\s*[^)]*\s*\)\s*=>\s*\{\s*\}\s*\}"),
    ),
    (
        "noop-export",
        "explicit no-op function naming",
        re.compile(r"\b(noop|noOp|NOOP|doNothing)\b"),
    ),
    (
        "suppression",
        "lint, type, coverage, or test suppression",
        re.compile(
            r"(eslint-disable|ts-ignore|ts-expect-error|istanbul ignore|c8 ignore|type:\s*ignore|pragma:\s*no cover)",
            re.IGNORECASE,
        ),
    ),
    (
        "warn-only-feature",
        "warn-only unavailable feature",
        re.compile(r"console\.(warn|error)\s*\([^)]*(not available|not installed|not implemented|TODO|stub)", re.IGNORECASE),
    ),
]


@dataclass(frozen=True)
class Finding:
    """A raw candidate emitted by the scanner."""

    kind: str
    description: str
    path: str
    line: int
    text: str


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments.

    Returns:
        Parsed arguments for root path, output format, and include filters.
    """

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", nargs="?", default=".", help="Repository root to scan")
    parser.add_argument(
        "--include",
        action="append",
        default=[],
        help="Relative path prefix to include. Repeat for multiple scopes.",
    )
    parser.add_argument("--markdown", action="store_true", help="Emit Markdown output")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of Markdown")
    parser.add_argument(
        "--max-per-kind",
        type=int,
        default=80,
        help="Maximum findings to emit for each signal kind",
    )
    return parser.parse_args()


def should_skip_dir(path: Path) -> bool:
    """Return whether a directory should be ignored during traversal."""

    return path.name in DEFAULT_IGNORES or path.name.startswith(".gstack")


def is_probably_text(path: Path) -> bool:
    """Return whether a file is likely safe to read as text."""

    if path.suffix.lower() in BINARY_EXTENSIONS:
        return False
    return True


def iter_files(root: Path, includes: Iterable[str]) -> Iterable[Path]:
    """Yield candidate text files under root, respecting ignore and include rules."""

    include_prefixes = tuple(prefix.strip("/").rstrip("/") for prefix in includes if prefix)

    for dirpath, dirnames, filenames in os.walk(root):
        current = Path(dirpath)
        dirnames[:] = [name for name in dirnames if not should_skip_dir(current / name)]

        for filename in filenames:
            path = current / filename
            if not is_probably_text(path):
                continue

            relative = path.relative_to(root).as_posix()
            if include_prefixes and not relative.startswith(include_prefixes):
                continue

            yield path


def scan_file(root: Path, path: Path, counts: dict[str, int], max_per_kind: int) -> list[Finding]:
    """Scan one file and return raw findings."""

    findings: list[Finding] = []

    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except UnicodeDecodeError:
        return findings
    except OSError:
        return findings

    relative = path.relative_to(root).as_posix()

    for line_number, line in enumerate(lines, start=1):
        stripped = line.strip()
        if not stripped:
            continue

        for kind, description, pattern in PATTERNS:
            if counts.get(kind, 0) >= max_per_kind:
                continue
            if pattern.search(line):
                counts[kind] = counts.get(kind, 0) + 1
                findings.append(
                    Finding(
                        kind=kind,
                        description=description,
                        path=relative,
                        line=line_number,
                        text=stripped[:240],
                    )
                )

    return findings


def scan(root: Path, includes: Iterable[str], max_per_kind: int) -> list[Finding]:
    """Scan a repository tree and return all raw candidates."""

    counts: dict[str, int] = {}
    findings: list[Finding] = []

    for path in iter_files(root, includes):
        findings.extend(scan_file(root, path, counts, max_per_kind))

    return findings


def emit_markdown(root: Path, findings: list[Finding]) -> None:
    """Print findings as Markdown grouped by signal kind."""

    print("# Codebase Litter Candidate Scan")
    print()
    print(f"Root: `{root}`")
    print(f"Candidates: `{len(findings)}`")
    print()

    if not findings:
        print("No candidates found by the scanner. Manual review may still find product-specific litter.")
        return

    grouped: dict[str, list[Finding]] = {}
    for finding in findings:
        grouped.setdefault(finding.kind, []).append(finding)

    for kind in sorted(grouped):
        print(f"## {kind}")
        print()
        for finding in grouped[kind]:
            print(f"- `{finding.path}:{finding.line}` — {finding.text}")
        print()


def main() -> int:
    """Run the scanner."""

    args = parse_args()
    root = Path(args.root).resolve()
    findings = scan(root, args.include, args.max_per_kind)

    if args.json:
        print(json.dumps([asdict(item) for item in findings], indent=2, ensure_ascii=False))
    else:
        emit_markdown(root, findings)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
