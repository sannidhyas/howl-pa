---
description: Stub for Telegram-only idea discard.
disable-model-invocation: false
---

No dashboard API or `howl-pa` MCP tool exists for `/discard <slug>`, so do not call a tool. Tell the user this is Telegram/vault-only and archives a parked idea folder; enabling it in Claude Code would need a dashboard endpoint such as `POST /api/ideas/:slug/discard` returning the archived path.
