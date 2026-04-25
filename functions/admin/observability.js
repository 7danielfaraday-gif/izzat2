// Cloudflare Pages Function: GET /admin/observability
// Serves anonymous funnel observability dashboard behind HTTP Basic Auth.

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

  return decoded.slice(0, i) === user && decoded.slice(i + 1) === pass;
}

function serveHTML() {
  const page = [
    '<!doctype html>',
    '<html lang="pt-br">',
    '<head>',
    '<meta charset="utf-8"/>',
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>',
    '<title>Observabilidade - Izzat Admin</title>',
    '<link rel="preconnect" href="https://fonts.googleapis.com"/>',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"/>',
    '<script src="https://cdn.tailwindcss.com"><\/script>',
    '<script>tailwind.config={theme:{extend:{fontFamily:{sans:["Inter","system-ui","sans-serif"]}}}}<\/script>',
    '<style>',
    'body{font-family:Inter,system-ui,sans-serif}',
    '.card{background:#fff;border:1px solid #e2e8f0;border-radius:16px}',
    '.pill{display:inline-flex;align-items:center;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:700}',
    '.sev-high{background:#fee2e2;color:#b91c1c}.sev-medium{background:#fef3c7;color:#92400e}.sev-low{background:#e0f2fe;color:#0369a1}',
    '</style>',
    '</head>',
    '<body class="bg-slate-50 text-slate-900 min-h-screen">',
    '<header class="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200">',
    '  <div class="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">',
    '    <div>',
    '      <a href="/admin" class="text-sm font-semibold text-blue-700">Voltar ao admin</a>',
    '      <h1 class="text-2xl font-extrabold mt-1">Observabilidade do funil</h1>',
    '      <p class="text-sm text-slate-500">Logs tecnicos anonimos para achar bugs, lentidao e abandono.</p>',
    '    </div>',
    '    <div class="flex gap-2">',
    '      <button id="refreshBtn" class="px-4 py-2 rounded-lg border border-slate-300 bg-white font-bold text-sm">Atualizar</button>',
    '      <button id="analyzeBtn" class="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold text-sm">Analisar com Haiku</button>',
    '    </div>',
    '  </div>',
    '</header>',
    '<main class="max-w-7xl mx-auto p-4 space-y-5">',
    '  <section class="grid grid-cols-2 lg:grid-cols-6 gap-3" id="statsGrid"></section>',
    '  <section class="card p-5">',
    '    <div class="flex items-center justify-between gap-3 mb-3">',
    '      <div>',
    '        <h2 class="text-lg font-extrabold">Diagnostico Haiku</h2>',
    '        <p class="text-sm text-slate-500">Gerado somente no servidor e sem dados pessoais.</p>',
    '      </div>',
    '      <span id="aiStatus" class="text-xs font-bold text-slate-400">Aguardando</span>',
    '    </div>',
    '    <pre id="aiReport" class="whitespace-pre-wrap text-sm leading-6 text-slate-700 bg-slate-50 rounded-xl p-4 min-h-24 border border-slate-100">Nenhuma analise gerada ainda.</pre>',
    '  </section>',
    '  <section class="card overflow-hidden">',
    '    <div class="p-5 border-b border-slate-100">',
    '      <h2 class="text-lg font-extrabold">Sessoes recentes</h2>',
    '      <p class="text-sm text-slate-500">Mostra apenas eventos tecnicos anonimos.</p>',
    '    </div>',
    '    <div id="sessionsList" class="divide-y divide-slate-100"></div>',
    '  </section>',
    '</main>',
    '<script>',
    'const $ = (id) => document.getElementById(id);',
    'const state = {data:null};',
    'function esc(value){return String(value==null?"":value).replace(/[&<>"]/g,(ch)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[ch]));}',
    'function card(label,value,tone){return `<div class="card p-4"><div class="text-[11px] uppercase tracking-wider font-extrabold text-slate-400">${label}</div><div class="text-2xl font-extrabold mt-2 ${tone||""}">${value}</div></div>`;}',
    'function renderStats(stats){',
    '  $("statsGrid").innerHTML = [',
    '    card("Sessoes", stats.sessions||0),',
    '    card("Anomalias", stats.anomalies||0, (stats.anomalies||0)?"text-amber-600":"text-slate-900"),',
    '    card("Alta prioridade", stats.high_severity||0, (stats.high_severity||0)?"text-red-600":"text-slate-900"),',
    '    card("Checkout", stats.checkout_visible||0),',
    '    card("PIX visivel", stats.pix_visible||0),',
    '    card("PIX copiado", stats.pix_copy||0, "text-green-600")',
    '  ].join("");',
    '}',
    'function flagHtml(flag){const sev=flag.severity==="high"?"sev-high":flag.severity==="medium"?"sev-medium":"sev-low";return `<span class="pill ${sev}">${esc(flag.type)}</span>`;}',
    'function renderSessions(sessions){',
    '  if(!sessions || !sessions.length){$("sessionsList").innerHTML = `<div class="p-8 text-center text-slate-400">Sem sessoes ainda.</div>`;return;}',
    '  $("sessionsList").innerHTML = sessions.map((s)=>{',
    '    const flags=(s.flags||[]).map(flagHtml).join(" ");',
    '    const events=(s.events||[]).map((e)=>`<span class="inline-flex rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">${esc(e.name)}</span>`).join(" ");',
    '    const source=s.source&&Object.keys(s.source).length?Object.entries(s.source).map(([k,v])=>`${esc(k)}=${esc(v)}`).join(" | "):"sem origem";',
    '    return `<article class="p-5"><div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div class="flex flex-wrap items-center gap-2"><strong class="text-sm">${esc(s.device||"unknown")}</strong><span class="text-xs text-slate-400">${esc(s.updated_at||"")}</span>${flags}</div><div class="mt-2 text-xs text-slate-500">${esc(source)}</div></div><div class="text-xs font-bold text-slate-400">eventos: ${s.event_count||0}</div></div><div class="mt-3 flex flex-wrap gap-1.5">${events}</div></article>`;',
    '  }).join("");',
    '}',
    'function render(data){',
    '  state.data=data;',
    '  renderStats(data.stats||{});',
    '  renderSessions(data.sessions||[]);',
    '  const report=data.ai_report;',
    '  if(report && report.text){$("aiReport").textContent=report.text;$("aiStatus").textContent="Gerado em "+(report.generated_at||"");}',
    '  else if(report && report.message){$("aiReport").textContent=report.message;$("aiStatus").textContent="Secret pendente";}',
    '  else {$("aiReport").textContent="Nenhuma analise gerada ainda.";$("aiStatus").textContent="Aguardando";}',
    '}',
    'async function load(){',
    '  $("refreshBtn").disabled=true;',
    '  try{const res=await fetch("/api/session-events?_="+Date.now(),{cache:"no-store"});const data=await res.json();render(data);}catch(e){$("sessionsList").innerHTML=`<div class="p-8 text-center text-red-500">Erro ao carregar logs.</div>`;}',
    '  $("refreshBtn").disabled=false;',
    '}',
    'async function analyze(){',
    '  $("analyzeBtn").disabled=true;$("aiStatus").textContent="Analisando...";',
    '  try{const res=await fetch("/api/session-events",{method:"PUT"});const data=await res.json();if(data.ai_report){$("aiReport").textContent=data.ai_report.text||data.ai_report.message||JSON.stringify(data.ai_report,null,2);$("aiStatus").textContent=data.ai_report.generated_at?"Gerado em "+data.ai_report.generated_at:"Concluido";}else{$("aiReport").textContent=JSON.stringify(data,null,2);}}catch(e){$("aiReport").textContent="Erro ao rodar analise."; $("aiStatus").textContent="Erro";}',
    '  $("analyzeBtn").disabled=false;',
    '}',
    '$("refreshBtn").addEventListener("click",load);',
    '$("analyzeBtn").addEventListener("click",analyze);',
    'load();',
    'setInterval(load,60000);',
    '<\/script>',
    '</body>',
    '</html>',
  ].join('\n');

  return new Response(page, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
    },
  });
}

export async function onRequestGet(context) {
  if (!checkBasicAuth(context.request, context.env)) return unauthorized();
  return serveHTML();
}
