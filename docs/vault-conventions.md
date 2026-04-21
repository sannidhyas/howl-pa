# Vault conventions

Howl PA writes into an existing Obsidian vault at `VAULT_PATH` (default `~/Documents/vault`). The bot inherits the vault's structure rather than imposing a new one. The defaults below are what the author uses and what the bot assumes — edit `src/vault.ts` to match your own layout (see [customization.md](./customization.md)).

## Default folder layout

```
vault/
├── 00_Dashboard/             # Home, ledger views (manual)
├── 01_System/                # Setup docs, consequences, privacy
├── 02_Plans/                 # Schedules, inbox, multi-year plans
│   └── inbox.md              # Bot appends recurring tasks here
├── 02_Templates/             # Daily, Literature, Monthly, Note
├── 03_Daily/                 # YYYY-MM-DD.md (bot-managed)
├── 04_Notes/
│   ├── inbox/                # Bot: classified "note" captures
│   └── 41_Literature/        # Bot: literature summaries
│       └── 411_Attachments/
├── 05_Progress/              # Bot: weekly-review writes here
├── 06_Projects/              # Bot: /open promotes pipeline ideas here
│   └── 6N_PascalName/        # Next free slot, picked by src/idea-open.ts
├── 08_Pipeline/
│   └── ideas/                # Bot: new idea captures
│       └── YYYY-MM-DD-slug/
│           └── index.md
└── Attachments/
```

## Minimum viable vault

At first boot the bot needs these folders present (anything else can come later):

```
<VAULT_PATH>/02_Templates/
<VAULT_PATH>/03_Daily/
<VAULT_PATH>/04_Notes/inbox/
<VAULT_PATH>/04_Notes/41_Literature/
<VAULT_PATH>/08_Pipeline/ideas/
```

## Daily note frontmatter (`03_Daily/YYYY-MM-DD.md`)

`src/vault.ts:ensureDailyNote()` generates the frontmatter. **The defaults are author-specific** — edit the function to match your routine. Default keys include:

- `day_type`, `exempt`, `fasting`
- `gym_required`, `thesis_required`, and matching `*_done` toggles
- Trackers: `artifact_type`, `sport`, `swim`, `sleep_hours`, `energy`, `soreness`, `kit_done`, `meditation_done`

Sections the bot maintains inside the daily note:

- `## Brief` — written by `morning-brief` at 07:00
- `## Morning ritual` — written by the morning survey at 07:05
- `## Thesis artifact` — appended by `/thesis` captures (academic profile only)
- `## Evening tracker` — written by the evening survey at 21:05

## Commit protocol

Every bot write is committed by `src/vault-writer.ts` with a `[mc] <op>: <path>` message. The bot never stages user edits it didn't make itself — your in-progress edits stay untouched. obsidian-git can continue on its own cadence.

## What the bot will never do

- Create new top-level numbered folders.
- Rename folders you already manage.
- Auto-delete notes. The only delete path is explicit: `/discard <slug>` for ideas in pipeline.
- Write into `Attachments/` or any folder not listed above.

## Literature pipeline

If you use ZotLit (Zotero → Obsidian), Howl PA's thesis-mirror mission respects its callout format: summaries land inside `> [!howl-summary]` blocks appended to existing `04_Notes/41_Literature/<citekey>.md` files. The mission is gated behind `HOWL_PROFILE=academic`; see [customization.md](./customization.md).
