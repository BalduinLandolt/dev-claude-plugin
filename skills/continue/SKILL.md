---
name: continue
description: Resume an in-progress task mid-workflow in a fresh session — detect where the work left off from on-disk state, confirm the resume point, and re-enter the workflow there instead of restarting at investigate. Use when picking up a feature that spans multiple sessions, or when the user says "continue", "pick up where we left off", or "resume the task".
argument-hint: "[optional task slug or plan directory]"
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

# Continue Task Workflow

You are the **orchestrator**, resuming a task that was already started in an
earlier session. `/dev:next` always begins at investigation; this skill instead
**detects how far the work got and re-enters the workflow at the right phase**, so
a multi-session feature picks up where it left off without redoing planning or
re-running investigation — while keeping full awareness of the workflow that
remains.

The `/dev:next` skill is the **single source of truth for the phases themselves**.
This skill's job is only: figure out the resume point, confirm it, then run
`next`'s phases from there. Read `../next/SKILL.md` so you execute those phases
(isolated phase-runners, the unconditional gates, delivery) exactly as `next`
defines them — do not reinvent them here.

## Phase A: Detect state

Gather the on-disk facts. Do not guess — read them:

1. **Git.** Current branch; `git log main..HEAD --oneline` (commits already on the
   branch); `git status` (uncommitted work). Note whether you are on a feature
   branch or `main`.
2. **Plan.** If an argument names a task slug or plan directory, use it. Otherwise
   find the active plan under `docs/design/plans/` — the one matching the current
   branch, or the most recently modified whose frontmatter `status` is not
   `implemented`. Read its `status` (`draft → reviewed → approved → implemented`)
   and, if present, the PRD.
3. **Progress.** In the plan, count checked vs unchecked steps. Read the issues
   journal (`docs/design/plans/<task>/issues.md`) if present — note whether it has
   entries and whether they look processed.
4. **Delivery.** Check for an open PR for the branch (`gh pr list --head <branch>`
   or `gh pr view`).
5. **Project plan.** Read the project plan (location per CLAUDE.md) to recover the
   task's `plan_entry` (the item to check off later) or confirm it's ad-hoc.

Re-establish the two facts `next`'s Phase 1 would have recorded, so later phases
survive: `task_description` and `plan_entry` (`<item>` or `none`).

## Phase B: Infer the resume point

Map the detected state to a `next` phase (its numbering):

| Detected state | Resume at |
|---|---|
| Plan `status: draft`/`reviewed`, not approved | Phase 3 — Plan + Approve |
| Plan `approved`, steps unchecked or partially done | Phase 4 — Implement |
| Steps done / implement complete, review not yet run | Phase 5 — Review |
| Code + review done, not yet verified by the user | Phase 7 — Human verification |
| Verified, issues journal not yet processed | Phase 8 — Learn |
| Learned, no PR yet (and delivery is a PR) | Phase 9 — Complete / PR |
| Open PR already exists | Likely complete — confirm and stop, or handle follow-ups |

The disk rarely tells you *precisely* which side of a boundary you're on (e.g.
"review done" vs "verified"). Pick the earliest phase whose work you cannot
confirm is finished — resuming one phase early is cheap; skipping a phase is not.

If nothing is in progress (no feature branch, no non-`implemented` plan, no
commits), this isn't a resume: say so and point the user at `/dev:next`.

## Phase C: Confirm the resume point (gate)

Present a short summary — the task, what's already done (commits, checked steps,
plan status, PR), and the phase you propose to resume at — and confirm with
`AskUserQuestion`, offering the inferred phase plus the adjacent ones so the user
can correct an ambiguous boundary. This confirmation is the re-entry gate; it
replaces `next`'s task-confirmation gate for a resumed run. Wait for the answer.

## Phase D: Resume

Run `next`'s phases from the confirmed resume point through to completion,
following `../next/SKILL.md`. All of `next`'s unconditional gates downstream of the
resume point still apply (plan approval if you re-enter at Phase 3, verification at
Phase 7). Isolated phases (implement, review, learn, prepare-pr) spawn their
phase-runners exactly as `next` describes, resuming from on-disk state.
