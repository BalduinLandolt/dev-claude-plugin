---
name: review-impl
description: Spawn all discovered reviewer agents in parallel to review implementation code. Loops until reviewers find no issues, unless invoked in single-round mode.
argument-hint: "[mode=<minimal|light|full>]"
allowed-tools:
  - Glob
  - Grep
  - Read
  - Write
  - Edit
  - Bash
  - Agent
  - AskUserQuestion
---

# Review Implementation

Run the implementation review loop: spawn reviewers, fix or escalate, repeat until clean.

## Argument: mode

If the orchestrator passes `mode=minimal` (or `single-round=true`), run **round 1 only**
and stop after fixes — do not loop. This is appropriate for trivial changes where the
risk of a regression hidden behind a fix is low.

For `mode=light`, `mode=full`, or no mode argument: run the full loop semantics
described below (round 1 spawns all discovered reviewers; round 2+ uses the reduced
set; repeat until no Critical or Warning findings remain).

The default is loop semantics. Treat single-round as an explicit opt-in.

## Steps

### 1. Identify Changed Files

Determine what files have been created or modified since the branch diverged from main:

```bash
git diff --name-only main...HEAD
```

The three-dot syntax compares against the merge base, not the current tip of main.

### 2. Write a Change Summary

Before spawning reviewers, produce a short orientation summary of what this branch
changed. Aim for 5-10 lines, no more. Format:

```
Intent: <one sentence describing the task / what the branch accomplishes>
Notable changes:
- <file or area>: <what changed and why, one line>
- ...
Touch-points worth flagging: <new public API, schema change, dependency added,
   migration, behavior change visible to users, etc. — or "none">
```

Each reviewer receives this summary and the file list, so it can orient itself
immediately without re-reading every changed file. Reviewers still read files when
they need surrounding context — the summary is orientation, not a substitute for
the source.

Producing the summary once and passing it to N reviewers is cheaper than each
reviewer reconstructing the same understanding from scratch.

### 3. Discover and Spawn Reviewers

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

Launch the resolved reviewer set **in parallel**, each reviewing the changed files.

State the resolved set in a one-line note before spawning, e.g. "Spawning 9 reviewers:
8 plugin + 1 local (`domain-reviewer`); 0 disabled." This makes the count visible above
any wrapping coordinator.

Reviewers self-gate when irrelevant to the change (e.g., `rust-reviewer` returns early
if no `*.rs` files changed), so running the full plugin set on every review is cheap.

If the resolved set is empty (no plugin reviewers reachable AND no local reviewers —
should not happen in a normal install), warn the user with the cause and skip the
loop.

Each agent receives:
- The change summary from step 2
- The list of changed files
- The approved plan (for correctness and spec-compliance checking)
- Relevant process and design docs (see CLAUDE.md documentation index)

### 4. Collect and Triage Findings

Same as review-plan:
- **Critical**: must fix
- **Warning**: should fix
- **Suggestion**: consider

### 5. Fix

Fix findings yourself. You should be able to resolve the vast majority of issues based on
the approved plan and the project's documented constraints. Only escalate to the user when
you genuinely cannot determine the right course of action — for example, when a finding
reveals a gap in the plan that requires a product decision.

**Do not escalate as a default.** Read the plan, read the docs, think about the intent,
and make a judgment call. The user should only see questions that truly require their input.

Log any fixes to the issues journal.

### 6. Re-Review

**Skip this step entirely in single-round mode** (`mode=minimal`). Round 1 + fixes is
the whole review. Stop here.

For other modes:

After fixing, spawn a **reduced reviewer set** for round 2+. The set is the union of:

- **Always-rerun reviewers**: any reviewer marked `rerun: always`. For plugin
  reviewers, the always-rerun set is `correctness-reviewer`, `security-reviewer`,
  `spec-compliance-reviewer` (spawned by their namespaced names) — the high-blast-radius
  ones where a fix can introduce a regression in a non-obvious way. For project-local
  reviewers, read each file's frontmatter to determine this.
- **Reviewers that flagged**: any reviewer that produced a Critical or Warning finding
  in the previous round.
- **Orchestrator-judged reviewers**: any reviewer that you, as the orchestrator, judge
  may now be relevant given the fixes you applied. For example: if you restructured a
  module while addressing a correctness finding, include `architecture-reviewer` even
  if it was clean last round. If you changed user-facing copy, include `docs-reviewer`.
  Use judgment — don't over-include, but don't blindly trust the static rule when your
  fix obviously crossed concerns.

Reviewers that were clean in the previous round, are not `rerun: always`, and aren't
flagged by your judgment do **not** re-run. They're considered done for this loop.

Repeat until no critical or warning findings remain among the reviewers that ran.
