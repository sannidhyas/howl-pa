# Install

Two install paths. They compose — most users want both.

1. **npm** — installs the bot runtime + CLI. Runs the Telegram bot, scheduler, dashboard.
2. **Claude Code plugin** — adds `/howl-*` slash commands and MCP tools inside any Claude Code session so you can see bot state without opening Telegram.

## Requirements

| | Why |
|---|---|
| Node ≥ 22 | `node:sqlite` is built-in starting Node 22 |
| A Telegram bot token | Create via [@BotFather](https://t.me/BotFather) — one for your primary bot, optional extras for specialist agents |
| A Google Cloud OAuth client (Desktop) | For Gmail, Calendar, Tasks. Free tier is fine. |
| Claude Code installed | For the plugin path, and for using howl-pa's subagent dispatch manually |
| `codex` CLI installed + `codex login` done | Required for Codex-backed subagents |
| Ollama (optional) | Only needed for the vector memory layer + council mode. `nomic-embed-text` and `qwen2.5-coder:3b` are the recommended minimums. |

## Install — npm path

```sh
npm i -g howl-pa
howl-pa setup
```

The setup wizard prompts for:

- `TELEGRAM_BOT_TOKEN` — from @BotFather
- `ALLOWED_CHAT_ID` — your Telegram user ID (DM `@userinfobot` if you don't know it)
- `CLAUDE_CODE_OAUTH_TOKEN` — run `claude setup-token` inside a Claude Code session and paste the result
- PIN (4–12 digits) — used to unlock the bot from Telegram
- Kill phrase — a sentence that immediately shuts the bot down when typed

Then wire up Google:

```sh
howl-pa setup:google
```

This opens a browser window, walks through consent for Gmail readonly + Calendar + Tasks, and writes the token to `$XDG_CONFIG_HOME/howl-pa/google-token.json` (or `~/.claudeclaw/google-token.json` on legacy machines).

Finally, launch:

```sh
howl-pa start
```

DM your bot on Telegram. You should see a PIN prompt. Unlock with your PIN; try `/status`.

### Where config lives

Resolution order for the runtime dir:

1. `HOWL_CONFIG` or `CLAUDECLAW_CONFIG` if exported
2. `$XDG_CONFIG_HOME/howl-pa` (preferred on Linux)
3. `~/.claudeclaw` if it exists (backwards-compat)
4. `~/.config/howl-pa` (fallback)

The bot's SQLite DB lives at `store/howl.db` relative to wherever you installed the package or cloned the repo — the dashboard + classifier + memory all read it from there.

### Vault path

Default is `~/Documents/projecthowl`. Override with `VAULT_PATH=/some/other/path howl-pa start`. The bot will refuse to write to a vault that doesn't already contain the expected folder structure (see [vault-conventions.md](./vault-conventions.md)).

## Install — Claude Code plugin path

The plugin is shipped from the same repo via a marketplace manifest.

```sh
claude plugin marketplace add sannidhyas/howl-pa
claude plugin install howl-pa@howl-pa
```

Restart Claude Code. Verify the MCP server is live:

```sh
claude mcp list
# expect: howl-pa: node …/claude-plugin/mcp/server.mjs — ✓ Connected
```

Before launching Claude Code, export the dashboard token so the MCP server can reach the running bot:

```sh
export HOWL_DASHBOARD_URL=http://127.0.0.1:3141        # default
export HOWL_DASHBOARD_TOKEN="$(grep DASHBOARD_TOKEN $XDG_CONFIG_HOME/howl-pa/.env | cut -d= -f2)"
```

Then try `/howl-status` in any CC session.

## Install from source (contributors)

```sh
git clone https://github.com/sannidhyas/howl-pa.git
cd howl-pa
npm install
npm run typecheck
npm run build
npm run setup
npm run setup:google
npm run dev        # tsx watch — live reload on src/ changes
```

## Upgrading

```sh
npm i -g howl-pa@latest
```

Database migrations run automatically on first start after upgrade — each `ALTER TABLE` is wrapped in an existence check.

## Uninstall

```sh
npm uninstall -g howl-pa
rm -rf $XDG_CONFIG_HOME/howl-pa         # or ~/.claudeclaw
```

The bot never writes inside the vault when it isn't running, so once the process is stopped, no further changes happen.
