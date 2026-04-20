# Howl PA

Personal Mission Control. Telegram-first assistant that maintains an Obsidian vault, ingests Gmail / Calendar / WhatsApp, and spawns Codex or Claude subagents.

Build plan: `~/.claude/plans/mighty-wobbling-wren.md`.

Reference docs (archived from v2 spec): `docs/`.

## Quick start

```sh
cp .env.example .env
# fill TELEGRAM_BOT_TOKEN, ALLOWED_CHAT_ID, CLAUDE_CODE_OAUTH_TOKEN
npm install
npm run setup          # PIN + kill phrase
npm run build
npm run start
```

## Layout

```
src/
  index.ts          # lifecycle + wiring
  bot.ts            # grammy Telegram handler
  agent.ts          # Claude Agent SDK wrapper
  db.ts             # better-sqlite3 schema + migrations
  security.ts       # PIN, idle lock, kill phrase, audit
  exfiltration-guard.ts
  ...
scripts/
  setup.ts          # interactive PIN wizard
docs/               # archived v2 reference
store/              # runtime state (db, lock, not committed)
~/.claudeclaw/      # secrets (outside repo)
```
