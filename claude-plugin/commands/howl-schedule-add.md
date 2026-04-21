---
description: Add a Howl PA scheduled mission.
disable-model-invocation: false
---

Parse `$ARGUMENTS` as `name mission '* * * * *'`, where the schedule is a quoted cron string. If any required part is missing, show `Usage: /howl-schedule-add <name> <mission> '<cron>' [priority=<number>] [args='<json>']` and do not call a tool. Call the `howl_schedule_add` MCP tool from the `howl-pa` server with `name`, `mission`, and `schedule`; if `priority=` or `args=` are present, parse and pass them too. Present the created schedule as Name · Mission · Schedule · Priority · Status.
