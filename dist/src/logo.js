// Single source of truth for Howl PA visual identity.
// - textBanner(): ANSI-coloured terminal banner for the CLI boot log.
// - svgMark(size): inline SVG wolf mark for the dashboard header + login form.
// - svgFavicon(): data-URL-encoded SVG favicon for the dashboard HTML head.
// Keep the visuals here; consumers just import and embed.
const RESET = '\x1b[0m';
const DIM = '\x1b[38;5;240m';
const BOLD = '\x1b[1m';
const VIOLET = '\x1b[38;5;141m';
const ACCENT = '\x1b[38;5;117m';
const FG = '\x1b[38;5;255m';
// Minimal wolf silhouette — ASCII-only so it renders cleanly on any terminal
// including minimal dumb consoles (systemd journal, SSH sessions without
// unicode fonts). Avoid box-drawing and combining marks.
export function textBanner() {
    return [
        '',
        `${DIM}   .-.     .-.${RESET}`,
        `${DIM}  /   '._.'   \\${RESET}`,
        `${DIM}  |  ${ACCENT}o${DIM}     ${ACCENT}o${DIM}  |   ${BOLD}${FG}HOWL  PA${RESET}`,
        `${DIM}   \\   ^^^   /    ${VIOLET}personal mission control${RESET}`,
        `${DIM}    '-------'${RESET}`,
        '',
    ].join('\n');
}
// Compact single-line greeting suitable for grep-friendly logs.
export function textOneLine() {
    return `${BOLD}${FG}Howl PA${RESET} ${VIOLET}· personal mission control${RESET}`;
}
// Inline SVG wolf mark for HTML. Geometric wolf head in profile — tall
// pointed ears, angular face, pointed snout. Two eye dots. Inherits
// `currentColor` so it tints with the header state.
export function svgMark(size = 22) {
    const s = String(size);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${s}" height="${s}" aria-hidden="true" focusable="false">
<g fill="currentColor">
<path d="M8 6 L22 30 L30 22 Z" />
<path d="M56 6 L42 30 L34 22 Z" />
<path d="M20 22 L16 30 L24 44 L32 56 L40 44 L48 30 L44 22 L38 28 L32 32 L26 28 Z" />
</g>
<g fill="#0b0c10">
<circle cx="26" cy="32" r="1.8" />
<circle cx="38" cy="32" r="1.8" />
</g>
</svg>`;
}
// Favicon: compact URL-encoded SVG matching the mark above on a dark
// rounded-square. Keep it tight; browsers cache at 32px.
export function svgFavicon() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="%230b0c10"/><g fill="%237cc5ff"><path d="M8 6 L22 30 L30 22 Z"/><path d="M56 6 L42 30 L34 22 Z"/><path d="M20 22 L16 30 L24 44 L32 56 L40 44 L48 30 L44 22 L38 28 L32 32 L26 28 Z"/></g><g fill="%230b0c10"><circle cx="26" cy="32" r="1.8"/><circle cx="38" cy="32" r="1.8"/></g></svg>`;
    return 'data:image/svg+xml,' + svg;
}
//# sourceMappingURL=logo.js.map