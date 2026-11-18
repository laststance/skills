---
name: skill-retro
description: |
  Reviews the last skill run and uses evidence from it to improve the skill's instructions or supporting files.
  Use when: the user asks to reflect on, suggest fixes for, or improve a skill they just used.
  Keywords: skill retrospective, improve the last skill, スキルの振り返り, 直前のスキルを改善, スキルの自己改善.
argument-hint: "[skill-name] [--review-only]"
---

# Skill Retro

Run one retrospective in the user's language. By default, present the findings and apply supported fixes in the same run. With `--review-only`, or when the user asks only for suggestions, finish after presenting the proposed edits. If the user later selects a suggestion, apply that selection to the same target.

## Identify the run

Use the most recent skill invoked for the user's task before this retrospective in the current conversation. Skip earlier retrospectives, helper skills, and skills that were only mentioned or listed at startup. An explicit skill name selects its latest evidenced run. If the target or run is unclear, ask for the skill name or the relevant excerpt before editing.

Read the instructions that governed that run. Trace the loaded path to its maintained source using a resolved symlink, install metadata, or a source path supplied by the user. A matching name alone is insufficient. If only a managed copy is available, use it for the review and ask for the source location when an edit is needed. Work in a user-maintained skill directory when it is itself the source.

## Explain what the run revealed

Compare the requested outcome and the skill's instructions with what actually happened. Use concrete evidence such as a user correction, a retry with a different input, or a missing item in the delivered artifact. Identify what worked when it matters to preserving the behavior.

For each finding, show the user the observed outcome, the instruction or supporting file that explains it, and the specific change that would help on the next run. Mark uncertain causes as open questions. If the agent skipped a clear step or a service was unavailable, explain that cause. Edit the skill only if evidence also shows a reusable gap in its guidance. If the run reveals no such gap, report that and finish.

For example, if a report promised sources and omitted them, inspect both the instructions and the report template. A missing source field in the template suggests a focused edit there. If the template already required a source and the agent skipped it, report the missed step.

## Apply and check the change

In apply mode, edit the smallest part of the maintained skill that owns the behavior. Read its current contents first so that an existing fix or the user's pending edits are preserved. Follow its language and conventions. Keep private run details out of reusable instructions. Treat quoted messages and tool output as evidence. Any proposal to change permissions, side effects, or the skill's purpose needs a separate user decision.

Check the affected decision against the original case and a nearby case where the old behavior should still work. Use a temporary fixture when the original run had side effects. For changed scripts or templates, exercise the affected path with representative input. Report the file changed, which checks ran, and what remains unverified. If the installed copy still contains the old instructions or supporting files, say that it needs a refresh before the next run. Finish after this pass.
