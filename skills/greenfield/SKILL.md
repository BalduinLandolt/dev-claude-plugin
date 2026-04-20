---
name: greenfield
description: Guide a user through setting up a new project from scratch — discover intent, identify needed documents, create them collaboratively, then scaffold the repo and agent harness. Use when starting from scratch, creating a new repo, bootstrapping a project, or the user says "new project" or "set up a project".
argument-hint: "[optional: project name or one-line description]"
allowed-tools:
  - Glob
  - Grep
  - Read
  - Write
  - Edit
  - Bash
  - Agent
  - Skill
  - AskUserQuestion
---

# Greenfield Project Setup

Guide the user through creating a new project from an empty directory. This is an
interactive, conversational process — not an automated one. You ask questions, the user
answers, you push back where reasoning is unclear, and together you build up the project's
foundation document by document.

## Principles

- **You are a guide, not a secretary.** Push back on unclear reasoning. Find gaps in the
  plan. Challenge assumptions. Ask "what about X?" when something is missing.
- **One document at a time.** Create each document collaboratively, then ask the user to
  review and confirm before moving to the next.
- **Progressive disclosure.** The user shouldn't need to hold the whole project in their
  head. Each phase builds on the previous one.
- **Conversation format.** Use AskUserQuestion for structured choices. Use free-form
  discussion when the topic needs exploration. Don't rush through — the quality of these
  documents determines the quality of all future agent work.

## Phase 1: Discover Intent

Goal: understand what the project is, who it's for, and what it does.

Ask questions to uncover:
- What is the project? What problem does it solve?
- Who are the users? What's their technical level?
- What are the core features? What's in scope vs. out of scope?
- What are the constraints (regulatory, technical, organizational)?
- What does the user already know they want vs. what's open?

Push back on:
- Vague requirements ("it should be easy to use" — what does that mean concretely?)
- Scope creep ("while we're at it..." — is this really v1?)
- Assumptions that skip over complexity ("just generate a PDF" — what format, what content?)

Output: `docs/design/INTENT.md` — what the project is, who it's for, what it does, non-goals.

## Phase 2: Identify Needed Documents

Based on the intent, propose which context documents the project needs. The standard set
is below, but not every project needs all of them — and some may need extras.

### Standard Document Set

**Foundational** (`docs/design/` — create first, other docs reference these):
1. `docs/design/INTENT.md` — already created in Phase 1
2. `docs/design/TECH_STACK.md` — technologies, frameworks, crates, tools
3. `docs/design/UX_UI_PRINCIPLES.md` — design principles, user profile, interaction patterns
4. `docs/process/CODING_CONVENTIONS.md` — style, naming, error handling, dev environment

**Design** (`docs/design/` — depend on foundational decisions):
5. `docs/design/ARCHITECTURE.md` — layers, module structure, data flow, key constraints
6. `docs/design/DATA_FORMAT_SPEC.md` — schemas, file formats, directory layout (if applicable)
7. Domain-specific specs (e.g., `docs/design/INVOICE_PDF_SPEC.md` — depends on the project)
8. Behavioral specs (`specs/*.allium`) — if the domain has state machines, invariants, or
   transition rules, use `/allium:elicit` to discover them during this phase

**Process** (`docs/process/` — reference all of the above):
8. `docs/process/TESTING_STRATEGY.md` — what to test, how, testing pyramid, TDD approach
9. `docs/process/REVIEW_GUIDELINES.md` — what "done" looks like, common mistakes
10. `docs/process/GIT_WORKFLOW.md` — branching, PRs, commit conventions
11. `docs/process/AI_AGENT_SETUP.md` — workflow harness, agent catalog, skills/commands
12. `docs/design/PROJECT_PLAN.md` — master task checklist with dependency graph

Present this list to the user and discuss:
- Which documents are relevant for this project?
- Are there domain-specific documents to add?
- What's the right creation order given dependencies?

## Phase 3: Create Documents

Work through the agreed document list in dependency order. For each document:

1. **Ask questions** to gather the information needed
2. **Draft the document** based on the answers
3. **Ask the user to review** and confirm before moving on
4. Repeat until all documents are done

### Creation Order

The order matters because later documents reference earlier ones:

**Round 1 — Foundational decisions:**
- Tech Stack (what we're building with)
- UX/UI Principles (who we're building for)
- Coding Conventions (how we write code)

**Round 2 — Design:**
- Architecture (how the system is structured)
- Data format specs (what the data looks like)
- Domain-specific specs (output formats, protocols, etc.)

**Round 3 — Process:**
- Testing Strategy (how we verify quality)
- Review Guidelines (what "done" means)
- Git Workflow (how code moves through the pipeline)
- AI Agent Setup (how agents work on this project)
- Project Plan (what needs to be built, in what order)

## Phase 4: Initialize the Repo

Once all documents exist:

1. Initialize git with an empty commit
2. Add `.gitignore` (tailored to the tech stack)
3. Commit the documentation
4. Create `CLAUDE.md` with the sections that other skills depend on:
   - Project one-liner
   - **Build & Test Commands** — the standard recipe set (see Phase 5)
   - **Architecture** — brief summary (detail goes in convention files)
   - **Documentation Index** — one-line descriptions of all doc locations, including
     `.claude/conventions/` ("Project-specific review criteria for each reviewer agent")
   - If the project uses behavioral specs, a **Behavioral Specifications** section listing
     where they live
5. Commit CLAUDE.md
6. Create GitHub remote (ask public/private)
7. Push

## Phase 5: Scaffold the Project

Based on the tech stack:

1. Set up the dev environment (Nix flake, or whatever the project uses)
2. Create the minimal project scaffold (compiles and runs)
3. Set up a command runner with **standard recipes as strong defaults** — propose these
   unless the user objects:
   - `just dev` — run in development mode
   - `just test` — run tests
   - `just lint` — run linter
   - `just fmt-check` — check formatting
   - `just build` — build for production
   - Plus project-specific recipes as needed (e.g., `just test-all` for slow tests)
   - If the user prefers a different tool (make, cargo-make, npm scripts), adapt the
     recipe names but keep the same standard interface
4. Set up CI (GitHub Actions or similar)
5. Commit each piece separately with clear messages

## Phase 6: Build the Agent Harness

If the project uses the agent workflow (AI_AGENT_SETUP.md):

1. Create agent definitions in `.claude/agents/`
2. Create skill definitions in `.claude/skills/`
3. **Create convention files** in `.claude/conventions/` based on the project's tech stack
   and architecture decisions. Propose which convention files are needed:
   - Always: `architecture.md`, `security.md`, `simplicity.md`, `correctness.md`,
     `consistency.md`, `docs.md`
   - Stack-specific: `rust.md` for Rust projects, `frontend.md` for projects with a
     frontend, etc.
   - Ask the user if they need custom reviewers for domain-specific concerns
4. Run the review skills on the harness itself to catch issues
5. Fix findings, re-review until clean
6. **Self-check**: run `/dev:audit` to verify the scaffolded project has everything the
   harness needs
7. Commit and push

## Phase 7: Verify

At the end, verify:
- [ ] All agreed documents exist and are consistent with each other
- [ ] CLAUDE.md indexes all documents (including `.claude/conventions/`)
- [ ] The project compiles and runs
- [ ] CI passes
- [ ] Convention files exist for all relevant review concerns
- [ ] The agent harness is functional (test with `/dev:review-plan` or similar)
- [ ] `/dev:audit` reports a clean state
- [ ] PROJECT_PLAN.md has the first items checked off (repo init, scaffold, harness)
- [ ] The user is satisfied with the foundation

## Notes

- This process typically takes one long session or 2-3 shorter ones
- The most important phase is Phase 1 (Intent) — everything else follows from it
- Don't skip the review step after each document — early mistakes compound
- The agent harness (Phase 6) is optional but recommended for AI-driven projects
- Adapt the standard document set to the project — not every project needs all 12 docs
