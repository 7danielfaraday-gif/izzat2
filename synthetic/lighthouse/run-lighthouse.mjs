import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const artifactDir = path.join(root, 'synthetic', 'artifacts', 'lighthouse');
fs.mkdirSync(artifactDir, { recursive: true });
const tempDir = path.join(artifactDir, 'tmp');
fs.mkdirSync(tempDir, { recursive: true });

const baseURL = process.env.SYNTHETIC_BASE_URL || 'https://izzatcasa.shop';
const target = new URL('/', baseURL);
target.searchParams.set('lab', '1');
target.searchParams.set('test_mode', '1');
target.searchParams.set('synthetic', '1');
target.searchParams.set('utm_source', 'synthetic');
target.searchParams.set('utm_medium', 'lighthouse');
target.searchParams.set('utm_campaign', 'synthetic_mobile_diagnostics');

const jsonPath = path.join(artifactDir, 'lighthouse-mobile.json');
const htmlPath = path.join(artifactDir, 'lighthouse-mobile.html');
const lighthouseCli = path.join(root, 'node_modules', 'lighthouse', 'cli', 'index.js');

function hasUsableLighthouseOutput(output, outputPath) {
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) return false;
  if (output !== 'json') return true;
  try {
    const raw = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    return !raw.runtimeError && raw.categories && Object.keys(raw.categories).length > 0;
  } catch (_) {
    return false;
  }
}

function runLighthouse(output, outputPath) {
  const chromeProfileDir = path.join(tempDir, `chrome-profile-${output}`);
  fs.rmSync(chromeProfileDir, { recursive: true, force: true });
  fs.mkdirSync(chromeProfileDir, { recursive: true });
  const args = [
    lighthouseCli,
    target.toString(),
    '--quiet',
    '--emulated-form-factor=mobile',
    '--throttling-method=simulate',
    `--chrome-flags=--headless=new --no-sandbox --disable-gpu --user-data-dir="${chromeProfileDir}"`,
    `--output=${output}`,
    `--output-path=${outputPath}`,
    '--only-categories=performance,accessibility,best-practices,seo',
  ];

  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: {
      ...process.env,
      TEMP: tempDir,
      TMP: tempDir,
    },
    encoding: 'utf8',
    stdio: 'pipe',
    shell: false,
  });

  if (result.status !== 0) {
    const reason = result.error ? `: ${result.error.message}` : '';
    if (hasUsableLighthouseOutput(output, outputPath)) {
      console.warn(`Lighthouse wrote a usable ${output} report but exited with ${result.status}${reason}. Continuing; this is commonly a Chrome temp cleanup issue on Windows.`);
      return;
    }
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`Lighthouse failed with exit code ${result.status}${reason}`);
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

runLighthouse('json', jsonPath);
runLighthouse('html', htmlPath);

const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const categories = raw.categories || {};
const consoleItems = (((raw.audits || {})['errors-in-console'] || {}).details || {}).items || [];
const networkItems = (((raw.audits || {})['network-requests'] || {}).details || {}).items || [];

const knownWarnings = networkItems
  .filter((item) => /\/assets\/css\/checkout\.tailwind\.css/i.test(item.url || '') && item.statusCode === 503 && item.resourceType === 'Other')
  .map((item) => ({
    url: item.url,
    statusCode: item.statusCode,
    resourceType: item.resourceType,
    note: 'Known Cloudflare speculation/prefetch refusal candidate. Validate with Cloudflare logs before treating as a real stylesheet failure.',
  }));

const summary = {
  url: target.toString(),
  fetchTime: raw.fetchTime,
  scores: {
    performance: Math.round(((categories.performance || {}).score || 0) * 100),
    accessibility: Math.round(((categories.accessibility || {}).score || 0) * 100),
    bestPractices: Math.round(((categories['best-practices'] || {}).score || 0) * 100),
    seo: Math.round(((categories.seo || {}).score || 0) * 100),
  },
  metrics: {
    lcpMs: Math.round((((raw.audits || {})['largest-contentful-paint'] || {}).numericValue || 0)),
    cls: Number(((((raw.audits || {})['cumulative-layout-shift'] || {}).numericValue || 0)).toFixed(4)),
    totalBlockingTimeMs: Math.round((((raw.audits || {})['total-blocking-time'] || {}).numericValue || 0)),
    speedIndexMs: Math.round((((raw.audits || {})['speed-index'] || {}).numericValue || 0)),
  },
  consoleErrors: consoleItems.map((item) => ({
    source: item.source || '',
    description: item.description || '',
    url: item.sourceLocation && item.sourceLocation.url ? item.sourceLocation.url : '',
  })),
  knownWarnings,
  artifacts: {
    json: jsonPath,
    html: htmlPath,
  },
};

const summaryPath = path.join(artifactDir, 'lighthouse-summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
