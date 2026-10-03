# Output guide

Read this before writing the JSON. It is the shape of a tour that already worked: one user gesture, then the component that actually performs the work, then each network hop and its return. Apply the same shape to any codebase. Do not copy names from an old tour.

## What the page shows

- Left: a file tree. Files used by the current step are highlighted. Clicking a file jumps to the first step that uses it.
- Center: a sequence. The current arrow is strong, earlier arrows stay visible, later arrows stay faint. **次のステップ** reveals one arrow.
- Under the sequence, only on a step that has `react`: nested boxes from the outermost parent to the component that calls the hook. Props are a solid card. Context is a dashed card.
- Bottom: two to four symbols for that step, each with kind, name, `file:line`, and a one-line role.

## Actors

Use the systems that actually exchange the call. Typical set:

| id | When |
| --- | --- |
| `user` | A person starts the path |
| `ui` | The app that runs the handlers |
| `api` | A backend the app calls |
| one extra | Only if bytes or a job leave both the app and the API, such as object storage |

Four actors is enough for an upload. Do not add a box for every helper module.

Labels and notes follow the user's language. Sublabels name the role (`browser`, `modal and upload tray`), not a slogan.

## Step order

Write steps in runtime order.

1. **Enter.** `user` → `ui`. The gesture that starts the work: submit, click, or drop. Symbols: the JSX handler, the submit callback, and the function that enqueues the work.
2. **Perform.** `ui` → `api`. The component that sends the request. This is often a different component from step 1, woken by context or a queue rather than by the form.
3. **Return the handle.** `api` → `ui`, `"kind": "return"`, when the response carries a url, id, or key the next call needs.
4. **Leave the API.** `ui` → the extra actor, when the app sends bytes directly (a signed PUT). Skip this pair if the app posts the file to the API.
5. **Return success or stop.** `"kind": "return"`. Say what happens when that call fails.
6. **Commit.** `ui` → `api`. The call that registers the handle.
7. **Return the result.** `"kind": "return"`. If one response means "done" and another means "poll", say both in the note.
8. **Poll.** `"kind": "dashed"`, and only when a job id exists. Put it after the main path.
9. **Terminal return.** `"kind": "return"`. Name the status that completes and the status that fails.

Stay within 3 to 12 steps. Merge two hops only when the second carries no new handle.

## Symbols

Two to four per step:

- the component or JSX line that triggers the step
- the callback that runs
- the function that performs the I/O

`role` is one sentence about that line. `kind` is a short word in the user's language (`コンポーネント`, `コールバック`, `関数`, `hook`).

## React block

Add `react` only on a step where a component calls a hook or passes data. Do not copy the same hierarchy onto every return arrow.

- `hierarchy` is the real parent chain, outermost first: app shell, provider, layout, page, then the caller. Keep a parent that only renders `children`.
- The last node is `caller`. `hook` is the hook that caller invokes on this step. A later step may use the same caller with a different hook.
- `props`: a value written in JSX. One entry per hop (`Page` → `Modal`, then `Modal` → `Form`). Skip when the component takes no props.
- `context`: a value read with `useContext`. Name the provider component and the consumer. Do not also list that value as a prop.

If the screen has several entrances, trace one. Name that entrance in the closing sentence to the user.

## Check before render

- Every cited line contains the symbol name.
- Actor ids used in `from` / `to` exist.
- A return step uses `"kind": "return"`. Polling or failure-only work uses `"kind": "dashed"`.
- Notes say what happens, not a restatement of the label.
