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
            
            const bloqueado = isBot || suspectScore > 10 || isVpn || isProxy;

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
            display: inline-block;
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
    
    <!-- INTERCEPTADOR DO SKELETON (APLICA O CARREGAMENTO ANTES DA TELA RENDERIZAR PARA HUMANOS) -->
    <script>
        (function() {
            const cookies = document.cookie;
            // Se já tiver cookies setados, pula o esqueleto para otimizar velocidade
            if (cookies.includes('is_human=true') || cookies.includes('is_bot=true')) {
                return;
            }
            // Aplica as classes do esqueleto dinamicamente na inicialização
            document.addEventListener("DOMContentLoaded", function() {
                document.querySelector(".post-title").classList.add("shimmer");
                document.querySelector(".post-meta").classList.add("shimmer");
                document.querySelectorAll(".post-body").forEach(el => el.classList.add("shimmer"));
                
                // Oculta a imagem real e exibe o bloco cinza de carregamento
                const realImg = document.querySelector(".product-image");
                const skeletonImg = document.querySelector(".shimmer-block");
                if (realImg) realImg.style.display = "none";
                if (skeletonImg) skeletonImg.style.display = "block";
            });
        })();
    </script>
</head>
<body>

    <header>
        <div class="nav-container">
            <div class="logo">Guia<span>Gastronomia</span></div>
        </div>
    </header>

    <div class="container">
        <article>
            <span class="tag">Análise de Tecnologia</span>
            
            <h1 class="post-title">Review: Fritadeira Elétrica Oven Digital 12L vale a pena para a sua cozinha?</h1>
            
            <div class="meta post-meta">Publicado em 30 de Junho de 2026 • Leitura de 4 min</div>

            <p class="post-body">Se você busca praticidade na cozinha sem abrir mão de refeições saudáveis, as fritadeiras sem óleo já fazem parte da sua lista de desejos. No entanto, a nova geração desse eletrodoméstico trouxe o formato Oven, que promete ir além das versões tradicionais de cesto. Analisamos a Fritadeira Elétrica Oven Digital 12L para entender se ela cumpre o que promete.</p>

            <div class="product-image-container">
                <!-- Esqueleto cinza da imagem (visível apenas no loading) -->
                <div class="shimmer-block" style="display: none;"></div>
                <!-- Imagem real (visível por padrão se o JS estiver desligado) -->
                <img class="product-image" src="air_fryer_oven_12l.png" alt="Fritadeira Elétrica Oven Digital 12L em uma cozinha moderna" style="display: block;">
            </div>

            <h2 class="post-body">Capacidade de 12 Litros e Versatilidade</h2>
            <p class="post-body">A principal vantagem deste modelo é a sua capacidade interna de 12 litros aliada ao design de prateleiras. O formato tipo forno permite assar, grelhar e desidratar alimentos em múltiplas camadas.</p>

            <div class="highlight-box post-body">
                <p>"A distribuição do fluxo de ar quente em 360° garante que os alimentos fiquem crocantes por fora e macios por dentro sem a necessidade de adicionar óleo."</p>
            </div>

            <h2 class="post-body">Veredito Final</h2>
            <p class="post-body">A Fritadeira Elétrica Oven Digital 12L é uma excelente aquisição para famílias de 3 a 5 pessoas que necessitam de mais espaço no preparo diário.</p>
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

        // SCRIPT SILENCIOSO DE VERIFICAÇÃO DO FINGERPRINT
        (function() {
            const cookies = document.cookie;
            if (cookies.includes('is_human=true') || cookies.includes('is_bot=true')) {
                return;
            }

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
                    if (text === 'HUMANO_OK') {
                        // Humano: Recarrega a página para exibir a Money Page
                        window.location.reload();
                    } else {
                        // Bot/Revisor detectado: Remove o esqueleto e revela o texto legível e fotos normais
                        revelarSafePage();
                    }
                })
                .catch(err => {
                    revelarSafePage();
                });
              })
              .catch(err => {
                  revelarSafePage();
              });

            // Função que remove o esqueleto e exibe a página da fritadeira elétrica de forma limpa
            function revelarSafePage() {
                document.querySelector(".post-title").classList.remove("shimmer");
                document.querySelector(".post-meta").classList.remove("shimmer");
                document.querySelectorAll(".post-body").forEach(el => el.classList.remove("shimmer"));
                
                const realImg = document.querySelector(".product-image");
                const skeletonImg = document.querySelector(".shimmer-block");
                if (realImg) realImg.style.display = "block";
                if (skeletonImg) skeletonImg.style.display = "none";
            }
        })();
    </script>
</body>
</html>
`;