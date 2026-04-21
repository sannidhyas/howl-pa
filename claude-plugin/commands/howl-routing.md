---
description: Show subagent routing stats by role (codex-corps taxonomy) over a rolling window.
argument-hint: '[hours]'
disable-model-invocation: false
---

Call the `howl_routing_stats` MCP tool from the `howl-pa` server. If `$ARGUMENTS` is a number, pass it as `hours` (default 168). Present as a table: Role · Runs · OK · Err · OK% · Avg ms.
