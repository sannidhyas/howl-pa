import { reindexVault } from '../vault-indexer.js';
import { formatReindexResultHtml } from '../format-telegram.js';
export const vaultReindex = async (ctx) => {
    const result = await reindexVault();
    if (result.reindexed > 0) {
        await ctx.send(`<b>[mission]</b> vault reindex · ${result.reindexed} notes updated, ${result.chunksStored} chunks`);
    }
    return {
        summary: `reindexed ${result.reindexed} notes (${result.chunksStored} chunks)`,
        data: result,
    };
};
export const vaultReindexVerbose = async (ctx) => {
    const result = await reindexVault();
    await ctx.send(formatReindexResultHtml(result));
    return { summary: `reindex verbose`, data: result };
};
//# sourceMappingURL=vault-reindex.js.map