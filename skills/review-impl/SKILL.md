---
name: review-impl
description: Fan out reviewer agents over the implementation, adversarially verify their findings, fix, and loop until clean. Runs the fan-out in an isolated Workflow so reviewer transcripts never enter the orchestrator context.
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

Run the implementation review loop: fan out reviewers → verify findings → fix → repeat until clean.

The fan-out heavy lifting lives in a shared Workflow script
(`assets/review-fanout.workflow.js`, at the plugin root — two levels up from this
skill). Running it there keeps N reviewer transcripts *plus* the verification
sub-agents in isolated contexts, so only compact, already-verified findings
return to the orchestrator. Reviewer output was measured as a top driver of
orchestrator-context growth; this is the fix.

## How thorough to be

Decide from the change itself — there are no tiers:

- **Trivial / low-risk change** (a few lines, no behavioural surface) → a single
  round is enough. Fix and stop.
- **Substantial change** → loop until clean, **capped at 3 rounds**. If findings
  remain after round 3, surface them to the user rather than looping forever —
  a finding that survives three fix attempts usually needs a human decision.

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
with overrides. **Discover — don't hardcode** (there is no reviewer list to keep
in sync; the agent files *are* the registry):

- **Plugin reviewers**: glob this skill's sibling directory `../../agents/review/*.md`
  (relative to this skill's own directory). Each file's frontmatter gives `name`,
  `effort`, and optional `rerun`. Spawn each by the namespaced `agentType`
  `dev:review:<name>` (e.g. `dev:review:correctness-reviewer`).
- **Project-local reviewers**: glob `.claude/agents/review/*.md` in the consuming
  project. Spawn each by its bare `name`. Read frontmatter for `effort`/`rerun`.

**Resolution rules** (in order):
1. **Same-name override** — a local reviewer whose `name` matches a plugin
   reviewer replaces it; only the local one runs.
2. **Additive otherwise** — differently-named locals run in addition.
3. **CLAUDE.md disables** — if the project's `CLAUDE.md` has a `## Disabled
   reviewers` section listing names, drop those from the set.

Build the resolved list: `[{ name, agentType, effort, rerun }]`. State it in one
line before spawning, e.g. "9 reviewers: 9 plugin, 0 local, 0 disabled."

If the resolved set is empty (should not happen on a normal install), warn the
user with the cause and skip the loop.

### 4. Round 1 — fan out via the Workflow

Resolve the absolute path to `assets/review-fanout.workflow.js` (two levels up
from this skill's directory) and invoke the **Workflow** tool with it as
`scriptPath`, passing `args` as a JSON object:

```
{
  target: "impl",
  round: 1,
  changeSummary: "<the block from step 2>",
  files: [<changed file paths>],
  contextDocs: [<relevant docs/design and docs/process paths, per CLAUDE.md>],
  reviewers: [<the resolved list from step 3>]
}
```

The script runs every reviewer in parallel, adversarially refutes each
Critical/Warning finding (killing false positives), and returns
`{ round, reviewers, findings: [{ reviewer, findings, summary }], flagged }`.
The findings are already verified — do not re-verify them.

**If you do not have the Workflow tool** (older client, or Dynamic Workflows
disabled), read `../../assets/review-fallback.md` and use that spawning path for
this step and the re-review step. Everything else in this skill is unchanged.
When the Workflow tool *is* available, do not read that file.

### 5. Triage and fix

Triage the returned findings: **Critical** (must fix), **Warning** (should fix),
**Suggestion** (consider).

**Dispatch code fixes to a `dev:coordinator:implement-worker`** rather than
editing on the main thread. Pass the worker the findings to address, the files,
the test command, and the conventions. Keeping the edits and diffs inside the
worker keeps them out of the orchestrator context — the profiled reason the main
thread is expensive. Make a fix inline only when dispatching would obviously cost
more than it saves (a one-line doc typo). Re-run the project's tests after fixes
land (the worker does this and reports).

Escalate to the user **only** for a genuine product decision the plan and docs
can't resolve. Do not escalate by default.

Log any process friction to the issues journal (`**Category**: process`) — a
reviewer that ran without its convention file, a recurring finding pattern that
suggests a doc gap. If running standalone (no journal), surface it under "Side
notes" instead.

### 6. Re-review

Skip if this was a single-round (trivial) change or nothing was flagged.

Otherwise invoke the Workflow again with `round` incremented and a **reduced
reviewer set** — the union of:
- **always-rerun** reviewers (`rerun: always` in frontmatter — for the plugin set
  that's `correctness-reviewer`, `security-reviewer`, `spec-compliance-reviewer`),
- reviewers in the returned `flagged` list, and
- any reviewer you judge newly relevant given the fixes you applied.

Reviewers clean last round, not `rerun: always`, and not judged relevant do not
re-run. Repeat until no Critical/Warning findings remain or the 3-round cap hits.
