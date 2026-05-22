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

Set the chosen mode as a variable for the rest of the workflow. If the user picks
**full**, also capture `plan_approval` — see the follow-up subsection immediately
below.

### Full-mode follow-up: skip manual plan approval?

When the user picks **full**, ask one follow-up via `AskUserQuestion`:

> The full-mode plan is reviewed by reviewer agents automatically. After that
> passes, do you want a manual approval gate before implementation, or should
> I proceed directly?

Options:
- **Block for my approval** (default) — current behavior; present the plan and wait.
- **Proceed directly to implementation** — when the idea has been discussed
  thoroughly and open questions are resolved, skip the human gate after the
  reviewer pass comes back clean.

Record this as `plan_approval = manual | auto` for Phase 3. Default to `manual`
if not asked (e.g. the user already declared their preference upthread, or the
session was compacted and the variable was lost — `manual` is the safe default).
The variable is intentionally ephemeral: it lives only in session memory between
Phase 2 and Phase 3, not in plan frontmatter. Only offer the question in full
mode; light mode handles its own opt-in for review at plan-approval time (see
Phase 3). The asymmetry is intentional: light asks at plan-approval because the
plan summary is the relevant signal for whether to add review; full asks at
sizing because by the time the plan is on screen the auto-skip is moot (the user
is already reading).

### How the mode propagates

Covers `mode` only; `plan_approval` is in-session, scoped to the follow-up
subsection above.

Mode-consuming downstream skills (`/dev:plan`, `/dev:implement`, `/dev:review-impl`)
take it as `mode=<value>` in the args string passed to the `Skill` tool, e.g.
`"<task description>; mode=light"`. `/dev:plan` defaults to `full` if missing;
`/dev:implement` and `/dev:review-impl` default to looping (the heavier
behaviour). `/dev:review-plan` ignores mode — it always runs the full
review-loop, since it is only invoked when reviewing is actually wanted.

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

- Invoke `/dev:plan` via the `Skill` tool with the chosen mode. It produces a
  **single implementation plan document**, no PRD.
- Skip `/dev:review-plan` by default. The human approval at the next step is the gate.
- Present the plan to the user with a short overview of what it contains, then ask
  via `AskUserQuestion` how they want to proceed:
  - **Approve and implement** (default) — go straight to Phase 4.
  - **Run plan reviewers first, then implement** — for when the user is content with
    the summary but wants a reviewer pass for safety. Invoke `/dev:review-plan`
    via the `Skill` tool (same call as full mode), let it loop to clean, then
    proceed to Phase 4 without a second approval gate. The review skill handles
    its own escalations to the user, so by the time it returns any open product
    questions have already been answered.
  - **Request changes** — relay feedback to `/dev:plan` or revise inline, then
    re-present.
- Once the user has chosen approve (with or without the reviewer pass), update plan
  frontmatter: `status: approved`.

### Full mode

- Invoke `/dev:plan` via the `Skill` tool with the chosen mode. It produces a PRD
  plus an implementation plan document.
- Invoke `/dev:review-plan` via the `Skill` tool immediately. Do not ask permission
  first; review is part of planning. Pass the plan directory path
  (`docs/design/plans/<task>/`) in the args. The skill loops until clean.
- Branch on `plan_approval` (set in Phase 2):
  - **`manual`** (default) — present the polished, reviewed plan to the user.
    Wait for explicit approval.
  - **`auto`** — present a one-line acknowledgement that reviewers converged
    and auto-proceed is in effect, then continue directly to Phase 4 without
    an `AskUserQuestion`. The review skill already handles its own
    escalations, so reaching this point means reviewers converged without an
    unresolved product question.
- Once approved (or auto-proceeded), update plan frontmatter: `status: approved`.

## Phase 4: Implement + Review

Invoke `/dev:implement` via the `Skill` tool. The implement skill runs the worker
loop (dispatching per-step work to stateless `dev:coordinator:implement-worker`
agents), runs the review checkpoints, and returns when implementation is complete
or it hits a blocker.

Pass in the skill args:

- The mode (`minimal`, `light`, or `full`).
- **Light, full**: the plan directory path (`docs/design/plans/<task>/`) plus the
  plan filename, and the task slug for the journal path.
- **Minimal**: the in-session plan from `ExitPlanMode` inlined as text. There is no
  plan document on disk in minimal mode.
- A short reminder of the task intent.

Mode-specific behavior is handled inside the implement skill:

- **Minimal**: no test-reviewer checkpoint at all; run a single comprehensive review
  at the end (one round, no loop) by invoking `/dev:review-impl` via `Skill` with
  `mode=minimal`.
- **Light**: skip the test-reviewer checkpoint if no new tests; run the full review
  loop at the end via `/dev:review-impl` with `mode=light`.
- **Full**: test-reviewer after the worker loop completes (when tests were written),
  then full review loop via `/dev:review-impl` with `mode=full`.

If the skill returns cleanly, proceed to Phase 5.

If the skill yields with a blocker (user question, real plan problem), follow the
standard escalation pattern: relay the issue, gather the user's answer, then
re-invoke `/dev:implement` to resume from on-disk state (plan checkboxes,
journal, and commits all persist between invocations).

## Phase 5: Update Documentation

Handled inside the implement skill body:
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

- **Minimal**: skip. Issues journals are usually empty for trivial tasks, and
  there is no plan directory holding scratch files to clean up.
- **Light, Full**: run `/dev:learn` to process any issues logged during
  implementation. `/dev:learn` deletes `worker-logs/` (intentionally ephemeral).

## Phase 8: Complete

- Update plan frontmatter (light, full): `status: implemented`.
- Update the project plan (see CLAUDE.md for location): check off the completed item.
  Only applies if the task corresponds to a plan entry.
- Run `/dev:prepare-pr` to create the PR — except in minimal mode, where direct-to-main
  is allowed if the repo's policy permits it (check the project CLAUDE.md). If the
  repo requires PRs for all changes, run `/dev:prepare-pr` even in minimal mode with
  a single-commit branch.

## Important

- **Never skip human checkpoints unless the user explicitly opted out.** Wait for
  explicit approval at task confirmation, sizing (implicit via AskUserQuestion),
  plan approval (light, full), and verification. The full-mode plan-approval gate
  is the only one that can be waived — and only when the user picked
  `plan_approval = auto` in Phase 2. Light-mode "Run reviewers first, then
  implement" is not a skipped gate: the user's choice of that option *is* the
  approval; there's just no second gate after the reviewer pass. Verification is
  never auto-skipped.
- **Log issues as they occur** during implementation to
  `docs/design/plans/<task>/issues.md` (light, full only — minimal has no plan dir).
  `/dev:learn` consumes this file and renames it to `issues-processed.md` afterwards.
- If you're unsure about a decision, ask the user rather than guessing.
