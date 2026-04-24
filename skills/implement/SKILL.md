---
name: implement
description: Execute an approved plan — write tests and code, log issues, run reviewers at checkpoints
argument-hint: "[path to approved plan]"
allowed-tools:
  - Glob
  - Grep
  - Read
  - Write
  - Edit
  - Bash
  - Agent
  - AskUserQuestion
  - Skill
  - TaskCreate
  - TaskUpdate
---

# Implement

Execute the approved implementation plan. Test-first where specified by the testing
strategy.

## Setup

1. Read the approved plan
2. Create a feature branch: `<type>/<number>-<slug>` (see docs/process/GIT_WORKFLOW.md)
3. Create the issues journal: `docs/design/plans/<task>/issues.md`

## Execution

**When touching frontend files**, follow the project's architecture conventions (see
`.claude/conventions/architecture.md` if it exists, or `docs/process/CODING_CONVENTIONS.md`).

Follow the implementation plan's sequence. For each step:

1. **Write tests first** for core layers per the project's testing strategy (see CLAUDE.md
   for which layers are test-first). For outer layers, tests may be written alongside or
   shortly after implementation.
2. **Check test coverage against spec** — if the project uses behavioral specs (check
   CLAUDE.md), run `/allium:propagate` to identify coverage gaps. Fill any gaps before
   proceeding.
3. **Write the implementation** to make the tests pass
4. **Run tests** — use the project's test command (see CLAUDE.md for the exact commands).
5. **Commit at review-unit boundaries, not after every plan step.** Several plan
   steps that build up one feature (deps, module skeleton, types, template, tests)
   usually belong in a single `feat(X): introduce X` commit, not one commit per step.
   Use `git commit --amend --no-edit` to fold the next small piece into the commit
   in progress. When a change amends an earlier commit on the same branch (review-fix,
   typo correction, forgotten follow-up), use `git commit --fixup=<sha>` instead of a
   regular commit; these auto-squash at PR-prep time via
   `GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash <base>`. Aim for ~3-5 commits
   on a typical task PR under rebase-merge; check the project's merge strategy (project
   CLAUDE.md or GIT_WORKFLOW doc) if unsure.
6. **Log issues** as they occur — append to the issues journal

### Issue Journal Format

```markdown
## Issue: [short description]
**When**: [during which step]
**What happened**: [description]
**What I tried**: [approaches attempted]
**Resolution**: [how it was resolved, or "unresolved"]
```

## Review Checkpoints

Run the `/dev:review-impl` skill automatically at these points — do not ask permission first,
review is part of implementation:

- After tests are written (before implementation) — do tests specify the right behavior?
- After implementation is complete — is the code correct and clean?
- Before committing final changes — last quality gate

If the project uses behavioral specs (check CLAUDE.md) for the area being modified, run
`/allium:weed` after implementation is complete to check for spec-code divergences. Fix any
divergences before the final review checkpoint.

Each review runs the full loop: all reviewers, fix findings, re-review until clean. Only
present the result to the user when the implementation is complete and all review rounds
have converged.

## Developer Documentation

After implementation is complete and reviewers are clean, update the project's developer
documentation (see CLAUDE.md for location):

- If this task introduced a new module or subsystem, create a new page
- If this task modified an existing area, update the corresponding page
- Describe what the code does, how it fits together, and key decisions made
- This is descriptive documentation — reflect what was built, not the plan

## User Guide

If the task changes user-facing behavior (new screens, changed workflows, new features
visible to the user), update the user guide as specified in CLAUDE.md. Skip this step for
purely internal changes (backend refactoring, test infrastructure, etc.).

## Completion

When all plan steps are done, reviewers are clean, and documentation is updated:
- Run the project's test, lint, and format-check commands one final time (see CLAUDE.md)
- Notify the user that implementation is ready for human verification
