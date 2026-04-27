---
name: plan
description: Create planning documents (implementation plan, optionally a PRD) for a task, collaboratively with the user. The mode (light or full) is set by the orchestrator based on the sizing decision.
argument-hint: "[task description]; mode=<light|full>"
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

Create planning documents for an approved task. The orchestrator passes a `mode` of
either `light` or `full` via the args string (convention: `"...; mode=<value>"`).
Minimal-mode tasks do not invoke this skill at all — they use Claude Code's built-in
plan mode instead.

## Default mode

If no `mode=` argument is given (e.g. the user invokes `/dev:plan` directly without
going through `/dev:next`), default to **full**. Full mode is the safest default: a PRD
plus an implementation plan covers any task that actually needed planning, and the
extra ceremony on a small task is recoverable. The reverse — defaulting to light and
discovering mid-implementation that you needed a PRD — is not.

If the user invoked you directly and the task is obviously small, ask once whether they
want light mode instead, then proceed with their answer.

## Phase 1: Research

Spawn research agents in parallel based on mode:

**Light mode** — 2 agents:
- **codebase-researcher** — current code state.
- **docs-and-learnings-researcher** — constraints and past learnings.

**Full mode** — up to 4 agents:
- **codebase-researcher** — current code state.
- **docs-and-learnings-researcher** — constraints and past learnings.
- **framework-researcher** — fetch relevant framework docs (only when the task touches
  library APIs or unfamiliar framework features; skip otherwise).
- **topic-researcher** — targeted web research (only when there are specific external
  questions worth answering; skip otherwise).

Don't reflexively spawn all four in full mode. Spawn the ones that will actually
contribute.

## Phase 2: Draft Documents

### Light mode — implementation plan only

Create `docs/design/plans/<number>-<slug>/implementation-plan.md`:

- Files to create or modify.
- Approach and sequence (numbered steps).
- Test plan: what to test, which test tier.
- Risks or open questions.

No PRD. The acceptance criteria are implicit in the user's request and the test plan.

### Full mode — PRD plus implementation plan

Create `docs/design/plans/<number>-<slug>/prd.md`:

- What and why.
- Acceptance criteria.
- Non-goals.

If the task involves state transitions, invariants, preconditions, or calculation rules,
and the project uses behavioral specs (check CLAUDE.md), write or update specs. Use
`/allium:elicit` to discover behavioral intent through structured Q&A, then `/allium:tend`
to write the spec. Reference the spec from the PRD.

Then create `docs/design/plans/<number>-<slug>/implementation-plan.md`:

- Files to create or modify.
- Approach and sequence.
- Test plan.
- Risks or open questions.

A single implementation plan per task. If the task is large enough that one plan
isn't enough, that's a signal it should have been split into multiple tasks during
investigate — escalate back to the user rather than producing multiple plan documents.

## Phase 3: Collaborate

Planning is **collaborative**. Ask the user questions to fill gaps, present drafts for
review, and iterate until the documents are solid.

## Document Frontmatter

All planning documents must include:

```yaml
---
status: draft
task: "<number>-<slug>"
mode: light | full
---
```
