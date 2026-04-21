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
// Inline SVG wolf mark for HTML. Stroke-only silhouette, inherits
// `currentColor` so it sits on whatever background it's dropped onto.
export function svgMark(size = 22) {
    const s = String(size);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${s}" height="${s}" aria-hidden="true" focusable="false">
<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
<path d="M10 22 L16 10 L22 20 L32 14 L42 20 L48 10 L54 22 L56 38 C56 48 48 56 38 56 L26 56 C16 56 8 48 8 38 Z" />
<path d="M22 32 Q24 30 26 32" />
<path d="M38 32 Q40 30 42 32" />
<path d="M28 44 Q32 47 36 44" />
<path d="M32 36 L30 40 L34 40 Z" fill="currentColor" />
</g>
</svg>`;
}
// Favicon: compact URL-encoded SVG. Use a solid dark circle with the mark
// on top, sized for 32px. Works in every modern browser.
export function svgFavicon() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="%230b0c10"/><g fill="none" stroke="%237cc5ff" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M10 22 L16 10 L22 20 L32 14 L42 20 L48 10 L54 22 L56 38 C56 48 48 56 38 56 L26 56 C16 56 8 48 8 38 Z"/><path d="M22 32 Q24 30 26 32"/><path d="M38 32 Q40 30 42 32"/><path d="M28 44 Q32 47 36 44"/><path d="M32 36 L30 40 L34 40 Z" fill="%237cc5ff"/></g></svg>`;
    return 'data:image/svg+xml,' + svg;
}
//# sourceMappingURL=logo.js.map