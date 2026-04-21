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
// Optional animated boot — runs only if stdout is a TTY. Short neon sweep
// across "HOWL PA" for ~1.1s, then stops. Safe in systemd journal because
// it no-ops when isTTY is false. Returns a promise that resolves when
// the animation finishes; callers can ignore it.
export async function animateBanner() {
    if (!process.stdout.isTTY)
        return;
    try {
        const mod = (await import('chalk-animation'));
        const anim = mod.default.neon('\n   H O W L   P A   —   personal mission control\n');
        await new Promise(resolve => setTimeout(resolve, 1100));
        anim.stop();
        process.stdout.write('\n');
    }
    catch {
        // If chalk-animation is missing for some reason, fall back silently.
    }
}
// Inline SVG wolf mark — aggressive snarling head with tall swept-back
// ears, angular cheekbones, narrowed eye slits, bared fangs. Fills with
// `currentColor`; cut-outs use the dashboard dark background so the face
// stays legible at 22px.
export function svgMark(size = 22) {
    const s = String(size);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${s}" height="${s}" aria-hidden="true" focusable="false">
<g fill="currentColor">
<path d="M2 4 L24 22 L22 30 L14 26 Z" />
<path d="M62 4 L40 22 L42 30 L50 26 Z" />
<path d="M14 20 L10 34 L18 48 L30 62 L34 62 L46 48 L54 34 L50 20 L42 26 L34 32 L30 32 L22 26 Z" />
</g>
<g fill="#0b0c10">
<path d="M18 28 L28 34 L26 28 Z" />
<path d="M46 28 L36 34 L38 28 Z" />
<path d="M22 44 L24 50 L27 46 L30 52 L32 46 L34 52 L37 46 L40 50 L42 44 Z" />
</g>
</svg>`;
}
// Favicon: data URL with the full SVG payload percent-encoded so embedding
// in either quote style (href="..." or href='...') works. Previous version
// left raw `"` inside the xmlns attribute which escaped the HTML attribute
// and leaked `" />` as visible text in the login form.
export function svgFavicon() {
    const raw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0b0c10"/><g fill="#7cc5ff"><path d="M2 4 L24 22 L22 30 L14 26 Z"/><path d="M62 4 L40 22 L42 30 L50 26 Z"/><path d="M14 20 L10 34 L18 48 L30 62 L34 62 L46 48 L54 34 L50 20 L42 26 L34 32 L30 32 L22 26 Z"/></g><g fill="#0b0c10"><path d="M18 28 L28 34 L26 28 Z"/><path d="M46 28 L36 34 L38 28 Z"/><path d="M22 44 L24 50 L27 46 L30 52 L32 46 L34 52 L37 46 L40 50 L42 44 Z"/></g></svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(raw);
}
//# sourceMappingURL=logo.js.map