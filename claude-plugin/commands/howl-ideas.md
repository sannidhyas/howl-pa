---
description: Stub for Telegram-only parked idea listing.
disable-model-invocation: false
---

No dashboard API or `howl-pa` MCP tool exists for `/ideas`, so do not call a tool. Tell the user this is Telegram/vault-only and reads parked ideas from the vault; enabling it in Claude Code would need a dashboard endpoint such as `GET /api/ideas` returning parked idea `slug`, `title`, `mtime`, and vault path from `08_Pipeline/ideas`.
