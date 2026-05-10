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
learning phase — nothing went wrong. If only `issues-processed.md` exists, the journal has
already been triaged in a previous run — skip. If both files exist (a rare case where
implementation resumed after a previous learn), treat `issues.md` as the active journal
and proceed normally.

This skill is intended to run after implementation is complete. Running it mid-task
renames the journal and prevents further issue logging until the rename is reverted.

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

Rename `docs/design/plans/<task>/issues.md` to `docs/design/plans/<task>/issues-processed.md`
(same directory) so re-running `/dev:learn` on this task is a no-op.

If `docs/design/plans/<task>/worker-logs/` exists (created by implement-workers
when their reports needed more detail than the 200-word cap allowed), the
directory is implementation scratch — not preserved as task documentation. The
journal entries in `issues.md` are written self-contained (per the worker
contract), so the doc-improver works from the journal alone; worker-logs were
only useful to the implement coordinator during the loop. Delete the directory
before committing. If a consuming project gitignores `worker-logs/` directories
instead, the delete is harmless.

If `docs/design/plans/<task>/coordinator-trace.md` exists (created by the
implement and review skill bodies during the run for post-hoc audit), delete
it too. It is structural scratch; the relevant findings have already been
funnelled through the issues journal and the coordinator summaries. If a
consuming project gitignores it, the delete is harmless.

Stage the rename, the doc improvements, and the worker-logs / coordinator-trace
deletions together and commit them with a message like:
`docs: update [doc] based on learnings from task [number]`

## Principle

Most issues should improve existing documentation, not create new files. The goal is that
the next agent working on a similar task has a smoother experience because the docs are
better, not because there's a separate learnings file to find.
