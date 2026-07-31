---
name: investigate
description: Gather context for a task and propose what to work on. Either picks the next item from the project plan, or scopes a user-provided task. Use when the user asks what to work on next, wants to pick a task, or hands you a specific task description.
argument-hint: "[optional task description]"
allowed-tools:
  - Glob
  - Grep
  - Read
  - AskUserQuestion
---

# Investigate

Gather **just enough** context to propose and size a task. Two modes depending on
whether an argument is given.

## Depth: light scan only

Do your own lookups with `Glob`/`Grep`/`Read` — enough to name the relevant code,
spot obvious constraints, and let `/dev:next` size the task. **Do not spawn
research subagents here.** The deep parallel research belongs in `/dev:plan`,
which runs *after* the task and its shape are confirmed — running it now would
spend research on a task that might change or turn out trivial (a trivial task
skips `/dev:plan` entirely). A targeted scan is all the sizing decision needs.

## Backlog check (both modes, run first)

Before either mode, check whether the project keeps a backlog of "by the way" ideas
that surfaced mid-task and have not yet been triaged. Convention: a `BACKLOG.md`
file sitting next to the project plan (the project plan's location is declared in
CLAUDE.md). If the file exists and contains entries under a "## Open" or "## Open
entries" heading:

1. List the open entries to the user (titles only, not full bodies).
2. Use `AskUserQuestion` to ask whether to triage them now — promote one or more
   into the project plan as new tasks, defer (leave in the backlog), or proceed
   with the originally intended next task without triaging.
3. If the user chooses to triage, walk through entries one at a time with the
   user, updating `BACKLOG.md` and `PROJECT_PLAN.md` as decided. Then resume the
   regular investigate flow below.
4. If the user chooses to proceed, continue with the regular flow.

If `BACKLOG.md` does not exist, or has no open entries, skip this section silently.
This check is generic — it should not assume any particular project structure
beyond "project plan and backlog live in the same directory".

## Mode A: No argument — pick from project plan

1. Read the project plan (see CLAUDE.md for location). Find the next unchecked item
   and its dependencies.
2. Verify dependencies are met (previous items checked off, no blockers).
3. Do a **light scan** of the current state yourself (`Glob`/`Grep`/`Read`): the
   files the candidate item touches, obvious existing patterns nearby. No research
   subagents — see "Depth" above.
4. If the project uses behavioral specs (check CLAUDE.md), skim them for open
   questions or aspirational rules relevant to the candidate task.
5. **Surface context** for the sizing decision (which `/dev:next` makes next, not
   here). Present:
   - **The candidate item** — which plan entry, with the dependency-readiness check.
   - **Relevant existing code** — what your scan found.
   - **Constraints worth knowing** — conventions, prior learnings, open spec
     questions.
   Do not pre-judge how much ceremony the task needs — the workflow shape is
   decided in `/dev:next`'s Phase 2. Sizing is a separate decision.
6. Wait for user approval to proceed with this item.

## Mode B: Argument given — scope a user-provided task

The argument is a task description (e.g. "add a button to clear filters",
"refactor the auth module", "fix the off-by-one in pagination").

1. **Light scan** yourself (`Glob`/`Grep`/`Read`): find the related code and
   existing patterns the task touches — enough to restate it accurately and size
   it. No research subagents — see "Depth" above.
2. Skim relevant constraints, conventions, or past learnings you come across while
   scanning.
3. Read the project plan briefly to check whether the task overlaps with planned
   work — if so, flag the overlap to the user.
4. Make a judgment call about whether this task should be added to the project plan:
   - **New feature ideas** → propose adding.
   - **Small fixes, refactors, chores, internal cleanups** → typically not worth a
     plan entry.
   - **Borderline cases** → ask the user.
5. Propose to the user:
   - **The task as you understand it** — restate in one sentence.
   - **What's relevant** — files, patterns, constraints found by your scan.
   - **Plan-entry recommendation** — add to plan, or treat as ad-hoc, with reasoning.
6. Wait for user approval (and confirmation of the plan-entry decision).

## Output

Present the proposal clearly and concisely. Do not start planning until the user agrees.

The size/risk and workflow shape are decided in the **next** skill's Phase 2
(surface-and-veto) after this investigation completes. Don't pre-judge size here —
your job is to surface enough context that the sizing decision is informed.
