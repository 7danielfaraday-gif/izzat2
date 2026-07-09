# Browser Integrity Guard v2

Sistema **client-side** avancado para auditar fingerprint e detectar:

- Antidetect (AdsPower, Multilogin, GoLogin, etc.)
- Automacao (Selenium, Puppeteer, Playwright, CDP)
- Spoof inconsistente (screen, matchMedia, worker, iframe, WebGL/WebGPU)
- Clusters de risco por **correlacao** entre sinais

## Como rodar

```text
http://localhost:8081/?v=3
```

Se o botao nao reagir: **Ctrl+Shift+R** (cache).

## Novidades v2

| Recurso | Descricao |
|---------|-----------|
| **Strict / Balanced** | Strict multiplica penalidades x1.15 |
| **Confidence** | Cada finding tem confianca 0-1 no peso |
| **Clusters** | MULTI_SIGNAL, ANTIDETECT_CONFIRMED, SCREEN_SPOOF, AUTOMATION |
| **matchMedia** | CSS device-width/resolution vs screen/DPR |
| **Iframe Lab** | main vs blank/srcdoc/sandbox |
| **WebGPU** | adapter vs WebGL/OS |
| **Math engine** | quirks de float/native Math |
| **Storage/Heap** | quota e jsHeapSizeLimit |
| **Battery/Sensors** | mock de bateria e sensores mobile |
| **Behavior 3s** | mouse linear / idle (opcional) |
| **Screen reforcado** | visualViewport + matchMedia; inner>screen sobe para HIGH se confirmado |

## Score

| Score | Grade |
|------:|-------|
| 90-100 | Trusted |
| 70-89 | Low Risk |
| 45-69 | Suspicious |
| 20-44 | High Risk |
| 0-19 | Critical |

## Limites

TLS JA3/JA4, ordem de headers HTTP/2 e fingerprint de rede **exigem backend**.

## Etica

Ferramenta de **deteccao/auditoria**. Nao inclui guias para burlar plataformas.
