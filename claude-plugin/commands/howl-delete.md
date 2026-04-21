---
description: Delete a Howl PA scheduled mission.
disable-model-invocation: false
---

Read the schedule name from `$ARGUMENTS`. If it is missing or blank, show `Usage: /howl-delete <schedule-name>` and do not call a tool. Otherwise call the `howl_delete` MCP tool from the `howl-pa` server with `{ "name": "<schedule-name>" }`. Begin the response by warning that deleting a schedule is destructive, then present the result compactly.
