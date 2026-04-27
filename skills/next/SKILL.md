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

### How the mode propagates to downstream skills

When you invoke `/dev:plan`, `/dev:implement`, or `/dev:review-impl` via the Skill tool,
include the mode in the args string using the convention `mode=<value>`. Examples:

- `/dev:plan` with args: `"<task description>; mode=light"`
- `/dev:implement` with args: `"<path to plan>; mode=full"` (or, in minimal mode where
  there is no plan path, `"mode=minimal"`)
- `/dev:review-impl` with args: `"mode=minimal"` (only needed for minimal — the others
  use loop semantics by default)

Each downstream skill parses `mode=<value>` from its args and adapts. If you forget the
mode, the skill falls back to its safe default (`full` for `/dev:plan`, looping
semantics for `/dev:review-impl`), which costs more but preserves coverage.

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
- Run `/dev:review-plan` immediately. Do not ask permission first; review is part of
  planning. The review skill loops internally until reviewers find no meaningful
  issues.
- Present the polished, reviewed plan to the user. Wait for explicit approval.
- Once approved, update plan frontmatter: `status: approved`.

## Phase 4: Implement + Review

Run `/dev:implement` with the approved plan (or, in minimal mode, with the in-session
plan from ExitPlanMode). The implement skill runs review checkpoints internally.

Mode-specific behavior is handled by `/dev:implement`:
- **Minimal**: skip the test-reviewer checkpoint if no new tests; run a single
  comprehensive review at the end (one round, no loop).
- **Light**: skip the test-reviewer checkpoint if no new tests; run the full
  `/dev:review-impl` loop at the end.
- **Full**: run all checkpoints — test-reviewer after tests are written, full
  `/dev:review-impl` loop after implementation is complete.

Only present the result to the user when implementation is complete and reviewers
are clean.

## Phase 5: Update Documentation

Handled by `/dev:implement`:
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
- If you're unsure about a decision, ask the user rather than guessing.
