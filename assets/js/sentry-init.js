(function () {
  'use strict';

  if (window.__TEST_MODE || window.__LAB_MODE) return;
  if (!window.Sentry || typeof window.Sentry.init !== 'function') return;

  var SENTRY_DSN = 'https://f8d1be18755917c1be655af4bc0fea0e@o4511295261048832.ingest.de.sentry.io/4511295281496144';
  var RELEASE = 'izzat-web@2026-04-28-sentry1';

  function isTikTokInApp() {
    try {
      return /tiktok|musical_ly|bytedance|aweme/i.test(navigator.userAgent || '');
    } catch (e) {
      return false;
    }
  }

  function siteArea() {
    return /^\/c(?:\/|$)/i.test(window.location.pathname || '') ? 'checkout' : 'landing';
  }

  function stripQuery(value) {
    if (!value || typeof value !== 'string') return value;
    try {
      var url = new URL(value, window.location.origin);
      url.search = '';
      url.hash = '';
      return url.toString();
    } catch (e) {
      return value.split('?')[0].split('#')[0];
    }
  }

  function scrubText(value) {
    if (typeof value !== 'string') return value;
    return value
      .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email]')
      .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf]')
      .replace(/\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}\b/g, '[phone]');
  }

  function scrubObject(value, depth) {
    if (depth > 4 || value === null || value === undefined) return value;
    if (typeof value === 'string') return scrubText(value);
    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.slice(0, 30).map(function (item) { return scrubObject(item, depth + 1); });

    var out = {};
    Object.keys(value).slice(0, 80).forEach(function (key) {
      var lower = String(key).toLowerCase();
      if (
        lower.indexOf('password') >= 0 ||
        lower.indexOf('senha') >= 0 ||
        lower.indexOf('token') >= 0 ||
        lower.indexOf('authorization') >= 0 ||
        lower.indexOf('cookie') >= 0 ||
        lower.indexOf('pix') >= 0 ||
        lower === 'name' ||
        lower === 'nome' ||
        lower === 'phone' ||
        lower === 'telefone' ||
        lower === 'email' ||
        lower === 'cpf'
      ) {
        out[key] = '[filtered]';
        return;
      }
      out[key] = scrubObject(value[key], depth + 1);
    });
    return out;
  }

  window.Sentry.init({
    dsn: SENTRY_DSN,
    release: RELEASE,
    environment: /\.pages\.dev$/i.test(window.location.hostname || '') ? 'preview' : 'production',
    sendDefaultPii: false,
    attachStacktrace: true,
    autoSessionTracking: true,
    tracesSampleRate: 0.05,
    tracePropagationTargets: [
      /^\/api\//,
      /^https:\/\/redeizzat\.shop\/api\//i,
      /^https:\/\/[a-z0-9-]+\.novaizzat\.pages\.dev\/api\//i,
    ],
    denyUrls: [
      /extensions\//i,
      /^chrome:\/\//i,
      /^moz-extension:\/\//i,
      /^safari-extension:\/\//i,
    ],
    integrations: [
      typeof window.Sentry.browserTracingIntegration === 'function'
        ? window.Sentry.browserTracingIntegration()
        : null,
    ].filter(Boolean),
    beforeBreadcrumb: function (breadcrumb) {
      if (!breadcrumb) return breadcrumb;
      if (breadcrumb.category === 'ui.input') return null;
      if (breadcrumb.data && breadcrumb.data.url) breadcrumb.data.url = stripQuery(breadcrumb.data.url);
      if (breadcrumb.message) breadcrumb.message = scrubText(breadcrumb.message);
      return breadcrumb;
    },
    beforeSend: function (event) {
      if (!event) return event;

      event.user = undefined;
      event.tags = Object.assign({}, event.tags || {}, {
        site_area: siteArea(),
        tiktok_in_app: isTikTokInApp() ? 'yes' : 'no',
      });

      if (event.request) {
        event.request.url = stripQuery(event.request.url);
        event.request.query_string = undefined;
        event.request.cookies = undefined;
        event.request.headers = undefined;
        event.request.data = undefined;
      }

      event.extra = scrubObject(event.extra || {}, 0);
      event.contexts = scrubObject(event.contexts || {}, 0);

      return event;
    },
  });

  window.Sentry.setTag('site_area', siteArea());
  window.Sentry.setTag('tiktok_in_app', isTikTokInApp() ? 'yes' : 'no');
  window.__izzatSentryReady = true;
})();
