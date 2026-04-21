---
description: Capture a Howl PA idea.
disable-model-invocation: false
---

If `$ARGUMENTS` is missing or blank, show `Usage: /howl-idea <text>` and do not call a tool. Otherwise call the `howl_capture` MCP tool from the `howl-pa` server with `{ "text": "$ARGUMENTS", "kind": "idea" }`. Present `id`, `kind`, `title`, and `created_at` when returned; otherwise present `kind`, `summary`, and `ref.vault_path` if returned.
