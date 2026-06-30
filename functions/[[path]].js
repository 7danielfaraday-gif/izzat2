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
            const eventId = body.eventId; // Na v4 usamos event_id

            if (!eventId) {
                return new Response('ERRO', { status: 400 });
            }

            // Consulta a API do Fingerprint V4 no Backend
            const fpResponse = await fetch('https://api.fpjs.io/events/' + eventId, {
                headers: { 
                    'Auth-API-Key': FP_SERVER_API_KEY,
                    'Content-Type': 'application/json'
                }
            });

            if (!fpResponse.ok) {
                return new Response('BOT_DETECTADO', { status: 403 });
            }

            const fpData = await fpResponse.json();

            // Verifica a detecção de bot no resultado da API
            const isBot = fpData?.products?.bot_detection?.data?.bot;

            if (isBot === true) {
                return new Response('BOT_DETECTADO', { status: 403 });
            } else {
                // É humano! Libera o crachá (Cookie)
                const headers = new Headers();
                headers.append('Set-Cookie', `is_human=true; Path=/; HttpOnly; Secure; SameSite=Lax`);
                headers.append('Content-Type', 'text/plain');
                return new Response('HUMANO_OK', { status: 200, headers: headers });
            }
        } catch (e) {
            return new Response('ERRO_API', { status: 500 });
        }
    }

    // ==========================================
    // 2. SE JÁ TEM O COOKIE, LIBERA O SITE (MONEY PAGE)
    // ==========================================
    const cookies = request.headers.get('Cookie') || '';
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

            // Código nativo da V4 do Fingerprint
            const fpPromise = import('https://fpjscdn.net/v4/' + fpPublicApiKey)
              .then(Fingerprint => Fingerprint.start({
                region: "ap" // Região configurada no seu painel
              }));

            fpPromise
              .then(fp => fp.get())
              .then(result => {
                // Na v4, pegamos o event_id
                const eventId = result.event_id;
                
                // Envia o ID para o nosso Worker validar no backend
                fetch('/verify_human', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ eventId: eventId })
                })
                .then(res => res.text())
                .then(text => {
                    if (text === 'HUMANO_OK') {
                        window.location.reload();
                    } else {
                        document.body.innerHTML = "<h1>Erro 404 - Página não encontrada</h1>";
                    }
                })
                .catch(() => {
                    document.body.innerHTML = "<h1>Erro 404 - Página não encontrada</h1>";
                });
              })
              .catch(() => {
                  document.body.innerHTML = "<h1>Erro 404 - Página não encontrada</h1>";
              });
        })();
    </script>
</body>
</html>
`;