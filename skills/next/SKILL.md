---
name: next
description: Start working on the next task. Either picks the next item from the project plan, or works on a task description provided as an argument. Sizes the work and runs the appropriate workflow tier.
argument-hint: "[optional task description]"
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

# Next Task Workflow

You are the **orchestrator**. Run the appropriate workflow tier for the next task.

## Phase 1: Investigate

Run the `/dev:investigate` skill.

- **No argument given** → investigate scans the project plan and proposes the next item.
- **Argument given** → investigate scopes the user-provided task: looks for related code,
  reads relevant docs, sketches what the work would entail, and proposes it. Skip the
  "find next plan item" step entirely.

In the argument-given case, `/dev:investigate` proposes whether the task should be added
to the project plan (with reasoning). Your job here is to *relay that proposal* and
confirm it with the user via `AskUserQuestion`. Don't re-make the judgment — investigate
already has the research context. Just present the proposal and the reasoning, and let
the user accept or override.

Once both the task and the plan-entry decision are confirmed, **record both as
variables** for later phases:

- `task_description` — the agreed task.
- `plan_entry` — either `<plan-item-number>` (if added) or `none` (if ad-hoc).

Phase 8 reads `plan_entry` to decide whether to check off a plan item. Recording it
explicitly avoids losing the decision to session compaction.

Wait for user approval of the task and plan-entry decision before proceeding.

## Phase 2: Size the Work

Once the task is approved, estimate the size and propose a workflow mode. Use
`AskUserQuestion` with three options:

- **minimal** — quick fix or trivial change. Use Claude Code's built-in plan mode
  (no `/dev:plan` document), implement, single commit. PR or direct-to-main depending
  on the repo's policy.
- **light** — normal small feature or focused change. Single implementation plan
  document, no PRD, no plan review (the human approval gate covers it). Implement
  with the standard review checkpoints. Single PR commit unless the work
  legitimately needs more.
- **full** — substantial work. PRD + implementation plan, full plan review loop,
  full implement-and-review pipeline, learn phase, multiple commits as needed.

Make a recommendation based on what investigate found. Phrase it as
"this looks like a <tier> task — go <tier>?" and let the user override.

Set the chosen mode as a variable for the rest of the workflow.

### How the mode propagates

- For skills (`/dev:plan`): pass mode as `mode=<value>` in the args string, e.g.
  `"<task description>; mode=light"`. The plan skill defaults to `full` if the
  arg is missing.
- For coordinator agents (`dev:coordinator:implement-coordinator`,
  `dev:coordinator:review-plan-coordinator`, `dev:coordinator:review-impl-coordinator`):
  pass mode in the agent's prompt; the coordinator forwards it to the underlying
  skill internally.
- **Use the full namespaced name when spawning plugin coordinators.** Bare names
  (`implement-coordinator`, `review-plan-coordinator`) fail because the loader
  namespaces plugin-provided agents under `dev:<category>:`.

### Recording the mode persistently

In **light** and **full** modes, the mode lives in the plan document frontmatter
(`mode: light | full`), so it survives session compaction.

In **minimal** mode, there is no plan document. To make the mode recoverable from git
state, name the implementation branch `minimal/<slug>` (rather than `feat/<slug>` or
similar). If working direct-to-main is allowed and chosen, the mode lives only in
session memory — acceptable for trivial fixes that complete in one session, but if the
session breaks, restart from `/dev:next`.

## Phase 3: Plan + Approve

### Minimal mode

- Enter Claude Code's built-in plan mode. Sketch the changes you'll make.
- Exit plan mode (the user approves or rejects via the native ExitPlanMode flow).
- No plan document is written. Skip directly to implementation.

### Light mode

- Run `/dev:plan` with the chosen mode. It will produce a **single implementation
  plan document**, no PRD.
- Skip `/dev:review-plan` entirely. The human approval at the next step is the gate.
- Present the plan to the user. Wait for explicit approval before implementing.
- Once approved, update plan frontmatter: `status: approved`.

### Full mode

- Run `/dev:plan` with the chosen mode. It will produce a PRD plus an implementation
  plan document.
- Spawn the `dev:coordinator:review-plan-coordinator` agent immediately. Do not ask
  permission first; review is part of planning. Pass the plan directory path
  (`docs/design/plans/<task>/`) explicitly in the agent's prompt — the coordinator
  needs it to invoke `/dev:review-plan` correctly. The coordinator runs the skill in
  its own context, loops until clean, and returns a structured summary. You only see
  the summary, not the per-reviewer findings or fix history.
- Present the polished, reviewed plan to the user along with the coordinator's
  summary. Wait for explicit approval.
- Once approved, update plan frontmatter: `status: approved`.

## Phase 4: Implement + Review

Spawn the `dev:coordinator:implement-coordinator` agent. Do not invoke `/dev:implement`
directly — the coordinator runs the implement loop in its own context, dispatches
per-step work to stateless workers (`dev:coordinator:implement-worker`), runs the
review checkpoints, and returns a structured summary. The orchestrator (you) only sees
that summary, not the per-step worker reports, journal entries, test output, or
reviewer findings.

Pass in the agent's prompt:

- The mode (`minimal`, `light`, or `full`).
- **Light, full**: the plan directory path (`docs/design/plans/<task>/`) plus the
  plan filename, and the task slug for the journal path.
- **Minimal**: the in-session plan from `ExitPlanMode` inlined as text. There is no
  plan document on disk in minimal mode.
- A short reminder of the task intent.

Mode-specific behavior is handled inside the coordinator (via the implement skill):

- **Minimal**: no test-reviewer checkpoint at all; run a single comprehensive review
  at the end (one round, no loop) via `dev:coordinator:review-impl-coordinator` with
  `mode=minimal`.
- **Light**: skip the test-reviewer checkpoint if no new tests; run the full review
  loop at the end via `dev:coordinator:review-impl-coordinator` with `mode=light`.
- **Full**: test-reviewer after the worker loop completes (when tests were written),
  then full review loop via `dev:coordinator:review-impl-coordinator` with
  `mode=full`.

Read the summary. If status is `complete`, proceed to Phase 5.

If status is `yielded` or `blocked`, follow the named next action. The one
non-obvious recipe: `next-action=run-final-review` (fallback for a rejected
deep spawn at the final review checkpoint) — spawn
`dev:coordinator:review-impl-coordinator` yourself with the same mode and plan
path; on clean, proceed to Phase 5; on unclean, surface findings to the user
and pause. For other yields (user questions, real blockers), follow the
standard escalation pattern: relay, gather the user's answer, then either
re-spawn the implement-coordinator to resume from on-disk state or pause if
the issue can't be resolved without further input.

Only present the result to the user when implementation is complete and reviewers
are clean.

## Phase 5: Update Documentation

Handled inside the implement-coordinator (via the implement skill body):
- Update developer documentation as specified in CLAUDE.md.
- If user-facing changes, update user guide as specified in CLAUDE.md.
- Skip in minimal mode unless the change is genuinely user-visible.

## Phase 6: Human Verification

Ask the user to:
- Review the code changes.
- Review the documentation updates (if any).
- Manually test the app if applicable.
- Confirm the implementation is acceptable.

## Phase 7: Learn

- **Minimal**: skip. Issues journals are usually empty for trivial tasks.
- **Light, Full**: run `/dev:learn` to process any issues logged during implementation.

## Phase 8: Complete

- Update plan frontmatter (light, full): `status: implemented`.
- Update the project plan (see CLAUDE.md for location): check off the completed item.
  Only applies if the task corresponds to a plan entry.
- Run `/dev:prepare-pr` to create the PR — except in minimal mode, where direct-to-main
  is allowed if the repo's policy permits it (check the project CLAUDE.md). If the
  repo requires PRs for all changes, run `/dev:prepare-pr` even in minimal mode with
  a single-commit branch.

## Important

- **Never skip human checkpoints.** Wait for explicit approval at task confirmation,
  sizing (implicit via AskUserQuestion), plan approval (light, full), and verification.
- **Log issues as they occur** during implementation to
  `docs/design/plans/<task>/issues.md` (light, full only — minimal has no plan dir).
  `/dev:learn` consumes this file and renames it to `issues-processed.md` afterwards.
- If you're unsure about a decision, ask the user rather than guessing.
