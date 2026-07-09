/** Permission API patterns */

import { finding, finalizeResult, withTimeout } from '../utils.js?v2';

async function queryPerm(name) {
  if (!navigator.permissions?.query) return { name, state: 'no-api' };
  try {
    const r = await navigator.permissions.query({ name });
    return { name, state: r.state };
  } catch {
    return { name, state: 'error' };
  }
}

export async function run() {
  const findings = [];
  const names = ['notifications', 'geolocation', 'camera', 'microphone', 'clipboard-read'];
  const results = {};

  await Promise.all(
    names.map(async (n) => {
      results[n] = await withTimeout(queryPerm(n), 1500, { name: n, state: 'timeout' });
    })
  );

  const raw = {
    permissions: results,
    notificationPermission: typeof Notification !== 'undefined' ? Notification.permission : 'no-api',
  };

  // Notification.permission vs permissions.query mismatch can indicate spoof
  if (
    typeof Notification !== 'undefined' &&
    results.notifications &&
    results.notifications.state !== 'error' &&
    results.notifications.state !== 'no-api' &&
    results.notifications.state !== 'timeout'
  ) {
    const map = { default: 'prompt', granted: 'granted', denied: 'denied' };
    const expected = map[Notification.permission];
    if (expected && results.notifications.state !== expected && results.notifications.state !== Notification.permission) {
      findings.push(
        finding(
          'perm-notification-mismatch',
          'medium',
          'Notification.permission â‰  permissions.query',
          `Notification=${Notification.permission}, query=${results.notifications.state}`,
          -8,
          ['BAD_FP']
        )
      );
    }
  }

  // permissions API completely missing on chromium-like is odd
  if (!navigator.permissions) {
    findings.push(
      finding(
        'perm-api-missing',
        'low',
        'Permissions API ausente',
        '',
        -2,
        []
      )
    );
  }

  return finalizeResult('permissions', 'Permissions', findings, raw);
}
