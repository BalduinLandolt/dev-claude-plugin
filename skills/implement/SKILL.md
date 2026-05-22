---
name: implement
description: Execute an approved implementation plan — dispatch per-step work to stateless implement-worker subagents, manage commits, run review checkpoints. Adapts to the workflow mode (minimal, light, full).
argument-hint: "[path to approved plan]; mode=<minimal|light|full>"
allowed-tools:
  - Glob
  - Grep
  - Read
  - Write
  - Edit
  - Bash
  - Agent
  - AskUserQuestion
  - Skill
  - TaskCreate
  - TaskUpdate
---

# Implement

Execute the approved implementation plan. The orchestrator passes the workflow `mode`,
which adjusts review depth, documentation expectations, and the issues journal.

You own the implementation loop: read the plan, dispatch per-step work to stateless
`dev:coordinator:implement-worker` agents, manage commits at review-unit boundaries,
and run review checkpoints. Workers write the actual code; you own the loop and the
git state.

## Setup

Setup is **idempotent** — the orchestrator may re-invoke `/dev:implement` to
resume after a yield or a user redirect, so each step here must handle the
case where the artefact already exists.

1. Read the approved plan (skip in **minimal** mode — there is no plan document; work
   from the in-session plan that the orchestrator inlined in your args).
2. Branch: if a feature branch matching the task's expected name already exists
   (`<type>/<number>-<slug>` in light/full mode, `minimal/<slug>` in minimal
   mode), `git checkout` it. Otherwise create it (see docs/process/GIT_WORKFLOW.md).
   In minimal mode, if the repo allows direct-to-main (per project CLAUDE.md),
   stay on `main` instead.
3. Issues journal: if `docs/design/plans/<task>/issues.md` already exists, leave
   it in place — partially-filled journals from a prior invocation are picked up
   as-is and appended to. Otherwise create an empty one. **Skip in minimal
   mode** — minimal tasks are not worth the journal overhead.

## Execution

**When touching frontend files**, follow the project's architecture conventions (see
`.claude/conventions/architecture.md` if it exists, or `docs/process/CODING_CONVENTIONS.md`).

Per-step work runs in stateless `dev:coordinator:implement-worker` subagents. You do
not write code yourself; you spawn a worker for each plan step (or tight batch of
related sub-steps that form one logical change), read its structured report, and
decide what to do next. Worker contexts are discarded after each return — pass them
everything they need in the prompt.

### Minimal mode at a glance

Minimal mode is the same loop with the heavy artefacts stripped. The deltas
(referenced inline through the rest of this skill) are:

- No plan document on disk; the orchestrator inlined the in-session plan in your
  prompt. Pass an excerpt to each worker as the **Step** field.
- No issues journal (`Journal path: no journal` in worker prompts).
- No plan-checkbox updates after a worker reports `complete`.
- No test-reviewer checkpoint (test review folds into the final review pass).
- Direct-to-main allowed if the project CLAUDE.md permits it.
- `/allium:weed` skipped.
- Developer-doc updates skipped unless the change is genuinely surface-area-changing.

### Per-step worker loop

For each plan step, spawn `dev:coordinator:implement-worker` with a prompt that
populates each field listed in the worker's Input section
(`agents/coordinator/implement-worker.md`). At minimum: step description, file
paths, test command, conventions, journal path, mode, and the plan path in light
or full mode.

The worker writes tests, writes code, runs tests, logs issues to the journal, and
returns a ~200-word report (status, files changed, tests, summary, blockers, issues,
side notes). Workers do not commit, do not spawn other agents, and do not ask the
user questions.

### Reading the worker report and deciding next

After each worker returns:

1. **If `status=complete`**: check off the corresponding step in the plan document
   (skip in minimal mode — no plan doc). Continue.
2. **If `status=blocked`**: decide.
   - The blocker is a question for the user → escalate via `AskUserQuestion`. Once
     answered, spawn a fresh worker with the corrected prompt.
   - The blocker is a missing piece you can resolve (re-read the plan, gather more
     context, refine the step description) → resolve, then spawn a fresh worker.
   - The blocker is a real plan problem → return to the spawning agent with status
     `blocked` so the orchestrator can intervene.
3. **If `status=partial`**: treat the step as not yet done. Decide whether to spawn
   another worker to finish it or yield.

### Test coverage check (light, full)

If the project uses behavioral specs (check CLAUDE.md), run `/allium:propagate`
periodically (after a worker reports tests added) to identify coverage gaps. Fill any
gaps via another worker invocation. Do not run `/allium:propagate` after every step —
once per cluster of test-adding steps is enough. The final `/allium:weed` runs before
the review-impl checkpoint, separately.

### Commit cadence

**Commit at review-unit boundaries, not per plan step.** Several plan steps that
build up one feature (deps, module skeleton, types, template, tests) usually
belong in a single `feat(X): introduce X` commit. Aim for ~3-5 commits on a
typical task PR under rebase-merge; under squash-merge, granularity matters
less. Follow the project's git-hygiene conventions (project CLAUDE.md, the
`docs/process/GIT_WORKFLOW.md` doc, or the user's global preferences) for the
specifics of `--fixup`, `--amend`, and autosquash usage.

### Issue journal

Workers append entries directly during execution. The journal captures **both
code issues and process friction**. Code issues are the obvious case (bugs,
test failures, follow-up work). Process friction is harness-level pain — the
input to `/dev:learn`'s agent/skill-bug and discoverability-gap triage.

You see process friction the worker can't: a worker that needed 2-3 spawns
before a step landed, a step description you had to refine mid-loop, a
missing convention file that left a reviewer underpowered, a recurring
blocker pattern across multiple workers. Log those yourself — they do not
surface in any single worker's report.

Append manually using the same entry format as workers:

```markdown
## Issue: [short description]
**Category**: code | process
**When**: [during which step or phase]
**Files**: [paths involved — omit if not applicable]
**What happened**: [description]
**What I tried**: [approaches attempted]
**Resolution**: [how it was resolved, or "unresolved"]
```

Workers also write longer detail (test failure traces, large diff summaries) to
`docs/design/plans/<task>/worker-logs/step-<id>.md` when their report's main body
would otherwise blow past the 200-word cap. Read those files if you need the
detail to make a decision; otherwise leave them for `/dev:learn`, which deletes
the directory at commit time.

## Review Checkpoints

Review checkpoints run after the per-step worker loop completes, not interleaved
with it. Behavior depends on mode.

### Minimal mode

- **No test-reviewer checkpoint.** Minimal tasks usually don't introduce new tests;
  if they do, the test review is folded into the final review.
- **One final review pass** when the worker loop has finished: invoke
  `/dev:review-impl` via the `Skill` tool with `mode=minimal` in the args. It
  runs round 1 only (because of the mode) and returns. Apply any fixes it
  surfaces.
- Skip the `/allium:weed` step.

### Light and full modes

The two modes share the same checkpoint structure; only the `mode=` arg passed
to `/dev:review-impl` differs.

- **Test-reviewer checkpoint** if the loop produced new tests. Spawn the
  `test-reviewer` agent (project-local, from `.claude/agents/review/`, addressed
  by bare name). Pass it the plan and the list of test files. Fix Critical or
  Warning findings via a worker spawn or a direct edit for tiny ones. Do not
  loop. Skip if no new tests.
- **Final review** when the test-reviewer checkpoint (if any) is clean: invoke
  `/dev:review-impl` via the `Skill` tool with `mode=light` or `mode=full` in
  the args. It runs the full review-impl loop and returns when clean.
- Run `/allium:weed` before the final review if the project uses behavioral
  specs and the change touches a spec'd area.

In all modes, reviews run automatically — do not ask permission first; review is
part of implementation. Only return when the worker loop is done and the
relevant reviews have converged.

## Developer Documentation

After implementation is complete and reviewers are clean, update the project's developer
documentation (see CLAUDE.md for location):

- If this task introduced a new module or subsystem, create a new page.
- If this task modified an existing area, update the corresponding page.
- Describe what the code does, how it fits together, and key decisions made.
- This is descriptive documentation — reflect what was built, not the plan.

**Minimal mode:** skip developer documentation updates unless the task genuinely
introduced, removed, or restructured developer-facing surface area (a new module, a
removed module, a changed public API). Minimal tasks are typically too small to warrant
doc churn.

## User Guide

If the task changes user-facing behavior (new screens, changed workflows, new features
visible to the user), update the user guide as specified in CLAUDE.md. Skip this step for
purely internal changes (backend refactoring, test infrastructure, etc.).

**Minimal mode:** still applies if the change is genuinely user-visible (a fixed bug
the user could see, a tweaked label). Otherwise skip.

## Completion

When all plan steps are done, reviewers are clean, and documentation is updated:
- Run the project's test, lint, and format-check commands one final time (see CLAUDE.md).
- Return to the orchestrator. The orchestrator presents the diff and the
  outcome to the user for human verification.
