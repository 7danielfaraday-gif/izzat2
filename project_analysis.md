# Relatório de Análise: Projeto Izzat (Focado em TikTok Ads)

O projeto **IzzatPVV2** é uma estrutura de vendas de alta conversão (PVV - Página de Vendas de Vídeo/Alta Performance), otimizada especificamente para o ecossistema do **TikTok Ads**.

## 🚀 Arquitetura e Performance
O projeto utiliza uma stack moderna e extremamente leve para garantir tempos de carregamento mínimos, o que é crucial para anúncios em redes sociais:
- **Frontend**: HTML/CSS/JS puros na landing page e **React** no checkout.
- **Hospedagem**: Cloudflare Pages (garantindo baixa latência global).
- **Backend**: Cloudflare Pages Functions (Serverless) para processamento de APIs.
- **Banco de Dados**: Cloudflare KV (Key-Value storage) para configurações e métricas rápidas.

## 📱 Foco Total em TikTok Ads
A integração com o TikTok é profunda e utiliza as melhores práticas do mercado:
1.  **Dual-Tracking (Pixel + CAPI)**: Utiliza o Pixel via navegador e a **Conversions API (CAPI)** via servidor simultaneamente.
2.  **Deduplicação**: Implementa `event_id` único em ambos os canais, permitindo que o TikTok identifique e remova eventos duplicados, melhorando a precisão do algoritmo.
3.  **Advanced Matching**: Automatiza a normalização e o hash (SHA-256) de e-mails e telefones, enviando dados protegidos para aumentar a taxa de correspondência de eventos.
4.  **Resiliência no In-App Browser**: O código possui fallbacks específicos para o navegador interno do TikTok, garantindo que scripts vitais (como React e Pixels) carreguem mesmo em conexões instáveis ou ambientes restritos.
5.  **TikTok Click ID (ttclid)**: Captura e persiste o ID de clique para atribuição precisa.

## 💳 Fluxo de Checkout e Pagamento
- **Foco em PIX**: O checkout é otimizado para pagamento instantâneo via PIX.
- **Painel Administrativo**: Existe um painel protegido (`/admin`) para troca dinâmica da chave PIX via Cloudflare KV, sem necessidade de novo deploy.
- **Métricas Internas**: Rastreamento de usuários online em tempo real e cliques em "Copiar PIX" armazenados diretamente no KV.

## 🛠 Elementos de Conversão (Gatilhos Mentais)
- **Social Proof Dinâmico**: Popups de "Compra realizada" e contadores de vendas simulados.
- **Geolocalização**: Detecção automática de cidade/estado do usuário para personalizar o frete grátis.
- **Design "TikTok Shop"**: A interface mimetiza a identidade visual do TikTok, aumentando a confiança do usuário que vem do anúncio.
- **Prova Social Estática**: Lista extensa de depoimentos (reviews) com fotos, carregados sob demanda.

## 📁 Estrutura de Arquivos Principal
- `index.html`: Landing page principal com Pixel e gatilhos.
- `checkout/index.html`: Base do checkout React.
- `functions/api/tiktok-events.js`: Core da integração Conversions API.
- `functions/api/pix-config.js`: Gerenciamento da chave PIX via KV.
- `assets/js/checkout.app.js`: Lógica do checkout e rastreamento.

---
**Conclusão**: O projeto é uma máquina de vendas tecnicamente sofisticada, construída para extrair o máximo de performance dos algoritmos de anúncio do TikTok.
