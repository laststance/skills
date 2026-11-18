#!/usr/bin/env python3
"""Store UX evidence on this machine and keep case material out of shared searches."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import tempfile
from datetime import date
from urllib.parse import urlsplit


def slug(value):
    """Accept one stable path component for a project or review."""
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,79}", value):
        raise ValueError("Use a lowercase slug with letters, numbers and hyphens.")
    return value


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False)


def field(record, name):
    value = record[name]
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Expected nonempty text in {name}.")
    return value.strip()


def tags(record):
    values = record["tags"]
    if not isinstance(values, list) or not values:
        raise ValueError("Supply at least one reusable task tag.")
    return sorted({slug(tag) for tag in values})


def market_entry(record):
    """Whitelist reusable fields before indexing a public market observation."""
    entry = {name: field(record, name) for name in
             ("source", "pattern", "product", "observation", "conditions", "checked")}
    url = urlsplit(entry["source"])
    if url.scheme not in ("http", "https") or not url.hostname or url.username or url.password:
        raise ValueError("Market evidence needs a public HTTP(S) source.")
    date.fromisoformat(entry["checked"])
    entry["pattern"] = slug(entry["pattern"])
    entry["tags"] = tags(record)
    return entry


def open_notebook(root, project=None):
    """Attach the shared library so case writes and shared updates commit together."""
    root.mkdir(parents=True, exist_ok=True)
    if project is None:
        db = sqlite3.connect(root / "library.sqlite3", timeout=15)
        library = "main"
    else:
        folder = root / "projects" / slug(project)
        folder.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(folder / "case.sqlite3", timeout=15)
        db.execute("ATTACH DATABASE ? AS library", (str(root / "library.sqlite3"),))
        library = "library"
        db.executescript("""
            CREATE TABLE IF NOT EXISTS reviews
                (run TEXT PRIMARY KEY, manifest TEXT NOT NULL, html TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS feedback
                (proposal TEXT NOT NULL, event TEXT NOT NULL, recorded TEXT DEFAULT CURRENT_TIMESTAMP);
            CREATE INDEX IF NOT EXISTS feedback_by_proposal ON feedback(proposal);
        """)
    db.execute(f"""CREATE TABLE IF NOT EXISTS {library}.entries
                   (kind TEXT, identity TEXT, checked TEXT, data TEXT NOT NULL,
                    PRIMARY KEY(kind, identity))""")
    return db


def store_entry(db, kind, identity, checked, data):
    db.execute("""INSERT INTO library.entries VALUES (?, ?, ?, ?)
                  ON CONFLICT(kind,identity) DO UPDATE SET checked=excluded.checked,data=excluded.data
                  WHERE excluded.checked >= entries.checked""", (kind, identity, checked, encode(data)))


def search(db, terms):
    """Return matching public observations and generalized feedback, ranked by tag/text overlap."""
    terms = {term.casefold() for term in terms if term.strip()}
    matches = []
    for kind, checked, data in db.execute("SELECT kind, checked, data FROM entries ORDER BY identity"):
        entry = json.loads(data)
        searchable = " ".join(str(entry.get(key, "")) for key in
                              ("tags", "pattern", "product", "observation", "conditions", "lesson")).casefold()
        count = sum(term in searchable for term in terms)
        if count:
            matches.append((count, checked, dict(kind=kind, **entry)))
    matches.sort(key=lambda hit: hit[:2], reverse=True)
    return [entry for _, _, entry in matches[:30]]


def export_html(root, project, run, html):
    """Atomically materialize an offline copy from the committed case record."""
    folder = root / "projects" / project / run
    folder.mkdir(exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=folder, delete=False) as output:
        try:
            output.write(html)
            output.close()
            path = folder / "report.html"
            os.replace(output.name, path)
        finally:
            Path(output.name).unlink(missing_ok=True)
    return str(path)


def save(db, root, args):
    """Save an immutable case review and index newly observed market patterns once."""
    run = slug(args.run)
    raw = json.loads(args.manifest.read_text(encoding="utf-8"))
    proposals = raw["proposals"]
    if not isinstance(proposals, list) or len(proposals) > 3:
        raise ValueError("A review can contain zero to three ranked proposals.")
    if not isinstance(raw["market"], list):
        raise ValueError("Expected a market array.")
    manifest = {"proposals": [{"title": field(item, "title"), "tags": tags(item)} for item in proposals],
                "market": [market_entry(item) for item in raw["market"]]}
    html = args.html.read_text(encoding="utf-8")
    markers = set(re.findall(r"\{\{id:(\d+)\}\}", html))
    if not html.strip() or markers != {str(index) for index in range(1, len(proposals) + 1)}:
        raise ValueError("Include the matching {{id:1}}, ... markers in the HTML for all proposals.")
    html = re.sub(r"\{\{id:(\d+)\}\}", lambda match: f"{args.project}/{run}/{match[1]}", html)
    with db:
        db.execute("BEGIN IMMEDIATE")
        review = (encode(manifest), html)
        existing = db.execute("SELECT manifest,html FROM reviews WHERE run=?", (run,)).fetchone()
        if existing and existing != review:
            raise ValueError("This review ID already exists with different content. Choose a new run slug.")
        # Re-exporting a saved review must preserve later research on the same day.
        if existing is None:
            db.execute("INSERT INTO reviews VALUES (?,?,?)", (run, *review))
            for item in manifest["market"]:
                identity = encode([item["source"], item["pattern"]])
                store_entry(db, "market", identity, item["checked"], item)
    return export_html(root, args.project, run, html)


def history(db, project):
    """List case proposals and the feedback that should inform a repeat review."""
    result = []
    for run, manifest in db.execute("SELECT run,manifest FROM reviews ORDER BY rowid DESC"):
        for index, proposal in enumerate(json.loads(manifest)["proposals"], 1):
            identifier = f"{project}/{run}/{index}"
            events = [dict(json.loads(data), recorded=recorded) for data, recorded in db.execute(
                "SELECT event,recorded FROM feedback WHERE proposal=? ORDER BY rowid", (identifier,))]
            decision = next((item["decision"] for item in reversed(events) if item["decision"]), None)
            outcome_events = [i for i, item in enumerate(events) if item["outcome"]]
            decision_events = [i for i, item in enumerate(events) if item["decision"]]
            # A fresh adoption after a previous decision can still await its own result.
            last_outcome = max(outcome_events, default=-1)
            last_decision = max(decision_events, default=-1)
            pending = decision != "declined" and (last_outcome < 0 or last_outcome < last_decision)
            result.append(dict(proposal, id=identifier, feedback=events, pending=pending))
    return result


def feedback(db, args):
    """Append a private report and index only the separately supplied transferable lesson."""
    project, run, number = args.id.split("/")
    slug(run)
    if not re.fullmatch(r"[1-3]", number):
        raise ValueError("Invalid proposal number.")
    note = field(vars(args), "note")
    if bool(args.lesson) != bool(args.conditions) or (args.lesson and not (args.outcome or args.decision)):
        raise ValueError("A shared lesson needs conditions and an explicit outcome or decision.")
    event = {"note": note, "decision": args.decision, "outcome": args.outcome,
             "lesson": args.lesson, "conditions": args.conditions}
    with db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT manifest FROM reviews WHERE run=?", (run,)).fetchone()
        if not row or int(number) > len(json.loads(row[0])["proposals"]):
            raise ValueError(f"Unknown proposal: {project}/{run}/{number}")
        latest = db.execute("SELECT event FROM feedback WHERE proposal=? ORDER BY rowid DESC LIMIT 1",
                            (args.id,)).fetchone()
        if latest == (encode(event),):
            return args.id
        db.execute("INSERT INTO feedback(proposal,event) VALUES (?,?)", (args.id, encode(event)))
        if args.lesson:
            checked = date.today().isoformat()
            shared = {"lesson": field(event, "lesson"), "conditions": field(event, "conditions"),
                      "decision": args.decision, "outcome": args.outcome, "checked": checked,
                      "tags": json.loads(row[0])["proposals"][int(number) - 1]["tags"]}
            # The opaque identity links retries without exposing private project names or comments.
            identity = hashlib.sha256(encode([args.id, shared["lesson"], shared["conditions"],
                                               args.decision, args.outcome]).encode()).hexdigest()
            store_entry(db, "reported-outcome" if args.outcome else "decision", identity, checked, shared)
    return args.id


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    query = commands.add_parser("search")
    query.add_argument("terms", nargs="+")
    commands.add_parser("history").add_argument("project")
    review = commands.add_parser("save")
    review.add_argument("project")
    review.add_argument("run")
    review.add_argument("manifest", type=Path)
    review.add_argument("html", type=Path)
    restore = commands.add_parser("report")
    restore.add_argument("project")
    restore.add_argument("run")
    update = commands.add_parser("feedback")
    update.add_argument("id")
    update.add_argument("note")
    update.add_argument("--decision", choices=["adopted", "declined", "deferred"])
    update.add_argument("--outcome", choices=["improved", "worsened", "unchanged", "mixed"])
    update.add_argument("--lesson")
    update.add_argument("--conditions")
    args = parser.parse_args()
    root = Path(os.environ.get("UX_OPPORTUNITIES_HOME") or "~/.local/share/ux-opportunities").expanduser().resolve()
    project = args.id.split("/")[0] if args.command == "feedback" else getattr(args, "project", None)
    db = open_notebook(root, project)
    try:
        if args.command == "search":
            print(encode(search(db, args.terms)))
        elif args.command == "history":
            print(encode(history(db, project)))
        elif args.command == "feedback":
            print(feedback(db, args))
        elif args.command == "save":
            print(save(db, root, args))
        else:
            run = slug(args.run)
            row = db.execute("SELECT html FROM reviews WHERE run=?", (run,)).fetchone()
            if not row:
                raise ValueError("Unknown review.")
            print(export_html(root, project, run, row[0]))
    finally:
        db.close()


if __name__ == "__main__":
    os.umask(0o077)
    try:
        main()
    except (ValueError, TypeError, KeyError, OSError, sqlite3.Error) as error:
        sys.exit(f"Notebook: {error}")
