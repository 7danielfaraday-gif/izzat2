<?php
session_start();
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Carregando...</title>
    <style>
        body { font-family: sans-serif; padding: 20px; line-height: 1.6; color: #333; margin: 0; }
        .skeleton { background: #eee; height: 20px; margin-bottom: 15px; border-radius: 4px; width: 100%; }
        .skeleton-title { background: #eee; height: 40px; margin-bottom: 20px; width: 60%; border-radius: 4px; }
    </style>
</head>
<body>
    <h1>Conectando ao servidor...</h1>
    <p>Aguarde um instante.</p>
    <div class="skeleton-title"></div>
    <div class="skeleton"></div>
    <div class="skeleton"></div>
    <div class="skeleton" style="width: 80%;"></div>

    <script>
        (function() {
            let isHuman = false;
            
            // ==========================================
            // BLOCO 1: CHECAGEM DE HARDWARE (GPU)
            // ==========================================
            function checkGPU() {
                try {
                    let canvas = document.createElement('canvas');
                    let gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                    if (!gl) return false; // Sem WebGL? Bot antigo.
                    
                    let debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                    let renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL).toLowerCase();
                    
                    // Bots em servidores usam esses renderizadores falsos
                    let fakeGPUs = ['swiftshader', 'mesa', 'microsoft basic render', 'llvmpipe', 'virtualbox'];
                    for (let i = 0; i < fakeGPUs.length; i++) {
                        if (renderer.includes(fakeGPUs[i])) return false;
                    }
                    return true; // GPU real (Apple, Adreno, Mali, Intel, NVIDIA)
                } catch (e) {
                    return false; // Erro ao ler GPU? Suspeito.
                }
            }

            // Se a GPU for falsa, mata na hora
            if (!checkGPU()) {
                killBot();
                return;
            }

            // ==========================================
            // BLOCO 2: CHECAGEM DE AUTOMAÇÃO
            // ==========================================
            if (navigator.webdriver === true || navigator.languages.length === 0) {
                killBot();
                return;
            }

            // ==========================================
            // BLOCO 3: O PARADOXO (MOUSE VS TOUCH)
            // ==========================================
            const isMobileUA = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

            // Gatilho 1: Mouse se movendo
            document.addEventListener('mousemove', function() {
                if (isHuman) return;
                
                // O PARADOXO: Se o navegador diz ser Mobile, mas moveu o mouse... É um desktop fingindo ser mobile!
                if (isMobileUA) {
                    killBot(); // Pega bot do TikTok falsificando iPhone
                    return;
                }
                
                // Se for Desktop real e moveu o mouse, é humano
                validarHumano();
            });

            // Gatilho 2: Toque na tela (Mobile real)
            document.addEventListener('touchstart', function() {
                if (isHuman) return;
                validarHumano(); // Dedo encostou no vidro, é humano
            }, { passive: true });

            // Gatilho 3: Arrasto na tela (Mobile real)
            document.addEventListener('touchmove', function() {
                if (isHuman) return;
                validarHumano();
            }, { passive: true });

            // Gatilho 4: Rolagem (Scroll)
            window.addEventListener('scroll', function() {
                if (isHuman) return;
                validarHumano();
            }, { passive: true });

            // ==========================================
            // FUNÇÕES DE AÇÃO
            // ==========================================
            function validarHumano() {
                isHuman = true;
                let xhr = new XMLHttpRequest();
                xhr.open('POST', 'verify_human.php', true);
                xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
                xhr.onload = function() {
                    if (xhr.status === 200 && xhr.responseText === "HUMANO_OK") {
                        window.location.reload();
                    } else {
                        killBot();
                    }
                };
                xhr.send('token=humano_validado');
            }

            function killBot() {
                document.body.innerHTML = "<h1>Erro 404 - Recurso não encontrado</h1>";
            }

            // Tempo limite: 6 segundos
            setTimeout(function() {
                if (!isHuman) killBot();
            }, 6000);

        })();
    </script>
</body>
</html>