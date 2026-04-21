# Ritual protocols

Four scheduled rituals shape the daily cadence. All live in `src/missions/` and `src/rituals.ts`. The question packs and schedule defaults below reflect the author's workflow — edit the arrays in `src/rituals.ts` and the cron lines in `src/scheduler.ts:BUILT_INS` to match your own.

## Morning brief — 07:00 daily

Mission: `morning-brief`. Reads Gmail priority (last 24h), Calendar (today + next 24h), and pending Tasks. Composes a summary into today's daily note under `## Brief` and DMs you the same summary.

## Morning ritual — 07:05 daily

Mission: `morning-ritual`. Multi-turn Telegram survey via `src/conversation-state.ts`. Default question pack:

1. Focus for the day (one sentence)
2. Deep-work artifact plan (what you'll produce) — skippable
3. Secondary artifact plan — skippable
4. Three needle-movers. For each, send one per line. Append `block time` on a line to create a Calendar block.

Each needle-mover becomes a Google Task (due 18:00 local). Lines tagged `block time` also create a 25-minute Calendar block via `src/calendar.ts:createCalendarBlock()`. You see everything in the native Google Tasks and Calendar apps — the bot does not send redundant reminders for items it created.

## Evening tracker — 21:05 daily

Mission: `evening-tracker`. Multi-turn survey that writes today's daily frontmatter. Default pack records sleep, energy, soreness, sport, kit, meditation, and a reflection paragraph appended under `## Evening tracker`. Shorten or swap the question list in `src/rituals.ts` if the default doesn't match your routine.

## Evening nudge — 21:00 daily

Mission: `evening-nudge`. Reads today's daily frontmatter. For every required flag still false (`*_required=true` + `*_done=false`), DMs a nudge with the relevant consequence line from `01_System/Consequences.md`. Fires before the evening tracker so the tracker can honor your reply.

## Weekly review — Sunday 18:00

Mission: `weekly-review`. Walks `08_Pipeline/ideas/` parked ideas, composes a weekly summary into `05_Progress/<week>.md` with links to artifacts and misses, and asks you to triage each pending idea (`open <slug>`, `park`, `discard`).

## Venture review — Sunday 18:30

Mission: `venture-review`. Summarizes active `06_Projects/6N_*/`: last commit per project, last note in the project log, next milestone if specified. Writes into the same weekly progress file.

## Modifying rituals

- Schedules — `src/scheduler.ts:BUILT_INS`. Cron expressions via `cron-parser`.
- Question packs — arrays at the top of `src/rituals.ts`. Each entry has a `key` (written into the daily note) and a `prompt` (shown on Telegram).
- One-off user tasks — `upsertScheduledTask()` from `src/db.ts` or the `/schedule` Telegram command.
