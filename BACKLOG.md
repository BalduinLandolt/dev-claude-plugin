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

### Reviewer registry duplicated across four files

The 9 plugin reviewer names (`dev:review:architecture-reviewer` … `spec-compliance-reviewer`)
are listed verbatim in four places: `skills/review-plan/SKILL.md` step 1,
`skills/review-impl/SKILL.md` step 1, `agents/coordinator/review-plan-coordinator.md`
step 1, and `agents/coordinator/review-impl-coordinator.md` step 1. Each list is
authored independently because LLM context per-agent is separate (no runtime DRY
benefit), but adding or removing a reviewer means updating all four in sync,
with no enforcement that they stay aligned.

Options when this gets refactored: extract a `REVIEWERS.md` reference file that
each skill / coordinator points to (compactness vs. explicit-context tradeoff),
or add an audit check that compares the four lists. Deferred because the registry
is stable in practice; surfaced during the registry-check rollout review.

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
override exists. Surfaced during round-2 review of the implement-coordinator
change; deferred because the existing implement skill already calls it as
bare-name and the wider behavior was working before this change.

### Plan drafting in subagents (subagent-topology entry, remaining tier)

The MVP (review loops as coordinator subagents) and the stretch
(implementation as coordinator + stateless workers) both shipped; see
"Recently promoted" below. What is left of the original "push more of the
loop into subagents" entry is just plan drafting.

Plan drafting is genuinely conversational (`/dev:plan` Phase 3 iterates
with the user across multiple question rounds). A subagent can't run a
back-and-forth dialogue directly, and the obvious workarounds (subagent
returns questions, orchestrator escalates, second subagent finalises)
look fragile and multiply the spawn count. The open question is whether
there's a topology that preserves the conversational quality without
keeping all of plan drafting in the orchestrator. Parked until someone
sketches one that doesn't have those failure modes.

#### Open design questions still in flight

- **Coordinator's own context budget.** Across many worker iterations,
  even a thin coordinator can fill up. Worth measuring now that the
  implement-coordinator exists in practice.
- **User course corrections during a long subagent run.** The orchestrator
  can't see the subagent in real time. The yield-at-checkpoint design
  partly answers this: if the user has a redirect, they raise it at the
  next yield. Long stretches without yields are the failure case.

(Resolved: worker→coordinator handoff schema, codified in
`agents/coordinator/implement-worker.md` and `implement-coordinator.md`;
sub-subagent spawning depth, addressed via the depth-3 fallback documented
in `implement-coordinator.md`.)

## Recently promoted

### Implementation as coordinator + stateless workers (stretch tier of the subagent-topology entry)

Done. Added `agents/coordinator/implement-coordinator.md` (wraps the
`/dev:implement` loop in an isolated context, returns a ~300-word
structured summary) and `agents/coordinator/implement-worker.md`
(stateless per-step executor: writes tests + code + runs tests, returns a
~200-word report, context discarded). Reworked `skills/implement/SKILL.md`
to dispatch per-step work to workers and own commits + review checkpoints
at the coordinator level. Updated `/dev:next` Phase 4 to spawn the
implement-coordinator instead of invoking `/dev:implement` directly.
Total spawn depth from the orchestrator is 3 at the final review
checkpoint (orchestrator → implement-coordinator → review-impl-coordinator
→ reviewer); the coordinator file documents a yield-back fallback if
Claude Code ever rejects that depth.

### Review loops as coordinator subagents (MVP tier of the subagent-topology entry)

Done. Added `agents/coordinator/review-plan-coordinator.md` and
`agents/coordinator/review-impl-coordinator.md`, each invoking the
underlying review skill in its own context and returning a compact
structured summary. Updated `/dev:next` Phase 3 (full mode) and
`/dev:implement` (all three modes) to spawn the coordinator instead
of invoking `/dev:review-plan` or `/dev:review-impl` directly. The
orchestrator's context only sees the summary, not the per-reviewer
findings or fix history.

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
