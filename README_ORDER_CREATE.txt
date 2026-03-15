Fluxo atualizado:
- checkout público cria pedido interno em /api/order-create
- nome e telefone não são mais enviados em um log paralelo
- admin continua lendo os registros criptografados do mesmo KV

Configuração necessária no Cloudflare (store e admin):
- PIX_STORE (mesmo namespace nos dois projetos)
- ADMIN_ENCRYPT_KEY (mesmo valor nos dois projetos)
