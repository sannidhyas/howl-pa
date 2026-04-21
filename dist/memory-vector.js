import { allMemoryChunks, deleteMemoryChunksFor, upsertMemoryChunk, } from './db.js';
import { blobToFloats, cosineSim, embed, floatsToBlob } from './embedder.js';
export async function indexChunk(args) {
    const vec = await embed(args.chunk);
    if (!vec)
        return false;
    upsertMemoryChunk({
        sourceKind: args.sourceKind,
        sourceRef: args.sourceRef,
        chunkIdx: args.chunkIdx,
        chunk: args.chunk,
        embedding: floatsToBlob(vec),
        mtime: args.mtime,
    });
    return true;
}
export async function replaceChunksFor(sourceKind, sourceRef, chunks, mtime) {
    deleteMemoryChunksFor(sourceKind, sourceRef);
    let stored = 0;
    for (let i = 0; i < chunks.length; i++) {
        const ok = await indexChunk({
            sourceKind,
            sourceRef,
            chunkIdx: i,
            chunk: chunks[i],
            mtime,
        });
        if (ok)
            stored++;
    }
    return stored;
}
export async function queryCosineTopK(queryText, k = 5, filter) {
    const qvec = await embed(queryText);
    if (!qvec)
        return [];
    const rows = allMemoryChunks(filter?.kind);
    const scored = rows.map((row) => ({
        id: row.id,
        sourceKind: row.source_kind,
        sourceRef: row.source_ref,
        chunkIdx: row.chunk_idx,
        chunk: row.chunk,
        score: cosineSim(qvec, blobToFloats(row.embedding)),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
}
// Chunk a long markdown body by `##` headings; fall back to paragraph groups
// when no headings exist. Caps each chunk at ~1.5k chars to keep embeddings
// focused.
const MAX_CHUNK_CHARS = 1500;
export function chunkMarkdown(text) {
    if (text.trim().length === 0)
        return [];
    // Try heading split first.
    const headingSplit = text.split(/\n(?=#{1,3}\s)/);
    const chunks = [];
    for (const section of headingSplit) {
        if (section.length <= MAX_CHUNK_CHARS) {
            if (section.trim())
                chunks.push(section.trim());
            continue;
        }
        // Further split over-long section on paragraph boundaries.
        const paragraphs = section.split(/\n{2,}/);
        let buf = '';
        for (const para of paragraphs) {
            if ((buf.length + para.length + 2) > MAX_CHUNK_CHARS && buf.length > 0) {
                chunks.push(buf.trim());
                buf = para;
            }
            else {
                buf = buf.length === 0 ? para : `${buf}\n\n${para}`;
            }
        }
        if (buf.trim())
            chunks.push(buf.trim());
    }
    return chunks.filter(c => c.length >= 20);
}
//# sourceMappingURL=memory-vector.js.map