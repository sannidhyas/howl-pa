import { reindexVault } from '../vault-indexer.js'
import type { MissionFn } from './types.js'
import { formatReindexResultHtml } from '../format-telegram.js'

export const vaultReindex: MissionFn = async (ctx) => {
  const result = await reindexVault()
  if (result.reindexed > 0) {
    await ctx.send(`<b>[mission]</b> vault reindex · ${result.reindexed} notes updated, ${result.chunksStored} chunks`)
  }
  return {
    summary: `reindexed ${result.reindexed} notes (${result.chunksStored} chunks)`,
    data: result as unknown as Record<string, unknown>,
  }
}

export const vaultReindexVerbose: MissionFn = async (ctx) => {
  const result = await reindexVault()
  await ctx.send(formatReindexResultHtml(result))
  return { summary: `reindex verbose`, data: result as unknown as Record<string, unknown> }
}
