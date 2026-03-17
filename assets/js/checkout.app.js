/**
 * checkout.app.js — Vanilla JS, sem React, sem Tailwind runtime
 * Princípio: HTML já está visível. Este script só adiciona comportamento.
 * Defensivo: qualquer erro aqui NÃO impede o usuário de ver ou enviar o formulário.
 */
(function () {
  'use strict';

  /* ── Constantes ── */
  var PIX_CODE = '00020101021226900014br.gov.bcb.pix2568pix.adyen.com/pixqrcodelocation/pixloc/v1/loc/hWu3o18RS3OOujzeqNF5iQ5204000053039865802BR5925MONETIZZE IMPULSIONADORA 6009SAO PAULO62070503***63047984';
  var QR_URL   = '/assets/img/qrcode.webp';
  var locked   = false;
  var cepBusy  = false;

  /* ── Máscaras (lazy — só cria quando usado) ── */
  var masks = {};
  function getMask(type) {
    if (!masks[type] && window.createInputMask) {
      try { masks[type] = window.createInputMask(type); } catch (_) {}
    }
    return masks[type];
  }

  function applyMask(inp, type) {
    if (!inp) return;
    inp.addEventListener('input', function () {
      if (locked) return;
      var m = getMask(type);
      if (!m) return;
      try {
        var res = m.format(inp.value, inp.selectionStart);
        inp.value = res.formatted;
        inp.setSelectionRange(res.cursorPosition, res.cursorPosition);
      } catch (_) {}
    });
  }

  /* ── Refs ── */
  function $  (id) { return document.getElementById(id); }
  function cls(el, add, remove) {
    if (!el) return;
    if (add)    el.classList.add(add);
    if (remove) el.classList.remove(remove);
  }

  /* ── Inicialização ── */
  function init() {
    // Data de entrega
    var dd = $('delivery-date');
    if (dd) dd.textContent = deliveryDate();

    // Máscaras
    applyMask($('f-tel'), 'phone');
    applyMask($('f-cpf'), 'cpf');
    applyMask($('f-cep'), 'cep');

    // CEP
    $('f-cep') && $('f-cep').addEventListener('input', onCepInput);

    // CPF progress
    $('f-cpf') && $('f-cpf').addEventListener('input', updateCpfProg);

    // Progress bar de preenchimento
    ['f-nome','f-email','f-tel','f-cpf','f-rua','f-num'].forEach(function(id) {
      $(id) && $(id).addEventListener('input', updateProgress);
    });

    // Blur → validação suave + tracking
    $('f-nome')  && $('f-nome').addEventListener('blur',  function(){ validateField('f-nome'); });
    $('f-email') && $('f-email').addEventListener('blur', function(){ validateField('f-email'); trackBlur('email', $('f-email').value); });
    $('f-tel')   && $('f-tel').addEventListener('blur',   function(){ validateField('f-tel');   trackBlur('phone', $('f-tel').value); });

    // Salvar dados (resiliência)
    ['f-nome','f-email','f-tel','f-cpf','f-cep','f-rua','f-num','f-cidade'].forEach(function(id) {
      $(id) && $(id).addEventListener('blur', saveData);
    });

    // Restaurar dados salvos
    restoreData();

    // Form submit (para teclado Enter também funcionar)
    var form = $('ck-form');
    if (form) form.addEventListener('submit', function(e) { e.preventDefault(); ckSubmit(e); });

    // Botão desktop também chama ckSubmit via submit do form
    // (type="submit" no botão já dispara o evento submit do form)

    // Voltar
    $('btn-back') && $('btn-back').addEventListener('click', goBack);

    // Keyboard detection
    try { if (window.setupKeyboardDetection) window.setupKeyboardDetection(); } catch(_) {}

    // Buscar config PIX
    fetchPixConfig();

    // Analytics lazy
    setTimeout(function() { try { if(window.loadAnalytics) window.loadAnalytics(); } catch(_){} }, 3500);

    // Tracking de entrada
    try {
      window.scrollTo(0,0);
      if (window.trackPixel && window.PRODUCT_CONTENT) {
        window.trackPixel('ViewContent',      Object.assign({}, window.PRODUCT_CONTENT, { event_id: window.generateEventId() }));
        window.trackPixel('InitiateCheckout', Object.assign({}, window.PRODUCT_CONTENT, { event_id: window.generateEventId() }));
      }
    } catch(_) {}

    // Sinalizar ao analytics que checkout carregou OK (sem skeleton)
    try {
      window.__ckReadyAt = Date.now();
      if (window.__ckTrack && window.__ckTrack.checkoutReady) window.__ckTrack.checkoutReady();
    } catch(_) {}
  }

  /* ── Persistência ── */
  function saveData() {
    try {
      localStorage.setItem('checkout_safe_data', JSON.stringify({
        name: ($('f-nome')||{}).value || '',
        email: ($('f-email')||{}).value || '',
        phone: ($('f-tel')||{}).value || '',
        cpf: ($('f-cpf')||{}).value || '',
        cep: ($('f-cep')||{}).value || '',
        address: ($('f-rua')||{}).value || '',
        number: ($('f-num')||{}).value || '',
        city: ($('f-cidade')||{}).value || ''
      }));
    } catch(_) {}
  }

  function restoreData() {
    try {
      var d = JSON.parse(localStorage.getItem('checkout_safe_data') || '{}');
      if (d.name)    { $('f-nome').value    = d.name; }
      if (d.email)   { $('f-email').value   = d.email; }
      if (d.phone)   { $('f-tel').value     = d.phone; }
      if (d.cpf)     { $('f-cpf').value     = d.cpf; updateCpfProg(); }
      if (d.cep)     { $('f-cep').value     = d.cep; }
      if (d.address) { $('f-rua').value     = d.address; showAddr(false); }
      if (d.number)  { $('f-num').value     = d.number; }
      if (d.city)    { $('f-cidade').value  = d.city; }
      if (d.name || d.email || d.phone) updateProgress();
    } catch(_) {}
  }

  /* ── Barra de progresso ── */
  function updateProgress() {
    try {
      var vals = ['f-nome','f-email','f-tel','f-cpf','f-rua','f-num'].map(function(id){ return ($$(id)||{}).value||''; });
      var filled = vals.filter(function(v){ return v.trim(); }).length;
      var bar = $('ck-progress');
      if (bar) bar.style.width = Math.min(Math.round(filled/6*100), 100) + '%';
    } catch(_) {}
  }
  function $$(id){ return document.getElementById(id); } // alias sem crash

  /* ── CPF progress ── */
  function updateCpfProg() {
    try {
      var inp = $('f-cpf');
      if (!inp) return;
      var len = inp.value.replace(/\D/g,'').length;
      var prog = $('cpf-prog');
      if (!prog) return;
      if (len === 0) { prog.style.display = 'none'; return; }
      prog.style.display = 'flex';
      var bar = $('cpf-bar'), lbl = $('cpf-lbl');
      var done = len >= 11;
      if (bar) { bar.style.width = Math.min(len/11*100,100)+'%'; bar.style.background = done ? '#16a34a' : '#d1d5db'; }
      if (lbl) { lbl.textContent = done ? 'CPF Válido' : 'Digitando...'; lbl.style.color = done ? '#16a34a' : '#9ca3af'; }
    } catch(_) {}
  }

  /* ── CEP ── */
  function onCepInput() {
    try {
      var raw = ($('f-cep')||{}).value.replace(/\D/g,'');
      if (raw.length === 8) fetchCep(raw);
    } catch(_) {}
  }

  function showAddr(animate) {
    var el = $('addr-fields');
    if (el) el.style.display = 'block';
  }

  function fetchCep(cep) {
    if (cepBusy) return;
    cepBusy = true;
    var spin = $('cep-spin');
    if (spin) spin.style.display = 'block';

    var ctrl = window.AbortController ? new AbortController() : null;
    var tid = setTimeout(function(){ if(ctrl) ctrl.abort(); }, 5000);

    fetch('https://viacep.com.br/ws/' + cep + '/json/', ctrl ? { signal: ctrl.signal } : {})
      .then(function(r){ clearTimeout(tid); if(!r.ok) throw new Error(); return r.json(); })
      .then(function(d){
        var failMsg = $('cep-fail-msg');
        var errEl   = $('e-cep');
        if (d && !d.erro) {
          if ($('f-rua') && d.logradouro) $('f-rua').value = d.logradouro;
          if ($('f-cidade')) $('f-cidade').value = (d.localidade||'') + (d.uf ? '/'+d.uf : '');
          if (failMsg) failMsg.style.display = 'none';
          if (errEl)   errEl.classList.remove('show');
          showAddr(true);
          setTimeout(function(){ try{ $('f-num') && $('f-num').focus(); }catch(_){} }, 300);
        } else {
          if (failMsg) failMsg.style.display = 'block';
          if (errEl)   errEl.classList.add('show');
          showAddr(true);
        }
      })
      .catch(function(){
        clearTimeout(tid);
        var failMsg = $('cep-fail-msg');
        if (failMsg) failMsg.style.display = 'block';
        showAddr(true);
      })
      .finally(function(){
        cepBusy = false;
        if (spin) spin.style.display = 'none';
        saveData();
      });
  }

  /* ── Validação ── */
  function setFieldState(id, state) { // 'valid' | 'error' | ''
    var inp = $(id);
    if (!inp) return;
    inp.classList.remove('valid','error');
    if (state) inp.classList.add(state);
  }

  function showErr(id, show) {
    var el = $(id);
    if (!el) return;
    if (show) el.classList.add('show'); else el.classList.remove('show');
  }

  function validateField(id) {
    try {
      var inp = $(id);
      if (!inp) return true;
      var v = inp.value || '';
      var ok = true;
      if (id === 'f-nome')  { ok = v.trim().length > 1; setFieldState(id, ok?'valid':'error'); showErr('e-nome',  !ok); }
      if (id === 'f-email') { ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); setFieldState(id, v ? (ok?'valid':'error') : ''); showErr('e-email', !!v && !ok); }
      if (id === 'f-tel')   { ok = v.replace(/\D/g,'').length >= 10; setFieldState(id, v ? (ok?'valid':'error') : ''); showErr('e-tel',   !!v && !ok); }
      return ok;
    } catch(_) { return true; }
  }

  function validateAll() {
    var a = validateField('f-nome');
    var b = validateField('f-email');
    var c = validateField('f-tel');
    // Forçar exibição dos erros mesmo sem blur
    if (!a) { setFieldState('f-nome',  'error'); showErr('e-nome',  true); }
    if (!b) { setFieldState('f-email', 'error'); showErr('e-email', true); }
    if (!c) { setFieldState('f-tel',   'error'); showErr('e-tel',   true); }
    return a && b && c;
  }

  /* ── Submit ── */
  window.ckSubmit = function(ev) {
    try { if (ev) ev.preventDefault(); } catch(_) {}
    if (locked) return;

    if (!validateAll()) {
      // Scroll para o primeiro campo com erro
      try {
        var first = document.querySelector('.field-input.error');
        if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch(_) {}
      return;
    }

    locked = true;
    setBtnState('loading');

    try { if (document.activeElement) document.activeElement.blur(); } catch(_) {}

    var name   = ($('f-nome')||{}).value || '';
    var email  = (($('f-email')||{}).value || '').trim().toLowerCase();
    var phone  = (($('f-tel')||{}).value || '').replace(/\D/g,'');
    var fname  = name.trim().split(' ')[0] || 'Cliente';
    var oid    = 'ord_' + Date.now();

    // Analytics
    window.__ckSubmitAt = Date.now();
    try { if(window.__ckTrack && window.__ckTrack.submitClick) window.__ckTrack.submitClick(); } catch(_) {}
    try {
      if (window.trackPixel && window.PRODUCT_CONTENT) {
        window.trackPixel('AddPaymentInfo', Object.assign({}, window.PRODUCT_CONTENT, {
          event_id: window.generateEventId(), order_id: oid, email: email, phone: phone
        }));
      }
    } catch(_) {}

    // Salvar pedido fire-and-forget
    try {
      var payload = JSON.stringify({
        name: name.trim(), phone: phone,
        ref: (function(){ try{ return (localStorage.getItem('ttclid')||'').slice(-8); }catch(e){ return ''; } })(),
        source: 'checkout_public', status: 'pending'
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/order-create', new Blob([payload], { type:'application/json' }));
      } else {
        fetch('/api/order-create', { method:'POST', headers:{'content-type':'application/json'}, body:payload, keepalive:true }).catch(function(){});
      }
    } catch(_) {}

    saveData();

    // Mostrar PIX
    setTimeout(function(){ showPix(fname, oid, email, phone); }, 800);
  };

  /* ── Estado dos botões ── */
  function setBtnState(state) {
    var loading = state === 'loading';
    var spinner = '<span class="btn-spin"></span> Processando...';
    var idle    = 'FINALIZAR COM DESCONTO <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
    ['btn-mob','btn-desk'].forEach(function(id) {
      var btn = $(id);
      if (!btn) return;
      btn.disabled = loading;
      btn.style.opacity = loading ? '.75' : '1';
    });
    var mi = $('btn-mob-inner');  if (mi)  mi.innerHTML  = loading ? spinner : idle;
    var di = $('btn-desk-inner'); if (di)  di.innerHTML  = loading ? spinner : idle;
  }

  /* ── Tela PIX ── */
  function showPix(fname, oid, email, phone) {
    // Esconder checkout e footer
    var ckScr = $('ck-screen'),  footer = $('ck-footer');
    if (ckScr)  ckScr.style.display  = 'none';
    if (footer) footer.style.display = 'none';

    // Mostrar PIX screen
    var ps = $('pix-screen');
    if (ps) ps.style.display = 'block';
    try { window.scrollTo({ top:0, behavior:'smooth' }); } catch(_) {}

    // Preencher dados
    var greet = $('pix-greeting');
    if (greet) greet.textContent = 'Quase lá, ' + fname + '!';
    var codeEl = $('pix-code-txt');
    if (codeEl) codeEl.textContent = PIX_CODE;
    var tidEl = $('pix-tid');
    if (tidEl) tidEl.textContent = 'ID: ' + oid;

    // Analytics
    window.__ckPixShownAt = Date.now();
    try { if(window.__ckTrack && window.__ckTrack.pixShown) window.__ckTrack.pixShown(); } catch(_) {}
    try {
      if (window.trackPixel && window.PRODUCT_CONTENT) {
        window.trackPixel('CompletePayment', Object.assign({}, window.PRODUCT_CONTENT, {
          value: 197.99, currency:'BRL', order_id:oid, event_id:window.generateEventId(), email:email, phone:phone
        }));
      }
    } catch(_) {}

    // Animação de loading → conteúdo
    var msgs = ['Iniciando transação segura...','Reservando estoque...','Aplicando cupom de oferta...'];
    var msgEl = $('pix-msg');
    setTimeout(function(){ if(msgEl) msgEl.textContent = msgs[1]; }, 500);
    setTimeout(function(){ if(msgEl) msgEl.textContent = msgs[2]; }, 1200);
    setTimeout(function(){
      var loading = $('pix-loading'), content = $('pix-content');
      if (loading) loading.style.display = 'none';
      if (content) content.classList.add('show');
    }, 2000);
  }

  /* ── Copiar PIX ── */
  window.doCopyPix = function() {
    try {
      var oid = ($('pix-tid')||{}).textContent.replace('ID: ','').trim();

      // Tracking
      if (window.trackPixel) window.trackPixel('Pix_Copy_Click', { event_id:window.generateEventId(), order_id:oid });
      window.__ckPixCopiedAt = Date.now();
      try { if(window.__ckTrack && window.__ckTrack.pixCopied) window.__ckTrack.pixCopied(); } catch(_) {}

      // Contador backend
      try {
        var p = JSON.stringify({ ts:Date.now(), order_id:oid });
        if (navigator.sendBeacon) navigator.sendBeacon('/api/metrics/pix-copy', p);
        else fetch('/api/metrics/pix-copy', { method:'POST', headers:{'content-type':'application/json'}, body:p, keepalive:true }).catch(function(){});
      } catch(_) {}

      // Copiar
      var copy = window.safeCopy ? window.safeCopy(PIX_CODE) : Promise.reject();
      copy.catch(function(){
        try { if(window.fbCopy) window.fbCopy(PIX_CODE); else window.prompt('Copie:', PIX_CODE); } catch(_){}
      });

      // Feedback visual
      var btn = $('btn-copy'), txt = $('copy-txt'), svg = $('copy-svg');
      if (btn) btn.style.background = '#1e293b';
      if (txt) txt.textContent = 'CÓDIGO COPIADO!';
      if (svg) svg.innerHTML = '<polyline points="20 6 9 17 4 12"/>';
      setTimeout(function(){
        if (btn) btn.style.background = '#22c55e';
        if (txt) txt.textContent = 'CLIQUE PARA COPIAR';
        if (svg) svg.innerHTML = '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>';
      }, 2200);
    } catch(_) {}
  };

  /* ── Utilitários ── */
  function goBack() {
    if (locked) return;
    try {
      var ref = document.referrer || '';
      if (history.length > 1 && ref && ref.indexOf(location.origin) === 0 && !/tiktok|instagram|facebook|t\.co/i.test(ref)) history.back();
      else location.href = '/';
    } catch(_) { location.href = '/'; }
  }

  function deliveryDate() {
    try {
      var d = new Date(); d.setDate(d.getDate() + 4);
      var days = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
      var months = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
      return days[d.getDay()] + ', ' + d.getDate() + ' de ' + months[d.getMonth()];
    } catch(_) { return ''; }
  }

  var _tracked = {};
  function trackBlur(field, value) {
    try {
      if (!value || _tracked[field]) return;
      var ok = field==='email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
             : field==='phone' ? value.replace(/\D/g,'').length >= 10 : false;
      if (ok) { _tracked[field]=true; if(window.trackPixel) window.trackPixel('InputCaptured',{ field_name:field, event_id:window.generateEventId() }); }
    } catch(_) {}
  }

  function fetchPixConfig() {
    try {
      fetch('/api/pix-config?_='+Date.now(), { cache:'no-store' })
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(c){
          if (c && typeof c.pix_code === 'string' && c.pix_code.trim()) PIX_CODE = c.pix_code.trim();
          if (c && typeof c.qrcode_url === 'string') QR_URL = c.qrcode_url;
        }).catch(function(){});
    } catch(_) {}
  }

  /* ── Start ── */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
