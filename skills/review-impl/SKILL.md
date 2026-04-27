---
name: review-impl
description: Spawn all discovered reviewer agents in parallel to review implementation code. Loop until reviewers find no issues.
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

Glob for all `.md` files in `.claude/agents/review/`. Each file defines a reviewer agent.
Launch **all discovered reviewers in parallel**, each reviewing the changed files.

If no reviewer files are found, warn the user and skip the review loop.

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

After fixing, spawn a **reduced reviewer set** for round 2+. The set is the union of:

- **Always-rerun reviewers**: any reviewer whose frontmatter has `rerun: always`. Read
  the frontmatter of each discovered reviewer file to determine this. Typically these
  are the high-blast-radius reviewers (correctness, security, spec-compliance) where a
  fix can introduce a regression in a non-obvious way.
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
