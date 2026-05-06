const { defineConfig, devices } = require('@playwright/test');

const baseURL = process.env.SYNTHETIC_BASE_URL || 'https://izzatcasa.shop';

module.exports = defineConfig({
  testDir: './tests',
  timeout: 90000,
  expect: {
    timeout: 15000,
  },
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  outputDir: './artifacts/playwright',
  reporter: [
    ['list'],
    ['json', { outputFile: './artifacts/playwright-results.json' }],
    ['html', { outputFolder: './artifacts/playwright-report', open: 'never' }],
  ],
  use: {
    baseURL,
    actionTimeout: 15000,
    navigationTimeout: 60000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-320-chromium',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 320, height: 740 },
        deviceScaleFactor: 2,
      },
    },
    {
      name: 'mobile-390-chromium',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
      },
    },
    {
      name: 'mobile-430-chromium',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 430, height: 760 },
        deviceScaleFactor: 3,
      },
    },
    {
      name: 'tiktok-android-webview',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 760 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent:
          'Mozilla/5.0 (Linux; Android 14; SM-A065M Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/143.0.7499.34 Mobile Safari/537.36 musical_ly_2024409030 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/44.9.3 ByteLocale/pt-BR ByteFullLocale/pt-BR Region/BR AppId/1233',
      },
    },
    {
      name: 'iphone-13-webkit',
      use: {
        ...devices['iPhone 13'],
        browserName: 'webkit',
      },
    },
  ],
});

