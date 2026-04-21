---
name: codex-corps-handoff
description: Canonical routing guide for picking the right codex-corps specialist. Reference this when delegating any coding task and you need to know which specialist to invoke. Also serves as a standalone skill when the user asks which agent to use for a task. Triggers on phrases like "which codex specialist", "route this to codex-corps", "codex agent picker", "how do I delegate this", "who should do this task", "codex-corps routing".
---

# Codex-Corps Handoff — Specialist Routing Guide

The canonical routing reference for `codex-corps`. Every task that leaves this session goes to a specialist via this table. Both `council` and `forward-backward-think` link here for their execution-path task assignments.

## Specialist routing table

| Specialist | Route when the task is... |
|---|---|
| `codex-backend` | REST/GraphQL/RPC endpoint implementation, service-layer business logic, domain models, validators, background jobs, queues, cron handlers, server-side auth/session/middleware, server-side caching and rate limiting |
| `codex-frontend-logic` | State management, hooks, reducers, data flow, client-side routing logic — NOT visuals, CSS, or component aesthetics |
| `codex-debugger` | Stack traces, failing tests, broken behavior, reproducing a bug, narrowing a root cause |
| `codex-refactor` | Restructuring code without changing observable behavior — rename, extract, inline, reorganize modules |
| `codex-tests` | Writing new test suites, expanding coverage, iterating on a test until green, snapshot/fixture management |
| `codex-infra` | CI/CD pipelines, Docker/Compose files, IaC (Terraform, Pulumi), deployment scripts, environment config |
| `codex-integrate` | Third-party API integrations, OAuth flows, webhook handlers, SDK wrappers |
| `codex-data` | SQL queries, schema design, migrations, ETL pipelines, ML data prep — not application-layer ORM calls |
| `codex-perf` | Profiling, hotspot identification, query optimization, bundle size, latency reduction |
| `codex-security` | Vulnerability audit, dependency scanning, hardening, secrets hygiene, auth model review |
| `codex-migrate` | Framework, language, or major version migrations (e.g., Vue 2→3, Node 14→22, CJS→ESM) |
| `codex-docs` | Technical documentation, READMEs, API references, inline JSDoc/docstrings |
| `codex-research` | Read-only codebase exploration, technology research, competitive analysis — no writes |
| `codex-arch` | System design, architectural tradeoffs, interface contracts, component boundary decisions — no writes |
| `codex-reviewer` | Diff review, PR review, code quality assessment |
| `codex-route` | **Use this when unsure which specialist applies.** It returns the specialist name — then dispatch to that specialist. |
| `codex-do` | Catch-all fallback for tasks that don't fit any specialist above |

## Stay-in-lane rules (do NOT route to codex-corps)

These categories stay with Claude inline:

- **UI / UX / visual design / CSS / copy / layout** — aesthetic and design decisions are Claude's domain, not codex-corps.
- **Trivial one-liners and config toggles** — if the change is one symbol in one file and the approach is obvious, make it inline. The routing overhead isn't worth it.
- **Planning and alignment** — scoping, project-seeding, forward-backward-think sessions happen before a task is delegated. Don't send an under-specified task to a specialist.
- **`/gsd-*` and `/plugin-dev:*` invocations** — these have their own routing; honour it, don't override with codex-corps.

## Escalation rule

If a specialist returns a result that is blocked, unclear, or clearly off-track:

1. **Diagnose** — read the specialist's output, identify why it failed (wrong scope, missing context, wrong specialist).
2. **Re-dispatch** — either re-prompt the same specialist with corrected context, or route to a different specialist.
3. **Never silently take it inline** — if the work was worth routing, it's worth routing correctly. Silently absorbing a failed delegation hides the failure and undermines the routing discipline.

## "Unsure which specialist?" protocol

When the task doesn't map cleanly to one row in the table:

```
codex-corps:codex-route — <task description>
```

`codex-route` returns the specialist name. Use that name for the actual dispatch. Don't guess.

## Concrete examples

| Task | Specialist |
|---|---|
| Add `POST /users` endpoint with validation | `codex-backend` |
| Fix failing auth integration test | `codex-debugger` |
| Migrate the codebase from Vue 2 to Vue 3 | `codex-migrate` |
| Write a PR review for the session-token PR | `codex-reviewer` |
| Build the Redux slice for notification state | `codex-frontend-logic` |
| Containerize the howl-pa service with Docker Compose | `codex-infra` |
| Add Stripe webhook handler | `codex-integrate` |

## Links

- `forward-backward-think` — uses this table to assign specialists to every execution-path task
- `council` — invoked when a `DESIGN-CHOICE` leaf in `forward-backward-think` or `project-seeding` Phase 2/3 is non-obvious
- `project-seeding` — Phase 4 execution tasks each name a specialist from this table
