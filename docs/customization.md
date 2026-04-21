# Customization

Howl PA's defaults encode a specific daily flow (author's). Every piece is a short TypeScript file, so fork-and-edit is the normal path. This doc maps intent to the file that owns it.

## Profile toggle

Set `HOWL_PROFILE` in `.env`:

- `neutral` (default) — brief, ritual, nudge, tracker, vault reindex, weekly review, ingestion. No venture review, no thesis mirror.
- `academic` — adds the thesis-mirror flow and the venture review (most academic users run projects too).
- `venture` — adds the venture review only.

Gating lives in `src/scheduler.ts` (`profiles` field on each built-in).

## Daily note frontmatter

`src/vault.ts` → `ensureDailyNote()` generates today's daily note from `02_Templates/Daily (Template).md` and fills frontmatter based on weekday. Default rules:

- Mon → `fasting: water_fast_until_14`, else `fasting: IF_08_14`
- Tue–Sat → `gym_required: true`
- Mon–Fri → `thesis_required: true`

**Edit if this doesn't match your life.** Suggested moves for a general-purpose install: rename `thesis_required` → `focus_required`, `gym_required` → `exercise_required`, drop the fasting defaults.

## Ritual question packs

`src/rituals.ts` owns two multi-turn surveys:

- **Morning ritual** — focus, thesis artifact, venture artifact, three needle-movers
- **Evening tracker** — sleep, energy, soreness, swim, sport, kit, meditation, reflection

The arrays at the top of the file are the full question list. Delete or reword freely. Each question has a `key` (written into the daily note) and a `prompt` (shown on Telegram).

## Built-in missions

`src/missions/*.ts` — one file per mission. Add a new mission:

1. Create `src/missions/my-mission.ts` exporting `const myMission: MissionFn = async (ctx) => { … return { summary: '…' } }`
2. Register in `src/missions/index.ts`
3. Add a row to `BUILT_INS` in `src/scheduler.ts` (set `profiles: ['neutral']` etc. to gate)

## Vault folder names

Top-level folder constants live in `src/vault.ts`:

```ts
export const VAULT_DIRS = {
  pipeline: '08_Pipeline',
  projects: '06_Projects',
  notes: '04_Notes',
  daily: '03_Daily',
  ...
}
```

Change these to match your own Obsidian structure. The bot never creates top-level numbered folders on its own; it only writes inside folders that already exist.

## Subagent routing taxonomy

`src/subagent/router.ts` → `ROLE_RULES` is the ordered match table. First match wins. Tweak hints/keywords to match your vocabulary. Every run's inferred role is persisted in `subagent_runs.role`, so the dashboard Routing tab will reflect your changes immediately.

## Specialist Telegram bots

Add `TELEGRAM_BOT_TOKEN_<AGENT_ID>` to `.env` (get tokens from @BotFather). Create `agents/<agent_id>/CLAUDE.md` with the persona. See `agents/_template/` for the shape. `src/agent-bot.ts:startAllSpecialistBots()` discovers tokens by env prefix on startup.

## Commit attribution

The bot commits vault writes with `[mc] <op>: <path>`. Commit author is taken from your global `git config user.name` / `user.email` in the vault repo. If you want the bot's commits under a different identity, set them inside the vault: `cd ~/Documents/<vault> && git config user.name "howl-pa"`.

## Re-enabling something you removed

The author's default setup is the most featured one. If you removed a mission and want it back, look at the `agents/` folder and `BUILT_INS` in scheduler.ts — both act as a reference for what the full surface looks like.
