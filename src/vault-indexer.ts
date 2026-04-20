import { logger } from './logger.js'
import { memoryChunkMtime } from './db.js'
import { chunkMarkdown, replaceChunksFor } from './memory-vector.js'
import { listVaultNotes, readNoteBody } from './memory-graph.js'

export type IndexResult = {
  scanned: number
  reindexed: number
  chunksStored: number
  skipped: number
  errored: number
}

export async function reindexVault(): Promise<IndexResult> {
  const notes = listVaultNotes()
  const out: IndexResult = { scanned: notes.length, reindexed: 0, chunksStored: 0, skipped: 0, errored: 0 }

  for (const note of notes) {
    try {
      const storedMtime = memoryChunkMtime('vault', note.relPath)
      if (storedMtime !== null && storedMtime >= note.mtime) {
        out.skipped += 1
        continue
      }
      const { body } = readNoteBody(note.absPath)
      const chunks = chunkMarkdown(body)
      if (chunks.length === 0) {
        out.skipped += 1
        continue
      }
      const stored = await replaceChunksFor('vault', note.relPath, chunks, note.mtime)
      out.reindexed += 1
      out.chunksStored += stored
    } catch (err) {
      logger.warn({ err, path: note.relPath }, 'vault reindex failed for note')
      out.errored += 1
    }
  }
  logger.info(out, 'vault reindex done')
  return out
}
