---
description: Show expanded Howl PA health.
disable-model-invocation: false
---

Call the `howl_health` MCP tool from the `howl-pa` server and present the result as a compact expanded summary: `ok`, `pid`, uptime from `uptime_s` if present, conversation rows, memory chunks, audit rows, scheduler counts `active` and `paused` if present, and any fields whose key contains `error`, `errors`, or `last_error`; if scheduler counts are absent, say the current health payload does not include them. If the tool errors with "HOWL_DASHBOARD_TOKEN is not set" or connection refused, tell the user to ensure Howl PA is running and that `HOWL_DASHBOARD_TOKEN` env var is exported in this shell.
