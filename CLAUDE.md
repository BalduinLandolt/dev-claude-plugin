# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Claude Code plugin (`dev`) that provides a structured agent workflow harness for software development: investigate, plan, review, implement, learn. It is a pure-Markdown plugin — no build system, no runtime code, no tests. All content lives in skill definitions (`skills/*/SKILL.md`), agent definitions (`agents/**/*.md`), and plugin metadata (`.claude-plugin/`).

## Repository structure

```
.claude-plugin/          Plugin metadata (plugin.json, marketplace.json)
skills/                  Skill definitions — each subdirectory has a SKILL.md
  next/                  Workflow orchestrator (sizes the task, dispatches to a tier)
  ideate/                Upstream of investigate — explore problems and solutions
  investigate/           Propose a task (from project plan, or from argument)
  plan/                  Create planning documents (light: plan only; full: PRD + plan)
  review-plan/           Spawn reviewer agents on plans, loop until clean (full mode)
  implement/             Execute approved plans, with mode-appropriate review depth
  review-impl/           Spawn reviewer agents on code, loop until clean
  learn/                 Triage issues journal into doc improvements
  prepare-pr/            Clean up git history and create a PR
  greenfield/            Bootstrap a new project from scratch
  audit/                 Check harness readiness, scaffold gaps
agents/
  research/              Read-only agents spawned during planning (sonnet)
  review/                Reviewer agents spawned at review checkpoints (sonnet)
  learning/              Doc-improver agent for the learn phase (sonnet)
```

## Architecture

**Workflow pipeline**: `next` is the top-level orchestrator skill. It accepts an optional task description as argument (otherwise picks from the project plan), runs `investigate`, then prompts the user to pick a workflow mode (`minimal`, `light`, or `full`). The mode determines which downstream skills run and how heavy each one is:

- **minimal** — built-in plan mode → `implement` (single comprehensive review, no loop) → human verify → optional PR.
- **light** — `plan` (single document, no PRD) → human approval → `implement` (full review-impl loop) → human verify → `learn` → `prepare-pr`.
- **full** — `plan` (PRD + plan) → `review-plan` → human approval → `implement` (test-reviewer + full review-impl loop) → human verify → `learn` → `prepare-pr`.

`ideate` is upstream of `investigate` and optional. Use it to explore problems or sanity-check ideas before committing to a workflow run. Skills invoke each other via the `Skill` tool.

**Agent spawning**: Skills spawn agents via the `Agent` tool. Research agents are read-only (Glob/Grep/Read only). Reviewer agents are also read-only. The doc-improver agent can write. All sub-agents use the `sonnet` model (set in frontmatter).

**Dynamic reviewer discovery**: Review skills glob for `*.md` in `.claude/agents/review/` of the *consuming project* (not this plugin). This means the reviewer set is controlled by whoever installs the plugin — add or remove reviewer files to change which reviewers run. The plugin ships its own reviewer definitions in `agents/review/` as templates.

**Convention-driven reviews**: Each reviewer agent reads a corresponding convention file from the consuming project's `.claude/conventions/` directory (e.g., `correctness-reviewer` reads `.claude/conventions/correctness.md`). If no convention file exists, the reviewer falls back to generic checks.

**Review loop**: Both `review-plan` and `review-impl` follow the same pattern: spawn all reviewers in parallel → collect findings (Critical/Warning/Suggestion) → fix Critical and Warning findings → re-spawn all reviewers → repeat until clean. The skill itself fixes findings rather than escalating to the user, unless a product decision is genuinely needed.

**Allium integration**: When consuming projects use behavioral specs (`.allium` files), the workflow integrates with Allium skills (`/allium:elicit`, `/allium:tend`, `/allium:propagate`, `/allium:weed`) during planning and implementation.

## Editing conventions

- Skill files use YAML frontmatter (`name`, `description`, `allowed-tools`, optionally `argument-hint`) followed by Markdown instructions.
- Agent files use YAML frontmatter (`name`, `description`, `model`, `tools`) followed by Markdown instructions.
- All reviewer agents must output in the standardized format: `## [Type] Review` with `### Critical`, `### Warning`, `### Suggestion`, `### Summary` sections.
- Skills reference consuming-project paths (CLAUDE.md, `.claude/conventions/`, `docs/design/plans/`) — these are paths in projects that install the plugin, not paths in this repo.

## Releasing

- **Bump the version in `.claude-plugin/plugin.json` on every change before pushing to `main`.** Claude Code's plugin auto-update mechanism keys off this version field, so unbumped pushes do not propagate to installed clients. Use semver: patch for doc/wording fixes, minor for new skills/agents or behavioural additions, major for breaking changes to skill contracts.
- **Pushing directly to `main` is acceptable in this repo** as long as the version bump above is included in the push. No PR is required; this is a solo-maintained plugin and the version bump is the release gate. Still run the git preflight checks (right repo, right branch, recent history) before pushing.
