// Direct recall probe — bypasses telegram so we can see errors.
//   npx tsx scripts/test-recall.ts "thesis"
import { initDatabase, closeDatabase } from '../src/db.js';
import { recall, formatHitsForTelegram } from '../src/memory.js';
import { embedderHealthy } from '../src/embedder.js';
const query = process.argv[2] ?? 'thesis';
initDatabase();
try {
    const healthy = await embedderHealthy(true);
    console.log(`ollama healthy: ${healthy}`);
    const hits = await recall(query, { k: 5 });
    console.log(`\n=== top ${hits.length} hits ===\n`);
    console.log(formatHitsForTelegram(hits));
}
catch (err) {
    console.error('RECALL ERROR:', err);
    if (err instanceof Error && err.stack)
        console.error(err.stack);
    process.exit(1);
}
finally {
    closeDatabase();
}
//# sourceMappingURL=test-recall.js.map