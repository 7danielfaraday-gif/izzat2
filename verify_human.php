<?php
session_start();

// Verifica se a sessão foi iniciada no buffer_page.php
if (!isset($_SESSION['tentando_provar'])) {
    die("Acesso negado.");
}

// Verifica se o tempo entre a entrada e a confirmação é aceitável (ex: mais de 1.5s e menos de 60s)
 $tempo_atual = time();
 $tempo_entrada = $_SESSION['timestamp_entrada'];

if (($tempo_atual - $tempo_entrada) > 1 && ($tempo_atual - $tempo_entrada) < 60) {
    // Limpa a sessão
    unset($_SESSION['tentando_provar']);
    
    // HUMANO CONFIRMADO. Puxa a página de vendas.
    include('money_page.php');
} else {
    // Tentativa de burla direta ou demorou demais
    http_response_code(403);
    echo "Acesso negado.";
}
?>