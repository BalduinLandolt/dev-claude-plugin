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
  coordinator/           Subagents that wrap review loops in isolated contexts (sonnet)
```

## Architecture

**Workflow pipeline**: `next` is the top-level orchestrator skill. It accepts an optional task description as argument (otherwise picks from the project plan), runs `investigate`, then prompts the user to pick a workflow mode (`minimal`, `light`, or `full`). The mode determines which downstream skills run and how heavy each one is:

- **minimal** — built-in plan mode → `implement` (single comprehensive review, no loop) → human verify → optional PR.
- **light** — `plan` (single document, no PRD) → human approval → `implement` (full review-impl loop) → human verify → `learn` → `prepare-pr`.
- **full** — `plan` (PRD + plan) → `review-plan` → human approval → `implement` (test-reviewer + full review-impl loop) → human verify → `learn` → `prepare-pr`.

`ideate` is upstream of `investigate` and optional. Use it to explore problems or sanity-check ideas before committing to a workflow run. Skills invoke each other via the `Skill` tool.

**Agent spawning**: Skills spawn agents via the `Agent` tool. Research agents are read-only (Glob/Grep/Read only). Reviewer agents are also read-only. The doc-improver agent can write. All sub-agents use the `sonnet` model (set in frontmatter).

**Reviewer discovery**: The reviewer set is the union of the plugin's built-in reviewers (loaded as `dev:review:*` from this repo's `agents/review/`) and any project-local reviewers in the consuming project's `.claude/agents/review/`. Resolution: a local reviewer with the same bare name as a plugin reviewer **overrides** the plugin one; otherwise local reviewers are **additive**. A consuming project can drop a plugin reviewer entirely by listing it under a `## Disabled reviewers` section in its `CLAUDE.md`. The result: zero-config projects get the full plugin set automatically; projects that want to customise can override per-reviewer or disable per-reviewer without affecting the rest.

**Convention-driven reviews**: Each reviewer agent reads a corresponding convention file from the consuming project's `.claude/conventions/` directory (e.g., `correctness-reviewer` reads `.claude/conventions/correctness.md`). If no convention file exists, the reviewer falls back to generic checks.

**Review loop**: Both `review-plan` and `review-impl` follow the same pattern: spawn all reviewers in parallel → collect findings (Critical/Warning/Suggestion) → fix Critical and Warning findings → re-spawn all reviewers → repeat until clean. The skill itself fixes findings rather than escalating to the user, unless a product decision is genuinely needed.

**Coordinator wrappers (context isolation)**: The orchestrator (`/dev:next`) does not invoke the heavy skills directly. Instead it spawns coordinator subagents that run the underlying skill in their own contexts and return a compact structured summary. This keeps the bulk of the per-step and per-reviewer artefacts out of the orchestrator's window. Three coordinators live in `agents/coordinator/`:

- `dev:coordinator:review-plan-coordinator` — wraps `/dev:review-plan`.
- `dev:coordinator:review-impl-coordinator` — wraps `/dev:review-impl`.
- `dev:coordinator:implement-coordinator` — wraps `/dev:implement`. Inside its loop the implement skill body spawns stateless `dev:coordinator:implement-worker` agents per plan step (worker writes tests + code + runs tests, returns a ~200-word report, context discarded). The coordinator owns plan checkboxes, the issues journal, commit boundaries, and the review-checkpoint spawns. At the final review checkpoint the skill body spawns `dev:coordinator:review-impl-coordinator`, which in turn spawns reviewers — total spawn depth from the orchestrator is 3 (orchestrator → implement-coordinator → review-impl-coordinator → reviewer). Workers carry no `Agent`, `Skill`, or `AskUserQuestion` tool: blockers bubble up via the report and the skill body escalates if needed.

**Coordinator trace (post-hoc audit)**: Because the orchestrator only sees compact coordinator summaries, there is no built-in way to verify a coordinator followed its contract (which subagents it spawned, in what order, what each returned). To address this, the implement / review-plan / review-impl skill bodies append structural entries to `docs/design/plans/<task>/coordinator-trace.md` throughout a run. Skipped in minimal mode (no plan directory). The trace is implementation scratch: deleted by `/dev:learn` alongside `worker-logs/`. Each coordinator summary also includes a "Run trace" section with broad-strokes bullets so the orchestrator and user see *what happened*, not just *what was delivered*.

**Agent namespacing**: Plugin-provided agents (those shipped in this repo's `agents/` tree) are loaded by Claude Code with a `dev:<category>:` prefix, where `<category>` is the subdirectory under `agents/` (`coordinator`, `review`, `research`, `learning`). Spawn them by their full namespaced name. Project-local agents that consuming projects place under their own `.claude/agents/review/` are loaded without a prefix and addressed by bare name (e.g., `architecture-reviewer`, `test-reviewer`). The review skills glob the consuming project's directory, so they use bare names; the orchestrator spawns plugin-provided coordinators, so it uses the namespaced form.

**Allium integration**: When consuming projects use behavioral specs (`.allium` files), the workflow integrates with Allium skills (`/allium:elicit`, `/allium:tend`, `/allium:propagate`, `/allium:weed`) during planning and implementation.

## Documentation index

- `README.md` — user-facing plugin overview (install, modes, what each skill does).
- `NOTES.md` — deferred optimisations: ideas explored in depth with decision history but not yet applied.
- `BACKLOG.md` — holding pen for "by the way" ideas surfaced mid-task; triaged before starting the next task.

## Editing conventions

- Skill files use YAML frontmatter (`name`, `description`, `allowed-tools`, optionally `argument-hint`) followed by Markdown instructions.
- Agent files use YAML frontmatter (`name`, `description`, `model`, `tools`) followed by Markdown instructions.
- All reviewer agents must output in the standardized format: `## [Type] Review` with `### Critical`, `### Warning`, `### Suggestion`, `### Summary` sections.
- Skills reference consuming-project paths (CLAUDE.md, `.claude/conventions/`, `docs/design/plans/`) — these are paths in projects that install the plugin, not paths in this repo.

## Releasing

- **Bump the version in `.claude-plugin/plugin.json` on every change before pushing to `main`.** Claude Code's plugin auto-update mechanism keys off this version field, so unbumped pushes do not propagate to installed clients. Use semver: patch for doc/wording fixes, minor for new skills/agents or behavioural additions, major for breaking changes to skill contracts.
- **Pushing directly to `main` is acceptable in this repo** as long as the version bump above is included in the push. No PR is required; this is a solo-maintained plugin and the version bump is the release gate. Still run the git preflight checks (right repo, right branch, recent history) before pushing.
