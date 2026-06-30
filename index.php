<?php
// Pega o IP real e o JA3 Hash do Cloudflare
 $ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'];
 $ja3_hash = $_SERVER['HTTP_CF_JA3_HASH'] ?? 'desconhecido';
 $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
 $lang = $_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '';

// Função: Detecta mentiras nos Headers
function eh_inconsistente($ua, $lang, $ip_data_pais) {
    // Se o IP é BR, mas o navegador está em Russo/Inglês primário -> Suspeito
    if ($ip_data_pais == 'BR' && strpos($lang, 'pt-BR') !== 0 && strpos($lang, 'pt') !== 0) {
        return true;
    }
    // Se diz ser Android mas tem headers de Windows -> Suspeito
    if (strpos($ua, 'Android') !== false && strpos($ua, 'Windows') !== false) {
        return true;
    }
    return false;
}

// Função: Consulta API de Fraude (Ex: IPQS)
function verificar_fraud_score($ip) {
    $api_key = 'SUA_CHAVE_IPQS';
    $url = "https://ipqualityscore.com/api/json/ip/{$api_key}/{$ip}";
    $resp = @file_get_contents($url);
    if ($resp) {
        $data = json_decode($resp, true);
        // Em 2026, um score acima de 75 costuma ser bot residencial
        if (isset($data['fraud_score']) && $data['fraud_score'] > 75) return true; 
        if (isset($data['bot_status']) && $data['bot_status'] === true) return true;
    }
    return false;
}

// 1. Verificações Imediatas (Sem JS)
 $bot_ua = (empty($ua) || strpos($ua, 'bot') !== false || strpos($ua, 'crawler') !== false);
 $fraud_score_alto = verificar_fraud_score($ip);
 $inconsistente = eh_inconsistente($ua, $lang, 'BR'); // Assumindo BR como base

// Lista de JA3 bloqueados (Bots conhecidos)
 $ja3_bloqueados = ['e7d705a3286e19ea42f587b344ee6865', 'd4e6c2c3d8a0b1f2e3c4d5a6b7c8d9e0'];

// DECISÃO FASE 1
if ($bot_ua || $fraud_score_alto || $inconsistente || in_array($ja3_hash, $ja3_bloqueados)) {
    // Bloqueio direto: É lixo
    include('safe_page.php');
    exit;
} else {
    // Passou na Fase 1. Manda para o "Quarto de Interrogatório" (Fase 2)
    // Vamos gerar um token único e temporário para ele provar que é humano
    session_start();
    $_SESSION['tentando_provar'] = true;
    $_SESSION['timestamp_entrada'] = time();
    
    include('buffer_page.php'); // A página que vai rodar o JS de biometria
    exit;
}
?>