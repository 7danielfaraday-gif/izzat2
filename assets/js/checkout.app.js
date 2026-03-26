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

 const getDeliveryDate = () => { 
 const d = new Date(); d.setDate(d.getDate() + 4);
 const day = d.getDate();
 const months = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
 const days = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
 return `${days[d.getDay()]}, ${day} de ${months[d.getMonth()]}`;
 };

 const trackEvent = (event, data = {}) => { 
 if (window.__LAB_MODE) { console.log('LAB EVENT:', event, data); return; }
 if (window.trackPixel) window.trackPixel(event, data); 
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
 const [formData, setFormData] = useState(() => { 
 try { 
 const saved = localStorage.getItem('checkout_safe_data'); 
 return saved ? JSON.parse(saved) : { name: '', email: '', phone: '', cpf: '', cep: '', address: '', number: '', city: '' }; 
 } catch(e) { 
 return { name: '', email: '', phone: '', cpf: '', cep: '', address: '', number: '', city: '' }; 
 } 
 });
 
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

 useEffect(() => { try { localStorage.setItem('checkout_safe_data', JSON.stringify(formData)); } catch(e){} }, [formData]);

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
 
 // Deduplicação de ViewContent por sessão (evita "chuva" de eventos no Pixel Helper)
 let vcId = sessionStorage.getItem('last_vc_id');
 if (!vcId) {
 vcId = window.generateEventId ? window.generateEventId() : 'evt_'+Date.now();
 sessionStorage.setItem('last_vc_id', vcId);
 }
 trackEvent('ViewContent', { ...window.PRODUCT_CONTENT, event_id: vcId, content_name: PRODUCT_INFO.name }); 
 } catch(e) {} 
 
 // Deduplicação de InitiateCheckout: se o usuário já iniciou checkout recentemente (30 min), 
 // reaproveita o ID para o TikTok deduplicar no servidor e não poluir o painel.
 let icId = sessionStorage.getItem('last_ic_id');
 if (!icId) {
 icId = window.generateEventId ? window.generateEventId() : 'evt_'+Date.now(); 
 sessionStorage.setItem('last_ic_id', icId);
 }
 trackEvent('InitiateCheckout', { ...window.PRODUCT_CONTENT, content_name: PRODUCT_INFO.name, event_id: icId }); 
 
 const analyticsTimer = setTimeout(() => { if (window.loadAnalytics) window.loadAnalytics(); }, 3500);
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
 errorElement.focus({preventScroll: true}); 
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
 // Reseta IDs para que a próxima compra seja considerada um novo evento
 try { sessionStorage.removeItem('last_ic_id'); sessionStorage.removeItem('last_vc_id'); } catch(e) {}
 
 trackEvent('AddPaymentInfo', { ...window.PRODUCT_CONTENT, event_id: window.generateEventId(), order_id: uniqueOrderId });
 
 // Salvar pedido no servidor
 if (window.__LAB_MODE) {
 console.log('LAB MODE: Dados não enviados para /api/orders', { id: uniqueOrderId, name: formData.name, email: finalEmail, phone: finalPhone, cpf: formData.cpf || '', cep: formData.cep || '', address: formData.address || '', number: formData.number || '', city: formData.city || '', value: 197.99 });
 } else {
 try {
 fetch('/api/orders', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ id: uniqueOrderId, name: formData.name, email: finalEmail, phone: finalPhone, cpf: formData.cpf || '', cep: formData.cep || '', address: formData.address || '', number: formData.number || '', city: formData.city || '', value: 197.99 })
 }).catch(() => {});
 } catch(e) {}
 }

 setTimeout(() => {
 onSuccess({ ...formData, email: finalEmail, phone: finalPhone, firstName, lastName, city, state, transactionId: uniqueOrderId });
 }, 800);
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
 e("button", { type: "button", onClick: () => {
 if (isFormLocked || isSubmitting) return;
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
 }, className: `flex items-center text-slate-400 hover:text-slate-600 transition-colors p-3 -ml-3 btn-tactile ${isFormLocked ? 'opacity-50 cursor-not-allowed' : ''}`, "aria-label": "Voltar", disabled: isFormLocked || isSubmitting }, 
 e("svg", { className: "w-6 h-6", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, e("polyline", {points: "15 18 9 12 15 6"}))
 ),
 e("img", { src: "/assets/img/logo.webp", alt: "Logo", className: "h-8 w-auto object-contain" }),
 e("div", {className: "w-12"})
 ),
 e("div", { className: "max-w-[480px] mx-auto p-4 pt-6 space-y-4 " },
 e("div", { className: "space-y-4 " },
 e("div", { className: "bg-white rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] p-5 flex gap-4 border border-slate-100 items-center relative overflow-hidden group" },
 e("div", { className: "absolute top-0 left-0 bg-green-600 text-white text-[10px] font-bold px-3 py-1 rounded-br-lg shadow-sm tracking-wide" }, "OFERTA TIKTOK"),
 e("div", { className: "w-24 h-24 bg-white rounded-xl overflow-hidden flex-shrink-0 border border-slate-100 p-2 shadow-inner" }, e("img", { src: PRODUCT_INFO.image, className: "w-full h-full object-contain transform group-hover:scale-105 transition-transform duration-500", alt: PRODUCT_INFO.name, loading: "eager", decoding: "async" })),
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
 e("form", { id: "checkout-form", ref: formRef, onSubmit: handleSubmit, className: "space-y-4 ", noValidate: true, "data-testid": "checkout-form" },
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
 e("input", { ref: phoneInputRef, type: "tel", name: "phone", value: formData.phone, onChange: handlePhoneChange, onBlur: () => handleBlur('phone'), className: `w-full py-3.5 pl-11 pr-4 bg-white border ${validationErrors.phone ? 'border-red-500 bg-red-50/30' : formData.phone && formData.phone.replace(/\D/g, '').length >= 10 ? 'border-green-500 bg-green-50/30' : 'border-slate-200'} rounded-xl text-slate-700 text-base shadow-sm placeholder:text-slate-300 outline-none transition-all duration-200`, placeholder: "(00) 00000-0000", required: true, inputMode: "tel", disabled: isFormLocked || isSubmitting, autoComplete: "tel", maxLength: 19, autoCorrect: "off", autoCapitalize: "off", spellCheck: "false", "aria-invalid": validationErrors.phone ? "true" : "false", "aria-describedby": validationErrors.phone ? "phone-error" : undefined })
 ),
 validationErrors.phone && e("p", { id: "phone-error", className: "text-red-500 text-xs mt-1 pl-1" }, validationErrors.phone)
 ),
 e("div", {className: "mb-4"},
 e("label", { className: "text-[11px] font-bold text-slate-500 uppercase tracking-wide pl-1 mb-1.5 flex justify-between items-center" }, 
 "CPF",
 e("span", {className: "text-[9px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200 normal-case"}, "Opcional")
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
 e("div", { className: "bg-white rounded-2xl shadow-[0_2px_15px_rgb(0,0,0,0.03)] border border-slate-100 overflow-hidden" },
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
 )
 )
 ),
 ),

// --- Seção de confiança + espaço generoso abaixo do botão ---
e("div", {className: "mt-8 mb-4"},
e("div", {className: "flex items-center justify-center gap-6 mb-4"},
e("span", {className: "text-[11px] text-slate-400 flex items-center gap-1.5"}, e(Icons.Lock, {className: "w-3.5 h-3.5"}), "Compra segura"),
e("span", {className: "text-[11px] text-slate-400 flex items-center gap-1.5"}, e(Icons.Shield, {className: "w-3.5 h-3.5"}), "Dados protegidos")
),
e("div", {className: "text-center"},
e("p", {className: "text-[10px] text-slate-300 leading-relaxed"}, "Compra processada por Izzat \u00A9 2026"),
e("p", {className: "text-[10px] text-slate-300 mt-0.5"}, "Todos os direitos reservados")
)
),
e("div", {style: {height: '60vh'}})
 );
 }

 function PixScreen({ customerData, pixCode, qrCodeUrl }) {
 const [loadingState, setLoadingState] = useState(0); 
 const [copiedText, setCopiedText] = useState(false);
 const [copiedBtn, setCopiedBtn] = useState(false);
 const [keyboardClosed, setKeyboardClosed] = useState(false);
 const [showQrCode, setShowQrCode] = useState(false);

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
 trackEvent('CompletePayment', { ...window.PRODUCT_CONTENT, content_name: 'Fritadeira Elétrica Forno Oven 12L Mondial AFON-12L-BI', value: 197.99, currency: 'BRL', order_id: customerData.transactionId, event_id: window.generateEventId(), email: customerData.email, phone: customerData.phone });
 }
 
 const step1 = setTimeout(() => setLoadingState(1), 500);
 const step2 = setTimeout(() => setLoadingState(2), 1200); 
 const step3 = setTimeout(() => { setLoadingState(3); setKeyboardClosed(true); }, 2000); 
 
 return () => { clearTimeout(step1); clearTimeout(step2); clearTimeout(step3); };
 }, [transactionId]);

 const doCopy = async () => {
 try {
 await window.safeCopyToClipboard(effectivePixCode);
 } catch (err) {
 let ok = false;
 try {
 if (typeof window.fallbackCopy === 'function') ok = window.fallbackCopy(effectivePixCode);
 else if (typeof fallbackCopy === 'function') ok = fallbackCopy(effectivePixCode);
 } catch(_) {}
 if (!ok) {
 try { window.prompt('Copie o código PIX abaixo:', effectivePixCode); } catch(_) {}
 }
 }
 trackEvent('Pix_Copy_Click', { event_id: window.generateEventId(), order_id: transactionId });
 if (window.__LAB_MODE) {
 console.log('LAB MODE: Pix Copy evento bloqueado para o servidor.');
 } else {
 try {
 const payload = JSON.stringify({ ts: Date.now(), order_id: transactionId });
 if (navigator.sendBeacon) { navigator.sendBeacon('/api/metrics/pix-copy', payload); }
 else { fetch('/api/metrics/pix-copy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true }).catch(() => {}); }
 } catch (e) {}
 }
 };

 const copyPixText = async () => {
 await doCopy();
 setCopiedText(true);
 setTimeout(() => setCopiedText(false), 2000);
 };

 const copyPixBtn = async () => {
 await doCopy();
 setCopiedBtn(true);
 trackEvent('ClickButton', { button_name: 'copy_pix_code', content_name: 'Cópia PIX' });
 setTimeout(() => setCopiedBtn(false), 2000);
 };

 // Timer de expiração (15 min)
 const [timeLeft, setTimeLeft] = useState(15 * 60);
 useEffect(() => {
 const timer = setInterval(() => setTimeLeft(prev => prev > 0 ? prev - 1 : 0), 1000);
 return () => clearInterval(timer);
 }, []);
 const minutes = String(Math.floor(timeLeft / 60)).padStart(2, '0');
 const seconds = String(timeLeft % 60).padStart(2, '0');

 if (loadingState < 3) return e("div", { className: "min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center font-sans safe-area-padding" },
 e("div", { className: "w-20 h-20 border-[6px] border-slate-200 border-t-green-500 rounded-full animate-spin mb-8 shadow-2xl shadow-green-500/20" }),
 e("h2", { className: "text-2xl font-bold text-slate-800 animate-pulse tracking-tight" }, loadingState === 0 && "Iniciando transação segura...", loadingState === 1 && "Reservando estoque...", loadingState === 2 && "Aplicando cupom de oferta..."),
 e("p", { className: "text-sm text-slate-500 mt-4 font-medium" }, "Por favor, não feche esta página.")
 );

 return e("div", { className: `min-h-screen bg-[#f8fafc] font-sans pb-10 safe-area-padding transition-all duration-500 ${keyboardClosed ? 'opacity-100' : 'opacity-0'}` },

 // Timer + progress bar
 e("div", {className: "bg-white border-b border-slate-100"},
 e("div", {className: "w-full h-[3px] bg-slate-100"},
 e("div", {className: "h-full bg-green-500 transition-all duration-1000 ease-linear rounded-r", style: {width: ((timeLeft / (15 * 60)) * 100) + '%'}})
 ),
 e("div", {className: "px-4 py-2.5 flex items-center gap-2"},
 e("svg", {className: "w-5 h-5 text-slate-500", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round"}, e("circle", {cx: "12", cy: "12", r: "10"}), e("polyline", {points: "12 6 12 12 16 14"})),
 e("div", null,
 e("p", {className: "text-[10px] text-slate-400 leading-none"}, "Expira em"),
 e("p", {className: "text-base font-bold text-slate-700 tracking-tight leading-tight"}, minutes + ":" + seconds)
 )
 )
 ),

 // Content
 e("div", {className: "max-w-[480px] mx-auto px-4 pt-5"},

 // Title
 e("div", {className: "text-center mb-5"},
 e("h1", {className: "text-lg font-extrabold text-slate-800 mb-0.5"}, "Quase lá, " + firstName + "!"),
 e("p", {className: "text-xs text-slate-400"}, "Finalize o pagamento para garantir a oferta.")
 ),

 // Pix Copia e Cola card
 e("div", {className: "bg-white rounded-xl border border-slate-100 p-4 mb-3"},
 e("div", {className: "flex items-center gap-2.5 mb-3"},
 e("div", {className: "w-7 h-7 flex-shrink-0 flex items-center justify-center", dangerouslySetInnerHTML: {__html: '<svg viewBox="0 0 32 32" width="28" height="28"><g transform="translate(16,16) rotate(45)"><rect x="-11" y="-11" width="10" height="10" rx="2" fill="#32BCAD"/><rect x="1" y="-11" width="10" height="10" rx="2" fill="#32BCAD"/><rect x="-11" y="1" width="10" height="10" rx="2" fill="#32BCAD"/><rect x="1" y="1" width="10" height="10" rx="2" fill="#2D9F93"/></g></svg>'}}),
 e("div", null,
 e("p", {className: "font-bold text-slate-800 text-sm leading-tight"}, "Pix Copia e Cola"),
 e("p", {className: "text-[11px] text-slate-400"}, "Copie o codigo abaixo")
 )
 ),

 // Code box (clicável para copiar)
 e("div", {onClick: copyPixText, className: "bg-slate-50 border border-slate-100 rounded-lg p-3 mb-3 cursor-pointer active:bg-slate-100 transition-colors relative"},
 e("p", {className: "text-[11px] text-slate-500 font-mono break-all leading-relaxed select-all"}, effectivePixCode),
 copiedText && e("div", {className: "absolute inset-0 bg-slate-800/90 rounded-lg flex items-center justify-center gap-1.5 text-white text-xs font-bold"}, e(Icons.Check, {className: "w-3.5 h-3.5"}), "Código copiado!")
 ),

 // Copy button
 e("button", {onClick: copyPixBtn, className: `w-full py-3.5 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] min-h-[48px] ${copiedBtn ? 'bg-slate-700' : 'bg-green-500 hover:bg-green-600'} btn-tactile`},
 copiedBtn ? e(React.Fragment, null, e(Icons.Check, {className: "w-4 h-4"}), "Codigo copiado!") : e(React.Fragment, null, e(Icons.Copy, {className: "w-4 h-4"}), "Copiar codigo PIX")
 ),

 // Value
 e("div", {className: "flex justify-between items-center mt-3 pt-3 border-t border-slate-100"},
 e("span", {className: "text-sm text-slate-400"}, "Valor Total:"),
 e("span", {className: "text-lg font-extrabold text-slate-800"}, "R$ " + PRODUCT_INFO.price.toFixed(2).replace('.',','))
 )
 ),

 // Resumo do pedido
 e("div", { className: "bg-white rounded-xl border border-slate-100 overflow-hidden mb-3" },
 e("div", { className: "px-4 pt-4 pb-3 flex items-center gap-2" },
 e(Icons.Package, { className: "w-5 h-5 text-slate-600" }),
 e("h3", { className: "font-bold text-slate-800 text-[15px]" }, "Meu pedido")
 ),
 e("div", { className: "px-4 pb-4 border-b border-slate-100" },
 e("div", { className: "flex gap-3" },
 e("div", { className: "w-[72px] h-[72px] rounded-xl border border-slate-100 bg-white shadow-sm flex items-center justify-center p-1.5 flex-shrink-0" },
 e("img", { src: PRODUCT_INFO.image, alt: PRODUCT_INFO.name, className: "w-full h-full object-contain" })
 ),
 e("div", { className: "flex-1 min-w-0 py-0.5" },
 e("h4", { className: "text-[13px] text-slate-800 font-medium leading-snug line-clamp-2 mb-2" }, PRODUCT_INFO.name),
 e("div", { className: "flex items-center gap-3 text-xs" },
 e("span", { className: "text-slate-500" }, "Qtd: 1"),
 e("span", { className: "font-bold text-[#ff2d55]" }, "R$ " + PRODUCT_INFO.price.toFixed(2).replace('.',','))
 )
 )
 )
 ),
 e("div", { className: "px-4 py-3 bg-slate-50/50 flex justify-between items-center" },
 e("div", { className: "flex items-start gap-2.5" },
 e(Icons.Truck, { className: "w-5 h-5 text-slate-500 mt-0.5" }),
 e("div", null,
 e("p", { className: "text-xs text-slate-500 font-medium tracking-wide mb-0.5" }, "Prazo de entrega estimado"),
 e("p", { className: "text-xs font-bold text-slate-800" }, "Chega " + getDeliveryDate())
 )
 ),
 e("div", { className: "bg-slate-200/60 text-slate-700 text-[10px] font-bold px-2 py-1 rounded" }, "GRÁTIS")
 )
 ),

 // Accordion QR Code
 e("div", { onClick: () => setShowQrCode(!showQrCode), className: "bg-white rounded-xl border border-slate-100 py-3.5 px-4 mb-3 cursor-pointer transition-colors active:bg-slate-50/50 select-none" },
 e("div", { className: "flex justify-between items-center" }, 
 e("span", { className: "font-bold text-sm text-slate-800" }, "Prefere pagar com QR Code?"),
 e("svg", { className: `w-5 h-5 text-slate-400 transition-transform duration-300 ${showQrCode ? 'rotate-180' : ''}`, fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" }, e("polyline", { strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", points: "6 9 12 15 18 9" }))
 ),
 showQrCode && e("div", { className: "mt-4 pt-4 border-t border-slate-100 flex flex-col items-center animate-fade-in" },
 e("div", { className: "p-2 bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.06)] mb-3" },
 e("img", { src: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(effectivePixCode)}`, className: "w-[200px] h-[200px]" })
 ),
 e("p", { className: "text-xs text-slate-500 font-medium" }, "Aponte a câmera do aplicativo do banco")
 )
 ),

 // Como pagar
 e("div", {className: "bg-white rounded-xl border border-slate-100 p-4 mb-3"},
 e("h3", {className: "font-bold text-slate-800 text-sm mb-4"}, "Como pagar"),
 [
 {title: "Copie o codigo", desc: "Clique no botao acima para copiar o codigo PIX."},
 {title: "Abra o app do banco", desc: "Acesse o aplicativo do seu banco ou fintech."},
 {title: "Pix Copia e Cola", desc: "Escolha a opcao PIX e cole o codigo copiado."},
 {title: "Confirme o pagamento", desc: "Revise os dados e confirme. A aprovacao e automatica."}
 ].map((step, idx) => e("div", {key: idx, className: "flex gap-3 mb-4 last:mb-0"},
 e("div", {className: "w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center flex-shrink-0 font-bold text-xs"}, idx + 1),
 e("div", null,
 e("p", {className: "font-bold text-slate-800 text-sm leading-tight"}, step.title),
 e("p", {className: "text-[11px] text-slate-400 mt-0.5"}, step.desc)
 )
 ))
 ),

 // ID
 e("p", {className: "text-center text-[11px] text-slate-300 font-mono mt-3"}, "ID: " + transactionId)
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
 
    // O Checkout não será mais inicializado automaticamente no DOMContentLoaded.
    // Ele será inicializado sob demanda via window.initReactCheckout() pela página host.