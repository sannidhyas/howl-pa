---
description: List, set, or delete Howl PA memory keys.
disable-model-invocation: false
---

Use `$ARGUMENTS` to choose a memory operation. With no arguments, or with `list [scope]`, call `howl_memory_list` from the `howl-pa` server and pass `scope` only when provided. With `set <scope> <key> <value>`, call `howl_memory_set`; parse `<value>` as JSON when possible, otherwise pass it as a string. With `delete <scope> <key>`, call `howl_memory_delete`. If the arguments do not match one of these forms, show:
`Usage: /howl-memory [list [scope]]`
`Usage: /howl-memory set <scope> <key> <value>`
`Usage: /howl-memory delete <scope> <key>`
Present list results as Scope · Key · Value · Updated, and mutation results compactly.
