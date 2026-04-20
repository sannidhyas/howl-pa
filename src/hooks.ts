export type HookContext = {
  chatId: string
  sessionId: string
  agentId: string
  text: string
  metadata: Record<string, unknown>
}

export type PreHookResult = {
  text: string
  metadata: Record<string, unknown>
  block?: { reason: string }
}

export type PostHookResult = {
  text: string
  metadata: Record<string, unknown>
}

export type PreHook = (ctx: HookContext) => Promise<PreHookResult> | PreHookResult
export type PostHook = (ctx: HookContext, reply: string) => Promise<PostHookResult> | PostHookResult

const preHooks: PreHook[] = []
const postHooks: PostHook[] = []

export function registerPreHook(hook: PreHook): void {
  preHooks.push(hook)
}

export function registerPostHook(hook: PostHook): void {
  postHooks.push(hook)
}

export async function runPreHooks(
  ctx: HookContext
): Promise<{ text: string; metadata: Record<string, unknown>; blocked?: string }> {
  let { text, metadata } = ctx
  for (const hook of preHooks) {
    const result = await hook({ ...ctx, text, metadata })
    if (result.block) return { text, metadata, blocked: result.block.reason }
    text = result.text
    metadata = result.metadata
  }
  return { text, metadata }
}

export async function runPostHooks(
  ctx: HookContext,
  reply: string
): Promise<{ text: string; metadata: Record<string, unknown> }> {
  let text = reply
  let metadata = ctx.metadata
  for (const hook of postHooks) {
    const result = await hook({ ...ctx, metadata }, text)
    text = result.text
    metadata = result.metadata
  }
  return { text, metadata }
}
