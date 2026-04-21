import { svgMark, svgFavicon } from './logo.js';
export function dashboardHtml(token) {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Howl PA</title>
  <link rel="icon" href="${svgFavicon()}" />
  <meta name="theme-color" content="#0b0c10" />
  <style>
    :root {
      --bg: #0b0c10;
      --bg-1: #13151b;
      --bg-2: #191c24;
      --bg-3: #21252f;
      --border: #272b36;
      --border-strong: #3a3f4d;
      --fg: #edf0f6;
      --fg-muted: #a1a7b5;
      --fg-dim: #6c7384;
      --accent: #7cc5ff;
      --accent-dim: #4b8cc9;
      --violet: #b389ff;
      --ok: #6fd19a;
      --warn: #e9b56b;
      --danger: #f08a7a;
      --info: #7cc5ff;
      --shadow-sm: 0 1px 2px rgba(0,0,0,.3);
      --shadow-md: 0 4px 14px rgba(0,0,0,.35);
      --radius: 10px;
      --radius-sm: 6px;
      --ease: cubic-bezier(.2,.6,.2,1);
      --mono: ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
      --sans: system-ui, -apple-system, "Segoe UI", Inter, Roboto, sans-serif;
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--fg);
      font: 14px/1.5 var(--sans);
      -webkit-font-smoothing: antialiased;
    }
    code, .mono, pre, .num { font-family: var(--mono); }

    /* Layout */
    .app { display: flex; flex-direction: column; min-height: 100vh; }
    header.top {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 20px;
      background: var(--bg-1);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 30;
    }
    header.top h1 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: .06em;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--fg);
    }
    header.top h1 .logo {
      color: var(--accent);
      display: inline-flex;
      transition: color .25s var(--ease);
    }
    header.top h1 .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--ok);
      box-shadow: 0 0 0 4px rgba(111,209,154,.15);
      animation: pulse 2s infinite;
    }
    body.offline header.top h1 .logo { color: var(--danger); }
    body.offline header.top h1 .status-dot { background: var(--danger); box-shadow: 0 0 0 4px rgba(240,138,122,.2); }
    body.degraded header.top h1 .logo { color: var(--warn); }
    body.degraded header.top h1 .status-dot { background: var(--warn); box-shadow: 0 0 0 4px rgba(233,181,107,.2); }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: .55; }
    }
    .heartbeat {
      font-family: var(--mono);
      font-size: 12px;
      color: var(--fg-dim);
    }
    .spacer { flex: 1; }
    .search {
      position: relative;
      width: 260px;
    }
    .search input {
      width: 100%;
      background: var(--bg-2);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 6px 10px 6px 28px;
      color: var(--fg);
      font: inherit;
      transition: border-color .15s var(--ease), background .15s var(--ease);
    }
    .search input:focus {
      outline: none;
      border-color: var(--accent-dim);
      background: var(--bg-1);
    }
    .search::before {
      content: '⌕';
      position: absolute;
      left: 9px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--fg-dim);
      font-size: 14px;
    }
    .search kbd {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      background: var(--bg-3);
      color: var(--fg-dim);
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 3px;
      font-family: var(--mono);
    }

    /* Pulse strip */
    .pulse {
      display: flex;
      gap: 0;
      padding: 0;
      background: var(--bg-1);
      border-bottom: 1px solid var(--border);
      overflow-x: auto;
      scrollbar-width: none;
    }
    .pulse::-webkit-scrollbar { display: none; }
    .pulse-cell {
      display: flex;
      flex-direction: column;
      padding: 10px 18px;
      border-right: 1px solid var(--border);
      min-width: 140px;
      white-space: nowrap;
    }
    .pulse-cell:last-child { border-right: none; }
    .pulse-cell .label {
      font-size: 10.5px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: .09em;
      color: var(--fg-dim);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .pulse-cell .label::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
      opacity: .5;
    }
    .pulse-cell .value {
      font-family: var(--mono);
      font-size: 18px;
      font-weight: 500;
      margin-top: 2px;
      letter-spacing: -.01em;
    }
    .pulse-cell .sub {
      font-size: 11px;
      color: var(--fg-dim);
      margin-top: 1px;
    }
    .pulse-cell.ok .label { color: var(--ok); }
    .pulse-cell.warn .label { color: var(--warn); }
    .pulse-cell.danger .label { color: var(--danger); }
    .pulse-cell.info .label { color: var(--info); }

    /* Nav */
    nav.tabs {
      display: flex;
      gap: 0;
      padding: 0 20px;
      background: var(--bg-1);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 49px;
      z-index: 20;
      overflow-x: auto;
      scrollbar-width: none;
    }
    nav.tabs::-webkit-scrollbar { display: none; }
    nav.tabs button {
      background: none;
      border: none;
      color: var(--fg-muted);
      padding: 10px 14px;
      font: inherit;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      position: relative;
      transition: color .15s var(--ease);
      white-space: nowrap;
    }
    nav.tabs button:hover { color: var(--fg); }
    nav.tabs button.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }
    nav.tabs button .count {
      display: inline-block;
      background: var(--bg-3);
      color: var(--fg-muted);
      font-size: 10px;
      padding: 0 6px;
      border-radius: 999px;
      margin-left: 6px;
      font-family: var(--mono);
      min-width: 18px;
      text-align: center;
    }
    nav.tabs button.active .count { background: var(--accent-dim); color: var(--fg); }

    /* Main */
    main {
      flex: 1;
      padding: 20px;
      max-width: 1440px;
      width: 100%;
      margin: 0 auto;
    }
    section.panel { display: none; animation: fadeIn .18s var(--ease); }
    section.panel.active { display: block; }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(2px); }
      to { opacity: 1; transform: translateY(0); }
    }

    h2.section-title {
      margin: 0 0 14px 0;
      font-size: 13px;
      font-weight: 500;
      color: var(--fg-muted);
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    /* Toolbar (filters, action row above table/grid) */
    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }
    .toolbar .grow { flex: 1; }
    .filter-group {
      display: inline-flex;
      background: var(--bg-1);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 2px;
    }
    .filter-group button {
      background: none;
      border: none;
      color: var(--fg-muted);
      padding: 4px 10px;
      font: inherit;
      font-size: 12px;
      cursor: pointer;
      border-radius: 4px;
      transition: background .12s var(--ease), color .12s var(--ease);
    }
    .filter-group button:hover { color: var(--fg); }
    .filter-group button.on {
      background: var(--bg-3);
      color: var(--fg);
    }

    /* Cards */
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 12px;
    }
    .card {
      background: var(--bg-1);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 14px;
      transition: border-color .15s var(--ease), transform .15s var(--ease);
      position: relative;
    }
    .card:hover {
      border-color: var(--border-strong);
      transform: translateY(-1px);
    }
    .card.selected { border-color: var(--accent); }
    .card .title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .card .title {
      font-family: var(--mono);
      font-weight: 500;
      font-size: 13.5px;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .card .sub {
      color: var(--fg-muted);
      font-size: 11.5px;
      line-height: 1.45;
      margin-bottom: 8px;
    }
    .card .meta-row {
      display: flex;
      gap: 12px;
      align-items: center;
      margin-bottom: 10px;
      font-size: 12px;
      color: var(--fg-muted);
    }
    .card .meta-row .k {
      color: var(--fg-dim);
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: .06em;
      margin-right: 4px;
    }
    .card .result {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 6px 8px;
      font-family: var(--mono);
      font-size: 11.5px;
      color: var(--fg-muted);
      max-height: 60px;
      overflow: hidden;
      position: relative;
      margin-bottom: 10px;
      white-space: pre-wrap;
    }
    .card .result.expanded { max-height: none; }
    .card .result.ok { border-left: 2px solid var(--ok); }
    .card .result.err { border-left: 2px solid var(--danger); }

    .card-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    button.btn {
      background: var(--bg-2);
      border: 1px solid var(--border);
      color: var(--fg);
      padding: 5px 10px;
      border-radius: 5px;
      font: inherit;
      font-size: 12px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: background .12s var(--ease), border-color .12s var(--ease);
    }
    button.btn:hover { background: var(--bg-3); border-color: var(--border-strong); }
    button.btn:active { transform: translateY(1px); }
    button.btn:disabled { opacity: .4; cursor: not-allowed; }
    button.btn.primary {
      background: var(--accent-dim);
      border-color: var(--accent);
      color: #0b0c10;
      font-weight: 500;
    }
    button.btn.primary:hover { background: var(--accent); }
    button.btn.ghost {
      background: transparent;
      border-color: transparent;
      color: var(--fg-muted);
    }
    button.btn.ghost:hover { background: var(--bg-2); color: var(--fg); }
    button.btn.danger {
      background: transparent;
      border-color: var(--border-strong);
      color: var(--danger);
    }
    button.btn.danger:hover {
      background: rgba(240,138,122,.12);
      border-color: var(--danger);
    }
    button.btn .spinner {
      width: 10px;
      height: 10px;
      border: 1.5px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: spin .6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Pills */
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 1px 8px;
      border-radius: 999px;
      font-size: 10.5px;
      text-transform: uppercase;
      letter-spacing: .05em;
      font-weight: 500;
      background: var(--bg-3);
      color: var(--fg-muted);
      white-space: nowrap;
    }
    .pill.active, .pill.ok, .pill.done {
      background: rgba(111,209,154,.14);
      color: var(--ok);
    }
    .pill.paused, .pill.disabled { background: rgba(161,167,181,.14); color: var(--fg-muted); }
    .pill.running, .pill.queued {
      background: rgba(124,197,255,.14);
      color: var(--accent);
    }
    .pill.failed, .pill.error, .pill.stuck {
      background: rgba(240,138,122,.14);
      color: var(--danger);
    }
    .pill.partial, .pill.warn { background: rgba(233,181,107,.14); color: var(--warn); }
    .pill.builtin { background: rgba(179,137,255,.14); color: var(--violet); }

    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12.5px;
      background: var(--bg-1);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
    }
    thead th {
      text-align: left;
      padding: 9px 12px;
      color: var(--fg-dim);
      background: var(--bg-2);
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: .07em;
      font-size: 10.5px;
      border-bottom: 1px solid var(--border);
    }
    tbody tr { transition: background .1s var(--ease); }
    tbody tr:hover { background: var(--bg-2); }
    tbody td {
      padding: 8px 12px;
      border-top: 1px solid var(--border);
      vertical-align: top;
    }
    td.mono { font-family: var(--mono); font-size: 12px; }
    td.right { text-align: right; }
    td.muted { color: var(--fg-muted); }
    .truncate {
      max-width: 420px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Kanban (missions) */
    .board {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    @media (max-width: 900px) {
      .board { grid-template-columns: 1fr; }
    }
    .column {
      background: var(--bg-1);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 12px;
      min-height: 220px;
    }
    .column h3 {
      margin: 0 0 10px 0;
      font-size: 11.5px;
      font-weight: 600;
      color: var(--fg-muted);
      text-transform: uppercase;
      letter-spacing: .08em;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .column h3 .count {
      background: var(--bg-3);
      color: var(--fg-muted);
      font-family: var(--mono);
      font-size: 10.5px;
      padding: 1px 7px;
      border-radius: 999px;
    }
    .mission {
      background: var(--bg-2);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px;
      margin-bottom: 8px;
      font-size: 12.5px;
      transition: border-color .12s var(--ease);
    }
    .mission:hover { border-color: var(--border-strong); }
    .mission .title { font-weight: 500; margin-bottom: 3px; }
    .mission .meta {
      display: flex;
      gap: 8px;
      align-items: center;
      color: var(--fg-dim);
      font-size: 11px;
      margin-bottom: 6px;
    }
    .mission .result-preview {
      font-family: var(--mono);
      font-size: 11px;
      color: var(--fg-muted);
      max-height: 34px;
      overflow: hidden;
      margin-bottom: 6px;
    }
    .mission-actions { display: flex; gap: 4px; }

    /* Live feed */
    .feed {
      background: var(--bg-1);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 0;
      max-height: 70vh;
      overflow-y: auto;
    }
    .feed .entry {
      display: grid;
      grid-template-columns: 80px 120px 1fr;
      gap: 10px;
      padding: 7px 14px;
      border-bottom: 1px solid var(--border);
      font-size: 12.5px;
      align-items: start;
      transition: background .1s var(--ease);
    }
    .feed .entry:hover { background: var(--bg-2); }
    .feed .entry .ts {
      color: var(--fg-dim);
      font-family: var(--mono);
      font-size: 11px;
    }
    .feed .entry .kind {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .feed .entry .kind::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--fg-dim);
    }
    .feed .entry.session_start .kind::before { background: var(--violet); }
    .feed .entry.agent_started .kind::before { background: var(--accent); }
    .feed .entry.agent_completed .kind::before { background: var(--ok); }
    .feed .entry.message_received .kind::before { background: var(--fg-muted); }
    .feed .entry.chat_error .kind::before { background: var(--danger); }
    .feed .entry.session_end .kind::before { background: var(--fg-dim); }
    .feed .entry.chat_error { background: rgba(240,138,122,.06); }
    .feed .entry .payload {
      font-family: var(--mono);
      font-size: 11.5px;
      color: var(--fg-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Toasts */
    .toasts {
      position: fixed;
      bottom: 16px;
      right: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 100;
      pointer-events: none;
    }
    .toast {
      background: var(--bg-2);
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      padding: 10px 14px;
      min-width: 260px;
      max-width: 380px;
      box-shadow: var(--shadow-md);
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 10px;
      pointer-events: auto;
      animation: toastIn .2s var(--ease);
    }
    @keyframes toastIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .toast.ok { border-left: 3px solid var(--ok); }
    .toast.err { border-left: 3px solid var(--danger); }
    .toast.info { border-left: 3px solid var(--accent); }
    .toast .close {
      background: none;
      border: none;
      color: var(--fg-dim);
      font-size: 16px;
      cursor: pointer;
      padding: 0 2px;
    }

    /* Empty / skeleton */
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 20px;
      color: var(--fg-dim);
      background: var(--bg-1);
      border: 1px dashed var(--border);
      border-radius: var(--radius);
    }
    .empty .icon { font-size: 28px; margin-bottom: 8px; opacity: .6; }
    .empty .msg { font-size: 13px; }
    .empty .hint { font-size: 12px; color: var(--fg-dim); margin-top: 4px; }

    .skeleton {
      background: linear-gradient(90deg, var(--bg-1), var(--bg-2), var(--bg-1));
      background-size: 200% 100%;
      animation: sheen 1.4s linear infinite;
      border-radius: var(--radius);
      min-height: 80px;
    }
    @keyframes sheen {
      from { background-position: 200% 0; }
      to { background-position: -200% 0; }
    }

    /* Help overlay */
    .help-overlay {
      position: fixed;
      inset: 0;
      background: rgba(11,12,16,.65);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 90;
    }
    .help-overlay.open { display: flex; animation: fadeIn .15s var(--ease); }
    .help-card {
      background: var(--bg-1);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius);
      padding: 20px 24px;
      max-width: 440px;
      width: 90%;
      box-shadow: var(--shadow-md);
    }
    .help-card h2 { margin: 0 0 14px 0; font-size: 14px; color: var(--fg-muted); letter-spacing: .05em; text-transform: uppercase; }
    .help-card dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; }
    .help-card dt { font-family: var(--mono); color: var(--accent); }
    .help-card dd { margin: 0; color: var(--fg-muted); }

    /* Transcript drawer */
    .drawer {
      position: fixed;
      top: 0; right: 0; bottom: 0;
      width: min(520px, 92vw);
      background: var(--bg-1);
      border-left: 1px solid var(--border-strong);
      box-shadow: -8px 0 24px rgba(0,0,0,.4);
      z-index: 80;
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform .22s var(--ease);
    }
    .drawer.open { transform: translateX(0); }
    .drawer .head {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 18px;
      border-bottom: 1px solid var(--border);
    }
    .drawer .head h3 {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      color: var(--fg);
      letter-spacing: .04em;
    }
    .drawer .head .meta {
      font-family: var(--mono);
      font-size: 11.5px;
      color: var(--fg-dim);
    }
    .drawer .body {
      flex: 1;
      overflow-y: auto;
      padding: 16px 18px;
      font-size: 13px;
      line-height: 1.55;
    }
    .drawer .body pre {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px 12px;
      font-family: var(--mono);
      font-size: 12px;
      color: var(--fg-muted);
      white-space: pre-wrap;
      word-break: break-word;
      margin: 0 0 14px 0;
      max-height: none;
    }
    .drawer .turn {
      margin-bottom: 14px;
    }
    .drawer .turn .role {
      font-size: 10.5px;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: var(--fg-dim);
      margin-bottom: 3px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .drawer .turn.user .role { color: var(--accent); }
    .drawer .turn.assistant .role { color: var(--violet); }

    tr.clickable { cursor: pointer; }
    tr.clickable:hover td:first-child::before {
      content: '↳ ';
      color: var(--accent);
      margin-left: -14px;
    }

    /* Inline confirmation */
    .confirm {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      background: rgba(240,138,122,.1);
      border: 1px solid var(--danger);
      border-radius: 5px;
      font-size: 12px;
      color: var(--danger);
    }
    .confirm button { font-size: 11.5px; padding: 3px 8px; }

    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* Modal */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(11,12,16,.72);
      backdrop-filter: blur(6px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 95;
      padding: 20px;
      overflow-y: auto;
    }
    .modal-overlay.open { display: flex; animation: fadeIn .15s var(--ease); }
    .modal {
      background: var(--bg-1);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius);
      padding: 22px 24px;
      max-width: 520px;
      width: 100%;
      box-shadow: var(--shadow-md);
      max-height: calc(100vh - 40px);
      overflow-y: auto;
    }
    .modal h2 {
      margin: 0 0 4px 0;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: .04em;
      color: var(--fg);
    }
    .modal .sub {
      color: var(--fg-muted);
      font-size: 12.5px;
      margin-bottom: 16px;
    }
    .field {
      margin-top: 12px;
    }
    .field label {
      display: block;
      color: var(--fg-dim);
      font-size: 10.5px;
      text-transform: uppercase;
      letter-spacing: .08em;
      margin-bottom: 5px;
    }
    .field input, .field textarea, .field select {
      width: 100%;
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--fg);
      border-radius: 5px;
      padding: 8px 10px;
      font: inherit;
      font-family: var(--mono);
      font-size: 12.5px;
      box-sizing: border-box;
      transition: border-color .12s var(--ease);
    }
    .field input:focus, .field textarea:focus, .field select:focus {
      outline: none;
      border-color: var(--accent-dim);
    }
    .field textarea { min-height: 110px; resize: vertical; font-family: var(--mono); }
    .field .help {
      margin-top: 4px;
      font-size: 11.5px;
      color: var(--fg-dim);
    }
    .field .err { display: none; color: var(--danger); font-size: 11.5px; margin-top: 4px; }
    .field.error .err { display: block; }
    .field.error input, .field.error textarea, .field.error select { border-color: var(--danger); }
    .modal-actions {
      display: flex;
      gap: 8px;
      margin-top: 22px;
      justify-content: flex-end;
    }

    /* Capture */
    .capture-kinds {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 6px;
      margin-bottom: 12px;
    }
    .kind-btn {
      background: var(--bg-1);
      border: 1px solid var(--border);
      color: var(--fg-muted);
      border-radius: 6px;
      padding: 10px 6px;
      font: inherit;
      font-size: 11.5px;
      cursor: pointer;
      text-align: center;
      transition: all .12s var(--ease);
    }
    .kind-btn:hover { color: var(--fg); border-color: var(--border-strong); }
    .kind-btn.active {
      background: var(--bg-3);
      border-color: var(--accent);
      color: var(--accent);
    }
    .kind-btn .emoji { font-size: 16px; display: block; margin-bottom: 3px; }

    /* Mobile polish */
    @media (max-width: 720px) {
      header.top { padding: 10px 14px; gap: 8px; }
      header.top .search { display: none; }
      header.top .heartbeat { font-size: 11px; }
      nav.tabs { padding: 0 10px; }
      nav.tabs button { padding: 9px 10px; font-size: 12.5px; }
      .pulse-cell { min-width: 110px; padding: 8px 12px; }
      .pulse-cell .value { font-size: 15px; }
      main { padding: 12px; }
      .card-grid { grid-template-columns: 1fr; }
      .board { grid-template-columns: 1fr; }
      table { font-size: 11.5px; }
      thead th { padding: 7px 8px; }
      tbody td { padding: 7px 8px; }
      .truncate { max-width: 180px; }
      .drawer { width: 100vw; }
      .modal { padding: 18px; }
      .toolbar { gap: 6px; }
    }
    @media (max-width: 480px) {
      header.top h1 { font-size: 12px; }
      nav.tabs button .count { display: none; }
    }
  </style>
</head>
<body>
  <div class="app">
    <header class="top">
      <h1><span class="logo">${svgMark(22)}</span>Howl PA<span class="status-dot"></span></h1>
      <div class="heartbeat" id="heartbeat">connecting…</div>
      <div class="spacer"></div>
      <div class="search">
        <input id="search" placeholder="Search (press /)" autocomplete="off" />
        <kbd>/</kbd>
      </div>
      <button class="btn ghost" id="help-btn" title="Keyboard shortcuts (?)">?</button>
      <button class="btn ghost" id="logout-btn" title="Sign out">⎋</button>
    </header>

    <div class="pulse" id="pulse"></div>

    <nav class="tabs" id="nav">
      <button data-tab="pulse" class="active">Pulse</button>
      <button data-tab="routines">Routines <span class="count" id="count-routines">·</span></button>
      <button data-tab="missions">Missions <span class="count" id="count-missions">·</span></button>
      <button data-tab="feed">Feed</button>
      <button data-tab="inbox">Inbox <span class="count" id="count-inbox">·</span></button>
      <button data-tab="calendar">Calendar <span class="count" id="count-calendar">·</span></button>
      <button data-tab="vault">Vault</button>
      <button data-tab="memories">Memory</button>
      <button data-tab="capture">Capture</button>
      <button data-tab="subagents">Subagents</button>
      <button data-tab="usage">Usage</button>
      <button data-tab="audit">Audit</button>
    </nav>

    <main>
      <section id="pulse" class="panel active">
        <h2 class="section-title">Recent activity</h2>
        <div id="recent-activity"></div>
      </section>

      <section id="routines" class="panel">
        <div class="toolbar">
          <div class="filter-group" id="routines-filter">
            <button data-f="all" class="on">All</button>
            <button data-f="active">Active</button>
            <button data-f="paused">Paused</button>
            <button data-f="builtin">Built-in</button>
            <button data-f="custom">Custom</button>
          </div>
          <div class="grow"></div>
          <button class="btn primary" id="routines-new">+ New routine</button>
          <button class="btn ghost" id="routines-refresh">↻ Refresh</button>
        </div>
        <div class="card-grid" id="routines-grid"></div>
      </section>

      <section id="missions" class="panel">
        <div class="toolbar">
          <h2 class="section-title" style="margin:0">Mission queue</h2>
          <div class="grow"></div>
          <button class="btn primary" id="missions-adhoc">▶ Run ad-hoc</button>
          <button class="btn ghost" id="missions-refresh">↻ Refresh</button>
        </div>
        <div class="board">
          <div class="column">
            <h3>Queued <span class="count" id="missions-queued-count">0</span></h3>
            <div id="missions-queued"></div>
          </div>
          <div class="column">
            <h3>Running <span class="count" id="missions-running-count">0</span></h3>
            <div id="missions-running"></div>
          </div>
          <div class="column">
            <h3>Recent <span class="count" id="missions-recent-count">0</span></h3>
            <div id="missions-recent"></div>
          </div>
        </div>
      </section>

      <section id="feed" class="panel">
        <div class="toolbar">
          <div class="filter-group" id="feed-filter">
            <button data-f="all" class="on">All</button>
            <button data-f="agent">Agent</button>
            <button data-f="chat_error">Errors</button>
            <button data-f="session">Sessions</button>
          </div>
          <div class="grow"></div>
          <span id="feed-status" class="heartbeat">· idle</span>
          <button class="btn ghost" id="feed-pause">⏸ Pause</button>
          <button class="btn ghost" id="feed-clear">Clear</button>
        </div>
        <div class="feed" id="feed-list">
          <div class="empty">
            <div class="icon">◌</div>
            <div class="msg">Waiting for live events…</div>
            <div class="hint">Start a chat in Telegram to see activity here.</div>
          </div>
        </div>
      </section>

      <section id="inbox" class="panel">
        <h2 class="section-title">Open tasks</h2>
        <div id="tasks-wrap"></div>
        <h2 class="section-title" style="margin-top:24px">Recent Gmail</h2>
        <div id="gmail-wrap"></div>
      </section>

      <section id="calendar" class="panel">
        <h2 class="section-title">Upcoming events</h2>
        <div id="calendar-wrap"></div>
      </section>

      <section id="vault" class="panel">
        <h2 class="section-title">Recent vault chunks</h2>
        <div id="memory-wrap"></div>
      </section>

      <section id="memories" class="panel">
        <div class="toolbar">
          <div class="filter-group" id="memory-scope-filter"></div>
          <div class="grow"></div>
          <button class="btn primary" id="memories-new">+ New memory</button>
          <button class="btn ghost" id="memories-refresh">↻ Refresh</button>
        </div>
        <div id="memories-wrap"></div>
        <div class="hint" style="margin-top:14px">
          Memories are short key→value hints injected into agent prompts. Scope decides which agent sees them — global goes everywhere; email_hint feeds the Gmail classifier; capture_hint overrides capture classification; agent_hint prepends to every subagent call.
        </div>
      </section>

      <section id="subagents" class="panel">
        <h2 class="section-title">Subagent runs (last 50)</h2>
        <div id="subagent-wrap"></div>
        <h2 class="section-title" style="margin-top:24px">Routing by role (7d)</h2>
        <div id="roles-wrap"></div>
      </section>

      <section id="capture" class="panel">
        <div class="toolbar">
          <h2 class="section-title" style="margin:0">Capture</h2>
          <div class="grow"></div>
        </div>
        <div class="card" style="max-width:640px;margin:0 auto">
          <div class="sub" style="margin-bottom:10px;color:var(--fg-muted);font-size:13px">Drop a thought — it lands in the vault. Pick a kind or leave it on auto for the router to classify.</div>
          <div class="capture-kinds" id="capture-kinds"></div>
          <div class="field">
            <label for="capture-text">Text</label>
            <textarea id="capture-text" placeholder="What's on your mind? (Cmd/Ctrl+Enter to send)"></textarea>
          </div>
          <div class="field" id="capture-title-wrap" style="display:none">
            <label for="capture-title">Title (optional)</label>
            <input id="capture-title" placeholder="Short label" />
          </div>
          <div class="modal-actions" style="margin-top:14px">
            <button class="btn ghost" id="capture-clear">Clear</button>
            <button class="btn primary" id="capture-send">Capture</button>
          </div>
          <div id="capture-result" style="margin-top:14px"></div>
        </div>
      </section>

      <section id="usage" class="panel">
        <div class="toolbar">
          <h2 class="section-title" style="margin:0">Claude + Codex usage</h2>
          <div class="grow"></div>
          <button class="btn ghost" id="usage-refresh">↻ Refresh</button>
        </div>
        <div id="usage-wrap"></div>
      </section>

      <section id="audit" class="panel">
        <h2 class="section-title">Audit log (last 100)</h2>
        <div id="audit-wrap"></div>
      </section>
    </main>
  </div>

  <div class="modal-overlay" id="modal-overlay" aria-hidden="true">
    <div class="modal" role="dialog" aria-modal="true">
      <h2 id="modal-title">Modal</h2>
      <div class="sub" id="modal-sub"></div>
      <div id="modal-body"></div>
      <div class="modal-actions" id="modal-actions">
        <button class="btn ghost" id="modal-cancel">Cancel</button>
        <button class="btn primary" id="modal-submit">Submit</button>
      </div>
    </div>
  </div>

  <div class="toasts" id="toasts"></div>

  <aside class="drawer" id="drawer" aria-hidden="true">
    <div class="head">
      <h3 id="drawer-title">Transcript</h3>
      <span class="meta" id="drawer-meta"></span>
      <div style="flex:1"></div>
      <button class="btn ghost" id="drawer-close" aria-label="Close">✕</button>
    </div>
    <div class="body" id="drawer-body"></div>
  </aside>

  <div class="help-overlay" id="help-overlay">
    <div class="help-card">
      <h2>Keyboard shortcuts</h2>
      <dl>
        <dt>/</dt><dd>Focus search</dd>
        <dt>?</dt><dd>Show this help</dd>
        <dt>Esc</dt><dd>Close overlay / clear selection</dd>
        <dt>g p</dt><dd>Pulse</dd>
        <dt>g r</dt><dd>Routines</dd>
        <dt>g m</dt><dd>Missions</dd>
        <dt>g f</dt><dd>Feed</dd>
        <dt>g i</dt><dd>Inbox</dd>
        <dt>g c</dt><dd>Calendar</dd>
        <dt>g a</dt><dd>Audit</dd>
      </dl>
    </div>
  </div>

  <script>
    const TOKEN = ${JSON.stringify(token)};
    const AUTH = { Authorization: 'Bearer ' + TOKEN };

    // ───── fetch helpers ─────
    function withQ(url){ return url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(TOKEN); }
    async function getJson(url){
      const r = await fetch(withQ(url));
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    }
    async function postJson(url, body){
      const r = await fetch(withQ(url), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-dashboard-token': TOKEN },
        body: JSON.stringify(body ?? {}),
      });
      let data = null;
      try { data = await r.json(); } catch { /* no body */ }
      if (!r.ok) throw Object.assign(new Error((data && data.error) || (url + ' ' + r.status)), { status: r.status, data });
      return data;
    }

    // ───── toasts ─────
    const toastsEl = document.getElementById('toasts');
    function toast(msg, level = 'info', ms = 3800){
      const t = document.createElement('div');
      t.className = 'toast ' + level;
      t.innerHTML = '<span>' + escapeHtml(msg) + '</span>';
      const close = document.createElement('button');
      close.className = 'close';
      close.textContent = '×';
      close.onclick = () => t.remove();
      t.append(close);
      toastsEl.append(t);
      if (ms > 0) setTimeout(() => t.remove(), ms);
    }

    // ───── utils ─────
    function escapeHtml(s){
      return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    }
    function fmtTs(ms){ if(!ms) return '—'; return new Date(ms).toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' }); }
    function fmtClock(ms){ if(!ms) return '—'; return new Date(ms).toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit', second:'2-digit' }); }
    function fmtRel(ms){
      if(!ms) return '—';
      const diff = Date.now() - ms;
      const future = diff < 0;
      const s = Math.abs(diff) / 1000;
      const n = v => v.toFixed(0);
      const body = s < 60 ? n(s)+'s'
        : s < 3600 ? n(s/60)+'m'
        : s < 86400 ? n(s/3600)+'h'
        : n(s/86400)+'d';
      return future ? 'in ' + body : body + ' ago';
    }
    function fmtDuration(ms){
      if (ms == null) return '—';
      if (ms < 1000) return ms + 'ms';
      if (ms < 60_000) return (ms/1000).toFixed(1) + 's';
      return (ms/60_000).toFixed(1) + 'm';
    }
    function humanCron(expr){
      if (!expr) return '';
      const m = /^\\*\\/(\\d+)\\s+\\*\\s+\\*\\s+\\*\\s+\\*$/.exec(expr);
      if (m) return 'every ' + m[1] + ' min';
      const daily = /^(\\d+)\\s+(\\d+)\\s+\\*\\s+\\*\\s+\\*$/.exec(expr);
      if (daily) return 'daily ' + String(daily[2]).padStart(2,'0') + ':' + String(daily[1]).padStart(2,'0');
      const dow = /^(\\d+)\\s+(\\d+)\\s+\\*\\s+\\*\\s+([0-6])$/.exec(expr);
      if (dow) {
        const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        return days[+dow[3]] + ' ' + String(dow[2]).padStart(2,'0') + ':' + String(dow[1]).padStart(2,'0');
      }
      return expr;
    }
    function compactNum(n){
      n = Number(n || 0);
      if (n >= 1_000_000) return (n/1_000_000).toFixed(1) + 'M';
      if (n >= 1_000) return (n/1_000).toFixed(1) + 'k';
      return String(n);
    }

    // ───── state ─────
    const state = {
      heartbeat: null,
      schedRows: [],
      missionRows: [],
      tokenRows: [],
      search: '',
      routineFilter: 'all',
      feedFilter: 'all',
      feedPaused: false,
      feed: [],
      errorsWindow: [],
      tokensToday: 0,
      lastActivity: null,
      loadedTabs: new Set(['pulse']),
      drawerTarget: null,
    };

    // ───── health + pulse ─────
    async function pollHeartbeat(){
      try {
        const h = await getJson('/api/health');
        state.heartbeat = h;
        document.body.classList.remove('offline','degraded');
        const up = Math.floor(h.uptime_s / 60);
        document.getElementById('heartbeat').textContent = 'pid ' + h.pid + ' · up ' + (up < 60 ? up + 'm' : (up/60).toFixed(1) + 'h') + ' · ' + fmtClock(Date.now());
      } catch (e) {
        document.body.classList.add('offline');
        document.getElementById('heartbeat').textContent = 'offline — check the daemon';
      }
    }

    async function renderPulse(){
      let tokens = null;
      try { tokens = await getJson('/api/tokens'); state.tokensToday = tokens.today; } catch { /* ignore */ }

      const activeSched = state.schedRows.filter(r => r.status === 'active').length;
      const pausedSched = state.schedRows.filter(r => r.status === 'paused').length;
      const runningMissions = state.missionRows.filter(r => r.status === 'running' || r.status === 'queued').length;
      const last10m = Date.now() - 10 * 60 * 1000;
      const errors = state.errorsWindow.filter(t => t > last10m).length;

      const pulse = document.getElementById('pulse');
      const h = state.heartbeat;
      const up = h ? Math.floor(h.uptime_s / 60) : 0;
      pulse.innerHTML = '';
      const addCell = (cls, label, value, sub) => {
        const c = document.createElement('div');
        c.className = 'pulse-cell ' + cls;
        c.innerHTML = '<div class="label">' + escapeHtml(label) + '</div><div class="value">' + escapeHtml(value) + '</div><div class="sub">' + escapeHtml(sub || '') + '</div>';
        pulse.appendChild(c);
      };
      addCell(h ? 'ok' : 'danger', 'status', h ? 'online' : 'offline', h ? (up < 60 ? up + 'm uptime' : (up/60).toFixed(1) + 'h uptime') : 'daemon unreachable');
      addCell('info', 'routines', activeSched + ' active', pausedSched ? pausedSched + ' paused' : 'all firing');
      addCell(runningMissions ? 'warn' : 'ok', 'queue', String(runningMissions), runningMissions ? 'in flight' : 'idle');
      addCell(errors ? 'danger' : 'ok', 'errors 10m', String(errors), errors ? 'needs attention' : 'clean');
      addCell('info', 'tokens 24h', compactNum(state.tokensToday), (tokens && tokens.byBackend?.length) ? tokens.byBackend.length + ' backends' : '');
      addCell('ok', 'last activity', state.lastActivity ? fmtRel(state.lastActivity) : '—', state.lastActivity ? fmtClock(state.lastActivity) : 'no events yet');
    }

    async function renderRecentActivity(){
      const wrap = document.getElementById('recent-activity');
      let tokens = null;
      try { tokens = await getJson('/api/tokens'); } catch { wrap.innerHTML = '<div class="empty"><div class="icon">⚠</div><div class="msg">Could not load token stats</div></div>'; return; }
      if (!tokens.recent?.length) {
        wrap.innerHTML = '<div class="empty"><div class="icon">○</div><div class="msg">No agent runs yet</div><div class="hint">DM the bot on Telegram — activity will land here.</div></div>';
        return;
      }
      const headers = ['When','Backend','Model','In','Out','Duration'];
      wrap.innerHTML = '<table><thead><tr>' + headers.map(h=>'<th>'+h+'</th>').join('') + '</tr></thead><tbody>' +
        tokens.recent.map(r =>
          '<tr><td class="mono muted">' + escapeHtml(fmtRel(r.created_at)) + '</td>' +
          '<td>' + escapeHtml(r.backend) + '</td>' +
          '<td class="mono muted">' + escapeHtml(r.model || '—') + '</td>' +
          '<td class="right mono">' + escapeHtml(String(r.input_tokens)) + '</td>' +
          '<td class="right mono">' + escapeHtml(String(r.output_tokens)) + '</td>' +
          '<td class="right mono muted">' + escapeHtml(fmtDuration(r.duration_ms)) + '</td></tr>'
        ).join('') +
        '</tbody></table>';
    }

    // ───── routines ─────
    async function loadRoutines(){
      const grid = document.getElementById('routines-grid');
      if (!state.schedRows.length) grid.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
      try {
        const { rows } = await getJson('/api/scheduler');
        state.schedRows = rows;
        renderRoutines();
        updateTabCounts();
      } catch (e) {
        grid.innerHTML = '<div class="empty"><div class="icon">⚠</div><div class="msg">Failed to load routines</div><div class="hint">' + escapeHtml(e.message) + '</div></div>';
      }
    }

    function renderRoutines(){
      const grid = document.getElementById('routines-grid');
      const q = state.search.trim().toLowerCase();
      const filter = state.routineFilter;
      const rows = state.schedRows.filter(r => {
        if (q && !(r.name.toLowerCase().includes(q) || (r.mission||'').toLowerCase().includes(q))) return false;
        if (filter === 'active' && r.status !== 'active') return false;
        if (filter === 'paused' && r.status !== 'paused') return false;
        if (filter === 'builtin' && !r.is_builtin) return false;
        if (filter === 'custom' && r.is_builtin) return false;
        return true;
      });
      if (!rows.length) {
        grid.innerHTML = '<div class="empty"><div class="icon">∅</div><div class="msg">No routines match</div><div class="hint">Try the All filter or adjust your search.</div></div>';
        return;
      }
      grid.innerHTML = rows.map(r => routineCard(r)).join('');
      grid.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', onRoutineAction);
      });
    }

    function routineCard(r){
      const resultClass = (r.last_result || '').startsWith('error') ? 'err' : (r.last_result ? 'ok' : '');
      const human = humanCron(r.schedule);
      const nextCountdown = r.status === 'active' && r.next_run ? fmtRel(r.next_run) : (r.status === 'paused' ? 'paused' : '—');
      return \`
        <div class="card" data-name="\${escapeHtml(r.name)}">
          <div class="title-row">
            <span class="title">\${escapeHtml(r.name)}</span>
            \${r.is_builtin ? '<span class="pill builtin" title="Built-in routine — deletion is soft; will re-register on next restart">★ built-in</span>' : ''}
            <span class="pill \${escapeHtml(r.status)}">\${escapeHtml(r.status)}</span>
          </div>
          <div class="sub">\${escapeHtml(r.mission)}</div>
          <div class="meta-row">
            <span><span class="k">schedule</span><span class="mono">\${escapeHtml(human)}</span></span>
            <span><span class="k">next</span><span class="mono">\${escapeHtml(nextCountdown)}</span></span>
          </div>
          <div class="meta-row">
            <span><span class="k">last</span><span class="mono">\${escapeHtml(fmtRel(r.last_run))}</span></span>
            <span><span class="k">prio</span><span class="mono">\${escapeHtml(String(r.priority))}</span></span>
          </div>
          \${r.last_result ? \`<div class="result \${resultClass}" title="Click to expand">\${escapeHtml(r.last_result)}</div>\` : ''}
          <div class="card-actions">
            <button class="btn primary" data-action="run-now" data-name="\${escapeHtml(r.name)}">▶ Run now</button>
            \${r.status === 'paused'
              ? \`<button class="btn" data-action="resume" data-name="\${escapeHtml(r.name)}">Resume</button>\`
              : \`<button class="btn" data-action="pause" data-name="\${escapeHtml(r.name)}">Pause</button>\`}
            <div class="grow" style="flex:1"></div>
            <button class="btn ghost" data-action="edit" data-name="\${escapeHtml(r.name)}">Edit</button>
            <button class="btn danger" data-action="delete" data-name="\${escapeHtml(r.name)}">Delete</button>
          </div>
        </div>
      \`;
    }

    async function onRoutineAction(ev){
      const btn = ev.currentTarget;
      const name = btn.dataset.name;
      const action = btn.dataset.action;
      if (action === 'delete') {
        return showDeleteConfirm(btn, name);
      }
      if (action === 'edit') {
        const row = state.schedRows.find(r => r.name === name);
        if (row) openRoutineModal(row);
        return;
      }
      btn.disabled = true;
      const original = btn.innerHTML;
      btn.innerHTML = '<span class="spinner"></span> ' + original.replace(/^.\\s*/,'');
      try {
        let url;
        if (action === 'run-now') url = '/api/scheduler/' + encodeURIComponent(name) + '/run-now';
        else if (action === 'pause') url = '/api/scheduler/' + encodeURIComponent(name) + '/pause';
        else if (action === 'resume') url = '/api/scheduler/' + encodeURIComponent(name) + '/resume';
        const r = await postJson(url);
        toast(action === 'run-now' ? name + ' queued' : name + ' ' + r.status, 'ok');
        await loadRoutines();
      } catch (e) {
        toast(name + ': ' + e.message, 'err');
        btn.disabled = false;
        btn.innerHTML = original;
      }
    }

    function showDeleteConfirm(btn, name){
      const parent = btn.parentElement;
      const isBuiltin = state.schedRows.find(r => r.name === name)?.is_builtin;
      const confirm = document.createElement('div');
      confirm.className = 'confirm';
      confirm.innerHTML = (isBuiltin
        ? 'Built-in — re-registers on restart. Delete anyway?'
        : 'Delete this routine?');
      const yes = document.createElement('button');
      yes.className = 'btn danger';
      yes.textContent = 'Yes, delete';
      yes.onclick = async () => {
        yes.disabled = true;
        yes.innerHTML = '<span class="spinner"></span>';
        try {
          const r = await postJson('/api/scheduler/' + encodeURIComponent(name) + '/delete');
          toast(name + ' deleted' + (r.note ? ' — ' + r.note : ''), 'ok', 6000);
          await loadRoutines();
        } catch (e) {
          toast(name + ': ' + e.message, 'err');
          yes.disabled = false;
          yes.textContent = 'Yes, delete';
        }
      };
      const no = document.createElement('button');
      no.className = 'btn ghost';
      no.textContent = 'Cancel';
      no.onclick = () => { parent.replaceChild(btn, confirm); };
      confirm.append(yes, no);
      parent.replaceChild(confirm, btn);
    }

    document.getElementById('routines-filter').addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-f]'); if (!b) return;
      state.routineFilter = b.dataset.f;
      document.querySelectorAll('#routines-filter button').forEach(x => x.classList.toggle('on', x === b));
      renderRoutines();
    });
    document.getElementById('routines-refresh').addEventListener('click', loadRoutines);

    // ───── missions ─────
    async function loadMissions(){
      try {
        const { rows } = await getJson('/api/missions');
        state.missionRows = rows;
        renderMissions();
        updateTabCounts();
      } catch (e) {
        toast('Missions load failed: ' + e.message, 'err');
      }
    }
    function renderMissions(){
      const queued = state.missionRows.filter(r => r.status === 'queued');
      const running = state.missionRows.filter(r => r.status === 'running');
      const recent = state.missionRows.filter(r => ['done','failed','cancelled','error'].includes(r.status)).slice(0, 20);
      setColumn('queued', queued);
      setColumn('running', running);
      setColumn('recent', recent);
      document.getElementById('missions-queued-count').textContent = queued.length;
      document.getElementById('missions-running-count').textContent = running.length;
      document.getElementById('missions-recent-count').textContent = recent.length;
    }
    function setColumn(id, rows){
      const wrap = document.getElementById('missions-' + id);
      if (!rows.length) {
        wrap.innerHTML = '<div class="empty" style="padding:22px 10px"><div class="msg">Empty</div></div>';
        return;
      }
      wrap.innerHTML = rows.map(r => missionCard(r, id)).join('');
      wrap.querySelectorAll('[data-mission-action]').forEach(btn => btn.addEventListener('click', onMissionAction));
    }
    function missionCard(r, col){
      const actions = col === 'queued'
        ? \`<button class="btn ghost" data-mission-action="cancel" data-id="\${r.id}">Cancel</button>\`
        : (col === 'recent' && r.mission)
          ? \`<button class="btn ghost" data-mission-action="retry" data-id="\${r.id}">↻ Retry</button>\`
          : '';
      return \`
        <div class="mission" data-mission-id="\${r.id}">
          <div class="title">\${escapeHtml(r.title)}</div>
          <div class="meta">
            <span class="pill \${escapeHtml(r.status)}">\${escapeHtml(r.status)}</span>
            <span class="mono">#\${r.id}</span>
            <span class="mono">\${escapeHtml(r.assigned_agent || '—')}</span>
            <span>\${escapeHtml(fmtRel(r.started_at || r.created_at))}</span>
          </div>
          \${r.result ? \`<div class="result-preview">\${escapeHtml(String(r.result).slice(0, 220))}</div>\` : ''}
          <div class="mission-actions">
            <button class="btn ghost" data-mission-action="open" data-id="\${r.id}">Open</button>
            \${actions}
          </div>
        </div>
      \`;
    }
    async function onMissionAction(ev){
      const btn = ev.currentTarget;
      const id = btn.dataset.id;
      const action = btn.dataset.missionAction;
      if (action === 'open') {
        await showTranscript('mission_task', id);
        return;
      }
      btn.disabled = true;
      const original = btn.innerHTML;
      btn.innerHTML = '<span class="spinner"></span>';
      try {
        const url = '/api/missions/' + encodeURIComponent(id) + '/' + action;
        const r = await postJson(url);
        toast('mission #' + id + ' ' + (r.status || action), 'ok');
        await loadMissions();
      } catch (e) {
        toast('mission #' + id + ': ' + e.message, 'err');
        btn.disabled = false;
        btn.innerHTML = original;
      }
    }
    document.getElementById('missions-refresh').addEventListener('click', loadMissions);

    // ───── feed ─────
    let eventSource = null;
    function ensureFeed(){
      if (eventSource) return;
      document.getElementById('feed-status').textContent = '· connecting';
      eventSource = new EventSource(withQ('/api/events'));
      const types = ['session_start','message_received','agent_started','agent_completed','chat_error','session_end'];
      types.forEach(type => {
        eventSource.addEventListener(type, ev => {
          if (state.feedPaused) return;
          let data; try { data = JSON.parse(ev.data); } catch { data = ev.data; }
          pushFeedEntry({ type, ts: Date.now(), data });
          state.lastActivity = Date.now();
          if (type === 'chat_error') state.errorsWindow.push(Date.now());
        });
      });
      eventSource.addEventListener('ping', () => {
        document.getElementById('feed-status').textContent = '· live';
      });
      eventSource.addEventListener('error', () => {
        document.getElementById('feed-status').textContent = '· reconnecting';
      });
      eventSource.onopen = () => {
        document.getElementById('feed-status').textContent = '· live';
      };
    }
    function pushFeedEntry(entry){
      state.feed.unshift(entry);
      if (state.feed.length > 500) state.feed.length = 500;
      renderFeed();
    }
    function renderFeed(){
      const list = document.getElementById('feed-list');
      const f = state.feedFilter;
      const q = state.search.trim().toLowerCase();
      const rows = state.feed.filter(e => {
        if (f === 'agent' && !e.type.startsWith('agent')) return false;
        if (f === 'session' && !e.type.startsWith('session')) return false;
        if (f === 'chat_error' && e.type !== 'chat_error') return false;
        if (q) {
          const hay = (e.type + ' ' + JSON.stringify(e.data)).toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
      if (!rows.length) {
        list.innerHTML = '<div class="empty"><div class="icon">◌</div><div class="msg">Waiting for live events…</div><div class="hint">Events appear here in real time.</div></div>';
        return;
      }
      list.innerHTML = rows.map(e =>
        '<div class="entry ' + e.type + '"><span class="ts">' + fmtClock(e.ts) + '</span><span class="kind">' + e.type + '</span><span class="payload" title="' + escapeHtml(JSON.stringify(e.data)) + '">' + escapeHtml(JSON.stringify(e.data)) + '</span></div>'
      ).join('');
    }
    document.getElementById('feed-filter').addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-f]'); if (!b) return;
      state.feedFilter = b.dataset.f;
      document.querySelectorAll('#feed-filter button').forEach(x => x.classList.toggle('on', x === b));
      renderFeed();
    });
    document.getElementById('feed-pause').addEventListener('click', () => {
      state.feedPaused = !state.feedPaused;
      const btn = document.getElementById('feed-pause');
      btn.textContent = state.feedPaused ? '▶ Resume' : '⏸ Pause';
      document.getElementById('feed-status').textContent = state.feedPaused ? '· paused' : '· live';
    });
    document.getElementById('feed-clear').addEventListener('click', () => {
      state.feed = [];
      renderFeed();
    });

    // ───── inbox (tasks + gmail) ─────
    async function loadInbox(){
      const [tasks, gmail] = await Promise.all([
        getJson('/api/tasks').catch(()=>({rows:[]})),
        getJson('/api/gmail').catch(()=>({rows:[]})),
      ]);
      renderTasks(tasks.rows);
      renderGmail(gmail.rows);
      updateTabCounts(tasks.rows, gmail.rows);
    }
    function renderTasks(rows){
      const wrap = document.getElementById('tasks-wrap');
      if (!rows.length) { wrap.innerHTML = '<div class="empty"><div class="icon">☑</div><div class="msg">No open tasks</div></div>'; return; }
      wrap.innerHTML = '<table><thead><tr><th>Status</th><th>Title</th><th>Due</th><th>Imp</th><th>List</th><th class="right">Updated</th></tr></thead><tbody>' +
        rows.map(r =>
          '<tr><td><span class="pill ' + escapeHtml(r.status) + '">' + escapeHtml(r.status) + '</span></td>' +
          '<td>' + escapeHtml(r.title || '') + '</td>' +
          '<td class="mono muted">' + escapeHtml(fmtTs(r.due_ts)) + '</td>' +
          '<td class="right mono">' + escapeHtml(r.importance != null ? String(r.importance) : '—') + '</td>' +
          '<td class="mono muted">' + escapeHtml(r.list_id || '—') + '</td>' +
          '<td class="right mono muted">' + escapeHtml(fmtRel(r.updated_at)) + '</td></tr>'
        ).join('') + '</tbody></table>';
    }
    function renderGmail(rows){
      const wrap = document.getElementById('gmail-wrap');
      if (!rows.length) { wrap.innerHTML = '<div class="empty"><div class="icon">✉</div><div class="msg">Inbox empty</div></div>'; return; }
      wrap.innerHTML = '<table><thead><tr><th>When</th><th>Sender</th><th>Subject</th><th>Snippet</th><th class="right">Imp</th><th>Unread</th></tr></thead><tbody>' +
        rows.map(r =>
          '<tr><td class="mono muted">' + escapeHtml(fmtRel(r.internal_date)) + '</td>' +
          '<td class="mono truncate">' + escapeHtml(r.sender || '—') + '</td>' +
          '<td class="truncate">' + escapeHtml(r.subject || '') + '</td>' +
          '<td class="truncate muted">' + escapeHtml((r.snippet || '').slice(0,160)) + '</td>' +
          '<td class="right mono">' + escapeHtml(r.importance != null ? String(r.importance) : '—') + '</td>' +
          '<td>' + (r.unread ? '<span class="pill warn">unread</span>' : '<span class="muted">—</span>') + '</td></tr>'
        ).join('') + '</tbody></table>';
    }

    // ───── calendar ─────
    async function loadCalendar(){
      const wrap = document.getElementById('calendar-wrap');
      try {
        const { rows } = await getJson('/api/calendar');
        if (!rows.length) { wrap.innerHTML = '<div class="empty"><div class="icon">📅</div><div class="msg">No upcoming events</div></div>'; updateTabCounts(null, null, 0); return; }
        wrap.innerHTML = '<table><thead><tr><th>Starts</th><th>Ends</th><th>Summary</th><th>Location</th><th>Join</th></tr></thead><tbody>' +
          rows.map(r =>
            '<tr><td class="mono">' + escapeHtml(fmtTs(r.starts_at)) + '</td>' +
            '<td class="mono muted">' + escapeHtml(fmtTs(r.ends_at)) + '</td>' +
            '<td>' + escapeHtml(r.summary || '(no title)') + '</td>' +
            '<td class="muted truncate">' + escapeHtml(r.location || '—') + '</td>' +
            '<td class="mono">' + (r.meet_link ? '<a href="' + escapeHtml(r.meet_link) + '" target="_blank" rel="noopener">open</a>' : '—') + '</td></tr>'
          ).join('') + '</tbody></table>';
        updateTabCounts(null, null, rows.length);
      } catch (e) {
        wrap.innerHTML = '<div class="empty"><div class="icon">⚠</div><div class="msg">' + escapeHtml(e.message) + '</div></div>';
      }
    }

    // ───── memory ─────
    async function loadMemory(){
      const wrap = document.getElementById('memory-wrap');
      try {
        const { rows } = await getJson('/api/memories');
        if (!rows.length) { wrap.innerHTML = '<div class="empty"><div class="icon">◍</div><div class="msg">Memory index empty</div><div class="hint">Run <code>vault-reindex</code> from the Routines tab.</div></div>'; return; }
        wrap.innerHTML = '<table><thead><tr><th>Kind</th><th>Ref</th><th class="right">Idx</th><th>Preview</th><th>mtime</th><th class="right">Created</th></tr></thead><tbody>' +
          rows.map(r =>
            '<tr><td>' + escapeHtml(r.source_kind) + '</td>' +
            '<td class="mono truncate">' + escapeHtml(r.source_ref) + '</td>' +
            '<td class="right mono">' + escapeHtml(String(r.chunk_idx)) + '</td>' +
            '<td class="truncate muted">' + escapeHtml((r.preview || '').slice(0, 200)) + '</td>' +
            '<td class="mono muted">' + escapeHtml(fmtRel(r.mtime)) + '</td>' +
            '<td class="right mono muted">' + escapeHtml(fmtRel(r.created_at)) + '</td></tr>'
          ).join('') + '</tbody></table>';
      } catch (e) {
        wrap.innerHTML = '<div class="empty"><div class="icon">⚠</div><div class="msg">' + escapeHtml(e.message) + '</div></div>';
      }
    }

    // ───── subagents ─────
    async function loadSubagents(){
      const wrap = document.getElementById('subagent-wrap');
      try {
        const { rows } = await getJson('/api/subagents');
        if (!rows.length) wrap.innerHTML = '<div class="empty"><div class="icon">◌</div><div class="msg">No subagent runs yet</div></div>';
        else wrap.innerHTML = '<table><thead><tr><th>When</th><th>Role</th><th>Backend</th><th>Judge</th><th class="right">Dur</th><th>Outcome</th><th>Preview</th></tr></thead><tbody>' +
          rows.map(r =>
            '<tr><td class="mono muted">' + escapeHtml(fmtRel(r.created_at)) + '</td>' +
            '<td class="mono">' + escapeHtml(r.role || '—') + '</td>' +
            '<td class="mono">' + escapeHtml(r.backend) + '</td>' +
            '<td class="mono muted">' + escapeHtml(r.judge || '—') + '</td>' +
            '<td class="right mono">' + escapeHtml(fmtDuration(r.duration_ms)) + '</td>' +
            '<td><span class="pill ' + escapeHtml(r.outcome) + '">' + escapeHtml(r.outcome) + '</span></td>' +
            '<td class="truncate muted">' + escapeHtml(r.prompt_preview || '') + '</td></tr>'
          ).join('') + '</tbody></table>';
      } catch (e) {
        wrap.innerHTML = '<div class="empty"><div class="icon">⚠</div><div class="msg">' + escapeHtml(e.message) + '</div></div>';
      }
      const rolesWrap = document.getElementById('roles-wrap');
      try {
        const { rows } = await getJson('/api/roles?hours=168');
        if (!rows.length) rolesWrap.innerHTML = '<div class="empty"><div class="msg">No role telemetry yet</div></div>';
        else rolesWrap.innerHTML = '<table><thead><tr><th>Role</th><th class="right">Runs</th><th class="right">OK</th><th class="right">Err</th><th class="right">OK %</th><th class="right">Avg</th></tr></thead><tbody>' +
          rows.map(r => {
            const pct = r.n > 0 ? Math.round((r.ok / r.n) * 100) : 0;
            return '<tr><td class="mono">' + escapeHtml(r.role) + '</td>' +
              '<td class="right mono">' + r.n + '</td>' +
              '<td class="right mono" style="color:var(--ok)">' + r.ok + '</td>' +
              '<td class="right mono" style="color:var(--danger)">' + r.err + '</td>' +
              '<td class="right mono">' + pct + '%</td>' +
              '<td class="right mono muted">' + fmtDuration(r.avg_ms != null ? Math.round(r.avg_ms) : null) + '</td></tr>';
          }).join('') + '</tbody></table>';
      } catch { /* quiet */ }
    }

    // ───── system memories ─────
    let memoryScopes = [];
    let activeMemoryScope = '';
    let memoryRows = [];
    async function loadMemoryScopes(){
      try {
        const r = await getJson('/api/memory/scopes');
        const raw = r.scopes || r.rows || [];
        memoryScopes = raw.map(s => ({
          id: s.id ?? s.scope,
          label: s.label ?? (s.id ?? s.scope),
          description: s.description ?? '',
        }));
        if (!activeMemoryScope && memoryScopes.length) activeMemoryScope = memoryScopes[0].id;
        renderScopeFilter();
      } catch (e) {
        document.getElementById('memory-scope-filter').innerHTML = '<span class="muted" style="padding:6px 10px;font-size:12px">scope list failed: ' + escapeHtml(e.message) + '</span>';
      }
    }
    function renderScopeFilter(){
      const wrap = document.getElementById('memory-scope-filter');
      wrap.innerHTML = memoryScopes.map(s => {
        const on = s.id === activeMemoryScope ? ' on' : '';
        return '<button data-scope="' + escapeHtml(s.id) + '" class="' + on.trim() + '" title="' + escapeHtml(s.description || '') + '">' + escapeHtml(s.label || s.id) + '</button>';
      }).join('');
      wrap.querySelectorAll('button[data-scope]').forEach(btn => {
        btn.addEventListener('click', () => {
          activeMemoryScope = btn.dataset.scope;
          renderScopeFilter();
          loadMemories();
        });
      });
    }
    async function loadMemories(){
      const wrap = document.getElementById('memories-wrap');
      if (!memoryScopes.length) await loadMemoryScopes();
      if (!activeMemoryScope && memoryScopes.length) activeMemoryScope = memoryScopes[0].id;
      wrap.innerHTML = '<div class="skeleton" style="height:80px"></div>';
      try {
        const url = activeMemoryScope ? '/api/memory?scope=' + encodeURIComponent(activeMemoryScope) : '/api/memory';
        const r = await getJson(url);
        memoryRows = r.rows || [];
        renderMemoryList();
      } catch (e) {
        wrap.innerHTML = '<div class="empty"><div class="icon">⚠</div><div class="msg">' + escapeHtml(e.message) + '</div></div>';
      }
    }
    function renderMemoryList(){
      const wrap = document.getElementById('memories-wrap');
      if (!memoryRows.length) {
        const desc = memoryScopes.find(s => s.id === activeMemoryScope)?.description || '';
        wrap.innerHTML = '<div class="empty"><div class="icon">◌</div><div class="msg">No memories in this scope yet</div><div class="hint">' + escapeHtml(desc) + '</div></div>';
        return;
      }
      wrap.innerHTML = '<table><thead><tr><th>Scope</th><th>Key</th><th>Value</th><th>Updated</th><th></th></tr></thead><tbody>' +
        memoryRows.map(r => {
          const valueShort = (r.value || '').length > 180 ? escapeHtml(r.value.slice(0, 180)) + '…' : escapeHtml(r.value || '');
          return '<tr>' +
            '<td><span class="pill builtin">' + escapeHtml(r.scope) + '</span></td>' +
            '<td class="mono">' + escapeHtml(r.key) + '</td>' +
            '<td class="truncate">' + valueShort + '</td>' +
            '<td class="mono muted">' + escapeHtml(fmtRel(r.updated_at)) + '</td>' +
            '<td class="right">' +
              '<button class="btn ghost" data-mem-action="edit" data-scope="' + escapeHtml(r.scope) + '" data-key="' + escapeHtml(r.key) + '">Edit</button> ' +
              '<button class="btn danger" data-mem-action="delete" data-scope="' + escapeHtml(r.scope) + '" data-key="' + escapeHtml(r.key) + '">Delete</button>' +
            '</td></tr>';
        }).join('') +
        '</tbody></table>';
      wrap.querySelectorAll('[data-mem-action]').forEach(btn => btn.addEventListener('click', onMemoryAction));
    }
    async function onMemoryAction(ev){
      const btn = ev.currentTarget;
      const scope = btn.dataset.scope;
      const key = btn.dataset.key;
      const action = btn.dataset.memAction;
      if (action === 'edit') {
        const row = memoryRows.find(m => m.scope === scope && m.key === key);
        if (row) openMemoryModal(row);
        return;
      }
      if (action === 'delete') {
        if (!confirm('Delete memory ' + scope + '/' + key + '?')) return;
        try {
          const res = await fetch(withQ('/api/memory?scope=' + encodeURIComponent(scope) + '&key=' + encodeURIComponent(key)), {
            method: 'DELETE',
            headers: { 'x-dashboard-token': TOKEN },
          });
          const data = await res.json().catch(()=>({}));
          if (!res.ok) throw new Error(data.error || ('delete failed ' + res.status));
          toast(scope + '/' + key + ' deleted', 'ok');
          await loadMemories();
        } catch (e) {
          toast(e.message, 'err');
        }
      }
    }
    function openMemoryModal(existing){
      const isEdit = !!existing;
      const scope = existing ? existing.scope : (activeMemoryScope || (memoryScopes[0]?.id ?? 'global'));
      const key = existing ? existing.key : '';
      const value = existing ? existing.value : '';
      const scopeOpts = memoryScopes.map(s => {
        const sel = s.id === scope ? ' selected' : '';
        return '<option value="' + escapeHtml(s.id) + '"' + sel + '>' + escapeHtml(s.label || s.id) + '</option>';
      }).join('');
      const body = \`
        <div class="field"><label>Scope</label>
          <select id="mm-scope" \${isEdit ? 'disabled' : ''}>\${scopeOpts}</select>
        </div>
        <div class="field"><label>Key</label>
          <input id="mm-key" value="\${escapeHtml(key)}" placeholder="short-slug" \${isEdit ? 'disabled' : ''} spellcheck="false" />
          <div class="help">Lowercase slug · [a-z0-9_-]{1,64}</div>
          <div class="err">invalid key</div>
        </div>
        <div class="field"><label>Value</label>
          <textarea id="mm-value" spellcheck="false" style="min-height:160px">\${escapeHtml(value)}</textarea>
          <div class="help">Free text, up to 4000 chars. Will be injected into agent prompts.</div>
        </div>
      \`;
      openModal({
        title: isEdit ? 'Edit memory' : 'New memory',
        sub: isEdit ? scope + '/' + key : 'Short hint injected into agent prompts for this scope.',
        bodyHtml: body,
        submitLabel: isEdit ? 'Save' : 'Create',
        onSubmit: async () => {
          const scopeVal = modalBody.querySelector('#mm-scope').value;
          const keyVal = modalBody.querySelector('#mm-key').value.trim();
          const valueVal = modalBody.querySelector('#mm-value').value.trim();
          if (!isEdit && !/^[a-z0-9_-]{1,64}$/.test(keyVal)) { markFieldError('mm-key'); return true; }
          if (!valueVal) { toast('value is required', 'err'); return true; }
          clearFieldErrors();
          try {
            await postJson('/api/memory', { scope: scopeVal, key: keyVal, value: valueVal });
            toast((isEdit ? 'updated ' : 'created ') + scopeVal + '/' + keyVal, 'ok');
            activeMemoryScope = scopeVal;
            renderScopeFilter();
            await loadMemories();
          } catch (e) {
            toast(e.message, 'err');
            return true;
          }
        },
      });
    }
    document.getElementById('memories-new').addEventListener('click', async () => {
      if (!memoryScopes.length) await loadMemoryScopes();
      openMemoryModal(null);
    });
    document.getElementById('memories-refresh').addEventListener('click', () => loadMemories());

    // ───── usage ─────
    async function loadUsage(){
      const wrap = document.getElementById('usage-wrap');
      wrap.innerHTML = '<div class="skeleton" style="height:120px"></div>';
      try {
        const r = await getJson('/api/usage?window_hours=168');
        wrap.innerHTML = renderUsage(r);
      } catch (e) {
        wrap.innerHTML = '<div class="empty"><div class="icon">⚠</div><div class="msg">' + escapeHtml(e.message) + '</div></div>';
      }
    }
    function renderUsage(r){
      const c = r.claude || {};
      const x = r.codex || {};
      const claudeCard = c.available
        ? '<div class="card"><h3 style="margin:0 0 8px 0;font-size:12px;color:var(--fg-muted);text-transform:uppercase;letter-spacing:.08em">Claude Code (last ' + escapeHtml(String(r.window_hours)) + 'h)</h3>' +
          '<div class="grid" style="grid-template-columns:repeat(3, 1fr);gap:10px;margin:0">' +
            '<div><div class="muted" style="font-size:10.5px;text-transform:uppercase;letter-spacing:.08em">Prompts</div><div class="num" style="font-size:22px;margin-top:2px">' + escapeHtml(String(c.total_prompts ?? '—')) + '</div></div>' +
            '<div><div class="muted" style="font-size:10.5px;text-transform:uppercase;letter-spacing:.08em">Sessions</div><div class="num" style="font-size:22px;margin-top:2px">' + escapeHtml(String(c.total_sessions ?? '—')) + '</div></div>' +
            '<div><div class="muted" style="font-size:10.5px;text-transform:uppercase;letter-spacing:.08em">Hours</div><div class="num" style="font-size:22px;margin-top:2px">' + escapeHtml((c.total_hours ?? 0).toFixed ? c.total_hours.toFixed(1) : String(c.total_hours ?? '—')) + '</div></div>' +
          '</div>' +
          (c.users?.length ? '<div class="muted" style="font-size:11.5px;margin-top:10px">users: ' + c.users.map(u => '<code>' + escapeHtml(u) + '</code>').join(' ') + '</div>' : '') +
          (c.note ? '<div class="muted" style="font-size:11.5px;margin-top:6px;font-style:italic">' + escapeHtml(c.note) + '</div>' : '') +
          '</div>'
        : '<div class="empty"><div class="icon">○</div><div class="msg">Claude usage tracker not configured</div><div class="hint">' + escapeHtml(c.reason || 'run /usage-install in Claude Code') + '</div></div>';
      const codexCard = x.available
        ? '<div class="card"><h3 style="margin:0 0 8px 0;font-size:12px;color:var(--fg-muted);text-transform:uppercase;letter-spacing:.08em">Codex CLI</h3><div>' + escapeHtml(JSON.stringify(x)) + '</div></div>'
        : '<div class="empty" style="margin-top:12px"><div class="icon">◌</div><div class="msg">Codex usage not available</div><div class="hint">' + escapeHtml(x.reason || 'Codex does not write local usage logs') + '</div></div>';
      return claudeCard + codexCard;
    }
    document.getElementById('usage-refresh').addEventListener('click', loadUsage);

    // ───── audit ─────
    async function loadAudit(){
      const wrap = document.getElementById('audit-wrap');
      try {
        const { rows } = await getJson('/api/audit');
        if (!rows.length) { wrap.innerHTML = '<div class="empty"><div class="icon">☷</div><div class="msg">Audit log empty</div></div>'; return; }
        wrap.innerHTML = '<table><thead><tr><th>When</th><th>Event</th><th>Detail</th><th>Blocked</th><th>Chat</th><th>Agent</th><th></th></tr></thead><tbody>' +
          rows.map(r => {
            const hasRef = r.ref_kind && r.ref_id;
            const opener = hasRef ? 'clickable' : '';
            const refAttrs = hasRef ? ' data-ref-kind="' + escapeHtml(r.ref_kind) + '" data-ref-id="' + escapeHtml(String(r.ref_id)) + '"' : '';
            const hint = hasRef ? '<span class="muted">open ↗</span>' : '';
            return '<tr class="' + opener + '"' + refAttrs + '>' +
              '<td class="mono muted">' + escapeHtml(fmtRel(r.created_at)) + '</td>' +
              '<td><span class="pill ' + (r.blocked ? 'failed' : '') + '">' + escapeHtml(r.event_type) + '</span></td>' +
              '<td class="truncate">' + escapeHtml(r.detail || '') + '</td>' +
              '<td>' + (r.blocked ? '<span class="pill failed">yes</span>' : '<span class="muted">no</span>') + '</td>' +
              '<td class="mono muted">' + escapeHtml(r.chat_id || '—') + '</td>' +
              '<td class="mono">' + escapeHtml(r.agent_id) + '</td>' +
              '<td class="mono right">' + hint + '</td></tr>';
          }).join('') + '</tbody></table>';
        wrap.querySelectorAll('tr.clickable').forEach(tr => {
          tr.addEventListener('click', () => showTranscript(tr.dataset.refKind, tr.dataset.refId));
        });
      } catch (e) {
        wrap.innerHTML = '<div class="empty"><div class="icon">⚠</div><div class="msg">' + escapeHtml(e.message) + '</div></div>';
      }
    }

    // ───── tab counts ─────
    function updateTabCounts(tasks, gmail, cal){
      const r = state.schedRows.filter(x => x.status === 'active').length;
      document.getElementById('count-routines').textContent = r || '·';
      const m = state.missionRows.filter(x => x.status === 'running' || x.status === 'queued').length;
      document.getElementById('count-missions').textContent = m || '·';
      if (tasks !== undefined) document.getElementById('count-inbox').textContent = (tasks ? tasks.filter(t => t.status !== 'completed').length : 0) || '·';
      if (cal !== undefined && cal !== null) document.getElementById('count-calendar').textContent = cal || '·';
    }

    // ───── tab switcher ─────
    const TABS = {
      pulse: async () => { await globalPoll(); },
      routines: loadRoutines,
      missions: loadMissions,
      feed: () => { ensureFeed(); renderFeed(); },
      inbox: loadInbox,
      calendar: loadCalendar,
      vault: loadMemory,
      memories: loadMemories,
      subagents: loadSubagents,
      usage: loadUsage,
      audit: loadAudit,
      capture: async () => { if (!captureKinds.length) await loadCaptureKinds(); },
    };

    function switchTab(tab){
      const btn = document.querySelector('nav.tabs button[data-tab="' + tab + '"]');
      if (!btn) return;
      document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('section.panel').forEach(s => s.classList.toggle('active', s.id === tab));
      state.loadedTabs.add(tab);
      (TABS[tab] || (() => {}))();
      history.replaceState(null, '', '#' + tab);
    }

    document.getElementById('nav').addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-tab]'); if (!btn) return;
      switchTab(btn.dataset.tab);
    });

    // ───── global search ─────
    const searchInput = document.getElementById('search');
    searchInput.addEventListener('input', () => {
      state.search = searchInput.value;
      const active = document.querySelector('nav.tabs button.active')?.dataset?.tab;
      if (active === 'routines') renderRoutines();
      if (active === 'feed') renderFeed();
    });

    // ───── keyboard ─────
    let gPressed = false;
    let gTimer = null;
    document.addEventListener('keydown', (ev) => {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) {
        if (ev.key === 'Escape') ev.target.blur();
        return;
      }
      if (ev.key === '/') { ev.preventDefault(); searchInput.focus(); return; }
      if (ev.key === '?') { toggleHelp(true); return; }
      if (ev.key === 'Escape') { toggleHelp(false); return; }
      if (ev.key === 'g') {
        gPressed = true;
        clearTimeout(gTimer);
        gTimer = setTimeout(() => { gPressed = false; }, 700);
        return;
      }
      if (gPressed) {
        const map = { p: 'pulse', r: 'routines', m: 'missions', f: 'feed', i: 'inbox', c: 'calendar', a: 'audit' };
        if (map[ev.key]) { switchTab(map[ev.key]); gPressed = false; }
      }
    });

    function toggleHelp(open){
      const o = document.getElementById('help-overlay');
      o.classList.toggle('open', open != null ? open : !o.classList.contains('open'));
    }
    document.getElementById('help-btn').addEventListener('click', () => toggleHelp());
    document.getElementById('help-overlay').addEventListener('click', (ev) => {
      if (ev.target.id === 'help-overlay') toggleHelp(false);
    });

    // ───── global poll (keeps pulse + badges fresh regardless of active tab) ─────
    async function globalPoll(){
      try {
        const [sched, missions, tokens] = await Promise.all([
          getJson('/api/scheduler').catch(()=>({rows: state.schedRows})),
          getJson('/api/missions').catch(()=>({rows: state.missionRows})),
          getJson('/api/tokens').catch(()=>({today: state.tokensToday, recent: state.tokenRows, byBackend: []})),
        ]);
        state.schedRows = sched.rows;
        state.missionRows = missions.rows;
        state.tokensToday = tokens.today || 0;
        state.tokenRows = tokens.recent || [];
        renderPulseStrip(tokens.byBackend);
        updateTabCounts();
        const active = document.querySelector('nav.tabs button.active')?.dataset?.tab;
        if (active === 'routines') renderRoutines();
        if (active === 'missions') renderMissions();
        if (active === 'pulse') renderRecentTable();
      } catch {}
    }

    function renderPulseStrip(byBackend){
      const pulse = document.getElementById('pulse');
      const activeSched = state.schedRows.filter(r => r.status === 'active').length;
      const pausedSched = state.schedRows.filter(r => r.status === 'paused').length;
      const runningMissions = state.missionRows.filter(r => r.status === 'running' || r.status === 'queued').length;
      const last10m = Date.now() - 10 * 60 * 1000;
      state.errorsWindow = state.errorsWindow.filter(t => t > last10m);
      const errors = state.errorsWindow.length;
      const h = state.heartbeat;
      const up = h ? Math.floor(h.uptime_s / 60) : 0;
      pulse.innerHTML = '';
      const addCell = (cls, label, value, sub) => {
        const c = document.createElement('div');
        c.className = 'pulse-cell ' + cls;
        c.innerHTML = '<div class="label">' + escapeHtml(label) + '</div><div class="value">' + escapeHtml(value) + '</div><div class="sub">' + escapeHtml(sub || '') + '</div>';
        pulse.appendChild(c);
      };
      addCell(h ? 'ok' : 'danger', 'status', h ? 'online' : 'offline', h ? (up < 60 ? up + 'm uptime' : (up/60).toFixed(1) + 'h uptime') : 'daemon unreachable');
      addCell('info', 'routines', activeSched + ' active', pausedSched ? pausedSched + ' paused' : 'all firing');
      addCell(runningMissions ? 'warn' : 'ok', 'queue', String(runningMissions), runningMissions ? 'in flight' : 'idle');
      addCell(errors ? 'danger' : 'ok', 'errors 10m', String(errors), errors ? 'needs attention' : 'clean');
      addCell('info', 'tokens 24h', compactNum(state.tokensToday), (byBackend && byBackend.length) ? byBackend.length + ' backends' : '');
      addCell('ok', 'last activity', state.lastActivity ? fmtRel(state.lastActivity) : '—', state.lastActivity ? fmtClock(state.lastActivity) : 'no events yet');
    }

    function renderRecentTable(){
      const wrap = document.getElementById('recent-activity');
      if (!state.tokenRows.length) {
        wrap.innerHTML = '<div class="empty"><div class="icon">○</div><div class="msg">No agent runs yet</div><div class="hint">DM the bot on Telegram — activity will land here.</div></div>';
        return;
      }
      const headers = ['When','Backend','Model','In','Out','Duration'];
      wrap.innerHTML = '<table><thead><tr>' + headers.map(h=>'<th>'+h+'</th>').join('') + '</tr></thead><tbody>' +
        state.tokenRows.map(r =>
          '<tr><td class="mono muted">' + escapeHtml(fmtRel(r.created_at)) + '</td>' +
          '<td>' + escapeHtml(r.backend) + '</td>' +
          '<td class="mono muted">' + escapeHtml(r.model || '—') + '</td>' +
          '<td class="right mono">' + escapeHtml(String(r.input_tokens)) + '</td>' +
          '<td class="right mono">' + escapeHtml(String(r.output_tokens)) + '</td>' +
          '<td class="right mono muted">' + escapeHtml(fmtDuration(r.duration_ms)) + '</td></tr>'
        ).join('') +
        '</tbody></table>';
    }

    // ───── transcript drawer ─────
    const drawerEl = document.getElementById('drawer');
    document.getElementById('drawer-close').addEventListener('click', () => closeDrawer());
    function openDrawer(){ drawerEl.classList.add('open'); drawerEl.setAttribute('aria-hidden','false'); }
    function closeDrawer(){ drawerEl.classList.remove('open'); drawerEl.setAttribute('aria-hidden','true'); state.drawerTarget = null; }
    async function showTranscript(kind, id){
      if (!kind || id == null) { toast('No transcript linked to this row', 'info'); return; }
      state.drawerTarget = { kind, id };
      document.getElementById('drawer-title').textContent = kind === 'mission_task' ? 'Mission transcript' : 'Chat transcript';
      document.getElementById('drawer-meta').textContent = kind + ' · ' + id;
      const body = document.getElementById('drawer-body');
      body.innerHTML = '<div class="skeleton" style="height:120px"></div>';
      openDrawer();
      try {
        const r = await getJson('/api/transcript?kind=' + encodeURIComponent(kind) + '&id=' + encodeURIComponent(id));
        if (!r.ok) throw new Error(r.error || 'not found');
        body.innerHTML = renderTranscript(r);
      } catch (e) {
        body.innerHTML = '<div class="empty"><div class="icon">⚠</div><div class="msg">' + escapeHtml(e.message) + '</div></div>';
      }
    }
    function renderTranscript(r){
      if (r.kind === 'mission_task' && r.row) {
        const row = r.row;
        const meta = 'mission: ' + escapeHtml(row.mission || '—')
          + ' · agent: ' + escapeHtml(row.assigned_agent || '—')
          + ' · status: ' + escapeHtml(row.status)
          + ' · started: ' + escapeHtml(fmtTs(row.started_at))
          + ' · completed: ' + escapeHtml(fmtTs(row.completed_at));
        const title = row.title ? '<h4 style="margin:0 0 8px 0;font-size:13.5px">' + escapeHtml(row.title) + '</h4>' : '';
        const src = row.source ? '<div class="muted" style="font-size:11.5px;margin-bottom:10px">source: ' + escapeHtml(row.source) + (row.scheduled_task_id ? ' · scheduled #' + row.scheduled_task_id : '') + '</div>' : '';
        const result = '<pre>' + escapeHtml(row.result || '(no result body)') + '</pre>';
        return title + src + '<div class="muted" style="font-size:11.5px;margin-bottom:10px">' + meta + '</div>' + result;
      }
      if (r.kind === 'conversation' && r.rows) {
        if (!r.rows.length) return '<div class="empty"><div class="msg">No turns in this session yet</div></div>';
        return r.rows.map(t => {
          const cls = t.role === 'user' ? 'turn user' : 'turn assistant';
          return '<div class="' + cls + '"><div class="role">' + escapeHtml(t.role) + ' · ' + escapeHtml(fmtRel(t.created_at)) + '</div><pre>' + escapeHtml(t.content || '') + '</pre></div>';
        }).join('');
      }
      return '<div class="empty"><div class="msg">Nothing to show</div></div>';
    }

    // ───── feed test + connection indicator ─────
    document.getElementById('feed-list').insertAdjacentHTML('beforebegin', '');
    async function sendTestEvent(){
      try {
        await postJson('/api/events/test', {});
        toast('Test event fired', 'ok');
      } catch (e) {
        toast('Test failed: ' + e.message, 'err');
      }
    }

    // wire up feed toolbar — add Test button once at init
    (() => {
      const clearBtn = document.getElementById('feed-clear');
      const testBtn = document.createElement('button');
      testBtn.className = 'btn ghost';
      testBtn.textContent = '⚡ Test';
      testBtn.title = 'Emit a synthetic chat_error to verify the live pipeline';
      testBtn.addEventListener('click', sendTestEvent);
      clearBtn.parentElement.insertBefore(testBtn, clearBtn);
    })();

    // ───── modal infra ─────
    const modalOverlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalSub = document.getElementById('modal-sub');
    const modalBody = document.getElementById('modal-body');
    const modalSubmit = document.getElementById('modal-submit');
    const modalCancel = document.getElementById('modal-cancel');
    let modalHandler = null;

    function openModal({ title, sub, bodyHtml, submitLabel, onSubmit }){
      modalTitle.textContent = title;
      modalSub.textContent = sub || '';
      modalBody.innerHTML = bodyHtml;
      modalSubmit.textContent = submitLabel || 'Submit';
      modalSubmit.disabled = false;
      modalHandler = onSubmit;
      modalOverlay.classList.add('open');
      modalOverlay.setAttribute('aria-hidden','false');
      const firstInput = modalBody.querySelector('input, textarea, select');
      if (firstInput) firstInput.focus();
    }
    function closeModal(){
      modalOverlay.classList.remove('open');
      modalOverlay.setAttribute('aria-hidden','true');
      modalHandler = null;
      modalBody.innerHTML = '';
    }
    modalCancel.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (ev) => { if (ev.target === modalOverlay) closeModal(); });
    modalSubmit.addEventListener('click', async () => {
      if (!modalHandler) return;
      modalSubmit.disabled = true;
      modalSubmit.innerHTML = '<span class="spinner"></span>';
      try {
        const keep = await modalHandler();
        if (!keep) closeModal();
      } catch (e) {
        toast(e.message, 'err');
        modalSubmit.disabled = false;
        modalSubmit.textContent = 'Submit';
      }
    });
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && modalOverlay.classList.contains('open')) closeModal();
      if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter' && modalOverlay.classList.contains('open')) modalSubmit.click();
    });

    // ───── catalogs ─────
    let missionsCatalog = [];
    async function loadCatalog(){
      try {
        const r = await getJson('/api/missions/catalog');
        missionsCatalog = r.missions || [];
      } catch {}
    }
    function missionOptions(selected){
      return missionsCatalog.map(m => {
        const sel = selected === m.id ? ' selected' : '';
        return '<option value="' + escapeHtml(m.id) + '"' + sel + '>' + escapeHtml(m.id) + (m.description ? ' — ' + escapeHtml(m.description.slice(0, 50)) : '') + '</option>';
      }).join('');
    }

    // ───── routine create + edit modal ─────
    function openRoutineModal(existing){
      const isEdit = !!existing;
      const name = existing ? existing.name : '';
      const mission = existing ? existing.mission : (missionsCatalog[0]?.id || '');
      const schedule = existing ? existing.schedule : '0 7 * * *';
      const priority = existing ? existing.priority : 0;
      let argsText = '{}';
      try { if (existing && existing.args) argsText = JSON.stringify(JSON.parse(existing.args), null, 2); } catch {}
      const body = \`
        <div class="field"><label>Name</label>
          <input id="rf-name" value="\${escapeHtml(name)}" placeholder="my-routine" \${isEdit ? 'disabled' : ''} spellcheck="false" />
          <div class="help">Unique slug · lowercase · [a-z0-9_-]{1,64}</div>
          <div class="err">name invalid</div>
        </div>
        <div class="field"><label>Mission</label>
          <select id="rf-mission">\${missionOptions(mission)}</select>
          <div class="err">unknown mission</div>
        </div>
        <div class="field"><label>Cron schedule</label>
          <input id="rf-schedule" value="\${escapeHtml(schedule)}" placeholder="0 7 * * *" spellcheck="false" />
          <div class="help">5-field cron · e.g. "0 7 * * *" for daily 07:00</div>
          <div class="err">invalid cron</div>
        </div>
        <div class="field"><label>Priority</label>
          <input id="rf-priority" type="number" min="0" max="100" value="\${priority}" />
        </div>
        <div class="field"><label>Args (JSON)</label>
          <textarea id="rf-args" spellcheck="false">\${escapeHtml(argsText)}</textarea>
          <div class="err">invalid JSON</div>
        </div>
      \`;
      openModal({
        title: isEdit ? 'Edit routine' : 'New routine',
        sub: isEdit ? 'Editing ' + name : 'Add a custom routine — cron-scheduled, runs server-side.',
        bodyHtml: body,
        submitLabel: isEdit ? 'Save' : 'Create',
        onSubmit: async () => {
          const fields = {
            name: modalBody.querySelector('#rf-name').value.trim(),
            mission: modalBody.querySelector('#rf-mission').value,
            schedule: modalBody.querySelector('#rf-schedule').value.trim(),
            priority: Number.parseInt(modalBody.querySelector('#rf-priority').value, 10) || 0,
            argsRaw: modalBody.querySelector('#rf-args').value.trim() || '{}',
          };
          let args = {};
          try { args = JSON.parse(fields.argsRaw); } catch { markFieldError('rf-args'); return true; }
          clearFieldErrors();
          try {
            if (isEdit) {
              const res = await fetch(withQ('/api/scheduler/' + encodeURIComponent(name)), {
                method: 'PATCH',
                headers: { 'content-type': 'application/json', 'x-dashboard-token': TOKEN },
                body: JSON.stringify({ schedule: fields.schedule, priority: fields.priority, args }),
              });
              const data = await res.json().catch(()=>({}));
              if (!res.ok) throw new Error(data.error || ('edit failed ' + res.status));
              toast('routine ' + name + ' updated', 'ok');
            } else {
              await postJson('/api/scheduler', { name: fields.name, mission: fields.mission, schedule: fields.schedule, priority: fields.priority, args });
              toast('routine ' + fields.name + ' created', 'ok');
            }
            await loadRoutines();
          } catch (e) {
            toast(e.message, 'err');
            return true;
          }
        },
      });
    }
    function markFieldError(id){
      const field = modalBody.querySelector('#' + id)?.closest('.field');
      if (field) field.classList.add('error');
    }
    function clearFieldErrors(){
      modalBody.querySelectorAll('.field.error').forEach(f => f.classList.remove('error'));
    }

    // ───── adhoc mission modal ─────
    function openAdhocModal(){
      const body = \`
        <div class="field"><label>Mission</label>
          <select id="af-mission">\${missionOptions(missionsCatalog[0]?.id)}</select>
        </div>
        <div class="field"><label>Title (optional)</label>
          <input id="af-title" placeholder="manual run" />
        </div>
        <div class="field"><label>Args (JSON)</label>
          <textarea id="af-args" spellcheck="false">{}</textarea>
          <div class="err">invalid JSON</div>
        </div>
      \`;
      openModal({
        title: 'Run ad-hoc mission',
        sub: 'Fire a mission once, without touching the cron schedule.',
        bodyHtml: body,
        submitLabel: 'Run now',
        onSubmit: async () => {
          const mission = modalBody.querySelector('#af-mission').value;
          const title = modalBody.querySelector('#af-title').value.trim() || undefined;
          let args = {};
          try { args = JSON.parse(modalBody.querySelector('#af-args').value.trim() || '{}'); } catch { markFieldError('af-args'); return true; }
          clearFieldErrors();
          try {
            const r = await postJson('/api/missions/adhoc', { mission, args, title });
            toast('mission queued as #' + r.mission_task_id, 'ok');
            await loadMissions();
          } catch (e) {
            toast(e.message, 'err');
            return true;
          }
        },
      });
    }

    document.getElementById('routines-new').addEventListener('click', () => openRoutineModal(null));
    document.getElementById('missions-adhoc').addEventListener('click', () => openAdhocModal());

    // ───── capture ─────
    let captureKinds = [];
    let activeKind = null;
    async function loadCaptureKinds(){
      try {
        const r = await getJson('/api/capture/kinds');
        captureKinds = r.kinds || [];
        renderCaptureKinds();
      } catch (e) {
        document.getElementById('capture-kinds').innerHTML = '<div class="muted">Failed to load capture kinds</div>';
      }
    }
    function renderCaptureKinds(){
      const wrap = document.getElementById('capture-kinds');
      wrap.innerHTML = '<button class="kind-btn' + (activeKind === null ? ' active' : '') + '" data-kind="">' +
        '<span class="emoji">✨</span>Auto' +
        '</button>' +
        captureKinds.map(k =>
          '<button class="kind-btn' + (activeKind === k.id ? ' active' : '') + '" data-kind="' + escapeHtml(k.id) + '" title="' + escapeHtml(k.description || '') + '">' +
          '<span class="emoji">' + escapeHtml(k.emoji || '•') + '</span>' +
          escapeHtml(k.label || k.id) +
          '</button>'
        ).join('');
      wrap.querySelectorAll('.kind-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          activeKind = btn.dataset.kind || null;
          const needsTitle = activeKind === 'task' || activeKind === 'literature' || activeKind === 'thesis';
          document.getElementById('capture-title-wrap').style.display = needsTitle ? 'block' : 'none';
          renderCaptureKinds();
        });
      });
    }
    async function submitCapture(){
      const text = document.getElementById('capture-text').value.trim();
      if (!text) { toast('Nothing to capture', 'info'); return; }
      const title = document.getElementById('capture-title').value.trim() || undefined;
      const resultWrap = document.getElementById('capture-result');
      const btn = document.getElementById('capture-send');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Sending';
      try {
        const r = await postJson('/api/capture', { text, kind: activeKind || undefined, title });
        toast('captured as ' + r.kind, 'ok');
        resultWrap.innerHTML =
          '<div class="card" style="padding:10px 12px;background:var(--bg-2);border-left:2px solid var(--ok)">' +
          '<div class="muted" style="font-size:11.5px;margin-bottom:4px">' + escapeHtml(r.kind) + ' · ' + escapeHtml(fmtClock(Date.now())) + '</div>' +
          (r.summary ? '<div>' + escapeHtml(r.summary) + '</div>' : '') +
          (r.ref?.vault_path ? '<div class="muted" style="font-size:11.5px;margin-top:4px">→ ' + escapeHtml(r.ref.vault_path) + '</div>' : '') +
          '</div>';
        document.getElementById('capture-text').value = '';
      } catch (e) {
        toast('capture failed: ' + e.message, 'err');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Capture';
      }
    }
    document.getElementById('capture-send').addEventListener('click', submitCapture);
    document.getElementById('capture-clear').addEventListener('click', () => {
      document.getElementById('capture-text').value = '';
      document.getElementById('capture-title').value = '';
      document.getElementById('capture-result').innerHTML = '';
    });
    document.getElementById('capture-text').addEventListener('keydown', (ev) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') { ev.preventDefault(); submitCapture(); }
    });

    // ───── logout ─────
    document.getElementById('logout-btn').addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' } });
      } catch {}
      location.href = '/';
    });

    // ───── boot ─────
    async function boot(){
      await loadCatalog();
      const hash = location.hash.replace('#','');
      if (hash && TABS[hash]) switchTab(hash);
      else switchTab('pulse');
      await pollHeartbeat();
      setInterval(pollHeartbeat, 5000);
      await globalPoll();
      setInterval(globalPoll, 5000);
      ensureFeed();
      window.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && drawerEl.classList.contains('open')) closeDrawer();
      });
    }
    boot();
  </script>
</body>
</html>`;
}
//# sourceMappingURL=dashboard-html.js.map