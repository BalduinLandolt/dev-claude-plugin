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

The reviewer set is the union of the plugin's built-in reviewers and any project-local
reviewers, with overrides.

**Plugin reviewers** (default set, spawn by namespaced name):

- `dev:review:architecture-reviewer`
- `dev:review:consistency-reviewer`
- `dev:review:correctness-reviewer` *(rerun: always)*
- `dev:review:docs-reviewer`
- `dev:review:frontend-reviewer`
- `dev:review:rust-reviewer`
- `dev:review:security-reviewer` *(rerun: always)*
- `dev:review:simplicity-reviewer`
- `dev:review:spec-compliance-reviewer` *(rerun: always)*

**Project-local reviewers**: glob `.claude/agents/review/*.md`. Each file defines a
reviewer agent spawned by its bare name (e.g., `architecture-reviewer`). Read each
local file's frontmatter to pick up `rerun: always`.

**Resolution rules** (apply in order):

1. **Same-name override**: if a project-local reviewer's name matches a plugin
   reviewer's bare name (e.g., the project ships `architecture-reviewer.md`), the
   local version replaces the plugin one. Only the local version runs.
2. **Additive otherwise**: project-local reviewers whose names don't match any plugin
   reviewer run *in addition to* the plugin set.
3. **CLAUDE.md disables**: if the consuming project's `CLAUDE.md` has a section
   `## Disabled reviewers` listing reviewer names (one per line, bullets or plain),
   drop those from the final set entirely. This lets a project skip a plugin reviewer
   without replacing it (e.g., projects with an external security gate may disable
   `security-reviewer`).

Launch the resolved reviewer set **in parallel**, each reviewing the plan documents.

State the resolved set in a one-line note before spawning, e.g. "Spawning 9 reviewers:
8 plugin + 1 local (`domain-reviewer`); 0 disabled." This makes the count visible.

If the resolved set is empty (no plugin reviewers reachable AND no local reviewers —
should not happen in a normal install), warn the user with the cause and skip the
loop.

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

If you observe **process friction** during the review — a reviewer that ran without its
convention file, a recurring finding pattern that suggests a doc or skill gap, a reviewer
set that needed an override the project should formalise — log it. If an issues journal
exists for the surrounding task (`docs/design/plans/<task>/issues.md`, when this skill
runs inside an implement flow), append an entry with `**Category**: process`. If running
standalone (no journal), surface under "Side notes" in the summary instead.

### 5. Re-Review

After fixing, spawn a **reduced reviewer set** for round 2+. The set is the union of:

- **Always-rerun reviewers**: any reviewer marked `rerun: always`. For plugin
  reviewers, the always-rerun set is `correctness-reviewer`, `security-reviewer`,
  `spec-compliance-reviewer` (spawned by their namespaced names). For project-local
  reviewers, read each file's frontmatter to determine this.
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
