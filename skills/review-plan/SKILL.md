---
name: review-plan
description: Spawn all discovered reviewer agents in parallel to find weaknesses in a plan. Loop until reviewers find no issues.
argument-hint: "[path to plan directory]"
allowed-tools:
  - Glob
  - Grep
  - Read
  - Write
  - Edit
  - Agent
  - AskUserQuestion
---

# Review Plan

Run the plan review loop: spawn reviewers, fix or escalate, repeat until clean.

## Steps

### 1. Discover and Spawn Reviewers

Glob for all `.md` files in `.claude/agents/review/`. Each file defines a reviewer agent.
Launch **all discovered reviewers in parallel**, each reviewing the plan documents.

If no reviewer files are found, warn the user and skip the review loop.

Each agent receives:
- The plan documents (PRD, implementation plans)
- All relevant docs/ files for context (design specs in `docs/design/`, process docs in `docs/process/`)

### 2. Collect Findings

Gather the standardized output from each reviewer (Critical / Warning / Suggestion).

### 3. Triage Findings

For each finding:
- **Critical**: must be addressed before the plan is approved
- **Warning**: should be addressed, fix if the solution is clear
- **Suggestion**: optional, consider but don't block on

### 4. Fix

Fix findings yourself. You should be able to resolve the vast majority of issues based on
the project's documented intent and constraints. Only escalate to the user when you
genuinely cannot determine the right course of action — for example, when a finding
requires a product decision that isn't covered by existing documentation.

**Do not escalate as a default.** "I'm not sure" is not a reason to escalate — read the
docs, think about the intent, and make a judgment call. The user should only see questions
that truly require their input.

### 5. Re-Review

After fixing, spawn a **reduced reviewer set** for round 2+. The set is the union of:

- **Always-rerun reviewers**: any reviewer whose frontmatter has `rerun: always`. Read
  the frontmatter of each discovered reviewer file to determine this.
- **Reviewers that flagged**: any reviewer that produced a Critical or Warning finding
  in the previous round.
- **Orchestrator-judged reviewers**: any reviewer that you, as the orchestrator, judge
  may now be relevant given the plan revisions you made. Use judgment — if a revision
  obviously affects a concern that a clean reviewer covers, include them.

Reviewers that were clean in the previous round, are not `rerun: always`, and aren't
flagged by your judgment do **not** re-run. They're considered done for this loop.

Repeat until no critical or warning findings remain among the reviewers that ran. Only
then is the plan considered reviewed.

### 6. Update Status

Update the plan document frontmatter: `status: reviewed`
