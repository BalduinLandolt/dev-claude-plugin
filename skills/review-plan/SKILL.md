---
name: review-plan
description: Fan out reviewer agents over a plan to find weaknesses, adversarially verify their findings, fix, and loop until clean. Runs the fan-out in an isolated Workflow so reviewer transcripts never enter the orchestrator context.
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

Run the plan review loop: fan out reviewers → verify findings → fix → repeat until clean.

This shares the same fan-out engine as `review-impl`: the Workflow script
`assets/review-fanout.workflow.js` (plugin root, two levels up from this skill).
It runs the reviewers and the verification sub-agents in isolated contexts and
returns only compact, verified findings — reviewer transcripts never land in the
orchestrator window.

## Steps

### 1. Identify the plan documents

The plan directory (passed in the args, e.g. `docs/design/plans/<task>/`) holds
the PRD (if any) and the implementation plan. Collect their paths.

### 2. Discover and resolve the reviewer set

Identical to `review-impl` step 3 — discover, don't hardcode:

- **Plugin reviewers**: glob `../../agents/review/*.md` (relative to this skill's
  directory); spawn by `agentType` `dev:review:<name>`; read frontmatter for
  `effort`/`rerun`.
- **Project-local reviewers**: glob `.claude/agents/review/*.md`; spawn by bare
  `name`.
- **Resolution**: same-name local overrides; else additive; `## Disabled
  reviewers` in CLAUDE.md drops names.

Build `[{ name, agentType, effort, rerun }]` and state the resolved count in one
line. Warn and skip if the set is empty.

### 3. Round 1 — fan out via the Workflow

Resolve the absolute path to `assets/review-fanout.workflow.js` and invoke the
**Workflow** tool with it as `scriptPath`, passing `args` as a JSON object:

```
{
  target: "plan",
  round: 1,
  changeSummary: "<one-paragraph orientation: what the plan proposes>",
  planPaths: [<plan/PRD document paths>],
  contextDocs: [<relevant docs/design and docs/process paths, per CLAUDE.md>],
  reviewers: [<the resolved list>]
}
```

It returns `{ round, reviewers, findings: [{ reviewer, findings, summary }],
flagged }`, findings already verified.

**If you do not have the Workflow tool**, read `../../assets/review-fallback.md`
and use that spawning path for this step and the re-review step; everything else
in this skill is unchanged. When the Workflow tool *is* available, do not read
that file.

### 4. Triage and fix

Triage: **Critical** (must fix before approval), **Warning** (fix if the
solution is clear), **Suggestion** (consider, don't block).

Fix findings **inline** — plan documents are small text, so editing them here is
cheap and there is no code to keep off the main thread. Resolve the vast majority
yourself from the project's documented intent and constraints. Escalate to the
user only for a genuine product decision the docs can't settle. Do not escalate
by default.

If you observe process friction (a reviewer that ran without its convention
file, a recurring finding pattern suggesting a doc gap), log it: append to the
task's `issues.md` with `**Category**: process` if one exists, else surface it
under "Side notes".

### 5. Re-review

Invoke the Workflow again with `round` incremented and a **reduced reviewer
set** — the union of always-rerun reviewers (`rerun: always`), the returned
`flagged` list, and any reviewer you judge newly relevant given your revisions.
Reviewers clean last round and not `rerun: always` do not re-run. Repeat until no
Critical/Warning findings remain, capped at **3 rounds** (surface anything still
open after that rather than looping).

### 6. Update status

Once clean, update the plan document frontmatter: `status: reviewed`.
