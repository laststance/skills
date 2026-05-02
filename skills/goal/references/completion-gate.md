# Completion Gate — Adversarial Review

Run this gate every time pursuit looks done. Failing the gate means: not
done, keep working. Do NOT declare achievement before the gate passes.

## Step 1 — Evidence collection

For each criterion in `goal.json.criteria`, attach concrete evidence to
the criterion's `evidence` field. Update `goal.json` accordingly.

**Required evidence shapes:**

| Criterion type     | Evidence shape                                  |
|--------------------|-------------------------------------------------|
| Run-and-check      | Captured stdout/stderr + exit code              |
| File-content check | File path:line numbers + the content excerpt   |
| Artifact produced  | Path, byte size, sha256 (if non-trivial)        |
| API response       | Endpoint + response body (sanitized) + status   |

If a criterion's evidence is `null` or "manually verified, looks good":
that's not evidence. Re-run the actual check and capture output.

## Step 2 — Adversarial review

Run ONE of these reviewers, in order of preference:

### 2a. `codex review` CLI (preferred when available)

```bash
if command -v codex >/dev/null 2>&1; then
  codex review
fi
```

If codex review reports any concern, treat as a violation. Do not
override its judgment without strong evidence.

### 2b. Spawn adversarial reviewer agent (fallback)

Use the Task tool:

```
Task({
  description: "Adversarial review for goal completion",
  subagent_type: "general-purpose",
  prompt: <<<EOF
You are an adversarial reviewer. Be skeptical. Your job is to find
ANY criterion that is not actually satisfied, or any way the evidence
does not actually prove the criterion.

Objective:
<verbatim from goal.json.objective>

Criteria with evidence:
1. check: <criterion 1 check>
   pass_when: <pass condition>
   evidence: <evidence captured>
2. ...

For each criterion, report:
- Is the evidence specific and concrete? (file:line, command output, etc.)
- Does the evidence actually demonstrate `pass_when` is met?
- Is there any way the criterion could be unsatisfied that is not
  ruled out by the evidence?
- Are there obvious adjacent failures the criteria did not specify
  but that the user clearly wanted (e.g., regressions in tests not
  listed)?

Report VIOLATIONS with specifics, or PASS if you find none.
EOF
})
```

Treat any violation as failure.

### 2c. Self-adversarial fallback (only if 2a and 2b unavailable)

For each criterion:
1. Explicitly enumerate ≥2 ways the criterion could be unsatisfied.
2. Check each against the evidence.
3. Explicitly enumerate ≥1 way the evidence might be misleading.
4. Check it.

This is the weakest form. Only use if Task tool and codex are both
unavailable.

## Step 3 — Verdict

### Pass

All criteria have concrete evidence AND adversarial review found no
violations. Then:

1. Set `goal.json.status = "achieved"` and `goal.json.completed_at = <ISO-8601>`.
2. Write the final evidence summary to the user as a single message:
   - Objective
   - Each criterion + its evidence (one-line per criterion)
   - Reviewer used (codex / agent / self) + result
   - Time elapsed and any concerns logged during pursuit
3. Exit pursuit mode. Do not continue working unless the user gives
   a new instruction.

### Fail

Any of: missing evidence, weak evidence, reviewer found violations.

1. Log the violations to concerns destination (R4 format).
2. Fix the violations (continue work).
3. Re-run the completion gate from Step 1.

Do NOT mark the goal achieved with known violations. Do NOT mark it
"partially achieved" — the status field is binary active/achieved/abandoned.
If the criteria turn out to be wrong, abandon (`/goal clear`) and
restart with new criteria.
