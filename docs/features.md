# Features — current + planned

## What ships today (v0.0.1)

### Runtime

- Node ≥ 22, TypeScript strict ES2022 NodeNext, single-process
- `node:sqlite` (WAL + FTS5 + BLOB vectors) as the only persistence layer
- Process lock + stale-instance recovery
- Structured logging via pino; dev mode pretty-printed

### Security

- PIN gate with salt + SHA-256 and `crypto.timingSafeEqual` compare
- `ALLOWED_CHAT_ID` allowlist enforced at every message
- Idle auto-lock (default 30 min)
- Kill phrase — shuts bot, scheduler, OAuth poll, dashboard
- Exfiltration guard (15+ regex patterns + base64/URL scan) on outbound messages
- Audit log for every mutation: captures, PIN attempts, blocks, exfil hits, commands

### Memory

- **FTS5** over conversation log — exact keyword, fast, offline
- **Vector** via sqlite BLOB columns + Ollama `nomic-embed-text` (768-dim) — semantic recall
- **claude-mem** adapter — cross-Claude-Code-session recall via MCP
- **Vault graph** — reads `[[link]]` network + Dataview-style queries
- **Blended `recall()`** in `src/memory.ts` — FTS 0.3 + vector 0.5 + recency 0.2, dedupe by source path
- `vault-indexer` re-embeds modified files every 10 min

### Vault (Obsidian)

- Respects existing `projecthowl/` conventions: 00_Dashboard through 08_Pipeline
- Daily notes auto-generated with weekday-aware frontmatter (gym Tue–Sat, thesis Mon–Fri, fasting water Mon else IF_08_14)
- Per-type writers: note → `04_Notes/inbox/`, idea → `08_Pipeline/ideas/<date>-<slug>/`, task → `02_Plans/inbox.md`, thesis fragment → `06_Projects/thesis/fragments/`, literature → `04_Notes/41_Literature/<citekey>.md`, journal → today's daily
- `/open <slug>` promotes pipeline idea to next free `6N_` project slot
- All bot writes committed with `[mc] <op>: <path>` — coexists with obsidian-git

### Ingestion

- **Gmail** — OAuth via googleapis, poll every 5 min, full-content capture (no label filter), LLM-scored for importance (Ollama → Claude fallback)
- **Calendar** — poll every 15 min; `createCalendarBlock()` for ritual-driven blocks
- **Google Tasks** — full client: queueTask, upsertTask, pollTasks, pushPendingTasks, completeTask; local-first queue that pushes when auth is available
- **Thesis mirror** — walks `~/Documents/Thesis/`, infers Zotero-style citekeys, appends `> [!howl-summary]` callout to existing literature notes or creates ZotLit-compatible stubs

### Scheduler

- Cron-parser driven 60-second tick
- 12 built-in missions — all run by default; pause or delete any via `/schedule pause <name>` in Telegram or the dashboard Routines tab
- Stuck-task recovery on init; paused status is preserved across restarts
- User-defined missions via `/schedule` or programmatic `upsertScheduledTask()`

### Rituals

- **Morning brief** 07:00 — Gmail priority + Calendar + Tasks summary
- **Morning ritual** 07:05 — focus / thesis artifact / venture artifact / three needle-movers; each needle-mover becomes a Google Task (due 18:00), `block time` tags create Calendar events
- **Evening nudge** 21:00 — reads today's flags, DMs misses with consequences
- **Evening tracker** 21:05 — sleep / energy / soreness / swim / sport / kit / meditation / reflection
- **Weekly review** Sun 18:00 — triage parked ideas, compose into `05_Progress/<week>.md`
- **Venture review** Sun 18:30 — summarize active `06_Projects/6N_*/`

### Subagent routing

- **Three backends** — ClaudeBackend (Agent SDK), CodexBackend (shell wrapper around `codex exec`), OllamaBackend (HTTP with `num_gpu:-1` forced)
- **Codex-corps 19-role taxonomy** — every dispatch resolves to one of: backend, frontend-logic, frontend-visual, debugger, refactor, tests, reviewer, security, data, infra, research, docs, arch, perf, migrate, integrate, prompt, route, oneshot, do
- **Role inference** — hint-first, keyword-regex-second, `do` fallback
- **Council mode** — parallel dispatch to configurable members, aggregator (`best-of-n` / `merge` / `vote`) with judge backend
- **Telemetry** — per-run row in `subagent_runs` with role, backend, judge, duration, tokens, cost, outcome

### Dashboard

- Hono + `@hono/node-server` on `127.0.0.1:3141`
- Token-gated (`crypto.timingSafeEqual`)
- 7 tabs: Overview, Scheduler, Missions, Memories, Subagents, Routing, Audit, Live
- SSE live feed

### Multi-bot fanout

- One grammy bot per `TELEGRAM_BOT_TOKEN_<AGENT_ID>` env var
- Each specialist routes DMs through the shared orchestrator with its own persona and agent context
- `.agents/<name>/CLAUDE.md` defines persona; agent-specific tools via `agents/<name>/agent.yaml`

### Shipping surface

- `npm i -g howl-pa` with `bin/howl-pa` CLI (start, setup, setup:google, health, howl, council, version)
- XDG-compliant config dir resolution
- Claude Code plugin via `.claude-plugin/marketplace.json` — stdio MCP server + `/howl-*` slash commands

## Planned (roadmap)

### Near-term (v0.1)

- **Self-hosted Ollama GPU on Bluefin** — podman quadlet container recipe documented end-to-end
- **npm publish automation** — `prepublishOnly` already gates on typecheck + build; need a GitHub Action to tag + publish
- **CI** — GitHub Actions: typecheck, build, `npm pack` smoke test on each PR
- **Config migration CLI** — `howl-pa migrate` that moves `~/.claudeclaw/` → `$XDG_CONFIG_HOME/howl-pa/` cleanly
- **`howl-pa doctor`** — a richer health check that explains remediation for each failing probe

### Mid-term (v0.2)

- **Voice capture** — Telegram voice notes → local whisper.cpp → classifier
- **Photo capture** — Telegram photo → local OCR (Tesseract) → classifier; screenshots as note attachments under `Attachments/`
- **Meeting notes** — paste a transcript, get a daily-note-linked summary with action items auto-queued as Google Tasks
- **Journal synthesis** — weekly journal roll-up using the full week's daily note reflection fields
- **Project budget tracking** — per-`6N_*` project token/time budget surfaced in the venture-review mission
- **Seed activation** — `/activate <slug>` takes a seed.md, scaffolds a new git repo with the first_steps as PLAN.md, spawns a fresh `@<slug>` bot

### Long-term (v1.0)

- **War Room** — voice subsystem using local whisper + piper + edge TTS; activated via a dedicated Telegram command
- **Peer collaboration** — optional shared-vault mode where two Howl PA instances mirror decisions via signed commits
- **Self-improvement loop** — weekly pass that reads `audit_log` + `subagent_runs` and proposes routing-rule tweaks for user review
- **Browser extension** — capture from web pages directly into the vault without going through Telegram
- **Mobile-first dashboard** — responsive rework of `src/dashboard-html.ts`

## Explicit non-goals

- Not a hosted service. Howl PA runs on your machine and writes to your vault, period.
- Not a replacement for Obsidian's editor — reading and writing manually is expected.
- Not a Gemini or OpenAI general-purpose client. The only paid subscriptions used are Claude and ChatGPT (via Codex).
- No WhatsApp. Removed in v0.0.1 after weighing ToS risk + low signal value.
- No remote access by default. The dashboard binds to `127.0.0.1`; exposing it is the user's call (Cloudflare Tunnel or SSH tunnel).

## Contributing

Out-of-scope for the v0.x series. Feedback and bug reports welcome via GitHub issues. Pull requests are considered but the author reserves the right to reshape or decline based on scope fit.
