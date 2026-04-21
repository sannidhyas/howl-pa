---
description: Queue an ad-hoc Howl PA mission.
disable-model-invocation: false
---

Read the mission name from `$ARGUMENTS`, with optional `title="<title>"` and `args='<json>'` fields. If the mission is missing, show `Usage: /howl-adhoc <mission> [title="<title>"] [args='<json>']` and do not call a tool. Call the `howl_mission_adhoc` MCP tool from the `howl-pa` server with the parsed fields. Present the queued task id, title, mission, and status if returned.
