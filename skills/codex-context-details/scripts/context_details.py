#!/usr/bin/env python3
"""Print a safe, approximate Codex context breakdown table.

The script reads local Codex telemetry and reports sizes without exposing raw
prompt text, tool schemas, secrets, or MCP environment values.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Row:
    """A single display row in the context breakdown table."""

    label: str
    bytes_value: int

    @property
    def approx_tokens(self) -> int:
        """Return a rough token estimate using the common bytes/4 heuristic."""

        return round(self.bytes_value / 4)


def codex_home() -> Path:
    """Return the local Codex home directory.

    Returns:
        The configured CODEX_HOME path, or ~/.codex when unset.
    """

    return Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")).expanduser()


def byte_len(value: Any) -> int:
    """Measure UTF-8 byte size for strings or JSON-serializable values."""

    if isinstance(value, str):
        text = value
    else:
        text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return len(text.encode("utf-8"))


def approx_label(tokens: int) -> str:
    """Format approximate token values as K-sized labels when useful."""

    if tokens >= 10_000:
        return f"~{tokens / 1000:.1f}K"
    if tokens >= 1_000:
        return f"~{tokens / 1000:.1f}K"
    return f"~{tokens}"


def text_of_input_item(item: dict[str, Any]) -> str:
    """Extract visible text from a Responses API input item."""

    content = item.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, dict):
                parts.append(str(part.get("text") or part.get("input_text") or part.get("output_text") or ""))
        return "\n".join(parts)
    return ""


def section(text: str, tag: str) -> str:
    """Return an XML-ish tagged section from a developer prompt."""

    open_tag = f"<{tag}>"
    close_tag = f"</{tag}>"
    start = text.find(open_tag)
    if start < 0:
        return ""
    end = text.find(close_tag, start)
    if end < 0:
        return text[start:]
    return text[start : end + len(close_tag)]


def span(text: str, start_marker: str, end_marker: str) -> str:
    """Return the span between two marker strings."""

    start = text.find(start_marker)
    if start < 0:
        return ""
    end = text.find(end_marker, start)
    if end < 0:
        return text[start:]
    return text[start : end + len(end_marker)]


def latest_response_create_request(home: Path) -> dict[str, Any] | None:
    """Load the newest Responses API request body from Codex sqlite logs."""

    db_path = home / "logs_2.sqlite"
    if not db_path.exists():
        return None

    query = """
        SELECT feedback_log_body
        FROM logs
        WHERE feedback_log_body LIKE '%websocket request: {"type":"response.create"%'
           OR feedback_log_body LIKE '%websocket request: {"model"%'
        ORDER BY ts DESC, ts_nanos DESC
        LIMIT 20
    """
    with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as connection:
        for (body,) in connection.execute(query):
            request = parse_request_from_log(body or "")
            if request:
                return request
    return None


def parse_request_from_log(body: str) -> dict[str, Any] | None:
    """Parse the JSON request after the 'websocket request:' marker."""

    marker = "websocket request: "
    marker_index = body.find(marker)
    if marker_index < 0:
        return None
    json_start = body.find("{", marker_index + len(marker))
    if json_start < 0:
        return None
    try:
        request = json.loads(body[json_start:])
    except json.JSONDecodeError:
        return None
    if isinstance(request, dict) and request.get("tools") is not None:
        return request
    return None


def newest_session_file(home: Path) -> Path | None:
    """Return the newest Codex rollout JSONL file by modification time."""

    session_root = home / "sessions"
    if not session_root.exists():
        return None
    files = list(session_root.rglob("*.jsonl"))
    if not files:
        return None
    return max(files, key=lambda path: path.stat().st_mtime)


def latest_token_info(home: Path) -> dict[str, Any] | None:
    """Read the newest token_count payload from the newest session file."""

    session_file = newest_session_file(home)
    if session_file is None:
        return None

    latest: dict[str, Any] | None = None
    with session_file.open("r", encoding="utf-8") as handle:
        for line in handle:
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            payload = event.get("payload")
            if isinstance(payload, dict) and payload.get("type") == "token_count":
                info = payload.get("info")
                if isinstance(info, dict):
                    latest = info
    return latest


def tool_groups(tools: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Group tool schemas by the categories shown in the context table."""

    subagent_names = {"spawn_agent", "send_input", "resume_agent", "wait_agent", "close_agent"}
    mcp_names = {"list_mcp_resources", "list_mcp_resource_templates", "read_mcp_resource"}
    groups: dict[str, list[dict[str, Any]]] = {
        "Tools: Subagents": [],
        "Tools: MCP core helpers": [],
        "Tools: tool_search discovery": [],
        "Tools: app/plugin namespace": [],
        "Tools: other local tools": [],
    }

    for tool in tools:
        name = str(tool.get("name") or tool.get("type") or "unknown")
        if name in subagent_names:
            groups["Tools: Subagents"].append(tool)
        elif name in mcp_names or name.startswith("mcp__"):
            groups["Tools: MCP core helpers"].append(tool)
        elif name == "tool_search" or tool.get("type") == "tool_search":
            groups["Tools: tool_search discovery"].append(tool)
        elif tool.get("type") == "namespace" or name in {"codex_app", "automation_update", "request_plugin_install"}:
            groups["Tools: app/plugin namespace"].append(tool)
        else:
            groups["Tools: other local tools"].append(tool)
    return groups


def build_rows(request: dict[str, Any]) -> list[Row]:
    """Build the context detail rows from a Responses API request."""

    input_items = request.get("input") if isinstance(request.get("input"), list) else []
    tools = request.get("tools") if isinstance(request.get("tools"), list) else []
    developer_item = next((item for item in input_items if item.get("role") == "developer"), {})
    developer_text = text_of_input_item(developer_item)

    agents_items = [item for item in input_items if text_of_input_item(item).startswith("# AGENTS.md instructions")]
    skill_payload_items = [item for item in input_items if text_of_input_item(item).startswith("<skill>")]

    known_input_bytes = (
        byte_len(developer_item)
        + sum(byte_len(item) for item in agents_items)
        + sum(byte_len(item) for item in skill_payload_items)
    )
    total_input_bytes = sum(byte_len(item) for item in input_items)

    grouped_tools = tool_groups(tools)
    rows = [
        Row("System prompt / instructions", byte_len(request.get("instructions", ""))),
        Row("Tools schemas total", byte_len(tools)),
    ]
    rows.extend(Row(label, byte_len(group)) for label, group in grouped_tools.items())
    rows.extend(
        [
            Row("Apps / connectors instructions", byte_len(section(developer_text, "apps_instructions"))),
            Row("Skills catalog instructions", byte_len(section(developer_text, "skills_instructions"))),
            Row("Plugin instructions", byte_len(section(developer_text, "plugins_instructions"))),
            Row("Project AGENTS.md rules", sum(byte_len(item) for item in agents_items)),
            Row("Invoked skill payloads in conversation", sum(byte_len(item) for item in skill_payload_items)),
            Row("Conversation/history remainder", max(0, total_input_bytes - known_input_bytes)),
            Row("Memory summary/rules", byte_len(span(developer_text, "## Memory", "========= MEMORY_SUMMARY ENDS ========="))),
            Row("App/context desktop instructions", byte_len(section(developer_text, "app-context"))),
        ]
    )
    return rows


def print_markdown(rows: list[Row], token_info: dict[str, Any] | None) -> None:
    """Print a Japanese Markdown report."""

    if token_info:
        last = token_info.get("last_token_usage", {})
        window = token_info.get("model_context_window")
        used = last.get("total_tokens")
        if isinstance(used, int) and isinstance(window, int) and window > 0:
            percent = round(used / window * 100)
            print(f"現在の context window: {percent}% full (~{used / 1000:.1f}K / {window / 1000:.0f}K tokens)")
            print()

    print("| 区分 | 概算 |")
    print("|---|---:|")
    for row in rows:
        print(f"| {row.label} | {approx_label(row.approx_tokens)} |")


def print_json(rows: list[Row], token_info: dict[str, Any] | None) -> None:
    """Print machine-readable row data."""

    payload = {
        "token_info": token_info,
        "rows": [
            {
                "label": row.label,
                "approx_tokens": row.approx_tokens,
                "bytes": row.bytes_value,
            }
            for row in rows
        ],
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def main() -> int:
    """Run the context detail reporter.

    Returns:
        Process exit status.
    """

    parser = argparse.ArgumentParser(description="Print a Codex context breakdown table.")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    args = parser.parse_args()

    home = codex_home()
    request = latest_response_create_request(home)
    if request is None:
        raise SystemExit("No latest response.create request found in ~/.codex/logs_2.sqlite")

    rows = build_rows(request)
    token_info = latest_token_info(home)
    if args.json:
        print_json(rows, token_info)
    else:
        print_markdown(rows, token_info)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
