---
description: Retry a Howl PA mission task.
disable-model-invocation: false
---

Read the mission task id from `$ARGUMENTS` as a number. If it is missing or not numeric, show `Usage: /howl-retry <mission-task-id>` and do not call a tool. Call the `howl_mission_retry` MCP tool from the `howl-pa` server with `{ "id": <number> }`. Present the retry result compactly.
