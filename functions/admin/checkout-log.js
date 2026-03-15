// Cloudflare Pages Function: GET /admin/checkout-log
// Serves a protected panel to view checkout captures stored in KV.
// Auth: HTTP Basic (Secrets: PIX_ADMIN_USER / PIX_ADMIN_PASS)

function unauthorized() {
  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'cache-control': 'no-store, max-age=0',
      'www-authenticate': 'Basic realm="PIX Admin", charset="UTF-8"',
    },
  });
}

function checkBasicAuth(request, env) {
  const user = env.PIX_ADMIN_USER;
  const pass = env.PIX_ADMIN_PASS;
  if (!user || !pass) return false;

  const auth = request.headers.get('authorization') || '';
  const m = auth.match(/^Basic\s+(.+)$/i);
  if (!m) return false;

  let decoded = '';
  try {
    decoded = atob(m[1]);
  } catch {
    return false;
  }

  const i = decoded.indexOf(':');
  if (i < 0) return false;

  const gotUser = decoded.slice(0, i);
  const gotPass = decoded.slice(i + 1);
  return gotUser === user && gotPass === pass;
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
    },
  });
}

export async function onRequestGet(context) {
  if (!checkBasicAuth(context.request, context.env)) return unauthorized();

  return html(`<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Painel - Capturas do Checkout</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; background: #0b1220; color: #e5e7eb; }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 28px 18px 60px; }
    .topbar { display:flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
    h1 { margin: 0; font-size: 22px; }
    .pill { font-size: 12px; padding: 6px 10px; border-radius: 999px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.10); }
    .card { background: #111a2e; border: 1px solid rgba(255,255,255,.08); border-radius: 16px; padding: 14px; box-shadow: 0 20px 50px rgba(0,0,0,.35); }
    .toolbar { display:flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 10px; }
    input, select, button { border-radius: 12px; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); color: #e5e7eb; padding: 10px 12px; outline: none; }
    button { cursor: pointer; font-weight: 800; }
    button.primary { background: #22c55e; color: #052e14; border: 0; }
    button.ghost { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.12); }
    .hint { font-size: 12px; opacity: .85; }
    .err { color: #fb7185; }
    .ok { color: #34d399; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; overflow: hidden; border-radius: 14px; }
    th, td { text-align: left; padding: 10px 10px; border-bottom: 1px solid rgba(255,255,255,.08); vertical-align: top; }
    th { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; opacity: .9; background: rgba(255,255,255,.06); position: sticky; top: 0; }
    tr:hover td { background: rgba(255,255,255,.03); }
    code { background: rgba(255,255,255,.08); padding: 2px 6px; border-radius: 8px; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    details { margin-top: 6px; }
    summary { cursor: pointer; opacity: .95; }
    .row2 { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 780px) { .row2 { grid-template-columns: 1fr; } th:nth-child(4), td:nth-child(4) { display:none; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="topbar">
      <h1>📋 Capturas do Checkout</h1>
      <div class="pill">KV • /api/checkout-log</div>
    </div>

    <div class="card">
      <div class="row2">
        <div>
          <div class="hint">Este painel mostra o que foi capturado no checkout (com data/hora e metadados do servidor). Se estiver vazio, faça 1 teste no checkout e atualize aqui.</div>
          <div class="hint" style="margin-top:8px">Última atualização: <span id="updated">—</span></div>
        </div>
        <div class="toolbar">
          <input id="q" placeholder="Filtrar (nome, email, order_id, evento…)" style="flex:1 1 240px" />
          <select id="limit">
            <option value="50">50</option>
            <option value="80" selected>80</option>
            <option value="120">120</option>
            <option value="200">200</option>
          </select>
          <button class="primary" id="reload">Atualizar</button>
          <button class="ghost" id="export">Exportar JSON</button>
        </div>
      </div>

      <div id="status" class="hint" style="margin-top:10px">Carregando…</div>

      <div style="overflow:auto; margin-top: 10px; max-height: 72vh;">
        <table>
          <thead>
            <tr>
              <th style="min-width: 170px;">Data/Hora (SP)</th>
              <th style="min-width: 140px;">Evento</th>
              <th style="min-width: 180px;">Cliente</th>
              <th style="min-width: 260px;">Order / Path</th>
              <th style="min-width: 260px;">Detalhes</th>
            </tr>
          </thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
    </div>
  </div>

<script>
  const TZ = 'America/Sao_Paulo';
  const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' });

  const $ = (id) => document.getElementById(id);
  const statusEl = $('status');
  const rowsEl = $('rows');
  const updatedEl = $('updated');
  const qEl = $('q');
  const limitEl = $('limit');

  let lastItems = [];

  function toSP(iso) {
    try {
      const d = new Date(iso);
      if (!isFinite(d.getTime())) return '—';
      return fmt.format(d);
    } catch { return '—'; }
  }

  function safe(v) {
    if (v === null || v === undefined) return '';
    return String(v);
  }

  function matchQuery(item, q) {
    if (!q) return true;
    q = q.toLowerCase();
    const hay = [
      item.event, item.order_id, item.name, item.email, item.phone, item.path, item.href,
      item.city, item.state, item.ip
    ].map(safe).join(' ').toLowerCase();
    return hay.includes(q);
  }

  function render(items) {
    const q = (qEl.value || '').trim();
    const filtered = items.filter(it => matchQuery(it, q));

    rowsEl.innerHTML = filtered.map(it => {
      const when = toSP(it.received_at || it.ts || it.created_at);
      const ev = safe(it.event || it.type || it.action || '—');
      const who = [it.name, it.email, it.phone].filter(Boolean).join(' • ') || '—';
      const order = [it.order_id || it.transactionId || it.orderId || '—', it.path || ''].filter(Boolean).join('  ');
      const loc = [it.city, it.state].filter(Boolean).join('/') || '';
      const meta = [it.ip ? ('IP ' + it.ip) : '', it.ua ? ('UA ' + it.ua) : ''].filter(Boolean).join(' • ');

      const details = JSON.stringify(it, null, 2);

      return \`
        <tr>
          <td class="mono">\${when}</td>
          <td><code>\${ev}</code></td>
          <td>
            <div>\${safe(who)}</div>
            <div class="hint">\${safe(loc)}</div>
          </td>
          <td class="mono">\${safe(order)}</td>
          <td>
            <div class="hint">\${safe(meta)}</div>
            <details>
              <summary class="hint">Ver JSON</summary>
              <pre class="mono" style="white-space: pre-wrap; word-break: break-word; margin: 8px 0 0;">\${details.replace(/[&<>]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]))}</pre>
            </details>
          </td>
        </tr>
      \`;
    }).join('');

    statusEl.innerHTML = \`<span class="ok">OK</span> • Mostrando \${filtered.length} de \${items.length}\`;
  }

  async function load() {
    const limit = limitEl.value || '80';
    statusEl.textContent = 'Carregando…';
    try {
      const res = await fetch('/api/checkout-log?limit=' + encodeURIComponent(limit) + '&_=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!data || !data.ok) throw new Error('Resposta inválida');
      lastItems = Array.isArray(data.items) ? data.items : [];
      updatedEl.textContent = toSP(data.updated_at);
      render(lastItems);
    } catch(e) {
      statusEl.innerHTML = '<span class="err">Erro</span> • ' + (e && e.message ? e.message : 'falha ao carregar');
      rowsEl.innerHTML = '';
    }
  }

  $('reload').addEventListener('click', () => load());
  qEl.addEventListener('input', () => render(lastItems));
  limitEl.addEventListener('change', () => load());

  $('export').addEventListener('click', () => {
    try {
      const blob = new Blob([JSON.stringify(lastItems, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'checkout-log.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch(e) {}
  });

  load();
</script>
</body>
</html>`);
}
