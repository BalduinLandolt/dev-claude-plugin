---
name: next
description: Start working on the next task — either the next item from the project plan, or a task given as an argument. Runs one adaptive workflow, sizing the ceremony to the task rather than picking a fixed tier.
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

You are the **orchestrator**. Run one adaptive workflow for the next task. You
decide how much ceremony each optional point needs; the user confirms the overall
shape once (surface-and-veto) and holds a few unconditional gates.

## Phase 1: Investigate

Run the `/dev:investigate` skill.

- **No argument** → investigate scans the project plan and proposes the next item.
- **Argument given** → investigate scopes the user-provided task and proposes
  whether it should be added to the project plan. Relay that proposal and confirm
  it with the user via `AskUserQuestion`; don't re-make the judgment — investigate
  has the research context.

Record two things for later phases (explicit, so they survive compaction):
- `task_description` — the agreed task.
- `plan_entry` — `<plan-item-number>` if added to the plan, or `none` if ad-hoc.
  Phase 8 reads this to decide whether to check off a plan item.

Wait for user approval of the task and the plan-entry decision before proceeding.

## Phase 2: Decide the shape (surface-and-veto)

Judge what the task actually needs and state your plan of attack in **one**
`AskUserQuestion`, so the user can adjust up or down before you commit. Cover the
optional points as a coherent bundle:

- **Plan artefact** — a plan document (plus a PRD when the task has behavioural
  complexity: state transitions, invariants, non-trivial acceptance criteria), or,
  for a trivial change, an in-session sketch with no plan document.
- **Plan review** — a reviewer pass on the plan before implementing, or straight
  to approval. Warranted when the plan is substantial or risky.
- **Delivery** — a PR, or direct-to-main (only if the repo permits it and the
  change is trivial).

Recommend the bundle in plain terms — e.g. *"this looks routine: a plan document,
no PRD, no plan-review pass, deliver as a PR — go with that?"* — and let the user
override. **Honor any steer already in their prompt** ("keep it quick", "this is
load-bearing, be thorough") without re-asking. Record the confirmed shape.

## Phase 3: Plan + Approve

- **Trivial (sketch)** — use Claude Code's built-in plan mode; the user approves
  via the native ExitPlanMode flow; no plan document is written. Skip to Phase 4.
- **Otherwise** — invoke `/dev:plan` via the `Skill` tool. Tell it in the args
  whether a PRD is wanted. If the shape includes a plan-review pass, invoke
  `/dev:review-plan` via the `Skill` tool (it loops to clean) before presenting.
  Then present the plan with a short overview and **wait for explicit approval**.
  On approval, set the plan frontmatter `status: approved`.

## Phase 4: Implement + Review

Invoke `/dev:implement` via the `Skill` tool. Pass the plan directory + plan
filename (or, for a trivial change, the in-session sketch inlined as text) and a
short reminder of the task intent. Implement runs the worker loop, the review
checkpoints, and the `/dev:review-impl` loop, and returns when the work is done or
it hits a blocker.

On a blocker, follow the escalation pattern: relay the issue, get the user's
answer, then re-invoke `/dev:implement` to resume from on-disk state (plan
checkboxes, journal, and commits all persist between invocations).

## Phase 5: Documentation

Handled inside implement — developer docs and the user guide, updated in
proportion to what the change actually touched.

## Phase 6: Human verification (unconditional)

Ask the user to review the code changes and any doc updates, manually test the app
if applicable, and confirm the implementation is acceptable. **Never auto-skip
this.**

## Phase 7: Learn

If a plan directory with an issues journal exists, process it in an isolated
context: spawn `dev:coordinator:phase-runner` with **Skill** `/dev:learn` and the
task slug (plus the plan directory). Read its report; on `blocked`, resolve the
decision with the user and re-spawn. A trivial sketch-backed task has no journal —
skip.

## Phase 8: Complete

- Set plan frontmatter `status: implemented` (if a plan document exists).
- Check off the completed item in the project plan — only if `plan_entry` names one.
- Deliver: unless the Phase 2 shape chose direct-to-main (and the repo permits
  it), spawn `dev:coordinator:phase-runner` with **Skill** `/dev:prepare-pr` to
  clean history, push, and open the PR in an isolated context. Read its report for
  the PR URL; on `blocked`, resolve with the user and re-spawn, then relay the URL.

## Gates

The unconditional human checkpoints are: **task confirmation** (Phase 1), the
**shape veto** (Phase 2), **plan approval** (Phase 3, except the trivial
built-in-plan-mode path where ExitPlanMode is the approval), and **verification**
(Phase 6). Everything else is your judgment. If you are genuinely unsure about a
decision, ask rather than guess.
