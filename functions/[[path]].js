export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    // ==========================================
    // 1. O JAVASCRIPT VALIDOU O HUMANO (Seta o Cookie)
    // ==========================================
    if (url.pathname === '/verify_human') {
        const headers = new Headers();
        headers.append('Set-Cookie', `is_human=true; Path=/; HttpOnly; Secure; SameSite=Lax`);
        headers.append('Content-Type', 'text/plain');
        return new Response('HUMANO_OK', { status: 200, headers: headers });
    }

    // Se já tem o cookie, libera a Money Page inteira (HTML, CSS, Imagens)
    const cookies = request.headers.get('Cookie') || '';
    if (cookies.includes('is_human=true')) {
        // O 'env.ASSETS' já existe nativamente no Pages Functions!
        return env.ASSETS.fetch(request); 
    }

    // ==========================================
    // 2. A TRIAGEM DO SEGURANÇA
    // ==========================================
    const userAgent = request.headers.get('User-Agent') || '';
    const cf = request.cf || {}; 
    
    const isBrazil = cf.country === 'BR';
    const isBotUA = /bot|crawl|spider|facebookexternalhit|HeadlessChrome|tiktok/i.test(userAgent) || userAgent === '';
    
    // Bloqueia ASNs de Datacenter (AWS, Google, Azure, ByteDance)
    const datacenterASNs = [14618, 15169, 16509, 36459, 8075];
    const isDatacenter = datacenterASNs.includes(cf.asn);

    if (!isBrazil || isDatacenter || isBotUA) {
        // É Bot/Revisor. Mostra a Safe Page
        return new Response(SAFE_PAGE_HTML, { headers: { 'Content-Type': 'text/html' } });
    } else {
        // É visitante. Mostra a página de Interrogatório
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
            let isHuman = false;
            
            function checkGPU() {
                try {
                    let canvas = document.createElement('canvas');
                    let gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                    if (!gl) return false;
                    let debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                    let renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL).toLowerCase();
                    let fakeGPUs = ['swiftshader', 'mesa', 'llvmpipe'];
                    return !fakeGPUs.some(gpu => renderer.includes(gpu));
                } catch (e) { return false; }
            }

            if (!checkGPU() || navigator.webdriver === true) {
                document.body.innerHTML = "<h1>Erro 404</h1>";
                return;
            }

            const isMobileUA = /Android|iPhone|iPad/i.test(navigator.userAgent);

            function validarHumano() {
                if (isHuman) return;
                isHuman = true;
                fetch('/verify_human', { method: 'POST' })
                .then(res => res.text())
                .then(text => {
                    if (text === 'HUMANO_OK') {
                        window.location.reload(); 
                    }
                });
            }

            document.addEventListener('mousemove', function() {
                if (isMobileUA) { 
                    document.body.innerHTML = "<h1>Erro 404</h1>";
                    return;
                }
                validarHumano();
            });

            document.addEventListener('touchstart', validarHumano, { passive: true });
            document.addEventListener('touchmove', validarHumano, { passive: true });
            window.addEventListener('scroll', validarHumano, { passive: true });

            setTimeout(() => { if (!isHuman) document.body.innerHTML = "<h1>Erro 404</h1>"; }, 6000);
        })();
    </script>
</body>
</html>
`;