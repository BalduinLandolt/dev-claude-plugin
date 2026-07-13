# Notes — optimizations & decision history

Where the plugin's cost/performance decisions and their rationale live — kept out
of the skill and agent bodies, which describe only current behaviour.

## Token profiling (2026-07)

Profiling 21 real `/dev:next` runs found the dominant cost is the **single
growing Opus orchestrator context**. The whole pipeline runs in one window
(`Skill` runs the called body in the caller's context); that context plateaus at
470k–730k tokens and is re-read on every turn (400–630 turns/run), so re-reading
it is ~57% of all session cost. The sub-agent fan-out (reviewers + workers) is
only ~12%; reviewers alone ~5%.

Staged response:

- **Phase A — done (0.13.0):** reviewer fan-out isolated in a Workflow (only
  compact, verified findings return, so reviewer transcripts no longer accumulate
  in the orchestrator); review code-fixes dispatched to workers (diffs off the
  main thread); per-agent effort tuning; a 3-round review cap as a cheap
  runaway-guard.
- **Phase B — done:** whole-phase isolation. The depth-2 `Agent`-nesting spike
  passed (depth-5 is available, lifting the constraint that forced the 0.11.0
  revert), so the non-interactive phases run inside a `phase-runner` subagent on
  Sonnet: `learn`, `prepare-pr`, and `implement` return compact summaries and
  escalate blockers via their return value. The interactive spine (`investigate`,
  `plan`, all human gates) stays on the main thread. A spike also found the
  **`Workflow` tool is unavailable to subagents**, so the `implement` code-review
  loop (`review-impl`) runs in the orchestrator *after* the driver returns —
  keeping the adversarial verify pass on code reviews while still isolating the
  coding. Research fan-out was left in-context: `Agent` already isolates each
  researcher's exploration, and the reports must reach the planner regardless.

## Model tiering is per-agent, not per-session

Running the whole `/dev:next` session on Sonnet 5 to cut the orchestrator-thread
cost was considered and rejected: the session model governs the *in-context*
work, which includes planning (`plan`/`investigate` run in the orchestrator's
context), so a Sonnet session would downgrade the planning stage — where a
frontier model is most wanted — and would floor the Opus reviewers. Model tiering
is done per-agent in frontmatter instead, independent of the session model: keep
the session on Opus for frontier planning, while implementation is already
delegated to Sonnet (`phase-runner`, `implement-worker` are `model: sonnet`) and
`correctness`/`security` run on Opus. Phase B therefore already delivers
frontier-planning + Sonnet-implementation without changing the session model.

## Effort & model tuning (applied 0.13.0)

Every reviewer, researcher, and the doc-improver carries an explicit `effort` in
frontmatter; the review Workflow reads it and passes it per reviewer.
correctness/security `high`; rust, the framework/topic researchers, and
test-reviewer `medium`; the rest `low`. All run on Sonnet except `docs-reviewer`
(Haiku) and `correctness`/`security` (Opus, the two highest-stakes reviewers).
`implement-worker` inherits the session effort so its code-writing is not starved. Cost is controlled by thinking depth, not model weakness — hence the
capability floor stays high even on the cheap reviewers.

## Ideas considered and rejected

- **Skill-side file-type gating before spawning reviewers.** Would hard-code
  reviewer names into the review skills (e.g. "spawn rust-reviewer only if `*.rs`
  changed"), breaking the dynamic-discovery design. The reviewer-side self-skip
  gates cover most of the win without the coupling.
- **Merging overlapping reviewers.** Considered folding the 9 into ~6
  (correctness+spec-compliance, consistency+docs, architecture+simplicity).
  Rejected: the overlaps are shallower than they look — consistency is
  internal-coherence, not a docs mirror; correctness is logic bugs, spec-compliance
  is requirement conformance — and the fan-out is only ~5% of cost, so the payoff
  is small. Kept 9 distinct lenses.
- **Re-review only the reviewers that flagged, with no orchestrator override.**
  Rejected in favour of re-reviewing (always-rerun pinned) ∪ (flagged last round)
  ∪ (orchestrator-judged relevant), so the orchestrator can pull in a clean
  reviewer when a fix obviously crossed concerns.
