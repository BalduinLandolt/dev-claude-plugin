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

This subsection covers the `mode` variable specifically. `plan_approval` is
in-session only — see the follow-up subsection above for its scope.

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

## Coordinator hand-off protocol

Phase 3 and Phase 4 read compact summaries from coordinator subagents. The
orchestrator spawns `review-plan-coordinator` directly (Phase 3 full mode,
plus the optional Phase 3 light-mode reviewer pass) and `implement-coordinator`
directly (Phase 4). It also spawns `review-impl-coordinator` directly in one
narrow case: the `next-action=run-final-review` fallback in Phase 4. The
nested `review-impl-coordinator` that runs inside `implement-coordinator`'s
context is not the orchestrator's spawn — never spawn it during the normal
Phase 4 flow.

In light and full modes, every coordinator summary contains two visibility
hooks the orchestrator must surface to the user (minimal mode is the
exception — see the carve-out below). Do not compress them away when
relaying the result:

- **Run trace** (a section of broad-strokes bullets in the summary) — the
  user-facing record of what happened inside the coordinator's context:
  rounds run, reviewers invoked, worker steps completed, escalations
  resolved. Relay the bullets at each hand-off so the user sees *what
  happened*, not just *what was delivered*.
- **Coordinator trace** path (a `**Coordinator trace**: <path>` line in the
  summary) — points to `docs/design/plans/<task>/coordinator-trace.md`, a
  longer structural log appended throughout the run. Mention the path so the
  user can audit deeper if they want. The file is implementation scratch and
  is cleaned up in Phase 7 (Learn) along with `worker-logs/`; the user does
  not need to delete it manually.

Skipping either hook defeats the purpose — these hooks are the user's only
window into what happened inside the coordinator's context, since the
orchestrator never sees the per-reviewer findings or per-step worker reports
directly.

Minimal-mode behaviour: there is no plan directory, so the trace file is not
written. The `implement-coordinator` summary still arrives, but its
`Coordinator trace` field reads `n/a in minimal mode` and the Run trace
bullets are omitted by the coordinator. Surface the rest of the summary
normally; just don't try to surface either hook (there's nothing there).

## Phase 3: Plan + Approve

### Minimal mode

- Enter Claude Code's built-in plan mode. Sketch the changes you'll make.
- Exit plan mode (the user approves or rejects via the native ExitPlanMode flow).
- No plan document is written. Skip directly to implementation.

### Light mode

- Run `/dev:plan` with the chosen mode. It will produce a **single implementation
  plan document**, no PRD.
- Skip `/dev:review-plan` by default. The human approval at the next step is the gate.
- Present the plan to the user with a short overview of what it contains, then ask
  via `AskUserQuestion` how they want to proceed:
  - **Approve and implement** (default) — go straight to Phase 4.
  - **Run plan reviewers first, then implement** — for when the user is content with
    the summary but wants a reviewer pass for safety. Spawn
    `dev:coordinator:review-plan-coordinator` (same call as full mode), let it loop
    to clean, then surface its summary per the Coordinator hand-off protocol
    (Run trace bullets + Coordinator trace path), and proceed to Phase 4 without
    a second approval gate. The coordinator handles its own escalations to the
    user inside its context, so by the time you read the summary any open
    product questions have already been answered — there is nothing left to
    re-prompt for.
  - **Request changes** — relay feedback to `/dev:plan` or revise inline, then
    re-present.
- Once the user has chosen approve (with or without the reviewer pass), update plan
  frontmatter: `status: approved`.

### Full mode

- Run `/dev:plan` with the chosen mode. It will produce a PRD plus an implementation
  plan document.
- Spawn the `dev:coordinator:review-plan-coordinator` agent immediately. Do not ask
  permission first; review is part of planning. Pass the plan directory path
  (`docs/design/plans/<task>/`) explicitly in the agent's prompt — the coordinator
  needs it to invoke `/dev:review-plan` correctly. The coordinator runs the skill in
  its own context, loops until clean, and returns a structured summary. You only see
  the summary, not the per-reviewer findings or fix history.
- Surface the coordinator's summary per the Coordinator hand-off protocol —
  the Run trace bullets and the Coordinator trace path get relayed in both
  branches below; the branches differ only in whether you also wait for
  approval afterwards.
- Branch on `plan_approval` (set in Phase 2):
  - **`manual`** (default) — present the polished, reviewed plan to the user
    along with the coordinator's summary (including the Run trace bullets and
    the Coordinator trace path). Wait for explicit approval.
  - **`auto`** — present the same summary (Run trace bullets + Coordinator
    trace path + plan path), append one line acknowledging auto-proceed, then
    continue directly to Phase 4 without an `AskUserQuestion`. Don't expand
    into a re-summary of the plan or the per-reviewer findings — the user
    opted out of reviewing them. The coordinator already handles its own
    escalations inside its context, so reaching this point means reviewers
    converged without an unresolved product question. The summary is
    informational only; do not pause for it.
- Once approved (or auto-proceeded), update plan frontmatter: `status: approved`.

## Phase 4: Implement + Review

Spawn the `dev:coordinator:implement-coordinator` agent. Do not invoke `/dev:implement`
directly — the coordinator runs the implement loop in its own context, dispatches
per-step work to stateless workers (`dev:coordinator:implement-worker`), runs the
review checkpoints, and returns a structured summary. The orchestrator (you) only sees
that summary, not the per-step worker reports, journal entries, test output, or
reviewer findings.

When the summary returns, follow the Coordinator hand-off protocol — the Run
trace bullets and the Coordinator trace path get relayed to the user when
you present the result. Do not compress them away.

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
path. This is the one normal-flow path where the orchestrator spawns
`review-impl-coordinator` directly; the Coordinator hand-off protocol applies
to its summary too (Run trace bullets + Coordinator trace path). On clean,
proceed to Phase 5; on unclean, surface findings to the user and pause. For
other yields (user questions, real blockers), follow the standard escalation
pattern: relay, gather the user's answer, then either re-spawn the
implement-coordinator to resume from on-disk state or pause if the issue
can't be resolved without further input.

When you present the result to the user (implementation complete, reviewers
clean), include the implement-coordinator's Run trace bullets and the
Coordinator trace path per the hand-off protocol — that is the user's only
window into what happened inside the coordinator's context.

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

- **Minimal**: skip. Issues journals are usually empty for trivial tasks, and
  there is no plan directory holding scratch files to clean up.
- **Light, Full**: run `/dev:learn` to process any issues logged during
  implementation. `/dev:learn` also deletes `coordinator-trace.md` and
  `worker-logs/` (per the hand-off protocol — both are intentionally
  ephemeral).

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
