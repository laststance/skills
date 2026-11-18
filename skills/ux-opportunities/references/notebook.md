# Local notebook

Call `python3 <skill-directory>/scripts/notebook.py` with the arguments below. Resolve the script from the installed SKILL.md directory. Python 3.9+ with its standard SQLite module is sufficient. Default storage is `~/.local/share/ux-opportunities/`. Set `UX_OPPORTUNITIES_HOME` for an isolated trial, including every command in that trial.

Choose a stable, non-sensitive lowercase project slug for this app. Reuse it across checkouts and reviews. Use a distinct slug for unrelated apps with the same name. Run slugs usually start with the date and a short task, for example `2026-04-15-recovery`. Slugs accept lowercase ASCII letters, digits and hyphens. Use a suffix for another review on the same day.

## Before drafting

- `history <project>` lists only this case's proposals with IDs, chronological feedback, and whether a result remains open. Look up the previous report with `report <project> <run>` if details matter.
- `search recovery confirmation` returns matching market evidence and de-identified feedback from across projects. Search a few English task tags regardless of report language, then try a nearby task or verb. Stable examples include `recovery`, `bulk-edit`, `selection`, `onboarding`, and `search`. Use specific terms for broader matches. An empty list is a normal first run.
- Market observations describe shipped behavior. A decision records an owner's judgment. A reported outcome records an observed effect under stated conditions. Attribute each accordingly when reusing it.

## Save a review

In a temporary working folder, write a UTF-8 HTML file and a UTF-8 JSON manifest. Copy the report starter, localize its labels, and replace its guidance comments. Put the literal marker `{{id:1}}` in visible text for proposal 1, and the corresponding marker for each additional proposal. Proposal order in the manifest is report priority. Use empty arrays when no proposal or observation is supported.

Example manifest shape (illustrative values):

```json
{
  "proposals": [{"title":"Name the recovery action", "tags":["recovery","confirmation"]}],
  "market": [{
    "source":"https://support.google.com/chrome_webstore/answer/2664769?hl=en",
    "pattern":"name-the-repair-action",
    "product":"Chrome extensions",
    "checked":"2026-04-15",
    "observation":"The extension manager offers Repair and a confirmation for a corrupt extension.",
    "conditions":"The affected item and available recovery action are already known.",
    "tags":["recovery","confirmation"]
  }]
}
```

Use the date you inspected the source. For a known source and behavior, reuse the exact source URL and stable pattern slug found by search. Rechecking refreshes the entry. A different behavior at that URL gets a different pattern slug. Private screenshots, project notes, local paths and customer names belong only in the case report. Write only public, transferable information to `market`.

Run `save <project> <run> <manifest.json> <draft.html>`. It commits evidence and proposals together, fills proposal IDs, and prints the durable local HTML path. Repeat with the same inputs to recover from an interrupted export. A changed draft needs a fresh run slug. `report <project> <run>` re-exports the committed HTML at any time. Embed images (including a private screenshot if appropriate) in the HTML so that moving it from the temporary folder preserves them.

## Record a decision or result

```text
feedback <project/run/number> "<private comment>" [--decision adopted|declined|deferred]
         [--outcome improved|worsened|unchanged|mixed]
         [--lesson "<generalized learning>" --conditions "<when this applies>"]
```

The comment, proposal ID, report, and activity history stay in the case. Add `--decision` and `--outcome` independently and only for explicit evidence. A comment alone is also valid. For transferable results (including worse results) and contextually useful rejection reasons, supply a short lesson and its conditions, written without identifying details. The shared index gets these two fields, the proposal's task tags, date and stated decision/outcome. If the feedback lacks context for a transferable lesson, retain it privately. Keep previous events when a later observation changes the conclusion.
