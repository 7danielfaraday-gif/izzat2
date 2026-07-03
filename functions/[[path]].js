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
// A SAFE PAGE (IZZA ELETROS - BLOG DE ANÁLISE TÉCNICA)
// ==========================================
const SAFE_PAGE_HTML = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Análise Izza Eletros: Fritadeira Oven Digital 12L - Vale a Pena?</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #f97316;
            --primary-dark: #ea580c;
            --primary-light: #fff7ed;
            --background: #ffffff;
            --text-main: #1f2937;
            --text-muted: #4b5563;
            --text-light: #9ca3af;
            --white: #ffffff;
            --border: #e5e7eb;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Inter', sans-serif;
            background-color: var(--background);
            color: var(--text-main);
            line-height: 1.7;
            -webkit-font-smoothing: antialiased;
        }

        header {
            background-color: var(--white);
            border-bottom: 1px solid var(--border);
            position: sticky; top: 0; z-index: 10;
        }

        .nav-container {
            max-width: 1100px; margin: 0 auto; padding: 18px 20px;
            display: flex; justify-content: space-between; align-items: center;
        }

        .logo { 
            font-weight: 800; font-size: 1.4rem; color: var(--text-main); 
            display: flex; align-items: center; gap: 8px; text-transform: uppercase;
            letter-spacing: -0.5px;
        }
        .logo span { color: var(--primary); }

        .container { max-width: 800px; margin: 50px auto; padding: 0 20px; }

        article { background-color: var(--white); }

        .tag {
            display: inline-block; background-color: var(--primary-light); color: var(--primary-dark);
            font-size: 0.8rem; font-weight: 600; padding: 6px 14px; border-radius: 4px;
            margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.05em;
        }

        h1 { font-size: 2.4rem; font-weight: 800; line-height: 1.2; margin-bottom: 15px; color: #111827; letter-spacing: -1px; }
        
        .meta { 
            font-size: 0.9rem; color: var(--text-light); margin-bottom: 40px; 
            border-bottom: 1px solid var(--border); padding-bottom: 20px;
            display: flex; align-items: center; gap: 10px;
        }
        .meta-author { font-weight: 600; color: var(--text-muted); }

        .product-image-container { width: 100%; margin: 40px 0; border-radius: 4px; overflow: hidden; }
        .product-image { width: 100%; height: auto; display: block; object-fit: cover; }

        p { margin-bottom: 24px; font-size: 1.1rem; color: #374151; }

        h2 { font-size: 1.8rem; font-weight: 700; margin: 50px 0 20px; color: #111827; letter-spacing: -0.5px; }

        .features-list { margin: 20px 0 40px; padding-left: 0; list-style: none; }
        .features-list li { 
            margin-bottom: 15px; font-size: 1.05rem; color: #374151; 
            padding-left: 30px; position: relative;
        }
        .features-list li::before {
            content: "✓"; color: var(--primary); font-weight: 800;
            position: absolute; left: 0; top: 0;
        }

        .highlight-box { 
            background-color: var(--primary-light); border-left: 4px solid var(--primary); 
            padding: 25px; border-radius: 0 4px 4px 0; margin: 40px 0; 
        }
        .highlight-box p { margin-bottom: 0; font-style: normal; color: var(--text-muted); font-weight: 500; }
        
        .offer-cta-container { text-align: left; margin: 50px 0; padding: 30px; background: #f9fafb; border: 1px solid var(--border); border-radius: 8px; }
        .offer-cta {
            background-color: var(--primary); color: white; padding: 16px 32px;
            text-decoration: none; border-radius: 4px; font-weight: 600; font-size: 1.1rem;
            display: inline-block; transition: background-color 0.2s;
        }
        .offer-cta:hover { background-color: var(--primary-dark); }
        .offer-cta-sub { font-size: 0.85rem; color: var(--text-light); margin-top: 12px; }

        footer { background-color: #111827; color: #9ca3af; padding: 60px 20px 30px; margin-top: 80px; font-size: 0.9rem; }
        .footer-content { max-width: 800px; margin: 0 auto; }
        .footer-cols { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 40px; margin-bottom: 40px; }
        .footer-col h4 { color: white; font-size: 1rem; margin-bottom: 15px; font-weight: 600; }
        .footer-col p, .footer-col a { color: #9ca3af; text-decoration: none; margin-bottom: 8px; display: block; font-size: 0.85rem; line-height: 1.5; }
        .footer-col a:hover { color: var(--primary); }
        
        .footer-bottom { border-top: 1px solid #374151; padding-top: 20px; text-align: center; font-size: 0.8rem; color: #6b7280; }
        .footer-links-nav { display: flex; justify-content: center; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; }
        .footer-links-nav a { color: #d1d5db; text-decoration: none; cursor: pointer; font-size: 0.9rem; }
        .footer-links-nav a:hover { color: var(--primary); }

        .modal { display: none; position: fixed; z-index: 100; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px); }
        .modal-content { background-color: var(--white); margin: 5% auto; padding: 40px; border: 1px solid var(--border); width: 90%; max-width: 600px; border-radius: 8px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); }
        .close { color: #aaa; float: right; font-size: 28px; font-weight: bold; cursor: pointer; line-height: 1; }
        .close:hover { color: #000; }
        .modal h2 { margin-top: 0; margin-bottom: 20px; font-size: 1.5rem; color: #111827; border-bottom: 1px solid var(--border); padding-bottom: 15px; }
        .modal-body p { font-size: 0.95rem; color: var(--text-muted); margin-bottom: 15px; line-height: 1.6; }

        #cloaker-loader {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: #ffffff; z-index: 99999; display: flex;
            justify-content: center; align-items: center; flex-direction: column;
        }
        .shop-spinner {
            width: 50px; height: 50px; border: 5px solid #f3f3f3;
            border-top-color: var(--primary); border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        .loader-text {
            font-family: 'Inter', sans-serif; color: var(--text-muted); margin-top: 20px; font-size: 14px; font-weight: 500;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
</head>
<body>

    <div id="cloaker-loader">
        <div class="shop-spinner"></div>
        <p class="loader-text">Carregando conteúdo...</p>
    </div>

    <header>
        <div class="nav-container">
            <div class="logo">Izza<span>Eletros</span></div>
        </div>
    </header>

    <div class="container">
        <article>
            <span class="tag">Análise de Eletrodomésticos</span>
            <h1>Fritadeira Oven Digital 12L: Análise Completa e Veredito</h1>
            <div class="meta">
                <span class="meta-author">Redação Izza Eletros</span> • 
                <span>Atualizado em Junho de 2026</span> • 
                <span>Leitura de 5 min</span>
            </div>

            <p>O mercado de eletrodomésticos tem visto uma rápida evolução nas fritadeiras sem óleo. Se antes o padrão era o formato de gaveta, agora os modelos "Oven" (estilo forno) ganharam destaque. Nesta análise, avaliamos a <strong>Fritadeira Oven Digital 12L</strong> para verificar se o design e a capacidade justificam a aquisição para a sua cozinha.</p>
            
            <div class="product-image-container">
                <img class="product-image" src="air_fryer_oven_12l.png" alt="Fritadeira Oven Digital 12L em ambiente de cozinha">
            </div>
            
            <h2>Design e Capacidade de 12 Litros</h2>
            <p>A principal diferença deste modelo em relação às fritadeiras convencionais é o formato cilíndrico de forno e a capacidade interna de 12 litros. Esse espaço extra é ideal para famílias maiores, permitindo o uso de múltiplas prateleiras simultaneamente. É possível assar proteínas na grelha superior enquanto legumes são preparados na bandeja inferior, otimizando o tempo de preparo das refeições.</p>
            <p>Outro ponto de destaque é o espeto giratório para carnes inteiras, como frangos de aproximadamente 1,5kg, garantindo um assamento mais homogêneo sem a necessidade de intervenção manual constante.</p>
            
            <div class="highlight-box">
                <p>A distribuição do fluxo de ar quente em 360° é a tecnologia central deste modelo, responsável por criar uma crosta externa crocante enquanto mantém a umidade interna dos alimentos.</p>
            </div>

            <div class="offer-cta-container">
                <p style="margin-bottom: 15px; font-size: 1rem; color: var(--text-main);"><strong>Disponibilidade e Preços Atualizados</strong></p>
                <a href="?auth=1" class="offer-cta">Ver Disponibilidade e Ofertas</a>
                <p class="offer-cta-sub">Os preços e estoques são atualizados diariamente pelos parceiros.</p>
            </div>

            <h2>Painel Digital e Funcionalidades</h2>
            <p>O painel de controle digital por toque oferece predefinições de tempo e temperatura para os alimentos mais comuns do dia a dia. O usuário também possui a opção de ajuste manual, com variação de temperatura entre 80°C e 200°C. O timer integrado suporta até 90 minutos e desliga o aparelho automaticamente ao final do ciclo, adicionando uma camada de segurança contra superaquecimento.</p>
            
            <h2>Principais Características Técnicas</h2>
            <ul class="features-list">
                <li>Funcionamento duplo: atua como fritadeira sem óleo de alta velocidade e como forno elétrico.</li>
                <li>Porta de vidro temperado duplo com luz interna LED para monitoramento visual sem perda de temperatura.</li>
                <li>Acessórios inclusos: espeto giratório, cesto de fritura e bandejas antiaderentes removível.</li>
                <li>Estrutura pensada para fácil higienização, com peças compatíveis com lava-louças.</li>
            </ul>
            
            <h2>Veredito da Redação</h2>
            <p>Após a análise técnica, concluímos que a Fritadeira Oven Digital 12L se mostra um equipamento robusto para quem busca versatilidade no preparo de alimentos. A substituição do formato de gaveta pelo formato forno resolve o problema de espaço para famílias de 3 a 5 pessoas. É uma opção viável para quem deseja unir as funções de airfryer e forno em um único eletrodoméstico na bancada da cozinha.</p>
        </article>
    </div>

    <footer>
        <div class="footer-content">
            <div class="footer-cols">
                <div class="footer-col">
                    <h4>Izza Eletros</h4>
                    <p>Portal especializado em análises e reviews de eletrodomésticos e tecnologia para o lar.</p>
                </div>
                <div class="footer-col">
                    <h4>Dados da Empresa</h4>
                    <p><strong>67.738.953 LUAN TONON MAIA</strong></p>
                    <p>CNPJ: 67.738.953/0001-22</p>
                    <p>Rua Caminho do Guaramar, 199</p>
                    <p>Praia Grande, São Paulo, BR</p>
                    <p>E-mail: luantononmaia1@hotmail.com</p>
                </div>
                <div class="footer-col">
                    <h4>Navegação</h4>
                    <a onclick="openModal('modal-privacidade')">Política de Privacidade</a>
                    <a onclick="openModal('modal-termos')">Termos de Uso</a>
                    <a onclick="openModal('modal-contato')">Fale Conosco</a>
                </div>
            </div>
            
            <div class="footer-bottom">
                <div class="footer-links-nav">
                    <a onclick="openModal('modal-privacidade')">Privacidade</a>
                    <a onclick="openModal('modal-termos')">Termos</a>
                    <a onclick="openModal('modal-contato')">Contato</a>
                </div>
                <p>&copy; 2026 Izza Eletros. Todos os direitos reservados. CNPJ 67.738.953/0001-22.</p>
                <p style="margin-top: 10px; font-size: 0.75rem; color: #6b7280;">Aviso de Transparência: O Izza Eletros pode participar de programas de afiliados, podendo receber comissões por compras realizadas através dos links divulgados. Isso não altera o preço final para o consumidor.</p>
            </div>
        </div>
    </footer>

    <div id="modal-privacidade" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal('modal-privacidade')">&times;</span>
            <h2>Política de Privacidade</h2>
            <div class="modal-body">
                <p>A Izza Eletros valoriza a privacidade de seus visitantes. Esta política descreve como coletamos e utilizamos seus dados.</p>
                <p><strong>Coleta de Dados:</strong> Utilizamos cookies e tecnologias semelhantes para melhorar a experiência de navegação, analisar o tráfego do site e personalizar o conteúdo. Os cookies podem ser gerenciados nas configurações do seu navegador.</p>
                <p><strong>Dados Pessoais:</strong> Não solicitamos dados pessoais diretamente neste portal. Caso entre em contato via e-mail, seus dados serão utilizados apenas para resposta à sua solicitação.</p>
                <p><strong>Links Externos:</strong> Este site contém links para sites de terceiros. Não nos responsabilizamos pelas práticas de privacidade de sites externos. Recomendamos ler as políticas dos referidos sites.</p>
                <p><strong>Contato:</strong> Para dúvidas sobre esta política, contato através do e-mail: luantononmaia1@hotmail.com</p>
            </div>
        </div>
    </div>

    <div id="modal-termos" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal('modal-termos')">&times;</span>
            <h2>Termos de Uso</h2>
            <div class="modal-body">
                <p>Ao acessar e navegar no portal Izza Eletros, você concorda com os termos e condições estabelecidos abaixo.</p>
                <p><strong>Natureza do Conteúdo:</strong> Todo o material publicado neste site, incluindo análises, reviews e artigos, tem caráter meramente informativo e de entretenimento. As opiniões expressas são baseadas em avaliações técnicas no momento da publicação.</p>
                <p><strong>Programa de Afiliados:</strong> O Izza Eletros participa de programas de afiliados. Podemos receber uma comissão caso você efetue uma compra através dos links disponíveis em nosso site. Isso não gera nenhum custo adicional a você.</p>
                <p><strong>Propriedade Intelectual:</strong> Todo o conteúdo original produzido pela redação do Izza Eletros é protegido por direitos autorais. A reprodução não autorizada é proibida.</p>
                <p><strong>Alterações:</strong> Reservamo-nos o direito de modificar estes termos a qualquer momento. Recomendamos revisões periódicas desta página.</p>
            </div>
        </div>
    </div>

    <div id="modal-contato" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal('modal-contato')">&times;</span>
            <h2>Fale Conosco</h2>
            <div class="modal-body">
                <p>Possui alguma dúvida, sugestão de pauta ou necessidade de suporte em relação às nossas análises?</p>
                <p>Estamos à disposição através dos canais oficiais da nossa empresa:</p>
                <p><strong>E-mail:</strong> luantononmaia1@hotmail.com</p>
                <p><strong>Endereço:</strong> Rua Caminho do Guaramar, 199, Praia Grande, São Paulo, BR</p>
                <p><strong>Razão Social:</strong> 67.738.953 LUAN TONON MAIA</p>
                <p>O prazo médio de resposta é de até 48 horas em dias úteis.</p>
            </div>
        </div>
    </div>

    <script>
        function openModal(id) {
            document.getElementById(id).style.display = 'block';
        }
        function closeModal(id) {
            document.getElementById(id).style.display = 'none';
        }
        window.onclick = function(event) {
            const modals = document.getElementsByClassName('modal');
            for (let i = 0; i < modals.length; i++) {
                if (event.target == modals[i]) {
                    modals[i].style.display = 'none';
                }
            }
        }

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