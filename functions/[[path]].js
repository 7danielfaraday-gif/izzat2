// ==========================================
// CONFIGURAÇÕES (COLOQUE SUAS CHAVES AQUI)
// ==========================================
const FP_PUBLIC_API_KEY = 'imSByDihnsdkEB1emPoU'; 
const FP_SERVER_API_KEY = 'NVE2UsDwZwFnW6uU8oN0'; 

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    // ==========================================
    // 1. ROTA DE VALIDAÇÃO (CHAMADA PELO JAVASCRIPT)
    // ==========================================
    if (url.pathname === '/verify_human') {
        try {
            const body = await request.json();
            const eventId = body.eventId;

            if (!eventId) {
                return new Response('FALTOU_EVENT_ID', { status: 400 });
            }

            // Consulta a API do Fingerprint V4 no Backend (Região AP)
            const fpResponse = await fetch('https://ap.api.fpjs.io/events/' + eventId, {
                headers: { 
                    'Auth-API-Key': FP_SERVER_API_KEY,
                    'Content-Type': 'application/json'
                }
            });

            if (!fpResponse.ok) {
                const errorText = await fpResponse.text();
                return new Response('ERRO_API: ' + errorText, { status: 403 });
            }

            const fpData = await fpResponse.json();

            // CORREÇÃO DOS CAMINHOS DO FINGERPRINT
            const botResult = fpData?.products?.botd?.data?.bot?.result;
            const isBot = botResult === 'bad' || botResult === 'good'; // Identifica robôs nocivos e bots conhecidos
            const suspectScore = fpData?.products?.suspectScore?.data?.result ?? 0; // Pega o score de suspeita real
            
            // REGRA: Se for bot OU se a pontuação de suspeita for maior que 10
            const bloqueado = isBot || suspectScore > 10;

            if (bloqueado) {
                // É Bot/Suspeito! Seta um Cookie de bloqueio
                const headers = new Headers();
                headers.append('Set-Cookie', `is_bot=true; Path=/; HttpOnly; Secure; SameSite=Lax`);
                headers.append('Content-Type', 'text/plain');
                // Retorna BOT para o JavaScript recarregar a página
                return new Response('BOT_DETECTADO', { status: 200, headers: headers });
            } else {
                // É humano! Libera o crachá (Cookie)
                const headers = new Headers();
                headers.append('Set-Cookie', `is_human=true; Path=/; HttpOnly; Secure; SameSite=Lax`);
                headers.append('Content-Type', 'text/plain');
                return new Response('HUMANO_OK', { status: 200, headers: headers });
            }
        } catch (e) {
            return new Response('ERRO_CATCH: ' + e.message, { status: 500 });
        }
    }

    // ==========================================
    // 2. CHECAGEM DE COOKIES (LIBERA OU BLOQUEIA)
    // ==========================================
    const cookies = request.headers.get('Cookie') || '';
    
    // Se for bot, manda direto para a Safe Page
    if (cookies.includes('is_bot=true')) {
        return new Response(SAFE_PAGE_HTML, { headers: { 'Content-Type': 'text/html' } });
    }
    
    // Se for humano, libera o site (Money Page)
    if (cookies.includes('is_human=true')) {
        return env.ASSETS.fetch(request); 
    }

    // ==========================================
    // 3. A TRIAGEM DO SEGURANÇA (FASE 1)
    // ==========================================
    const userAgent = request.headers.get('User-Agent') || '';
    const cf = request.cf || {}; 
    
    const isBrazil = cf.country === 'BR';
    const isBotUA = /bot|crawl|spider|facebookexternalhit|HeadlessChrome|tiktok/i.test(userAgent) || userAgent === '';
    
    const datacenterASNs = [14618, 15169, 16509, 36459, 8075];
    const isDatacenter = datacenterASNs.includes(cf.asn);

    if (!isBrazil || isDatacenter || isBotUA) {
        return new Response(SAFE_PAGE_HTML, { headers: { 'Content-Type': 'text/html' } });
    } else {
        return new Response(BUFFER_PAGE_HTML, { headers: { 'Content-Type': 'text/html' } });
    }
}

// ==========================================
// OS HTMLs
// ==========================================
const SAFE_PAGE_HTML = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Receitas Fit</title></head>
<body><h1>Blog de Receitas Saudáveis</h1><p>Suco verde detox...</p></body>
</html>
`;

const BUFFER_PAGE_HTML = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Carregando...</title>
    <style>body { font-family: sans-serif; padding: 20px; } .skeleton { background: #eee; height: 20px; margin: 15px 0; }</style>
</head>
<body>
    <h1>Conectando ao servidor...</h1>
    <p>Aguarde um instante.</p>
    <div class="skeleton" style="width: 60%;"></div>
    <div class="skeleton"></div>

    <script>
        (function() {
            const fpPublicApiKey = '${FP_PUBLIC_API_KEY}'; 

            const fpPromise = import('https://fpjscdn.net/v4/' + fpPublicApiKey)
              .then(Fingerprint => Fingerprint.start({
                region: "ap"
              }));

            fpPromise
              .then(fp => fp.get())
              .then(result => {
                const eventId = result.event_id;
                
                fetch('/verify_human', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ eventId: eventId })
                })
                .then(res => res.text())
                .then(text => {
                    // Se for HUMANO_OK ou BOT_DETECTADO, a página vai recarregar.
                    // O Cookie que foi setado no backend vai decidir se o usuário vai ver a LP ou a Safe Page.
                    if (text === 'HUMANO_OK' || text === 'BOT_DETECTADO') {
                        window.location.reload();
                    } else {
                        // Caso dê erro na API, recarrega a página para tentar de novo ou cair na Safe Page
                        window.location.reload();
                    }
                })
                .catch(err => {
                    document.body.innerHTML = "<h1>Erro de Conexão</h1>";
                });
              })
              .catch(err => {
                  document.body.innerHTML = "<h1>Erro ao carregar Fingerprint</h1>";
              });
        })();
    </script>
</body>
</html>
`;