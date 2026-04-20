---
name: prepare-pr
description: Clean up git history (rebase into logical commits), push branch, and create a pull request. Use when the user wants to open a PR, push changes, ship a branch, or says "create a PR" or "let's ship this".
allowed-tools:
  - Bash
  - Glob
  - Grep
  - Read
  - AskUserQuestion
---

# Prepare PR

Clean up the branch history and create a pull request.

## Steps

### 1. Verify State

- Confirm we're on a feature branch (not main)
- Confirm all tests pass (see CLAUDE.md for the test command)
- Confirm formatting is clean (see CLAUDE.md for the format-check command)
- Confirm lints pass (see CLAUDE.md for the lint command)

### 2. Clean Up History

Review the commit log since branching from main:

```bash
git log --oneline main..HEAD
```

If there are WIP, fixup, or messy commits, clean them up into logical commits.

**Do NOT use `git rebase -i`** — interactive rebase requires a terminal editor and will
hang in an agent context. Instead use non-interactive approaches:

- To squash all commits into one: `git reset --soft $(git merge-base HEAD main) && git commit -m "..."`
- To squash the last N commits: `git reset --soft HEAD~N && git commit -m "..."`
- To reword the last commit: `git commit --amend -m "..."`

Each resulting commit should:
- Represent one logical change
- Compile and pass tests (bisectable)
- Follow commit conventions: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`

### 3. Push

```bash
git push -u origin HEAD
```

### 4. Create PR

**Before creating the PR**, verify the title and body contain no sensitive personal data.
PR descriptions must never include PII. Check `.claude/conventions/security.md` if it
exists for the project's specific data sensitivity requirements.

Use `gh pr create` with:
- A concise title (under 70 characters)
- A body that includes:
  - Summary of what changed and why
  - Reference to the project plan item
  - Any decisions that deviate from the plan

```bash
gh pr create --title "..." --body "..."
```

### 5. Report

Tell the user the PR URL so they can review it.
