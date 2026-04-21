---
description: Run a scheduled Howl PA mission immediately.
disable-model-invocation: false
---

Read the schedule name from `$ARGUMENTS`. If it is missing or blank, show `Usage: /howl-run <schedule-name>` and do not call a tool. Otherwise call the `howl_run_now` MCP tool from the `howl-pa` server with `{ "name": "<schedule-name>" }`. Present `mission_task_id` and `queued_at`, plus any returned status or message.
