import type { MissionFn } from './types.js'
import { classifyPendingEmails } from '../gmail-classifier.js'

export const gmailClassify: MissionFn = async (_ctx) => {
  const result = await classifyPendingEmails()
  return {
    summary: `classified ${result.classified} via ${result.backend} (${result.batches} batches, ${result.skipped} skipped)`,
    data: result as unknown as Record<string, unknown>,
  }
}
