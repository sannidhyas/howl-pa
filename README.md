# Howl PA

Personal Mission Control. One assistant across three surfaces:

- **Phone** — Telegram bot for capture + native Google notifications
- **Laptop** — Claude Code sessions for all real work
- **Anywhere** — Obsidian vault as the second brain

Telegram captures everything, classifies it, writes to the right Obsidian path, and commits. The bot does not try to be the notification surface — it creates Google Tasks + Calendar events and lets your phone's native Google apps do the nudging. Subagent work routes to Codex by default (non-frontend) and Claude for design, with Ollama as a local council member.

## Status

v0.0.1. Runs daily against a real workload. Ships as both an npm package and a Claude Code plugin.

## Quickstart

```sh
# 1. Install the release tarball directly. (This works around an npm
#    git-install filesystem race seen on Fedora/Bluefin — the tarball
#    avoids it entirely.)
npm i -g https://github.com/sannidhyas/howl-pa/releases/latest/download/howl-pa.tgz

# 2. First-run wizard (PIN, kill phrase, Telegram bot token, chat allowlist)
howl-pa setup

# 3. Google OAuth for Gmail + Calendar + Tasks
howl-pa setup:google

# 4. Start the bot + scheduler + dashboard
howl-pa start
```

Once the package is pushed to the npm registry, `npm i -g howl-pa` will work as well.

Then DM your bot on Telegram. See [`docs/install.md`](./docs/install.md) for the full flow, including Claude Code plugin install.

## Docs

- [Setup guide](./docs/setup-guide.md) — step-by-step from zero: every credential, where to get it, what to paste where
- [Install guide](./docs/install.md) — npm, CC plugin, source
- [User guide](./docs/user-guide.md) — every Telegram command, every mission, every dashboard tab
- [Features — current + planned](./docs/features.md) — what ships today, what's on the roadmap
- [Customization](./docs/customization.md) — where to edit to make the bot match your own workflow (daily frontmatter, ritual questions, vault folders, missions)
- [3-device workflow](./docs/3-device-workflow.md) — the mental model the bot is built around
- [Vault conventions](./docs/vault-conventions.md) — what folders the bot owns vs what you own
- [Ritual protocols](./docs/ritual-protocols.md) — the scheduled surveys that run every day

## Highlights

- **Four-layer memory** — FTS5 + vector (Ollama nomic-embed-text) + claude-mem + vault graph, blended in `src/memory.ts`
- **19-role subagent router** — codex-corps taxonomy (backend, debugger, refactor, tests, security, data, infra, research, docs, arch, perf, migrate, integrate, reviewer, prompt, route, oneshot, frontend-logic, frontend-visual, do); per-role telemetry in the dashboard
- **Council mode** — Claude + Codex + Ollama on the same prompt, merged or judged
- **ZotLit-aware thesis mirror** — summarises your Zotero literature back into existing `04_Notes/41_Literature/<citekey>.md` via a `> [!howl-summary]` callout
- **Idea pipeline** — captured ideas land in `08_Pipeline/ideas/<date>-<slug>/`; `/open <slug>` promotes the next free `6N_` project slot
- **Morning ritual → Google Tasks + Calendar** — three needle-movers captured become real tasks and optional time-blocks you get notified about from the native apps
- **PIN + idle auto-lock + kill phrase + exfiltration guard** — the bot reads your inbox, so it earns this
- **Dashboard** on `http://127.0.0.1:3141` with 7 tabs: Overview, Scheduler, Missions, Memories, Subagents, Routing, Audit, Live
- **Multi-bot fanout** — any `TELEGRAM_BOT_TOKEN_<AGENT>` env var spawns a matching specialist bot

## Paid dependencies

None required. Howl PA assumes a Claude subscription and a ChatGPT subscription with `codex login` already done. Everything else (Ollama, SQLite, Baileys-free email/calendar/tasks, Obsidian) is local or free.

## License

MIT — see [LICENSE](./LICENSE).
