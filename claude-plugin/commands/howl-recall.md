---
description: Surface recent Howl PA memory chunks (vault + conversation) in this session.
argument-hint: '[limit]'
disable-model-invocation: false
---

Call the `howl_recall` MCP tool from the `howl-pa` server. If `$ARGUMENTS` contains a number, pass it as `limit`. Present results as a short table: Kind · Ref · Chunk · Preview. Truncate previews to 120 chars each.
