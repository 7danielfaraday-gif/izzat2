<?php
// Retorna a configuração do PIX em JSON (para o checkout consumir)
// Requisito: servidor com PHP habilitado.

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

$path = __DIR__ . '/data/pix.json';

if (!file_exists($path)) {
    echo json_encode(new stdClass(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$raw = @file_get_contents($path);
$data = json_decode($raw ?: '', true);

if (!is_array($data)) {
    $data = [];
}

echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
