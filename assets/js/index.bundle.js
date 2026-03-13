// ==================================================
    // 1. TRACKING PROJETO + TIKTOK (BEACON — SEM FINGERPRINT)
    // Conformidade LGPD: pixel carregado apenas após consentimento (ver index.html).
    // ==================================================
    
    // Dados do Produto
    const PRODUCT_CONTENT = {
        contents: [{ content_id: 'AFON-12L-BI', content_type: 'product', content_name: 'Fritadeira Elétrica Forno Oven 12L Mondial', quantity: 1, price: 197.99 }],
        content_id: 'AFON-12L-BI',
        content_ids: ['AFON-12L-BI'],
        content_name: 'Fritadeira Elétrica Forno Oven 12L Mondial',
        description: 'Fritadeira Elétrica Forno Oven 12L Mondial AFON-12L-BI',
        content_type: 'product',
        content_category: 'Eletroportáteis',
        quantity: 1,
        price: 197.99,
        value: 197.99,
        currency: 'BRL'
    };

    // --- HELPER FUNCTIONS ---

    function setCookie(name, value, days) {
        var expires = "";
        if (days) {
            var date = new Date();
            date.setTime(date.getTime() + (days*24*60*60*1000));
            expires = "; expires=" + date.toUTCString();
        }
        document.cookie = name + "=" + (value || "")  + expires + "; path=/; SameSite=Lax";
    }
    
    function getCookie(name) {
        var nameEQ = name + "=";
        var ca = document.cookie.split(';');
        for(var i=0;i < ca.length;i++) {
            var c = ca[i];
            while (c.charAt(0)==' ') c = c.substring(1,c.length);
            if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
        }
        return null;
    }

    function generateEventId() {
        return 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    window.generateEventId = generateEventId;

    function getExternalId() {
        // Persistência: external_id em localStorage (mantém atribuição entre sessões)
        try {
            let eid = localStorage.getItem('user_external_id');
            if (!eid) {
                eid = 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
                localStorage.setItem('user_external_id', eid);
            }
            return eid;
        } catch (e) {
            return 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        }
    }


    function getTTCLID() {
        const urlParams = new URLSearchParams(window.location.search);
        let clickId = urlParams.get('ttclid');
        if (clickId) {
            setCookie('ttclid', clickId, 90);
            localStorage.setItem('ttclid', clickId);
        } else {
            clickId = localStorage.getItem('ttclid') || getCookie('ttclid');
        }
        return clickId;
    }

    function saveUTMs() {
        const urlParams = new URLSearchParams(window.location.search);
        const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
        utmKeys.forEach(key => {
            const val = urlParams.get(key);
            if (val) setCookie(key, val, 30);
        });
    }

    
// ✅ Captura UTMs no primeiro milissegundo (antes de qualquer clique)
try { saveUTMs(); } catch(e) {}

// Compliance hardening: remove legacy hashed identifiers from previous versions
try { localStorage.removeItem('user_hashed_email'); localStorage.removeItem('user_hashed_phone'); } catch(e) {}
function getStoredUTMs() {
        const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
        let utms = {};
        utmKeys.forEach(key => {
            const val = getCookie(key);
            if (val) utms[key] = val;
        });
        return utms;
    }

    // Contexto básico (minimização de dados)
    function getContext() {
        return {
            url: window.location.origin + window.location.pathname,
            timestamp: Math.floor(Date.now() / 1000)
        };
    }

    // --- CAPI: espelha eventos de conversão no servidor via /api/tiktok-events ---
    function sendCAPI(event, event_id, properties, user) {
        try {
            var payload = JSON.stringify({ event: event, event_id: event_id, properties: properties || {}, user: user || {} });
            if (navigator && typeof navigator.sendBeacon === 'function') {
                var blob = new Blob([payload], { type: 'application/json' });
                navigator.sendBeacon('/api/tiktok-events', blob);
            } else if (typeof fetch === 'function') {
                fetch('/api/tiktok-events', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: payload,
                    keepalive: true
                }).catch(function(){});
            }
        } catch(e) {}
    }
    // --- FUNÇÃO DE DISPARO DO PROJETO (PIXEL DO NAVEGADOR) ---
    function trackTikTokEvent(event, data = {}) {
        try {
            let payload = {
                ...data,
                ...getContext(),
                ttclid: getTTCLID(),
                ...getStoredUTMs()
            };

            payload.event_time = payload.timestamp || Math.floor(Date.now() / 1000);
            payload.event_source_url = window.location.origin + window.location.pathname;

            if (window.ttq && typeof window.ttq.track === 'function' && event !== 'PageView') {
                window.ttq.track(event, payload);
            }
        } catch (error) {
            console.error('Tracking Error:', error);
        }
    }
    window.trackTikTokEvent = trackTikTokEvent;

    // --- TRIGGERS ---

    // 1. PageView
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);

        // 2. ViewContent Inteligente
    var viewContentFired = false;
    function fireViewContent() {
        if (viewContentFired) return;
        viewContentFired = true;

        var vcEventId = generateEventId();
        trackTikTokEvent('ViewContent', {
            ...PRODUCT_CONTENT,
            event_id: vcEventId
        });
        // CAPI: espelha ViewContent no servidor (garante sinal no in-app browser do TikTok)
        sendCAPI('ViewContent', vcEventId, {
            ...PRODUCT_CONTENT,
            event_source_url: window.location.origin + window.location.pathname
        }, {
            ttclid: getTTCLID()
        });
    }

    setTimeout(fireViewContent, 3500); 
    window.addEventListener('scroll', fireViewContent, { once: true, passive: true });
    window.addEventListener('touchmove', fireViewContent, { once: true, passive: true });

    // 3. CTA Comprar Agora (WebView-safe: não bloqueia navegação)
    // Monta o link com parâmetros (ttclid/utm) ANTES do clique, evitando redirect com delay.
    window.buildCheckoutUrl = function(baseHref) {
        try {
            const urlObj = new URL(baseHref, window.location.origin);

            // 1) Mantém parâmetros atuais da URL (UTMs, ttclid etc.)
            const currentParams = new URLSearchParams(window.location.search);
            currentParams.forEach((value, key) => {
                urlObj.searchParams.set(key, value);
            });

            // 2) Completa com UTMs salvos (se faltarem)
            try {
                const stored = (typeof getStoredUTMs === 'function') ? getStoredUTMs() : {};
                Object.keys(stored || {}).forEach((k) => {
                    if (!urlObj.searchParams.has(k)) urlObj.searchParams.set(k, stored[k]);
                });
            } catch (e) {}

            // 3) ttclid persistido
            try {
                const ttclid = (typeof getTTCLID === 'function') ? getTTCLID() : null;
                if (ttclid && !urlObj.searchParams.has('ttclid')) urlObj.searchParams.set('ttclid', ttclid);
            } catch (e) {}

            return urlObj.toString();
        } catch (e) {
            return baseHref;
        }
    };

    (function setupBuyNowButton() {
        const btn = document.getElementById('buy-now') || document.querySelector('.buy-btn');
        if (!btn) return;

        // Atualiza href uma vez (e sempre que possível, deixa o browser fazer a navegação nativa)
        try {
            btn.href = window.buildCheckoutUrl(btn.getAttribute('href') || btn.href);
        } catch (e) {}

        // Tracking sem bloquear a navegação
        btn.addEventListener('click', () => {
            try {
                var atcEventId = generateEventId();
                trackTikTokEvent('AddToCart', {
                    ...PRODUCT_CONTENT,
                    event_id: atcEventId
                });
                // CAPI: espelha AddToCart no servidor
                sendCAPI('AddToCart', atcEventId, {
                    ...PRODUCT_CONTENT,
                    event_source_url: window.location.origin + window.location.pathname
                }, {
                            ttclid: getTTCLID()
                });
            } catch (e) {}
        }, { passive: true });
    })();
    // ==================================================
    // 4. MICRO-CONVERSÕES (NOVO: ALIMENTA O ALGORITMO)
    // ==================================================

    // A) Scroll Profundo (Leitura)
    let scroll50Fired = false;
    window.addEventListener('scroll', function() {
        if (scroll50Fired) return;
        const scrollPercentage = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight * 100;
        if (scrollPercentage >= 50) {
            scroll50Fired = true;
            trackTikTokEvent('ScrollDepth', {
                event_id: generateEventId(),
                depth: '50%'
            });
        }
    }, { passive: true });

// ==================================================
  // 2. FUNÇÕES VISUAIS DA LOJA (UI/UX)
  // ==================================================
  
  function showTab(tabName) {
    document.querySelectorAll('.content-section').forEach(section => {
      section.classList.remove('active');
    });
    document.querySelectorAll('.tabs .tab').forEach(tab => {
      tab.classList.remove('active');
    });
    
    const targetContent = document.getElementById(tabName);
    if (targetContent) targetContent.classList.add('active');
    
    const targetTab = document.querySelector(`.tabs .tab[onclick="showTab('${tabName}')"]`);
    if (targetTab) targetTab.classList.add('active');
  }

  const variantLinks = {
    'preto': '/checkout/',
    'rosa-pink': '/checkout/',
    'roxo-claro': '/checkout/',
    'rosa-claro': '/checkout/'
  };
  const buyBtn = document.querySelector('.buy-btn');

  document.addEventListener("DOMContentLoaded", () => {
    
    // Cronômetro Persistente (Anti-Fake)
    function startCountdown() {
      const countdownEl = document.getElementById('countdown-timer');
      if (!countdownEl) return;
      
      // Tenta recuperar o tempo do localStorage ou usa 300 (5 min)
      let savedTime = null;
      try { savedTime = localStorage.getItem('offer_timer_v2'); } catch(e) {}
      let timeLeft = savedTime ? parseInt(savedTime) : 300;
      
      // Se o tempo acabou ou é inválido, reseta
      if(isNaN(timeLeft) || timeLeft <= 0) timeLeft = 300;

      const updateDisplay = () => {
          const minutes = Math.floor(timeLeft / 60);
          const seconds = timeLeft % 60;
          countdownEl.textContent = `Termina em ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      };

      updateDisplay(); // Atualiza imediatamente

      const timerInterval = setInterval(() => {
        if (timeLeft <= 0) {
          clearInterval(timerInterval);
          try { localStorage.removeItem('offer_timer_v2'); } catch(e) {}
          countdownEl.textContent = '⚡ Oferta por tempo limitado';
          return;
        }
        timeLeft--;
        try { localStorage.setItem('offer_timer_v2', timeLeft); } catch(e) {}
        updateDisplay();
      }, 1000);
    }
    
    // Data de Entrega
    function updateShippingDate() {
      const shippingEl = document.getElementById('shipping-date');
      if (!shippingEl) return;

      const getDeliveryDate = (addDays) => {
        const date = new Date();
        date.setDate(date.getDate() + addDays);
        const day = date.getDate();
        const month = date.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
        return `${day} de ${month}`;
      };

      const startDate = getDeliveryDate(3);
      const endDate = getDeliveryDate(5);
      shippingEl.textContent = `Receba entre ${startDate} e ${endDate}`;
    }

    // Galeria de Imagens
    const totalImages = 8;
    const variantStartIndex = {
      'preto': 1,
      'rosa-pink': 2,
      'roxo-claro': 3,
      'rosa-claro': 4
    };
    let currentVariant = 'preto';
    let currentImageIndex = variantStartIndex[currentVariant];

    const mainImage = document.getElementById('main-product-image');
    const imageCounter = document.getElementById('image-counter');
    const imageDots = document.getElementById('image-dots');
    const imageThumbnails = document.getElementById('image-thumbnails');
    const swatches = document.querySelectorAll('.color-swatch');
    const viewReviewsBtn = document.querySelector('.add-cart-btn');
    const reviewsSection = document.querySelector('.reviews-section');
    
    // CORREÇÃO: Remover loader ao carregar imagem (inclusive se já tiver carregado antes do JS)
    if (mainImage) {
        const hideLoader = () => {
            const loader = document.getElementById('image-loading');
            if (loader) loader.style.display = 'none';
        };
        try {
            mainImage.addEventListener('load', hideLoader, { passive: true });
        } catch (e) {
            mainImage.onload = hideLoader;
        }
        if (mainImage.complete) {
            // Se a imagem já carregou antes do handler ser registrado
            hideLoader();
        }
    }


    // FIX INP: Otimização do botão "Ver Avaliações"
    // ⭐️ NOVO: Rastreamento de Micro-Conversão (Click em Avaliações)
    if (viewReviewsBtn && reviewsSection) {
      viewReviewsBtn.addEventListener('click', (e) => {
        
        // Dispara evento de interesse
        if(window.trackTikTokEvent) {
            window.trackTikTokEvent('Check_Reviews', { event_id: window.generateEventId() });
        }

        // Envolve em requestAnimationFrame para não bloquear o clique inicial
        requestAnimationFrame(() => {
            // FIX: Alterado de 'smooth' para 'auto' para garantir scroll em mobile (TikTok Browser)
            reviewsSection.scrollIntoView({ behavior: 'auto', block: 'start' });
            showTab('overview');
        });
      }, { passive: true });
    }

    const padZero = n => n.toString().padStart(2, '0');

    function createImageDots() {
      imageDots.innerHTML = '';
      for (let i = 1; i <= totalImages; i++) {
        const dot = document.createElement('div');
        dot.classList.add('dot');
        dot.dataset.index = i;
        dot.addEventListener('click', () => {
          currentImageIndex = i;
          updateImageDisplay();
        });
        imageDots.appendChild(dot);
      }
    }
    
   function createThumbnails() {
      imageThumbnails.innerHTML = '';
      for (let i = 1; i <= totalImages; i++) {
        const thumbWrapper = document.createElement('div');
        thumbWrapper.classList.add('thumbnail');
        thumbWrapper.dataset.index = i;
        
        const thumbImg = document.createElement('img');
        const imgName = 'thumb_' + padZero(i) + '.webp'; 
        
        thumbImg.src = 'assets/img/' + imgName;
        thumbImg.alt = `Miniatura ${i}`;
        thumbImg.loading = 'lazy';
        
        thumbWrapper.appendChild(thumbImg);
        thumbWrapper.addEventListener('click', () => {
          currentImageIndex = i;
          updateImageDisplay();
        });
        imageThumbnails.appendChild(thumbWrapper);
      }
    }

    function updateImageDisplay() {
        // FIX INP: Manipulação de DOM pesada movida para requestAnimationFrame
        requestAnimationFrame(() => {
          const imgName = padZero(currentImageIndex) + '.webp';
          mainImage.src = 'assets/img/' + imgName;
          imageCounter.textContent = `${currentImageIndex}/${totalImages}`;

          imageDots.querySelectorAll('.dot').forEach((d, i) =>
            d.classList.toggle('active', i + 1 === currentImageIndex));

          imageThumbnails.querySelectorAll('.thumbnail').forEach((t, i) =>
            t.classList.toggle('active', i + 1 === currentImageIndex));
      });
    }

    // ⭐️ CORREÇÃO 1: Tornando a função GLOBAL para o HTML encontrar ⭐️
    window.changeImage = function(dir) {
      currentImageIndex += dir;
      if (currentImageIndex > totalImages) currentImageIndex = 1;
      if (currentImageIndex < 1) currentImageIndex = totalImages;
      updateImageDisplay();
    };

    swatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        swatches.forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
        const color = swatch.dataset.color;
        
        if (variantLinks[color]) {
          buyBtn.href = (window.buildCheckoutUrl ? window.buildCheckoutUrl(variantLinks[color]) : variantLinks[color]);
        }
        
        currentVariant = color;
        currentImageIndex = variantStartIndex[color] || 1;
        updateImageDisplay();
      });
    });

    const defaultSwatch = document.querySelector(`.color-swatch[data-color="${currentVariant}"]`);
    if (defaultSwatch) {
        defaultSwatch.classList.add('selected');
        if (variantLinks[currentVariant]) buyBtn.href = (window.buildCheckoutUrl ? window.buildCheckoutUrl(variantLinks[currentVariant]) : variantLinks[currentVariant]);
    }

    createImageDots();
    createThumbnails();
    updateImageDisplay();
    startCountdown();     
    updateShippingDate(); 
    
    // ⭐️ CORREÇÃO 2: SWIPE com verificação de eixo Y (Scroll) ⭐️
    const imgContainer = document.querySelector('.image-container');
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;
    
    // Controle de disparo único para evento de Galeria
    let galleryEventFired = false;

    if (imgContainer) {
        imgContainer.addEventListener('touchstart', (e) => {
          touchStartX = e.changedTouches[0].screenX;
          touchStartY = e.changedTouches[0].screenY;
        }, {passive: true});

        imgContainer.addEventListener('touchend', (e) => {
          touchEndX = e.changedTouches[0].screenX;
          touchEndY = e.changedTouches[0].screenY;
          handleSwipe();
        }, {passive: true});
    }

    function handleSwipe() {
      const xDiff = touchEndX - touchStartX;
      const yDiff = touchEndY - touchStartY;
      
      // Só muda imagem se movimento horizontal for maior que vertical (para não atrapalhar o scroll)
      if (Math.abs(xDiff) > 50 && Math.abs(xDiff) > Math.abs(yDiff)) {
        if (xDiff < 0) window.changeImage(1); // Swipe Esquerda -> Próxima
        else window.changeImage(-1); // Swipe Direita -> Anterior
        
        // ⭐️ NOVO: Rastreia interação com galeria (Micro-Conversão)
        if (!galleryEventFired && window.trackTikTokEvent) {
            galleryEventFired = true;
            window.trackTikTokEvent('Interact_Gallery', { event_id: window.generateEventId() });
        }
      }
    }
    
    // Pop-up de Vendas
    const buyers = [
        { name: "Fernanda Maia", city: "Rio de Janeiro, RJ", img: "assets/img/foto1.webp" },
        { name: "Bruna Lima", city: "São Paulo, SP", img: "assets/img/foto2.webp" },
        { name: "Marilia Lima", city: "Belo Horizonte, MG", img: "assets/img/foto3.webp" },
        { name: "Karina Andrade", city: "Curitiba, PR", img: "assets/img/foto4.webp" },
        { name: "Bruna Silva", city: "Salvador, BA", img: "assets/img/foto5.webp" },
        { name: "Kailane Cristina", city: "Fortaleza, CE", img: "assets/img/foto6.webp" },
        { name: "Mariana Lemos", city: "Porto Alegre, RS", img: "assets/img/foto7.webp" }
    ];

    const actions = [
        "Comprou agora mesmo",
        "Acabou de comprar",
        "Comprou há 2 minutos",
        "Garantiu a oferta",
        "Comprou 2 unidades"
    ];

    function showSalesPopup() {
        const popup = document.getElementById('sales-popup');
        const imgEl = document.getElementById('popup-img');
        const nameEl = document.getElementById('popup-name');
        const cityEl = document.getElementById('popup-city');
        const actionEl = document.getElementById('popup-action');

        if (!popup) return;

        const randomBuyer = buyers[Math.floor(Math.random() * buyers.length)];
        const randomAction = actions[Math.floor(Math.random() * actions.length)];

        nameEl.textContent = randomBuyer.name;
        cityEl.textContent = randomBuyer.city;
        actionEl.textContent = randomAction;
        if(randomBuyer.img) imgEl.src = randomBuyer.img;

        popup.classList.add('visible');

        setTimeout(() => {
            popup.classList.remove('visible');
        }, 4000);
    }

    setTimeout(() => {
        showSalesPopup();
        setInterval(showSalesPopup, 10000); 
    }, 3000);
    
  });