# Review fan-out — fallback (no Workflow tool)

The degraded path for `review-impl` and `review-plan` when the Workflow tool is
unavailable (older client, or Dynamic Workflows disabled). It replaces only the
"fan out via the Workflow" and "re-review" steps; reviewer discovery/resolution,
triage, fixing, and the 3-round cap in the skill body are all unchanged.

1. Spawn the resolved reviewer set **in parallel** via the `Agent` tool. Each
   reviewer receives:
   - the change summary (impl) or plan orientation (plan),
   - the changed-file list (impl) or the plan/PRD document paths (plan),
   - the approved plan where relevant,
   - relevant docs (per CLAUDE.md's documentation index).

   Reviewers self-gate when irrelevant (e.g. `rust-reviewer` returns early with
   no `*.rs` files), so spawning the full resolved set is cheap.

2. Collect each reviewer's standardized `## [Type] Review` output
   (Critical / Warning / Suggestion / Summary).

3. **There is no automated adversarial verify pass on this path.** Nothing has
   tried to refute the findings, so apply your own judgment when triaging — be a
   little more skeptical of plausible-but-thin findings before acting on them.

4. Hand these findings to the skill body's triage/fix step. For re-review rounds,
   compute the reduced set exactly as the skill body describes
   (always-rerun ∪ flagged ∪ judged) and spawn that reduced set the same way,
   under the same 3-round cap. There is no `flagged` array on this path — derive
   "which reviewers flagged" yourself from who produced Critical/Warning findings.
