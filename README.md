# Browser Integrity Guard

Sistema **client-side** (HTML/CSS/JS) para auditar a integridade do fingerprint do navegador e detectar sinais de:

- **Antidetect** (AdsPower, Multilogin, GoLogin, etc.) com spoof incompleto
- **Automação** (Selenium, Puppeteer, Playwright, CDP)
- **Fingerprint inconsistente** (UA vs GPU vs OS vs fontes vs touch)
- Técnicas no estilo de plataformas de ads e anti-fraude

## Como rodar

### Opção recomendada (HTTP local)

```bash
cd browser-integrity-guard
python -m http.server 8080
```

Abra `http://localhost:8080` no navegador a testar.

### file://

Pode funcionar na maioria dos módulos. Alguns browsers restringem Workers, `crypto.subtle` ou WebRTC em `file://` — use HTTP local se algo falhar.

**Zero dependências npm.** ES modules nativos.

## Trust Score

| Score  | Grade       | Significado                                      |
|-------:|------------|--------------------------------------------------|
| 90–100 | Trusted    | Fingerprint coerente                             |
| 70–89  | Low Risk   | Sinais leves / privacidade                       |
| 45–69  | Suspicious | Inconsistências de spoof fraco                   |
| 20–44  | High Risk  | Padrão antidetect / automação                    |
| 0–19   | Critical   | Spoof óbvio, headless, CDP                       |

Score = `clamp(100 + soma dos deltas dos findings, 0, 100)`.

## Módulos

| Módulo | O que analisa |
|--------|----------------|
| Automação & CDP | `webdriver`, markers Selenium/CDP, HeadlessChrome |
| Prototype Lies | getters não nativos, iframe ≠ main, `toString` patch |
| Workers | WorkerNavigator ≠ main (spoof só no window) |
| Navigator & Hints | Client Hints, CPU/RAM, productSub |
| Chrome & Plugins | `window.chrome`, PluginArray fake |
| Canvas | estabilidade / noise entre leituras |
| WebGL | SwiftShader, GPU vs OS, hooks |
| Audio | OfflineAudioContext + noise |
| Fontes | fontes instaladas vs OS do UA |
| Screen | outer=0, resoluções headless, DPR |
| ClientRects | noise em geometria DOM |
| WebRTC | ICE / IPs (informativo) |
| Media & Speech | devices e vozes vs OS |
| Timezone & Locale | idioma vs fuso (peso baixo) |
| Permissions | inconsistências Notification API |
| Timing | timers / privacidade |
| Consistência | matriz cruzada UA↔platform↔GPU↔touch |

## Tags frequentes

- `AUTOMATION` — controle por WebDriver/CDP
- `ANTIDETECT_LIKELY` — padrão de browser antidetect
- `BAD_FP` — fingerprint internamente inconsistente
- `WORKER_MISMATCH` — main thread spoofado, worker não
- `PROTOTYPE_LIE` — APIs nativas reescritas
- `CANVAS_NOISE` — canvas com noise aleatório
- `HEADLESS` — sinais de headless/VM
- `PRIVACY` — proteção de privacidade (não necessariamente fraude)

## Export

- **Exportar JSON** — relatório completo com raw data por módulo
- **Copiar resumo** — texto para colar em tickets/notas

## Limites (honestidade “nível bancário”)

Este projeto cobre o que **JavaScript no browser** consegue medir com alta qualidade (integridade + consistência).

Stacks bancárias / TikTok Ads em produção **também** usam sinais de rede que **exigem servidor**:

| Sinal | Client-side? |
|-------|--------------|
| Canvas / WebGL / Audio / Fonts | Sim |
| Prototype lies / Workers | Sim |
| Consistência UA↔GPU↔OS | Sim |
| TLS JA3 / JA4 | Não (edge/server) |
| Ordem de headers HTTP/2 | Não |
| Fingerprint de TCP/IP | Não |
| Biometria comportamental longa | Fase 2 |

## Uso ético

Ferramenta de **detecção e auditoria** (QA de segurança, pesquisa de fraude, validar se um perfil vaza). Não inclui guias para burlar plataformas.

## Estrutura

```
browser-integrity-guard/
├── index.html
├── css/styles.css
├── js/
│   ├── app.js
│   ├── scorer.js
│   ├── report.js
│   ├── utils.js
│   └── modules/
│       └── *.js
└── README.md
```
