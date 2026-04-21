---
name: project-seeding
description: Two-pass first-principles project seeding methodology for greenfield or brownfield work. Trigger when the user is kicking off a new project, starting significant work on an existing codebase, or asking for a structured plan before execution. Triggers on phrases like "seed this project", "how should I start", "plan before I code", "kick off", "greenfield", "brownfield", "decompose this goal", "what's my plan", "forward-backward thinking", "zero to hero", "illuminate the path", "reconcile plan and foundations", or any request to produce a project plan, architecture plan, or execution plan from a stated goal. Produces FOUNDATIONS.md or LANDSCAPE.md (forward pass), PLAN.md (backward pass), and a reconciled execution task list. Does not write code until after user sign-off.
---

# Project Seeding — Two-Pass First-Principles Methodology

Howl PA's seeding protocol. Every non-trivial project or significant codebase change flows through this skill before any code is written. It splits reasoning into a *forward pass* (what is true) and a *backward pass* (what must be true for the goal to exist), then reconciles the two before execution.

## When to use

- New project / repo / service (greenfield)
- Significant work on existing codebase — new subsystem, architectural change, large refactor, feature spanning multiple modules (brownfield)
- Any explicit request for a project plan, architecture plan, or execution plan from a stated goal
- User says: "seed this project", "how should I start", "plan before I code", "kick off", "decompose this goal", "what's my plan"
- User says: "forward-backward thinking", "zero to hero", "illuminate the path", "reconcile plan and foundations"

## When NOT to use

Skip and just do the work when:
- Trivial change — one file, one symbol, one typo
- Single bug fix with a known root cause
- Cosmetic edits (rename variable, format, move import)
- User explicitly says "skip planning", "just do it", "fast path"
- Work clearly inside a single well-defined function or config

## Workflow

### Phase 1 — Forward pass (bedrock)

Establish what is true *before* reasoning about the goal. No goal-oriented reasoning yet.

**Greenfield → write `FOUNDATIONS.md`.**
- Enumerate facts, constraints, capabilities available
- Each entry tagged `HARD` (non-negotiable: language runtime, paid-vs-free constraint, regulatory limit, hardware) or `SOFT` (default, preference, convention, reversible choice)
- Sections: Runtime, Dependencies available, External services/APIs available, Budget/licensing, Team/time, Conventions inherited
- Example entry: `- HARD: Node >=22 (node:sqlite requirement)` / `- SOFT: Prefer grammy over telegraf for Telegram (team familiarity)`

**Brownfield → write `LANDSCAPE.md`.**
- Walk the codebase with Glob + Grep + Read. Do not modify anything.
- Classify every significant component into one of three buckets with a one-line reason:
  - `FUNDAMENTAL` — load-bearing, removing it breaks the system (DB schema, auth, core routing, main entry)
  - `FOSSIL` — historical artifact, no longer active, safe to delete or refactor around (dead code path, unused table, commented-out flag, old migration)
  - `CONVENTION` — works today but could be replaced without losing behavior (logger choice, linter config, naming style, folder layout)
- Sections: Entry points, Data model, External boundaries, Core logic, Ancillary (scripts, docs, config)
- Example shape (illustrative, not about this repo): `- FUNDAMENTAL: <persistence module> — every subsystem reads/writes through it` / `- FOSSIL: <old path> — zero callers, superseded by <new path> in commit <sha>` / `- CONVENTION: <logger of choice> — any structured logger would substitute`

**Hard rule:** stop after ~1,500 words. Reference document, not essay. Links to code over prose.

**Checkpoint:** present classifications to user. Wait for sign-off before Phase 2. For brownfield, explicitly flag: *component classifications require human review — the agent lacks domain and historical context, so every `FOSSIL` tag is a hypothesis to be confirmed, not a fact.*

### Phase 2 — Backward pass (decomposition)

Starting from the stated deliverable, recursively ask *"what must be true for this to exist?"* Do not write code. Write `PLAN.md`.

- Root node = the deliverable, stated in one sentence
- Each child = a precondition that must hold for the parent to be possible
- Stop recursion at:
  - **Concrete action** — a task a person or agent can execute directly
  - **Known primitive** — something already present in `FOUNDATIONS.md` or `LANDSCAPE.md`
  - **Unknown** — question that can't be answered without more info; route to Open Questions
- Tag every node:
  - `FACT` — directly supported by foundations or observable reality
  - `DESIGN-CHOICE` — reversible decision being made now; note the alternative considered
  - `ASSUMPTION` — belief that is load-bearing but unverified; these are the dangerous ones
- Required sections in `PLAN.md`:
  1. Goal (one sentence)
  2. Decomposition tree (nested bullets with tags)
  3. Open Questions (every unknown surfaces here with a proposed next step)
  4. **What would falsify this plan?** — list conditions under which the plan collapses. Forces a check against analogy-based reasoning masquerading as first principles. (e.g., "If the OAuth quota is lower than assumed, the polling cadence in §3.2 fails.")

**Hard rule:** no code. Not even pseudocode more than 3 lines. If you catch yourself sketching an implementation, move it to Open Questions.

**Brownfield / large codebases (>5 modules):** Delegate the backward-pass walk to `codex-corps:codex-arch` (design-heavy decomposition) or `codex-corps:codex-research` (read-only spelunking) before writing PLAN.md. Not mandatory for small repos — use judgment.

**DESIGN-CHOICE nodes — council escalation:** When a node is tagged `DESIGN-CHOICE` and the alternative is non-obvious, invoke the `council` skill (sibling skill at `claude-plugin/skills/council/`) to get multi-backend deliberation (Claude + Codex + local Ollama) before locking the choice. Do NOT invoke council for every decision — only when the model itself flags "non-obvious alternative."

### Phase 3 — Meet in the middle (iterative reconciliation)

**This is a loop, not a one-shot diff.** Forward and backward passes are rarely consistent on the first try. Loop until the *illuminated path* criterion is met (defined below). A single pass is never sufficient.

Each iteration writes or updates `RECONCILIATION.md`. The document is append-only: each cycle adds a new `## Cycle N — <date>` section.

**Required machine-checkable header per cycle (write this exact line at the top of every cycle section):**
```
Cycle N · opened: <k> · closed: <k> · remaining: <k> · new: <k>
```
Terminal cycle must read: `remaining: 0 · new: 0`

**Iteration checklist — walk every item every cycle. All must be YES to exit:**

- [ ] C1. Every leaf node in `PLAN.md` is either (a) a concrete task with a named codex-corps specialist assigned (see Integration notes § Routing matrix), or (b) an Open Question the user has explicitly decided — not merely parked.
- [ ] C2. Zero `PLAN.md` nodes contain unsupported `ASSUMPTION` tags that the user has not signed off on.
- [ ] C3. Every `HARD` foundation is either referenced in a `PLAN.md` node or explicitly marked "intentionally unused this pass" in `RECONCILIATION.md`.
- [ ] C4. Zero nodes are tagged `Plan over-reach` (plan assumes a capability the foundations don't provide).
- [ ] C5. Zero nodes are tagged `Foundation under-exploit` (a foundation capability ignored by the plan without a reason).
- [ ] C6. `remaining` in the cycle header is 0 AND `new` is 0.

**If any item above is NO → another cycle is required. No exit.**

**Iteration steps (inside each cycle):**

1. **Diff** `FOUNDATIONS.md`/`LANDSCAPE.md` against `PLAN.md`. Catalog every mismatch and classify each one:
   - **Plan over-reach** — plan assumes a capability the foundations don't provide (e.g., plan calls for a vector index, foundations don't include an embedder).
   - **Foundation under-exploit** — foundations include a capability the plan ignores (e.g., `claude-mem` is available but plan re-implements session memory).
   - **Foundation ambiguity** — a foundation entry is under-specified so the plan can't be evaluated against it (e.g., `SOFT: Prefer grammy` without saying what the alternative is).
   - **Plan vagueness** — a plan node is too coarse to check against foundations (e.g., "use caching" with no specifics). Break it down.
2. **Write options** for each finding: add the capability, redesign the step, drop the step, tighten the foundation, or escalate to Open Questions.
3. **Make the smallest set of edits** that closes the gap:
   - Amend `FOUNDATIONS.md`/`LANDSCAPE.md` if a missing or fuzzy foundation is what's breaking alignment.
   - Amend `PLAN.md` if the decomposition had an unsupported assumption or an over-reach.
   - Move genuinely unknown items to the `Open Questions` section of `PLAN.md` with a proposed next step.
4. **Re-diff**. Count remaining mismatches. Update the cycle header.
5. **Walk the checklist above.** If all YES → exit loop. If any NO → increment cycle, go to step 1.

**Stall detection:** If 2 consecutive cycles have the same mismatch ID appearing in `opened` without appearing in `closed`, pause the loop and surface to the user: list the stalled mismatch(es), proposed resolutions, and ask the user to decide. Do not continue spinning.

**DESIGN-CHOICE nodes — council escalation:** When a node is tagged `DESIGN-CHOICE` and the alternative is non-obvious, invoke the `council` skill before locking. See Phase 2 note for details.

**Illuminated path criterion (convergence target):** Phase 3 is complete when every leaf node in `PLAN.md` is in one of exactly two terminal states:
1. **Concrete task** — has a named codex-corps specialist assigned (from the routing matrix in Integration notes).
2. **Decided Open Question** — user has explicitly decided it (not just acknowledged or parked it).

No leaf may remain in a third state (vague, assumed, or "TBD"). If one does, it is a loop exit blocker.

**Hard rule:** no phase-4 execution until the loop has converged: checklist all-YES, cycle header shows `remaining: 0 · new: 0`, every leaf is in a terminal state.

**Checkpoint:** user reviews the full `RECONCILIATION.md` history (every cycle) and the final state of `FOUNDATIONS.md` + `PLAN.md`. Signs off explicitly. Only then does Phase 4 begin.

### Phase 4 — Execution plan

Only after Phase 3 sign-off. Produce a separate `TASKS.md` (not inlined in `PLAN.md`).

**Required fields per task:**

| Field | Content |
|---|---|
| `ID` | Sequential: `T-001`, `T-002`, … |
| `Plan §` | Originating node in `PLAN.md` (section + bullet ref) |
| `Foundation §` | Enabling entry in `FOUNDATIONS.md` or `LANDSCAPE.md` — or `n/a — greenfield` |
| `Blast radius` | Files and systems this task touches or modifies |
| `Rollback` | How to undo this task if it breaks something downstream |
| `Agent` | Assigned codex-corps specialist (from routing matrix in Integration notes) |
| `Status` | `[ ]` pending / `[x]` done / `[!]` blocked |

**Zero-to-hero output contract:** After Phase 4, `TASKS.md` read top-to-bottom must be a single unambiguous path from "nothing exists" to "deliverable shipped." Tasks are ordered by strict dependency. No "or" forks. No "maybe." No "TBD." If a fork truly exists, it is a loop exit blocker — return to Phase 3.

After this phase, and only this phase, implementation begins.

## Guardrails

1. **No code in Phases 1–3.** Not even scaffolding. Not even `touch file.ts`. Exploratory reads are fine; writes to source are forbidden until Phase 4 begins.
2. **Every assumption is tagged.** No buried beliefs. If a statement cannot be labeled `FACT`, `DESIGN-CHOICE`, or `ASSUMPTION`, it is not yet fit for the plan.
3. **Word limit.** `FOUNDATIONS.md` and `LANDSCAPE.md` cap at ~1,500 words each. They are indexes, not narratives. Link to code; don't transcribe it.
4. **Falsifiability section is mandatory.** `PLAN.md` must answer: *what would falsify this plan?* This is the primary defense against analogy-based reasoning pretending to be first principles.
5. **Brownfield human-review flag.** Every `FOSSIL` and `CONVENTION` classification in `LANDSCAPE.md` is a hypothesis. Surface them explicitly for user review. The agent cannot know intent from code alone.
6. **Checkpoints block progress.** Phases 1→2 and 3→4 require explicit user sign-off. The agent does not auto-advance.
7. **Artifact durability.** All four documents (`FOUNDATIONS.md`/`LANDSCAPE.md`, `PLAN.md`, optional `RECONCILIATION.md`, `TASKS.md`) are written to a single directory chosen at the start of Phase 1 (see Output locations below) and committed with a `[mc] seed:` prefix when inside the vault. Future sessions rebuild context from these, not from chat.

## Output locations

Pick the destination once at the start of Phase 1 and keep all four artifacts together:

- **Inside a repo, in-session** — write to a directory the project already uses for planning docs. If none exists, ask the user. Do not invent a convention.
- **Idea capture flow from Telegram** — the existing vault convention is `08_Pipeline/ideas/<YYYY-MM-DD>-<slug>/index.md` (see `src/vault.ts` and `src/vault-writer.ts`). Additional seed artifacts co-locate in that same directory.
- **After `/open <slug>` promotion** — the whole pipeline directory is renamed into `06_Projects/6N_<PascalName>/` (see `src/idea-open.ts`). Artifacts move with it; no separate seeds subfolder is created.

All writes inside the vault are committed by the bot with a `[mc] seed: <path>` message so they flow into obsidian-git without conflict.

## Integration notes

- **Skill invocation.** This file is a Claude Code skill. It runs inside a CC session when the triggering language appears (see frontmatter description). Howl PA's TypeScript runtime does not call this skill — skills are session constructs, not runtime code. If Telegram captures an idea, the bot writes the idea to `08_Pipeline/ideas/...` and the user (or a CC agent session) invokes this skill against that seed later to produce the full four-artifact plan.
- **codex-corps delegation — Phase 1/2.** For brownfield Phase 1 walks and Phase 2 decompositions on codebases >5 modules, delegate to `codex-corps:codex-arch` (design-heavy) or `codex-corps:codex-research` (read-only spelunking). Spawning one of these agents is the documented hand-off point; it is not automatic but is strongly recommended.
- **codex-corps routing matrix — Phase 4.** Every task in `TASKS.md` requires an `Agent` field populated from this matrix. Use the first match:

  | Task type | Assign |
  |---|---|
  | Backend / API / business logic / server flows | `codex-corps:codex-backend` |
  | Frontend logic — state, hooks, reducers, data flow (NOT visuals) | `codex-corps:codex-frontend-logic` |
  | UI / visual / CSS / layout / copy | Claude inline — NOT codex-corps |
  | Stack traces / failing tests / broken behavior | `codex-corps:codex-debugger` |
  | Restructure without behavior change | `codex-corps:codex-refactor` |
  | SQL / migrations / ETL / ML | `codex-corps:codex-data` |
  | CI/CD / Docker / IaC / scripts | `codex-corps:codex-infra` |
  | Third-party API integration / OAuth / webhooks | `codex-corps:codex-integrate` |
  | Perf profiling / hotspot optimisation | `codex-corps:codex-perf` |
  | Framework / version / language migrations | `codex-corps:codex-migrate` |
  | Docs / READMEs / API refs | `codex-corps:codex-docs` |
  | Design docs / architecture decisions | `codex-corps:codex-arch` |
  | Read-only codebase exploration | `codex-corps:codex-research` |
  | PR / diff review | `codex-corps:codex-reviewer` |
  | Uncertain — classify first | `codex-corps:codex-route` → then the returned specialist |
  | Catch-all fallback | `codex-corps:codex-do` |

- **Memory surfacing.** `vault-indexer.ts` scans the whole projecthowl vault on the `vault-reindex` schedule. Any artifact written inside the vault (including seeds under `08_Pipeline/ideas/` or `06_Projects/6N_*/`) becomes visible to `recall()` within one reindex cycle. Artifacts written outside the vault (e.g., inside another repo) are not indexed.
