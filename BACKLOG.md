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

This is distinct from `NOTES.md`, which is a different kind of holding pen:
NOTES.md captures *deferred optimizations* — ideas already explored in depth,
with decision history, that we chose not to apply yet. The backlog is for
fresh "by the way" ideas that haven't been thought through.

## Open entries

### Reviewer registry duplicated across two files

The 9 plugin reviewer names (`dev:review:architecture-reviewer` … `spec-compliance-reviewer`)
are listed verbatim in two places: `skills/review-plan/SKILL.md` step 1 and
`skills/review-impl/SKILL.md` step 3. Each list is authored independently, but
adding or removing a reviewer means updating both in sync, with no enforcement
that they stay aligned.

Options when this gets refactored: extract a `REVIEWERS.md` reference file that
each skill points to (compactness vs. explicit-context tradeoff), or add an
audit check that compares the two lists. Deferred because the registry is
stable in practice.

### test-reviewer agent location ambiguity

`agents/test-reviewer.md` lives at the root of `agents/` (no subdirectory),
which loads it as `dev:test-reviewer` under the namespacing rules. The
implement skill expects to spawn it as bare-name `test-reviewer` (project-local
override pattern). Two related issues:

1. The plugin's copy at `agents/test-reviewer.md` is reachable only as
   `dev:test-reviewer`, not as bare `test-reviewer`. Whether the bare-name
   spawn falls through to the namespaced version when no project-local copy
   exists is unverified.
2. Moving the file to `agents/review/test-reviewer.md` for shape-consistency
   with the other reviewer templates would expose it to the dynamic-discovery
   review-impl loop, which would spawn it during the regular final review —
   wrong behavior for an agent designed to run as a standalone single-round
   checkpoint.

A clean fix probably involves either documenting the bare-name expectation
explicitly (consuming projects must provide their own at
`.claude/agents/test-reviewer.md`, root, not in `review/`), or refactoring the
implement skill to spawn `dev:test-reviewer` directly when no project-local
override exists. Deferred because the existing implement skill already calls
it as bare-name and the wider behavior was working in practice.

### Push more of the workflow loop into subagents (parked)

Tried (0.9.0 / 0.10.0) and reverted (0.11.0) — see "Recently dropped" below
for what existed and why it was rolled back. What remains open: whether
some other topology can give the orchestrator context-isolation without
nested agent spawning. Subprocess isolation (a fresh `claude` invocation
per heavy step) is the obvious candidate but has its own setup and cost
overhead. Parked until either the platform-level depth-1 restriction
lifts, or someone has a reason to invest in subprocess isolation.

## Recently dropped

### Coordinator wrappers + post-hoc trace (0.11.0 revert)

Dropped. Removed `agents/coordinator/implement-coordinator.md`,
`review-impl-coordinator.md`, `review-plan-coordinator.md`, and the
`coordinator-trace.md` mechanism in implement / review-plan / review-impl
skill bodies. `/dev:next` now invokes downstream skills via the `Skill`
tool (skills run in the orchestrator's context); skills spawn workers and
reviewers at depth 1, which is the only depth Claude Code currently
supports reliably. The implement-worker agent stays — it is spawned at
depth 1 and still works.

Reason: nested agent spawning (orchestrator → coordinator → reviewer) was
the load-bearing assumption for the coordinator wrappers, and Claude Code
stopped reliably supporting it. Rolling back the client did not restore
the behaviour. The trace mechanism existed to defend the orchestrator's
opacity to coordinator internals — moot once the orchestrator sees skill
output directly. Tradeoff accepted: longer per-step context in the
orchestrator's window, but a system that actually runs.

## Recently promoted

### Decouple `learn` from the live session context

Done. The on-disk-journal and per-task-path concerns were already in place
(`docs/design/plans/<task>/issues.md`, written incrementally; `/dev:learn`
takes a task slug). This round (1) tightened the journal format with a
`Files` field and a self-contained-entries directive in `implement` so a
fresh session can triage without conversation history, and (2) gave the
journal an explicit lifecycle: `learn` renames it to `issues-processed.md`
in the same commit as the doc improvements, making re-runs a no-op.

### Promote `BACKLOG.md` from invoicer-local to a plugin convention

Done. `/dev:investigate` already read the backlog (commit `e860a6d`); this
round added it to `/dev:greenfield`'s standard document set with a starter
template (always at `docs/design/BACKLOG.md` since greenfield always creates
that directory), to `/dev:audit`'s Documentation Layout check and Phase 3
scaffold offer, and to the doc-improver triage rubric as a fifth category
"Backlog candidate" for tangential ideas that don't fit any existing doc.
