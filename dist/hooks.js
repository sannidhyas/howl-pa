const preHooks = [];
const postHooks = [];
export function registerPreHook(hook) {
    preHooks.push(hook);
}
export function registerPostHook(hook) {
    postHooks.push(hook);
}
export async function runPreHooks(ctx) {
    let { text, metadata } = ctx;
    for (const hook of preHooks) {
        const result = await hook({ ...ctx, text, metadata });
        if (result.block)
            return { text, metadata, blocked: result.block.reason };
        text = result.text;
        metadata = result.metadata;
    }
    return { text, metadata };
}
export async function runPostHooks(ctx, reply) {
    let text = reply;
    let metadata = ctx.metadata;
    for (const hook of postHooks) {
        const result = await hook({ ...ctx, metadata }, text);
        text = result.text;
        metadata = result.metadata;
    }
    return { text, metadata };
}
//# sourceMappingURL=hooks.js.map