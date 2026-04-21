---
description: Stub for Telegram-only Howl PA backend listing.
disable-model-invocation: false
---

No dashboard API or `howl-pa` MCP tool exists for `/backends`, so do not call a tool. Tell the user this is Telegram-only in the bot; enabling it in Claude Code would need a dashboard endpoint such as `GET /api/subagents/backends` returning available backend ids like `claude`, `codex`, and configured `ollama:<model>` entries.
