# Diagnostico de Forced Reflow / Layout Thrashing - V3

Data: 2026-05-27  
Projeto: `v3`  
Escopo: LP principal, checkout SPA, checkout direto `/c/`, CSS/JS proprio e principais scripts carregados.

Este relatorio nao aplica alteracoes funcionais. Ele documenta evidencias, suspeitas e patches sugeridos para revisao antes de qualquer mudanca em producao.

---

## 1. Resumo executivo

Estado geral: a V3 nao apresenta um padrao generalizado de layout thrashing no checkout. A instrumentacao runtime feita em fluxo mobile LP -> checkout SPA -> preenchimento de campos capturou apenas 1 caso de leitura de layout logo apos mutacao de DOM. Isso e bom: o problema nao parece ser "o formulario inteiro forca reflow o tempo todo".

Mesmo assim, existem pontos sensiveis:

1. **Listener de scroll da LP lendo `documentElement.scrollHeight` durante montagem React do checkout SPA.**  
   Evidencia runtime forte. Foi o unico read-after-write capturado dinamicamente.

2. **Abertura SPA do checkout usa polling por `innerHTML.length` / `textContent`, troca `display`, troca root React e revela wrapper.**  
   Suspeita alta por arquitetura. Nao apareceu como read-after-write no teste curto, mas e caminho critico e pode gerar recalc/layout em devices lentos.

3. **Deteccao de teclado via `visualViewport.resize` le altura e escreve CSS/class no mesmo callback.**  
   Suspeita alta para TikTok/Instagram WebView, porque o resize do teclado pode disparar varias vezes durante animacao.

4. **Scroll ate erro no checkout le `clientHeight`, `getBoundingClientRect` e depois chama `scrollTo`/`focus` no mesmo frame.**  
   Suspeita media/alta. E pontual, mas acontece exatamente quando o usuario falhou no formulario.

5. **Modais/lightbox fazem writes de `transform` em `touchmove`.**  
   Suspeita media. Nao afeta o checkout normal, mas pode causar jank quando modal esta aberto.

Prioridade de correcao:

- Fase 1: scroll listener da LP + throttle de `visualViewport.resize`.
- Fase 2: trocar polling de abertura do checkout por evento `checkout:ready`.
- Fase 3: suavizar scroll/focus de erro e touchmove de modais.
- Fase 4: CSS cleanup (`transition: all`, backdrop-filter onde nao essencial).

---

## 2. Stack e arquitetura analisada

### Stack

- Framework principal da LP: HTML/CSS/JavaScript vanilla.
- Checkout: React 18 UMD vendorizado localmente.
- Build system: nao ha `package.json` na pasta `v3`; projeto e essencialmente estatico + Cloudflare Pages Functions.
- CSS:
  - CSS inline grande em `index.html`.
  - CSS inline no checkout direto `c/index.html`.
  - CSS estatico Tailwind em `assets/css/tailwind-static.css`.
  - O arquivo `assets/vendor/tailwindcss.js` existe, mas **nao esta referenciado** em `index.html` nem em `c/index.html`.
- Server/runtime:
  - Cloudflare Pages Functions em `functions/api/*.js` e `functions/admin/index.js`.

### Paginas e fluxos criticos

- `index.html`: LP principal + SPA host do checkout.
- `c/index.html`: checkout direto.
- `assets/js/index.bundle.js`: UI da LP, galeria, microeventos, popups.
- `assets/js/checkout.app.js`: React checkout + PIX.
- `assets/js/metrics.ping.js`: metricas leves.
- `functions/api/tiktok-events.js`: CAPI/TikTok Events API.
- `functions/api/orders.js`: criacao/consulta de pedidos.
- `functions/admin/index.js`: painel.

### Limites da analise

- Foi feita analise estatica por `rg` e leitura manual dos trechos.
- Foi feita instrumentacao runtime com Playwright em mobile Pixel 5 em `https://izzatcasa.shop/?test_mode=1&lab=1`.
- Eventos de tracking externos foram bloqueados durante o teste para evitar ruido/side effects.
- A instrumentacao monkey-patch detecta muitos reads/writes, mas nao substitui um trace completo do Chrome DevTools com "Layout" e "Recalculate Style".

---

## 3. Metodo e comandos executados

Comandos principais:

```powershell
rg --files . -g "!perf-*" -g "!*.json" -g "!node_modules/**" -g "!.wrangler/**"
rg -n "offsetWidth|offsetHeight|offsetTop|offsetLeft|offsetParent|clientWidth|clientHeight|clientTop|clientLeft|scrollWidth|scrollHeight|scrollTop|scrollLeft|getBoundingClientRect|getClientRects|getComputedStyle|computedStyleMap|innerText|\\.focus\\(|\\.select\\(|visualViewport|matchMedia" .
rg -n "style\\.|classList\\.|setAttribute\\(|appendChild\\(|removeChild\\(|insertBefore\\(|replaceChild\\(|innerHTML|outerHTML|textContent|scrollTo\\(|scrollIntoView\\(|setProperty\\(" .
rg -n "addEventListener\\(|touchmove|mousemove|pointermove|scroll|resize|wheel|requestAnimationFrame|setInterval|setTimeout" .
rg -n "transition:\\s*all|@keyframes|animation|backdrop-filter|filter:|position:\\s*(fixed|sticky)|height:\\s*100(vh|dvh|svh)|min-height:\\s*100(vh|dvh|svh)|max-height|will-change|content-visibility|contain:" index.html c/index.html assets/css assets/js
rg -n "tailwindcss\\.js|tailwind-static\\.css|react\\.production|react-dom\\.production|checkout\\.app\\.js|index\\.bundle\\.js|metrics\\.ping\\.js|gtag|clarity|cloudflareinsights" index.html c/index.html assets/js
```

Runtime:

- Playwright Chromium emulando Pixel 5.
- Fluxo 1: LP -> scroll -> clique Comprar -> checkout SPA -> preenchimento parcial.
- Fluxo 2: LP -> checkout SPA -> tentativa de submit vazio.
- `api/tiktok-events`, `analytics.tiktok.com` e `googletagmanager.com` bloqueados no teste.

Resultado runtime principal:

```json
{
  "count": 1,
  "groups": {
    "appendChild -> scrollHeight": 1
  },
  "evidence": "React appendChild em checkout-root seguido de leitura documentElement.scrollHeight no scroll listener de assets/js/index.bundle.js:332"
}
```

---

## 4. Achados criticos

Nao encontrei P0/Critico confirmado por evidencia estatica + runtime.

Isto e importante: o checkout nao parece ter um loop de medicao/mutacao continuo durante digitacao. O risco maior esta nos pontos de borda: abertura SPA, teclado/viewport e handlers globais.

---

## 5. Achados altos

### AR-01 - Scroll listener da LP le layout durante montagem do checkout SPA

- Severidade: **Alto**
- Evidencia: **forte runtime**
- Arquivo: `assets/js/index.bundle.js`
- Linha aproximada: `330-340`

Trecho:

```js
window.addEventListener('scroll', function() {
    if (scroll50Fired) return;
    const scrollPercentage = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight * 100;
    if (scrollPercentage >= 50) {
        scroll50Fired = true;
        trackViaZaraz('ScrollDepth', {
            event_id: generateEventId(),
            depth: '50%'
        });
    }
}, { passive: true });
```

Por que pode causar forced reflow:

- `document.documentElement.scrollHeight` e uma leitura de layout.
- Durante a abertura SPA, o React monta o checkout e faz `appendChild` no `checkout-root`.
- Se o scroll handler roda nesse intervalo, o browser pode recalcular layout de forma sincrona para responder `scrollHeight`.

Evidencia runtime capturada:

```text
write: appendChild
read: scrollHeight
read stack: assets/js/index.bundle.js:332
write stack: react-dom.production.min.js appendChild em checkout-root
```

Caminho provavel:

1. Usuario rola LP.
2. Listener global continua ativo.
3. Usuario clica comprar.
4. React monta checkout.
5. Evento/estado de scroll ou ajuste de wrapper dispara leitura de `scrollHeight`.

Impacto esperado:

- Pode contribuir para pequenos stutters ao abrir checkout SPA.
- Pode aparecer no PageSpeed como "Reflow forcado" sem atribuicao clara.
- Em Android fraco/TikTok WebView, pode competir com renderizacao inicial do checkout.

Correcao recomendada:

- Throttle por `requestAnimationFrame`.
- Remover listener assim que disparar 50%.
- Opcional: pausar/remover listener ao abrir checkout.

Patch sugerido:

```diff
- window.addEventListener('scroll', function() {
+ let scrollDepthTicking = false;
+ function handleScrollDepth() {
    if (scroll50Fired) return;
-   const scrollPercentage = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight * 100;
-   if (scrollPercentage >= 50) {
-       scroll50Fired = true;
-       trackViaZaraz('ScrollDepth', {
-           event_id: generateEventId(),
-           depth: '50%'
-       });
-   }
- }, { passive: true });
+   if (scrollDepthTicking) return;
+   scrollDepthTicking = true;
+   requestAnimationFrame(function () {
+     scrollDepthTicking = false;
+     if (scroll50Fired) return;
+     const doc = document.documentElement;
+     const total = doc.scrollHeight || 1;
+     const scrollPercentage = (window.scrollY + window.innerHeight) / total * 100;
+     if (scrollPercentage >= 50) {
+       scroll50Fired = true;
+       window.removeEventListener('scroll', handleScrollDepth);
+       trackViaZaraz('ScrollDepth', {
+         event_id: generateEventId(),
+         depth: '50%'
+       });
+     }
+   });
+ }
+ window.addEventListener('scroll', handleScrollDepth, { passive: true });
```

Risco:

- Baixo. Mantem o mesmo evento, so reduz frequencia e remove apos uso.

Teste:

- Abrir LP mobile, rolar 50%, confirmar evento `ScrollDepth`.
- Abrir checkout via SPA e repetir instrumentacao.

---

### AR-02 - Abertura SPA do checkout usa polling por DOM/texto e writes de layout

- Severidade: **Alto**
- Evidencia: **estatica forte / runtime nao confirmou loop no teste curto**
- Arquivo: `index.html`
- Linhas aproximadas: `3049-3231`

Trechos relevantes:

```js
wrapper.setAttribute('data-state', 'opening');
if (sk) { sk.style.display = 'none'; sk.style.opacity = '1'; sk.style.transition = ''; }
if (root) { root.style.visibility = 'hidden'; root.style.opacity = '0'; root.style.pointerEvents = 'none'; }
```

```js
var rendered = !!(root && root.children && root.children.length > 0 && root.textContent && root.textContent.trim().length > 20);
...
setTimeout(check, 80);
```

```js
if (oldRoot && oldRoot.innerHTML.length > 0) {
  var newRoot = document.createElement('div');
  newRoot.id = 'checkout-root';
  oldRoot.parentNode.replaceChild(newRoot, oldRoot);
}
```

Por que pode causar forced reflow/layout invalidation:

- `style.display`, `visibility`, `opacity`, `pointerEvents`, `replaceChild`, `setAttribute` invalidam estilo/DOM.
- `root.textContent` e `root.innerHTML.length` percorrem conteudo do DOM. `innerHTML` tambem serializa arvore e pode custar main thread.
- O polling a cada 80/100ms durante abertura coloca trabalho repetido exatamente no caminho critico do checkout.

Evidencia:

- Leitura estatica mostra polling.
- Runtime capturou concorrencia entre React mount e scroll listener, indicando que a janela de montagem e sensivel.
- PageSpeed reporta reflow forcado com parte sem atribuicao; este padrao e candidato plausivel.

Caminho provavel:

1. `spaOpenCheckout` esconde LP.
2. Mostra wrapper.
3. Troca URL.
4. Reseta flags React.
5. Possivelmente substitui `checkout-root`.
6. Inicia React.
7. Polling le `innerHTML`/`textContent` ate considerar pronto.

Impacto esperado:

- Stutter ao abrir checkout.
- Mais variabilidade no PageSpeed/TBT em runs diferentes.
- Em WebView, pode concorrer com resize/viewport e carregamento de React.

Correcao recomendada:

- Trocar polling por evento disparado pelo checkout quando o React montou.
- Exemplo: no `checkout.app.js`, apos o primeiro commit do App, disparar `window.dispatchEvent(new CustomEvent('checkout:rendered'))`.
- No host `index.html`, ouvir esse evento com timeout fallback.

Patch sugerido:

```diff
// assets/js/checkout.app.js, dentro de App()
+ useEffect(() => {
+   try { window.dispatchEvent(new CustomEvent('checkout:rendered')); } catch(e) {}
+ }, []);
```

```diff
// index.html
- setTimeout(revealCheckoutAfterReact, 300);
- watchCheckoutRender(6500, checkoutStylesReady);
+ var revealed = false;
+ function revealOnce() {
+   if (revealed) return;
+   revealed = true;
+   checkoutStylesReady.then(function () {
+     requestAnimationFrame(function () {
+       requestAnimationFrame(setCheckoutReadyState);
+     });
+   });
+ }
+ window.addEventListener('checkout:rendered', revealOnce, { once: true });
+ setTimeout(revealOnce, 6500);
```

Risco:

- Medio. Mexe na abertura SPA, precisa teste cuidadoso LP -> checkout, voltar, reabrir, deep link `/c/`.

Teste:

- LP -> Comprar -> checkout aparece.
- Voltar do browser -> LP aparece.
- Reabrir checkout.
- Abrir direto `/c/`.
- TikTok in-app / Android / iPhone.

---

### AR-03 - `visualViewport.resize` le altura e escreve CSS/class no mesmo callback

- Severidade: **Alto**
- Evidencia: **estatica forte**
- Arquivos:
  - `index.html`
  - `c/index.html`
- Linhas:
  - `index.html:2759-2774`
  - `c/index.html:483-515`

Trecho LP:

```js
vv.addEventListener('resize', function () {
    var ch = vv.height;
    if (ch > INITIAL_H) INITIAL_H = ch;
    var d = INITIAL_H - ch;
    if (d > 150) {
        document.documentElement.style.setProperty('--keyboard-height', d + 'px');
        document.body.classList.add('keyboard-open');
    } else {
        document.body.classList.remove('keyboard-open');
        document.documentElement.style.setProperty('--keyboard-height', '0px');
    }
});
```

Por que pode causar forced reflow/layout invalidation:

- `visualViewport.height` e leitura de viewport/layout.
- `style.setProperty` e `classList.add/remove` invalidam estilo.
- `resize` do teclado pode disparar varias vezes durante animacao.
- No TikTok in-app browser, viewport/keyboard e uma das areas mais instaveis.

Evidencia:

- Padrao read -> write no mesmo callback.
- Caminho quente durante teclado virtual.

Impacto esperado:

- Pulos ao focar campo.
- Pequenos stutters durante abertura/fechamento do teclado.
- Recalculos repetidos em WebView.

Correcao recomendada:

- rAF throttle.
- So escrever se o valor mudou.
- So alterar classe quando estado mudou.
- Usar arredondamento/limiar para evitar updates a cada pixel.

Patch sugerido:

```diff
+ var keyboardRaf = 0;
+ var lastKeyboardHeight = -1;
+ var lastKeyboardOpen = false;
 vv.addEventListener('resize', function () {
-  var ch = vv.height;
-  if (ch > INITIAL_H) INITIAL_H = ch;
-  var d = INITIAL_H - ch;
-  if (d > 150) {
-    document.documentElement.style.setProperty('--keyboard-height', d + 'px');
-    document.body.classList.add('keyboard-open');
-  } else {
-    document.body.classList.remove('keyboard-open');
-    document.documentElement.style.setProperty('--keyboard-height', '0px');
-  }
+  if (keyboardRaf) return;
+  keyboardRaf = requestAnimationFrame(function () {
+    keyboardRaf = 0;
+    var ch = vv.height;
+    if (ch > INITIAL_H) INITIAL_H = ch;
+    var raw = INITIAL_H - ch;
+    var d = raw > 150 ? Math.round(raw) : 0;
+    var open = d > 0;
+    if (d !== lastKeyboardHeight) {
+      lastKeyboardHeight = d;
+      document.documentElement.style.setProperty('--keyboard-height', d + 'px');
+    }
+    if (open !== lastKeyboardOpen) {
+      lastKeyboardOpen = open;
+      document.body.classList.toggle('keyboard-open', open);
+    }
+  });
 });
```

Risco:

- Baixo/medio. Mantem comportamento, mas muda timing. Precisa testar teclado mobile real.

Teste:

- Focar nome/email/telefone/CEP no checkout SPA.
- Confirmar sem salto excessivo.
- Testar iPhone Safari e TikTok in-app.

---

## 6. Achados medios

### MR-01 - Scroll/focus de erro no checkout mede layout e escreve scroll no mesmo frame

- Severidade: **Medio/Alto**
- Evidencia: **estatica forte / runtime nao reproduziu no teste de submit vazio**
- Arquivo: `assets/js/checkout.app.js`
- Linhas: `355-366`

Trecho:

```js
const errorElement = document.querySelector(`[name="${firstError}"]`);
if (errorElement) {
  requestAnimationFrame(() => { 
    const header = document.querySelector('.static-nav');
    const offset = header ? header.clientHeight + 60 : 120;
    const y = errorElement.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({top: Math.max(0, y), behavior: 'smooth'});
    errorElement.focus({preventScroll: true}); 
  });
}
```

Por que pode causar forced reflow:

- `header.clientHeight` e `errorElement.getBoundingClientRect()` sao leituras de layout.
- `window.scrollTo` e `focus` alteram posicao/foco.
- Ocorre em erro de formulario, momento sensivel para conversao.

Impacto:

- Pode gerar salto de scroll em teclado aberto.
- Pode competir com WebView tentando manter campo visivel.

Correcao recomendada:

- Cachear altura fixa da nav ou usar CSS `scroll-margin-top`.
- Separar leitura e escrita em frames distintos.
- Evitar chamar `focus` imediatamente apos smooth scroll se teclado ja estiver aberto.

Patch sugerido:

```diff
 requestAnimationFrame(() => {
   const header = document.querySelector('.static-nav');
   const offset = header ? header.clientHeight + 60 : 120;
   const y = errorElement.getBoundingClientRect().top + window.scrollY - offset;
-  window.scrollTo({top: Math.max(0, y), behavior: 'smooth'});
-  errorElement.focus({preventScroll: true});
+  requestAnimationFrame(() => {
+    window.scrollTo({top: Math.max(0, y), behavior: 'smooth'});
+    setTimeout(() => { try { errorElement.focus({preventScroll: true}); } catch(e) {} }, 120);
+  });
 });
```

Risco:

- Baixo/medio. Pode mudar sensacao do erro; testar formulario invalido.

---

### MR-02 - Auto-focus apos CEP resolvido

- Severidade: **Medio**
- Evidencia: **estatica**
- Arquivo: `assets/js/checkout.app.js`
- Linha: `286`

Trecho:

```js
setTimeout(() => { try { if(numberRef.current) numberRef.current.focus(); } catch(e){} }, 300);
```

Por que importa:

- `focus()` pode forcar layout/scroll e abrir teclado.
- Ocorre apos fetch ViaCEP, de forma assincrona.
- Em WebView, pode parecer "pulo" apos usuario terminar CEP.

Contexto:

- Este ponto ja havia sido classificado em revisoes anteriores como friccao de checkout.
- Nao e layout thrashing continuo, mas e uma mutacao de foco sensivel.

Correcao recomendada:

- Opcao conservadora: manter somente se o campo numero estiver visivel e nenhum outro input estiver ativo.
- Melhor: remover autofocus e deixar o usuario seguir naturalmente.

Patch sugerido:

```diff
- setTimeout(() => { try { if(numberRef.current) numberRef.current.focus(); } catch(e){} }, 300);
+ // Evitar roubar foco em WebView; usuario segue para numero manualmente.
```

Risco:

- Baixo para performance, mas pode alterar fluxo de preenchimento. Validar conversao antes/depois.

---

### MR-03 - Touchmove de lightbox escreve transform em todo evento

- Severidade: **Medio**
- Arquivo: `index.html`
- Linhas: `1975-1984`

Trecho:

```js
img.addEventListener('touchmove', function (e) {
    if (!lbDragging) return;
    lbCurY = e.touches[0].clientY;
    var diff = lbCurY - lbStartY;
    img.style.transform = 'translateY(' + diff + 'px)';
}, { passive: true });
```

Analise:

- Escreve `transform`, que e melhor que `top/height`, entao nao deve forcar layout por si.
- Mas ocorre em caminho quente `touchmove`.
- Pode causar jank se imagem grande/blur/backdrop estiver ativo.

Correcao recomendada:

- rAF throttle no transform.
- Manter `passive: true`.

Risco:

- Baixo.

---

### MR-04 - Touchmove de bottom sheets escreve transform em todo evento e le `scrollTop` no touchstart

- Severidade: **Medio**
- Arquivo: `index.html`
- Linhas: `2243-2273`

Trecho:

```js
sheet.addEventListener('touchstart', function (e) {
    if (sheet.scrollTop > 0) return;
    ...
    sheet.style.transition = 'none';
}, { passive: true });
...
if (diff > 0) sheet.style.transform = 'translateY(' + diff + 'px)';
```

Analise:

- `sheet.scrollTop` e leitura de layout/scroll.
- `transform` e write compositor-friendly, mas em alta frequencia.
- So afeta modais abertos.

Correcao recomendada:

- rAF throttle para transform.
- Nao ler `scrollTop` varias vezes; hoje le so no touchstart, aceitavel.

Risco:

- Baixo.

---

### MR-05 - Chat auto-scroll le `scrollHeight` e escreve `scrollTop`

- Severidade: **Medio/Baixo**
- Arquivo: `index.html`
- Linhas: `2222`, `2228`, `2238`

Trecho:

```js
setTimeout(function () { msgs.scrollTop = msgs.scrollHeight; }, 0);
```

Analise:

- Le `scrollHeight` e escreve `scrollTop`.
- E um padrao classico de layout read/write.
- Ocorre apenas quando o usuario interage com o chat.

Correcao recomendada:

- Encapsular em rAF e agrupar.
- Se quiser reduzir reflow: usar `msgs.lastElementChild.scrollIntoView({block:'end'})`, mas isso tambem mede internamente. Manter o atual e aceitavel se chat nao e critico.

Risco:

- Baixo.

---

### MR-06 - Galeria atualiza imagens/classes dentro de rAF, mas faz querySelectorAll a cada troca

- Severidade: **Medio/Baixo**
- Arquivo: `assets/js/index.bundle.js`
- Linhas: `513-532`

Trecho:

```js
requestAnimationFrame(() => {
  ...
  imageDots.querySelectorAll('.dot').forEach(...)
  imageThumbnails.querySelectorAll('.thumbnail').forEach(...)
});
```

Analise:

- Boa pratica: writes estao em rAF.
- O custo vem de `querySelectorAll` repetido e class toggles em varios elementos.
- Baixo risco porque ha poucas thumbnails.

Correcao recomendada:

- Cachear arrays `dots` e `thumbs` apos criacao.
- Manter rAF.

Risco:

- Baixo.

---

## 7. Achados baixos

### BR-01 - Fallback de copiar PIX cria textarea, seleciona e remove

- Severidade: **Baixo**
- Arquivos:
  - `index.html:2690-2701`
  - `c/index.html:548-572`

Analise:

- `appendChild`, `select()` e `removeChild` podem causar layout/foco.
- Ocorre apenas quando Clipboard API falha.
- E aceitavel como fallback de compatibilidade.

Recomendacao:

- Nao mexer sem necessidade.

---

### BR-02 - `transition: all` em CSS

- Severidade: **Baixo/Medio**
- Arquivo: `index.html`
- Linhas: `316`, `350`, `377`, `999`

Analise:

- `transition: all` nao forca reflow sozinho.
- Mas se classe altera propriedades de layout, o browser pode animar propriedade cara.

Recomendacao:

- Trocar por propriedades especificas: `transform`, `opacity`, `box-shadow`, `background-color`, `border-color`.

Risco:

- Baixo se feito seletivamente.

---

### BR-03 - `backdrop-filter` em overlays/nav

- Severidade: **Baixo/Medio**
- Arquivos:
  - `index.html:317`, `index.html:1165`
  - `c/index.html` CSS inline da `.static-nav`

Analise:

- Nao e forced reflow, mas e paint/compositor caro em mobile.
- Pode aumentar stutter quando combinado com fixed/sticky.

Recomendacao:

- Se visual permitir, reduzir blur ou substituir por fundo opaco.
- Nao e prioridade se o objetivo imediato e forced reflow.

---

### BR-04 - Arquivo `assets/vendor/tailwindcss.js` pesado existe mas nao e carregado

- Severidade: **Baixo**
- Evidencia: `rg` nao encontrou referencia ativa a `tailwindcss.js` em `index.html`/`c/index.html`.

Analise:

- Se voltasse a ser carregado, seria risco alto: runtime Tailwind usa observacao/mutacao de classes e compila no cliente.
- No estado atual, e asset morto/legado, nao afeta runtime.

Recomendacao:

- Pode entrar em limpeza futura, mas nao precisa mexer agora.

---

## 8. Padroes encontrados

### Read/write intercalado confirmado

- `React appendChild` -> `documentElement.scrollHeight` no scroll handler da LP.

### Read/write intercalado suspeito

- `visualViewport.height` -> `style.setProperty/classList` no mesmo callback.
- `clientHeight/getBoundingClientRect` -> `scrollTo/focus` no erro do checkout.
- `scrollHeight` -> `scrollTop` no chat.

### Loops problematicos

- Nenhum loop critico com medicao + mutacao item a item foi confirmado.
- Galeria faz loops de class toggle, mas em quantidade pequena.

### Handlers quentes

- `scroll` em `assets/js/index.bundle.js`.
- `visualViewport.resize` em `index.html` e `c/index.html`.
- `touchmove` em lightbox e modais.

### `useLayoutEffect`

- `assets/js/checkout.app.js:164`: usado para restaurar cursor de mascara.
- Ele agenda `setSelectionRange` dentro de rAF.
- Suspeita baixa/media: `useLayoutEffect` roda antes do paint, mas o trabalho real esta em rAF. Nao parece ser a causa principal.

### CSS problematico

- `transition: all`.
- `backdrop-filter`.
- fixed/sticky com blur.
- animacoes/pulses existem, mas atualmente parecem mais ligadas a paint/compositor do que forced reflow.

---

## 9. Arquivos mais sensiveis

| Arquivo | Motivo | Prioridade |
|---|---|---|
| `assets/js/index.bundle.js` | Scroll listener com leitura de `scrollHeight`; galeria/popups. | Alta |
| `index.html` | Host SPA, polling do checkout, visualViewport, modais. | Alta |
| `assets/js/checkout.app.js` | React checkout, masks, submit, scroll/focus de erro. | Alta |
| `c/index.html` | Checkout direto, visualViewport/focus, copy fallback. | Media |
| `assets/css/tailwind-static.css` | CSS grande; pode conter classes caras, mas runtime ok. | Baixa/Media |

---

## 10. Estrategia de confirmacao

### Chrome DevTools Performance

1. Abrir `https://izzatcasa.shop/?test_mode=1&lab=1`.
2. DevTools -> Performance.
3. CPU throttling 4x ou 6x.
4. Gravar:
   - scroll LP;
   - clique Comprar;
   - abertura checkout;
   - foco em campos;
   - submit invalido;
   - preenchimento CEP.
5. Procurar blocos:
   - `Recalculate Style`
   - `Layout`
   - `Forced reflow`
   - long tasks > 50ms.

### Playwright/CDP trace

Comando sugerido:

```powershell
npx playwright test --headed
```

Ou script custom com CDP:

```js
const client = await page.context().newCDPSession(page);
await client.send('Performance.enable');
await client.send('Tracing.start', { categories: 'devtools.timeline,blink.user_timing' });
// executar fluxo
await client.send('Tracing.end');
```

### Instrumentacao dev sugerida

Criar um arquivo temporario, nao producao:

`reports/reflow-detector-snippet.js`

Conceito:

```js
(function () {
  var lastWrite = null;
  function stack() { return new Error().stack; }
  function write(type, el) { lastWrite = { type, t: performance.now(), stack: stack(), el: el }; }
  function read(type, el) {
    if (lastWrite && performance.now() - lastWrite.t < 64) {
      console.warn('[reflow-suspect]', {
        read: type,
        write: lastWrite.type,
        dt: performance.now() - lastWrite.t,
        readStack: stack(),
        writeStack: lastWrite.stack
      });
    }
  }
  // patch getBoundingClientRect, scrollHeight, clientHeight, getComputedStyle,
  // classList, setAttribute, appendChild, style.setProperty etc.
})();
```

Usar somente em dev/teste. Monkey patch em producao pode distorcer performance.

---

## 11. Plano de correcao priorizado

### Fase 1 - baixo risco / alto impacto

1. rAF throttle e auto-remocao do listener `ScrollDepth`.
   - Arquivo: `assets/js/index.bundle.js`.
   - Impacto: reduz forced read durante montagem SPA.
   - Risco: baixo.

2. rAF throttle + write dedupe no `visualViewport.resize`.
   - Arquivos: `index.html`, `c/index.html`.
   - Impacto: melhor teclado mobile/WebView.
   - Risco: baixo/medio.

3. Cachear arrays de dots/thumbs da galeria.
   - Arquivo: `assets/js/index.bundle.js`.
   - Impacto: pequeno, seguro.
   - Risco: baixo.

### Fase 2 - refactors localizados

4. Trocar polling de checkout por evento `checkout:rendered`.
   - Arquivos: `index.html`, `assets/js/checkout.app.js`.
   - Impacto: reduz trabalho na abertura do SPA.
   - Risco: medio. Exige QA.

5. Separar leitura/escrita do scroll de erro.
   - Arquivo: `assets/js/checkout.app.js`.
   - Impacto: melhora caminho de erro no formulario.
   - Risco: baixo/medio.

### Fase 3 - mudancas arquiteturais

6. Reduzir dependencia de DOM polling no host SPA.
7. Avaliar manter root React montado e apenas alternar estado, se isso nao reintroduzir bugs antigos.
8. Criar teste E2E fixo para LP -> checkout -> voltar -> reabrir.

### Fase 4 - monitoramento continuo

9. Adicionar script local de trace/reflow detector.
10. Medir sempre com 3 runs Lighthouse + 1 trace manual mobile.

---

## 12. Sugestoes de patches

### Patch A - ScrollDepth com rAF

Risco: baixo.  
Teste: scroll ate 50%, ver evento `ScrollDepth`, abrir checkout sem stutter.

Ver patch sugerido em AR-01.

### Patch B - VisualViewport com rAF/dedupe

Risco: baixo/medio.  
Teste: teclado em Android/iOS/TikTok.

Ver patch sugerido em AR-03.

### Patch C - Checkout ready event

Risco: medio.  
Teste obrigatorio: LP -> checkout, voltar, reabrir, deep link `/c/`.

Ver patch sugerido em AR-02.

### Patch D - Scroll de erro em dois frames

Risco: baixo/medio.  
Teste: submit vazio e submit com email/telefone invalidos.

Ver patch sugerido em MR-01.

---

## 13. Veredito

O projeto nao parece ter um problema massivo de forced reflow durante digitacao do checkout. O risco mais concreto esta na concorrencia entre:

- montagem React do checkout SPA;
- listener global de scroll ainda ativo;
- polling/leituras de DOM para detectar render;
- resize do teclado via `visualViewport`.

As duas correcoes mais seguras e com melhor relacao impacto/risco sao:

1. rAF throttle/remocao do listener de `ScrollDepth`.
2. rAF throttle/dedupe do `visualViewport.resize`.

Eu nao recomendo mexer primeiro em tracking, CAPI, submit, pagamento ou PIX para resolver este aviso. O caminho mais seguro e atacar somente os pontos de layout/viewport e medir novamente.
