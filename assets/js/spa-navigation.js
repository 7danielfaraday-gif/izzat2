/**
 * SPA Navigation for Izzat Checkout
 * Replicates Next.js App Router behavior (no-reload transition)
 */
(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        checkoutUrl: '/c/',
        buyButtonId: 'buy-now',
        progressBarId: 'spa-progress',
        mainContainerSelector: '.container', // Landing page main wrapper
        transitionDuration: 300
    };

    let originalPageState = null;

    /**
     * Initialize the SPA navigation
     */
    function init() {
        const buyBtn = document.getElementById(CONFIG.buyButtonId);
        if (!buyBtn) return;

        // Intercept click on "Buy Now"
        buyBtn.addEventListener('click', function(e) {
            // Only SPA if it's a left click without modifiers
            if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
            
            e.preventDefault();
            navigateToCheckout();
        });

        // Handle browser back/forward
        window.addEventListener('popstate', function(e) {
            if (e.state && e.state.isCheckout) {
                // Should already be handled if we are navigating forward, 
                // but if we hit back from some other page TO checkout:
                navigateToCheckout(true);
            } else if (originalPageState) {
                restoreLandingPage();
            }
        });
    }

    /**
     * Show/Hide Progress Bar
     */
    function setProgress(percent) {
        let bar = document.getElementById(CONFIG.progressBarId);
        if (!bar) {
            bar = document.createElement('div');
            bar.id = CONFIG.progressBarId;
            bar.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                height: 3px;
                background: linear-gradient(90deg, #22c55e 0%, #4ade80 100%);
                z-index: 10001;
                transition: width 0.3s ease;
                width: 0%;
            `;
            document.body.appendChild(bar);
        }

        if (percent === null) {
            bar.style.opacity = '0';
            setTimeout(() => bar.remove(), 400);
        } else {
            bar.style.opacity = '1';
            bar.style.width = percent + '%';
        }
    }

    /**
     * Navigate to Checkout (The "Next.js" way)
     */
    async function navigateToCheckout(isPopState = false) {
        try {
            setProgress(30);

            // Save landing page content if not already saved
            if (!originalPageState) {
                const container = document.querySelector(CONFIG.mainContainerSelector);
                originalPageState = {
                    content: container ? container.innerHTML : document.body.innerHTML,
                    title: document.title,
                    scrollY: window.scrollY
                };
            }

            // Fetch checkout content
            const response = await fetch(CONFIG.checkoutUrl);
            if (!response.ok) throw new Error('Failed to fetch checkout');
            
            setProgress(60);
            const html = await response.text();
            
            // Update URL and State
            if (!isPopState) {
                history.pushState({ isCheckout: true }, '', CONFIG.checkoutUrl);
            }

            // Parse and Inject
            renderCheckout(html);
            
            setProgress(100);
            setTimeout(() => setProgress(null), CONFIG.transitionDuration);

        } catch (error) {
            console.error('[SPA Navigation Error]', error);
            // Fallback to traditional navigation
            window.location.href = CONFIG.checkoutUrl;
        }
    }

    /**
     * Render Checkout Page
     */
    function renderCheckout(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // 1. Update Title
        document.title = doc.title;

        // 2. Prepare the swap
        // We want to replace the landing page's .container with the checkout's structure
        const body = document.body;
        
        // Essential elements from checkout
        const skeleton = doc.getElementById('skeleton-loader');
        const root = doc.getElementById('checkout-root');
        
        if (!skeleton || !root) {
            console.warn('Checkout elements not found in response, falling back.');
            window.location.href = CONFIG.checkoutUrl;
            return;
        }

        // Clear current body (except our progress bar)
        const currentProgress = document.getElementById(CONFIG.progressBarId);
        body.innerHTML = '';
        if (currentProgress) body.appendChild(currentProgress);

        // Inject new content
        body.appendChild(skeleton.cloneNode(true));
        body.appendChild(root.cloneNode(true));

        // Scroll to top
        window.scrollTo(0, 0);

        // 3. Inject and run scripts
        // We need React, ReactDOM, and checkout.app.js
        const scripts = Array.from(doc.querySelectorAll('script'));
        
        // Filter and re-inject scripts
        scripts.forEach(oldScript => {
            const newScript = document.createElement('script');
            
            // Copy attributes
            Array.from(oldScript.attributes).forEach(attr => {
                let value = attr.value;
                // Fix relative paths (../assets/ -> /assets/)
                if (attr.name === 'src' && value.startsWith('../')) {
                    value = '/' + value.substring(3);
                }
                newScript.setAttribute(attr.name, value);
            });
            
            // Copy content for inline scripts
            if (oldScript.innerHTML) {
                newScript.innerHTML = oldScript.innerHTML;
            }

            // Important: Re-append to body/head to trigger loading
            document.body.appendChild(newScript);
        });

        // 4. Force init if necessary (usually handled by window.onload or DOMContentLoaded)
        // Since we are already in a loaded state, we might need to manually trigger.
        // The checkout script has a DOMContentLoaded listener, but we just injected it.
        // Let's add a watchdog check:
        const checkInit = setInterval(() => {
            if (window.initReactCheckout && !window.checkoutInitialized) {
                window.initReactCheckout();
                clearInterval(checkInit);
            }
        }, 100);
        setTimeout(() => clearInterval(checkInit), 5000);
    }

    /**
     * Restore Landing Page (Back Button)
     */
    function restoreLandingPage() {
        if (!originalPageState) {
            window.location.href = '/';
            return;
        }

        document.title = originalPageState.title;
        document.body.innerHTML = originalPageState.content;
        
        // Re-scroll to previous position
        window.scrollTo(0, originalPageState.scrollY);

        // Re-initialize SPA listeners (as we might have replaced the button)
        init();
        
        // Note: Landing page JS usually doesn't need "re-init" if it's mostly static,
        // but if it does, we'd call those functions here.
    }

    // Run on startup
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
