---
description: Edit a Howl PA scheduled mission.
disable-model-invocation: false
---

Parse `$ARGUMENTS` as a schedule name followed by optional `schedule='<cron>'`, `priority=<number>`, `status=<status>`, and `args='<json>'` fields. If the name is missing or no fields are provided, show `Usage: /howl-schedule-edit <name> [schedule='<cron>'] [priority=<number>] [status=<status>] [args='<json>']` and do not call a tool. Call the `howl_schedule_edit` MCP tool from the `howl-pa` server with only the fields actually provided. Present the updated schedule compactly.
