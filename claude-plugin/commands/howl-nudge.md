---
description: Run the Howl PA evening nudge schedule immediately.
disable-model-invocation: false
---

Call the `howl_run_now` MCP tool from the `howl-pa` server with `{ "name": "evening-nudge" }`. Present `mission_task_id` and `queued_at`, plus `mission`, `status`, `message`, or completion result if returned; note that this triggers the schedule immediately and show any returned result. If the tool errors with "HOWL_DASHBOARD_TOKEN is not set" or connection refused, tell the user to ensure Howl PA is running and that `HOWL_DASHBOARD_TOKEN` env var is exported in this shell.
