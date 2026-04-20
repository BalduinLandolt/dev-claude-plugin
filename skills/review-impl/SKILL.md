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

### 2. Discover and Spawn Reviewers

Glob for all `.md` files in `.claude/agents/review/`. Each file defines a reviewer agent.
Launch **all discovered reviewers in parallel**, each reviewing the changed files.

If no reviewer files are found, warn the user and skip the review loop.

Each agent receives:
- The list of changed files
- The approved plan (for correctness and spec-compliance checking)
- Relevant process and design docs (see CLAUDE.md documentation index)

### 3. Collect and Triage Findings

Same as review-plan:
- **Critical**: must fix
- **Warning**: should fix
- **Suggestion**: consider

### 4. Fix

Fix findings yourself. You should be able to resolve the vast majority of issues based on
the approved plan and the project's documented constraints. Only escalate to the user when
you genuinely cannot determine the right course of action — for example, when a finding
reveals a gap in the plan that requires a product decision.

**Do not escalate as a default.** Read the plan, read the docs, think about the intent,
and make a judgment call. The user should only see questions that truly require their input.

Log any fixes to the issues journal.

### 5. Re-Review

After fixing, spawn **all reviewers again** on the updated code. Every round uses the
full reviewer set — do not skip reviewers or reduce the set on subsequent rounds. Repeat
until no critical or warning findings remain.
