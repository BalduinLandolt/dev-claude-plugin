---
name: investigate
description: Gather context and propose the next project plan item to work on. Use when the user asks what to work on next, wants to pick a task, or says "what's next".
allowed-tools:
  - Glob
  - Grep
  - Read
  - Agent
  - AskUserQuestion
---

# Investigate

Gather context and propose the next task from the project plan.

## Steps

1. Read the project plan (see CLAUDE.md for location) — find the next unchecked item and
   its dependencies
2. Verify dependencies are met (previous items checked off or not blocking)
3. Spawn **codebase-researcher** and **docs-and-learnings-researcher** in parallel to
   understand the current state
4. If the project uses behavioral specs (check CLAUDE.md), review them for open questions
   or aspirational rules relevant to the candidate task — these may inform the size/risk
   assessment
5. Based on findings, propose to the user:
   - **Which item** to tackle next
   - **Why this item** (dependencies met, logical next step, etc.)
   - **Size/risk assessment**: small, medium, or large
   - **Planning tier**: implementation plan only (small), PRD + impl plan (medium), or
     project brief + sub-projects (large)
6. Wait for user approval

## Output

Present the proposal clearly and concisely. Do not start planning until the user agrees.
