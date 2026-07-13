# Backlog

Holding pen for "by the way" ideas that surface mid-task — things we don't
want to lose but aren't ready to commit to as real work. Each entry stays
here until it is either:

- **promoted** into an actual task (sized, with a place in the workflow), or
- **dropped** with a short reason, then deleted.

Before starting the next task, glance at this file. If it has entries,
propose triage to the user before picking up implementation work.
CLAUDE.md indexes this file so research agents pick it up as part of
their normal context sweep.

This is distinct from `NOTES.md`, which holds *applied and deferred
optimizations* with their decision history and the token-profiling evidence.

## Open entries

### Run the workflow on Sonnet 5

Sonnet 5 is now capable enough to orchestrate the workflow, and it is ~5× cheaper
per token than Opus. Since profiling put ~88% of cost on the orchestrator thread,
model choice there is a large lever — compounding with Phase B's context
reduction. Two facets: (a) recommend in the README/CLAUDE.md that users run
`/dev:next` on Sonnet 5 for cost; (b) in Phase B, run the heavy phase-driver
subagents on Sonnet 5 regardless of the top session's model (plugin-controllable
via spawn options). Deferred — revisit alongside Phase B (see NOTES.md).

## Recently dropped

### Coordinator wrappers + post-hoc trace (0.11.0 revert)

Dropped. Removed `agents/coordinator/implement-coordinator.md`,
`review-impl-coordinator.md`, `review-plan-coordinator.md`, and the
`coordinator-trace.md` mechanism. Nested agent spawning
(orchestrator → coordinator → reviewer) was the load-bearing assumption, and at
the time Claude Code only supported `Agent` reliably at depth 1. `/dev:next` now
invokes downstream skills via the `Skill` tool; skills spawn workers and reviewers
directly. (Depth-5 nesting is available again as of 2026 — see NOTES.md Phase B,
which revisits phase isolation on that basis.)

## Recently promoted

### Reviewer registry duplication — resolved (0.13.0)

The two review skills no longer hardcode the reviewer list. Both discover the
plugin reviewers by globbing `agents/review/` (the agent files *are* the registry)
and resolve project-local reviewers on top. Single source of truth.

### test-reviewer resolution — resolved (0.13.0)

`implement` now spawns the test-reviewer by preferring a project-local
`test-reviewer` and falling back to the plugin's `dev:test-reviewer`, so the
shipped agent is reachable in a zero-config project.

### Push more of the workflow loop into subagents — promoted to Phase B

Token profiling (NOTES.md) confirmed the single growing orchestrator context is
the dominant cost, making whole-phase isolation the top lever. Phase A (review
fan-out in a Workflow, code-fix dispatch, effort tuning, round cap) shipped in
0.13.0; Phase B (isolating the heavy non-interactive phases) is the active next
step, gated on a depth-2 nesting spike now that depth-5 is available.
