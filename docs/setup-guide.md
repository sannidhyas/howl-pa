# Setup guide — first run, from zero

Step-by-step for a stranger who has never run Howl PA before. Every credential, where to get it, what to paste where.

Total time: ~15 minutes if you already have a Telegram account and Google account.

## 0. Requirements

| | Required? | Why |
|---|---|---|
| Node ≥ 22 | yes | `node:sqlite` is built-in from Node 22 |
| Telegram account | yes | Bot front-end |
| Google account | yes | Gmail + Calendar + Tasks ingestion |
| Claude subscription | yes | Claude-backed subagents (design, council judge) |
| ChatGPT subscription with Codex CLI | yes | Codex-backed subagents (most coding work) |
| Obsidian (any version) | recommended | So you can read the vault visually; not needed at runtime |
| Ollama | optional | Vector-memory embedder + local council. Without it, vector recall falls back to FTS only. |

### Install Node and the Codex CLI

```sh
# Node — Fedora / Bluefin
sudo dnf install nodejs

# Codex CLI — via npm
npm i -g @openai/codex
codex login          # opens browser; sign in with your ChatGPT account
```

### Install Ollama (optional but recommended)

```sh
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text      # for vector memory
ollama pull qwen2.5-coder:3b      # for coder council member
ollama serve &
```

## 1. Get your Telegram bot token

1. Open Telegram, search for **@BotFather**.
2. Send `/newbot`.
3. Pick a display name (e.g. "Howl PA — <your name>").
4. Pick a username ending in `bot` (e.g. `howl_<you>_bot`).
5. BotFather replies with a token like `1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ`. **This is `TELEGRAM_BOT_TOKEN`.**

### Get your chat ID

1. Search for **@userinfobot** on Telegram, DM it `hi`.
2. It replies with your user ID (a positive integer). **This is `ALLOWED_CHAT_ID`.**

### (Optional) Create extra bots for specialist agents

Each specialist runs its own Telegram bot. Repeat the `/newbot` flow for each agent you want (e.g. `thesis`, `venture`, `research`). Save each token as `TELEGRAM_BOT_TOKEN_<AGENT_ID>` in the `.env` — the main bot will spawn them automatically on startup.

## 2. Get your Claude Code OAuth token

1. Open a Claude Code session in any repo.
2. Run `claude setup-token` inside the session.
3. Copy the token it prints. **This is `CLAUDE_CODE_OAUTH_TOKEN`.**

## 3. Create a Google OAuth client

1. Go to https://console.cloud.google.com/apis/credentials
2. Create a new project (or pick an existing one).
3. On the left, **OAuth consent screen** → pick **External** → fill in the required fields (app name, user support email, developer email). Leave scopes empty on that screen.
4. **Credentials** → **Create credentials** → **OAuth client ID** → **Application type: Desktop app** → name it.
5. Click the download icon next to the new client to get a JSON, or just copy the **Client ID** and **Client secret**.
6. Under **APIs & Services** → **Enabled APIs & services** → enable:
   - Gmail API
   - Google Calendar API
   - Google Tasks API
7. Back on OAuth consent screen, add your own Google account under **Test users** (external app stays in testing mode, which is fine for personal use).

The installer walks you through consent and persists the refresh token. You do **not** need to paste `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` into `.env` yourself — `howl-pa setup:google` will prompt for them and save them.

## 4. Run the installer

```sh
npm i -g howl-pa

# fallback for air-gapped / registry-unreachable environments:
# npm i -g https://github.com/sannidhyas/howl-pa/releases/latest/download/howl-pa.tgz
howl-pa setup
```

The wizard prompts for:

- Telegram bot token
- Chat ID
- Claude Code OAuth token
- PIN (4–12 digits; used to unlock the bot from Telegram)
- Kill phrase (a sentence that shuts the bot down instantly)
- Idle lock minutes (default 30)
- Vault path (default `~/Documents/vault`)
- Optional thesis drive path (leave blank if you don't use the thesis-mirror feature)

It generates `DASHBOARD_TOKEN` for you, writes `$XDG_CONFIG_HOME/howl-pa/.env` with mode `0600`, and runs pre-flight checks (Node version, Codex on PATH, Ollama reachable).

## 5. Wire up Google

```sh
howl-pa setup:google
```

When prompted, paste the **Client ID** and **Client secret** from step 3. A browser window opens on `http://127.0.0.1:4141/cb`; grant access to Gmail, Calendar, and Tasks. The token persists at `$XDG_CONFIG_HOME/howl-pa/google-token.json`.

## 6. Prepare your Obsidian vault

Howl PA expects a specific folder layout — see [vault-conventions.md](./vault-conventions.md) for the full structure. At minimum, the vault directory must exist and contain:

```
<VAULT_PATH>/
├── 02_Templates/
├── 03_Daily/
├── 04_Notes/inbox/
├── 04_Notes/41_Literature/
└── 08_Pipeline/ideas/
```

If you don't already have a vault, create these empty folders. The bot auto-generates daily notes and idea folders inside them.

## 7. Start the bot
```sh
howl-pa start
```

You should see:

```
howl-pa starting …
scheduler started …
dashboard listening on http://127.0.0.1:3141
```

DM your bot on Telegram. You should get a PIN prompt. Unlock, then:

- `/status` — bot health
- `/capture hello world` — test capture round-trip
- `/task-add buy coffee` — should appear in your Google Tasks app within 5 minutes

## 8. (Optional) Install the Claude Code plugin

So you can inspect bot state from any CC session without opening the dashboard:

```sh
claude plugin marketplace add sannidhyas/howl-pa
claude plugin install howl-pa@howl-pa
```

Before launching `claude`, export the dashboard token:

```sh
export HOWL_DASHBOARD_TOKEN="$(grep DASHBOARD_TOKEN ~/.config/howl-pa/.env | cut -d= -f2)"
```

Then inside any CC session: `/howl-status`, `/howl-gmail`, `/howl-calendar`, `/howl-tasks`, `/howl-routing`, `/howl-schedule`, `/howl-recall`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `npm i -g github:sannidhyas/howl-pa` fails with a compile error | Ensure Node ≥ 22 is selected (`node -v`) |
| Bot doesn't respond to DMs | Check `howl-pa health`; likely Telegram bot token wrong or chat ID mismatched |
| "locked. send PIN." | Send your PIN (the one you set during `howl-pa setup`) |
| Google 401 | Re-run `howl-pa setup:google`; you probably need to re-consent after a scope change |
| Ollama warning in health | `ollama serve` + `ollama pull nomic-embed-text` |
| Dashboard 401 | URL needs `?token=<DASHBOARD_TOKEN>` — get it from `~/.config/howl-pa/.env` |
| `howl-pa` command not found after global install | Check `npm config get prefix` — the bin dir must be on `$PATH` |

## Security notes

- `.env` is mode `0600`, in a mode `0700` directory.
- The bot reads your Gmail. The `ALLOWED_CHAT_ID` allowlist, PIN, and idle auto-lock exist because of this. Set them, don't skip them.
- The exfiltration guard scans outbound messages for known secret patterns (API keys, JWTs, etc.) and redacts them before sending — treat it as a safety net, not a primary control.
- The dashboard binds to `127.0.0.1` only. Don't expose it publicly without a reverse proxy + additional auth.

## Upgrading

```sh
npm i -g howl-pa@latest
```

DB migrations run on next start. Your `.env` and vault are not touched.
