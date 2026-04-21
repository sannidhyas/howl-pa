---
description: Run the Howl PA vault reindex schedule immediately.
disable-model-invocation: false
---

Call the `howl_run_now` MCP tool from the `howl-pa` server with `{ "name": "vault-reindex" }`. Present `mission_task_id`, `queued_at`, `mission`, `status`, `message`, and any returned result compactly. If the tool errors with "HOWL_DASHBOARD_TOKEN is not set" or connection refused, tell the user to ensure Howl PA is running and that `HOWL_DASHBOARD_TOKEN` env var is exported in this shell.
