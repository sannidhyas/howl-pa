# howl-pa — Claude Code companion

This plugin exposes a running Howl PA bot's state to any Claude Code session through an MCP server and a handful of slash commands. It does not run the bot itself — install the `howl-pa` npm package for that.

## What you get

Slash commands:

- `/howl-status` — uptime, conversation rows, memory chunks, audit rows
- `/howl-schedule` — all scheduled missions with next run + last result
- `/howl-recall [limit]` — recent memory chunks (vault + conversation)
- `/howl-routing [hours]` — subagent routing stats by role (codex-corps taxonomy)

MCP tools (callable directly by any CC session or agent):

- `howl_status`, `howl_schedule_list`, `howl_recall`, `howl_subagents`, `howl_routing_stats`, `howl_audit`

## Requirements

The bot's dashboard must be running and reachable:

```
HOWL_DASHBOARD_URL=http://127.0.0.1:3141   # default
HOWL_DASHBOARD_TOKEN=<your DASHBOARD_TOKEN from howl-pa .env>
```

Export `HOWL_DASHBOARD_TOKEN` before launching Claude Code so the MCP server can reach the bot.

## Install

```
claude plugin marketplace add sannidhyas/howl-pa
claude plugin install howl-pa@howl-pa
```

Restart Claude Code. Verify with `claude mcp list` — you should see `howl-pa: node …/server.mjs`.
