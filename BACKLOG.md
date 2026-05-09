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

### Push more of the loop into subagents to keep the orchestrator context empty

Today the outer agent (the one driving `/dev:next`) reads plans, applies
review fixes, writes implementation code, and so on, all in its own context
window. By the end of a `full`-mode cycle the context is heavy with plan
drafts, review reports, code diffs, and issue-journal noise, even though
most of that detail isn't needed at the orchestrator level. Long cycles
currently push the orchestrator into compaction territory.

The fix is a more delegated topology: the orchestrator coordinates, and the
heavy lifting happens in subagents whose contexts are discarded after each
stage. Skill bodies load into the calling agent's context when invoked via
the `Skill` tool, so the way to get isolation is to spawn an `Agent` that
then invokes the skill in *its* context. No skill rewrite needed.

Layered proposal:

#### MVP: review loops as coordinator subagents

Smallest unit of value. `/dev:review-plan` and `/dev:review-impl` are
already mechanical loops (spawn reviewers, collect findings, fix, re-spawn
until clean) with structured output. Wrap each loop in a coordinator
subagent. The orchestrator only sees the final clean artefact plus a short
summary of what changed during review.

Reasons this is a good MVP:

- No user-in-the-loop during a single round, so the subagent can run to
  convergence without yielding.
- Reviewer output is already structured (Critical / Warning / Suggestion).
- Easy to measure: compare orchestrator-context tokens on one full-tier
  run before and after.
- The coordinator role is pure pattern-matching; can run on Sonnet.

#### Stretch: implementation as coordinator + stateless workers

Don't build a monolithic implementation subagent. It would suffer the
same context bloat the orchestrator has, just one layer down. Instead:

- **Coordinator subagent** (Opus) holds the loop. It reads the plan, finds
  the next unchecked step, spawns a worker for that step, reads the
  worker's structured report, appends to the issues journal, and decides
  whether to continue or yield to the orchestrator.
- **Worker subagent** (Sonnet) is given only the current step plus the
  relevant file paths. It writes code, runs tests, returns a structured
  report. It doesn't spawn other agents, doesn't run reviewers, doesn't
  decide what's next. Its context is discarded after each step.
- **State lives on disk**, not in the coordinator's context: plan
  checkboxes, issues journal, optional worklog. The repo already has all
  the disk artefacts this needs.
- **Yields to the orchestrator** at natural checkpoints: review-unit
  boundaries (matches `893fb47`), blocking user questions, plan exhausted.
  The orchestrator gives the user a chance to course-correct, then resumes
  the coordinator.

Termination criteria map onto current `/dev:implement` completion: plan
steps all checked off, tests pass, reviewers clean. No new logic.

#### Probably never: plan drafting in subagents

Plan drafting is genuinely conversational (`/dev:plan` Phase 3 iterates
with the user across multiple question rounds). A subagent can't run a
back-and-forth dialogue, and faking it via "subagent returns questions,
orchestrator escalates, second subagent finalises" is fragile and
multiplies the spawn count. Plan drafting should stay in the orchestrator
where the conversation already lives, and where the user expects to find
the agent they've been talking to.

#### Open design questions

- **Worker→coordinator handoff schema.** Without a hard structure, worker
  reports become unbounded prose and coordinator context bloats. Schema
  needs a length cap with a "details on disk at <path>" escape hatch.
  The coordinator→orchestrator schema is the same shape, summarised
  further. Designing the worker schema gives the orchestrator schema for
  free.
- **Coordinator's own context budget.** Across many worker iterations,
  even a thin coordinator can fill up. Worth measuring once the MVP
  exists.
- **User course corrections during a long subagent run.** The orchestrator
  can't see the subagent in real time. The yield-at-checkpoint design
  partly answers this: if the user has a redirect, they raise it at the
  next yield. Long stretches without yields are the failure case.
- **Sub-subagent spawning depth.** The implementation coordinator spawns
  workers; review coordinators spawn reviewers (already do). Confirm
  there's no practical ceiling on Agent-spawning-Agent depth in Claude
  Code.

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

## Recently dropped

_(none yet)_
