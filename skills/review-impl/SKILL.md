---
name: review-impl
description: Review the implementation — discover reviewers, relevance-gate them, fan out, dedup and adversarially verify findings, fix, and loop until clean. Runs as its own isolated phase; reviewer and verifier transcripts stay in subagents.
allowed-tools:
  - Glob
  - Grep
  - Read
  - Write
  - Edit
  - Bash
  - Agent
  - AskUserQuestion
---

# Review Implementation

Run the implementation review loop: discover reviewers → **gate to the relevant
ones** → fan out → **dedup + verify** findings → fix → repeat until clean.

You own this loop directly — there is no Workflow script. Reviewer subagents and
per-finding verifiers keep their own transcripts in their own contexts; only
compact findings and verdicts return to you. When `/dev:next` runs this skill it
wraps it in a `phase-runner`, so your whole loop stays off the orchestrator
thread; run standalone, it runs wherever it was invoked.

## How thorough to be

Decide from the change itself:

- **Trivial / low-risk change** (a few lines, no behavioural surface) → a single
  round is enough. Fix and stop.
- **Substantial change** → loop until clean, **capped at 3 rounds**. If findings
  remain after round 3, surface them rather than looping forever — a finding that
  survives three fix attempts usually needs a human decision.

## Steps

### 1. Identify changed files

```bash
git diff --name-only main...HEAD
```

The three-dot syntax compares against the merge base, not the current tip of main.

### 2. Write a change summary

A 5–10 line orientation block passed to every reviewer, so none of them
reconstructs it from scratch:

```
Intent: <one sentence — what the branch accomplishes>
Notable changes:
- <file or area>: <what changed and why, one line>
Touch-points worth flagging: <new public API, schema change, dependency added,
   migration, user-visible behaviour change — or "none">
```

### 3. Discover and resolve the reviewer set

The set is the union of the plugin's reviewers and any project-local reviewers,
with overrides. **Discover — don't hardcode**; the agent files *are* the
registry:

- **Plugin reviewers**: glob this skill's sibling directory `../../agents/review/*.md`
  (relative to this skill's own directory). Each file's frontmatter gives `name`,
  `effort`, and optional `rerun`, and its body/description states the reviewer's
  domain. Spawn each by the namespaced `agentType` `dev:review:<name>`.
- **Project-local reviewers**: glob `.claude/agents/review/*.md` in the consuming
  project. Spawn each by its bare `name`. Read frontmatter for `effort`/`rerun`.

**Resolution rules** (in order):
1. **Same-name override** — a local reviewer whose `name` matches a plugin
   reviewer replaces it; only the local one runs.
2. **Additive otherwise** — differently-named locals run in addition.
3. **CLAUDE.md disables** — if the project's `CLAUDE.md` has a `## Disabled
   reviewers` section listing names, drop those from the set.

Build the resolved list: `[{ name, agentType, effort, rerun, domain }]`, where
`domain` is a one-line read of what that reviewer covers (from its description).

### 4. Relevance-gate the set

**This is the main cost lever — do not skip it.** Running every reviewer on every
change is what made this phase excessive. From the change summary and the changed
file list, keep only reviewers whose domain the change actually touches:

- **Always keep** the stack-agnostic core — `correctness`, `consistency`,
  `simplicity` — and any reviewer marked `rerun: always` in frontmatter.
- **Gate the rest** on evidence in the diff:
  - language/stack reviewers (e.g. `rust`, `frontend`) → only if files of that
    kind changed;
  - `spec-compliance` → only if a PRD/spec exists for this task;
  - `docs` → only if docs changed, or the change alters developer- or user-facing
    surface that docs should track;
  - `architecture` → only for structural change (new module, moved boundary,
    dependency-direction shift), not a localized edit.
- A project-local reviewer with no clear domain signal: keep it (it was added
  deliberately) unless it obviously targets an untouched stack.

State the outcome in one line before fanning out, e.g. *"6 reviewers relevant of
9 resolved; gated out rust, frontend, architecture (no matching changes)."* If in
genuine doubt about one reviewer, keep it — gating errs toward the core, not
toward silence.

### 5. Fan out (round 1)

Spawn every gated reviewer **in parallel** (all `Agent` calls in one message).
Give each the change summary, the changed file list, the relevant context docs
(per CLAUDE.md), and this instruction: *review strictly within your role; read the
changed files and your project convention file as needed; if your role is
irrelevant to this change, report nothing and say so.* Each returns its findings
in the standard reviewer format (`### Critical`, `### Warning`, `### Suggestion`).

### 6. Dedup

Collect all findings across reviewers and **cluster duplicates** — the same
underlying problem raised by more than one reviewer (same location, or the same
issue described differently) becomes **one** finding, tagged with which reviewers
raised it. This is what stops N reviewers × M findings from multiplying into a
verify explosion. Keep the highest severity any reviewer assigned to the cluster.

### 7. Verify

For **each unique Critical/Warning finding** (Suggestions are not verified —
cheap, non-blocking), spawn **one** `dev:coordinator:finding-verifier` subagent to
adversarially refute it. Spawn them in parallel. Keep only findings whose verdict
comes back `Real: true`; drop the rest. One verifier per finding — never several
per finding.

### 8. Triage and fix

Triage the survivors: **Critical** (must fix), **Warning** (should fix),
**Suggestion** (consider).

**Dispatch code fixes to a `dev:coordinator:implement-worker`** rather than
editing on the main thread — pass it the findings, the files, the test command,
and the conventions. Keeping the edits and diffs inside the worker keeps them out
of your context. Make a fix inline only when dispatching would obviously cost more
than it saves (a one-line doc typo). The worker re-runs the project's tests after
fixes land and reports.

Workers don't commit — you do. Once a round's fixes are in and tests pass, commit
them: a `fix:` commit, or `git commit --fixup=<sha>` onto the feature commit the
fix belongs to (`prepare-pr` autosquashes later). Follow the project's
git-hygiene conventions.

Escalate **only** for a genuine product decision the plan and docs can't resolve.
If `AskUserQuestion` is available (standalone run), ask; if it is not (running
inside a phase-runner), stop and return the decision as a blocker for the
orchestrator to escalate. Do not escalate by default.

Log any process friction to the issues journal (`**Category**: process`) — a
reviewer that ran without its convention file, a recurring finding pattern that
suggests a doc gap. If running standalone with no journal, surface it under "Side
notes" instead.

### 9. Re-review

Skip if this was a single-round (trivial) change or nothing survived verification.

Otherwise repeat steps 5–8 with `round` incremented and a **reduced reviewer
set** — the union of:
- **always-rerun** reviewers (`rerun: always` — for the plugin set that's
  `correctness-reviewer`, `security-reviewer`, `spec-compliance-reviewer`, subject
  to the same relevance gate),
- reviewers that still carried a confirmed Critical/Warning finding last round, and
- any reviewer you judge newly relevant given the fixes you applied.

Reviewers clean last round, not `rerun: always`, and not judged relevant do not
re-run. Repeat until no Critical/Warning findings remain or the 3-round cap hits.
