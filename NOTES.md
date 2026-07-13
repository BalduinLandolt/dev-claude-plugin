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
- **Phase B — pending:** whole-phase isolation, the real lever. Run the heavy,
  non-interactive phases as subagents that return compact summaries, so their
  transcripts never enter the Opus context; keep only the interactive spine on the
  main thread. Also covers running `prepare-pr`/`learn` on Sonnet and isolating
  the research fan-out. Gated on a depth-2 `Agent`-nesting spike — depth-5 nesting
  is available now, which lifts the constraint that forced the 0.11.0 revert.

## Effort & model tuning (applied 0.13.0)

Every reviewer, researcher, and the doc-improver carries an explicit `effort` in
frontmatter; the review Workflow reads it and passes it per reviewer.
correctness/security `high`; rust, the framework/topic researchers, and
test-reviewer `medium`; the rest `low`. All run on Sonnet except `docs-reviewer`
(Haiku). `implement-worker` inherits the session effort so its code-writing is not
starved. Cost is controlled by thinking depth, not model weakness — hence the
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
