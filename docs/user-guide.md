# Howl PA user guide v0.0.18

## What Howl PA is

Howl PA v0.0.18 is a personal assistant with three control surfaces: a Telegram bot for capture and commands, a local dashboard at `http://localhost:3141`, and a Claude Code `/howl` command that talks to the same dashboard API. It stores state in SQLite, writes durable notes and tasks into an Obsidian vault, syncs Gmail, Google Calendar, and Google Tasks, and dispatches work to Claude, Codex, and Ollama-backed subagents.

## Install + setup

| Path | Use when |
|---|---|
| One-shot installer | Fresh machine, npm not yet installed |
| Manual npm path | You want explicit install steps or version pinning |
| Source path | Contributing to Howl PA v0.0.18 |

```sh
curl -fsSL https://raw.githubusercontent.com/sannidhyas/howl-pa/main/install.sh | bash
```

Manual npm path:

```sh
npm i -g howl-pa@latest
howl-pa setup
howl-pa setup:google
howl-pa start
```

The setup wizard prompts for:

| Prompt | Env key or effect |
|---|---|
| Telegram bot token (from @BotFather) | `TELEGRAM_BOT_TOKEN` |
| Telegram chat ID (from @userinfobot) | `ALLOWED_CHAT_ID` |
| Claude Code OAuth token (`claude setup-token`) | `CLAUDE_CODE_OAUTH_TOKEN` |
| PIN, 4–12 digits | `PIN_HASH`, `PIN_SALT` |
| Kill phrase | `KILL_PHRASE` |
| Idle lock minutes | `IDLE_LOCK_MINUTES`, default `30` |
| Obsidian vault path | `VAULT_PATH`, default `~/Documents/vault` |
| Thesis / paper drive path | `THESIS_PATH` (optional) |
| Dashboard password | Optional — enables password sign-in |

Re-run `howl-pa setup` anytime to update any value. Set or rotate only the dashboard password:

```sh
howl-pa set-password
```

Google OAuth uses a local loopback callback. Run it after the main setup:

```sh
howl-pa setup:google
```

| Google setup detail | Value |
|---|---|
| Loopback redirect | `http://127.0.0.1:4141/cb` |
| Token file | `<config>/google-token.json` |
| Scopes | Gmail (readonly + modify), Calendar (readonly + events), Tasks |

Re-consent after scope changes:

```sh
howl-pa setup:google --force
```

## Running

Foreground:

```sh
howl-pa start
```

Kill with `Ctrl+C`. The wolf banner and scheduler/dashboard startup lines confirm all three surfaces are up.

Background daemon via systemd `--user`:

```sh
howl-pa daemon install    # writes ~/.config/systemd/user/howl-pa.service
howl-pa daemon status
howl-pa daemon logs -f
howl-pa daemon uninstall
```

Dashboard is at `http://127.0.0.1:3141/`. It opens to a sign-in form.

| Auth mode | How |
|---|---|
| Token URL | Open `/?token=<DASHBOARD_TOKEN>` |
| Token form | Paste the token into the field on the sign-in page |
| Password | Run `howl-pa set-password` first; then enter username + password |
| API header | `x-dashboard-token: <DASHBOARD_TOKEN>` on every request |

`DASHBOARD_TOKEN` is in `<config>/.env`. Get it with:

```sh
grep '^DASHBOARD_TOKEN=' ~/.config/howl-pa/.env
```

For domain tunneling, set a dashboard password first (`howl-pa set-password`) and set `DASHBOARD_HOST=0.0.0.0` in `<config>/.env`.

**Cloudflare Tunnel:**

```sh
cloudflared tunnel --url http://127.0.0.1:3141
```

**Tailscale Funnel:**

```sh
tailscale serve --bg --https=443 http://127.0.0.1:3141
tailscale funnel 443 on
```

**Caddy reverse proxy:**

```caddyfile
howl.example.com {
  reverse_proxy 127.0.0.1:3141
}
```

## Dashboard tour

**Pulse** shows daemon PID, uptime, active and paused routine counts, mission queue pressure, recent errors, and latest token usage. It is the fastest check that Howl PA is alive and healthy.

**Routines** lists every scheduled task — built-in and custom — with cron expression, next run, last result, and status pill. Actions: run-now, pause, resume, edit (opens a modal with name, mission, schedule, priority, args), delete, and a "+ New routine" button.

**Missions** is a three-column kanban (queued / running / recent). Each card shows mission name, source, agent, and duration. Clicking a card opens the full transcript drawer; buttons expose retry and cancel.

**Feed** streams live server-sent events from the daemon. A filter bar narrows by event type (session, agent, chat, error). The test button fires a synthetic event to confirm the SSE connection is live.

**Inbox** combines Google Tasks and Gmail in one view. Tasks show status, title, due date, and importance. Gmail rows show sender, subject, importance score, and unread state.

**Calendar** shows upcoming Google Calendar events with start/end times, summaries, locations, and meeting links.

**Memory** lists indexed vault and conversation chunks with source path, chunk index, modified time, and a text preview. Use `/reindex` or the vault-reindex routine to refresh stale entries.

**Capture** is the in-dashboard capture form. Pick a kind (Auto, note, idea, task, literature, thesis\_fragment, journal, ephemeral) or leave it on Auto to let the classifier decide. Add an optional title and submit.

**Subagents** shows every dispatch with role, backend, judge, prompt preview, duration, and outcome. Per-role aggregates (runs / ok% / avg ms) scroll below the dispatch list.

**Usage** reports Claude Code token stats and Codex availability state. Totals feed the token counter in the Pulse tab.

**Audit** logs every admin, security, scheduler, mission, capture, and exfiltration event. Rows with a transcript reference are clickable and open the full transcript drawer.

Keyboard shortcuts:

| Key sequence | Action |
|---|---|
| `/` | Focus search |
| `?` | Open help overlay |
| `g` `p` | Jump to pulse |
| `g` `r` | Jump to routines |
| `g` `m` | Jump to missions |
| `g` `f` | Jump to feed |
| `g` `i` | Jump to inbox |
| `g` `c` | Jump to calendar |
| `g` `a` | Jump to audit |

## Telegram commands

### Welcome / help

| Command | Effect |
|---|---|
| `/start` | First-run guidance and setup actions |
| `/help` | Command summary |
| `/health` | Uptime, routine counts, mission counts, Google auth state, Ollama state, last error |
| `/chatid` | Echoes the current Telegram chat ID |
| `/status` | Locked state, security state, latest session ID |

### Routines

| Command | Effect |
|---|---|
| `/routines` | Lists built-in routines grouped by daily, polling, weekly, vault |
| `/brief` | Runs `morning-brief` immediately |
| `/nudge` | Runs the evening nudge check immediately |
| `/schedule list` | Lists all scheduled tasks |
| `/schedule pause <name>` | Pauses a routine |
| `/schedule resume <name>` | Resumes a paused routine |
| `/schedule delete <name>` | Deletes a routine (built-ins re-register on restart) |
| `/schedule add <name> "<cron>" <mission> [json-args]` | Creates a custom routine |
| `/schedule edit <name> <field> <value>` | Edits `schedule`, `priority`, `args`, or `status` |

### Missions

| Command | Effect |
|---|---|
| `/mission list` | Recent mission queue items |
| `/mission run <name>` | Runs a named mission once |
| `/mission cancel <id>` | Cancels a queued mission |
| `/mission retry <id>` | Retries a failed or completed mission as a new entry |

### Capture

| Command | Forces kind | Vault destination |
|---|---|---|
| `/capture <text>` | auto | classifier picks |
| `/note <text>` | `note` | `04_Notes/inbox/<stamp>-<slug>.md` |
| `/idea <text>` | `idea` | `08_Pipeline/ideas/<date>-<slug>/index.md` + `seed.md` |
| `/task <text>` | `task` | `02_Plans/inbox.md` checkbox append |
| `/task-add <text>` | `task` | same as `/task`, immediately syncs to Google Tasks |
| `/task-list` | — | lists tracked Google Tasks |
| `/task-done <short-id>` | — | marks task complete locally and in Google Tasks |
| `/thesis <text>` | `thesis_fragment` | `06_Projects/thesis/fragments/<stamp>-<slug>.md` |
| `/literature <text>` | `literature` | `04_Notes/41_Literature/<slug>.md` |
| `/journal <text>` | `journal` | today's daily note under `## Notes (quick capture)` |

Plain text (no command prefix) auto-classifies. `ephemeral` captures get a reply but are never written to the vault.

Idea pipeline extras:

| Command | Effect |
|---|---|
| `/ideas` | Lists parked ideas |
| `/open <slug>` | Promotes idea to `06_Projects/6N_Name/` |
| `/discard <slug>` | Archives the idea folder |

### Memory (NEW)

> TODO(sibling-agent): `/memory` command not present in Howl PA v0.0.18. See section 10 for the planned feature.

### Recall / vault

| Command | Effect |
|---|---|
| `/recall <query>` | Blended FTS + vector + recency search over vault and conversation |
| `/reindex` | Re-embeds modified vault files |
| `/mirror-thesis` | Mirrors paper drive notes into `04_Notes/41_Literature/` |
| `/mirror-thesis --force` | Re-runs even for previously mirrored items |

### Agent dispatch

| Command | Effect |
|---|---|
| `/ask <prompt>` | Default backend (Codex for most tasks, Claude for UI/design) |
| `/ask claude <prompt>` | Force Claude |
| `/ask codex <prompt>` | Force Codex |
| `/ask ollama:<model> <prompt>` | Force a specific Ollama model |
| `/council <prompt>` | Parallel dispatch to Claude + Codex + Ollama |
| `/council merge <prompt>` | Council with merge aggregation |
| `/council best-of-n <prompt>` | Council with best-of-n aggregation |
| `/council vote <prompt>` | Council with vote aggregation |
| `/backends` | Lists available backends |

### Admin

| Command | Effect |
|---|---|
| `/lock` | Locks immediately; requires PIN to unlock |
| `/newchat` | Next message starts a fresh conversation session |
| `/chatid` | Echoes chat ID (useful for first-run config) |
| Kill phrase | Any message matching `KILL_PHRASE` shuts the process down cleanly |

While locked, only `/start`, `/chatid`, and `/status` work.

## Claude Code /howl plugin

The slash command lives at `~/.claude/commands/howl.md` and ships with Howl PA. It resolves `DASHBOARD_TOKEN`, `DASHBOARD_PORT`, and `DASHBOARD_HOST` from `<config>/.env` at invocation time, so it works on any machine where `howl-pa start` has been run.

```text
/howl <subcommand> [arguments]
```

| Subcommand | Effect |
|---|---|
| `status` (or empty) | Dashboard health + routine/mission summary |
| `routines` | All scheduled routines as a table |
| `run <name>` | POSTs to `/api/scheduler/<name>/run-now` |
| `pause <name>` | Pauses a routine |
| `resume <name>` | Resumes a routine |
| `delete <name>` | Deletes a routine |
| `missions` | Recent mission queue (20 rows) |
| `retry <id>` | Retries a mission |
| `cancel <id>` | Cancels a mission |
| `capture "<text>"` | Routes text through `/api/capture` |
| `health` | Dashboard health + Google token presence |
| `catalog` | Mission catalog (id + description) |
| `kinds` | Capture kinds (emoji, id, label, description) |
| `tail` | Last 10 audit rows |

The command never echoes the full token into the transcript.

### MCP plugin (separate)

The `claude-plugin/` directory ships a separate MCP server that exposes Howl PA data as both slash commands and callable MCP tools.

Install:

```sh
claude plugin marketplace add sannidhyas/howl-pa
claude plugin install howl-pa@howl-pa
```

Export the token before launching Claude Code:

```sh
export HOWL_DASHBOARD_URL=http://127.0.0.1:3141
export HOWL_DASHBOARD_TOKEN="$(grep '^DASHBOARD_TOKEN=' ~/.config/howl-pa/.env | cut -d= -f2-)"
```

| Slash command | Effect |
|---|---|
| `/howl-status` | Uptime, conversation rows, memory chunks, audit rows |
| `/howl-schedule` | Scheduled missions with next run and last result |
| `/howl-recall [limit]` | Recent memory chunks |
| `/howl-routing [hours]` | Subagent routing stats by role |
| `/howl-gmail` | Last 50 ingested Gmail rows with importance scores |
| `/howl-calendar [hours]` | Upcoming calendar events |
| `/howl-tasks` | Google Tasks state |

Verify with `claude mcp list` — you should see `howl-pa: node …/server.mjs`.

## Built-in routines

All 12 are defined in `src/scheduler.ts:BUILT_INS`. Cron schedules run in the daemon's local timezone. Paused state survives restarts; deleted built-ins re-register on next start.

| Name | Cron | Human schedule | Description |
|---|---|---|---|
| `morning-brief` | `0 7 * * *` | Daily at 07:00 | Composes the daily brief from vault + calendar + tasks and sends it to Telegram |
| `morning-ritual` | `5 7 * * *` | Daily at 07:05 | Asks focus, thesis artifact, venture artifact, and 3 needle tasks for the day |
| `evening-nudge` | `0 21 * * *` | Daily at 21:00 | Checks today's gym, thesis, kit, and meditation flags; sends a nudge for each open item |
| `evening-tracker` | `5 21 * * *` | Daily at 21:05 | Logs sleep hours, energy, soreness, sport, and reflection via a short survey |
| `vault-reindex` | `*/10 * * * *` | Every 10 min | Crawls the Obsidian vault and refreshes the memory chunk index in SQLite |
| `weekly-review` | `0 18 * * 0` | Sunday at 18:00 | Writes the ISO-week review scaffold note to vault (days, captures, ideas touched) |
| `venture-review` | `30 18 * * 0` | Sunday at 18:30 | Walks through parked ideas from the week with a keep/open/discard survey |
| `gmail-poll` | `*/5 * * * *` | Every 5 min | Fetches new messages from Gmail and stores them in the DB |
| `gmail-classify` | `*/7 * * * *` | Every 7 min | Scores unclassified Gmail items for importance via Ollama/Claude |
| `calendar-poll` | `*/15 * * * *` | Every 15 min | Syncs upcoming Google Calendar events into the local DB |
| `tasks-poll` | `*/5 * * * *` | Every 5 min | Pulls Google Tasks from the API and upserts them into the local DB |
| `tasks-push` | `*/5 * * * *` | Every 5 min | Pushes locally-captured tasks back to Google Tasks via the API |

## Adding your own routine

**Method 1: dashboard** — Routines tab → "+ New routine" → fill in name, mission, cron, priority, and optional JSON args → save → run-now to test.

**Method 2: Telegram**

```text
/schedule add friday-review "0 17 * * 5" weekly-review {"source":"telegram"}
```

Cron format is 5 fields: `minute hour day-of-month month day-of-week`. Examples: `0 9 * * 1-5` (weekdays at 09:00), `*/30 * * * *` (every 30 minutes).

**Method 3: API**

```sh
BASE=http://127.0.0.1:3141
TOKEN="$(grep '^DASHBOARD_TOKEN=' ~/.config/howl-pa/.env | cut -d= -f2-)"

curl -fsS -X POST "$BASE/api/scheduler?token=$TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "name": "friday-review",
    "mission": "weekly-review",
    "schedule": "0 17 * * 5",
    "priority": 5,
    "args": {"source": "api"}
  }'
```

Verify mission names against the catalog first:

```sh
curl -fsS "$BASE/api/missions/catalog?token=$TOKEN"
```

Or from Claude Code: `/howl catalog`.

## Capture pipeline

The router in `src/capture-router.ts` sends text to Claude, which returns a classification:

```json
{
  "type": "note",
  "slug": "three-to-six-words",
  "title": "Short Title",
  "confidence": 0.86,
  "rationale": "reason for this classification"
}
```

Classifier output is validated; if Claude returns an invalid type or malformed JSON the capture fails with an error reply.

| Kind | How triggered | Vault destination |
|---|---|---|
| `note` | Auto or `/note` | `04_Notes/inbox/<YYYY-MM-DD-HHMM>-<slug>.md` |
| `task` | Auto, `/task`, or `/task-add` | Appends checkbox to `02_Plans/inbox.md`; upserts local Google Task |
| `literature` | Auto or `/literature` | `04_Notes/41_Literature/<slug>.md` |
| `thesis_fragment` | Auto or `/thesis` | `06_Projects/thesis/fragments/<YYYY-MM-DD-HHMM>-<slug>.md` |
| `journal` | Auto or `/journal` | Today's daily note (`03_Daily/<YYYY-MM-DD>.md`) under `## Notes (quick capture)` |
| `idea` | Auto or `/idea` | `08_Pipeline/ideas/<YYYY-MM-DD>-<slug>/index.md` and `seed.md` |
| `ephemeral` | Auto — text not worth storing | No vault write; short reply only |

Every vault write produces a `[mc] <op>: <path>` commit. The bot stages only its own files.

The dashboard Capture tab provides the same pipeline: pick Auto or a specific kind, enter text and an optional title, submit.

## System memories

> TODO(sibling-agent): System memories (`/memory` Telegram command and the six-scope memory store) are planned but not present in Howl PA v0.0.18. The dashboard Memory tab currently shows indexed chunks only. This section documents the feature as designed; implementation is tracked in a sibling commit.

Six scopes:

| Scope | Purpose |
|---|---|
| `global` | Always attached to agent prompts; stable preferences and identity context |
| `email_hint` | Informs the Gmail classifier: sender rules, topic priorities, importance hints |
| `task_hint` | Informs task and deadline reasoning: naming conventions, due-date rules |
| `agent_hint` | Extra system-prompt material injected into subagent dispatches |
| `capture_hint` | Overrides kind classification: routing rules, exclusions |
| `journal_hint` | Influences journal wording: tone, format, reflection style |

Dashboard workflow (planned):

1. Open Memory tab.
2. Switch to the "System memories" sub-view.
3. Click "Add memory".
4. Select a scope.
5. Write one imperative rule.
6. Save — the entry is logged in the audit trail.

Telegram workflow (planned):

```text
/memory add global Use Asia/Kolkata dates unless a source says otherwise.
/memory add email_hint Flag emails from thesis advisors as high priority.
/memory show
/memory show capture_hint
/memory del <id>
```

Good examples:

| Scope | Example |
|---|---|
| `global` | `Use Asia/Kolkata dates unless a source says otherwise.` |
| `email_hint` | `Flag emails from thesis advisors even if they look conversational.` |
| `task_hint` | `When a task mentions tomorrow, create a Google Task due tomorrow at end of day.` |
| `agent_hint` | `Route frontend visual polish to Claude; route backend implementation to Codex.` |
| `capture_hint` | `Classify startup concepts as idea only when they include a customer or market.` |
| `journal_hint` | `Keep journal captures factual; do not rewrite them into advice.` |

Avoid vague, temporary, or over-broad entries (`Be better`, `Remember everything`).

## Security

| Control | How it works |
|---|---|
| Allowlist | Only `ALLOWED_CHAT_ID` is accepted; all other chat IDs are dropped silently |
| PIN lock | Bot starts locked when `PIN_HASH` is set; only the correct PIN unlocks it |
| Idle auto-lock | Relocks after `IDLE_LOCK_MINUTES` of inactivity (default 30 min) |
| Kill phrase | Any message matching `KILL_PHRASE` triggers emergency shutdown |
| Dashboard token | `DASHBOARD_TOKEN` gates all dashboard and API access |
| Dashboard password | Optional; enables username + password sign-in via `howl-pa set-password` |
| Cookie session | Human sign-in sets `hpa_session`; valid 12 hours |
| Exfiltration guard | Scans outbound agent messages for API keys, JWTs, and secret patterns; redacts before sending |
| Audit log | Every admin action (lock, unlock, blocked, capture, schedule change, mission event) is written to `audit_log` in SQLite |

Commands while locked: `/start`, `/chatid`, `/status` only.

Audit log is viewable in the dashboard Audit tab. Rows expand to full transcripts when a transcript ID is attached.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Dashboard shows 401 | Verify `DASHBOARD_TOKEN` matches the URL; if the URL was truncated, open `/` and paste the full token manually |
| Tasks API "insufficient scopes" | Run `howl-pa setup:google --force` and re-grant access |
| Ollama embedder down | Circuit breaker logs once and enters cooldown; run `ollama serve` and wait for next vault-reindex tick |
| Gmail only showed inbox | Fixed in 0.0.18 — gmail-poll now pulls all messages, not just the priority inbox |
| Garbled startup banner | Fixed in 0.0.18 — ASCII wolf renders cleanly |

Token check:

```sh
grep '^DASHBOARD_TOKEN=' ~/.config/howl-pa/.env
```

Google re-consent:

```sh
howl-pa setup:google --force
```

Ollama check:

```sh
ollama serve
ollama pull nomic-embed-text
```

## Where things live

Config directory resolution order (first match wins):

| Priority | Source |
|---:|---|
| 1 | `HOWL_CONFIG` env var |
| 2 | `CLAUDECLAW_CONFIG` env var |
| 3 | `$XDG_CONFIG_HOME/howl-pa` |
| 4 | `~/.claudeclaw` (legacy, only if already present) |
| 5 | `~/.config/howl-pa` (fallback) |

Resolved paths:

| Item | Path |
|---|---|
| Runtime env | `<config>/.env` |
| SQLite DB | `<config>/store/howl.db` |
| Google token | `<config>/google-token.json` |
| systemd unit | `~/.config/systemd/user/howl-pa.service` |
| Claude Code `/howl` command | `~/.claude/commands/howl.md` |
| Global CLAUDE.md directive | `~/.claude/CLAUDE.md` |
| Claude Code MCP plugin | `claude-plugin/` (in project root) |
| Vault root | `VAULT_PATH`, default `~/Documents/vault` |
| Note captures | `<vault>/04_Notes/inbox/<YYYY-MM-DD-HHMM>-<slug>.md` |
| Task inbox | `<vault>/02_Plans/inbox.md` |
| Literature | `<vault>/04_Notes/41_Literature/<slug>.md` |
| Thesis fragments | `<vault>/06_Projects/thesis/fragments/<YYYY-MM-DD-HHMM>-<slug>.md` |
| Daily notes | `<vault>/03_Daily/<YYYY-MM-DD>.md` |
| Parked ideas | `<vault>/08_Pipeline/ideas/<YYYY-MM-DD>-<slug>/` |
