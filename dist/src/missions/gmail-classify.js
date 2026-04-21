import { classifyPendingEmails } from '../gmail-classifier.js';
export const gmailClassify = async (_ctx) => {
    const result = await classifyPendingEmails();
    return {
        summary: `classified ${result.classified} via ${result.backend} (${result.batches} batches, ${result.skipped} skipped)`,
        data: result,
    };
};
//# sourceMappingURL=gmail-classify.js.map