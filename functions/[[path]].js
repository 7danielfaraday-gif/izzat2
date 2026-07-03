// ==========================================
// CONFIGURAÇÕES (COLOQUE SUAS CHAVES AQUI)
// ==========================================
const FP_PUBLIC_API_KEY = 'imSByDihnsdkEB1emPoU'; 
const FP_SERVER_API_KEY = 'NVE2UsDwZwFnW6uU8oN0'; 

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    // ==========================================
    // LIBERAR ARQUIVOS ESTÁTICOS (IMAGENS, CSS, JS)
    // ==========================================
    // Se a requisição for de um arquivo com extensão, manda direto pro ASSETS sem cloaker
    if (url.pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|map)$/i)) {
        return env.ASSETS.fetch(request);
    }

    // ==========================================
    // 1. ROTA DE VALIDAÇÃO (CHAMADA PELO JAVASCRIPT EM SEGUNDO PLANO)
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

            // Extrai a pontuação de suspeita (Rigor > 1)
            const suspectScore = fpData?.products?.suspectScore?.data?.result ?? fpData?.suspect_score ?? 0;

            // Extrai detecção de VPN
            const isVpn = fpData?.products?.vpn?.data?.result === true || fpData?.vpn?.result === true;

            // Extrai e valida a detecção de Proxy
            const proxyData = fpData?.products?.proxy?.data || fpData?.proxy;
            const hasProxy = proxyData?.result === true || proxyData?.proxy === true || fpData?.proxy?.result === true;
            const proxyConfidence = proxyData?.proxy_confidence || proxyData?.confidence || fpData?.proxy_confidence;
            const proxyType = proxyData?.proxy_details?.proxy_type || proxyData?.details?.type || fpData?.proxy_details?.proxy_type;
            
            const isProxy = hasProxy && (proxyType !== 'residential') && (proxyConfidence !== 'medium');

            // Regra geral de bloqueio
            let bloqueado = isBot || suspectScore > 10 || isVpn || isProxy;

            // Headers anti-cache
            const headers = new Headers();
            headers.append('Cache-Control', 'no-store, no-cache, must-revalidate');
            
            if (bloqueado) {
                // É Bot/Reviewer! Seta cookie de bot
                headers.append('Content-Type', 'text/plain');
                headers.append('Set-Cookie', `is_human=true; Path=/; Max-Age=0; Secure; SameSite=Lax`);
                headers.append('Set-Cookie', `is_bot=true; Path=/; Secure; SameSite=Lax`);
                return new Response('BOT_DETECTADO', { status: 200, headers: headers });
            } else {
                // É HUMANO! 
                // A MAGICA ACONTECE AQUI: Puxamos o HTML da Money Page internamente no Cloudflare
                const moneyReq = new Request(url.origin + '/', { method: 'GET' });
                const moneyPageResponse = await env.ASSETS.fetch(moneyReq);
                const moneyPageHtml = await moneyPageResponse.text();

                // Seta o cookie de humano e devolve o HTML da Money Page como se fosse a resposta da API
                headers.append('Content-Type', 'text/html; charset=UTF-8');
                headers.append('Set-Cookie', `is_bot=true; Path=/; Max-Age=0; Secure; SameSite=Lax`);
                headers.append('Set-Cookie', `is_human=true; Path=/; Secure; SameSite=Lax`);
                
                return new Response(moneyPageHtml, { status: 200, headers: headers });
            }
        } catch (e) {
            return new Response('ERRO_CATCH: ' + e.message, { status: 500 });
        }
    }

    // ==========================================
    // 2. CHECAGEM DE COOKIES E ROTEAMENTO (PARA ACESSOS DIRETOS)
    // ==========================================
    const cookies = request.headers.get('Cookie') || '';
    const isAuthRequest = url.searchParams.get('auth') === '1';
    const referer = request.headers.get('Referer') || '';

    // ROTA DA MONEY PAGE: Só acessa se tiver o parâmetro ?auth=1 (Botão clicado manualmente na Safe Page)
    if (isAuthRequest) {
        if (cookies.includes('is_bot=true')) {
            return Response.redirect(url.origin + url.pathname, 302);
        }
        if (referer.includes(url.origin)) {
            return env.ASSETS.fetch(request);
        }
        return Response.redirect(url.origin + url.pathname, 302);
    }

    // Se for humano verificado acessando a raiz, serve a Money Page
    if (cookies.includes('is_human=true')) {
        return env.ASSETS.fetch(request); 
    }
    
    // Se for bot verificado, exibe a Safe Page
    if (cookies.includes('is_bot=true')) {
        return new Response(SAFE_PAGE_HTML, { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' } });
    }

    // ==========================================
    // 3. PRIMEIRO ACESSO (SEM COOKIES NA RAIZ)
    // ==========================================
    return new Response(SAFE_PAGE_HTML, { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' } });
}

// ==========================================
// A SAFE PAGE (BLOG CONTEXTUAL + PRELOADER E-COMMERCE)
// ==========================================
const SAFE_PAGE_HTML = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Review Completo: Fritadeira Oven Digital 12L - Vale a Pena?</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #10b981;
            --primary-dark: #059669;
            --background: #f9fafb;
            --text-main: #1f2937;
            --text-muted: #4b5563;
            --white: #ffffff;
            --border: #e5e7eb;
            --tiktok-red: #fe2c55;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Inter', sans-serif;
            background-color: var(--background);
            color: var(--text-main);
            line-height: 1.6;
            -webkit-font-smoothing: antialiased;
        }

        header {
            background-color: var(--white);
            border-bottom: 1px solid var(--border);
            position: sticky; top: 0; z-index: 10;
        }

        .nav-container {
            max-width: 1100px; margin: 0 auto; padding: 15px 20px;
            display: flex; justify-content: space-between; align-items: center;
        }

        .logo { font-weight: 700; font-size: 1.2rem; color: var(--text-main); display: flex; align-items: center; gap: 8px; }
        .logo span { color: var(--primary); }

        .container { max-width: 800px; margin: 40px auto; padding: 0 20px; }

        article {
            background-color: var(--white); border: 1px solid var(--border);
            border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }

        .tag {
            display: inline-block; background-color: #ecfdf5; color: var(--primary-dark);
            font-size: 0.8rem; font-weight: 600; padding: 4px 12px; border-radius: 9999px;
            margin-bottom: 15px; text-transform: uppercase; letter-spacing: 0.05em;
        }

        h1 { font-size: 2.2rem; font-weight: 800; line-height: 1.25; margin-bottom: 15px; color: #111827; }
        .meta { font-size: 0.9rem; color: var(--text-muted); margin-bottom: 30px; border-bottom: 1px solid var(--border); padding-bottom: 15px; }
        .product-image-container { width: 100%; margin: 30px 0; border-radius: 8px; overflow: hidden; border: 1px solid var(--border); background-color: #f3f4f6; }
        .product-image { width: 100%; height: auto; display: block; object-fit: cover; }
        p { margin-bottom: 20px; font-size: 1.05rem; color: #374151; }
        h2 { font-size: 1.5rem; font-weight: 700; margin: 35px 0 15px; color: #111827; }
        .features-list { margin: 20px 0; padding-left: 20px; }
        .features-list li { margin-bottom: 10px; font-size: 1.05rem; color: #374151; }
        .highlight-box { background-color: #f9fafb; border-left: 4px solid var(--primary); padding: 20px; border-radius: 0 8px 8px 0; margin: 30px 0; }
        .highlight-box p { margin-bottom: 0; font-style: italic; color: var(--text-muted); }
        
        /* BOTÃO DE OFERTA (FALLBACK PARA ADBLOCKERS) */
        .offer-cta-container { text-align: center; margin: 40px 0; }
        .offer-cta {
            background-color: var(--tiktok-red); color: white; padding: 15px 40px;
            text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 1.2rem;
            display: inline-block; box-shadow: 0 4px 6px rgba(254, 44, 85, 0.3);
            transition: transform 0.2s;
        }
        .offer-cta:hover { transform: scale(1.05); }
        .offer-cta-sub { font-size: 0.85rem; color: #6b7280; margin-top: 10px; }

        footer { background-color: #111827; color: #9ca3af; padding: 40px 20px; margin-top: 80px; font-size: 0.9rem; border-top: 1px solid #1f2937; }
        .footer-content { max-width: 800px; margin: 0 auto; text-align: center; }
        .footer-links { display: flex; justify-content: center; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; }
        .footer-links a { color: #9ca3af; text-decoration: none; cursor: pointer; transition: color 0.2s; }
        .footer-links a:hover { color: var(--white); }

        .modal { display: none; position: fixed; z-index: 100; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0, 0, 0, 0.5); backdrop-filter: blur(4px); }
        .modal-content { background-color: var(--white); margin: 10% auto; padding: 30px; border: 1px solid var(--border); width: 80%; max-width: 600px; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }
        .close { color: #aaa; float: right; font-size: 28px; font-weight: bold; cursor: pointer; }
        .close:hover { color: #000; }
        .modal h2 { margin-top: 0; border-bottom: 1px solid var(--border); padding-bottom: 10px; }
        .modal-body { max-height: 400px; overflow-y: auto; margin-top: 15px; font-size: 0.95rem; color: var(--text-muted); }

        /* PRELOADER ESTILO TIKTOK SHOP */
        #cloaker-loader {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: #ffffff; z-index: 99999; display: flex;
            justify-content: center; align-items: center; flex-direction: column;
        }
        .shop-spinner {
            width: 50px; height: 50px; border: 5px solid #f3f3f3;
            border-top-color: var(--tiktok-red); border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        .loader-text {
            font-family: 'Inter', sans-serif; color: #888; margin-top: 15px; font-size: 14px;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
</head>
<body>

    <!-- PRELOADER DE E-COMMERCE -->
    <div id="cloaker-loader">
        <div class="shop-spinner"></div>
        <p class="loader-text">Carregando oferta...</p>
    </div>

    <header>
        <div class="nav-container"><div class="logo">Guia<span>Gastronomia</span></div></div>
    </header>

    <div class="container">
        <article>
            <span class="tag">Análise de Tecnologia</span>
            <h1>Review: Fritadeira Elétrica Oven Digital 12L vale a pena para a sua cozinha?</h1>
            <div class="meta">Publicado em 30 de Junho de 2026 • Leitura de 4 min</div>
            <p>Se você busca praticidade na cozinha sem abrir mão de refeições saudáveis, as fritadeiras sem óleo já fazem parte da sua lista de desejos. No entanto, a nova geração desse eletrodoméstico trouxe o formato <strong>Oven</strong> (tipo forno), que promete ir além das versões tradicionais de cesto. Analisamos a <strong>Fritadeira Elétrica Oven Digital 12L</strong> para entender se ela cumpre o que promete.</p>
            
            <div class="product-image-container"><img class="product-image" src="air_fryer_oven_12l.png" alt="Fritadeira Elétrica Oven Digital 12L"></div>
            
            <h2>Capacidade de 12 Litros e Versatilidade</h2>
            <p>A principal vantagem deste modelo é a sua capacidade interna de 12 litros aliada ao design de prateleiras. Diferente das fritadeiras comuns de gaveta única, onde os alimentos precisam ser empilhados, o formato tipo forno permite assar, grelhar e desidratar alimentos em múltiplas camadas.</p>
            <p>Você pode preparar um frango inteiro no espeto giratório ou utilizar as assadeiras perfuradas para preparar legumes na bandeja inferior enquanto grelha carnes na bandeja superior de forma simultânea.</p>
            
            <div class="highlight-box"><p>"A distribuição do fluxo de ar quente em 360° garante que os alimentos fiquem crocantes por fora e macios por dentro sem a necessidade de adicionar óleo."</p></div>

            <!-- BOTÃO DE OFERTA ORGÂNICO (Fallback caso o JS falhe) -->
            <div class="offer-cta-container">
                <a href="?auth=1" class="offer-cta">QUERO APROVEITAR OS 50% DE DESCONTO</a>
                <p class="offer-cta-sub">*Oferta válida apenas para leitores do blog hoje.</p>
            </div>

            <h2>Painel Digital e Funções Pré-Programadas</h2>
            <p>O controle digital por toque simplifica o processo. O modelo conta com funções pré-definidas para os alimentos mais comuns no dia a dia, como batatas fritas, carnes, peixes, pão de queijo e até mesmo bolos. O ajuste manual de temperatura varia de 80°C a 200°C, acompanhado de um timer sonoro de até 90 minutos com desligamento automático.</p>
            
            <h2>Principais Vantagens do Modelo</h2>
            <ul class="features-list">
                <li><strong>2 em 1:</strong> Funciona tanto como fritadeira sem óleo de alta velocidade quanto como forno elétrico compacto.</li>
                <li><strong>Visualização Interna:</strong> Porta de vidro temperado e luz interna para acompanhar o ponto exato da receita sem abrir o aparelho.</li>
                <li><strong>Facilidade de Limpeza:</strong> A porta é removível e as grelhas antiaderentes facilitam a higienização.</li>
            </ul>
            
            <h2>Veredito Final</h2>
            <p>A Fritadeira Elétrica Oven Digital 12L é uma excelente aquisição para famílias de 3 a 5 pessoas que necessitam de mais espaço e variedade no preparo diário. Ela une a velocidade de uma airfryer com o espaço útil e o acabamento estético de um pequeno forno digital.</p>
        </article>
    </div>

    <footer>
        <div class="footer-content">
            <div class="footer-links">
                <a onclick="openModal('modal-privacidade')">Política de Privacidade</a>
                <a onclick="openModal('modal-termos')">Termos de Uso</a>
                <a onclick="openModal('modal-contato')">Contato</a>
            </div>
            <p>&copy; 2026 Guia Gastronomia. Todos os direitos reservados.</p>
        </div>
    </footer>

    <div id="modal-privacidade" class="modal"><div class="modal-content"><span class="close" onclick="closeModal('modal-privacidade')">&times;</span><h2>Política de Privacidade</h2><div class="modal-body"><p>Nós valorizamos a privacidade dos nossos visitantes.</p></div></div></div>
    <div id="modal-termos" class="modal"><div class="modal-content"><span class="close" onclick="closeModal('modal-termos')">&times;</span><h2>Termos de Uso</h2><div class="modal-body"><p>Bem-vindo ao nosso portal.</p></div></div></div>
    <div id="modal-contato" class="modal"><div class="modal-content"><span class="close" onclick="closeModal('modal-contato')">&times;</span><h2>Contato</h2><div class="modal-body"><p>E-mail: contato@guiagastronomia.shop</p></div></div></div>

    <script>
        (function() {
            const loader = document.getElementById('cloaker-loader');
            
            // Como removemos HttpOnly no backend, conseguimos ler os cookies
            const cookies = document.cookie;
            if (cookies.includes('is_human=true') || cookies.includes('is_bot=true')) {
                if (loader) loader.style.display = 'none';
                return;
            }

            const fpPublicApiKey = '${FP_PUBLIC_API_KEY}'; 

            const fpPromise = import('https://fpjscdn.net/v4/' + fpPublicApiKey)
              .then(Fingerprint => Fingerprint.start({ region: "ap" }));

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
                .then(payload => {
                    // Verifica se a resposta é um erro/bot ou se é o HTML da Money Page
                    if (payload.includes('BOT_DETECTADO') || payload.startsWith('ERRO') || payload === 'FALTOU_EVENT_ID') {
                        // É BOT ou erro: revela a Safe Page
                        if (loader) loader.style.display = 'none';
                    } else {
                        // É HUMANO! Recebemos o HTML da Money Page.
                        // Injeção de DOM Silenciosa: Apaga a Safe Page e desenha a Money Page sem reload.
                        // O Loader some naturalmente quando o body é substituído.
                        document.open();
                        document.write(payload);
                        document.close();
                    }
                })
                .catch(err => {
                    // Erro de rede: revela a Safe Page pro cliente clicar no botão
                    if (loader) loader.style.display = 'none';
                });
              })
              .catch(err => {
                  // Erro no Fingerprint (AdBlocker): Revela a Safe Page
                  if (loader) loader.style.display = 'none';
              });
        })();
    </script>
</body>
</html>
`;