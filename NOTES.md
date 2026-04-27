# Notes — deferred optimizations

Ideas explored but not yet applied. Pick up when looking for further quota savings.

## Effort tuning per agent (deferred)

Agent frontmatter supports an `effort` field with values `low`, `medium`, `high`,
`xhigh`, `max`. It overrides the session effort level for that sub-agent only.
Default is to inherit from the session, which means sub-agents currently inherit
whatever the orchestrator runs at — typically high or xhigh on Opus.

Reviewers and research agents do *target-comparison* work (read a convention/plan/spec,
check the input against it, report mismatches). Extended thinking helps most with
branching counterfactual reasoning, which most reviewers don't need. Likely a real
saving, especially when the orchestrator runs at high effort.

Proposed split if revisited:

- `effort: low` — all reviewers except security; all research agents; doc-improver.
- `effort: medium` — `security-reviewer` (threat modeling benefits from chained
  "what if" inference, where extended thinking actually pays off).

Why deferred: wanted to measure the effect of the model tiering (haiku for
simplicity/consistency/docs) and the round-2 reviewer reduction first, before
stacking another knob on top.

## Other ideas considered and rejected

- **Skill-side file-type gating before spawning reviewers.** Would have
  hard-coded reviewer names in `review-impl/SKILL.md` (e.g. "spawn rust-reviewer
  only if `*.rs` changed"). Rejected because it breaks the dynamic-discovery
  design — the skill would no longer be portable across projects with different
  reviewer sets. The reviewer-side self-skip gates added in `0.3.0` cover most
  of the win without the coupling.
- **Capping the review loop at 2 rounds.** Considered after the round-2
  reviewer reduction landed. Decided against: with the reduction in place,
  runaway loops are bounded enough that capping would mostly mean punting
  unfinished issues onto the user when the loop was actually doing useful work.
- **Re-review only reviewers that flagged, with no orchestrator override.**
  Rejected in favor of the current rule: re-review the union of (always-rerun
  pinned reviewers) ∪ (flagged last round) ∪ (orchestrator-judged relevant).
  The override clause keeps the orchestrator able to pull in a clean reviewer
  when a fix obviously crossed concerns.
