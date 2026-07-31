---
name: plan
description: Create planning documents for a task, collaboratively with the user — always an implementation plan, plus a PRD when the task's complexity warrants one.
argument-hint: "[task description]"
allowed-tools:
  - Glob
  - Grep
  - Read
  - Write
  - Edit
  - Agent
  - AskUserQuestion
---

# Plan

Create planning documents for an approved task. You decide how much planning
ceremony the task actually needs; the orchestrator has already
surfaced-and-confirmed the heavier calls (a PRD, a plan-review pass) with the user
before invoking you.

## What to produce

**Always**: an implementation plan.

**A PRD as well, when the task warrants it** — state transitions, invariants,
preconditions, non-trivial acceptance criteria, or anything where "what done
means" isn't obvious from the request. A one-line bug fix or a mechanical
refactor does not need a PRD; a new user-facing capability usually does. If the
orchestrator's args already say whether a PRD is wanted, follow that; otherwise
make the call yourself and note it. When in genuine doubt, ask once.

## Phase 1: Research

This is where the deep research happens — `investigate` deliberately did only a
light scan, leaving the parallel fan-out for here, now that the task and its shape
are confirmed. Spawn research agents **in parallel**, but only the ones that will
actually contribute — don't reflexively spawn all four:

- **codebase-researcher** — current code state. Almost always useful.
- **docs-and-learnings-researcher** — constraints and past learnings. Almost
  always useful.
- **framework-researcher** — only when the task touches library APIs or
  unfamiliar framework features.
- **topic-researcher** — only when there are specific external questions worth
  answering.

Each returns a compact report; the subagent's exploration stays in its own
context, so only the report reaches you. If `investigate`'s light scan already
answered something, don't re-ask it — spawn the agent only for what's still open.

## Phase 2: Draft

Create `docs/design/plans/<number>-<slug>/implementation-plan.md`:

- Files to create or modify.
- Approach and sequence — **numbered steps, each small enough for one worker to
  land in a handful of turns.** Oversized steps make workers loop; if a step
  would take a worker many iterations, split it.
- Test plan: what to test, which test tier.
- Risks or open questions.

When a PRD is warranted, also create `docs/design/plans/<number>-<slug>/prd.md`:

- What and why.
- Acceptance criteria.
- Non-goals.

If the task involves state transitions, invariants, preconditions, or calculation
rules, and the project uses behavioral specs (check CLAUDE.md), write or update
specs — `/allium:elicit` to discover behavioural intent, then `/allium:tend` to
write the spec. Reference the spec from the PRD.

Produce **one** implementation plan. If the task is too large for a single plan,
that's a signal it should have been split into multiple tasks during
investigate — escalate back to the user rather than emitting several plans.

## Phase 3: Collaborate

Planning is collaborative. Ask the user to fill gaps, present drafts, and iterate
until the documents are solid.

## Document frontmatter

```yaml
---
status: draft
task: "<number>-<slug>"
---
```

`status` moves `draft → reviewed → approved → implemented` as the task progresses.
