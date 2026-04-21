---
description: Cancel a Howl PA mission task.
disable-model-invocation: false
---

Read the mission task id from `$ARGUMENTS` as a number. If it is missing or not numeric, show `Usage: /howl-cancel <mission-task-id>` and do not call a tool. Call the `howl_mission_cancel` MCP tool from the `howl-pa` server with `{ "id": <number> }`. Present the cancel result compactly.
