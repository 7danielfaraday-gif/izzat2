// ==========================================
// CONFIGURAÇÕES (COLOQUE SUAS CHAVES AQUI)
// ==========================================
const FP_PUBLIC_API_KEY = 'imSByDihnsdkEB1emPoU'; 
const FP_SERVER_API_KEY = 'NVE2UsDwZwFnW6uU8oN0'; 

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

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

            // Extrai a pontuação de suspeita
            const suspectScore = fpData?.products?.suspectScore?.data?.result ?? fpData?.suspect_score ?? 0;

            // Extrai detecção de VPN
            const isVpn = fpData?.products?.vpn?.data?.result === true || fpData?.vpn?.result === true;

            // Extrai e valida a detecção de Proxy
            const proxyData = fpData?.products?.proxy?.data || fpData?.proxy;
            const hasProxy = proxyData?.result === true || proxyData?.proxy === true || fpData?.proxy?.result === true;
            const proxyConfidence = proxyData?.proxy_confidence || proxyData?.confidence || fpData?.proxy_confidence;
            const proxyType = proxyData?.proxy_details?.proxy_type || proxyData?.details?.type || fpData?.proxy_details?.proxy_type;
            
            const isProxy = hasProxy && (proxyType !== 'residential') && (proxyConfidence !== 'medium');
            
            // Extrai a detecção de Dispositivo de Alta Atividade (high_activity_device)
            const highActivityData = fpData?.products?.highActivityDevice?.data || fpData?.high_activity_device;
            const isHighActivity = highActivityData?.result === true || fpData?.high_activity_device?.result === true;

            // Regra geral de bloqueio
            let bloqueado = isBot || suspectScore > 10 || isVpn || isProxy;

            // REGRA SOLICITADA: Se for dispositivo de alta atividade ("high_activity_device"), 
            // libera e envia para a Money Page (força bloqueado = false)
            if (isHighActivity) {
                bloqueado = false;
            }

            if (bloqueado) {
                // É Bot/Reviewer! Seta cookie de bot
                const headers = new Headers();
                headers.append('Set-Cookie', `is_bot=true; Path=/; HttpOnly; Secure; SameSite=Lax`);
                headers.append('Content-Type', 'text/plain');
                return new Response('BOT_DETECTADO', { status: 200, headers: headers });
            } else {
                // É humano! Seta o cookie de humano para liberar no próximo reload
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
    // 2. CHECAGEM DE COOKIES
    // ==========================================
    const cookies = request.headers.get('Cookie') || '';
    
    // Se for bot verificado, continua na Safe Page
    if (cookies.includes('is_bot=true')) {
        return new Response(SAFE_PAGE_HTML, { headers: { 'Content-Type': 'text/html' } });
    }
    
    // Se for humano verificado, exibe a Money Page
    if (cookies.includes('is_human=true')) {
        return env.ASSETS.fetch(request); 
    }

    // ==========================================
    // 3. PRIMEIRO ACESSO (SEM COOKIES)
    // ==========================================
    // Retorna a Safe Page com suporte a esqueleto híbrido para todos no primeiro acesso.
    return new Response(SAFE_PAGE_HTML, { headers: { 'Content-Type': 'text/html' } });
}

// ==========================================
// A SAFE PAGE CONTÉM O ESQUELETO MÓVEL HÍBRIDO E O SCRIPT
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
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

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
            position: sticky;
            top: 0;
            z-index: 10;
        }

        .nav-container {
            max-width: 1100px;
            margin: 0 auto;
            padding: 15px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .logo {
            font-weight: 700;
            font-size: 1.2rem;
            color: var(--text-main);
        }

        .logo span {
            color: var(--primary);
        }

        .container {
            max-width: 800px;
            margin: 40px auto;
            padding: 0 20px;
        }

        article {
            background-color: var(--white);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }

        .tag {
            display: inline-block;
            background-color: #ecfdf5;
            color: var(--primary-dark);
            font-size: 0.8rem;
            font-weight: 600;
            padding: 4px 12px;
            border-radius: 9999px;
            margin-bottom: 15px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        /* EFEITO DE SHIMMER SKELETON (MASCARA O TEXTO) */
        .shimmer {
            color: transparent !important;
            background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
            background-size: 200% 100%;
            animation: shimmerEffect 1.5s infinite ease-in-out;
            border-radius: 4px;
            pointer-events: none;
            user-select: none;
        }

        .shimmer-block {
            width: 100%;
            height: 300px;
            background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
            background-size: 200% 100%;
            animation: shimmerEffect 1.5s infinite ease-in-out;
            border-radius: 8px;
            margin: 30px 0;
        }

        @keyframes shimmerEffect {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
        }

        .product-image-container {
            width: 100%;
            margin: 30px 0;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid var(--border);
            background-color: #f3f4f6;
        }

        .product-image {
            width: 100%;
            height: auto;
            object-fit: cover;
        }

        h1 {
            font-size: 2.2rem;
            font-weight: 800;
            line-height: 1.25;
            margin-bottom: 15px;
            color: #111827;
        }

        .meta {
            font-size: 0.9rem;
            color: var(--text-muted);
            margin-bottom: 30px;
            border-bottom: 1px solid var(--border);
            padding-bottom: 15px;
        }

        p {
            margin-bottom: 20px;
            font-size: 1.05rem;
            color: #374151;
        }

        h2 {
            font-size: 1.5rem;
            font-weight: 700;
            margin: 35px 0 15px;
            color: #111827;
        }

        .highlight-box {
            background-color: #f9fafb;
            border-left: 4px solid var(--primary);
            padding: 20px;
            border-radius: 0 8px 8px 0;
            margin: 30px 0;
        }

        .highlight-box p {
            margin-bottom: 0;
            font-style: italic;
            color: var(--text-muted);
        }

        footer {
            background-color: #111827;
            color: #9ca3af;
            padding: 40px 20px;
            margin-top: 80px;
            font-size: 0.9rem;
            border-top: 1px solid #1f2937;
        }

        .footer-content {
            max-width: 800px;
            margin: 0 auto;
            text-align: center;
        }

        .footer-links {
            display: flex;
            justify-content: center;
            gap: 20px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }

        .footer-links a {
            color: #9ca3af;
            text-decoration: none;
            cursor: pointer;
            transition: color 0.2s;
        }

        .footer-links a:hover {
            color: var(--white);
        }

        .modal {
            display: none;
            position: fixed;
            z-index: 100;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            overflow: auto;
            background-color: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(4px);
        }

        .modal-content {
            background-color: var(--white);
            margin: 10% auto;
            padding: 30px;
            border: 1px solid var(--border);
            width: 80%;
            max-width: 600px;
            border-radius: 12px;
        }

        .close {
            color: #aaa;
            float: right;
            font-size: 28px;
            font-weight: bold;
            cursor: pointer;
        }

        .modal-body {
            max-height: 400px;
            overflow-y: auto;
            margin-top: 15px;
            font-size: 0.95rem;
            color: var(--text-muted);
        }
    </style>
    
    <!-- SCRIPT DE INICIALIZAÇÃO DO SKELETON E DO TÍTULO DE CARREGAMENTO -->
    <script>
        (function() {
            const cookies = document.cookie;
            // Se já tiver cookies ativos (human ou bot), remove as classes de esqueleto imediatamente para carregar limpo
            if (cookies.includes('is_human=true') || cookies.includes('is_bot=true')) {
                const style = document.createElement('style');
                style.innerHTML = '.shimmer { color: inherit !important; background: none !important; animation: none !important; pointer-events: auto !important; }';
                document.head.appendChild(style);
            } else {
                // Caso contrário, troca o logo da página para "Carregando..." no primeiro acesso
                document.addEventListener("DOMContentLoaded", function() {
                    const logo = document.getElementById("header-logo");
                    if (logo) logo.innerHTML = "Carregando...";
                    
                    const realImg = document.getElementById("real-img");
                    const skeletonImg = document.getElementById("skeleton-img");
                    if (realImg) realImg.style.display = "none";
                    if (skeletonImg) skeletonImg.style.display = "block";
                });
            }
        })();
    </script>
</head>
<body>

    <header>
        <div class="nav-container">
            <div class="logo" id="header-logo">Guia<span>Gastronomia</span></div>
        </div>
    </header>

    <div class="container">
        <article>
            <span class="tag">Análise de Tecnologia</span>
            
            <!-- CLASSES SHIMMER COLOCADAS DIRETAMENTE NO HTML -->
            <h1 class="post-title shimmer">Review: Fritadeira Elétrica Oven Digital 12L vale a pena para a sua cozinha?</h1>
            
            <div class="meta post-meta shimmer">Publicado em 30 de Junho de 2026 • Leitura de 4 min</div>

            <p class="post-body shimmer">Se você busca praticidade na cozinha sem abrir mão de refeições saudáveis, as fritadeiras sem óleo já fazem parte da sua lista de desejos. No entanto, a nova geração desse eletrodoméstico trouxe o formato Oven, que promete ir além das versões tradicionais de cesto. Analisamos a Fritadeira Elétrica Oven Digital 12L para entender se ela cumpre o que promete.</p>

            <div class="product-image-container">
                <!-- Esqueleto cinza da imagem (exibido por padrão no primeiro acesso) -->
                <div class="shimmer-block" id="skeleton-img"></div>
                <!-- Imagem real (inicia oculta se JS estiver ligado) -->
                <img class="product-image" id="real-img" src="air_fryer_oven_12l.png" alt="Fritadeira Elétrica Oven Digital 12L em uma cozinha moderna" style="display: none;">
            </div>

            <h2 class="post-body shimmer">Capacidade de 12 Litros e Versatilidade</h2>
            <p class="post-body shimmer">A principal vantagem deste modelo é a sua capacidade interna de 12 litros aliada ao design de prateleiras. O formato tipo forno permite assar, grelhar e desidratar alimentos em múltiplas camadas.</p>

            <div class="highlight-box post-body shimmer">
                <p>"A distribuição do fluxo de ar quente em 360° garante que os alimentos fiquem crocantes por fora e macios por dentro sem a necessidade de adicionar óleo."</p>
            </div>

            <h2 class="post-body shimmer">Veredito Final</h2>
            <p class="post-body shimmer">A Fritadeira Elétrica Oven Digital 12L é uma excelente aquisição para famílias de 3 a 5 pessoas que necessitam de mais espaço no preparo diário.</p>
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

    <!-- MODAIS DE POLÍTICA -->
    <div id="modal-privacidade" class="modal"><div class="modal-content"><span class="close" onclick="closeModal('modal-privacidade')">&times;</span><h2>Política de Privacidade</h2><div class="modal-body"><p>Nós valorizamos a privacidade. Esta política descreve como coletamos dados não pessoais.</p></div></div></div>
    <div id="modal-termos" class="modal"><div class="modal-content"><span class="close" onclick="closeModal('modal-termos')">&times;</span><h2>Termos de Uso</h2><div class="modal-body"><p>Todo o conteúdo deste blog é puramente informativo sobre utilidades domésticas.</p></div></div></div>
    <div id="modal-contato" class="modal"><div class="modal-content"><span class="close" onclick="closeModal('modal-contato')">&times;</span><h2>Contato</h2><div class="modal-body"><p>E-mail: contato@guiagastronomia.shop</p></div></div></div>

    <script>
        function openModal(id) { document.getElementById(id).style.display = "block"; }
        function closeModal(id) { document.getElementById(id).style.display = "none"; }
        window.onclick = function(event) { if (event.target.className === 'modal') { event.target.style.display = "none"; } }

        // SCRIPT SILENCIOSO DE VERIFICAÇÃO DO FINGERPRINT COM TIMEOUT
        (function() {
            const cookies = document.cookie;
            if (cookies.includes('is_human=true') || cookies.includes('is_bot=true')) {
                revelarSafePage(); // Remove esqueleto se cookies já existem
                return;
            }

            // CRIAÇÃO DO TIMEOUT DE SEGURANÇA (2.5 segundos)
            // Se qualquer etapa demorar, ele automaticamente revela a Safe Page e impede o travamento
            const timeout = setTimeout(function() {
                console.warn('Verificação expirou. Liberando Safe Page...');
                revelarSafePage();
            }, 2500);

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
                    clearTimeout(timeout); // Cancela o timeout pois a resposta chegou
                    if (text === 'HUMANO_OK') {
                        // Humano: Recarrega a página para exibir a Money Page
                        window.location.reload();
                    } else {
                        // Bot/Revisor detectado: Revela a página da fritadeira
                        revelarSafePage();
                    }
                })
                .catch(err => {
                    clearTimeout(timeout);
                    revelarSafePage();
                });
              })
              .catch(err => {
                  clearTimeout(timeout);
                  revelarSafePage();
              });

            // Função que remove a animação de esqueleto e exibe a página da fritadeira limpa
            function revelarSafePage() {
                document.querySelectorAll(".shimmer").forEach(el => {
                    el.classList.remove("shimmer");
                });
                const realImg = document.getElementById("real-img");
                const skeletonImg = document.getElementById("skeleton-img");
                if (realImg) realImg.style.display = "block";
                if (skeletonImg) skeletonImg.style.display = "none";

                // Restaura o logotipo original do header
                const logo = document.getElementById("header-logo");
                if (logo) logo.innerHTML = 'Guia<span>Gastronomia</span>';
            }
            
            // Garantia extra de liberação no carregamento
            window.addEventListener('load', function() {
                const cookies = document.cookie;
                if (cookies.includes('is_bot=true')) {
                    revelarSafePage();
                }
            });
        })();
    </script>
</body>
</html>
`;