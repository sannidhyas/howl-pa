# User guide

Everything the bot does, in one place.

## Core loop

1. You send anything to the bot (text, voice, photo).
2. A classifier (`src/capture-router.ts`) decides what kind of thing it is: `note`, `idea`, `task`, `literature`, `thesis_fragment`, `journal`, or `ephemeral`.
3. The bot writes to the right path in the Obsidian vault, commits with a `[mc]` message, and replies.
4. Scheduled missions (brief, ritual, nudge, ingestion) run in the background.
5. Subagent requests dispatch to Codex (default), Claude (UI/UX/Design), or a council mode mixing both plus Ollama.

## Telegram commands

### Status + security

| Command | Effect |
|---|---|
| `/start` | Greeting + PIN prompt if locked |
| `/status` | Short status with uptime, locked state, vault path |
| `/chatid` | Echoes your chat ID (first-run aid) |
| `/newchat` | Ends the current conversation thread so the next capture starts a fresh session |
| `/lock` | Locks immediately; requires PIN to unlock |
| `/help` | Command list |

While locked, only `/start`, `/chatid`, `/status` work. Everything else needs PIN. Idle auto-lock fires after `IDLE_LOCK_MINUTES` minutes (default 30). Typing the kill phrase shuts the bot down cleanly.

### Capture

All of these route through the classifier unless you prefix them — the prefix forces the type.

| Command | Forces type | Goes to |
|---|---|---|
| `/capture <text>` | auto | classifier picks |
| `/note <text>` | note | `04_Notes/inbox/<YYYY-MM-DD-HHMM>-<slug>.md` |
| `/idea <text>` | idea | `08_Pipeline/ideas/<date>-<slug>/index.md` + full rundown + seed |
| `/task <text>` | task | `02_Plans/inbox.md` checkbox append |
| `/task-add <text>` | — | creates a Google Task immediately (due end-of-day) |
| `/task-list` | — | shows up-to-25 pending tasks with short IDs |
| `/task-done <short-id>` | — | marks task completed (local + Google) |
| `/thesis <text>` | thesis_fragment | `06_Projects/thesis/fragments/<date>-<slug>.md` + daily artifact entry |
| `/literature <cite>` | literature | `04_Notes/41_Literature/<citekey>.md` (ZotLit-compatible stub) |
| `/journal <text>` | journal | today's daily note under `## Journal` |

Send a message without any command and the classifier picks automatically. `ephemeral` captures get a short reply but are never written to the vault.

### Idea pipeline

| Command | Effect |
|---|---|
| `/ideas` | Lists parked ideas with slugs |
| `/open <slug>` | Promotes pipeline idea to `06_Projects/6N_PascalName/` (next free `6N_` slot) |
| `/discard <slug>` | Deletes the pipeline folder after confirmation |

The idea flow invokes Codex with a rundown prompt (problem, competition, unit economics, MVP + 90-day plan), three pitches, ten follow-up questions, and a `seed.md` the user can activate later.

### Memory

| Command | Effect |
|---|---|
| `/recall <query>` | Blended FTS + vector + recency search over the vault and conversation log |
| `/reindex` | Force re-embed of modified vault files (normally runs every 10 min) |
| `/mirror-thesis` | Walk `~/Documents/Thesis/`, summarize each new paper, append ZotLit callout |

### Scheduled missions

| Command | Effect |
|---|---|
| `/brief` | Runs the morning-brief mission now regardless of clock |
| `/nudge` | Runs the evening-nudge mission now |
| `/schedule <cron> <mission> [args]` | Register a custom scheduled task |
| `/mission <name>` | Run a named mission once, immediately |

### Subagent dispatch

| Command | Effect |
|---|---|
| `/ask <prompt>` | Default single-backend dispatch (Codex for most, Claude for UI/UX hints) |
| `/ask claude <prompt>` | Force Claude |
| `/ask codex <prompt>` | Force Codex |
| `/ask ollama:<model> <prompt>` | Force a specific Ollama model |
| `/council <prompt>` | Parallel dispatch to Claude + Codex + Ollama; judge picks or merges |
| `/backends` | Lists available backends |

### Agent delegation

DM syntax `@<agentId>: <prompt>` routes to a specialist persona (defined in `.agents/<agentId>/CLAUDE.md`) using that agent's context and tool permissions. Each agent also has its own Telegram bot if you set `TELEGRAM_BOT_TOKEN_<AGENT>` in the env — that bot picks up DMs directly and routes through the same orchestrator.

## Missions (scheduled)

All defined in `src/scheduler.ts:BUILT_INS`, implemented in `src/missions/*.ts`.

| Name | Cron | What |
|---|---|---|
| `morning-brief` | `0 7 * * *` | Gmail priority + Calendar + Tasks into today's daily + DM |
| `morning-ritual` | `5 7 * * *` | Multi-turn survey: focus → thesis artifact → venture artifact → three needle-movers → creates Google Tasks + Calendar blocks |
| `evening-nudge` | `0 21 * * *` | Reads today's frontmatter; DMs nudges for missed required flags |
| `evening-tracker` | `5 21 * * *` | Multi-turn survey: sleep hours, energy, soreness, swim, sport, kit, meditation, reflection |
| `vault-reindex` | `*/10 * * * *` | Re-embed modified vault files |
| `weekly-review` | `0 18 * * 0` | Compose weekly review into `05_Progress/<week>.md`, triage parked ideas |
| `venture-review` | `30 18 * * 0` | Summarize active projects — last commit, last log entry, next milestone |
| `gmail-poll` | `*/5 * * * *` | Fetch new inbox messages |
| `gmail-classify` | `*/7 * * * *` | LLM-score pending messages for importance |
| `calendar-poll` | `*/15 * * * *` | Refresh events cache |
| `tasks-poll` | `*/5 * * * *` | Pull Google Tasks state |
| `tasks-push` | `*/5 * * * *` | Push locally-queued tasks when auth is available |

## Dashboard

Runs on `http://127.0.0.1:3141/?token=<DASHBOARD_TOKEN>`. Seven tabs:

- **Overview** — pid, uptime, conversation rows, memory chunks, recent token usage
- **Scheduler** — every cron task with next run + last result + status pill
- **Missions** — ad-hoc + cron mission queue with result and started-at
- **Memories** — recent indexed chunks with source path and preview
- **Subagents** — every dispatch with mode, role, backend, judge, duration, outcome
- **Routing** — per-role aggregates (runs / ok / err / ok% / avg ms) over a rolling window
- **Audit** — PIN attempts, blocks, exfil hits, command events
- **Live** — server-sent events stream of in-flight activity

## Managing specialist agents from the command line

```
howl-pa howl agent:create <name>    # scaffolds .agents/<name>/CLAUDE.md
howl-pa howl agent:list             # show all
howl-pa howl attach <name>          # live pipe into that agent's session
```

Giving a specialist its own Telegram bot: export `TELEGRAM_BOT_TOKEN_<NAME>=…` in the env before `howl-pa start`. The specialist bot startup happens in `src/agent-bot.ts:startAllSpecialistBots()`.

## Vault commit policy

Every bot write produces a commit with `[mc] <op>: <path>`. The bot only stages files it wrote itself, so any in-progress edits you have in the vault stay untouched. The obsidian-git plugin keeps running on its own cadence; the two coexist.

## Troubleshooting

- **Bot doesn't reply** — check `/status`; if locked, DM your PIN. If still silent, check `howl-pa health`.
- **"locked. send PIN."** — your session idle-locked. PIN is what you set during `howl-pa setup`.
- **Tasks don't appear in Google** — `howl-pa setup:google` needs re-running; the `tasks` scope was added in v0.0.1 and requires re-consent.
- **Ollama missing from council** — ensure it's listening on `http://localhost:11434` and pulled `nomic-embed-text` + at least one chat model.
- **Dashboard 401** — ensure your URL has `?token=<DASHBOARD_TOKEN>` matching `.env`.
