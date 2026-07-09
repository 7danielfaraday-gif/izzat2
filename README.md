# FP Scan — interface pt-BR sobre o **motor CreepJS real**

Scanner de fingerprint com UI amigável (estilo BrowserScan), **score 0–100** e explicação de cada mentira em português.

## Motor de detecção

Usa o build oficial do [CreepJS](https://github.com/abrahamjuliot/creepjs) (MIT):

```text
vendor/creepjs/creep.js
```

Após a coleta, o CreepJS expõe:

- `window.Fingerprint` — fingerprint “loose” completo  
- `window.Creep` — fingerprint “stable”  

A UI (`js/ui.js` + `js/score.js`) **só** lê esses objetos para score, tags e cards de mentira.

> A marca **CreepJS** é do autor original. Este projeto é uma **interface própria** e não é o site oficial.

## Estrutura

```text
.
├── index.html                 ← UI pt-BR
├── css/styles.css
├── js/
│   ├── ui.js                  ← interface
│   └── score.js               ← score a partir do Fingerprint
├── vendor/creepjs/
│   ├── creep.js               ← motor oficial
│   ├── LICENSE
│   └── TRADEMARKS.md
├── _headers
├── wrangler.toml
└── README.md
```

## Como funciona o score

1. CreepJS roda e preenche `window.Fingerprint`
2. Contamos:
   - **prototype lies** (`fp.lies.data` / `totalLies`)
   - seções com **`lied`** (navigator, screen, canvas, worker…)
   - **trash** (`fp.trash.trashBin`)
   - heurísticas **headless / stealth**
   - **resistance** (privacidade — penalidade leve)
3. Cada achado vira um card com:
   - o que mentiu  
   - evidência (string original do CreepJS)  
   - por que isso é mentira (pt-BR)  
   - impacto no score  

## Cloudflare Pages

| Campo | Valor |
|--------|--------|
| Framework | None |
| Build command | *(vazio)* |
| Output directory | `.` |

Ou **Upload assets** da pasta inteira (com `index.html` + `vendor/creepjs/creep.js`).

## Local

```bash
# qualquer servidor estático na raiz do projeto
npx serve -l 8081
# ou python -m http.server 8081
```

Abra http://localhost:8081/

No console: `window.Fingerprint`, `window.Creep`, `window.FPScan.last`

## Atualizar o motor CreepJS

1. Baixe o build de [docs/creep.js](https://github.com/abrahamjuliot/creepjs/tree/master/docs) (ou rode `pnpm build` no repo oficial)
2. Substitua `vendor/creepjs/creep.js`
3. Mantenha `LICENSE` e `TRADEMARKS.md`

## Licenças

- **CreepJS** (`vendor/creepjs/`): MIT — © abrahamjuliot  
- **UI FP Scan**: uso livre no seu deploy; não use o nome “CreepJS” como marca do produto  
