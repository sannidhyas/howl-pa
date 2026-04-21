---
name: forward-backward-think
description: Lightweight inline two-pass reasoning for medium-scope questions — a single feature, bug scoping, design sketch, or refactor sizing. Applies the forward-backward reasoning pattern without producing the full four-artifact project-seeding deliverable. Triggers on phrases like "forward-backward think this", "two-pass reasoning", "decompose this", "think backward from the goal", "what must be true for this", "reason from first principles", "zero-to-hero for this feature".
---

# Forward-Backward Think — Inline Two-Pass Reasoning

The lightweight sibling of `project-seeding`. Apply this when the work is medium-complexity — a single feature, a bug whose root cause is unclear, a design sketch between ~3 approaches, a refactor size estimate — and you want the reasoning discipline without the overhead of four named artifacts and explicit phase checkpoints.

Everything happens inline and produces a single markdown block. No files are written unless the user asks.

## When to use

- A single feature with non-obvious scope (more than one module, less than a full subsystem)
- Scoping a bug where the root cause is not immediately obvious from a stack trace or grep
- Choosing between ~3 concrete approaches to the same problem
- Estimating the blast radius of a refactor before starting
- Any medium-complexity question where "just do it" would likely produce rework

## When NOT to use

- **Trivial or obvious work** — one file, one symbol, clear spec. Just do it.
- **Truly new project or subsystem** — use `project-seeding` instead. If scope inflates past a single feature during this skill, stop and escalate to `project-seeding`.
- **Pure implementation** — if the approach is already decided and no decomposition is needed, execute directly via the appropriate `codex-corps` specialist (see `codex-corps-handoff`).
- **User says "skip planning"** — honour it.

## Two-pass protocol

The entire output is a single markdown response with four sections. Nothing is written to disk unless explicitly requested.

### Forward pass — what is true

Enumerate 5–10 bullets describing observable reality:

- Repo state (what exists, what doesn't)
- User constraints stated in the request
- Available tooling, runtimes, frameworks
- Known limits (quota, latency budget, licensing)
- Relevant code paths already present

Tag each bullet `HARD` (non-negotiable: runtime version, regulatory limit, explicit user constraint) or `SOFT` (preference, convention, reversible default).

Stop at 10 bullets. This is an index, not a survey.

### Backward pass — what must be true for the goal to exist

State the deliverable in exactly one sentence. Then recursively ask: *"what must be true for this to exist?"*

Stop recursion at one of three terminals:

- **CONCRETE-ACTION** — a task a person or agent can execute directly right now
- **KNOWN-PRIMITIVE** — something already confirmed in the forward pass
- **UNKNOWN** — a gap that cannot be resolved without more information

Tag every leaf node as one of:

- `FACT` — supported by forward pass or observable codebase reality
- `DESIGN-CHOICE` — reversible decision being made now; note the alternative considered
- `ASSUMPTION` — load-bearing belief that is unverified; these are the dangerous ones

### Meet in the middle — reconciliation

Diff the forward pass against the backward pass. List every mismatch explicitly. For each mismatch, do one of:

- **Resolve inline** — amend a leaf node or add a forward-pass bullet that closes the gap
- **Surface as Open Question** — note what information is needed and where to get it

Do not exit reconciliation while any mismatch is unresolved and not parked as an Open Question. Loop explicitly. Don't one-shot this step.

### Execution path

An ordered task list. Every task:

- Names the `codex-corps` specialist responsible (see `codex-corps-handoff` for the routing table)
- References the backward-pass leaf node it satisfies
- Is a single commit-worthy unit

Format:

```
- [ ] <task> — satisfies <leaf>, specialist: codex-<name>
```

Tasks are ordered by dependency, not by guess.

## Output format

Emit exactly this markdown structure:

```markdown
## Forward
<5–10 tagged bullets>

## Backward
Deliverable: <one sentence>
<recursive leaf tree with tags>

## Reconciliation
<mismatch list, resolved or parked>
Open Questions:
- <question> — next step: <where to look>

## Execution path
- [ ] <task> — satisfies <leaf>, specialist: codex-<name>
```

No code appears before the execution path. No pseudocode longer than 3 lines appears anywhere in the output.

## Hard rules

1. **No code until reconciliation closes zero gaps.** If the execution path contains a task whose leaf is still `UNKNOWN`, the reconciliation loop has not converged — go back.
2. **Loop explicitly.** State "Reconciliation loop N" if multiple passes are needed. Don't collapse a multi-pass reconciliation into a single silent sweep.
3. **Scope inflation → escalate.** If the backward pass reveals that the work spans multiple subsystems, spans three or more `DESIGN-CHOICE` nodes, or produces more than ~12 execution tasks, stop and tell the user to use `project-seeding` instead.
4. **Non-obvious DESIGN-CHOICE leaves → council.** If a `DESIGN-CHOICE` leaf has a genuinely competitive alternative, invoke the `council` skill before resolving it (see `council` for how to call `/howl-council`).
