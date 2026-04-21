// Best-effort citekey generator for papers the user dropped into
// ~/Documents/Thesis that did NOT come through the Zotero/ZotLit pipeline.
// Matches the Zotero "firstAuthorTitleYear" style used by howl's vault
// (e.g. `bergPredictionMarketsDecision2003`). Deterministic + slug-safe.
import { basename } from 'node:path';
// Trim common subtitle separators so the citekey stays short.
const SUBTITLE_SEP = /[:—–-]\s+/;
// Stop words we drop from the title when camel-casing.
const STOP = new Set([
    'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'is',
    'of', 'on', 'or', 'the', 'to', 'with', 'without', 'via', 'using', 'about',
    'over', 'per', 'are', 'be', 'been', 'this', 'that',
]);
// Zotero sometimes names exports like "Author and Author - 2003 - Title.pdf"
// or "Author Title Year.pdf" — the regex below catches both.
const FILENAME_PARTS = /^(?<auth>[A-Za-z][\w.'’\s&,-]+?)\s*(?:-|—|–|_)\s*(?<year>\d{4})\s*(?:-|—|–|_)\s*(?<title>.+)$/;
function firstAuthorFromAuth(auth) {
    // Split on " and ", ",", or "&". First chunk → last word before punctuation.
    const first = auth.split(/\s+and\s+|,|&/)[0]?.trim();
    if (!first)
        return null;
    // "Berg, J." → "Berg"; "Berg J. E." → "Berg"; "Smith John" → "Smith".
    const tokens = first.split(/\s+/).filter(t => /[A-Za-z]/.test(t));
    if (tokens.length === 0)
        return null;
    const last = tokens[0].replace(/[^A-Za-z]/g, '');
    return last.length > 0 ? last.toLowerCase() : null;
}
function camelTitle(title, maxChunks = 5) {
    const primary = title.split(SUBTITLE_SEP)[0] ?? title;
    const tokens = primary
        .replace(/\.pdf$/i, '')
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 0)
        .filter(t => !STOP.has(t.toLowerCase()))
        .slice(0, maxChunks);
    return tokens
        .map(t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
        .join('');
}
export function inferCitekey(filename, firstPageText) {
    const base = basename(filename).replace(/\.[^.]+$/, '');
    const m = FILENAME_PARTS.exec(base);
    let author = null;
    let year = null;
    let title = null;
    if (m && m.groups) {
        author = firstAuthorFromAuth(m.groups.auth);
        year = m.groups.year;
        title = m.groups.title;
    }
    if (!year && firstPageText) {
        const y = /(19|20)\d{2}/.exec(firstPageText);
        if (y)
            year = y[0];
    }
    if (!author && firstPageText) {
        const top = firstPageText.slice(0, 400);
        const by = /by\s+([A-Z][A-Za-z-]+)/.exec(top);
        const cap = /([A-Z][A-Za-z-]{2,})\s+(?:et\s+al|and)/.exec(top);
        author = by?.[1]?.toLowerCase() ?? cap?.[1]?.toLowerCase() ?? null;
    }
    if (!title)
        title = base;
    if (!author || !year)
        return null;
    const camel = camelTitle(title);
    if (!camel)
        return null;
    return `${author}${camel}${year}`;
}
export function literaturePathFor(citekey) {
    return `04_Notes/41_Literature/${citekey}.md`;
}
//# sourceMappingURL=citekey.js.map