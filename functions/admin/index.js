// Cloudflare Pages Function: GET /admin
// Serves the PIX Panel behind HTTP Basic Auth.
// Secrets required: PIX_ADMIN_USER, PIX_ADMIN_PASS

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
<html lang=”pt-br”>
<head>
  <meta charset=”utf-8” />
  <meta name=”viewport” content=”width=device-width, initial-scale=1” />
  <title>Izzat — Painel Admin</title>
  <link rel=”preconnect” href=”https://fonts.googleapis.com”/>
  <link rel=”preconnect” href=”https://fonts.gstatic.com” crossorigin/>
  <link href=”https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap” rel=”stylesheet”/>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Inter',system-ui,-apple-system,sans-serif; background:#f8fafc; color:#1e293b; min-height:100vh; }
    .sidebar { position:fixed; left:0; top:0; bottom:0; width:240px; background:#0f172a; color:#e2e8f0; padding:24px 0; display:flex; flex-direction:column; z-index:10; }
    .sidebar-logo { padding:0 20px 24px; border-bottom:1px solid rgba(255,255,255,.06); }
    .sidebar-logo h2 { font-size:18px; font-weight:800; color:#fff; }
    .sidebar-logo span { font-size:11px; color:#64748b; font-weight:500; }
    .sidebar-nav { padding:16px 12px; flex:1; display:flex; flex-direction:column; gap:2px; }
    .nav-item { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:8px; font-size:13px; font-weight:500; color:#94a3b8; cursor:pointer; transition:all .15s; text-decoration:none; }
    .nav-item:hover { background:rgba(255,255,255,.05); color:#e2e8f0; }
    .nav-item.active { background:rgba(34,197,94,.12); color:#22c55e; }
    .nav-icon { width:18px; height:18px; opacity:.7; }
    .main { margin-left:240px; padding:28px 32px 60px; }
    .page-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:28px; }
    .page-header h1 { font-size:24px; font-weight:800; color:#0f172a; }
    .stats-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:16px; margin-bottom:28px; }
    .stat-card { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:20px; }
    .stat-label { font-size:12px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:.5px; margin-bottom:8px; }
    .stat-value { font-size:28px; font-weight:800; color:#0f172a; line-height:1; }
    .stat-value.green { color:#16a34a; }
    .stat-value.blue { color:#2563eb; }
    .card { background:#fff; border:1px solid #e2e8f0; border-radius:12px; margin-bottom:20px; }
    .card-header { padding:16px 20px; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; }
    .card-title { font-size:15px; font-weight:700; color:#0f172a; }
    .card-body { padding:20px; }
    label { display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:6px; text-transform:uppercase; letter-spacing:.3px; }
    input, textarea { width:100%; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; font-size:13px; font-family:inherit; color:#1e293b; background:#f8fafc; outline:none; transition:border .15s; }
    input:focus, textarea:focus { border-color:#22c55e; box-shadow:0 0 0 3px rgba(34,197,94,.1); }
    textarea { min-height:100px; resize:vertical; font-family:'SF Mono',Monaco,monospace; font-size:12px; }
    .btn { border:0; border-radius:8px; padding:10px 18px; font-weight:600; font-size:13px; cursor:pointer; transition:all .15s; font-family:inherit; display:inline-flex; align-items:center; gap:6px; }
    .btn-primary { background:#16a34a; color:#fff; }
    .btn-primary:hover { background:#15803d; }
    .btn-ghost { background:#f1f5f9; color:#475569; }
    .btn-ghost:hover { background:#e2e8f0; }
    .btn-sm { padding:6px 12px; font-size:12px; }
    .status-dot { width:8px; height:8px; border-radius:50%; display:inline-block; }
    .status-dot.green { background:#22c55e; }
    .status-dot.yellow { background:#eab308; }
    .badge { display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:600; padding:3px 8px; border-radius:6px; }
    .badge-green { background:#dcfce7; color:#166534; }
    .badge-yellow { background:#fef9c3; color:#854d0e; }
    .badge-gray { background:#f1f5f9; color:#475569; }
    #statusMsg { font-size:12px; margin-top:8px; font-weight:500; }
    .ok { color:#16a34a; }
    .err { color:#ef4444; }
    .row { display:flex; gap:12px; flex-wrap:wrap; }
    .row > div { flex:1 1 200px; }
    .chk-label { display:flex; align-items:center; gap:8px; font-size:13px; margin-top:12px; text-transform:none; letter-spacing:0; font-weight:500; color:#64748b; }
    .chk-label input { width:auto; }
    .orders-table { width:100%; border-collapse:collapse; font-size:13px; }
    .orders-table th { text-align:left; padding:10px 12px; font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:.5px; background:#f8fafc; border-bottom:1px solid #e2e8f0; }
    .orders-table td { padding:10px 12px; border-bottom:1px solid #f1f5f9; vertical-align:top; }
    .orders-table tr:hover td { background:#f8fafc; }
    .order-name { font-weight:600; color:#0f172a; }
    .order-detail { font-size:11px; color:#64748b; line-height:1.5; }
    .empty-state { text-align:center; padding:40px 20px; color:#94a3b8; }
    .empty-state p { font-size:14px; }
    .tabs { display:flex; gap:0; border-bottom:2px solid #e2e8f0; margin-bottom:0; }
    .tab { padding:12px 20px; font-size:13px; font-weight:600; color:#64748b; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-2px; transition:all .15s; }
    .tab:hover { color:#1e293b; }
    .tab.active { color:#16a34a; border-bottom-color:#16a34a; }
    .tab-content { display:none; }
    .tab-content.active { display:block; }
    @media (max-width:768px) {
      .sidebar { display:none; }
      .main { margin-left:0; padding:16px; }
      .stats-grid { grid-template-columns:1fr 1fr; }
      .orders-table { font-size:12px; }
      .orders-table th, .orders-table td { padding:8px 6px; }
    }
  </style>
</head>
<body>

  <div class=”sidebar”>
    <div class=”sidebar-logo”>
      <h2>Izzat</h2>
      <span>Painel Administrativo</span>
    </div>
    <nav class=”sidebar-nav”>
      <a class=”nav-item active” onclick=”showSection('dashboard')”>
        <svg class=”nav-icon” viewBox=”0 0 24 24” fill=”none” stroke=”currentColor” stroke-width=”2”><rect x=”3” y=”3” width=”7” height=”7” rx=”1”/><rect x=”14” y=”3” width=”7” height=”7” rx=”1”/><rect x=”3” y=”14” width=”7” height=”7” rx=”1”/><rect x=”14” y=”14” width=”7” height=”7” rx=”1”/></svg>
        Dashboard
      </a>
      <a class=”nav-item” onclick=”showSection('orders')”>
        <svg class=”nav-icon” viewBox=”0 0 24 24” fill=”none” stroke=”currentColor” stroke-width=”2”><path d=”M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z”/><line x1=”3” y1=”6” x2=”21” y2=”6”/><path d=”M16 10a4 4 0 01-8 0”/></svg>
        Pedidos
      </a>
      <a class=”nav-item” onclick=”showSection('pix')”>
        <svg class=”nav-icon” viewBox=”0 0 24 24” fill=”none” stroke=”currentColor” stroke-width=”2”><rect x=”2” y=”5” width=”20” height=”14” rx=”2”/><line x1=”2” y1=”10” x2=”22” y2=”10”/></svg>
        Config PIX
      </a>
    </nav>
  </div>

  <div class=”main”>

    <!-- DASHBOARD SECTION -->
    <div id=”sec-dashboard” class=”section”>
      <div class=”page-header”>
        <h1>Dashboard</h1>
        <span class=”badge badge-green”><span class=”status-dot green”></span> Online</span>
      </div>

      <div class=”stats-grid”>
        <div class=”stat-card”>
          <div class=”stat-label”>Visitantes Online</div>
          <div class=”stat-value blue” id=”onlineNow”>0</div>
        </div>
        <div class=”stat-card”>
          <div class=”stat-label”>Copias PIX</div>
          <div class=”stat-value green” id=”pixClicks”>0</div>
        </div>
        <div class=”stat-card”>
          <div class=”stat-label”>Pedidos Hoje</div>
          <div class=”stat-value” id=”ordersToday”>0</div>
        </div>
        <div class=”stat-card”>
          <div class=”stat-label”>Total Pedidos</div>
          <div class=”stat-value” id=”ordersTotal”>0</div>
        </div>
      </div>

      <!-- Recent orders preview -->
      <div class=”card”>
        <div class=”card-header”>
          <span class=”card-title”>Pedidos Recentes</span>
          <button class=”btn btn-ghost btn-sm” onclick=”showSection('orders')”>Ver todos</button>
        </div>
        <div id=”recentOrdersBody”>
          <div class=”empty-state”><p>Carregando...</p></div>
        </div>
      </div>
    </div>

    <!-- ORDERS SECTION -->
    <div id=”sec-orders” class=”section” style=”display:none”>
      <div class=”page-header”>
        <h1>Pedidos</h1>
        <button class=”btn btn-ghost btn-sm” onclick=”loadOrders()”>Atualizar</button>
      </div>
      <div class=”card”>
        <div id=”ordersBody”>
          <div class=”empty-state”><p>Carregando...</p></div>
        </div>
      </div>
    </div>

    <!-- PIX CONFIG SECTION -->
    <div id=”sec-pix” class=”section” style=”display:none”>
      <div class=”page-header”>
        <h1>Configuracao PIX</h1>
        <div id=”statusMsg”></div>
      </div>

      <div class=”card”>
        <div class=”card-header”>
          <span class=”card-title”>PIX Copia e Cola</span>
          <span class=”badge badge-gray”>Ultima atualizacao: <span id=”updated”>-</span></span>
        </div>
        <div class=”card-body”>
          <label>Codigo PIX</label>
          <textarea id=”pix” placeholder=”Cole aqui o codigo PIX Copia e Cola...”></textarea>

          <div style=”margin-top:16px”>
            <label>QR Code (URL ou caminho)</label>
            <input id=”qr” placeholder=”ex.: assets/img/qrcode.webp” />
          </div>

          <label class=”chk-label”>
            <input id=”disableQr” type=”checkbox” />
            Desativar QR Code
          </label>

          <div style=”display:flex; gap:10px; margin-top:20px”>
            <button class=”btn btn-primary” id=”save”>Salvar</button>
            <button class=”btn btn-ghost” id=”reload”>Recarregar</button>
          </div>
        </div>
      </div>
    </div>
  </div>

<script>
  const $ = id => document.getElementById(id);

  // Navigation
  function showSection(name) {
    document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const sec = $('sec-' + name);
    if (sec) sec.style.display = 'block';
    const navItems = document.querySelectorAll('.nav-item');
    const idx = { dashboard:0, orders:1, pix:2 }[name];
    if (navItems[idx]) navItems[idx].classList.add('active');
    if (name === 'orders') loadOrders();
  }

  function setStatus(h, ok=true) {
    $('statusMsg').innerHTML = ok ? '<span class=”ok”>' + h + '</span>' : '<span class=”err”>' + h + '</span>';
  }

  // PIX Config
  async function load() {
    setStatus('Carregando...');
    try {
      const res = await fetch('/api/pix-config-admin?_=' + Date.now(), { cache: 'no-store' });
      if (res.status === 401) { setStatus('401: credenciais invalidas.', false); return; }
      const data = await res.json();
      if (!data || !data.ok) throw new Error('Resposta invalida');
      $('pix').value = data.pix_code || '';
      $('qr').value = (data.qrcode_url === null) ? '' : (data.qrcode_url || '');
      $('disableQr').checked = (data.qrcode_url === null);
      $('updated').textContent = data.updated_at ? new Date(data.updated_at).toLocaleString('pt-BR') : '-';
      setStatus('Carregado.');
    } catch (e) {
      setStatus('Falha ao carregar.', false);
      console.error(e);
    }
  }

  async function save() {
    const pix = $('pix').value.trim();
    const disableQr = $('disableQr').checked;
    const qr = $('qr').value.trim();
    setStatus('Salvando...');
    try {
      const payload = { pix_code: pix, qrcode_url: disableQr ? null : (qr || 'assets/img/qrcode.webp') };
      const res = await fetch('/api/pix-config-admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.status === 401) { setStatus('401: credenciais invalidas.', false); return; }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) { setStatus('Erro ao salvar.', false); return; }
      $('updated').textContent = data.updated_at ? new Date(data.updated_at).toLocaleString('pt-BR') : '-';
      setStatus('Salvo com sucesso!');
    } catch (e) {
      setStatus('Falha ao salvar.', false);
      console.error(e);
    }
  }

  // Metrics
  async function loadMetrics() {
    try {
      const res = await fetch('/api/metrics/stats?_=' + Date.now(), { cache: 'no-store' });
      if (res.status === 401) return;
      const data = await res.json().catch(() => null);
      if (data && data.ok) {
        $('onlineNow').textContent = data.online_now || '0';
        $('pixClicks').textContent = data.pix_copy_clicks_total || '0';
      }
    } catch {}
  }

  // Orders
  let allOrders = [];

  async function loadOrders() {
    try {
      const res = await fetch('/api/orders?_=' + Date.now(), { cache: 'no-store' });
      if (res.status === 401) return;
      const data = await res.json().catch(() => null);
      if (data && data.ok && Array.isArray(data.orders)) {
        allOrders = data.orders;
        renderOrders();
        updateOrderStats();
      }
    } catch {}
  }

  function updateOrderStats() {
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = allOrders.filter(o => o.created_at && o.created_at.slice(0, 10) === today).length;
    $('ordersToday').textContent = todayCount;
    $('ordersTotal').textContent = allOrders.length;
  }

  function formatDate(iso) {
    if (!iso) return '-';
    try { return new Date(iso).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }); }
    catch { return iso; }
  }

  function formatPhone(p) {
    if (!p) return '-';
    const d = p.replace(/\\D/g, '');
    if (d.length === 11) return '(' + d.slice(0,2) + ') ' + d.slice(2,7) + '-' + d.slice(7);
    if (d.length === 13) return '+' + d.slice(0,2) + ' (' + d.slice(2,4) + ') ' + d.slice(4,9) + '-' + d.slice(9);
    return p;
  }

  function renderOrderTable(orders, containerId) {
    const el = $(containerId);
    if (!orders.length) {
      el.innerHTML = '<div class=”empty-state”><p>Nenhum pedido encontrado.</p></div>';
      return;
    }
    let html = '<table class=”orders-table”><thead><tr><th>Cliente</th><th>Contato</th><th>Endereco</th><th>Data</th><th>Valor</th></tr></thead><tbody>';
    orders.forEach(o => {
      html += '<tr>';
      html += '<td><div class=”order-name”>' + esc(o.name) + '</div><div class=”order-detail”>' + esc(o.id) + '</div></td>';
      html += '<td><div style=”font-weight:500”>' + esc(formatPhone(o.phone)) + '</div><div class=”order-detail”>' + esc(o.email) + '</div>' + (o.cpf ? '<div class=”order-detail”>CPF: ' + esc(o.cpf) + '</div>' : '') + '</td>';
      html += '<td><div class=”order-detail”>' + esc(o.address || '-') + (o.number ? ', ' + esc(o.number) : '') + '</div><div class=”order-detail”>' + esc(o.city || '-') + (o.cep ? ' - ' + esc(o.cep) : '') + '</div></td>';
      html += '<td><div class=”order-detail”>' + formatDate(o.created_at) + '</div></td>';
      html += '<td><div style=”font-weight:700;color:#16a34a”>R$ ' + (o.value || 197.99).toFixed(2).replace('.',',') + '</div></td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  function renderOrders() {
    renderOrderTable(allOrders.slice(0, 5), 'recentOrdersBody');
    renderOrderTable(allOrders, 'ordersBody');
  }

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/”/g,'&quot;');
  }

  // Init
  function init() {
    $('reload').addEventListener('click', load);
    $('save').addEventListener('click', save);
    $('disableQr').addEventListener('change', () => {
      $('qr').disabled = $('disableQr').checked;
      if ($('disableQr').checked) $('qr').value = '';
    });
    load();
    loadMetrics();
    loadOrders();
    setInterval(loadMetrics, 10000);
    setInterval(loadOrders, 30000);
  }
  init();
</script>
</body>
</html>`);
}
