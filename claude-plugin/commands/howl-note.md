---
description: Capture a Howl PA note.
disable-model-invocation: false
---

If `$ARGUMENTS` is missing or blank, show `Usage: /howl-note <text>` and do not call a tool. Otherwise call the `howl_capture` MCP tool from the `howl-pa` server with `{ "text": "$ARGUMENTS", "kind": "note" }`. Present `id`, `kind`, `title`, and `created_at` when returned; otherwise present `kind`, `summary`, and `ref.vault_path` if returned.
