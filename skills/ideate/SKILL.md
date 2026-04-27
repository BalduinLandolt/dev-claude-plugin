---
name: ideate
description: Help the user move from a vague problem, observation, or half-formed solution to a concrete next step. Use when the user wants to explore what to build, sanity-check an idea, dig into the problem behind a proposed solution, or work through phrasings like "I'm thinking about...", "we should consider...", "would it be a good idea to...", "what if we...", "I have an idea for...". Output is 1-3 concrete options or a clear "drop this" recommendation, not a PRD or implementation.
argument-hint: "[problem, idea, or area to explore]"
allowed-tools:
  - Glob
  - Grep
  - Read
  - Agent
  - AskUserQuestion
---

# Ideate

Help the user turn a vague problem, observation, or half-formed solution into a concrete
next step. This skill sits **upstream of `/dev:investigate`** — it does not produce
plans, PRDs, or implementations. It produces a decision: which idea to take forward, or
to drop the line of thinking entirely.

## Stance: detect what the user brought

Read the user's input and identify which stance to lead with:

- **Problem-first** — the user describes a pain, friction, gap, or observation
  ("X is slow", "users keep doing Y", "we don't have a way to Z").
  → Explore solution paths.
- **Solution-first** — the user describes a feature, idea, or proposed change
  ("we should add X", "I want to build Y", "let's refactor Z").
  → Reverse-engineer to the underlying problem first, then explore alternatives.

If the framing is genuinely ambiguous, ask one clarifying question to resolve which
stance to take. Do not start in both.

## Mode A: Problem-first

The user has described a problem. Your job is to explore solutions.

1. **Clarify the problem.** Ask 1-2 questions to understand the shape: who feels it,
   when, how often, what's the current workaround. Skip questions whose answers are
   already implied by the input.
2. **Optionally spawn one research agent.** If the problem references existing code,
   spawn `codebase-researcher` to find what's already there. If it references a domain
   you don't have context on, skip — don't spawn `framework-researcher` or
   `topic-researcher` here; that's investigate's job.
3. **Generate 1-3 solution options** with one-line tradeoffs each. Cover meaningfully
   different approaches, not three flavors of the same solution. If only one approach
   makes sense, say so and present it alone.
4. **Converge.** Recommend one. Let the user pick or override.

## Mode B: Solution-first

The user has described a feature or change they want. Your job is to back up and
check whether this is the right thing.

1. **Surface the underlying problem.** Ask: "what's the problem this solves?" Get
   the user to articulate the underlying need in plain language. Don't accept "it
   would be nice to have" — push for the concrete pain.
2. **Sanity-check the problem.** Once the problem is articulated, ask whether it's
   worth solving. Useful prompts:
   - Who feels this? How often?
   - What happens if we don't solve it?
   - Is the cost of solving it proportionate to the cost of leaving it?
   Surface concerns; don't deliver a verdict.
3. **Explore alternative solutions to the problem.** The user's proposed solution is
   one option among others. Generate 1-2 alternatives, with one-line tradeoffs.
   Treat the original proposal as a peer, not the default.
4. **Converge.** Recommend one (which may or may not be the user's original
   proposal). If the underlying problem isn't worth solving, recommend dropping the
   line.

## Constraints (apply to both modes)

- **Cap your turns.** Aim for ≤4 conversational turns from input to convergence.
  If the user wants deeper validation, escalate to `/dev:investigate` or a full-mode
  `/dev:next` rather than expanding ideate.
- **Surface concerns, don't render verdicts.** "Have you considered X?" beats
  "this isn't worth doing." The user has context you don't.
- **Do not spawn more than one research agent.** Ideate is conversational and cheap.
  Deeper grounding belongs downstream.
- **Do not produce plans, PRDs, or implementation sketches.** Ideate's output is a
  decision: which option to take, or to drop. Plan documents come from `/dev:plan`.

## Output format

```markdown
## Ideate

**Stance**: problem-first | solution-first

**Problem (as articulated)**: [one or two sentences]

**Options**:
1. [Approach 1] — [one-line tradeoff]
2. [Approach 2] — [one-line tradeoff]
3. [Approach 3] — [one-line tradeoff, optional]

**Recommendation**: [which option, or "drop this line — <reason>"]

**Next step**: [e.g. "run /dev:next with this task description", "add to project plan",
"drop and revisit if X happens"]
```

## Handoff

The output is consumed by:

- `/dev:next <task description>` — for ideas the user wants to act on now.
- The project plan — for substantial ideas worth tracking but not yet in flight.
  Add an entry; don't write the PRD here.
- Nothing — for ideas the user decides to drop. The conversation itself was the value.
