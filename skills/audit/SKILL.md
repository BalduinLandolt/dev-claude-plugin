---
name: audit
description: Check an existing project for harness readiness — find missing convention files, CLAUDE.md sections, build recipes, and reviewer agents. Interactively scaffold the gaps. Use when the user wants to check project setup, onboard a project into the harness, verify readiness, or asks "is the project set up correctly".
allowed-tools:
  - Glob
  - Grep
  - Read
  - Write
  - Edit
  - Bash
  - AskUserQuestion
---

# Audit

Check whether a project has everything the agent workflow harness needs to function well.
Report what's missing and interactively scaffold the gaps.

This is the brownfield counterpart to greenfield — use it to onboard an existing project
into the harness, or to verify that a greenfield-scaffolded project is complete.

## Phase 1: Check

Inspect the project for the following. For each item, record whether it's present, partial,
or missing.

### CLAUDE.md
- Does CLAUDE.md exist?
- Does it have a **Build & Test Commands** section with standard recipes (`test`, `lint`,
  `fmt-check`, `build`, `dev`)?
- Does it have a **Documentation Index** listing where docs live?
- Does it have an **Architecture** section (even brief)?
- If the project uses behavioral specs, are they listed (e.g., under "Behavioral
  Specifications")?

### Convention Files (`.claude/conventions/`)
- Does the directory exist?
- Which convention files are present? Check for at minimum:
  - `architecture.md`, `security.md`, `simplicity.md`, `correctness.md`,
    `consistency.md`, `docs.md`
  - Stack-specific: `rust.md`, `frontend.md`, or others matching the tech stack
- Are the convention files non-empty and substantive (not just placeholders)?

### Build Recipes
- Does a `justfile` (or `Makefile`, `package.json` scripts, etc.) exist?
- Does it have the standard recipes: `test`, `lint`, `fmt-check`, `build`, `dev`?

### Documentation Layout
- Do `docs/design/`, `docs/process/`, `docs/dev/` directories exist?
- Is there a project plan in the expected location (per CLAUDE.md)?
- Is there a `BACKLOG.md` alongside the project plan? (matches `/dev:investigate`'s
  anchor — the project plan's directory)

### Reviewer Agents
- The plugin ships a default reviewer set (`dev:review:*`) that runs automatically:
  architecture, consistency, correctness, docs, frontend, rust, security, simplicity,
  spec-compliance. A project does **not** need to copy these in to get review.
- Does `.claude/agents/review/` exist? If so, list which project-local reviewers are
  present. These either replace plugin reviewers of the same name (override) or run
  in addition to them.
- Does `CLAUDE.md` have a `## Disabled reviewers` section? If so, list which plugin
  reviewers it disables.
- Are stack-specific local reviewers present where the plugin defaults don't cover the
  stack (e.g., a Python project might want a `python-reviewer.md`)?

## Phase 2: Report

Present a clear summary organized by category:

```
## Audit Results

### Present
- [item] — [status]

### Missing
- [item] — [what it is and why it matters]

### Partial
- [item] — [what's there and what's missing]
```

## Phase 3: Scaffold (Interactive)

For each missing or partial item, offer to create or fix it:

- **Convention files**: Ask targeted questions about the project (architecture, threat
  model, tech stack, etc.) and create the convention file based on answers. For stacks
  with a starter template under the greenfield skill's assets
  (`../greenfield/assets/conventions/`, relative to this skill's directory — e.g.
  `rust.md`), read it as a starting point and adapt it to the project rather than
  copying it verbatim: fill in the `<!-- adapt -->` placeholders and drop sections that
  do not apply.
- **CLAUDE.md sections**: Add the missing sections based on what you can observe in the
  project (existing build files, directory structure, etc.).
- **Just recipes**: Propose standard recipes based on the project's build tool.
- **Reviewer agents**: The plugin defaults cover the common cases. Only suggest
  creating local reviewers when (a) the project's stack isn't covered by the plugin
  set, or (b) the user wants to override a plugin reviewer's behaviour for this
  project. Don't propose copies of plugin reviewers just for the sake of having them
  locally.
- **BACKLOG.md**: If missing, offer to scaffold one alongside the project plan by
  copying the starter template from the greenfield skill's assets
  (`../greenfield/assets/backlog-template.md`, relative to this skill's directory).
  Then ensure CLAUDE.md's Documentation Index references it.

Present each scaffold proposal as a strong default: "I'll create X with this content
unless you'd like changes." Proceed unless the user objects.

## Notes

- Do not modify source code, build files, or configuration outside `.claude/` and `docs/`
  unless the user explicitly requests it.
- Convention files should be comprehensive — see existing examples in `.claude/conventions/`
  for the expected level of detail.
- This skill can be run repeatedly. It's idempotent — it only flags what's actually missing.
