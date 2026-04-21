export function dashboardHtml(token) {
    // The dashboard is a single static HTML blob with vanilla JS. Token is injected
    // so xhr/SSE can re-authenticate with ?token=… without the user re-typing it.
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Howl PA</title>
  <style>
    :root { --bg:#0e0f13; --panel:#15171c; --panel2:#1b1e25; --muted:#8a8f9a; --fg:#eef1f5; --accent:#7cc5ff; --accent2:#b389ff; --danger:#ff9a8a; --ok:#8ad48a; }
    *{box-sizing:border-box}
    body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}
    header{display:flex;justify-content:space-between;align-items:center;padding:14px 22px;border-bottom:1px solid #21252c;background:var(--panel);position:sticky;top:0;z-index:10;}
    header h1{margin:0;font-size:15px;letter-spacing:.04em;text-transform:uppercase;}
    header .meta{color:var(--muted);font-size:12px}
    nav{display:flex;gap:2px;padding:0 22px;background:var(--panel);border-bottom:1px solid #21252c;overflow-x:auto}
    nav button{background:none;border:none;color:var(--muted);padding:10px 14px;font-family:inherit;font-size:13px;cursor:pointer;border-bottom:2px solid transparent}
    nav button:hover{color:var(--fg)}
    nav button.active{color:var(--accent);border-bottom-color:var(--accent)}
    main{padding:22px;max-width:1400px;margin:0 auto}
    section{display:none}
    section.active{display:block}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-bottom:16px}
    .card{background:var(--panel);border:1px solid #21252c;border-radius:8px;padding:14px}
    .card h3{margin:0 0 6px 0;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em}
    .card .n{font-size:26px;font-weight:600}
    table{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--panel);border-radius:8px;overflow:hidden}
    th{text-align:left;padding:8px 10px;color:var(--muted);background:var(--panel2);font-weight:500;text-transform:uppercase;letter-spacing:.06em;font-size:11px}
    td{padding:8px 10px;border-top:1px solid #21252c;vertical-align:top}
    td.mono{font-family:inherit;font-size:12px;color:var(--muted)}
    td.ok{color:var(--ok)} td.bad{color:var(--danger)}
    code{background:#1b1e25;padding:1px 6px;border-radius:3px;font-size:12px}
    .pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;background:#2a2f38;color:var(--muted)}
    .pill.active{background:var(--ok);color:#0e0f13}
    .pill.paused{background:#444;color:#ccc}
    .pill.stuck{background:var(--danger);color:#0e0f13}
    .pill.running{background:var(--accent);color:#0e0f13}
    .pill.done{background:var(--ok);color:#0e0f13}
    .pill.failed{background:var(--danger);color:#0e0f13}
    .pill.error{background:var(--danger);color:#0e0f13}
    .pill.partial{background:#d4b35a;color:#0e0f13}
    .pill.ok{background:var(--ok);color:#0e0f13}
    .feed{background:var(--panel);border:1px solid #21252c;border-radius:8px;padding:10px;max-height:260px;overflow-y:auto;font-size:12.5px}
    .feed div{padding:4px 0;border-bottom:1px dashed #21252c}
    .feed .name{color:var(--accent);font-weight:600}
    .muted{color:var(--muted)}
    .truncate{max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .hint{color:var(--muted);font-size:12px;margin-bottom:10px}
    .right{text-align:right}
  </style>
</head>
<body>
  <header>
    <h1>Howl PA</h1>
    <div class="meta" id="meta">loading…</div>
  </header>
  <nav id="nav">
    <button data-tab="overview" class="active">Overview</button>
    <button data-tab="scheduler">Scheduler</button>
    <button data-tab="missions">Missions</button>
    <button data-tab="memories">Memories</button>
    <button data-tab="gmail">Gmail</button>
    <button data-tab="calendar">Calendar</button>
    <button data-tab="tasks">Tasks</button>
    <button data-tab="subagents">Subagents</button>
    <button data-tab="roles">Routing</button>
    <button data-tab="audit">Audit</button>
    <button data-tab="live">Live</button>
  </nav>
  <main>
    <section id="overview" class="active">
      <div class="grid" id="overview-cards"></div>
      <h3 class="muted" style="margin-top:20px">Recent token usage</h3>
      <table id="recent-tokens"></table>
    </section>
    <section id="scheduler">
      <div class="hint">All scheduled tasks. <code>active</code> means next_run is honored.</div>
      <table id="sched-table"></table>
    </section>
    <section id="missions">
      <div class="hint">Mission queue — ad-hoc + cron-dispatched work.</div>
      <table id="mission-table"></table>
    </section>
    <section id="memories">
      <div class="hint">Recent chunks indexed into the vector store.</div>
      <table id="memory-table"></table>
    </section>
    <section id="gmail">
      <div class="hint">Last 50 ingested messages, scored by LLM importance (higher = more urgent).</div>
      <table id="gmail-table"></table>
    </section>
    <section id="calendar">
      <div class="hint">Events from the last 6 hours through the next 48 (change with ?hours=N on /api/calendar).</div>
      <table id="calendar-table"></table>
    </section>
    <section id="tasks">
      <div class="hint">Google Tasks — local queue + synced. needs_push rows are waiting for OAuth to land.</div>
      <table id="tasks-table"></table>
    </section>
    <section id="subagents">
      <div class="hint">Per-run telemetry for Claude / Codex / Ollama dispatches.</div>
      <table id="subagent-table"></table>
    </section>
    <section id="roles">
      <div class="hint">Routing by inferred role (codex-corps taxonomy). Rolling 7-day window.</div>
      <table id="role-table"></table>
    </section>
    <section id="audit">
      <div class="hint">All events written to the audit log.</div>
      <table id="audit-table"></table>
    </section>
    <section id="live">
      <div class="hint">Server-sent events stream. Updates in real time while this tab is open.</div>
      <div class="feed" id="live-feed"></div>
    </section>
  </main>
  <script>
    const TOKEN = ${JSON.stringify(token)};
    const qs = '?token=' + encodeURIComponent(TOKEN);

    async function j(url){ const r = await fetch(url + qs); if(!r.ok) throw new Error(url+' '+r.status); return r.json(); }

    function el(t, props, ...kids){
      const n = document.createElement(t);
      if (props) for (const k in props) {
        if (k === 'className') n.className = props[k];
        else if (k === 'html') n.innerHTML = props[k];
        else n.setAttribute(k, props[k]);
      }
      for (const kid of kids) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
      return n;
    }

    function pill(v){ return '<span class="pill '+v+'">'+v+'</span>'; }

    function fmtTs(ms){ if(!ms) return '—'; const d=new Date(ms); return d.toLocaleString(); }
    function fmtRel(ms){ if(!ms) return '—'; const s=(Date.now()-ms)/1000; if(s<60) return Math.round(s)+'s ago'; if(s<3600) return Math.round(s/60)+'m ago'; if(s<86400) return Math.round(s/3600)+'h ago'; return Math.round(s/86400)+'d ago'; }

    function tableHtml(headers, rows, rowFn){
      const thead = '<thead><tr>' + headers.map(h=>'<th>'+h+'</th>').join('') + '</tr></thead>';
      const tbody = '<tbody>' + rows.map(rowFn).join('') + '</tbody>';
      return thead + tbody;
    }

    async function loadOverview(){
      const [h, t] = await Promise.all([j('/api/health'), j('/api/tokens')]);
      document.getElementById('meta').textContent = 'pid ' + h.pid + ' · up ' + Math.floor(h.uptime_s/60) + 'm · ' + fmtTs(Date.now());
      const cards = document.getElementById('overview-cards');
      cards.innerHTML = '';
      const mk = (label, n) => cards.appendChild(el('div',{className:'card'}, el('h3',null,label), el('div',{className:'n'}, String(n))));
      mk('Conversation rows', h.convo_rows);
      mk('Memory chunks', h.memory_chunks);
      mk('Audit rows', h.audit_rows);
      mk('Tokens (24h)', t.today);
      mk('Backends (7d)', t.byBackend.length);
      mk('Uptime', Math.floor(h.uptime_s/60) + 'm');
      const recent = document.getElementById('recent-tokens');
      recent.innerHTML = tableHtml(
        ['When','Backend','Model','In','Out','Dur'],
        t.recent,
        r => '<tr><td class="mono">'+fmtRel(r.created_at)+'</td><td>'+r.backend+'</td><td class="mono">'+(r.model||'—')+'</td><td class="right">'+r.input_tokens+'</td><td class="right">'+r.output_tokens+'</td><td class="right">'+(r.duration_ms||0)+'ms</td></tr>'
      );
    }
    async function loadSched(){
      const { rows } = await j('/api/scheduler');
      document.getElementById('sched-table').innerHTML = tableHtml(
        ['Name','Mission','Schedule','Next','Last','Result','Prio','Status'],
        rows,
        r => '<tr><td>'+r.name+'</td><td class="mono">'+r.mission+'</td><td class="mono">'+r.schedule+'</td><td class="mono">'+fmtTs(r.next_run)+'</td><td class="mono">'+fmtRel(r.last_run)+'</td><td class="mono truncate">'+(r.last_result||'—')+'</td><td class="right">'+r.priority+'</td><td>'+pill(r.status)+'</td></tr>'
      );
    }
    async function loadMissions(){
      const { rows } = await j('/api/missions');
      document.getElementById('mission-table').innerHTML = tableHtml(
        ['ID','Title','Mission','Agent','Status','Started','Result'],
        rows,
        r => '<tr><td class="mono">'+r.id+'</td><td>'+r.title+'</td><td class="mono">'+(r.mission||'—')+'</td><td>'+r.assigned_agent+'</td><td>'+pill(r.status)+'</td><td class="mono">'+fmtRel(r.started_at)+'</td><td class="truncate">'+(r.result||'—')+'</td></tr>'
      );
    }
    async function loadMemory(){
      const { rows } = await j('/api/memories');
      document.getElementById('memory-table').innerHTML = tableHtml(
        ['Kind','Ref','Idx','Preview','mtime','Created'],
        rows,
        r => '<tr><td>'+r.source_kind+'</td><td class="mono truncate">'+r.source_ref+'</td><td class="right">'+r.chunk_idx+'</td><td class="truncate">'+(r.preview||'').replace(/[<>]/g, m=>({ '<':'&lt;','>':'&gt;' }[m]))+'</td><td class="mono">'+fmtRel(r.mtime)+'</td><td class="mono">'+fmtRel(r.created_at)+'</td></tr>'
      );
    }
    async function loadGmail(){
      const { rows } = await j('/api/gmail');
      document.getElementById('gmail-table').innerHTML = tableHtml(
        ['When','Sender','Subject','Snippet','Imp','Unread'],
        rows,
        r => {
          const imp = r.importance != null ? r.importance : '—';
          const unread = r.unread ? 'YES' : '';
          const subj = (r.subject||'').replace(/[<>]/g, m=>({ '<':'&lt;','>':'&gt;' }[m]));
          const snip = (r.snippet||'').slice(0,140).replace(/[<>]/g, m=>({ '<':'&lt;','>':'&gt;' }[m]));
          return '<tr><td class="mono">'+fmtRel(r.internal_date)+'</td><td class="mono truncate">'+(r.sender||'—')+'</td><td class="truncate">'+subj+'</td><td class="truncate muted">'+snip+'</td><td class="right">'+imp+'</td><td class="'+(r.unread?'bad':'muted')+'">'+unread+'</td></tr>';
        }
      );
    }
    async function loadCalendar(){
      const { rows } = await j('/api/calendar');
      document.getElementById('calendar-table').innerHTML = tableHtml(
        ['Starts','Ends','Summary','Location','Meet','Attendees'],
        rows,
        r => {
          const summ = (r.summary||'(no title)').replace(/[<>]/g, m=>({ '<':'&lt;','>':'&gt;' }[m]));
          const meet = r.meet_link ? '<a href="'+r.meet_link+'" target="_blank">join</a>' : '—';
          const att = r.attendees ? String(r.attendees).split(',').length : 0;
          return '<tr><td class="mono">'+fmtTs(r.starts_at)+'</td><td class="mono">'+fmtTs(r.ends_at)+'</td><td>'+summ+'</td><td class="muted truncate">'+(r.location||'—')+'</td><td class="mono">'+meet+'</td><td class="right">'+att+'</td></tr>';
        }
      );
    }
    async function loadTasks(){
      const { rows } = await j('/api/tasks');
      document.getElementById('tasks-table').innerHTML = tableHtml(
        ['Status','Title','Due','Imp','List','Updated'],
        rows,
        r => {
          const title = (r.title||'').replace(/[<>]/g, m=>({ '<':'&lt;','>':'&gt;' }[m]));
          const imp = r.importance != null ? r.importance : '—';
          return '<tr><td>'+pill(r.status)+'</td><td>'+title+'</td><td class="mono">'+fmtTs(r.due_ts)+'</td><td class="right">'+imp+'</td><td class="mono muted">'+(r.list_id||'—')+'</td><td class="mono">'+fmtRel(r.updated_at)+'</td></tr>';
        }
      );
    }
    async function loadSubagents(){
      const { rows } = await j('/api/subagents');
      document.getElementById('subagent-table').innerHTML = tableHtml(
        ['When','Mode','Role','Backend','Judge','Dur','Out','Outcome','Preview'],
        rows,
        r => '<tr><td class="mono">'+fmtRel(r.created_at)+'</td><td>'+r.mode+'</td><td class="mono">'+(r.role||'—')+'</td><td class="mono">'+r.backend+'</td><td class="mono">'+(r.judge||'—')+'</td><td class="right">'+(r.duration_ms||0)+'ms</td><td class="right">'+(r.output_tokens||'—')+'</td><td>'+pill(r.outcome)+'</td><td class="truncate">'+(r.prompt_preview||'')+'</td></tr>'
      );
    }
    async function loadRoles(){
      const { rows, hours } = await j('/api/roles?hours=168');
      document.getElementById('role-table').innerHTML = tableHtml(
        ['Role','Runs','OK','Err','OK %','Avg ms'],
        rows,
        r => {
          const pct = r.n > 0 ? Math.round((r.ok / r.n) * 100) : 0;
          const avg = r.avg_ms != null ? Math.round(r.avg_ms) : '—';
          return '<tr><td class="mono">'+r.role+'</td><td class="right">'+r.n+'</td><td class="right ok">'+r.ok+'</td><td class="right bad">'+r.err+'</td><td class="right">'+pct+'%</td><td class="right mono">'+avg+'</td></tr>';
        }
      );
    }
    async function loadAudit(){
      const { rows } = await j('/api/audit');
      document.getElementById('audit-table').innerHTML = tableHtml(
        ['When','Event','Detail','Blocked','Chat','Agent'],
        rows,
        r => '<tr><td class="mono">'+fmtRel(r.created_at)+'</td><td><span class="pill '+(r.blocked?'error':'')+'">'+r.event_type+'</span></td><td class="truncate">'+(r.detail||'')+'</td><td class="'+(r.blocked?'bad':'ok')+'">'+(r.blocked?'YES':'no')+'</td><td class="mono">'+(r.chat_id||'—')+'</td><td class="mono">'+r.agent_id+'</td></tr>'
      );
    }
    function startLive(){
      const feed = document.getElementById('live-feed');
      const es = new EventSource('/api/events' + qs);
      ['session_start','message_received','agent_started','agent_completed','chat_error','session_end','ping'].forEach(name => {
        es.addEventListener(name, (ev) => {
          const data = (() => { try { return JSON.parse(ev.data); } catch { return ev.data; } })();
          const line = document.createElement('div');
          const t = new Date().toLocaleTimeString();
          line.innerHTML = '<span class="muted">['+t+']</span> <span class="name">'+name+'</span> <span class="muted">'+JSON.stringify(data).slice(0,200)+'</span>';
          feed.prepend(line);
          while (feed.children.length > 120) feed.removeChild(feed.lastChild);
        });
      });
    }

    const TABS = {
      overview: loadOverview,
      scheduler: loadSched,
      missions: loadMissions,
      memories: loadMemory,
      gmail: loadGmail,
      calendar: loadCalendar,
      tasks: loadTasks,
      subagents: loadSubagents,
      roles: loadRoles,
      audit: loadAudit,
      live: startLive,
    };

    document.getElementById('nav').addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-tab]');
      if (!btn) return;
      const tab = btn.dataset.tab;
      document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('main > section').forEach(s => s.classList.toggle('active', s.id === tab));
      (TABS[tab] || (() => {}))();
    });

    loadOverview();
    setInterval(() => {
      const active = document.querySelector('nav button.active')?.dataset?.tab;
      if (active && active !== 'live') (TABS[active] || (() => {}))();
    }, 15000);
  </script>
</body>
</html>`;
}
//# sourceMappingURL=dashboard-html.js.map