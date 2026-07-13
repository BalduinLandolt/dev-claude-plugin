---
name: implement
description: Execute an approved implementation plan — dispatch per-step work to stateless implement-worker subagents, manage commits, run review checkpoints. Adapts its ceremony to the task rather than to a fixed tier.
argument-hint: "[path to approved plan, or inline sketch for a trivial change]"
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

Execute the approved work. You own the loop: read the plan, dispatch per-step
work to stateless `dev:coordinator:implement-worker` agents, manage commits at
review-unit boundaries, and run review checkpoints. Workers write the code; you
own the loop and the git state.

There are no tiers. The one axis that changes behaviour is **whether a plan
directory exists** on disk:

- **Plan-backed task** (`docs/design/plans/<task>/` with a plan document) — the
  normal case. Use the plan; keep an issues journal there; check steps off.
- **Sketch-backed task** (no plan directory; the orchestrator inlined a short
  plan in your args) — a trivial change the orchestrator judged not worth a plan
  document. No journal, no checkboxes; pass the inlined sketch to the worker as
  its **Step**. Skip developer-doc churn unless the change is genuinely
  surface-area-changing.

Everything else below applies to both; the deltas are called out inline.

## Setup

Setup is **idempotent** — the orchestrator may re-invoke `/dev:implement` to
resume after a yield, so each step handles the artefact already existing.

1. Read the approved plan (skip for a sketch-backed task — work from the inlined
   sketch).
2. Branch: if a feature branch matching the task's expected name already exists,
   `git checkout` it; otherwise create it (see `docs/process/GIT_WORKFLOW.md`).
   For a trivial change the repo allows direct-to-main for (per project
   CLAUDE.md), staying on `main` is acceptable.
3. Issues journal (plan-backed only): create an empty
   `docs/design/plans/<task>/issues.md` if absent; leave a partially-filled one
   in place to append to.

## Per-step worker loop

Per-step work runs in stateless `dev:coordinator:implement-worker` subagents. You
do not write code yourself. For each plan step (or a tight batch of related
sub-steps forming one logical change), spawn a worker with a prompt that
populates every field in the worker's Input section
(`agents/coordinator/implement-worker.md`): step description, file paths, test
command, conventions, journal path (or "no journal"), and the plan path when one
exists.

**Keep steps small.** A worker is a single-pass executor — if a step needs many
iterations to land, or a worker keeps returning `partial`, the step was too big.
Split it and re-dispatch rather than letting one worker grind. (Oversized steps
driving long worker loops were a measured cost sink.)

The worker writes tests, writes code, runs tests, logs issues, and returns a
~200-word report. Workers do not commit, branch, or spawn other agents.

After each worker returns:

1. **`complete`** → check off the step in the plan (plan-backed only). Continue.
2. **`blocked`** → decide:
   - a question for the user → escalate via `AskUserQuestion`, then spawn a fresh
     worker with the answer;
   - a gap you can resolve (re-read the plan, refine the step) → resolve, respawn;
   - a real plan problem → return `blocked` to the orchestrator.
3. **`partial`** → treat as not done; spawn another worker to finish or split the
   step.

If the project uses behavioral specs (check CLAUDE.md), run `/allium:propagate`
once per cluster of test-adding steps to find coverage gaps, and fill them via
another worker. The final `/allium:weed` runs before the review checkpoint.

## Commit cadence

**Commit at review-unit boundaries, not per plan step.** Several steps that build
one feature usually belong in a single `feat(X): …` commit; aim for ~3–5 commits
on a typical PR under rebase-merge. Use `git commit --fixup=<sha>` the moment you
realise you're amending earlier work — `prepare-pr` autosquashes it later. Follow
the project's git-hygiene conventions.

## Issues journal (plan-backed only)

Workers append entries during execution. You also log **process friction** they
can't see — a step you had to refine mid-loop, a worker that needed 2–3 spawns, a
missing convention file that left a reviewer underpowered. Use the worker's entry
format with `**Category**: process`. Workers write overflow detail (long traces,
big diffs) to `docs/design/plans/<task>/worker-logs/step-<id>.md`; read those only
if you need the detail to decide — `/dev:learn` deletes the directory later.

## Review checkpoints

Run after the worker loop completes, not interleaved.

- **Test-reviewer** (when the loop wrote new tests): spawn the test reviewer once
  — prefer a project-local `test-reviewer` (bare name, from
  `.claude/agents/review/`) if it exists; otherwise spawn the plugin's
  `dev:test-reviewer`. Pass it the plan and the test files. Fix Critical/Warning
  findings via a worker or a small inline edit. Do not loop. Skip if no new tests.
- **Final review**: invoke `/dev:review-impl` via the `Skill` tool. It resolves
  the reviewer set, fans out (isolated), verifies findings, and loops to clean on
  its own — it judges its own depth from the change, so pass no mode. Run
  `/allium:weed` first if the project uses specs and the change touches a spec'd
  area.

Reviews run automatically — do not ask permission; review is part of
implementation. Return only when the loop is done and reviews have converged.

## Documentation

After the code is done and reviewers are clean, update documentation **in
proportion to what changed** (see CLAUDE.md for locations):

- **Developer docs** — if the task introduced, removed, or restructured
  developer-facing surface area (a module, a public API), create or update the
  relevant page. A tiny change needs none.
- **User guide** — if the change is user-visible (a screen, a workflow, a fixed
  bug the user could see), update it. Purely internal changes need none.

## Completion

When steps are done, reviewers are clean, and docs are updated:
- Run the project's test, lint, and format-check commands one final time.
- Return to the orchestrator, which presents the diff for human verification.
