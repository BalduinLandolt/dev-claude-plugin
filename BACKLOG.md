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

Today the outer agent (the one driving `/dev:next`) reads plans, drafts
plans, applies review fixes, writes implementation code, and so on —
all in its own context window. By the end of a `full`-mode cycle the
context is heavy with plan drafts, review reports, code diffs, and
issue-journal noise, even though most of that detail isn't needed at
the orchestrator level.

Worth investigating a more delegated topology where the outer agent is
purely a coordinator and the actual work happens in subagents whose
contexts are discarded after each stage:

- **Plan drafting** by a subagent — produces a draft plan plus a list
  of open questions. The orchestrator only sees the questions, elevates
  them to the user, then dispatches a follow-up subagent to finalise
  the plan with the answers.
- **Plan review loop** run inside a coordinator subagent that spawns
  reviewers, applies the fixes, and re-runs until clean. The orchestrator
  only sees the final clean plan plus a summary of what changed during
  review.
- **User sign-off** of the finalised plan happens at the orchestrator
  level (humans only talk to the outer agent), then implementation is
  handed off to a subagent.
- **Implementation** by a subagent that owns the whole code-writing
  phase. Orchestrator sees a summary diff plus the issue journal path,
  not every file edit.
- **Implementation review loop** by another coordinator subagent,
  same pattern as the plan review loop.

If this works, the orchestrator's context stays roughly constant
regardless of task size, which is the main win — long cycles currently
push it into compaction territory.

Side benefit: many of these subagent roles can drop from Opus to Sonnet
(plan-review-coordinator, implementation-review-coordinator, possibly
plan-drafter) since they're pattern-matching against criteria rather
than doing open-ended reasoning. The drafting and implementation
subagents probably stay on Opus. Worth measuring.

Open design questions:

- How does the orchestrator stay informed enough to make routing
  decisions (e.g. "is this big enough to warrant the full tier") without
  reading the full task context? Probably needs a structured handoff
  format: each subagent returns a short orchestrator-facing summary
  alongside its full output.
- Where does the issues journal live so subagents and the orchestrator
  both see it (overlaps with the `learn`-decoupling entry above).
- How are user course corrections during a long subagent run handled?
  The orchestrator can't see what the subagent is doing in real time.
- The `Skill` tool currently runs in the calling agent's context, so
  this likely needs the inner skills (`plan`, `review-plan`, etc.) to
  be invokable as Agent prompts, not just as Skill invocations. Check
  whether the existing skills already work that way or need adapting.

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
