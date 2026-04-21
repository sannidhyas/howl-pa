---
description: Stub for Telegram-only idea opening.
disable-model-invocation: false
---

No dashboard API or `howl-pa` MCP tool exists for `/open <slug> [name]`, so do not call a tool. Tell the user this is Telegram/vault-only and promotes a parked idea into `06_Projects/6N_Name`; enabling it in Claude Code would need a dashboard endpoint such as `POST /api/ideas/:slug/open` accepting `{ "name"?: string }` and returning project path, project number, and title.
