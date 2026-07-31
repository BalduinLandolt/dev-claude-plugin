---
name: review-plan
description: Review a plan — discover reviewers, relevance-gate them, fan out, dedup and adversarially verify findings, fix inline, and loop until clean. Reviewer and verifier transcripts stay in subagents.
allowed-tools:
  - Glob
  - Grep
  - Read
  - Write
  - Edit
  - Agent
  - AskUserQuestion
---

# Review Plan

Run the plan review loop: discover reviewers → **gate to the relevant ones** →
fan out → **dedup + verify** findings → fix inline → repeat until clean.

You own this loop directly — there is no Workflow script. Reviewer subagents and
per-finding verifiers keep their own transcripts; only compact findings and
verdicts return to you. This skill runs inside the interactive plan/approval flow,
so it stays on the main thread.

## Steps

### 1. Identify the plan documents

The plan directory (passed in the args, e.g. `docs/design/plans/<task>/`) holds
the PRD (if any) and the implementation plan. Collect their paths.

### 2. Discover and resolve the reviewer set

Identical to `review-impl` step 3 — discover, don't hardcode:

- **Plugin reviewers**: glob `../../agents/review/*.md` (relative to this skill's
  directory); spawn by `agentType` `dev:review:<name>`; read frontmatter for
  `effort`/`rerun` and the description for the reviewer's domain.
- **Project-local reviewers**: glob `.claude/agents/review/*.md`; spawn by bare
  `name`.
- **Resolution**: same-name local overrides; else additive; `## Disabled
  reviewers` in CLAUDE.md drops names.

Build `[{ name, agentType, effort, rerun, domain }]`.

### 3. Relevance-gate the set

Keep only reviewers whose domain the plan actually engages. For a plan the signal
is the plan's *content*, not a diff:

- **Always keep** the core — `correctness`, `consistency`, `simplicity` — and any
  `rerun: always` reviewer.
- **Gate the rest**: `spec-compliance` only if a PRD/spec is part of the plan;
  language/stack reviewers only if the plan commits to that stack; `architecture`
  only if the plan proposes structural change; `docs` only if the plan includes
  doc work. `security` when the plan touches auth, input handling, or sensitive
  data.

State the outcome in one line before fanning out. When in doubt about one
reviewer, keep it.

### 4. Fan out (round 1)

Spawn every gated reviewer **in parallel** (all `Agent` calls in one message).
Give each: a one-paragraph orientation (what the plan proposes), the plan/PRD
paths, relevant context docs (per CLAUDE.md), and the instruction to review
strictly within its role and report nothing if its role is irrelevant. Reviewing
a plan means judging the *design* — gaps, wrong approach, missed requirements,
unhandled cases — not code that doesn't exist yet.

### 5. Dedup

Cluster duplicate findings across reviewers into one finding each, tagged with
which reviewers raised it, at the highest severity assigned. This keeps the
verify step proportional.

### 6. Verify

For **each unique Critical/Warning finding**, spawn **one**
`dev:coordinator:finding-verifier` subagent (in parallel) to refute it against the
actual plan text. Keep only findings that come back `Real: true`. Suggestions are
not verified. One verifier per finding.

### 7. Triage and fix

Triage: **Critical** (must fix before approval), **Warning** (fix if the solution
is clear), **Suggestion** (consider, don't block).

Fix findings **inline** — plan documents are small text, so editing them here is
cheap and there is no code to keep off the main thread. Resolve the vast majority
yourself from the project's documented intent and constraints. Escalate to the
user only for a genuine product decision the docs can't settle. Do not escalate by
default.

If you observe process friction (a reviewer that ran without its convention file,
a recurring finding pattern suggesting a doc gap), log it: append to the task's
`issues.md` with `**Category**: process` if one exists, else surface it under
"Side notes".

### 8. Re-review

Repeat steps 4–7 with a **reduced reviewer set** — the union of always-rerun
reviewers (`rerun: always`, subject to the gate), reviewers that still carried a
confirmed Critical/Warning finding, and any reviewer newly relevant given your
revisions. Reviewers clean last round and not `rerun: always` do not re-run.
Repeat until no Critical/Warning findings remain, capped at **3 rounds** (surface
anything still open after that rather than looping).

### 9. Update status

Once clean, update the plan document frontmatter: `status: reviewed`.
