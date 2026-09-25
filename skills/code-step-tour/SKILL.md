---
name: code-step-tour
description: >
  Build a step-through sequence tour of a real code path: a file tree on the
  left, one sequence arrow per click, and the functions or callbacks that run
  on that step. Use when the user asks for a sequence diagram they can advance
  one step at a time, a file tree beside a call flow, or 「ステップで進める」
  「ファイルツリー付きのシーケンス」.
disable-model-invocation: true
---

# Code step tour

Explain one code path as a self-contained HTML page. The left side is a file tree. The center is a sequence. **次のステップ** reveals one arrow. The bottom lists the file, symbol, and line that perform that step.

Do not redraw this UI. Author a JSON file, then render it with the script next to this skill.

## Trace first

Read the repository before writing JSON. Every symbol must be a function, callback, or method you opened. `line` is the 1-based line of that declaration or of the call that performs the step. If the line does not contain the symbol name, drop the symbol.

Keep one main path. Put optional, polling, or failure-only work on a later step with `"kind": "dashed"`. A response that carries an id, key, or status is its own step with `"kind": "return"`.

Use 2 to 6 actors and 3 to 12 steps. Actor ids are stable English tokens (`user`, `ui`, `api`). Labels and notes follow the user's language.

## JSON

Write `/tmp/code-step-tour/<slug>.json`:

The block below is the file shape only. Replace every symbol with one you opened in the target repository.

```json
{
  "title": "Checkout",
  "actors": [
    { "id": "user", "label": "Shopper", "sub": "browser", "color": "#6b7280" },
    { "id": "ui", "label": "Checkout form", "sub": "web app", "color": "#1976d2" }
  ],
  "steps": [
    {
      "id": "submit",
      "from": "user",
      "to": "ui",
      "label": "Place order",
      "note": "The submit handler starts the request.",
      "symbols": [
        {
          "kind": "callback",
          "name": "onSubmit",
          "file": "src/checkout/CheckoutForm.tsx",
          "line": 40,
          "role": "Form submit handler"
        }
      ]
    }
  ]
}
```

`file` is relative to the repository root. `kind` on a symbol is a short word such as `関数` or `コールバック`. `kind` on a step is omitted for a normal call, or `return` or `dashed`.

Optional `ui` overrides the chrome: `treeHeading`, `prev`, `next`, `last`. Defaults are Japanese.

## Render

```bash
mkdir -p /tmp/code-step-tour
node "<this-skill-dir>/scripts/render-step-tour.mjs" \
  /tmp/code-step-tour/<slug>.json \
  /tmp/code-step-tour/<slug>.html
open /tmp/code-step-tour/<slug>.html
```

`<this-skill-dir>` is the directory that contains this `SKILL.md`. The script checks actor ids, step bounds, and that every symbol has `kind`, `name`, `file`, an integer `line`, and `role`. A non-zero exit is a failed tour. Fix the JSON and run it again.

Then tell the user the HTML path, how to move (next, previous, arrow keys, clicking an arrow or a file), and which code path the steps cover.
