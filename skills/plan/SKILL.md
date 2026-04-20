---
name: plan
description: Create planning documents (PRD, implementation plans) for a task, collaboratively with the user
argument-hint: "[task number and description]"
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

Create planning documents for a task. The tier determines what documents are produced.

## Phase 1: Research

Which research agents to spawn depends on the planning tier:

**Small tasks** — spawn 2 agents in parallel:
- **codebase-researcher** — understand current code state
- **docs-and-learnings-researcher** — find relevant constraints and past learnings

**Medium and large tasks** — spawn all 4 agents in parallel:
- **codebase-researcher** — understand current code state
- **docs-and-learnings-researcher** — find relevant constraints and past learnings
- **framework-researcher** — fetch relevant framework docs (when the task touches library
  APIs or unfamiliar framework features)
- **topic-researcher** — targeted web research (formulate specific questions based on the
  task)

## Phase 2: Draft Documents

Based on research results and the planning tier:

### Small Task (Implementation Plan only)
Create `docs/design/plans/<number>-<slug>/implementation-plan.md`:
- Files to create or modify
- Approach and sequence
- Test plan (what to test, which tier)
- Risks or open questions

### Medium Task (PRD + Implementation Plans)
Create `docs/design/plans/<number>-<slug>/prd.md`:
- What and why
- Acceptance criteria
- Non-goals

If the task involves state transitions, invariants, preconditions, or calculation rules,
and the project uses behavioral specs (check CLAUDE.md), write or update specs. Use
`/allium:elicit` to discover behavioral intent through structured Q&A, then `/allium:tend`
to write the spec. Reference the spec from the PRD.

Then create one or more `implementation-plan-<area>.md` files.

### Large Task (Project Brief + Sub-projects)
Create `docs/design/plans/<number>-<slug>/project-brief.md`:
- High-level intent
- Sub-project breakdown

Then create sub-directories, each with PRD + implementation plan(s).

## Phase 3: Collaborate

Planning is **collaborative**. Ask the user questions to fill gaps, present drafts for
review, and iterate until the documents are solid. Use the same conversation-and-review
format used for the initial project context documents.

## Document Frontmatter

All planning documents must include:

```yaml
---
status: draft
task: "<number>-<slug>"
tier: small | medium | large
---
```
