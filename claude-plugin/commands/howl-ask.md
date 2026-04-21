---
description: Stub for Telegram-only Howl PA /ask dispatch.
disable-model-invocation: false
---

No dashboard API or `howl-pa` MCP tool exists for `/ask [backend] <prompt>`, so do not call a tool. Tell the user this is Telegram-only in the bot; enabling it in Claude Code would need a dashboard endpoint such as `POST /api/subagents/dispatch` accepting `{ "prompt": string, "backend"?: string }` and returning backend, duration, final text, and errors.
