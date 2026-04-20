---
name: next
description: Start working on the next project plan item. Runs the full workflow harness — investigate, plan, review, implement, review, verify, learn.
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

# Next Task Workflow

You are the **orchestrator**. Run the full workflow harness for the next project plan item.

## Phase 1: Investigate

Run the `/dev:investigate` skill. It will propose the next item and wait for user approval.

## Phase 2: Plan + Review

Run the `/dev:plan` skill with the approved task. Once the plan is drafted, immediately run
the `/dev:review-plan` skill — do not ask permission first. The review is part of planning, not a
separate gate. The review skill will loop internally until reviewers find no meaningful
issues. Present the **polished, reviewed plan** to the user.

## Phase 3: Get Human Approval

Present the reviewed plan to the user. Wait for explicit approval before implementing.
Once approved, update the plan document frontmatter: `status: approved`

## Phase 4: Implement + Review

Run the `/dev:implement` skill with the approved plan. The implement skill runs review
checkpoints internally — these happen automatically as part of implementation, not as
separate steps that need permission. Only present the result to the user when
implementation is complete and reviewers are clean.

## Phase 5: Update Documentation

The implement skill handles this as part of its completion:
- Update developer documentation as specified in CLAUDE.md
- If user-facing changes, update user guide as specified in CLAUDE.md

## Phase 6: Human Verification

Ask the user to:
- Review the code changes
- Review the documentation updates
- Manually test the app if applicable
- Confirm the implementation is acceptable

## Phase 7: Learn

Run the `/dev:learn` skill to process any issues logged during implementation.

## Phase 8: Complete

- Update the plan document frontmatter: `status: implemented`
- Update the project plan (see CLAUDE.md for location): check off the completed item
- If on a feature branch, run the `/dev:prepare-pr` skill

## Important

- **Never skip human checkpoints.** Wait for explicit approval at phases 3 and 6.
- **Log issues as they occur** during implementation to `docs/design/plans/<task>/issues.md`
- If you're unsure about a decision, ask the user rather than guessing
