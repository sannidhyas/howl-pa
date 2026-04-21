---
description: Capture text into Howl PA.
disable-model-invocation: false
---

If `$ARGUMENTS` is missing or blank, show `Usage: /howl-capture [kind=<kind>] [title="<title>"] <text>` and do not call a tool. If `kind=` or `title=` prefixes are present, parse them into optional fields and treat the remaining content as `text`; otherwise pass all `$ARGUMENTS` as `text`. Call the `howl_capture` MCP tool from the `howl-pa` server. Present the captured item id, kind, title, and created time if returned.
