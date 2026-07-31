# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Claude Code plugin (`dev`) that provides a structured agent workflow harness for software development: investigate, plan, review, implement, learn. It is a pure-Markdown plugin — no build system, no runtime code, no tests. All content lives in skill definitions (`skills/*/SKILL.md`), agent definitions (`agents/**/*.md`), and plugin metadata (`.claude-plugin/`).

## Repository structure

```
.claude-plugin/          Plugin metadata (plugin.json, marketplace.json)
skills/                  Skill definitions — each subdirectory has a SKILL.md
  next/                  Adaptive workflow orchestrator (sizes ceremony per task)
  continue/              Resume an in-progress task mid-workflow in a fresh session
  ideate/                Upstream of investigate — explore problems and solutions
  investigate/           Propose a task (from project plan, or from argument)
  plan/                  Create planning documents (implementation plan; PRD when warranted)
  review-plan/           Discover + gate + fan out plan reviewers, verify, loop until clean
  implement/             Execute approved plans; dispatch steps to workers
  review-impl/           Discover + gate + fan out code reviewers, verify, loop until clean
  learn/                 Triage issues journal into doc improvements
  prepare-pr/            Clean up git history and create a PR
  greenfield/            Bootstrap a new project from scratch
  audit/                 Check harness readiness, scaffold gaps
agents/
  research/              Read-only agents spawned during planning
  review/                Reviewer agents spawned at review checkpoints
  learning/              Doc-improver agent for the learn phase
  coordinator/           implement-worker + phase-runner + finding-verifier subagents
```

## Architecture

**Workflow pipeline**: `next` is the top-level orchestrator skill. It accepts an optional task description as argument (otherwise picks from the project plan), runs `investigate`, then makes one adaptive judgment of how much ceremony the task needs and confirms that shape with the user (surface-and-veto). From there it sizes each optional point itself: whether to write a plan document or work from a throwaway sketch, whether the plan needs a PRD, whether to run a `review-plan` pass, how deep the implementation review loops, and whether to deliver via PR or direct-to-main. Four human gates are unconditional — task confirmation, the shape veto, plan approval, and verification.

The downstream skills (`plan`, `review-plan`, `implement`, `review-impl`, `learn`, `prepare-pr`) run as the shape dictates; `next` invokes them via the `Skill` tool. `ideate` is upstream of `investigate` and optional — use it to explore problems or sanity-check ideas before committing to a run. `continue` is a second entry point alongside `next`: for a task that spans sessions, it detects how far the work got from on-disk state (branch, plan `status`, checked steps, journal, PR), confirms a resume point, and re-enters `next`'s phases there — `next` remains the single source of truth for the phases; `continue` only picks where to start.

**Research placement**: `investigate` does a **light self-scan** (direct Glob/Grep/Read, no research subagents) — just enough to propose and size a task. The deep parallel research fan-out lives in `plan`, which runs only after the task and its shape are confirmed. This keeps research from firing speculatively (before task confirmation, or on a trivial task that skips `plan` entirely) and removes the old duplication where both skills ran the same researchers.

**Agent spawning**: Skills spawn agents via the `Agent` tool. Research agents are read-only (Glob/Grep/Read); reviewer agents and the `finding-verifier` are also read-only; the doc-improver and implement-worker can write. Sub-agents run on Sonnet, except `docs-reviewer` (Haiku) and the `correctness`/`security` reviewers (Opus — the two highest-stakes checks), with a per-agent `effort` set in frontmatter: `high` for correctness/security, `medium` for rust and the framework/topic researchers and test-reviewer, `low` for the rest. The `finding-verifier` runs on Sonnet at medium effort. `implement-worker` inherits the session effort so its code-writing is not starved.

**Reviewer discovery**: The reviewer set is the union of the plugin's built-in reviewers (loaded as `dev:review:*` from this repo's `agents/review/`) and any project-local reviewers in the consuming project's `.claude/agents/review/`. Resolution: a local reviewer with the same bare name as a plugin reviewer **overrides** the plugin one; otherwise local reviewers are **additive**. A consuming project can drop a plugin reviewer entirely by listing it under a `## Disabled reviewers` section in its `CLAUDE.md`. The result: zero-config projects get the full plugin set automatically; projects that want to customise can override per-reviewer or disable per-reviewer without affecting the rest.

**Convention-driven reviews**: Each reviewer agent reads a corresponding convention file from the consuming project's `.claude/conventions/` directory (e.g., `correctness-reviewer` reads `.claude/conventions/correctness.md`). If no convention file exists, the reviewer falls back to generic checks. Starter templates for stack-specific convention files live in `skills/greenfield/assets/conventions/` (e.g. `rust.md`); the `greenfield` and `audit` skills read them and **adapt** them to the consuming project rather than copying verbatim.

**Review loop**: Both `review-plan` and `review-impl` own their fan-out directly (there is no Workflow script — it was removed as excessive and opaque). Each skill: discovers the reviewer set → **relevance-gates** it to the reviewers whose domain the change actually touches (a small stack-agnostic core — correctness, consistency, simplicity — plus `rerun: always`, always run; everything else gated on evidence in the diff/plan) → fans out the survivors as parallel `Agent` spawns → **dedups findings across reviewers** so one underlying problem raised by several reviewers becomes one finding → spawns **one** `finding-verifier` subagent per unique Critical/Warning finding to adversarially refute it (Suggestions unverified) → triages and fixes (dispatching code fixes to a worker in `review-impl`; editing inline in `review-plan`) → re-runs a reduced reviewer set and loops until clean or a 3-round cap. Relevance-gating and cross-reviewer dedup are the two cost levers: previously every reviewer ran on every change and every finding got its own verifier, which multiplied into dozens of agents on small changes. Reviewer and verifier transcripts stay in their subagents; only compact findings and verdicts return. The skill fixes findings itself rather than escalating, unless a genuine product decision is needed.

**Skill invocation and spawn depth**: Two mechanisms move work around. (1) `Skill` invocations run the called skill body *in the caller's context* — no subagent boundary. The orchestrator uses this for the interactive phases (e.g. `plan`), and each phase-runner uses it to run its phase skill in its own context. (2) `Agent` spawns create a real subagent in its own context window: the orchestrator spawns the phase-runners at depth 1; a phase-runner runs its phase skill via `Skill` (same context) and that skill spawns *its* agents at depth 2 — `implement` → `implement-worker`, and `review-impl` → reviewers + `finding-verifier`s + fix-workers. Depth-5 nesting is available, so this composes. Reviewer/verifier output accumulating in the orchestrator context was a profiled top cost driver — so the entire review loop (fan-out, verification, and code-fixes) now runs inside its own phase-runner, off the main thread, and returns only a compact report. This is what the removed `Workflow` tool used to buy, minus the main-thread-only constraint: because `review-impl` owns its fan-out with plain `Agent` spawns, it can run in a phase-runner like any other non-interactive phase. Workers carry no `Agent`, `Skill`, or `AskUserQuestion` tool: blockers bubble up via the report.

**Phase isolation**: the non-interactive phases run inside a `dev:coordinator:phase-runner` subagent (Sonnet) that invokes the phase skill via `Skill` in its own context and returns a compact summary, keeping that phase's transcript off the orchestrator thread. `implement` (worker loop + test-reviewer checkpoint + commits + docs), `review-impl` (the whole gate → fan-out → verify → fix loop), `learn` (which spawns the doc-improver at depth 2), and `prepare-pr` (git cleanup + PR) all run this way — `implement` and `review-impl` are two separate phase-runner phases, run back to back. The runner has no `AskUserQuestion`: it returns blockers for the orchestrator to escalate, and the phase skills resume from on-disk state when re-spawned. `review-plan` is the exception among the review skills — it runs inline on the main thread because it sits inside the interactive plan/approval gate. The interactive spine (`investigate`, `plan`, and all human gates) stays on the main thread, since a subagent cannot talk to the user.

**Agent namespacing**: Plugin-provided agents (those shipped in this repo's `agents/` tree) are loaded by Claude Code with a `dev:<category>:` prefix, where `<category>` is the subdirectory under `agents/` (`coordinator`, `review`, `research`, `learning`). Spawn them by their full namespaced name (e.g., `dev:coordinator:implement-worker`, `dev:review:correctness-reviewer`). Project-local agents that consuming projects place under their own `.claude/agents/review/` are loaded without a prefix and addressed by bare name (e.g., `architecture-reviewer`, `test-reviewer`). The review skills glob the consuming project's directory, so they use bare names for locals and namespaced names for plugin reviewers.

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
- **Git discipline**: commit in coherent logical units with conventional-commit messages — not a stream of tiny WIP commits — and rebase a branch's noisy history into reviewable commits before merging (`git commit --fixup=<sha>` during work, then autosquash). This keeps `main` bisectable and squash-merges clean, so the maintainer isn't left tidying history after the fact.
