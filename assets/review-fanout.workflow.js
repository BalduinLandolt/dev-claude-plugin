export const meta = {
  name: 'review-fanout',
  description:
    'Fan out a resolved reviewer set over a code change or a plan, adversarially verify the Critical/Warning findings to kill false positives, and return only the confirmed findings.',
  phases: [
    { title: 'Review', detail: 'each reviewer inspects the change/plan in an isolated context' },
    { title: 'Verify', detail: 'adversarially refute each Critical/Warning finding' },
  ],
}

// ---------------------------------------------------------------------------
// This script is the fan-out engine shared by /dev:review-impl and
// /dev:review-plan. It runs ONE review round and returns compact, verified
// findings. The calling skill owns everything the script cannot:
//   - reviewer discovery + resolution (needs the filesystem; scripts have none)
//   - fixing findings and escalating product questions to the user
//   - deciding whether to loop (re-invoke with a reduced set) or stop
// Keeping the fan-out here means the expensive part (N reviewer transcripts +
// the verify sub-agents) stays in isolated agent contexts and never lands in
// the orchestrator's window — only the confirmed findings return.
//
// args (JSON, supplied by the calling skill):
//   target        'impl' | 'plan'
//   reviewers     [{ name, agentType, effort, rerun }]  — resolved set for THIS round
//   changeSummary string  — the orientation summary the skill already produced
//   files         [string] — changed file paths            (target === 'impl')
//   planPaths     [string] — plan/PRD document paths        (target === 'plan')
//   contextDocs   [string] — extra docs reviewers may consult (optional)
//   round         number  — 1 for the first pass, 2+ for reduced re-reviews
// ---------------------------------------------------------------------------

// `args` may arrive as an object or as a JSON string depending on how the
// caller passes it (a scriptPath invocation can deliver it stringified).
// Normalize to an object so the rest of the script is agnostic to that.
let input = args
let parseError = false
if (typeof input === 'string') {
  try {
    input = JSON.parse(input)
  } catch (_e) {
    input = {}
    parseError = true
  }
}
input = input || {}

const target = input.target || 'impl'
const reviewers = input.reviewers || []
const round = input.round || 1

if (!reviewers.length) {
  // Nothing to run — either the skill resolved an empty set (should not happen
  // on a normal install) or the args payload failed to parse. Distinguish the
  // two so a malformed caller payload is obvious instead of looking like a
  // legitimately empty round.
  return {
    round,
    reviewers: [],
    findings: [],
    flagged: [],
    empty: true,
    error: parseError ? 'args was a string that failed to JSON.parse' : undefined,
  }
}

const orientation = [
  target === 'plan'
    ? 'You are reviewing a PLANNING DOCUMENT (PRD and/or implementation plan), not code.'
    : 'You are reviewing a CODE CHANGE.',
  `Change summary:\n${input.changeSummary || '(none provided — orient yourself from the target below)'}`,
  target === 'plan'
    ? `Plan documents:\n${(input.planPaths || []).map((p) => '- ' + p).join('\n') || '(none listed)'}`
    : `Changed files:\n${(input.files || []).map((f) => '- ' + f).join('\n') || '(none listed)'}`,
  input.contextDocs && input.contextDocs.length
    ? `Context documents you may consult as needed:\n${input.contextDocs.map((d) => '- ' + d).join('\n')}`
    : '',
]
  .filter(Boolean)
  .join('\n\n')

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      description: 'Every issue found, at any severity. Empty array if the change is clean or irrelevant to your role.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          severity: { type: 'string', enum: ['Critical', 'Warning', 'Suggestion'] },
          location: { type: 'string', description: 'file:line, or plan section — as precise as possible' },
          description: { type: 'string', description: 'What is wrong and why it matters. Self-contained.' },
        },
        required: ['severity', 'location', 'description'],
      },
    },
    summary: { type: 'string', description: 'One-to-three-sentence overall assessment.' },
  },
  required: ['findings', 'summary'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    real: {
      type: 'boolean',
      description: 'True only if the finding genuinely holds up after you inspected the actual code/plan. False if it is a false positive, already handled, or out of scope.',
    },
    reasoning: { type: 'string', description: 'Brief justification, citing what you checked.' },
  },
  required: ['real', 'reasoning'],
}

// Run each reviewer, then immediately verify that reviewer's Critical/Warning
// findings — a pipeline (not a barrier), so a fast reviewer's findings get
// verified while a slower reviewer is still reading.
const results = await pipeline(
  reviewers,
  // Stage 1 — the reviewer inspects the target in its own isolated context.
  (r) =>
    agent(
      `${orientation}\n\nReview strictly within your role. Read the changed files (or plan) and your project convention file as needed. Report findings in the required schema; if your role is irrelevant to this change, return an empty findings array and say so in the summary.`,
      {
        agentType: r.agentType,
        effort: r.effort || undefined,
        schema: FINDINGS_SCHEMA,
        phase: 'Review',
        label: `review:${r.name}`,
      }
    ),
  // Stage 2 — adversarially verify this reviewer's Critical/Warning findings.
  (review, r) => {
    if (!review) return null
    const all = review.findings || []
    const toVerify = all.filter((f) => f.severity === 'Critical' || f.severity === 'Warning')
    if (!toVerify.length) {
      return { reviewer: r.name, findings: all, summary: review.summary, rejected: [] }
    }
    return parallel(
      toVerify.map((f) => () =>
        agent(
          `${orientation}\n\nA ${f.severity} finding was raised by the ${r.name}:\n\n"${f.description}"\n(location: ${f.location})\n\nYour job is to REFUTE it. Read the actual code/plan at that location and decide whether the finding is genuinely a problem, or a false positive / already handled / out of scope / based on a misreading. Mark real=true ONLY if it clearly holds up under scrutiny.`,
          { schema: VERDICT_SCHEMA, effort: 'medium', phase: 'Verify', label: `verify:${r.name}` }
        ).then((v) => ({ finding: f, verdict: v }))
      )
    ).then((verdicts) => {
      // Keep Suggestions (unverified, cheap) plus every Critical/Warning that survived refutation.
      const confirmed = all.filter((f) => {
        if (f.severity === 'Suggestion') return true
        const v = verdicts.find((x) => x.finding === f)
        return !!(v && v.verdict && v.verdict.real === true)
      })
      const rejected = verdicts
        .filter((x) => !(x.verdict && x.verdict.real === true))
        .map((x) => ({ location: x.finding.location, severity: x.finding.severity, why: x.verdict && x.verdict.reasoning }))
      return { reviewer: r.name, findings: confirmed, summary: review.summary, rejected }
    })
  }
)

const clean = results.filter(Boolean)

// Reviewers still carrying a Critical/Warning finding after verification — the
// calling skill unions this with its always-rerun + judged sets for round 2+.
const flagged = clean
  .filter((rr) => (rr.findings || []).some((f) => f.severity === 'Critical' || f.severity === 'Warning'))
  .map((rr) => rr.reviewer)

return {
  round,
  reviewers: reviewers.map((r) => r.name),
  findings: clean,
  flagged,
}
