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

If there are WIP, fixup, or messy commits, clean them up into logical commits. Each
resulting commit should:

- Represent one logical change
- Compile and pass tests (bisectable)
- Follow commit conventions: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`

#### Safety first

Before any history rewrite, create a backup ref. It's zero cost and recovers you from
any mistake:

```bash
git branch backup/pre-pr-cleanup HEAD
```

If cleanup goes sideways: `git reset --hard backup/pre-pr-cleanup`. Delete the backup
ref only after the PR is merged.

**Never use `git reset --hard` to discard committed work** without a backup ref first.
The reflog is a fallback, but it is time-bounded (90 days default) and harder to
navigate than a named ref.

#### Preferred path: `rebase --autosquash`

If the messy commits were created with `git commit --fixup=<sha>` or
`git commit --squash=<sha>` during the session, one non-interactive command handles
everything:

```bash
GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash $(git merge-base HEAD main)
```

`GIT_SEQUENCE_EDITOR=true` accepts the autosquash-generated todo list without opening
an editor, so this runs cleanly in an agent context. `rebase -i` does NOT hang — only
the interactive *editor* would. Replacing the editor with `true` (or a scripted
command) is the standard non-interactive pattern.

The easier upstream fix: when implementing, use `git commit --fixup=<sha>` the moment
you realize you're amending earlier work. The implement skill's commit guidance already
recommends this.

#### Ad-hoc squash (no `--fixup` commits)

For the common case of squashing a specific later commit into the previous one:

```bash
# In a 4-commit rebase, fold commit #2 into #1 (line numbers 1-based, oldest first)
GIT_SEQUENCE_EDITOR="sed -i '2s/^pick/fixup/'" git rebase -i HEAD~4
```

For reordering or more complex edits, write a small script and use it as
`GIT_SEQUENCE_EDITOR`. Still non-interactive.

#### Simple cases

- Squash ALL commits on the branch into one:
  `git reset --soft $(git merge-base HEAD main) && git commit -m "..."`
- Squash the last N adjacent commits:
  `git reset --soft HEAD~N && git commit -m "..."`
- Reword the tip commit:
  `git commit --amend -m "..."`

Avoid `git reset --hard` unless you've created a backup ref and understand exactly
which commits are being discarded.

#### Recovery

If something goes wrong and no backup ref exists, `git reflog` shows abandoned commit
SHAs. Cherry-pick them back into place, then delete the bad branch state. This works
for ~90 days after the commit; after that, gc may have cleaned them up.

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
