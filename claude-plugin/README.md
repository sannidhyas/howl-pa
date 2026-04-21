# howl-pa — Claude Code companion

This plugin exposes a running Howl PA bot's state to any Claude Code session through an MCP server and a handful of slash commands. It does not run the bot itself — install the `howl-pa` npm package for that.

## What you get

Slash commands:

- `/howl-status` — uptime, conversation rows, memory chunks, audit rows
- `/howl-schedule` — all scheduled missions with next run + last result
- `/howl-recall [limit]` — recent memory chunks (vault + conversation)
- `/howl-routing [hours]` — subagent routing stats by role (codex-corps taxonomy)
- `/howl-gmail` — last 50 ingested Gmail messages with importance scores
- `/howl-calendar [hours]` — upcoming Calendar events
- `/howl-tasks` — Google Tasks (local queue + synced)
- `/howl-run <name>` — run a scheduled mission immediately
- `/howl-pause <name>` — pause a scheduled mission
- `/howl-resume <name>` — resume a paused scheduled mission
- `/howl-delete <name>` — delete a scheduled mission
- `/howl-schedule-add <name> <mission> '<cron>'` — add a scheduled mission
- `/howl-schedule-edit <name> [fields...]` — edit a scheduled mission
- `/howl-adhoc <mission> [fields...]` — queue an ad-hoc mission
- `/howl-retry <mission-task-id>` — retry a mission task
- `/howl-cancel <mission-task-id>` — cancel a mission task
- `/howl-capture [kind=<kind>] [title="<title>"] <text>` — capture text
- `/howl-memory [list|set|delete] ...` — list, set, or delete memory keys
- `/howl-whoami` — show dashboard identity and URL

MCP tools (callable directly by any CC session or agent):

| Name | Type | Description |
| --- | --- | --- |
| `howl_status` | read | Show Howl PA runtime status — uptime, conversation rows, memory chunks, audit rows. |
| `howl_schedule_list` | read | List all scheduled missions with next run, last result, and status. |
| `howl_recall` | read | Recent memory chunks indexed from the vault + conversation log. |
| `howl_subagents` | read | Recent subagent dispatches with role, backend, outcome. |
| `howl_routing_stats` | read | Subagent routing by role over a rolling window. |
| `howl_audit` | read | Recent audit-log entries. |
| `howl_gmail` | read | Last 50 ingested Gmail messages with importance scores. |
| `howl_calendar` | read | Upcoming Calendar events from -6h through +N hours. |
| `howl_tasks` | read | Google Tasks — local queue plus synced rows. |
| `howl_run_now` | write | Run a scheduled mission immediately by schedule name. |
| `howl_pause` | write | Pause a scheduled mission. |
| `howl_resume` | write | Resume a paused scheduled mission. |
| `howl_delete` | write | Delete a scheduled mission. |
| `howl_schedule_add` | write | Add a scheduled mission. |
| `howl_schedule_edit` | write | Edit schedule, priority, args, or status for a scheduled mission. |
| `howl_mission_adhoc` | write | Queue an ad-hoc mission task. |
| `howl_mission_retry` | write | Retry a mission task by id. |
| `howl_mission_cancel` | write | Cancel a mission task by id. |
| `howl_capture` | write | Capture text into Howl PA. |
| `howl_memory_list` | read | List dashboard memory rows, optionally filtered by scope. |
| `howl_memory_set` | write | Set a dashboard memory key. |
| `howl_memory_delete` | write | Delete a dashboard memory key. |
| `howl_health` | read | Raw Howl PA health response. |
| `howl_missions_catalog` | read | List available mission definitions. |
| `howl_capture_kinds` | read | List supported capture kinds. |
| `howl_events_test` | write | Send a dashboard test event. |
| `howl_whoami` | read | Show the dashboard username and dashboard URL used by this MCP server. |
| `howl_transcript` | read | Fetch a mission task or conversation transcript. |

## Requirements

The bot's dashboard must be running and reachable.

## Auth

The MCP server reads two env vars:

```
HOWL_DASHBOARD_URL=http://127.0.0.1:3141   # default
HOWL_DASHBOARD_TOKEN=<your DASHBOARD_TOKEN from howl-pa .env>
```

The token is sent as both `?token=...` query param and `x-dashboard-token` header on every request. Export `HOWL_DASHBOARD_TOKEN` before launching Claude Code so the MCP server can reach the bot.

## Install

```
claude plugin marketplace add sannidhyas/howl-pa
claude plugin install howl-pa@howl-pa
```

Restart Claude Code. Verify with `claude mcp list` — you should see `howl-pa: node …/server.mjs`.
