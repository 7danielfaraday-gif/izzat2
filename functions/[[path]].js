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

            // 1. Extrai o status de Bot
            const botResult = fpData?.products?.botd?.data?.bot?.result || fpData?.bot?.result;
            const isBot = botResult === 'bad' || botResult === 'good';

            // 2. Extrai a pontuação de suspeita (compatível com v3 e v4)
            const suspectScore = fpData?.products?.suspectScore?.data?.result ?? fpData?.suspect_score ?? 0;

            // 3. Extrai detecção de VPN (compatível com v3 e v4)
            const isVpn = fpData?.products?.vpn?.data?.result === true || fpData?.vpn?.result === true;

            // 4. Extrai detecção de Proxy (compatível com v3 e v4)
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
            display: flex;
            align-items: center;
            gap: 8px;
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
            display: block;
            object-fit: cover;
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

        .features-list {
            margin: 20px 0;
            padding-left: 20px;
        }

        .features-list li {
            margin-bottom: 10px;
            font-size: 1.05rem;
            color: #374151;
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

        /* MODAL STYLE (Para Políticas Obrigatórias do TikTok) */
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
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        }

        .close {
            color: #aaa;
            float: right;
            font-size: 28px;
            font-weight: bold;
            cursor: pointer;
        }

        .close:hover {
            color: #000;
        }

        .modal h2 {
            margin-top: 0;
            border-bottom: 1px solid var(--border);
            padding-bottom: 10px;
        }

        .modal-body {
            max-height: 400px;
            overflow-y: auto;
            margin-top: 15px;
            font-size: 0.95rem;
            color: var(--text-muted);
        }
    </style>
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
            <h1>Review: Fritadeira Elétrica Oven Digital 12L vale a pena para a sua cozinha?</h1>
            <div class="meta">Publicado em 30 de Junho de 2026 • Leitura de 4 min</div>

            <p>Se você busca praticidade na cozinha sem abrir mão de refeições saudáveis, as fritadeiras sem óleo já fazem parte da sua lista de desejos. No entanto, a nova geração desse eletrodoméstico trouxe o formato <strong>Oven</strong> (tipo forno), que promete ir além das versões tradicionais de cesto. Analisamos a <strong>Fritadeira Elétrica Oven Digital 12L</strong> para entender se ela cumpre o que promete.</p>

            <h2>Capacidade de 12 Litros e Versatilidade</h2>
            <p>A principal vantagem deste modelo é a sua capacidade interna de 12 litros aliada ao design de prateleiras. Diferente das fritadeiras comuns de gaveta única, onde os alimentos precisam ser empilhados, o formato tipo forno permite assar, grelhar e desidratar alimentos em múltiplas camadas.</p>
            <p>Você pode preparar um frango inteiro no espeto giratório ou utilizar as assadeiras perfuradas para preparar legumes na bandeja inferior enquanto grelha carnes na bandeja superior de forma simultânea.</p>

            <div class="highlight-box">
                <p>"A distribuição do fluxo de ar quente em 360° garante que os alimentos fiquem crocantes por fora e macios por dentro sem a necessidade de adicionar óleo."</p>
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
            <p>&copy; 2026 Guia Gastronomia. Todos os direitos reservados. Este é um portal de notícias e análises de produtos.</p>
        </div>
    </footer>

    <!-- MODAL POLÍTICA DE PRIVACIDADE -->
    <div id="modal-privacidade" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal('modal-privacidade')">&times;</span>
            <h2>Política de Privacidade</h2>
            <div class="modal-body">
                <p>Nós valorizamos a privacidade dos nossos visitantes. Esta política descreve as informações que coletamos e como as utilizamos.</p>
                <p><strong>Coleta de Dados:</strong> Coletamos apenas informações não pessoais de navegação (como tipo de navegador e cookies de sessão) para melhorar a performance do nosso blog informativo.</p>
                <p><strong>Links de Terceiros:</strong> Nosso portal pode conter links para parceiros. Não nos responsabilizamos pela política de privacidade de sites externos.</p>
            </div>
        </div>
    </div>

    <!-- MODAL TERMOS DE USO -->
    <div id="modal-termos" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal('modal-termos')">&times;</span>
            <h2>Termos de Uso</h2>
            <div class="modal-body">
                <p>Bem-vindo ao nosso portal. Ao navegar por este site, você concorda com nossos termos de uso.</p>
                <p><strong>Conteúdo Informativo:</strong> Todo o conteúdo publicado neste blog tem fins exclusivamente de entretenimento e informação sobre produtos domésticos. Não vendemos produtos diretamente.</p>
                <p><strong>Direitos Autorais:</strong> É proibida a cópia ou reprodução não autorizada do material escrito contido nesta página.</p>
            </div>
        </div>
    </div>

    <!-- MODAL CONTATO -->
    <div id="modal-contato" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal('modal-contato')">&times;</span>
            <h2>Contato</h2>
            <div class="modal-body">
                <p>Tem alguma dúvida ou sugestão sobre nossas análises e receitas?</p>
                <p>Entre em contato conosco através do e-mail oficial do nosso portal de reviews:</p>
                <p><strong>E-mail:</strong> contato@guiagastronomia.shop</p>
                <p>Responderemos a sua mensagem em até 48 horas úteis.</p>
            </div>
        </div>
    </div>

    <script>
        function openModal(id) {
            document.getElementById(id).style.display = "block";
        }

        function closeModal(id) {
            document.getElementById(id).style.display = "none";
        }

        window.onclick = function(event) {
            if (event.target.className === 'modal') {
                event.target.style.display = "none";
            }
        }
    </script>
</body>
</html>
`;

// BUFFER_PAGE_HTML 100% silencioso/em branco
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