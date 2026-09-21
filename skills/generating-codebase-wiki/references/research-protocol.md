# Research protocol

Do not write HTML until this protocol produces `research-notes.md`. Guessing from folder names is the #1 cause of review Fail.

## 1. Surface map (30–90 minutes of tool use, not a glance)

From repo root:

```bash
# layout
ls -la
# ignore noise
find . -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.php' -o -name '*.rs' -o -name '*.go' \) \
  -not -path './.git/*' -not -path './node_modules/*' -not -path './.next/*' -not -path './dist/*' \
  | head -400
```

Read, in order:

1. `README.md`, `CLAUDE.md` / `AGENTS.md`, `SPEC.md` if present — as **claims to verify**, not as truth
2. Root manifest (`package.json`, `go.mod`, `composer.json`, …) — scripts, workspaces, real deps
3. App entry: `_app.tsx` / `layout.tsx` / `main.ts` / `index.php`
4. Router table: `src/pages/**`, `app/**`, `routes/**`
5. Config: next.config, env example (names only; never copy secrets into the wiki)

## 2. Subsystem cut

Cluster the tree into **5–12 subsystems** a new engineer must understand (auth, data, a domain feature, build). For each:

- Entry file(s)
- Public surface (routes, hooks, exported types)
- 2–5 implementation files you will **open fully** (not grep-only)
- Dependents (who imports it)

Prefer Serena `get_symbols_overview` / `find_symbol` on those files. If Serena is unavailable, Read the file bodies.

## 3. Runtime story

Answer in writing:

1. What happens on first paint / request?
2. Where does auth attach?
3. Where does data enter (query, fetch, ORM) and who owns cache?
4. What is the core domain write path (create X)?
5. What is explicitly *not* in this repo (separate API, worker, CMS)?

Each answer must name a function and a path.

## 4. Design decisions

Find ≥3 non-obvious choices (why Pages Router, why RHF+zod, why Redux, why RLS). Source: comments, ADRs, tests, git log messages. Record trade-off in one sentence + citation.

## 5. `research-notes.md` template

```markdown
# Research notes — <repo>

## Product in one sentence
## Runtime (first request / first paint)
- step → `symbol` (`path:line`)

## Subsystems
### <Name>
- Entry:
- Symbols:
- Files read:
- Dependents:

## Outline (numbered)
1 Overview
1.1 ...
...
G Glossary

## Decisions
1. Chose X over Y because Z — `path:line`

## Citation ledger (must grow while writing)
- claim → `path:start-end` (verified; first line quoted)
- mermaid node `Token` → `path:start-end` (token found on line N)

Follow `cite-write.md`: one sentence → one cite; mermaid labels contain only in-span identifiers.
```

Completion criterion: every outlined page has ≥1 subsystem with **opened** files and ≥3 named symbols. Overview cites the manifest and the real entry module.
