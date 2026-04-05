function buildExpiredCookie(name, domain) {
  let value = `${name}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=/; SameSite=Lax`;
  if (domain) value += `; Domain=${domain}`;
  return value;
}

function buildCleanupHeaders(request) {
  const url = new URL(request.url);
  const host = url.hostname.replace(/^www\./i, '');
  const headers = new Headers({
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
    pragma: 'no-cache',
    expires: '0',
    'clear-site-data': '"cache", "cookies", "storage"',
  });

  const cookieNames = [
    '_ttp',
    'ttclid',
    'user_external_id',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'gclid',
    'fbclid',
    'msclkid',
  ];

  cookieNames.forEach((name) => {
    headers.append('set-cookie', buildExpiredCookie(name));
    headers.append('set-cookie', buildExpiredCookie(name, url.hostname));
    if (host && host !== url.hostname) headers.append('set-cookie', buildExpiredCookie(name, `.${host}`));
  });

  return headers;
}

function buildLabHtml(target) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate, max-age=0">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <title>LAB - Limpando ambiente</title>
</head>
<body style="font-family: Inter, Arial, sans-serif; padding: 24px;">
  <p>Preparando ambiente limpo para testes...</p>
  <script>
    (function () {
      var target = ${JSON.stringify(target)};
      function safe(fn) { try { fn(); } catch (e) {} }
      safe(function () { localStorage.clear(); });
      safe(function () { sessionStorage.clear(); });
      safe(function () {
        document.cookie.split(';').forEach(function (cookie) {
          var eq = cookie.indexOf('=');
          var name = (eq > -1 ? cookie.slice(0, eq) : cookie).trim();
          if (!name) return;
          document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax';
        });
      });
      safe(function () {
        if (window.caches && typeof window.caches.keys === 'function') {
          window.caches.keys().then(function (keys) {
            keys.forEach(function (key) { window.caches.delete(key); });
          }).catch(function () {});
        }
      });
      safe(function () {
        if (navigator.serviceWorker && typeof navigator.serviceWorker.getRegistrations === 'function') {
          navigator.serviceWorker.getRegistrations().then(function (registrations) {
            registrations.forEach(function (registration) {
              try { registration.unregister(); } catch (e) {}
            });
          }).catch(function () {});
        }
      });
      setTimeout(function () { window.location.replace(target); }, 80);
    })();
  </script>
</body>
</html>`;
}

export async function onRequest(context) {
  const target = `/?lab=1&_lab_nonce=${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return new Response(buildLabHtml(target), {
    status: 200,
    headers: buildCleanupHeaders(context.request),
  });
}
