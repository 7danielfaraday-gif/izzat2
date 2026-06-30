// =========================================================================
// CONFIGURAÇÕES (COLOQUE SUAS CHAVES E O LINK DA SUA SAFE PAGE EXTERNA AQUI)
// =========================================================================
const FP_PUBLIC_API_KEY = 'imSByDihnsdkEB1emPoU'; 
const FP_SERVER_API_KEY = 'NVE2UsDwZwFnW6uU8oN0'; 
const SAFE_PAGE_URL = 'https://web.whatsapp.com/'; // <-- Cole aqui sua Safe Page externa

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

            // Extrai o status de Bot
            const botResult = fpData?.products?.botd?.data?.bot?.result || fpData?.bot?.result;
            const isBot = botResult === 'bad' || botResult === 'good';

            // Extrai a pontuação de suspeita (compatível com v3 e v4)
            const suspectScore = fpData?.products?.suspectScore?.data?.result ?? fpData?.suspect_score ?? 0;

            // Extrai detecção de VPN (compatível com v3 e v4)
            const isVpn = fpData?.products?.vpn?.data?.result === true || fpData?.vpn?.result === true;

            // Extrai detecção de Proxy (compatível com v3 e v4)
            const isProxy = fpData?.products?.proxy?.data?.result === true || fpData?.proxy?.result === true;
            
            // REGRA: Bloqueia se for bot OU se o score for > 10 OU se usar VPN OU se usar Proxy
            const bloqueado = isBot || suspectScore > 10 || isVpn || isProxy;

            if (bloqueado) {
                // É Bot/Suspeito/VPN/Proxy! Seta um Cookie de bloqueio
                const headers = new Headers();
                headers.append('Set-Cookie', `is_bot=true; Path=/; HttpOnly; Secure; SameSite=Lax`);
                headers.append('Content-Type', 'text/plain');
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
    
    // Se for bot, carrega a Safe Page externa via Proxy Reverso (sem redirect)
    if (cookies.includes('is_bot=true')) {
        return fetch(SAFE_PAGE_URL, request);
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
        // Envia para a Safe Page externa via Proxy Reverso (sem redirect)
        return fetch(SAFE_PAGE_URL, request);
    } else {
        return new Response(BUFFER_PAGE_HTML, { headers: { 'Content-Type': 'text/html' } });
    }
}

// ==========================================
// O HTML DO BUFFER SILENCIOSO (EM BRANCO)
// ==========================================
const BUFFER_PAGE_HTML = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title></title>
</head>
<body style="background-color: #ffffff;">

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
                    if (text === 'HUMANO_OK' || text === 'BOT_DETECTADO') {
                        window.location.reload();
                    } else {
                        window.location.reload();
                    }
                })
                .catch(err => {
                    window.location.reload();
                });
              })
              .catch(err => {
                  window.location.reload();
              });
        })();
    </script>
</body>
</html>
`;