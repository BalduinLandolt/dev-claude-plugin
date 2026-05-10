# dev — Claude Code workflow harness plugin

A structured agent workflow harness for [Claude Code](https://claude.ai/code). Provides
skills and agents for investigating tasks, planning, reviewing, implementing, and learning
from completed work.

## What it does

The plugin provides a full development workflow:

1. **Ideate** *(optional)* — turn a vague problem or half-formed idea into a concrete next step
2. **Investigate** — pick from the project plan, or scope a user-provided task
3. **Size** — choose a workflow tier (minimal, light, full) appropriate to the task
4. **Plan** — produce planning documents matched to the tier
5. **Review** — spawn reviewer agents in parallel, loop until clean (default in full; opt-in in light)
6. **Implement** — execute the plan with mode-appropriate review checkpoints
7. **Learn** — process issues into documentation improvements (light, full)

Plus supporting skills:

- **greenfield** — set up a new project from scratch with standard conventions
- **audit** — check an existing project for harness readiness, scaffold gaps
- **prepare-pr** — clean up git history and create a pull request

## Skills

| Skill | Purpose |
|---|---|
| `/dev:next [task]` | Run the workflow for the next plan item, or for a task description given as argument |
| `/dev:ideate` | Turn a vague problem or half-formed idea into a concrete next step |
| `/dev:investigate` | Propose the next task to work on (from plan or from argument) |
| `/dev:plan` | Create planning documents (light: plan only; full: PRD + plan) |
| `/dev:review-plan` | Review a plan with all discovered reviewers (full mode by default; opt-in from light mode) |
| `/dev:implement` | Execute an approved plan with mode-appropriate review checkpoints |
| `/dev:review-impl` | Review implementation code with all discovered reviewers |
| `/dev:learn` | Process the issues journal into doc improvements |
| `/dev:prepare-pr` | Clean up history, push, and create a PR |
| `/dev:greenfield` | Bootstrap a new project with standard conventions |
| `/dev:audit` | Check harness readiness and scaffold missing pieces |

## Agents

### Research (read-only, spawned during planning)
- **codebase-researcher** — explore current code state
- **docs-and-learnings-researcher** — find relevant documentation
- **framework-researcher** — fetch framework/library docs
- **topic-researcher** — targeted web research

### Review (read-only, spawned at review checkpoints)

Always applicable:
- **correctness-reviewer**, **simplicity-reviewer**, **security-reviewer**,
  **consistency-reviewer**, **architecture-reviewer**, **docs-reviewer**,
  **spec-compliance-reviewer**

Stack-specific:
- **rust-reviewer**, **frontend-reviewer**

The plugin's reviewers run by default in any consuming project (no copy needed). A
project can add its own reviewers under `.claude/agents/review/` — same-name files
override the plugin reviewer; differently-named files are additive. To drop a plugin
reviewer entirely without replacing it, list its name under a `## Disabled reviewers`
section in the project's `CLAUDE.md`. Each reviewer reads project-specific criteria
from `.claude/conventions/` files.

### Learning
- **doc-improver** — triage implementation issues into documentation fixes

### Coordinator (context-isolation wrappers)
- **review-plan-coordinator** — runs `/dev:review-plan` in an isolated subagent
  context, returns a compact structured summary
- **review-impl-coordinator** — runs `/dev:review-impl` in an isolated subagent
  context, returns a compact structured summary
- **implement-coordinator** — runs `/dev:implement` in an isolated subagent
  context, returns a compact structured summary; inside its loop the implement
  skill spawns one stateless **implement-worker** per plan step
- **implement-worker** — stateless per-step executor: writes tests + code, runs
  tests, returns a ~200-word report, context discarded after each step

`/dev:next` spawns the review-plan-coordinator and the implement-coordinator
directly. The implement-coordinator (via the implement skill body) spawns the
implement-worker agents and the review-impl-coordinator at its review checkpoints.
The orchestrator's context only sees the coordinator summaries, not the per-step
worker reports, per-reviewer findings, or fix histories.

## Installation

```bash
# Add the marketplace
claude plugin marketplace add BalduinLandolt/dev-claude-plugin

# Install the plugin
claude plugin install dev@dev-claude-plugins
```

Or add to your project's `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "dev@dev-claude-plugins": true
  },
  "extraKnownMarketplaces": {
    "dev-claude-plugins": {
      "source": {
        "source": "github",
        "repo": "BalduinLandolt/dev-claude-plugin"
      }
    }
  }
}
```

## Project setup

The plugin expects consuming projects to provide:

1. **CLAUDE.md** — with build commands, documentation index, and architecture summary.
   Skills use CLAUDE.md to find project-specific paths.
2. **`.claude/conventions/`** — convention files that reviewer agents read for
   project-specific criteria (architecture rules, threat model, language idioms, etc.)
3. **Standard build recipes** — `just test`, `just lint`, `just fmt-check`, `just build`,
   `just dev` (or equivalent)
4. **`docs/design/BACKLOG.md`** *(or alongside the project plan, wherever that lives)* — a
   holding pen for "by the way" ideas surfaced mid-task. `/dev:investigate` reads it before
   proposing work, `/dev:learn` writes tangential ideas to it, and `/dev:audit` checks
   for it. Scaffolded automatically by `/dev:greenfield`.

Use `/dev:greenfield` to set up a new project, or `/dev:audit` to check an existing one.

## Acknowledgments

This harness draws inspiration from Kieran Klaassen's
[Compound Engineering](https://every.to/guides/compound-engineering) approach to structured
AI-assisted development, and from similar internal tooling at [DaSCH](https://dasch.swiss/).
The design and implementation are my own.

## License

MIT
