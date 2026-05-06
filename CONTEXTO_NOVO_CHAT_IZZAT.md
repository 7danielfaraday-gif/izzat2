# Contexto Para Novo Chat - Projeto Izzat / TikTok Ads

Use este arquivo como prompt inicial em um novo chat para manter o contexto operacional do projeto.

## Identidade Do Projeto

Projeto ecommerce focado em TikTok Ads, com funil:

1. LP em `https://izzatcasa.shop/`
2. Checkout SPA em `/c/`
3. Tela PIX copia e cola
4. Painel admin para pedidos/configuracoes

Workspace local:

`C:\Users\Luciano Garcia\Desktop\Izzat atualizada GPT`

Stack principal:

- HTML/CSS/JS estatico
- React local para checkout
- Cloudflare Pages + Functions
- KV/D1/Workers/Pages Functions conforme configuracao atual
- Tracking TikTok Browser Pixel + CAPI
- GA4 via Cloudflare Zaraz
- Ferramenta externa de gravacao de sessao removida/desativada do projeto e do Zaraz

## Dados Cloudflare

Conta Cloudflare:

- Account ID: `59d710ccc33cdb57147844ba6039bb29`
- Dominio atual: `izzatcasa.shop`
- Zone ID atual: `380d00825df0823df874c570fb00e948`
- Pages project: `novaizzat`
- Branch de deploy: `main`

Comando de publicacao usado:

```powershell
npx.cmd wrangler pages deploy . --project-name novaizzat --branch main --commit-dirty=true
```

Observacao importante:

- Nao colar tokens/chaves em respostas finais.
- Se precisar de API Cloudflare, usar variavel local:

```powershell
$env:CLOUDFLARE_API_TOKEN="COLE_O_TOKEN_AQUI"
```

Token precisa ter pelo menos:

- Zone Read/Edit para `izzatcasa.shop`
- Zaraz Read/Edit/Admin se for mexer no Zaraz
- Pages Edit para deploy
- Workers/Functions/KV/D1 conforme tarefa

## Regras Criticas Do Funil

1. Nao trocar o CTA da LP para link direto `/c/`.
   - O TikTok in-browser apresentou problema quando o CTA era navegacao direta.
   - O CTA deve continuar usando `href="javascript:void(0)"` e o handler do checkout SPA.

2. Nao quebrar Checkout SPA.
   - Qualquer ajuste em scroll, CSS, tracking, React, formulario ou PIX precisa ser minimo e testado.
   - O checkout usa wrapper/SPA; em alguns fluxos o scroll real nao e `window`, e sim o container do SPA.

3. Tela PIX.
   - Sem cronometro/barra de expiracao.
   - Texto atual esperado: instruir o usuario a copiar o codigo e concluir no app do banco.
   - Botao de copiar PIX pode ter microfeedback, mas nao modal pesado/amador.

4. Compra/Purchase.
   - A regra de negocio desejada: evento de compra real deve ser enviado somente quando pedido for marcado como pago no admin.
   - Nao disparar Purchase/CompletePayment antes do pagamento confirmado.
   - Verificar sempre Browser Pixel + CAPI antes de alterar tracking.

5. Observabilidade / gravacao de sessao.
   - O script customizado de observabilidade foi removido do carregamento do cliente.
   - Arquivos backend/admin podem ainda existir para reversibilidade, mas `index.html` e `c/index.html` nao devem carregar `assets/js/observability.js`.
   - Ultima decisao: nao carregar ferramenta externa de gravacao de sessao em nenhum ponto do funil.

## Tracking Atual

TikTok:

- Pixel principal atual: `D7PPKERC77U4TTGIET70`
- Access token do pixel: usar apenas por variavel/secret, nao expor em resposta.
- Dominio oficial atual para CAPI/event_source_url: `izzatcasa.shop`
- Subdominios/rotas precisam preservar consistencia com `izzatcasa.shop`.

GA4:

- Measurement ID: `G-QY6B4BXBLF`
- GA4 esta no Cloudflare Zaraz.
- No codigo podem existir variaveis `window.GA_MEASUREMENT_ID`, mas evitar instalar `gtag` direto se Zaraz ja esta ativo.

Gravacao de sessao externa:

- Removido de `index.html` e `c/index.html`.
- Removido/desativado no Cloudflare Zaraz.
- Nao reinstalar sem pedido explicito.

Facebook:

- Tracking Facebook foi removido/desativado do projeto porque o teste nao deu certo.
- Nao reinstalar sem pedido explicito.

## Estado Recente Da Performance

Ultimas decisoes aplicadas:

- Remover observabilidade propria do cliente.
- Nao usar ferramenta externa de gravacao de sessao no funil.
- Reduzir peso de scripts de monitoramento.
- Manter TikTok Pixel/CAPI, pois e essencial para ads.
- GA4 preferencialmente via Zaraz.
- Evitar carregar coisas desnecessarias antes do primeiro clique.

Pontos historicos importantes:

- TikTok in-browser Android e o ambiente mais sensivel.
- Performance em Android antigo/TikTok WebView e prioridade maior que nota desktop.
- Cuidado com long tasks, reflow forcado, imagens abaixo da dobra e scripts que rodam antes da interacao.
- Nao otimizar removendo tracking TikTok essencial.

## Problemas Ja Vistos

1. CTA para `/c/` direto causou erro no in-browser TikTok.
   - Solucao: manter `javascript:void(0)` + handler SPA.

2. Scroll formulario -> PIX abria no ponto errado.
   - Causa: scroll real podia estar no wrapper SPA, nao no `window`.
   - Ao mexer nisso, usar helper que detecte container ativo.

3. Tela de carregamento do checkout podia aparecer "quebrada" por poucos ms antes do CSS/React terminar.
   - Cuidado com ordem de CSS, skeleton e checkout preload.

4. `robots.txt` ja foi corrigido anteriormente.

5. `ipapi` foi substituido por endpoint proprio `/api/location` usando Cloudflare visitor headers.

6. Fonte/encoding ja deu bug visual em acentos.
   - Preservar UTF-8.
   - Validar textos como `Elétrica`, `Satisfação`, `código`, `pagamento`.

## Arquivos Mais Sensíveis

- `index.html`
  - LP, CTA, tracking base, loader do checkout.

- `c/index.html`
  - Checkout direto, skeleton, loader React.

- `assets/js/index.bundle.js`
  - Logica da LP, CTA, abertura do checkout SPA, eventos da LP.

- `assets/js/checkout.app.js`
  - Checkout React, formulario, PIX, eventos, scroll, criacao de pedido.

- `functions/api/tiktok-events.js`
  - CAPI TikTok.
  - Cuidado com event_id, value, currency, content_id, email/phone, event_source_url.

- `functions/api/orders.js`
  - Criacao/listagem/estado de pedidos.

- `functions/admin/*`
  - Painel admin, pedidos, marcar como pago, configs.

- `functions/api/location.js`
  - Localizacao via Cloudflare.

## Padrao De Trabalho Esperado

1. Antes de alterar, procurar com:

```powershell
Select-String -Path index.html,c/index.html,assets/js/*.js,functions/**/*.js -Pattern "TERMO"
```

2. Usar `apply_patch` para edicoes manuais.

3. Depois de alterar tracking ou checkout:

```powershell
Select-String -Path index.html,c/index.html,assets/js/*.js,functions/**/*.js -Pattern "Purchase|CompletePayment|tiktok|ttq|event_id|observability|session"
```

4. Publicar com:

```powershell
npx.cmd wrangler pages deploy . --project-name novaizzat --branch main --commit-dirty=true
```

5. Validar dominio real:

```powershell
$html=(Invoke-WebRequest -Uri 'https://izzatcasa.shop/' -UseBasicParsing).Content
$html -match 'gravacao-externa-bloqueada'
$html -like '*observability.js*'

$checkout=(Invoke-WebRequest -Uri 'https://izzatcasa.shop/c/' -UseBasicParsing).Content
$checkout -match 'gravacao-externa-bloqueada'
$checkout -like '*observability.js*'
```

## Ultima Alteracao Confirmada

Alteracao publicada:

- Removido carregamento da observabilidade propria em `index.html` e `c/index.html`.
- Removida ferramenta externa de gravacao de sessao de `index.html`, `c/index.html` e Cloudflare Zaraz.
- Validar no dominio real:
- `https://izzatcasa.shop/`: gravacao externa ausente; `observability.js` ausente; `session-events` ausente.
- `https://izzatcasa.shop/c/`: gravacao externa ausente; `observability.js` ausente; `session-events` ausente.

## Como O Novo Chat Deve Agir

- Responder em portugues.
- Ser direto e pragmatico.
- Nao fazer mudancas grandes sem entender impacto em TikTok Ads.
- Prioridade absoluta: nao quebrar LP -> Checkout SPA -> PIX.
- Nunca remover TikTok tracking essencial sem pedido explicito.
- Nao expor tokens, access tokens, secrets ou chaves completas em respostas.
- Quando o usuario pedir "publicar", usar Cloudflare Pages `novaizzat`.
- Quando houver risco de performance, pensar primeiro em Android TikTok in-browser.
- Quando houver duvida entre nota PageSpeed e experiencia real, priorizar RUM/Cloudflare/Catchpoint mobile e testes reais no TikTok WebView.
