# dev — Claude Code workflow harness plugin

A structured agent workflow harness for [Claude Code](https://claude.ai/code). Provides
skills and agents for investigating tasks, planning, reviewing, implementing, and learning
from completed work.

## What it does

The plugin provides a full development workflow:

1. **Ideate** *(optional)* — turn a vague problem or half-formed idea into a concrete next step
2. **Investigate** — pick from the project plan, or scope a user-provided task
3. **Shape** — one adaptive judgment of how much ceremony the task needs, confirmed with you (surface-and-veto)
4. **Plan** — an implementation plan, plus a PRD when the task warrants one
5. **Review** — fan out reviewer agents through an isolated Workflow, verify findings, loop until clean
6. **Implement** — execute the plan, dispatching steps to workers, with review checkpoints
7. **Learn** — process issues into documentation improvements

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
| `/dev:plan` | Create planning documents (implementation plan; PRD when warranted) |
| `/dev:review-plan` | Review a plan with all discovered reviewers (run when the task's shape calls for it) |
| `/dev:implement` | Execute an approved plan with review checkpoints |
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

### Worker
- **implement-worker** — stateless per-step executor: writes tests + code, runs
  tests, returns a ~200-word report, context discarded after each step

`/dev:next` invokes the downstream skills via the `Skill` tool, so the
orchestration chain stays in one window. `implement` dispatches each plan step
to a worker subagent; `review-impl` and `review-plan` run their reviewer
fan-out through an isolated Workflow (falling back to direct agent spawns when
the Workflow tool isn't available), so reviewer transcripts stay out of the
orchestrator's context.

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
   project-specific criteria (architecture rules, threat model, language idioms, etc.).
   You don't have to write these from scratch: for stacks the plugin ships a starter
   template for (e.g. Rust), `/dev:greenfield` and `/dev:audit` adapt it to your project.
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
