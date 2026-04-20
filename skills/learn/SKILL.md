---
name: learn
description: Process the issues journal from a completed task — triage issues into doc improvements, agent fixes, or rare standalone learnings. Use after completing a task, when the user says "what did we learn", or to process implementation issues.
argument-hint: "[task slug, e.g. 004-datastar-spike — or omit to auto-detect from current branch]"
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

# Learn

Process the issues journal and improve documentation, skills, or agents based on what went
wrong during implementation.

## Steps

### 1. Determine Task

If a task slug is provided as an argument, use it. Otherwise, infer the task from the
current git branch name (e.g., `feat/004-datastar-spike` → `004-datastar-spike`). If
neither is available, ask the user.

### 2. Check for Issues

Read `docs/design/plans/<task>/issues.md`. If the file doesn't exist or is empty, skip the
learning phase — nothing went wrong.

### 3. Triage and Improve

Spawn the **doc-improver** agent with the issues journal path. It will:
- Read and categorize each issue (missing doc, discoverability gap, agent bug, or rare
  novel learning)
- Apply the appropriate fix (update docs, fix agent definitions, or create learning entries)
- Report what it changed

### 4. Review Changes

Review the doc-improver's changes. Ensure they:
- Don't break existing documentation
- Are targeted (minimal changes, not rewrites)
- Actually address the triaged issues

### 5. Commit

Commit the documentation improvements with a message like:
`docs: update [doc] based on learnings from task [number]`

## Principle

Most issues should improve existing documentation, not create new files. The goal is that
the next agent working on a similar task has a smoother experience because the docs are
better, not because there's a separate learnings file to find.
