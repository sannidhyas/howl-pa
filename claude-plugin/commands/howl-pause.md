---
description: Pause a scheduled Howl PA mission.
disable-model-invocation: false
---

Read the schedule name from `$ARGUMENTS`. If it is missing or blank, show `Usage: /howl-pause <schedule-name>` and do not call a tool. Otherwise call the `howl_pause` MCP tool from the `howl-pa` server with `{ "name": "<schedule-name>" }`. Present the result compactly.
