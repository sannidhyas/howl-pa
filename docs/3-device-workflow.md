# The 3-device workflow

Howl PA is built around a single assumption: three surfaces for knowledge work, one job each.

| Device | Surface | Role |
|---|---|---|
| Phone | Telegram bot + native Google apps | Capture + notifications |
| Laptop | Claude Code sessions | Execution |
| Anywhere | Obsidian vault | Manual reading, writing, thinking |

## Phone — Telegram bot

- Inbound: text, voice, photo. Everything gets classified and routed to a vault path.
- Outbound: the bot does not send reminders. It creates Google Calendar events and Google Tasks; your phone's native Google apps do the nudging. That is the single notification surface.
- Commands live in `src/bot.ts` — see [user-guide.md](./user-guide.md) for the full list.

## Laptop — Claude Code

- Every piece of real work — research, code, writing, planning — runs inside a Claude Code session.
- The subagent router (`src/subagent/router.ts`) mirrors the codex-corps 19-role taxonomy. Non-frontend coding routes to Codex, design routes to Claude, council mode brings Ollama in.
- The `project-seeding` skill (shipped with the CC plugin) gates non-trivial work behind a two-pass first-principles planning protocol before code is written.

## Anywhere — Obsidian

- The vault at `VAULT_PATH` is the second brain.
- The bot inherits vault conventions (see [vault-conventions.md](./vault-conventions.md)) — it does not invent new folders.
- All bot writes commit with `[mc] <op>: <path>` so obsidian-git stays clean.

## What the bot does not do

- It does not replace Google's notification pipeline for tasks and calendar events.
- It does not write to the vault outside the conventions documented in [vault-conventions.md](./vault-conventions.md).
- It does not run code changes on its own — those flow through a Claude Code session.
