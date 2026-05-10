# Verifiable Success Criteria

A criterion is **verifiable** iff its truth can be settled by a concrete
check whose result is unambiguous.

## Verification methods

A criterion's `check` field must use one of:

1. **Run a command, check exit code or output**
   - `pnpm test` exits 0
   - `pnpm typecheck` reports 0 errors
   - `curl -sf https://api.example.com/health` returns 200
2. **Read a file, check content**
   - `apps/web/src/app/page.tsx` imports `<NewFeature />`
   - `package.json` `version` field is `2.0.0`
   - `.env.example` contains `STRIPE_KEY=`
3. **Produce a concrete artifact**
   - File `docs/migration.md` exists with sections X, Y, Z
   - PR URL is created and CI is green
   - Screenshot at `screenshots/feature.png` shows the new UI
4. **Inspect API response with known schema**
   - `GET /api/v2/users/1` returns `{id: number, email: string, ...}`
   - GraphQL query `Q` returns non-null `data.user`

## Pass condition format

Each criterion MUST specify what "pass" looks like:

```json
{
  "check": "pnpm --filter @app/web test",
  "pass_when": "exit code 0; no test failures in stdout",
  "evidence": null
}
```

Evidence is filled in during the completion gate.

## Good examples

```
Objective: "Migrate user auth from cookies to JWT"
Criteria:
1. check: All tests in apps/web/__tests__/auth/*.test.ts pass.
   pass_when: vitest exit 0, "0 failed" in stdout.
2. check: src/lib/auth.ts no longer references `document.cookie`.
   pass_when: `rg "document.cookie" src/lib/auth.ts` returns nothing.
3. check: New token endpoint POST /api/auth/token returns JWT.
   pass_when: response.status === 200 and response.body matches /^ey[A-Za-z0-9._-]+$/.
4. check: README "Authentication" section is updated.
   pass_when: grep -q "JWT" README.md "Authentication".
```

## Bad examples (REJECT and rewrite)

| Bad criterion              | Why it fails                  |
|----------------------------|-------------------------------|
| "Auth works correctly"     | "correctly" is unverifiable   |
| "Users are happy"          | Not measurable from code      |
| "Code is robust"           | Subjective, no pass condition |
| "Login is fast"            | "fast" needs threshold + measurement method |
| "Tests look good"          | Tests pass/fail; "look good" is opinion |

If unverifiable: ask "what concrete check would tell me this is done?"
and rewrite. If you cannot find one, the criterion does not belong.

## Number of criteria

Aim for 3-5. Fewer than 3: objective is probably trivial, may not need
this skill. More than 5: objective is too broad, split or descope.

## Tying criteria to the objective

Every criterion must contribute necessary evidence that the objective is
achieved. If you removed a criterion, the objective should be ambiguously
"done". If a criterion is "nice to have but not required", drop it.
