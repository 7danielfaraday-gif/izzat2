# Synthetic diagnostics

Mobile-first synthetic checks for the Izzat LP and checkout funnel.

## Install

```bash
npm install
npm run synthetic:install
```

## Run Playwright

```bash
npm run synthetic
```

The Playwright flow opens the production domain with `lab=1` and `test_mode=1`.
Those flags are already supported by the project and prevent analytics, TikTok
tracking, diagnostics writes, and real order writes from polluting production.

Artifacts are written to:

```txt
synthetic/artifacts/
```

## Run Lighthouse

```bash
npm run synthetic:lighthouse
```

The Lighthouse runner writes JSON, HTML, and a normalized summary under:

```txt
synthetic/artifacts/lighthouse/
```

## Change target URL

```bash
$env:SYNTHETIC_BASE_URL="https://izzatcasa.shop"
npm run synthetic
```

