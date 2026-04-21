---
name: council
description: Multi-model council deliberation for howl-pa. Invoke when a decision is non-obvious, design alternatives are close, or cross-model sanity is needed on a critical call. The council aggregates claude + codex + local ollama behind a best-of-n | merge | vote judge and returns a single answer. Triggers on phrases like "ask the council", "council decision", "multi-model deliberation", "cross-model check", "which framework should we pick", "is this design right", "sanity check across models", "best-of-n answer", "second opinion from codex and ollama".
---

# Council — Multi-Model Deliberation

Howl PA's council protocol. When a decision is non-obvious, when design alternatives are genuinely close, or when a critical call warrants cross-model sanity, route through the council before committing. The council fans the prompt out to Claude + Codex + local Ollama, applies a judge aggregator (`best-of-n`, `merge`, or `vote`), and returns a single vetted answer alongside per-member timing and any member errors.

## When to use

- Non-obvious design decisions — architecture style, data model shape, interface contract, dependency choice
- Framework or library selection where reasonable engineers would disagree
- "Is this safe to ship?" — pre-merge sanity on security-sensitive or data-destructive changes
- Architectural tradeoffs with close alternatives (e.g., serverless vs. long-running service, REST vs. GraphQL for a specific use case)
- Hard routing calls where the answer has lasting consequences and is not derivable from docs
- Any decision the user explicitly flags as "non-obvious" or "I'm not sure about this"
- Inside Phase 2/3 of `project-seeding`: `DESIGN-CHOICE` nodes where the stated alternative is genuinely competitive (see link below)

## When NOT to use

Skip the council and answer inline when:

- The question is factual — a grep, a docs lookup, a stdlib reference
- One backend is obviously authoritative (e.g., Codex on a code structure question, Claude on a prose question)
- The user has already decided and is asking for execution, not deliberation
- You are inside a rapid iteration loop — council latency (30s–5min) kills flow. Use it at decision gates, not mid-loop
- The question is trivial and a junior engineer would answer it in 5 seconds without hesitation

## How to invoke

Two paths, pick by context:

### a) From a Claude Code session

Use the `/howl-council` slash command (shipped alongside this skill):

```
/howl-council [merge|best-of-n|vote] <your prompt>
```

Examples:
- `/howl-council best-of-n Which cache strategy fits our read pattern — LRU on Redis vs. TTL-only on node-cache?`
- `/howl-council merge Synthesize an auth flow for session tokens that works across Telegram + Dashboard + CC`
- `/howl-council vote Should we add a circuit breaker to the outbound Ollama calls? yes/no/defer`

The command hits `POST /api/council` on the local howl-pa server. The server fans out to all configured backends, applies the judge, and returns the result synchronously (streamed if the client supports it).

### b) From Telegram

Send `/council <prompt>` directly to the bot. The bot routes to the same `POST /api/council` handler. Response is formatted and returned to the same chat. Long responses are chunked to Telegram's 4096-char limit.

## Choosing the aggregator

| Aggregator | Use when |
|---|---|
| `best-of-n` | Open-ended question, judge picks the single best response. Good for "which approach is correct?" |
| `merge` | You want the best of all responses synthesized. Good for "give me the ideal answer combining insights from all members." |
| `vote` | Structured binary or label question (yes/no, A/B/C). Each member casts a vote; majority wins. Ties surface both positions. |

Default to `best-of-n` when unsure which aggregator to use.

## Output shape

The council response always includes:

- **Winner backend** (for `best-of-n` and `vote`) or **Synthesized answer** (for `merge`)
- **Per-member timing** — wall-clock ms per backend call, so you can see who was slowest
- **Final answer** — the judge's output, ready to act on
- **Member errors** — any backend that errored shows ⚠️ inline with the error summary. Errors from individual members do not block the final answer as long as at least two members responded

Example output shape (illustrative):

```
Council result (best-of-n, 3 members, 42s total)
Winner: codex (12.1s)
claude: 14.8s
ollama: 15.3s ⚠️ timeout after 15s — excluded from judge

Final answer:
<judge output here>
```

## Link to project-seeding

Inside `project-seeding` Phase 2 or 3, every `DESIGN-CHOICE` node has a stated alternative. If that alternative is genuinely competitive — meaning a reasonable engineer could make either call — surface it as a council prompt before closing the node. Format:

```
/howl-council best-of-n <DESIGN-CHOICE node text, stated alternatives, relevant constraints from FOUNDATIONS.md>
```

Do not invoke the council for `DESIGN-CHOICE` nodes where the alternative is clearly inferior or where the decision traces directly to a `HARD` constraint in `FOUNDATIONS.md`. Save council calls for genuine ambiguity.

## Hard rules

1. **One call per critical decision gate.** The council costs 30s–5min per call. Do not chain calls, spam the council mid-iteration, or use it as a substitute for thinking.
2. **Act on the output.** If you invoke the council, you accept the result unless you have a specific, articulable reason to override it. Record the override reason in `RECONCILIATION.md` or as an inline comment if outside seeding.
3. **Member errors are informational, not blocking.** A council with two live members and one error still produces a valid result.
4. **Don't ask the council what you already know.** If the answer is already in a doc, a test result, or the existing codebase, don't pay the latency cost — look it up.
