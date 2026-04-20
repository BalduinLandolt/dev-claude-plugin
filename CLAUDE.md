# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Claude Code plugin (`dev`) that provides a structured agent workflow harness for software development: investigate, plan, review, implement, learn. It is a pure-Markdown plugin — no build system, no runtime code, no tests. All content lives in skill definitions (`skills/*/SKILL.md`), agent definitions (`agents/**/*.md`), and plugin metadata (`.claude-plugin/`).

## Repository structure

```
.claude-plugin/          Plugin metadata (plugin.json, marketplace.json)
skills/                  Skill definitions — each subdirectory has a SKILL.md
  next/                  Full workflow orchestrator (investigate → learn)
  investigate/           Propose the next task from a project plan
  plan/                  Create PRD and implementation plans
  review-plan/           Spawn reviewer agents on plans, loop until clean
  implement/             Execute approved plans test-first
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

**Workflow pipeline**: `next` is the top-level orchestrator skill. It invokes the other skills in sequence: `investigate` → `plan` → `review-plan` → (human approval) → `implement` (which internally calls `review-impl`) → (human verification) → `learn` → `prepare-pr`. Skills invoke each other via the `Skill` tool.

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
