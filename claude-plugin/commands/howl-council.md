---
description: Stub for Telegram-only Howl PA /council dispatch.
disable-model-invocation: false
---

No dashboard API or `howl-pa` MCP tool exists for `/council [merge|best-of-n|vote] <prompt>`, so do not call a tool. Tell the user this is Telegram-only in the bot; enabling it in Claude Code would need a dashboard endpoint such as `POST /api/subagents/council` accepting `{ "prompt": string, "aggregator"?: "merge" | "best-of-n" | "vote" }` and returning members, winner, duration, final text, and errors.
