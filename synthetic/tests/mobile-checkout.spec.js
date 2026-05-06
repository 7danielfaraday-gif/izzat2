const { test, expect } = require('@playwright/test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ARTIFACT_DIR = path.resolve(__dirname, '..', 'artifacts', 'synthetic');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeName(value) {
  return String(value || 'run').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

function sha256Short(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

function buildLabUrl(baseURL, pathname = '/') {
  const url = new URL(pathname, baseURL);
  url.searchParams.set('lab', '1');
  url.searchParams.set('test_mode', '1');
  url.searchParams.set('synthetic', '1');
  url.searchParams.set('utm_source', 'synthetic');
  url.searchParams.set('utm_medium', 'playwright');
  url.searchParams.set('utm_campaign', 'synthetic_mobile_diagnostics');
  return url.toString();
}

function isTrackingUrl(url) {
  return /analytics\.tiktok\.com|googletagmanager\.com|google-analytics\.com|connect\.facebook\.net|facebook\.com\/tr|static\.hotjar\.com|hotjar\.com|clarity\.ms|doubleclick\.net/i.test(url);
}

function isFirstPartyTelemetry(url) {
  return /\/cdn-cgi\/zaraz\/|\/api\/diagnostics(?:\?|$)|\/api\/tiktok-events(?:\?|$)|\/api\/metrics\//i.test(url);
}

function isKnownSpeculationRefusal(issue) {
  return issue &&
    /\/assets\/css\/checkout\.tailwind\.css/i.test(issue.url || '') &&
    issue.status === 503 &&
    issue.resourceType === 'other' &&
    /prefetch refused/i.test(issue.cfSpeculationRefused || '');
}

function isKnownSpeculationRequestFailure(issue) {
  return issue &&
    /\/assets\/css\/checkout\.tailwind\.css/i.test(issue.url || '') &&
    issue.resourceType === 'other' &&
    /ERR_ABORTED/i.test(issue.errorText || '');
}

function isKnownConsoleNoise(text, hasSpeculationRefusal) {
  if (/Viewport argument key "interactive-widget" not recognized and ignored/i.test(text || '')) return true;
  return hasSpeculationRefusal && /Failed to load resource: the server responded with a status of 503/i.test(text || '');
}

async function installSyntheticNetworkControls(page) {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();

    if (isTrackingUrl(url)) {
      return route.fulfill({
        status: 204,
        contentType: 'application/javascript; charset=utf-8',
        body: '',
      });
    }

    if (isFirstPartyTelemetry(url)) {
      return route.fulfill({
        status: 204,
        contentType: 'application/json; charset=utf-8',
        body: '',
      });
    }

    if (/\/api\/orders(?:\?|$)/i.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ ok: true, synthetic: true }),
      });
    }

    return route.continue();
  });
}

async function collectDiagnostics(page) {
  const diagnostics = {
    consoleErrors: [],
    pageErrors: [],
    httpErrors: [],
    warnings: [],
    requestFailures: [],
  };

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/favicon\.ico/i.test(text)) return;
    diagnostics.consoleErrors.push(text);
  });

  page.on('pageerror', (error) => {
    diagnostics.pageErrors.push(error && error.stack ? error.stack : String(error));
  });

  page.on('requestfailed', (request) => {
    const failure = request.failure();
    const url = request.url();
    if (isTrackingUrl(url) || isFirstPartyTelemetry(url)) return;
    diagnostics.requestFailures.push({
      url,
      method: request.method(),
      resourceType: request.resourceType(),
      errorText: failure && failure.errorText ? failure.errorText : '',
    });
  });

  page.on('response', async (response) => {
    const status = response.status();
    if (status < 400) return;

    const request = response.request();
    const url = response.url();
    const issue = {
      url,
      status,
      method: request.method(),
      resourceType: request.resourceType(),
      cfRay: await response.headerValue('cf-ray').catch(() => ''),
      cfSpeculationRefused: await response.headerValue('cf-speculation-refused').catch(() => ''),
      contentType: await response.headerValue('content-type').catch(() => ''),
    };

    if (isKnownSpeculationRefusal(issue)) {
      diagnostics.warnings.push(issue);
      return;
    }

    if (isTrackingUrl(url) || isFirstPartyTelemetry(url)) return;
    diagnostics.httpErrors.push(issue);
  });

  return diagnostics;
}

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const docScrollWidth = doc ? doc.scrollWidth : 0;
    const bodyScrollWidth = body ? body.scrollWidth : 0;
    const hasPageOverflow = docScrollWidth > window.innerWidth + 2 || bodyScrollWidth > window.innerWidth + 2;
    const candidates = hasPageOverflow
      ? Array.from(document.querySelectorAll('body *'))
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            id: el.id || '',
            className: typeof el.className === 'string' ? el.className.slice(0, 120) : '',
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          };
        })
        .filter((item) => item.width > 0 && (item.left < -2 || item.right > window.innerWidth + 2))
        .slice(0, 8)
      : [];

    return {
      innerWidth: window.innerWidth,
      docScrollWidth,
      bodyScrollWidth,
      offenders: candidates,
    };
  });

  expect(metrics.docScrollWidth, `${label}: document horizontal overflow`).toBeLessThanOrEqual(metrics.innerWidth + 2);
  expect(metrics.bodyScrollWidth, `${label}: body horizontal overflow`).toBeLessThanOrEqual(metrics.innerWidth + 2);
  expect(metrics.offenders, `${label}: overflowing elements`).toEqual([]);
  return metrics;
}

async function assertTouchTarget(locator, label) {
  const box = await locator.boundingBox();
  expect(box, `${label}: missing bounding box`).toBeTruthy();
  expect(box.width, `${label}: touch width`).toBeGreaterThanOrEqual(44);
  expect(box.height, `${label}: touch height`).toBeGreaterThanOrEqual(44);
  return box;
}

async function getCheckoutScrollState(page) {
  return page.evaluate(() => {
    const viewport = document.querySelector('#spa-checkout-wrapper') || document.scrollingElement || document.documentElement;
    return {
      scrollTop: Math.round(viewport.scrollTop || 0),
      scrollHeight: Math.round(viewport.scrollHeight || 0),
      clientHeight: Math.round(viewport.clientHeight || window.innerHeight || 0),
      maxScroll: Math.max(0, Math.round((viewport.scrollHeight || 0) - (viewport.clientHeight || 0))),
    };
  });
}

async function scrollCheckoutDown(page) {
  try {
    await page.mouse.wheel(0, 1400);
    return 'mouse.wheel';
  } catch (error) {
    await page.evaluate(() => {
      const viewport = document.querySelector('#spa-checkout-wrapper') || document.scrollingElement || document.documentElement;
      if (viewport && typeof viewport.scrollBy === 'function') {
        viewport.scrollBy(0, 1400);
        return;
      }
      window.scrollBy(0, 1400);
    });
    return `dom-scroll-fallback: ${error.message}`;
  }
}

async function writeSyntheticReport(testInfo, report) {
  ensureDir(ARTIFACT_DIR);
  const file = path.join(ARTIFACT_DIR, `${safeName(testInfo.project.name)}-${safeName(testInfo.title)}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  await testInfo.attach('synthetic-summary', {
    path: file,
    contentType: 'application/json',
  });
}

test.describe('mobile checkout synthetic diagnostics', () => {
  test('LP to PIX flow stays usable on mobile', async ({ page, baseURL, browserName }, testInfo) => {
    await installSyntheticNetworkControls(page);
    const diagnostics = await collectDiagnostics(page);
    const screenshotsDir = path.join(ARTIFACT_DIR, 'screenshots');
    ensureDir(screenshotsDir);

    if (browserName === 'chromium') {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
        origin: new URL(baseURL).origin,
      }).catch(() => {});
    }

    const report = {
      project: testInfo.project.name,
      baseURL,
      startedAt: new Date().toISOString(),
      checkpoints: {},
      diagnostics,
    };

    await page.goto(buildLabUrl(baseURL, '/'), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

    const buyButton = page.locator('#buy-now');
    await expect(buyButton).toBeVisible();
    report.checkpoints.lpOverflow = await assertNoHorizontalOverflow(page, 'LP');
    report.checkpoints.buyButtonBox = await assertTouchTarget(buyButton, 'buy-now');
    await page.screenshot({
      path: path.join(screenshotsDir, `${safeName(testInfo.project.name)}-lp.png`),
      fullPage: true,
    });

    await buyButton.click();
    const checkoutRoot = page.locator('#checkout-root');
    await expect(checkoutRoot.locator('input[name="name"]')).toBeVisible({ timeout: 30000 });
    report.checkpoints.checkoutOverflow = await assertNoHorizontalOverflow(page, 'checkout');
    await page.screenshot({
      path: path.join(screenshotsDir, `${safeName(testInfo.project.name)}-checkout.png`),
      fullPage: true,
    });

    const firstField = checkoutRoot.locator('input[name="name"]');
    await firstField.focus();
    await expect(firstField).toBeFocused();

    await firstField.fill('Teste Sintetico');
    await checkoutRoot.locator('input[name="email"]').fill('teste.sintetico@example.com');
    await checkoutRoot.locator('input[name="phone"]').fill('11999999999');

    const submitButton = checkoutRoot.getByRole('button', { name: /confirmar a compra/i });
    await expect(submitButton).toBeVisible({ timeout: 20000 });
    const beforeScroll = await getCheckoutScrollState(page);
    const scrollMethod = await scrollCheckoutDown(page);
    await page.waitForTimeout(300);
    const afterWheel = await getCheckoutScrollState(page);
    await submitButton.scrollIntoViewIfNeeded();
    const afterScrollIntoView = await getCheckoutScrollState(page);
    report.checkpoints.scroll = { beforeScroll, afterWheel, afterScrollIntoView, scrollMethod };
    expect(afterScrollIntoView.maxScroll, 'checkout should have scrollable content').toBeGreaterThan(50);
    expect(afterScrollIntoView.scrollTop, 'checkout should allow reaching lower form/payment area').toBeGreaterThan(beforeScroll.scrollTop);

    await expect(submitButton).toBeEnabled({ timeout: 20000 });
    await assertTouchTarget(submitButton, 'checkout submit');
    await submitButton.click();

    await expect(checkoutRoot.getByText('Pix Copia e Cola').first()).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(2300);
    await page.screenshot({
      path: path.join(screenshotsDir, `${safeName(testInfo.project.name)}-pix.png`),
      fullPage: true,
    });

    const pixCode = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('#checkout-root p'));
      const match = candidates.find((node) => /^000201/.test((node.textContent || '').trim()));
      return match ? (match.textContent || '').trim() : '';
    });
    expect(pixCode, 'PIX code rendered').toMatch(/^000201/);
    expect(pixCode, 'PIX code should contain Bacen PIX marker').toMatch(/br\.gov\.bcb\.pix/i);
    report.checkpoints.pixCode = {
      length: pixCode.length,
      sha256: sha256Short(pixCode),
      startsWith000201: pixCode.startsWith('000201'),
      containsBacenMarker: /br\.gov\.bcb\.pix/i.test(pixCode),
    };

    const copyButton = checkoutRoot.getByRole('button', { name: /copiar c[oó]digo pix/i }).first();
    await expect(copyButton).toBeVisible();
    await assertTouchTarget(copyButton, 'copy PIX');
    await copyButton.click({ force: true });
    await expect(checkoutRoot.getByRole('button', { name: /c[oó]digo copiado/i }).first()).toBeVisible({ timeout: 5000 });

    if (browserName === 'chromium') {
      const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
      report.checkpoints.clipboard = {
        available: !!copied,
        length: copied.length,
        sha256: copied ? sha256Short(copied) : '',
        matchesRenderedPix: copied === pixCode,
      };
      expect(copied, 'clipboard PIX should match rendered PIX').toBe(pixCode);
    }

    await page.waitForTimeout(500);

    const knownSpeculationWarnings = diagnostics.warnings.filter((issue) => isKnownSpeculationRefusal(issue));
    const hardHttpErrors = diagnostics.httpErrors.filter((issue) => !isKnownSpeculationRefusal(issue));
    const hardConsoleErrors = diagnostics.consoleErrors.filter((text) => !isKnownConsoleNoise(text, knownSpeculationWarnings.length > 0));
    const hardRequestFailures = diagnostics.requestFailures.filter((issue) => !isKnownSpeculationRequestFailure(issue));
    report.ignoredKnownIssues = {
      consoleErrors: diagnostics.consoleErrors.filter((text) => isKnownConsoleNoise(text, knownSpeculationWarnings.length > 0)),
      requestFailures: diagnostics.requestFailures.filter((issue) => isKnownSpeculationRequestFailure(issue)),
      httpWarnings: knownSpeculationWarnings,
    };
    report.finishedAt = new Date().toISOString();
    await writeSyntheticReport(testInfo, report);

    expect(diagnostics.pageErrors, 'page JS errors').toEqual([]);
    expect(hardConsoleErrors, 'console errors excluding known browser/CF speculation noise').toEqual([]);
    expect(hardRequestFailures, 'request failures excluding known CF speculation abort').toEqual([]);
    expect(hardHttpErrors, 'HTTP errors excluding known CF speculation prefetch refusal').toEqual([]);
  });
});
