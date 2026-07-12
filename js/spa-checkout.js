/* SPA Checkout — same pattern as Izzat Completa (overlay, no full page reload) */
(function () {
  "use strict";

  window.__ASSET_BASE = "assets/";
  window.__checkoutEntrySource = "lp";

  window.PRODUCT_CONTENT = window.PRODUCT_CONTENT || {
    content_type: "product",
    contents: [
      {
        content_id: "KIT-3-TSHIRT-OVERSIZED",
        id: "KIT-3-TSHIRT-OVERSIZED",
        quantity: 1,
        price: 97.98,
        item_price: 97.98,
      },
    ],
    content_id: "KIT-3-TSHIRT-OVERSIZED",
    content_name: "Kit 3 T-Shirts Oversized Classic Algodão",
    content_ids: ["KIT-3-TSHIRT-OVERSIZED"],
    value: 97.98,
    currency: "BRL",
  };

  /* ---------- helpers ---------- */
  if (!window.safeCopyToClipboard) {
    window.safeCopyToClipboard = function (text) {
      return new Promise(function (res, rej) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(res).catch(function () {
            fallbackCopy(text) ? res() : rej();
          });
        } else {
          fallbackCopy(text) ? res() : rej();
        }
      });
    };
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
      ta.setAttribute("readonly", "");
      document.body.appendChild(ta);
      if (/ipad|iphone/i.test(navigator.userAgent)) {
        var range = document.createRange();
        range.selectNodeContents(ta);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        ta.setSelectionRange(0, 999999);
      } else {
        ta.select();
      }
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }
  window.fallbackCopy = fallbackCopy;

  if (!window.createInputMask) {
    window.createInputMask = function (type) {
      return {
        format: function (value, selectionStart) {
          if (!value) return { formatted: "", cursorPosition: 0 };
          var raw = value.replace(/\D/g, "");
          var hasCC = false;
          if (type === "phone") {
            if (raw.length > 11 && raw.substring(0, 2) === "55") {
              hasCC = true;
              raw = raw.substring(2);
            }
            if (raw.length > 11) raw = raw.substring(0, 11);
          }
          if (type === "cpf" && raw.length > 11) raw = raw.substring(0, 11);
          if (type === "cep" && raw.length > 8) raw = raw.substring(0, 8);
          var f = "";
          switch (type) {
            case "phone":
              if (raw.length <= 2) f = raw.replace(/^(\d{0,2})/, "($1");
              else if (raw.length <= 7) f = raw.replace(/^(\d{2})(\d{0,5})/, "($1) $2");
              else f = raw.replace(/^(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
              if (hasCC) f = "+55 " + f;
              break;
            case "cpf":
              f = raw.replace(/^(\d{0,3})(\d{0,3})(\d{0,3})(\d{0,2})/, function (m, g1, g2, g3, g4) {
                var r = "";
                if (g1) r += g1;
                if (g2) r += "." + g2;
                if (g3) r += "." + g3;
                if (g4) r += "-" + g4;
                return r;
              });
              break;
            case "cep":
              f = raw.replace(/^(\d{0,5})(\d{0,3})/, function (m, g1, g2) {
                var r = "";
                if (g1) r += g1;
                if (g2) r += "-" + g2;
                return r;
              });
              break;
          }
          var dbc = 0;
          if (selectionStart !== undefined && selectionStart !== null) {
            for (var i = 0; i < Math.min(selectionStart, value.length); i++) {
              if (value[i] >= "0" && value[i] <= "9") dbc++;
            }
          }
          var np = 0,
            dc = 0;
          for (var j = 0; j < f.length; j++) {
            if (f[j] >= "0" && f[j] <= "9") dc++;
            if (dc >= dbc) {
              np = j + 1;
              break;
            }
          }
          if (dbc === 0) np = 0;
          if (f.length < value.length && selectionStart === value.length) np = f.length;
          return { formatted: f, cursorPosition: np };
        },
      };
    };
  }

  if (!window.setupKeyboardDetection) {
    window.setupKeyboardDetection = function () {
      if (window.__keyboardDetectionReady) return;
      window.__keyboardDetectionReady = true;
      if (typeof window.visualViewport === "undefined") return;
      var vv = window.visualViewport;
      var INITIAL_H = vv.height || window.innerHeight || 0;
      var keyboardRaf = 0;
      var lastKeyboardHeight = -1;
      var lastKeyboardOpen = false;
      vv.addEventListener("resize", function () {
        if (keyboardRaf) return;
        keyboardRaf = requestAnimationFrame(function () {
          keyboardRaf = 0;
          var ch = vv.height;
          if (ch > INITIAL_H) INITIAL_H = ch;
          var rawDelta = INITIAL_H - ch;
          var d = rawDelta > 150 ? Math.round(rawDelta) : 0;
          var isOpen = d > 0;
          if (d !== lastKeyboardHeight) {
            lastKeyboardHeight = d;
            document.documentElement.style.setProperty("--keyboard-height", d + "px");
          }
          if (isOpen !== lastKeyboardOpen) {
            lastKeyboardOpen = isOpen;
            document.body.classList.toggle("keyboard-open", isOpen);
          }
        });
      });
    };
  }

  if (!window.generateEventId) {
    window.generateEventId = function () {
      return "evt_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
    };
  }

  if (!window.trackPixel) {
    window.trackPixel = function (event, data) {
      if (window.__TEST_MODE || window.__LAB_MODE) return;
      data = data || {};
      try {
        if (typeof gtag === "function") gtag("event", event, data);
      } catch (e) {}
    };
  }

  /* ---------- script loader ---------- */
  window.__loadScript =
    window.__loadScript ||
    function (src) {
      return new Promise(function (resolve, reject) {
        var existing = document.querySelector('script[src="' + src + '"]');
        if (existing) {
          if (existing.dataset.loaded === "true") return resolve(src);
          existing.addEventListener("load", function () {
            resolve(src);
          });
          existing.addEventListener("error", function () {
            reject(src);
          });
          return;
        }
        var s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = function () {
          s.dataset.loaded = "true";
          resolve(src);
        };
        s.onerror = function () {
          reject(src);
        };
        document.head.appendChild(s);
      });
    };

  function loadWhenMissing(name, src, isReady) {
    if (isReady()) return Promise.resolve(src);
    return window.__loadScript(src).then(function () {
      if (!isReady()) throw new Error(name + " nao ficou disponivel");
      return src;
    });
  }

  var runtimePromise = null;
  window.ensureCheckoutRuntime = function () {
    if (runtimePromise) return runtimePromise;
    runtimePromise = loadWhenMissing("react", "assets/vendor/react.production.min.js", function () {
      return typeof window.React !== "undefined";
    })
      .then(function () {
        return loadWhenMissing("react-dom", "assets/vendor/react-dom.production.min.js", function () {
          return typeof window.ReactDOM !== "undefined";
        });
      })
      .then(function () {
        return loadWhenMissing("checkoutapp", "assets/js/checkout.app.js?v=spa1", function () {
          return typeof window.initReactCheckout === "function";
        });
      })
      .then(function () {
        window.__checkoutRuntimeReady = true;
        return true;
      })
      .catch(function (err) {
        runtimePromise = null;
        throw err;
      });
    return runtimePromise;
  };

  function ensureCheckoutStyles() {
    var href = "assets/css/tailwind-static.css?v=spa1";
    var existing = document.getElementById("checkout-tailwind-static-css");
    if (existing) {
      if (existing.dataset.loaded === "true" || existing.sheet) return Promise.resolve();
      return new Promise(function (resolve) {
        var done = false;
        function finish() {
          if (done) return;
          done = true;
          resolve();
        }
        existing.addEventListener("load", finish, { once: true });
        existing.addEventListener("error", finish, { once: true });
        setTimeout(finish, 1200);
      });
    }
    return new Promise(function (resolve) {
      var link = document.createElement("link");
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        link.dataset.loaded = "true";
        resolve();
      }
      link.id = "checkout-tailwind-static-css";
      link.rel = "stylesheet";
      link.href = href;
      link.onload = finish;
      link.onerror = finish;
      setTimeout(finish, 1200);
      document.head.appendChild(link);
    });
  }

  var checkoutFallbackTimer = null;
  var checkoutForceReadyTimer = null;

  function clearCheckoutOpenTimers() {
    if (checkoutFallbackTimer) {
      clearTimeout(checkoutFallbackTimer);
      checkoutFallbackTimer = null;
    }
    if (checkoutForceReadyTimer) {
      clearTimeout(checkoutForceReadyTimer);
      checkoutForceReadyTimer = null;
    }
  }

  function setCheckoutOpeningState() {
    var wrapper = document.getElementById("spa-checkout-wrapper");
    var sk = document.getElementById("skeleton-loader");
    var root = document.getElementById("checkout-root");
    if (!wrapper) return;
    clearCheckoutOpenTimers();
    wrapper.setAttribute("data-state", "opening");
    if (sk) {
      sk.style.display = "none";
      sk.style.opacity = "1";
      sk.style.transition = "";
    }
    if (root) {
      root.style.visibility = "hidden";
      root.style.opacity = "0";
      root.style.pointerEvents = "none";
    }
    checkoutFallbackTimer = setTimeout(function () {
      var w = document.getElementById("spa-checkout-wrapper");
      var s = document.getElementById("skeleton-loader");
      if (w && w.getAttribute("data-state") === "opening" && s) s.style.display = "";
    }, 420);
    checkoutForceReadyTimer = setTimeout(function () {
      setCheckoutReadyState();
    }, 7000);
  }

  function setCheckoutReadyState() {
    var wrapper = document.getElementById("spa-checkout-wrapper");
    var sk = document.getElementById("skeleton-loader");
    var root = document.getElementById("checkout-root");
    if (!wrapper) return;
    clearCheckoutOpenTimers();
    wrapper.setAttribute("data-state", "ready");
    if (sk) sk.style.display = "none";
    if (root) {
      root.style.visibility = "visible";
      root.style.opacity = "1";
      root.style.pointerEvents = "auto";
    }
  }

  window.spaGoBack = function () {
    var wrapper = document.getElementById("spa-checkout-wrapper");
    var root = document.getElementById("checkout-root");
    clearCheckoutOpenTimers();
    if (wrapper) {
      wrapper.style.display = "none";
      wrapper.setAttribute("data-state", "idle");
    }
    document.body.classList.remove("spa-checkout-open");
    document.body.style.overflow = "";
    document.body.style.background = "";

    var sk = document.getElementById("skeleton-loader");
    if (sk) {
      sk.style.display = "none";
      sk.style.opacity = "1";
      sk.style.transition = "";
    }
    if (root) {
      root.style.visibility = "visible";
      root.style.opacity = "1";
      root.style.pointerEvents = "auto";
    }

    var oldRoot = document.getElementById("checkout-root");
    if (oldRoot) {
      var newRoot = document.createElement("div");
      newRoot.id = "checkout-root";
      oldRoot.parentNode.replaceChild(newRoot, oldRoot);
    }

    window.checkoutInitialized = false;
    window.checkoutMounted = false;

    try {
      history.pushState({ page: "lp" }, "", window.location.pathname.replace(/c\/?$/, "") || "index.html");
    } catch (e) {}
    document.title = "Kit 3 T-Shirts Oversized Classic Algodão | Izzat";
  };

  window.spaOpenCheckout = function (targetHref) {
    var wrapper = document.getElementById("spa-checkout-wrapper");
    window.__checkoutEntrySource = "lp";
    window.__currentCheckoutOpenToken =
      "checkout_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    window.__ASSET_BASE = "assets/";

    setCheckoutOpeningState();
    var checkoutStylesReady = ensureCheckoutStyles();

    document.body.classList.add("spa-checkout-open");
    document.body.style.overflow = "hidden";

    if (wrapper) {
      wrapper.style.display = "block";
      wrapper.scrollTop = 0;
    }

    try {
      var size = "";
      try {
        var saved = sessionStorage.getItem("izzat_checkout");
        if (saved) size = JSON.parse(saved).size || "";
      } catch (e) {}
      var q = size ? "?size=" + encodeURIComponent(size) : "";
      history.pushState({ page: "checkout" }, "", (targetHref || "c/") + q.replace(/^\?/, q ? "?" : ""));
      // Keep pretty SPA URL without leaving the LP
      history.replaceState({ page: "checkout" }, "", window.location.pathname.split("#")[0] + (q || "") + "#checkout");
    } catch (e) {}

    document.title = "Checkout - Kit 3 T-Shirts Oversized | Izzat";

    window.checkoutInitialized = false;
    window.checkoutMounted = false;

    var oldRoot = document.getElementById("checkout-root");
    if (oldRoot && oldRoot.innerHTML.length > 0) {
      var newRoot = document.createElement("div");
      newRoot.id = "checkout-root";
      oldRoot.parentNode.replaceChild(newRoot, oldRoot);
    }

    function revealCheckoutAfterReact() {
      var root = document.getElementById("checkout-root");
      var attempts = 0;
      function waitForRoot() {
        root = document.getElementById("checkout-root");
        attempts += 1;
        if (root && root.innerHTML.length >= 50) {
          checkoutStylesReady.then(function () {
            setTimeout(setCheckoutReadyState, 60);
          });
          return;
        }
        if (attempts < 45) {
          setTimeout(waitForRoot, 100);
          return;
        }
        checkoutStylesReady.then(setCheckoutReadyState);
      }
      if (!root || root.innerHTML.length < 50) {
        waitForRoot();
        return;
      }
      checkoutStylesReady.then(function () {
        setTimeout(setCheckoutReadyState, 60);
      });
    }

    function startReactCheckout() {
      if (window.initReactCheckout) {
        try {
          window.initReactCheckout();
          setTimeout(revealCheckoutAfterReact, 300);
        } catch (err) {
          console.error("[SPA] Error:", err);
        }
      } else {
        var poll = setInterval(function () {
          if (window.initReactCheckout) {
            clearInterval(poll);
            window.initReactCheckout();
            setTimeout(revealCheckoutAfterReact, 300);
          }
        }, 100);
        setTimeout(function () {
          clearInterval(poll);
        }, 8000);
      }
    }

    window
      .ensureCheckoutRuntime()
      .then(startReactCheckout)
      .catch(function () {
        startReactCheckout();
      });
  };

  window.addEventListener("popstate", function () {
    var wrapper = document.getElementById("spa-checkout-wrapper");
    if (wrapper && wrapper.style.display !== "none" && wrapper.style.display !== "") {
      window.spaGoBack();
    }
  });

  // Warm runtime after first interaction
  function warm() {
    if (window.__checkoutRuntimeReady) return;
    window.ensureCheckoutRuntime().catch(function () {});
  }
  ["pointerdown", "touchstart", "keydown", "scroll"].forEach(function (ev) {
    window.addEventListener(ev, function () {
      setTimeout(warm, 700);
    }, { once: true, passive: true });
  });
  setTimeout(warm, 7000);
})();
