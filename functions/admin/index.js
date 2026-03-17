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
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Painel PIX</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; background: #0b1220; color: #e5e7eb; }
    .wrap { max-width: 860px; margin: 0 auto; padding: 28px 18px 60px; }
    .card { background: #111a2e; border: 1px solid rgba(255,255,255,.08); border-radius: 16px; padding: 18px; box-shadow: 0 20px 50px rgba(0,0,0,.35); }
    h1 { margin: 0 0 6px; font-size: 22px; }
    p { margin: 6px 0 14px; opacity: .9; }
    label { display:block; font-size: 12px; opacity: .9; margin: 14px 0 6px; }
    input, textarea { width: 100%; box-sizing: border-box; border-radius: 12px; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); color: #e5e7eb; padding: 12px 12px; outline: none; }
    textarea { min-height: 130px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    .row { display:flex; gap: 12px; flex-wrap: wrap; }
    .row > div { flex: 1 1 240px; }
    .btns { display:flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
    button { border: 0; border-radius: 12px; padding: 12px 14px; font-weight: 700; cursor: pointer; }
    .primary { background: #22c55e; color: #052e14; }
    .ghost { background: rgba(255,255,255,.08); color: #e5e7eb; }
    .hint { font-size: 12px; opacity: .85; }
    .ok { color: #34d399; }
    .err { color: #fb7185; }
    code { background: rgba(255,255,255,.08); padding: 2px 6px; border-radius: 8px; }
    .topbar { display:flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 14px; }
    .pill { font-size: 12px; padding: 6px 10px; border-radius: 999px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.10); }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="topbar">
      <h1>🔐 Painel do PIX</h1>
      <div class="pill">Cloudflare Pages + KV</div>
    </div>

    <div class="card">
      <p>Edite o <b>PIX Copia e Cola</b> (e opcionalmente o QR). O checkout puxa de <code>/api/pix-config</code> automaticamente.</p>
      <p class="hint">Este painel já está protegido com <b>usuário e senha</b> (HTTP Basic) via Secrets: <code>PIX_ADMIN_USER</code> e <code>PIX_ADMIN_PASS</code>.</p>

      <div class="row">
        <div>
          <label>Status</label>
          <div id="status" class="hint">Carregando…</div>
          <div class="hint" style="margin-top:8px">Última atualização: <span id="updated">—</span></div>
        </div>
        <div>
          <label>Endpoint de admin</label>
          <div class="hint"><code>/api/pix-config-admin</code></div>
        </div>
      </div>

      <div class="row" style="margin-top:14px">
        <div>
          <label>👥 Online agora</label>
          <div class="pill"><span id="onlineNow">—</span> pessoas (últimos ~60s)</div>
        </div>
        <div>
          <label>📋 Cliques em “Copiar PIX”</label>
          <div class="pill"><span id="pixClicks">—</span> total</div>
        </div>
      </div>
      <div class="hint" style="margin-top:8px">Métricas atualizam a cada 10s. (Site envia pings em <code>/api/metrics/ping</code> e o painel lê de <code>/api/metrics/stats</code>.)</div>

      <label>PIX Copia e Cola</label>
      <textarea id="pix"></textarea>

      <label>QR Code (URL ou caminho) — opcional</label>
      <input id="qr" placeholder="ex.: assets/img/qrcode.webp (ou URL completa)" />
      <div class="hint">Para <b>ocultar</b> o QR, marque “Desativar QR Code”.</div>

      <label style="display:flex; align-items:center; gap:8px; margin-top: 10px;">
        <input id="disableQr" type="checkbox" style="width:auto;" />
        Desativar QR Code
      </label>

      <div class="btns">
        <button class="primary" id="save">Salvar PIX ✅</button>
        <button class="ghost" id="reload">Recarregar</button>
      </div>

      <p class="hint" style="margin-top: 14px;">Se aparecer 401/Unauthorized, confira os Secrets <code>PIX_ADMIN_USER</code> e <code>PIX_ADMIN_PASS</code> no seu projeto Pages.</p>
    </div>
  </div>

<script>
  const $ = (id) => document.getElementById(id);

  function setStatus(html, ok=true) {
    $('status').innerHTML = ok ? '<span class="ok">' + html + '</span>' : '<span class="err">' + html + '</span>';
  }

  async function load() {
    setStatus('Carregando…');
    try {
      const res = await fetch('/api/pix-config-admin?_=' + Date.now(), { cache: 'no-store' });
      if (res.status === 401) {
        setStatus('401: usuário/senha inválidos (ou secrets não configurados).', false);
        return;
      }
      const data = await res.json();
      if (!data || !data.ok) throw new Error('Resposta inválida');
      $('pix').value = data.pix_code || '';
      $('qr').value = (data.qrcode_url === null) ? '' : (data.qrcode_url || '');
      $('disableQr').checked = (data.qrcode_url === null);
      $('updated').textContent = data.updated_at || '—';
      setStatus('Config carregada.');
    } catch (e) {
      setStatus('Falha ao carregar config. Veja o console.', false);
      console.error(e);
    }
  }

  async function loadMetrics() {
    try {
      const res = await fetch('/api/metrics/stats?_=' + Date.now(), { cache: 'no-store' });
      if (res.status === 401) return;
      const data = await res.json().catch(() => null);
      if (data && data.ok) {
        const online = (data.online_now === 0 || data.online_now) ? String(data.online_now) : '0';
        const clicks = (data.pix_copy_clicks_total === 0 || data.pix_copy_clicks_total) ? String(data.pix_copy_clicks_total) : '0';
        const elOnline = $('onlineNow');
        const elClicks = $('pixClicks');
        if (elOnline) elOnline.textContent = online;
        if (elClicks) elClicks.textContent = clicks;
      }
    } catch (e) {
      // silent
    }
  }


  async function save() {
    const pix = $('pix').value.trim();
    const disableQr = $('disableQr').checked;
    const qr = $('qr').value.trim();

    setStatus('Salvando…');

    try {
      const payload = { pix_code: pix, qrcode_url: disableQr ? null : (qr || 'assets/img/qrcode.webp') };
      const res = await fetch('/api/pix-config-admin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.status === 401) {
        setStatus('401: usuário/senha inválidos (ou secrets não configurados).', false);
        return;
      }

      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        setStatus('Erro ao salvar. Confira o PIX e tente de novo.', false);
        console.log('resp', res.status, data);
        return;
      }

      $('updated').textContent = data.updated_at || '—';
      setStatus('Salvo com sucesso! 🎉');
    } catch (e) {
      setStatus('Falha ao salvar. Veja o console.', false);
      console.error(e);
    }
  }

  function init() {
    $('reload').addEventListener('click', load);
    $('save').addEventListener('click', save);

    $('disableQr').addEventListener('change', () => {
      $('qr').disabled = $('disableQr').checked;
      if ($('disableQr').checked) $('qr').value = '';
    });

    load();
    loadMetrics();
    setInterval(loadMetrics, 10000);
  }

  init();
</script>
</body>
</html>`);
}
