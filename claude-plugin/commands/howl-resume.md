---
description: Resume a paused Howl PA scheduled mission.
disable-model-invocation: false
---

Read the schedule name from `$ARGUMENTS`. If it is missing or blank, show `Usage: /howl-resume <schedule-name>` and do not call a tool. Otherwise call the `howl_resume` MCP tool from the `howl-pa` server with `{ "name": "<schedule-name>" }`. Present the result compactly.
