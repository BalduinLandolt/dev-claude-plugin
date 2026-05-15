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

This skill is normally invoked inside the `dev:coordinator:implement-coordinator` agent,
which provides context isolation from the orchestrator. You (the agent running this
skill body) are referred to here as the **coordinator**: you read the plan, dispatch
per-step work to stateless `dev:coordinator:implement-worker` agents, manage commits at
review-unit boundaries, and run review checkpoints. Workers write the actual code; you
own the loop and the git state.

## Setup

1. Read the approved plan (skip in **minimal** mode — there is no plan document; work
   from the in-session plan that the orchestrator inlined in your prompt).
2. Create a feature branch: `<type>/<number>-<slug>` (see docs/process/GIT_WORKFLOW.md).
   In minimal mode, if the repo allows direct-to-main (per project CLAUDE.md), you may
   work on `main` directly; otherwise create a branch as usual.
3. Create the issues journal: `docs/design/plans/<task>/issues.md`. **Skip in minimal
   mode** — minimal tasks are not worth the journal overhead.
4. Initialise the coordinator trace: `docs/design/plans/<task>/coordinator-trace.md`.
   See **Trace log** below. **Skip in minimal mode**.

## Trace log (light, full)

Throughout the run, append structural entries to
`docs/design/plans/<task>/coordinator-trace.md`. The trace is a *post-hoc audit
record*: it lets the user (or the orchestrator) verify that you followed your
contract, recording which subagents you spawned, in what order, what they
returned. It is not user-facing narrative. It is preserved by `/dev:learn`
(committed alongside the PRD and plan) so the audit record survives in git
history; worker-logs are still deleted by `/dev:learn`, only the trace is kept.

Append a `## <ISO 8601 timestamp> — <event>` entry, with a 1-3 line body, at
each of these moments:

- **Skill start**: "implement skill started" with mode and plan path.
- **Before each `dev:coordinator:implement-worker` spawn**: "worker spawned
  for step <id>" with a one-line step description.
- **After each worker returns**: "worker returned for step <id>" with status,
  files-changed count, tests pass/fail, and blockers (if any).
- **Before the `test-reviewer` spawn** (if any): "test-reviewer spawned".
- **After test-reviewer returns**: "test-reviewer returned" with critical and
  warning counts.
- **Before the `dev:coordinator:review-impl-coordinator` spawn**:
  "review-impl-coordinator spawned" with mode.
- **After it returns**: "review-impl-coordinator returned" with status, rounds
  completed, finding counts.
- **Skill return**: "implement skill returning" with overall status.

The trace is structural, not narrative. Three lines per event is plenty.
Workers and reviewers do not write to the trace themselves — the skill body
records what it spawned and what each subagent returned. **Skip the entire
trace mechanism in minimal mode** (no plan directory).

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

You (the coordinator) see process friction the worker can't: a worker that
needed 2-3 spawns before a step landed, a step description you had to refine
mid-loop, a missing convention file that left a reviewer underpowered, a
recurring blocker pattern across multiple workers. Log those yourself — they
do not surface in any single worker's report.

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
- **One final review pass** when the worker loop has finished: spawn the
  `dev:coordinator:review-impl-coordinator` agent with `mode=minimal` in its prompt.
  The coordinator invokes `/dev:review-impl` in its own context, runs round 1 only
  (because of the mode), and returns a structured summary. You only see the summary,
  not the per-reviewer findings.
- Skip the `/allium:weed` step.

### Light and full modes

The two modes share the same checkpoint structure; only the `mode=` arg passed
to the review-impl coordinator differs.

- **Test-reviewer checkpoint** if the loop produced new tests. Spawn the
  `test-reviewer` agent (project-local, from `.claude/agents/review/`, addressed
  by bare name — no coordinator wrapper, since this is a single-round
  single-reviewer call and the isolation overhead isn't earned). Pass it the
  plan and the list of test files. Fix Critical or Warning findings via a
  worker spawn or a direct edit for tiny ones. Do not loop. Skip if no new
  tests.
- **Final review** when the test-reviewer checkpoint (if any) is clean: spawn
  `dev:coordinator:review-impl-coordinator` with `mode=light` or `mode=full` in
  its prompt. It runs the full review-impl loop in its own context and returns
  a structured summary.
- Run `/allium:weed` before the final review if the project uses behavioral
  specs and the change touches a spec'd area.

In all modes, reviews run automatically — do not ask permission first; review is
part of implementation. Only return to the spawning agent when the worker loop is
done and the relevant reviews have converged. The orchestrator (one level up,
outside this skill) presents the implement-coordinator's structured summary
alongside the diff to the user.

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
- Return. The implement-coordinator (one level out) produces its summary and the
  orchestrator presents it alongside the diff for human verification.
