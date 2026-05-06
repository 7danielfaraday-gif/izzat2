✅ PIX Painel para Cloudflare Pages (SEM PHP)

O checkout busca o PIX em: /api/pix-config (Pages Functions)
Você altera via painel em:
- (Recomendado, protegido): /admin
- (Opcional, página estática): /admin/pix-panel.html

1) Criar KV Namespace
- Cloudflare Dashboard -> Workers & Pages -> KV
- Create namespace (ex.: PIX_STORE)

2) Binding do KV no seu projeto Pages
- Workers & Pages -> (seu projeto Pages) -> Settings -> Functions
- KV namespace bindings:
  Binding name: PIX_STORE
  KV namespace: PIX_STORE (o que você criou)

3) Definir usuário e senha (Secrets)
- Settings -> Variables and Secrets -> Add
  Type: Secret
  Name: PIX_ADMIN_USER
  Value: (seu usuário)

- Add novamente:
  Type: Secret
  Name: PIX_ADMIN_PASS
  Value: (sua senha forte)

4) Deploy
- Faça upload desse projeto no seu repo (Git) conectado ao Pages
- Deploy normalmente

5) Usar o painel
- Abra: https://SEU-DOMINIO/admin
- O navegador vai pedir usuário e senha (HTTP Basic)
- Edite o PIX e clique "Salvar PIX"

Observações
- /api/pix-config (GET) é público (o checkout precisa ler).
- Leitura/alteração do painel acontece via /api/pix-config-admin (GET/POST), protegido por usuário/senha.
- Se quiser esconder o QR: marque "Desativar QR Code".
- Se você preferir proteger também outras rotas (/admin/pix-panel.html, etc.), a alternativa mais robusta é usar Cloudflare Access.

✅ Métricas (Online ao vivo + Cliques no botão Copiar PIX)

Sem integrações externas: usa o mesmo KV (PIX_STORE).

O site envia um "ping" a cada ~20s (arquivo: assets/js/metrics.ping.js) para o endpoint público:
- /api/metrics/ping (POST)

No checkout, ao clicar no botão de copiar o PIX, ele também registra:
- /api/metrics/pix-copy (POST)

O painel (rota protegida) lê e mostra:
- /api/metrics/stats (GET) — protegido por PIX_ADMIN_USER / PIX_ADMIN_PASS

Como funciona:
- Online agora: grava uma chave por sessão em KV com TTL de ~75s (contador aproximado em tempo real).
- Cliques Copiar PIX: incrementa um contador total no KV.

Observação importante:
- KV não tem "increment" atômico; para volumes muito altos, o ideal é migrar o contador de cliques para Durable Objects ou D1.
