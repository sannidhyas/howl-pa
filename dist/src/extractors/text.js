import { readFile } from 'node:fs/promises';
export async function extractText(path) {
    const raw = await readFile(path, 'utf8');
    return raw.replace(/\r\n/g, '\n');
}
//# sourceMappingURL=text.js.map