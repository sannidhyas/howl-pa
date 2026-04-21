---
description: Mute Telegram notifications for a Howl PA scheduled mission (routine still runs, just silent).
disable-model-invocation: false
---

Read the schedule name from `$ARGUMENTS`. If it is missing or blank, show `Usage: /howl-mute <schedule-name>` and do not call a tool. Otherwise call the `howl_mute` MCP tool from the `howl-pa` server with `{ "name": "<schedule-name>" }`. Present the result compactly.
