# Browser Integrity Guard v2

Sistema **client-side** em portugues para auditar fingerprint e detectar spoofing, antidetect e automacao.

## Como abrir

```text
http://localhost:8081/?v=4
```

Se a pagina nao atualizar: **Ctrl+Shift+R**.

## Significado das tags

| Tag | Significado |
|-----|-------------|
| **FP_RUIM** | Fingerprint ruim: UA, GPU, tela, fontes etc. nao batem entre si |
| **SPOOF_TELA** | Tela/viewport/DPR incoerentes (spoof de resolucao) |
| **ANTIDETECT_PROVAVEL** | Padrao tipico de AdsPower/Multilogin etc. |
| **ANTIDETECT_CONFIRMADO** | Combinacao forte (canvas + API/worker) |
| **SEM_INTERFACE** | Headless, VM ou GPU software |
| **MULTI_SINAL** | Varios tipos de risco ao mesmo tempo |
| **AUTOMACAO** | WebDriver / Selenium / Puppeteer / CDP |
| **API_FALSIFICADA** | Funcoes nativas reescritas |
| **WORKER_DIVERGENTE** | Main thread != Web Worker |
| **CANVAS_RUIDO** | Canvas muda entre leituras |
| **PRIVACIDADE** | Protecao de privacidade (nao e fraude sozinho) |

## Pontuacao

| Score | Classificacao |
|------:|---------------|
| 90-100 | Confiavel |
| 70-89 | Risco baixo |
| 45-69 | Suspeito |
| 20-44 | Risco alto |
| 0-19 | Critico |

**Estrito** = penalidades x1,15. **Equilibrado** = peso normal.

## Limites

TLS JA3 e ordem de headers HTTP exigem backend.
