# Ritual protocols

Four scheduled rituals shape the daily cadence. All live in `src/missions/` and `src/rituals.ts`.

## Morning brief — 07:00 daily

Mission: `morning-brief`. Reads Gmail priority (last 24h), Calendar (today + next 24h), and pending Tasks. Composes a summary into today's daily note under `## Brief` and DMs you the same summary.

## Morning ritual — 07:05 daily

Mission: `morning-ritual`. Multi-turn Telegram survey via `src/conversation-state.ts`:

1. Focus for the day (one sentence)
2. Thesis artifact plan (what you'll produce — skip if no `thesis_required`)
3. Venture artifact plan (what moves the needle — skip if not relevant)
4. Three needle-movers. For each, send one per line. Append `block time` on a line to create a Calendar block.

Each needle-mover becomes a Google Task (due 18:00 local). Lines tagged `block time` also create a 25-minute Calendar block via `src/calendar.ts:createCalendarBlock()`. The user sees everything in the native Google Tasks and Calendar apps — the bot does not send redundant reminders for items it created.

## Evening tracker — 21:05 daily

Mission: `evening-tracker`. Multi-turn survey that writes today's daily frontmatter:

- `sleep_hours` (float)
- `energy` (1–10)
- `soreness` (1–10)
- `swim` (y/n)
- `sport` (free text)
- `kit_done`, `meditation_done` (y/n)
- Reflection paragraph → appended under `## Evening tracker`

## Evening nudge — 21:00 daily

Mission: `evening-nudge`. Reads today's daily frontmatter. For each required flag that is still false (`thesis_required=true thesis_done=false`, `gym_required=true gym_done=false`, etc.), it DMs a nudge with the relevant consequence line from `01_System/Consequences.md`. This runs before the evening tracker fires, so the tracker can honor your reply.

## Weekly review — Sunday 18:00

Mission: `weekly-review`. Walks `08_Pipeline/ideas/` parked ideas, composes a weekly summary into `05_Progress/<week>.md` with links to artifacts and misses, and asks you to triage pending ideas (`open <slug>`, `park`, `discard`).

## Venture review — Sunday 18:30

Mission: `venture-review`. Summarizes active `06_Projects/6N_*/` projects: last commit on each, last note in each project's log, next milestone if one is specified. Writes into the same weekly progress file.

## Modifying rituals

Cron schedules are built into `src/scheduler.ts:BUILT_INS`. Survey questions are in `src/rituals.ts` question arrays. DB rows for one-off tasks go through `upsertScheduledTask()`.
