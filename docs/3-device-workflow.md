# The 3-device workflow

Howl PA is built around a single assumption: you use exactly three surfaces for knowledge work, and each of them has one job.

| Device | Surface | Role |
|---|---|---|
| Phone | Telegram bot + native Google apps | Capture + notifications |
| Laptop | Claude Code sessions | Execution |
| Anywhere | Obsidian vault | Manual reading, writing, thinking |

## Phone — Telegram bot

- Inbound: voice-to-text, photo, text. Everything gets classified and routed to a vault path.
- Outbound: the bot does not send you reminders. It creates Google Calendar events and Google Tasks, and you receive notifications from the native Google apps. That is the single notification surface.
- Commands live in `src/bot.ts` (`/start`, `/status`, `/capture`, `/note`, `/idea`, `/task`, `/task-add`, `/task-list`, `/task-done`, `/thesis`, `/literature`, `/journal`, `/nudge`, `/schedule`, `/mission`, `/brief`, `/help`, `/ask`, `/council`, `/backends`, `/ideas`, `/open`, `/discard`, `/lock`, `/chatid`, `/recall`, `/reindex`, `/mirror-thesis`).

## Laptop — Claude Code

- Every piece of real work — research, code, writing, planning — runs inside a Claude Code session.
- The subagent router (`src/subagent/router.ts`) mirrors the codex-corps 19-role taxonomy. Non-frontend code goes to Codex, design goes to Claude, council mode brings Ollama in.
- The `project-seeding` skill at `.claude/skills/project-seeding/SKILL.md` is the gate for non-trivial work: two-pass forward/backward first-principles planning before any code is written.

## Anywhere — Obsidian

- The vault at `VAULT_PATH` (default `~/Documents/projecthowl`) is the second brain.
- The bot inherits vault conventions (see [vault-conventions.md](./vault-conventions.md)); it never invents folders.
- All bot writes are committed with a `[mc] <op>: <path>` message so obsidian-git stays clean.

## What the bot does not do

- It does not replace Google's notification pipeline for tasks and calendar events.
- It does not write to the vault outside the conventions documented in [vault-conventions.md](./vault-conventions.md).
- It does not run code changes on its own — those flow through a Claude Code session.
