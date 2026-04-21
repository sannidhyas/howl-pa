---
description: Show Howl PA runtime status — uptime, memory chunks, audit rows, OAuth readiness.
disable-model-invocation: false
---

Call the `howl_status` MCP tool from the `howl-pa` server and present the result as a short bulleted summary. If the tool errors with "HOWL_DASHBOARD_TOKEN is not set" or connection refused, tell the user to ensure Howl PA is running and that `HOWL_DASHBOARD_TOKEN` env var is exported in this shell.
