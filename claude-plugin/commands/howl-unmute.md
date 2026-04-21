---
description: Re-enable Telegram notifications for a previously muted Howl PA scheduled mission.
disable-model-invocation: false
---

Read the schedule name from `$ARGUMENTS`. If it is missing or blank, show `Usage: /howl-unmute <schedule-name>` and do not call a tool. Otherwise call the `howl_unmute` MCP tool from the `howl-pa` server with `{ "name": "<schedule-name>" }`. Present the result compactly.
