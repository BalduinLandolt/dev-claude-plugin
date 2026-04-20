# dev — Claude Code workflow harness plugin

A structured agent workflow harness for [Claude Code](https://claude.ai/code). Provides
skills and agents for investigating tasks, planning, reviewing, implementing, and learning
from completed work.

## What it does

The plugin provides a full development workflow:

1. **Investigate** — read the project plan, propose the next task
2. **Plan** — create PRD and implementation plans collaboratively
3. **Review** — spawn reviewer agents in parallel, loop until clean
4. **Implement** — execute the plan test-first, with review checkpoints
5. **Learn** — process issues into documentation improvements

Plus supporting skills:

- **greenfield** — set up a new project from scratch with standard conventions
- **audit** — check an existing project for harness readiness, scaffold gaps
- **prepare-pr** — clean up git history and create a pull request

## Skills

| Skill | Purpose |
|---|---|
| `/dev:next` | Run the full workflow for the next project plan item |
| `/dev:investigate` | Propose the next task to work on |
| `/dev:plan` | Create planning documents (PRD, implementation plans) |
| `/dev:review-plan` | Review a plan with all discovered reviewers |
| `/dev:implement` | Execute an approved plan |
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

Reviewers are discovered dynamically — add or remove reviewer files to control which ones
run. Each reviewer reads project-specific criteria from `.claude/conventions/` files.

### Learning
- **doc-improver** — triage implementation issues into documentation fixes

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

Use `/dev:greenfield` to set up a new project, or `/dev:audit` to check an existing one.

## Acknowledgments

This harness draws inspiration from Kieran Klaassen's
[Compound Engineering](https://every.to/guides/compound-engineering) approach to structured
AI-assisted development, and from similar internal tooling at [DaSCH](https://dasch.swiss/).
The design and implementation are my own.

## License

MIT
