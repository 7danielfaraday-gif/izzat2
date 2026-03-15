# Deploy em 2 projetos no Cloudflare Pages (Storefront + Admin)

Você vai criar 2 projetos separados no Cloudflare Pages:

## 1) Storefront (site principal)
- Pasta raiz: conteúdo do ZIP **izzat_storefront_pages.zip**
- Domínio: ex. `loja.seudominio.com` (ou o domínio principal)
- Bindings (Settings → Bindings):
  - KV Namespace (mesmo namespace em ambos):
    - Variable name: `PIX_STORE`
    - Namespace: crie/seleciona um KV, ex.: `IZZAT_PIX_STORE`
- Secrets (Settings → Environment variables → Add variable, tipo "Secret"):
  - `PIX_ADMIN_USER` e `PIX_ADMIN_PASS` (mesmos do admin, usado só se você quiser manter compatibilidade)
  - opcional: `CHECKOUT_LOG_TTL_DAYS` (ex.: 45)

Observação: neste projeto, `/api/checkout-log` aceita **somente POST** (GET está desabilitado).

## 2) Admin (subdomínio separado)
- Pasta raiz: conteúdo do ZIP **izzat_admin_pages.zip**
- Domínio: `admin.seudominio.com`
- Bindings:
  - KV Namespace: **o MESMO** do storefront
    - Variable name: `PIX_STORE`
- Secrets:
  - `PIX_ADMIN_USER`
  - `PIX_ADMIN_PASS`

Neste projeto existe `functions/_middleware.js` que protege **todas** as rotas com HTTP Basic Auth.

## DNS / Domínios
No Pages → Custom domains:
- Storefront: aponte seu domínio principal ou subdomínio
- Admin: `admin.seudominio.com`

## Recomendação (mais segura que Basic Auth)
Proteger o admin com **Cloudflare Access (Zero Trust)** em vez de Basic Auth.
