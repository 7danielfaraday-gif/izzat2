<?php
declare(strict_types=1);

session_start();

$DATA_DIR = __DIR__ . '/../data';
$PIX_FILE = $DATA_DIR . '/pix.json';
$AUTH_FILE = $DATA_DIR . '/admin.json';

function h(string $s): string {
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function read_json(string $path): array {
    if (!is_file($path)) return [];
    $raw = @file_get_contents($path);
    $data = json_decode($raw ?: '', true);
    return is_array($data) ? $data : [];
}

function write_json(string $path, array $data): bool {
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) return false;
    return (bool)@file_put_contents($path, $json . "\n", LOCK_EX);
}

function now_iso(): string {
    try {
        $tz = new DateTimeZone('America/Sao_Paulo');
        return (new DateTimeImmutable('now', $tz))->format('c');
    } catch (Throwable $e) {
        return date('c');
    }
}

$auth = read_json($AUTH_FILE);
$hasPassword = isset($auth['password_hash']) && is_string($auth['password_hash']) && $auth['password_hash'] !== '';
$isLogged = !empty($_SESSION['pix_admin']) && $_SESSION['pix_admin'] === true;

// Helpers: redirect
function go(string $path): void {
    header('Location: ' . $path);
    exit;
}

// Logout
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'logout') {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], (bool)$params['secure'], (bool)$params['httponly']);
    }
    session_destroy();
    go('./pix-panel.php');
}

$flash = '';

// First-time setup (create password)
if (!$hasPassword && $_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'setup_password') {
    $p1 = (string)($_POST['password'] ?? '');
    $p2 = (string)($_POST['password_confirm'] ?? '');

    if (strlen($p1) < 10) {
        $flash = 'A senha precisa ter pelo menos 10 caracteres.';
    } elseif ($p1 !== $p2) {
        $flash = 'As senhas não conferem.';
    } else {
        if (!is_dir($DATA_DIR)) @mkdir($DATA_DIR, 0755, true);
        $hash = password_hash($p1, PASSWORD_BCRYPT);
        if (!$hash) {
            $flash = 'Falha ao gerar hash da senha.';
        } else {
            $ok = write_json($AUTH_FILE, [
                'password_hash' => $hash,
                'created_at' => now_iso(),
                'updated_at' => now_iso(),
            ]);
            if ($ok) {
                $_SESSION['pix_admin'] = true;
                go('./pix-panel.php');
            }
            $flash = 'Não consegui salvar o arquivo de senha. Verifique permissões da pasta /data.';
        }
    }
}

// Login
if ($hasPassword && !$isLogged && $_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'login') {
    $pass = (string)($_POST['password'] ?? '');
    if (password_verify($pass, (string)$auth['password_hash'])) {
        $_SESSION['pix_admin'] = true;
        go('./pix-panel.php');
    } else {
        $flash = 'Senha incorreta.';
    }
}

// If not configured yet: show setup page
if (!$hasPassword && !$isLogged) {
    ?>
    <!doctype html>
    <html lang="pt-BR">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Painel PIX - Configuração Inicial</title>
        <style>
            body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#0b1220;color:#e5e7eb;}
            .wrap{max-width:720px;margin:0 auto;padding:28px;}
            .card{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:22px;backdrop-filter:blur(10px);}
            h1{font-size:20px;margin:0 0 10px 0;}
            p{margin:0 0 16px 0;color:#cbd5e1;line-height:1.45;}
            label{display:block;font-weight:700;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#cbd5e1;margin:16px 0 6px;}
            input{width:100%;padding:14px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.16);background:rgba(15,23,42,0.55);color:#e5e7eb;outline:none;font-size:15px;}
            input:focus{border-color:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.12)}
            .btn{margin-top:18px;width:100%;padding:14px 16px;border:0;border-radius:12px;background:linear-gradient(90deg,#22c55e,#16a34a);color:#052e16;font-weight:900;font-size:15px;cursor:pointer;}
            .alert{margin-top:14px;padding:12px 14px;border-radius:12px;background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.2);color:#fecaca;font-weight:700;font-size:13px;}
            .note{margin-top:14px;font-size:12px;color:#94a3b8;}
            code{background:rgba(15,23,42,0.6);padding:2px 6px;border-radius:8px;border:1px solid rgba(255,255,255,0.12)}
        </style>
    </head>
    <body>
        <div class="wrap">
            <div class="card">
                <h1>🔐 Criar senha do Painel PIX</h1>
                <p>Essa é a primeira vez que você abre o painel. Defina uma senha forte para poder alterar o PIX depois, sem mexer no HTML.</p>
                <form method="post">
                    <input type="hidden" name="action" value="setup_password" />
                    <label>Senha (mín. 10 caracteres)</label>
                    <input type="password" name="password" autocomplete="new-password" required />
                    <label>Confirmar senha</label>
                    <input type="password" name="password_confirm" autocomplete="new-password" required />
                    <button class="btn" type="submit">Salvar senha e entrar</button>
                </form>
                <?php if ($flash): ?>
                    <div class="alert"><?= h($flash) ?></div>
                <?php endif; ?>
                <div class="note">📌 Dica: se aparecer erro de permissão, garanta que a pasta <code>/data</code> exista e tenha permissão de escrita no seu servidor.</div>
            </div>
        </div>
    </body>
    </html>
    <?php
    exit;
}

// If needs login
if ($hasPassword && !$isLogged) {
    ?>
    <!doctype html>
    <html lang="pt-BR">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Painel PIX - Login</title>
        <style>
            body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#0b1220;color:#e5e7eb;}
            .wrap{max-width:720px;margin:0 auto;padding:28px;}
            .card{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:22px;backdrop-filter:blur(10px);}
            h1{font-size:20px;margin:0 0 10px 0;}
            p{margin:0 0 16px 0;color:#cbd5e1;line-height:1.45;}
            label{display:block;font-weight:700;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#cbd5e1;margin:16px 0 6px;}
            input{width:100%;padding:14px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.16);background:rgba(15,23,42,0.55);color:#e5e7eb;outline:none;font-size:15px;}
            input:focus{border-color:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.12)}
            .btn{margin-top:18px;width:100%;padding:14px 16px;border:0;border-radius:12px;background:linear-gradient(90deg,#22c55e,#16a34a);color:#052e16;font-weight:900;font-size:15px;cursor:pointer;}
            .alert{margin-top:14px;padding:12px 14px;border-radius:12px;background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.2);color:#fecaca;font-weight:700;font-size:13px;}
        </style>
    </head>
    <body>
        <div class="wrap">
            <div class="card">
                <h1>✅ Painel PIX</h1>
                <p>Entre para alterar o código PIX do checkout.</p>
                <form method="post">
                    <input type="hidden" name="action" value="login" />
                    <label>Senha</label>
                    <input type="password" name="password" autocomplete="current-password" required />
                    <button class="btn" type="submit">Entrar</button>
                </form>
                <?php if ($flash): ?>
                    <div class="alert"><?= h($flash) ?></div>
                <?php endif; ?>
            </div>
        </div>
    </body>
    </html>
    <?php
    exit;
}

// Logged-in actions
$pix = read_json($PIX_FILE);
$currentPix = (string)($pix['pix_code'] ?? '');
$currentQr  = isset($pix['qrcode_url']) ? (string)$pix['qrcode_url'] : '';

$success = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'save_pix') {
    $pixCode = trim((string)($_POST['pix_code'] ?? ''));
    $qrUrlRaw = trim((string)($_POST['qrcode_url'] ?? ''));

    if ($pixCode === '') {
        $flash = 'O campo "Código PIX" não pode ficar vazio.';
    } else {
        $payload = [
            'pix_code' => $pixCode,
            // Permite esconder a imagem do QR (deixe em branco para usar o default do checkout)
            'qrcode_url' => ($qrUrlRaw === '' ? null : $qrUrlRaw),
            'updated_at' => now_iso(),
        ];

        if (!is_dir($DATA_DIR)) @mkdir($DATA_DIR, 0755, true);
        $ok = write_json($PIX_FILE, $payload);
        if ($ok) {
            $success = 'Configuração salva! ✅ O checkout já vai puxar o novo PIX automaticamente.';
            $pix = $payload;
            $currentPix = (string)$pix['pix_code'];
            $currentQr  = $pix['qrcode_url'] === null ? '' : (string)$pix['qrcode_url'];
        } else {
            $flash = 'Não consegui salvar. Verifique permissões de escrita na pasta /data.';
        }
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'change_password') {
    $p1 = (string)($_POST['new_password'] ?? '');
    $p2 = (string)($_POST['new_password_confirm'] ?? '');

    if (strlen($p1) < 10) {
        $flash = 'A nova senha precisa ter pelo menos 10 caracteres.';
    } elseif ($p1 !== $p2) {
        $flash = 'As novas senhas não conferem.';
    } else {
        $hash = password_hash($p1, PASSWORD_BCRYPT);
        if (!$hash) {
            $flash = 'Falha ao gerar hash da senha.';
        } else {
            $ok = write_json($AUTH_FILE, [
                'password_hash' => $hash,
                'created_at' => $auth['created_at'] ?? now_iso(),
                'updated_at' => now_iso(),
            ]);
            $success = $ok ? 'Senha atualizada com sucesso! 🔐' : 'Não consegui salvar a senha. Verifique permissões da pasta /data.';
        }
    }
}

?>
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Painel PIX - Checkout</title>
    <style>
        body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#0b1220;color:#e5e7eb;}
        .wrap{max-width:980px;margin:0 auto;padding:28px;}
        .top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px}
        .badge{font-size:12px;color:#cbd5e1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);padding:8px 10px;border-radius:999px;}
        .card{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:22px;backdrop-filter:blur(10px);margin-bottom:18px}
        h1{font-size:20px;margin:0}
        h2{font-size:14px;margin:0 0 10px 0;color:#e2e8f0;letter-spacing:.06em;text-transform:uppercase}
        p{margin:0 0 12px 0;color:#cbd5e1;line-height:1.45}
        label{display:block;font-weight:800;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#cbd5e1;margin:14px 0 6px;}
        textarea,input{width:100%;padding:14px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.16);background:rgba(15,23,42,0.55);color:#e5e7eb;outline:none;font-size:14px;}
        textarea{min-height:120px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;}
        textarea:focus,input:focus{border-color:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.12)}
        .row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        @media(max-width:740px){.row{grid-template-columns:1fr}}
        .btn{margin-top:14px;padding:14px 16px;border:0;border-radius:12px;background:linear-gradient(90deg,#22c55e,#16a34a);color:#052e16;font-weight:900;font-size:14px;cursor:pointer}
        .btn-outline{background:transparent;color:#e5e7eb;border:1px solid rgba(255,255,255,0.18)}
        .actions{display:flex;gap:10px;flex-wrap:wrap}
        .alert{margin-top:12px;padding:12px 14px;border-radius:12px;background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.2);color:#fecaca;font-weight:800;font-size:13px;}
        .success{margin-top:12px;padding:12px 14px;border-radius:12px;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.2);color:#bbf7d0;font-weight:800;font-size:13px;}
        .mini{font-size:12px;color:#94a3b8}
        code{background:rgba(15,23,42,0.6);padding:2px 6px;border-radius:8px;border:1px solid rgba(255,255,255,0.12)}
    </style>
</head>
<body>
    <div class="wrap">
        <div class="top">
            <div>
                <h1>🧾 Painel do PIX (Checkout)</h1>
                <div class="mini">Atualiza o PIX sem mexer no HTML. Alterações ficam em <code>/data/pix.json</code> e o checkout puxa via <code>/pix-config.php</code>.</div>
            </div>
            <div class="actions">
                <a class="badge" href="../checkout" target="_blank" rel="noopener">Abrir /checkout</a>
                <a class="badge" href="../checkout.html" target="_blank" rel="noopener">Abrir checkout.html</a>
                <form method="post" style="margin:0">
                    <input type="hidden" name="action" value="logout" />
                    <button class="badge" style="cursor:pointer" type="submit">Sair</button>
                </form>
            </div>
        </div>

        <div class="card">
            <h2>Configuração do PIX</h2>
            <p>Cole aqui o código <strong>PIX Copia e Cola</strong>. Se quiser, você pode trocar o QR Code também.</p>
            <form method="post">
                <input type="hidden" name="action" value="save_pix" />
                <label>Código PIX (Copia e Cola)</label>
                <textarea name="pix_code" required><?= h($currentPix) ?></textarea>
                <div class="row">
                    <div>
                        <label>URL/Path da imagem do QR Code (opcional)</label>
                        <input name="qrcode_url" value="<?= h($currentQr) ?>" placeholder="Ex.: assets/img/qrcode.webp" />
                        <div class="mini">Deixe vazio para o checkout usar o QR padrão.</div>
                    </div>
                    <div>
                        <label>Última atualização</label>
                        <input value="<?= h((string)($pix['updated_at'] ?? '—')) ?>" disabled />
                        <div class="mini">Se você usa cache no servidor/CDN, esse painel já tenta evitar cache no endpoint.</div>
                    </div>
                </div>
                <button class="btn" type="submit">Salvar PIX</button>
            </form>
            <?php if ($flash): ?>
                <div class="alert"><?= h($flash) ?></div>
            <?php endif; ?>
            <?php if ($success): ?>
                <div class="success"><?= h($success) ?></div>
            <?php endif; ?>
        </div>

        <div class="card">
            <h2>Segurança</h2>
            <p>Recomendação: use uma senha forte e não compartilhe o link do painel.</p>
            <form method="post">
                <input type="hidden" name="action" value="change_password" />
                <div class="row">
                    <div>
                        <label>Nova senha</label>
                        <input type="password" name="new_password" autocomplete="new-password" required />
                    </div>
                    <div>
                        <label>Confirmar nova senha</label>
                        <input type="password" name="new_password_confirm" autocomplete="new-password" required />
                    </div>
                </div>
                <button class="btn btn-outline" type="submit">Alterar senha</button>
            </form>
        </div>

        <div class="mini">💡 Dica extra: para ficar ainda mais seguro, você pode proteger a pasta <code>/admin</code> via senha do servidor (Basic Auth) no seu hosting (cPanel, Cloudflare Access, etc.).</div>
    </div>
</body>
</html>
