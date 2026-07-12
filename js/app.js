/* Izzat Store — product page */
(function () {
  "use strict";

  const IMAGES = [
    "https://cdn.vnda.com.br/cleastore/2025/09/24/18_10_24_419_e38a80566bd624953c656fc7508de4b8.jpg?v=1769531206",
    "https://cdn.vnda.com.br/cleastore/2026/01/16/10_20_55_416_60-10010780.png?v=1769531206",
    "https://cdn.vnda.com.br/cleastore/2026/01/27/17_19_49_724_design-20sem-20nome-17015360.jpg?v=1769545207",
    "https://cdn.vnda.com.br/cleastore/2026/01/27/16_56_37_400_6-16014460.jpg?v=1769543813",
    "https://cdn.vnda.com.br/cleastore/2026/01/27/16_56_39_36_7-16014850.jpg?v=1769543812",
    "https://cdn.vnda.com.br/cleastore/2026/01/27/16_56_37_111_8-16014640.jpg?v=1769543816",
    "https://cdn.vnda.com.br/cleastore/2026/01/27/16_56_20_711_1-16013550.jpg?v=1769543820",
    "https://cdn.vnda.com.br/cleastore/2026/01/27/16_56_20_875_2-16013670.jpg?v=1769543822",
    "https://cdn.vnda.com.br/cleastore/2026/01/27/16_56_34_646_3-16014460.jpg?v=1769543825",
    "https://cdn.vnda.com.br/cleastore/2026/01/27/16_56_21_232_4-16013460.jpg?v=1769543828",
    "https://cdn.vnda.com.br/cleastore/2026/01/27/16_56_40_963_9-16015390.jpg?v=1769543831",
    "https://cdn.vnda.com.br/cleastore/2026/01/27/16_56_39_596_10-16014770.jpg?v=1769543835",
    "https://cdn.vnda.com.br/cleastore/2026/01/27/16_56_22_992_11-16014380.jpg?v=1769543839",
    "https://cdn.vnda.com.br/cleastore/2026/01/27/16_56_20_317_12-16013550.jpg?v=1769543839",
  ];

  const PRODUCT = {
    name: "Kit 3 T-Shirts Oversized Classic Algodão",
    image: IMAGES[0],
  };

  let currentImg = 0;
  let selectedSize = null;
  const KIT_TOTAL = 97.98;
  const UNIT_PRICE = 32.66;
  let cart = [];

  // Elements
  const galleryTrack = document.getElementById("galleryTrack");
  const galleryViewport = document.getElementById("galleryViewport");
  const galleryDots = document.getElementById("galleryDots");
  const galleryCounter = document.getElementById("galleryCounter");
  const thumbs = document.getElementById("thumbs");
  const cartCount = document.getElementById("cartCount");
  const cartDrawer = document.getElementById("cartDrawer");
  const cartBody = document.getElementById("cartBody");
  const cartFoot = document.getElementById("cartFoot");
  const cartTotal = document.getElementById("cartTotal");
  const overlay = document.getElementById("overlay");
  const toast = document.getElementById("toast");

  /* Gallery — swipeable carousel (pixel-based, mobile-safe) */
  function getSlideWidth() {
    return Math.round(galleryViewport.getBoundingClientRect().width) || galleryViewport.clientWidth || window.innerWidth;
  }

  function sizeSlides() {
    const w = getSlideWidth();
    galleryTrack.querySelectorAll(".gallery__slide").forEach((slide) => {
      slide.style.flex = "0 0 " + w + "px";
      slide.style.width = w + "px";
      slide.style.minWidth = w + "px";
      slide.style.maxWidth = w + "px";
    });
    return w;
  }

  function renderGallery() {
    galleryTrack.innerHTML = IMAGES.map(
      (src, i) =>
        `<div class="gallery__slide" data-i="${i}" role="group" aria-label="Foto ${i + 1} de ${IMAGES.length}">
          <img src="${src}" alt="Kit 3 T-Shirts — foto ${i + 1}" ${i === 0 ? 'loading="eager"' : 'loading="lazy"'} draggable="false" />
        </div>`
    ).join("");

    galleryDots.innerHTML = IMAGES.map(
      (_, i) =>
        `<button type="button" class="gallery__dot${i === currentImg ? " active" : ""}" data-i="${i}" aria-label="Ir para foto ${i + 1}"></button>`
    ).join("");

    thumbs.innerHTML = IMAGES.map(
      (src, i) =>
        `<button type="button" class="${i === currentImg ? "active" : ""}" data-i="${i}" aria-label="Imagem ${i + 1}">
          <img src="${src}" alt="" loading="lazy" draggable="false" />
        </button>`
    ).join("");

    sizeSlides();
    updateGalleryUI(false);
  }

  function updateGalleryUI(animate) {
    const w = sizeSlides();
    if (!animate) galleryTrack.classList.add("is-dragging");
    galleryTrack.style.transform = "translate3d(" + -(currentImg * w) + "px, 0, 0)";
    if (!animate) {
      void galleryTrack.offsetWidth;
      galleryTrack.classList.remove("is-dragging");
    }

    galleryDots.querySelectorAll(".gallery__dot").forEach((dot, i) => {
      dot.classList.toggle("active", i === currentImg);
    });

    thumbs.querySelectorAll("button").forEach((btn, i) => {
      btn.classList.toggle("active", i === currentImg);
    });

    galleryCounter.textContent = currentImg + 1 + " / " + IMAGES.length;

    const prevBtn = document.getElementById("prevImg");
    const nextBtn = document.getElementById("nextImg");
    if (prevBtn) prevBtn.classList.toggle("is-disabled", currentImg === 0);
    if (nextBtn) nextBtn.classList.toggle("is-disabled", currentImg === IMAGES.length - 1);

    const activeThumb = thumbs.querySelector('button[data-i="' + currentImg + '"]');
    if (
      activeThumb &&
      thumbs.scrollWidth > thumbs.clientWidth + 4 &&
      typeof activeThumb.scrollIntoView === "function"
    ) {
      activeThumb.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }

  function showImage(i, animate) {
    currentImg = (i + IMAGES.length) % IMAGES.length;
    updateGalleryUI(animate !== false);
  }

  renderGallery();

  window.addEventListener(
    "resize",
    (function () {
      let t;
      return function () {
        clearTimeout(t);
        t = setTimeout(function () {
          updateGalleryUI(false);
        }, 80);
      };
    })()
  );

  thumbs.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-i]");
    if (!btn) return;
    showImage(Number(btn.dataset.i));
  });

  galleryDots.addEventListener("click", (e) => {
    const btn = e.target.closest(".gallery__dot[data-i]");
    if (!btn) return;
    showImage(Number(btn.dataset.i));
  });

  document.getElementById("prevImg").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentImg > 0) showImage(currentImg - 1);
  });
  document.getElementById("nextImg").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentImg < IMAGES.length - 1) showImage(currentImg + 1);
  });

  // Touch / mouse swipe (pixel-based)
  (function setupSwipe() {
    let startX = 0;
    let startY = 0;
    let deltaX = 0;
    let dragging = false;
    let locked = null;
    let startOffset = 0;

    function onStart(x, y) {
      startX = x;
      startY = y;
      deltaX = 0;
      dragging = true;
      locked = null;
      startOffset = -currentImg * getSlideWidth();
      galleryTrack.classList.add("is-dragging");
    }

    function onMove(x, y, e) {
      if (!dragging) return;
      const dx = x - startX;
      const dy = y - startY;
      if (!locked) {
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
          locked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        } else {
          return;
        }
      }
      if (locked === "y") return;
      if (e && e.cancelable) e.preventDefault();
      deltaX = dx;
      let resistance = 1;
      if ((currentImg === 0 && deltaX > 0) || (currentImg === IMAGES.length - 1 && deltaX < 0)) {
        resistance = 0.35;
      }
      galleryTrack.style.transform =
        "translate3d(" + (startOffset + deltaX * resistance) + "px, 0, 0)";
    }

    function onEnd() {
      if (!dragging) return;
      dragging = false;
      galleryTrack.classList.remove("is-dragging");
      const width = getSlideWidth() || 1;
      const threshold = Math.min(70, width * 0.16);
      if (locked === "x" && Math.abs(deltaX) > threshold) {
        showImage(deltaX < 0 ? currentImg + 1 : currentImg - 1);
      } else {
        updateGalleryUI(true);
      }
      deltaX = 0;
      locked = null;
    }

    galleryViewport.addEventListener(
      "touchstart",
      (e) => {
        if (!e.touches[0]) return;
        onStart(e.touches[0].clientX, e.touches[0].clientY);
      },
      { passive: true }
    );
    galleryViewport.addEventListener(
      "touchmove",
      (e) => {
        if (!e.touches[0]) return;
        onMove(e.touches[0].clientX, e.touches[0].clientY, e);
      },
      { passive: false }
    );
    galleryViewport.addEventListener("touchend", onEnd, { passive: true });
    galleryViewport.addEventListener("touchcancel", onEnd, { passive: true });

    galleryViewport.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      onStart(e.clientX, e.clientY);
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      onMove(e.clientX, e.clientY, e);
    });
    window.addEventListener("mouseup", onEnd);
  })();

  /* Size */
  document.getElementById("sizeList").addEventListener("click", (e) => {
    const btn = e.target.closest(".size-btn");
    if (!btn) return;
    document.querySelectorAll(".size-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedSize = btn.dataset.size;
    document.getElementById("selectedSize").textContent = selectedSize;
  });

  /* Cart helpers */
  function formatBRL(n) {
    return n.toFixed(2).replace(".", ",");
  }

  function getLineTotal() {
    return KIT_TOTAL;
  }

  function getQtyLabel() {
    return "Kit 3";
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function openCart() {
    cartDrawer.classList.add("open");
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeCart() {
    cartDrawer.classList.remove("open");
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  }

  function renderCart() {
    cartCount.textContent = cart.reduce((s, i) => s + i.qty, 0);

    if (!cart.length) {
      cartBody.innerHTML = '<p class="cart-empty">Sua sacola está vazia</p>';
      cartFoot.hidden = true;
      return;
    }

    cartBody.innerHTML = cart
      .map(
        (item, idx) => `
      <div class="cart-item">
        <img src="${item.image}" alt="" />
        <div>
          <p class="cart-item__name">${item.name}</p>
          <p class="cart-item__meta">${item.variant} · ${item.size} · ${item.qtyLabel}</p>
          <p class="cart-item__price">R$ ${formatBRL(item.total)}</p>
        </div>
        <button class="cart-item__remove" data-remove="${idx}">Remover</button>
      </div>`
      )
      .join("");

    const total = cart.reduce((s, i) => s + i.total, 0);
    cartTotal.textContent = `R$ ${formatBRL(total)}`;
    cartFoot.hidden = false;
  }

  function addToCart() {
    if (!selectedSize) {
      showToast("Selecione um tamanho");
      return false;
    }

    cart.push({
      name: PRODUCT.name,
      image: PRODUCT.image,
      size: selectedSize,
      variant: "Marrom / Preto / Off-White",
      qty: 1,
      qtyLabel: getQtyLabel(),
      total: getLineTotal(),
    });

    renderCart();
    showToast("Produto adicionado à sacola");
    return true;
  }

  function goToCheckout() {
    if (!selectedSize) {
      showToast("Selecione um tamanho");
      return;
    }
    try {
      sessionStorage.setItem(
        "izzat_checkout",
        JSON.stringify({
          size: selectedSize,
          product: PRODUCT.name,
          price: KIT_TOTAL,
          unit: UNIT_PRICE,
          variant: "Marrom / Preto / Off-White",
        })
      );
    } catch (e) {}

    // SPA checkout (mesmo fluxo do projeto Izzat Completa)
    if (typeof window.spaOpenCheckout === "function") {
      window.spaOpenCheckout("c/");
      return;
    }

    // Fallback: página dedicada
    window.location.href = "c/index.html?size=" + encodeURIComponent(selectedSize);
  }

  document.getElementById("buyNow").addEventListener("click", goToCheckout);

  document.getElementById("cartBtn").addEventListener("click", openCart);
  document.getElementById("closeCart").addEventListener("click", closeCart);
  document.getElementById("continueShopping").addEventListener("click", closeCart);
  overlay.addEventListener("click", () => {
    closeCart();
    closeSizeModal();
  });

  cartBody.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    cart.splice(Number(btn.dataset.remove), 1);
    renderCart();
  });

  document.getElementById("checkoutBtn").addEventListener("click", () => {
    closeCart();
    goToCheckout();
  });

  /* Size guide */
  const sizeModal = document.getElementById("sizeModal");

  function closeSizeModal() {
    sizeModal.classList.remove("open");
  }

  document.getElementById("sizeGuideBtn").addEventListener("click", () => {
    sizeModal.classList.add("open");
  });
  document.getElementById("closeSizeModal").addEventListener("click", closeSizeModal);

  /* Tabs */
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("tab--active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("tab-panel--active"));
      tab.classList.add("tab--active");
      document.getElementById("panel-" + tab.dataset.tab).classList.add("tab-panel--active");
    });
  });

  /* CEP / frete */
  const cepInput = document.getElementById("cepInput");
  cepInput.addEventListener("input", (e) => {
    let v = e.target.value.replace(/\D/g, "").slice(0, 8);
    if (v.length > 5) v = v.slice(0, 5) + "-" + v.slice(5);
    e.target.value = v;
  });

  document.getElementById("calcFrete").addEventListener("click", () => {
    const cep = cepInput.value.replace(/\D/g, "");
    const result = document.getElementById("shippingResult");
    if (cep.length !== 8) {
      result.textContent = "Informe um CEP válido com 8 dígitos.";
      result.classList.remove("ok");
      return;
    }
    result.textContent = "PAC: Grátis (5–8 dias úteis) · SEDEX: Grátis (2–4 dias úteis)";
    result.classList.add("ok");
  });

  /* Newsletter */
  document.getElementById("newsletterForm").addEventListener("submit", (e) => {
    e.preventDefault();
    document.getElementById("newsletterMsg").textContent = "Obrigado! Cadastro realizado com sucesso.";
    e.target.reset();
  });

  /* Mobile menu */
  document.getElementById("menuToggle").addEventListener("click", () => {
    document.getElementById("mobileNav").classList.toggle("open");
  });

  document.querySelectorAll(".mobile-nav a").forEach((a) => {
    a.addEventListener("click", () => document.getElementById("mobileNav").classList.remove("open"));
  });

  /* Cookies */
  const cookieBar = document.getElementById("cookieBar");
  if (!localStorage.getItem("izzat_cookies")) {
    setTimeout(() => cookieBar.classList.add("show"), 800);
  }
  document.getElementById("acceptCookies").addEventListener("click", () => {
    localStorage.setItem("izzat_cookies", "1");
    cookieBar.classList.remove("show");
  });

  /* Keyboard gallery */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeCart();
      closeSizeModal();
    }
    if (e.key === "ArrowLeft") showImage(currentImg - 1);
    if (e.key === "ArrowRight") showImage(currentImg + 1);
  });
})();
