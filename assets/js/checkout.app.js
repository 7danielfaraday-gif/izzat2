window.activateCheckoutKeyboardDetection = window.activateCheckoutKeyboardDetection || function() {
try {
if (typeof setupKeyboardDetection === 'function') setupKeyboardDetection();
else if (typeof window.setupKeyboardDetection === 'function') window.setupKeyboardDetection();
} catch(e) {}
};
 
 window.initReactCheckout = function() {
 if (window.checkoutInitialized) return;
 if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') {
 setTimeout(window.initReactCheckout, 50); 
 return;
 }
 if (typeof window.activateCheckoutKeyboardDetection === 'function') window.activateCheckoutKeyboardDetection();
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

const CHECKOUT_LOGO_SRC = "/assets/img/monetizze-logo.svg?v=20260424h";
const CHECKOUT_LOGO_FALLBACK_SRC = "/assets/img/logo.webp";
const MONETIZZE_BLUE = "#0030FF";
const CHECKOUT_STEP_CIRCLE_STYLE = { backgroundColor: MONETIZZE_BLUE, boxShadow: "0 4px 10px rgba(0, 48, 255, 0.22)" };
const CHECKOUT_ADDRESS_INPUT_STYLE = { fontSize: '16px' };
const PIX_COPY_BUTTON_PULSE_CSS = `
@keyframes pixCopyButtonPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  52% { transform: scale(1.012); opacity: .96; }
}
.pix-copy-subtle-pulse:not(.pix-copy-confirmed) {
  animation: pixCopyButtonPulse 3.8s ease-in-out infinite;
  transform-origin: center;
}
@media (prefers-reduced-motion: reduce) {
  .pix-copy-subtle-pulse {
    animation: none !important;
  }
}
`;

const isLabMode = () => !!window.__LAB_MODE;

const trackEvent = (event, data = {}) => { 
if (isLabMode()) return;
try { if (window.__obs) window.__obs(event, data); } catch(e) {}
if (window.trackPixel) window.trackPixel(event, data); 
};

const flushGAOnlyQueue = () => {
try {
if (!window.__gaLoaded || typeof window.gtag !== 'function' || !window.trackingQueue || !window.trackingQueue.length) return;
const queue = window.trackingQueue.slice();
window.trackingQueue = [];
queue.forEach(item => {
if (!item || !item.event) return;
try { window.gtag('event', item.event, item.data || {}); } catch(e) {}
});
} catch(e) {}
};

const trackCheckoutGAOnly = (event, data = {}) => {
if (isLabMode() || window.__TEST_MODE) return;
try {
const token = getCheckoutOpenToken();
const key = event + '::' + token;
window.__checkoutGAOnlyEvents = window.__checkoutGAOnlyEvents || {};
if (window.__checkoutGAOnlyEvents[key]) return;
window.__checkoutGAOnlyEvents[key] = true;

const payload = Object.assign({
event_category: 'checkout_diagnostic',
checkout_open_token: token,
checkout_entry_source: window.__checkoutEntrySource || 'unknown',
page_location: typeof window.getGAPageLocation === 'function' ? window.getGAPageLocation() : window.location.href,
page_path: window.location.pathname
}, data || {});

try { if (window.__obs) window.__obs(event, payload); } catch(e) {}

if (typeof window.gtag === 'function' && window.__gaLoaded) {
try {
window.gtag('event', event, payload);
return;
} catch(e) {}
}

window.trackingQueue = window.trackingQueue || [];
window.trackingQueue.push({ event: event, data: payload });
if (typeof window.loadAnalytics === 'function') {
try { window.loadAnalytics(); } catch(e) {}
}
setTimeout(flushGAOnlyQueue, 1200);
setTimeout(flushGAOnlyQueue, 4000);
} catch(e) {}
};

window.trackCheckoutGAOnly = trackCheckoutGAOnly;

const LP_VIEW_CONTENT_KEY = '__tt_lp_viewcontent';
const CHECKOUT_OPEN_EVENT_PREFIX = '__tt_checkout_open_event__';

const readSessionJson = (key) => {
try {
const raw = sessionStorage.getItem(key);
return raw ? JSON.parse(raw) : null;
} catch(e) {
return null;
}
};

const writeSessionJson = (key, value) => {
try {
sessionStorage.setItem(key, JSON.stringify(value));
} catch(e) {}
};

const getCheckoutOpenToken = () => {
try {
if (window.__currentCheckoutOpenToken) return String(window.__currentCheckoutOpenToken);
const fallback = 'checkout_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
window.__currentCheckoutOpenToken = fallback;
return fallback;
} catch(e) {
return 'checkout_' + Date.now();
}
};

const claimCheckoutOpenEvent = (eventName) => {
const openToken = getCheckoutOpenToken();
const memoryKey = eventName + '::' + openToken;
window.__checkoutTrackedOpenEvents = window.__checkoutTrackedOpenEvents || {};
if (window.__checkoutTrackedOpenEvents[memoryKey]) return null;
window.__checkoutTrackedOpenEvents[memoryKey] = true;

const eventId = window.generateEventId ? window.generateEventId() : 'evt_' + Date.now();
writeSessionJson(CHECKOUT_OPEN_EVENT_PREFIX + memoryKey, { event_id: eventId, at: Date.now() });
return eventId;
};

const hasRecentLandingViewContent = () => {
const existing = readSessionJson(LP_VIEW_CONTENT_KEY);
if (!existing || !existing.at) return false;
return (Date.now() - existing.at) < (30 * 60 * 1000);
};


const getCheckoutScrollViewport = () => {
try {
const wrapper = document.getElementById('spa-checkout-wrapper');
if (wrapper && wrapper.style && wrapper.style.display !== 'none') return wrapper;
} catch(e) {}
return window;
};

const scrollCheckoutViewportToTop = (behavior) => {
const viewport = getCheckoutScrollViewport();
const scrollBehavior = behavior || 'auto';
try {
if (viewport && typeof viewport.scrollTo === 'function' && viewport !== window) {
viewport.scrollTo({ top: 0, left: 0, behavior: scrollBehavior });
return;
}
} catch(e) {}
try {
window.scrollTo({ top: 0, left: 0, behavior: scrollBehavior });
} catch(e) {
try { window.scrollTo(0, 0); } catch(_) {}
}
};

const runAfterCheckoutPaint = (fn) => {
try {
requestAnimationFrame(() => {
requestAnimationFrame(() => {
setTimeout(fn, 0);
});
});
} catch(e) {
setTimeout(fn, 80);
}
};

const scrollCheckoutViewportToY = (y, behavior) => {
const top = Math.max(0, Number.isFinite(y) ? y : 0);
const viewport = getCheckoutScrollViewport();
const scrollBehavior = behavior || 'auto';
try {
if (viewport && typeof viewport.scrollTo === 'function' && viewport !== window) {
viewport.scrollTo({ top: top, left: 0, behavior: scrollBehavior });
return;
}
} catch(e) {}
try {
window.scrollTo({ top: top, left: 0, behavior: scrollBehavior });
} catch(e) {
try { window.scrollTo(0, top); } catch(_) {}
}
};


const scrollCheckoutElementIntoView = (element, offset, behavior) => {
if (!element || !element.getBoundingClientRect) return;
const safeOffset = Math.max(0, Number(offset) || 0);
const viewport = getCheckoutScrollViewport();
try {
if (viewport && viewport !== window && viewport.getBoundingClientRect) {
const viewportRect = viewport.getBoundingClientRect();
const elementRect = element.getBoundingClientRect();
const targetTop = viewport.scrollTop + (elementRect.top - viewportRect.top) - safeOffset;
scrollCheckoutViewportToY(targetTop, behavior || 'smooth');
return;
}
} catch(e) {}
try {
const targetTop = (window.scrollY || window.pageYOffset || 0) + element.getBoundingClientRect().top - safeOffset;
scrollCheckoutViewportToY(targetTop, behavior || 'smooth');
} catch(e) {}
};

const getFreightRangeByUf = (uf) => {
const normalizedUf = String(uf || '').toUpperCase();
const north = ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'];
const northeast = ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'];
const midwest = ['DF', 'GO', 'MS', 'MT'];
const southSoutheast = ['ES', 'MG', 'RJ', 'SP', 'PR', 'RS', 'SC'];

if (north.includes(normalizedUf)) return { min: 6, max: 10 };
if (northeast.includes(normalizedUf)) return { min: 5, max: 8 };
if (midwest.includes(normalizedUf)) return { min: 4, max: 7 };
if (southSoutheast.includes(normalizedUf)) return { min: 3, max: 6 };

return { min: 4, max: 7 };
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

 const DEFAULT_FORM_DATA = { name: '', email: '', phone: '', cpf: '', cep: '', address: '', number: '', neighborhood: '', complement: '', city: '' };
 const ORDER_SOURCE_KEYS = { ttclid: true, gclid: true, msclkid: true, external_id: true };

 const getOrderSourceData = () => {
 const source = {};
 try {
 const urlParams = new URLSearchParams(window.location.search || '');
 urlParams.forEach((value, rawKey) => {
 if (!value) return;
 const key = String(rawKey || '').toLowerCase();
 if (!key) return;
 if (key === 'eid') {
 source.external_id = value;
 return;
 }
 if (key.indexOf('utm_') === 0 || key.indexOf('tt_') === 0 || ORDER_SOURCE_KEYS[key]) {
 source[key] = value;
 }
 });
 } catch(e) {}
 try {
 const stored = (typeof window.getStoredUTMs === 'function') ? window.getStoredUTMs() : {};
 Object.keys(stored || {}).forEach((rawKey) => {
 const value = stored[rawKey];
 if (!value) return;
 const key = String(rawKey || '').toLowerCase();
 if (!source[key]) source[key] = String(value);
 });
 } catch(e) {}
 try {
 const ttclid = (typeof window.getTTCLID === 'function') ? window.getTTCLID() : '';
 if (ttclid && !source.ttclid) source.ttclid = ttclid;
 } catch(e) {}
 try {
 const ttp = (typeof window.getTTP === 'function') ? window.getTTP() : '';
 if (ttp && !source.ttp) source.ttp = ttp;
 } catch(e) {}
try {
const externalId = (typeof window.getExternalId === 'function') ? window.getExternalId() : '';
if (externalId && !source.external_id) source.external_id = externalId;
} catch(e) {}
try {
const gaClientId = (typeof window.getGAClientId === 'function') ? window.getGAClientId() : '';
if (gaClientId && !source.ga_client_id) source.ga_client_id = gaClientId;
const gaSessionId = (typeof window.getGASessionId === 'function') ? window.getGASessionId() : '';
if (gaSessionId && !source.ga_session_id) source.ga_session_id = gaSessionId;
} catch(e) {}
try {
const eventSourceUrl = (typeof window.getTikTokEventSourceUrl === 'function') ? window.getTikTokEventSourceUrl() : window.location.href;
if (eventSourceUrl && !source.event_source_url) source.event_source_url = eventSourceUrl;
} catch(e) {}
 return source;
 };

 function CheckoutScreen({ onSuccess }) {
 const [loading, setLoading] = useState(false);
 const [loadingCep, setLoadingCep] = useState(false);
 const [cepFailed, setCepFailed] = useState(false);
 const [formData, setFormData] = useState(() => { 
 try { 
 const saved = localStorage.getItem('checkout_safe_data'); 
 return saved ? { ...DEFAULT_FORM_DATA, ...JSON.parse(saved) } : DEFAULT_FORM_DATA; 
 } catch(e) { 
 return DEFAULT_FORM_DATA; 
 } 
 });
 
 // ⭐️ SEGURAN�?A: Lógica de tempo mantida para evitar ReferenceError (Crash)
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
 scrollCheckoutViewportToTop('auto'); 
 if (window.__checkoutEntrySource !== 'lp') {
 requestAnimationFrame(() => {
 requestAnimationFrame(() => {
 if (typeof window.trackCheckoutGAOnly === 'function') {
 window.trackCheckoutGAOnly('checkout__Visible', { checkout_ready_state: 'react_mounted', checkout_visible_source: 'direct' });
 }
 });
 });
 }
 
 // Deduplicação de ViewContent por sessão (evita "chuva" de eventos no Pixel Helper)
 const checkoutSource = window.__checkoutEntrySource === 'lp' ? 'lp' : 'direct';
 if (!(checkoutSource === 'lp' && hasRecentLandingViewContent())) {
 const vcId = claimCheckoutOpenEvent('ViewContent');
 if (vcId) trackEvent('ViewContent', { ...window.PRODUCT_CONTENT, event_id: vcId, content_name: PRODUCT_INFO.name });
 }
 } catch(e) {} 
 
 // Deduplicação de InitiateCheckout: se o usuário já iniciou checkout recentemente (30 min), 
 // reaproveita o ID para o TikTok deduplicar no servidor e não poluir o painel.
 const icId = claimCheckoutOpenEvent('InitiateCheckout');
 if (icId) trackEvent('InitiateCheckout', { ...window.PRODUCT_CONTENT, content_name: PRODUCT_INFO.name, event_id: icId }); 
 
const analyticsTimer = setTimeout(() => { if (!isLabMode() && window.loadAnalytics) window.loadAnalytics(); }, 3500);
 const timerInterval = setInterval(() => { setTimeLeft(prev => prev > 0 ? prev - 1 : 0); }, 1000);

 return () => { clearTimeout(analyticsTimer); clearInterval(timerInterval); }
 }, []);

 useEffect(() => { 
const totalFields = 5; 
const filledFields = Object.keys(formData).filter(key => ['name', 'email', 'phone', 'address', 'number'].includes(key) && formData[key]).length;
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
 
 const fetchJsonWithTimeout = async (url, timeoutMs) => {
 const controller = new AbortController();
 const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
 try {
 const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
 if (!res || !res.ok) throw new Error('cep_http_' + (res && res.status));
 return await res.json();
 } finally {
 clearTimeout(timeoutId);
 }
 };

const normalizeCepAddress = (provider, data) => {
 if (!data || data.erro) return null;
 if (provider === 'edge') {
 const city = data.city || `${data.city_name || ''}/${data.state || ''}`.replace(/^\//,'');
 return {
 address: data.address || '',
 neighborhood: data.neighborhood || '',
 complement: data.complement || '',
 city
 };
 }
 if (provider === 'viacep') {
 const city = `${data.localidade || ''}/${data.uf || ''}`.replace(/^\//,'');
 return {
 address: data.logradouro || '',
 neighborhood: data.bairro || '',
 complement: data.complemento || '',
 city
 };
 }
 const city = `${data.city || ''}/${data.state || ''}`.replace(/^\//,'');
 return {
 address: data.street || '',
 neighborhood: data.neighborhood || '',
 complement: '',
 city
 };
 };

 const lookupCepAddress = async (cep) => {
 try {
 const data = await fetchJsonWithTimeout(`/api/cep?cep=${cep}`, 4500);
 const normalized = normalizeCepAddress('edge', data);
 if (normalized && (normalized.address || normalized.neighborhood || normalized.city)) return normalized;
 } catch(e) {}

 try {
 const data = await fetchJsonWithTimeout(`https://viacep.com.br/ws/${cep}/json/`, 3500);
 const normalized = normalizeCepAddress('viacep', data);
 if (normalized && (normalized.address || normalized.neighborhood || normalized.city)) return normalized;
 } catch(e) {}

 try {
 const data = await fetchJsonWithTimeout(`https://brasilapi.com.br/api/cep/v2/${cep}`, 3500);
 const normalized = normalizeCepAddress('brasilapi', data);
 if (normalized && (normalized.address || normalized.neighborhood || normalized.city)) return normalized;
 } catch(e) {}

 return null;
 };

 const handleCep = async (val) => { 
 if (fetchingCepRef.current) return;
 const cep = val.replace(/\D/g, ''); 
 if (cep.length === 8) { 
 fetchingCepRef.current = true; setLoadingCep(true); 
 
 try { 
 setCepFailed(false);
 const data = await lookupCepAddress(cep);
 const currentCep = cepInputRef.current ? cepInputRef.current.value.replace(/\D/g, '') : cep;
 if (currentCep !== cep) return;
 if(!data || data.erro) { 
 setCepFailed(true);
 } else { 
 setFormData(prev => {
 if ((prev.cep || '').replace(/\D/g, '') !== cep) return prev;
 return ({
 ...prev,
 address: prev.address || data.address || '',
 neighborhood: prev.neighborhood || data.neighborhood || '',
 complement: prev.complement || data.complement || '',
 city: prev.city || data.city || ''
 });
 }); 
 setTimeout(() => { try { if(numberRef.current && document.activeElement === cepInputRef.current) numberRef.current.focus(); } catch(e){} }, 300);
 }
 } catch(e) {
 // Falha comum em in-app / conexão fraca: libera preenchimento manual
 try { setCepFailed(true); } catch(_) {}
 } finally {
 setLoadingCep(false); fetchingCepRef.current = false;
 const latestCep = cepInputRef.current ? cepInputRef.current.value.replace(/\D/g, '') : '';
 if (latestCep.length === 8 && latestCep !== cep) setTimeout(() => handleCep(latestCep), 0);
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
 
 // ⭐️ CORRE�?�fO 4: Race condition check logo no início ⭐️
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
 scrollCheckoutElementIntoView(errorElement, offset, 'smooth');
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
 runAfterCheckoutPaint(() => {
 // Reforça o matching do evento mesmo quando o usuário não desfoca dos campos antes do submit.
 trackEvent('AddPaymentInfo', {
 ...window.PRODUCT_CONTENT,
 content_name: PRODUCT_INFO.name,
 event_id: window.generateEventId(),
 order_id: uniqueOrderId,
 email: finalEmail,
 phone: finalPhone
 });

 // Salvar pedido no servidor sem competir com o primeiro feedback visual do clique.
 if (!isLabMode()) {
 try {
 const orderSource = getOrderSourceData();
 fetch('/api/orders', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ id: uniqueOrderId, name: formData.name, email: finalEmail, phone: finalPhone, cpf: formData.cpf || '', cep: formData.cep || '', address: formData.address || '', number: formData.number || '', neighborhood: formData.neighborhood || '', complement: formData.complement || '', city: formData.city || '', value: 197.99, source: orderSource })
 }).catch(() => {});
 } catch(e) {}
 }
 });

 setTimeout(() => {
 onSuccess({ ...formData, email: finalEmail, phone: finalPhone, firstName, lastName, city, state, transactionId: uniqueOrderId });
 }, 800);
 };

 const minutes = Math.floor(timeLeft / 60);
 const seconds = timeLeft % 60;

 const shouldShowAddressFields = useMemo(() => {
 const cd = (formData.cep || '').replace(/\D/g, '');
return !!formData.address || !!formData.neighborhood || !!cepFailed || cd.length === 8;
}, [formData.address, formData.neighborhood, formData.cep, cepFailed]);
 
 return e("div", { className: "fade-in w-full min-h-screen font-sans bg-[#f8fafc] form-container" },
 e("div", { ref: progressRef, className: "progress-bar", style: {width: '10%'} }),
 /* ⭐️ SEGURAN�?A: Barra visual removida, lógica mantida internamente no componente */
e("div", { className: "static-nav bg-white/98 border-b border-gray-200 flex justify-between items-center z-30 shadow-[0_2px_8px_rgba(0,0,0,0.04)]", style: { minHeight: '80px', padding: '16px', boxSizing: 'border-box' } },
e("button", { type: "button", onClick: () => {
if (isFormLocked || isSubmitting) return;
try {
if (typeof window.spaGoBack === 'function') {
window.spaGoBack({ replace: true });
} else {
window.location.replace('/');
}
} catch(e) { window.location.replace('/'); }
}, className: `flex items-center text-slate-400 hover:text-slate-600 transition-colors p-3 -ml-3 btn-tactile ${isFormLocked ? 'opacity-50 cursor-not-allowed' : ''}`, "aria-label": "Voltar", disabled: isFormLocked || isSubmitting }, 
 e("svg", { className: "w-6 h-6", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, e("polyline", {points: "15 18 9 12 15 6"}))
 ),
e("img", { src: CHECKOUT_LOGO_SRC, alt: "Monetizze", className: "object-contain", style: { height: '36px', width: 'auto', maxWidth: '176px', display: 'block', objectFit: 'contain' }, onError: (ev) => { try { const img = ev.target; if(!img.dataset.fallback){ img.dataset.fallback='1'; img.style.filter = 'none'; img.src = CHECKOUT_LOGO_FALLBACK_SRC; } } catch(e) {} } }),
 e("div", {className: "w-12"})
 ),
 e("div", { className: "max-w-[480px] mx-auto p-4 pt-6 space-y-4 " },
 e("div", { className: "space-y-4 " },
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
 e("form", { id: "checkout-form", ref: formRef, onSubmit: handleSubmit, className: "space-y-4 ", noValidate: true, "data-testid": "checkout-form" },
 e("button", { type: "submit", style: { display: 'none' } }), 
 e("div", { className: "bg-white rounded-2xl shadow-[0_2px_15px_rgb(0,0,0,0.03)] border border-slate-100 overflow-hidden" },
 e("div", { className: "bg-slate-50/50 px-5 py-3 border-b border-slate-100 flex items-center gap-3" }, e("span", { className: "text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-md", style: CHECKOUT_STEP_CIRCLE_STYLE }, "1"), e("h3", { className: "text-sm font-bold text-slate-700 uppercase tracking-wide" }, "Dados Pessoais")),
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
e("span", {className: "text-[9px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200 normal-case"}, "Opcional")
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
 e("div", { className: "bg-slate-50/50 px-5 py-3 border-b border-slate-100 flex items-center gap-3" }, e("span", { className: "text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-md", style: CHECKOUT_STEP_CIRCLE_STYLE }, "2"), e("h3", { className: "text-sm font-bold text-slate-700 uppercase tracking-wide" }, "Entrega")),
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
 cepFailed && e("div", { className: "bg-amber-50 border border-amber-100 text-amber-800 text-xs font-semibold rounded-xl p-3" }, "A busca automática demorou. Você pode preencher o endereço abaixo para continuar.") ,
 shouldShowAddressFields && e("div", { className: "grid grid-cols-4 gap-3 animate-fade-in" },
e("div", {className: "col-span-4"}, e("label", { className: "text-[10px] font-bold text-gray-400 uppercase pl-1 mb-1 block" }, "Endereço"), e("input", { name: "address", value: formData.address, onChange: handleChange, className: "w-full p-3.5 bg-white border border-slate-200 rounded-xl text-slate-600 text-base font-medium focus:border-green-500 outline-none", style: CHECKOUT_ADDRESS_INPUT_STYLE, placeholder: "Rua, Avenida...", disabled: isFormLocked || isSubmitting, autoComplete: "street-address", autoCorrect: "off", spellCheck: "false" })),
e("div", {className: "col-span-1"}, e("label", { className: "text-[10px] font-bold text-gray-400 uppercase pl-1 mb-1 block" }, "Nº"), e("input", { ref: numberRef, name: "number", value: formData.number, onChange: handleChange, placeholder: "123", className: "w-full p-3.5 border border-green-300 bg-white ring-2 ring-green-500/10 rounded-xl focus:ring-green-500 focus:border-green-500 outline-none font-bold text-center", style: CHECKOUT_ADDRESS_INPUT_STYLE, inputMode: "numeric", disabled: isFormLocked || isSubmitting, autoComplete: "off" })),
e("div", {className: "col-span-3"}, e("label", { className: "text-[10px] font-bold text-gray-400 uppercase pl-1 mb-1 block" }, "Bairro"), e("input", { name: "neighborhood", value: formData.neighborhood, onChange: handleChange, className: "w-full p-3.5 bg-white border border-slate-200 rounded-xl text-slate-600 text-base font-medium focus:border-green-500 outline-none", style: CHECKOUT_ADDRESS_INPUT_STYLE, placeholder: "Bairro", disabled: isFormLocked || isSubmitting, autoComplete: "address-level3", autoCorrect: "off", spellCheck: "false" })),
e("div", {className: "col-span-2"}, e("label", { className: "text-[10px] font-bold text-gray-400 uppercase pl-1 mb-1 block" }, "Complemento"), e("input", { name: "complement", value: formData.complement, onChange: handleChange, className: "w-full p-3.5 bg-white border border-slate-200 rounded-xl text-slate-600 text-base font-medium focus:border-green-500 outline-none", style: CHECKOUT_ADDRESS_INPUT_STYLE, placeholder: "", disabled: isFormLocked || isSubmitting, autoComplete: "address-line2", autoCorrect: "off", spellCheck: "false" })),
e("div", {className: "col-span-2"}, e("label", { className: "text-[10px] font-bold text-gray-400 uppercase pl-1 mb-1 block" }, "Cidade"), e("input", { name: "city", value: formData.city, onChange: handleChange, className: "w-full p-3.5 bg-white border border-slate-200 rounded-xl text-slate-600 text-base font-medium focus:border-green-500 outline-none", style: CHECKOUT_ADDRESS_INPUT_STYLE, placeholder: "Cidade/UF", disabled: isFormLocked || isSubmitting, autoComplete: "address-level2", autoCorrect: "off", spellCheck: "false" }))
 )
 )
 ),
 e("div", { className: "bg-white rounded-2xl shadow-[0_2px_15px_rgb(0,0,0,0.03)] border border-slate-100 overflow-hidden" },
 e("div", { className: "bg-slate-50/50 px-5 py-3 border-b border-slate-100 flex items-center gap-3" }, e("span", { className: "text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-md", style: CHECKOUT_STEP_CIRCLE_STYLE }, "3"), e("h3", { className: "text-sm font-bold text-slate-700 uppercase tracking-wide" }, "Pagamento")),
 e("div", {className: "p-5"},
 e("div", { className: "bg-green-50/50 border-2 border-green-500 rounded-xl p-4 relative flex items-center gap-4 cursor-pointer hover:bg-green-50 transition-colors shadow-sm ring-4 ring-green-500/5" },
 e("div", { className: "absolute -top-3 right-4 bg-gradient-to-r from-green-600 to-green-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase shadow-md tracking-wide" }, "Aprovação Imediata"),
 e("div", { className: "w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-md flex-shrink-0 text-white" }, e(Icons.Check, {className: "w-4 h-4"})),
 e("div", {className: "flex-1 py-1"}, e("div", { className: "font-bold text-slate-800 text-sm flex items-center gap-1.5" }, "PIX"), e("div", { className: "text-green-700 font-extrabold text-xl mt-0.5 tracking-tight" }, "R$ " + PRODUCT_INFO.price.toFixed(2).replace('.',',')))
 ),
 e("button", { ref: submitButtonRef, disabled: loading || isFormLocked || isSubmitting, type: "submit", className: `w-full mt-6 bg-gradient-to-r from-green-600 to-green-700 text-white font-bold py-4 rounded-xl text-lg transition-all active:scale-[0.98] flex justify-center items-center gap-2 shadow-xl shadow-green-500/30 ${loading || isFormLocked || isSubmitting ? 'opacity-80 grayscale cursor-not-allowed' : 'hover:shadow-green-500/50 hover:-translate-y-0.5'} btn-tactile min-h-[56px]`, "aria-busy": loading },
loading ? e("span", {className: "flex items-center gap-2"}, e("div", { className: "spinner-mobile" }), "Processando...") : e("span", {className: "flex items-center gap-2"}, "CONFIRMAR A COMPRA")
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
const [keyboardClosed, setKeyboardClosed] = useState(false);
const [showQrCode, setShowQrCode] = useState(false);
const [shippingRange, setShippingRange] = useState({ min: 4, max: 7 });
const [copyPulseActive, setCopyPulseActive] = useState(false);
const [copyConfirmed, setCopyConfirmed] = useState(false);
const copyPulseTimeoutRef = useRef(null);
const copyResetTimeoutRef = useRef(null);

const activeData = customerData || {};
const firstName = activeData.firstName || 'Cliente';
const transactionId = activeData.transactionId || 'ERR_NO_ID';

const effectivePixCode = (pixCode && String(pixCode).trim()) ? String(pixCode).trim() : DEFAULT_CODIGO_PIX_COPIA_COLA;
let effectiveQrUrl = (typeof qrCodeUrl === 'string' && qrCodeUrl.trim()) ? qrCodeUrl.trim() : DEFAULT_URL_IMAGEM_QRCODE;

try {
if (effectiveQrUrl && typeof effectiveQrUrl === 'string') {
const isHttp = /^https?:\/\//i.test(effectiveQrUrl);
if (!isHttp && !effectiveQrUrl.startsWith('/')) {
effectiveQrUrl = '/' + String(effectiveQrUrl).replace(/^\/+/, '');
}
}
} catch(e) {}

const generatedQrUrl = useMemo(() => {
return 'https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=0&data=' + encodeURIComponent(effectivePixCode);
}, [effectivePixCode]);

const [qrImageSrc, setQrImageSrc] = useState(generatedQrUrl);

useEffect(() => {
setQrImageSrc(generatedQrUrl);
}, [generatedQrUrl]);

useEffect(() => {
return () => {
if (copyPulseTimeoutRef.current) clearTimeout(copyPulseTimeoutRef.current);
if (copyResetTimeoutRef.current) clearTimeout(copyResetTimeoutRef.current);
};
}, []);

useEffect(() => {
let cancelled = false;
const fallback = { min: 4, max: 7 };
const cep = String(activeData.cep || '').replace(/\D/g, '');

if (cep.length !== 8) {
setShippingRange(fallback);
return () => {};
}

const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000);

(async () => {
try {
const res = await fetch(`/api/cep?cep=${cep}`, { cache: 'force-cache', signal: controller.signal });
if (!res || !res.ok) throw new Error('cep_http_' + (res && res.status));
const data = await res.json();
if (!data || data.erro || data.ok === false) throw new Error('cep_invalid');
const uf = data.state || data.uf || (data.city && String(data.city).includes('/') ? String(data.city).split('/').pop() : '');
const range = getFreightRangeByUf(uf || '');
if (!cancelled) setShippingRange(range);
} catch(e) {
if (!cancelled) setShippingRange(fallback);
} finally {
clearTimeout(timeoutId);
}
})();

return () => {
cancelled = true;
clearTimeout(timeoutId);
try { controller.abort(); } catch(e) {}
};
}, [activeData.cep]);

useEffect(() => {
if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
scrollCheckoutViewportToTop('auto');
requestAnimationFrame(() => { scrollCheckoutViewportToTop('auto'); });

const step1 = setTimeout(() => setLoadingState(1), 500);
const step2 = setTimeout(() => setLoadingState(2), 1200);
const step3 = setTimeout(() => { setLoadingState(3); setKeyboardClosed(true); }, 2000);

return () => { clearTimeout(step1); clearTimeout(step2); clearTimeout(step3); };
}, [transactionId]);

useEffect(() => {
if (loadingState < 3 || !keyboardClosed) return;
const rafId = requestAnimationFrame(() => {
if (typeof window.trackCheckoutGAOnly === 'function') {
window.trackCheckoutGAOnly('pix__Visible', {
checkout_visible_source: window.__checkoutEntrySource || 'unknown',
order_id: transactionId,
transaction_id: transactionId,
value: PRODUCT_INFO.price,
currency: 'BRL'
});
}
});
return () => { try { cancelAnimationFrame(rafId); } catch(e) {} };
}, [loadingState, keyboardClosed, transactionId]);

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
try { window.prompt('Copie o c\u00f3digo PIX abaixo:', effectivePixCode); } catch(_) {}
}
}
trackEvent('Pix_Copy_Click', { event_id: window.generateEventId(), order_id: transactionId });
if (!isLabMode()) {
try {
const payload = JSON.stringify({ ts: Date.now(), order_id: transactionId });
if (navigator.sendBeacon) { navigator.sendBeacon('/api/metrics/pix-copy', payload); }
else { fetch('/api/metrics/pix-copy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true }).catch(() => {}); }
} catch (e) {}
}
};

const triggerCopyFeedback = () => {
if (copyPulseTimeoutRef.current) clearTimeout(copyPulseTimeoutRef.current);
if (copyResetTimeoutRef.current) clearTimeout(copyResetTimeoutRef.current);
setCopyPulseActive(true);
setCopyConfirmed(true);
copyPulseTimeoutRef.current = setTimeout(() => {
setCopyPulseActive(false);
}, 420);
copyResetTimeoutRef.current = setTimeout(() => {
setCopyConfirmed(false);
}, 1800);
};

const copyPixText = () => {
triggerCopyFeedback();
Promise.resolve(doCopy()).catch(() => {});
};

const copyPixBtn = () => {
triggerCopyFeedback();
trackEvent('ClickButton', { button_name: 'copy_pix_code', content_name: 'Copia PIX' });
Promise.resolve(doCopy()).catch(() => {});
};

const toggleQrCode = () => {
setShowQrCode(prev => {
const next = !prev;
if (next) trackEvent('ClickButton', { button_name: 'show_qr_code', content_name: 'Abrir QR Code' });
return next;
});
};

const loadingTitle = loadingState === 0 ? "Iniciando transação segura..." : loadingState === 1 ? "Reservando estoque..." : "Preparando pagamento PIX...";
const isPixLoading = loadingState < 3;
return e(React.Fragment, null,
e("style", null, PIX_COPY_BUTTON_PULSE_CSS),
e("div", { className: `min-h-screen bg-[#f8fafc] font-sans pb-10 safe-area-padding transition-opacity duration-300 ${!isPixLoading && keyboardClosed ? 'opacity-100' : 'opacity-0'}` },
e("div", { className: "static-nav bg-white/98 border-b border-gray-200 flex justify-between items-center z-30 shadow-[0_2px_8px_rgba(0,0,0,0.04)]", style: { minHeight: '80px', padding: '16px', boxSizing: 'border-box' } },
e("div", {className: "w-12", style: { width: '48px', height: '48px', flexShrink: 0 }}),
e("img", { src: CHECKOUT_LOGO_SRC, alt: "Monetizze", className: "object-contain", style: { height: '36px', width: 'auto', maxWidth: '176px', display: 'block', objectFit: 'contain' }, onError: (ev) => { try { const img = ev.target; if(!img.dataset.fallback){ img.dataset.fallback='1'; img.style.filter = 'none'; img.src = CHECKOUT_LOGO_FALLBACK_SRC; } } catch(e) {} } }),
e("div", {className: "w-12", style: { width: '48px', height: '48px', flexShrink: 0 }})
),
e("div", {className: "max-w-[480px] mx-auto px-4 pt-5"},
e("div", {className: "text-center mb-5"},
e("h1", {className: "text-lg font-extrabold text-slate-800 mb-0.5"}, "Quase l\u00e1, " + firstName + "!"),
e("p", {className: "text-xs text-slate-400"}, "Copie o c\u00f3digo abaixo e conclua no app do seu banco.")
),
e("div", {className: "bg-white rounded-xl border border-slate-100 p-4 mb-3"},
e("div", {className: "flex items-center gap-2.5 mb-3"},
e("div", {className: "w-7 h-7 flex-shrink-0 flex items-center justify-center", dangerouslySetInnerHTML: {__html: '<svg viewBox="0 0 32 32" width="28" height="28"><g transform="translate(16,16) rotate(45)"><rect x="-11" y="-11" width="10" height="10" rx="2" fill="#32BCAD"/><rect x="1" y="-11" width="10" height="10" rx="2" fill="#32BCAD"/><rect x="-11" y="1" width="10" height="10" rx="2" fill="#32BCAD"/><rect x="1" y="1" width="10" height="10" rx="2" fill="#2D9F93"/></g></svg>'}}),
e("div", null,
e("p", {className: "font-bold text-slate-800 text-sm leading-tight"}, "Pix Copia e Cola"),
e("p", {className: "text-[11px] text-slate-400"}, "Copie o código abaixo")
)
),
e("div", {onClick: copyPixText, className: "bg-slate-50 border border-slate-100 rounded-lg p-3 mb-3 cursor-pointer active:bg-slate-100 transition-colors"},
e("p", {
className: "text-[11px] text-slate-500 font-mono leading-relaxed",
title: effectivePixCode,
style: {
display: '-webkit-box',
WebkitLineClamp: 3,
WebkitBoxOrient: 'vertical',
overflow: 'hidden',
wordBreak: 'break-all',
maxHeight: '4.4em',
userSelect: 'none'
}
}, effectivePixCode)
),
e("button", {
onClick: copyPixBtn,
className: `w-full py-3.5 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] min-h-[48px] pix-copy-subtle-pulse ${copyConfirmed ? 'bg-green-600 pix-copy-confirmed' : 'bg-green-500 hover:bg-green-600'} btn-tactile`,
style: {
transform: copyPulseActive ? 'scale(1.012)' : undefined,
boxShadow: '0 10px 24px rgba(34, 197, 94, 0.18)',
transition: 'transform 180ms ease, opacity 180ms ease, background-color 180ms ease'
}
},
e(React.Fragment, null,
copyConfirmed ? e(Icons.Check, {className: "w-4 h-4"}) : e(Icons.Copy, {className: "w-4 h-4"}),
copyConfirmed ? "Código copiado" : "Copiar código PIX"
)
),
e("div", {className: "flex justify-between items-center mt-3 pt-3 border-t border-slate-100"},
e("span", {className: "text-sm text-slate-400"}, "Valor Total:"),
e("span", {className: "text-lg font-extrabold text-slate-800"}, "R$ " + PRODUCT_INFO.price.toFixed(2).replace('.',','))
)
),
e("div", {className: "bg-white rounded-xl border border-slate-200 p-3 mb-3"},
e("div", {className: "flex items-center gap-1.5 mb-2.5"},
e("div", {className: "w-4.5 h-4.5 text-slate-500"}, e(Icons.Package, {className: "w-4 h-4 text-slate-500"})),
e("h3", {className: "text-sm font-semibold text-slate-800 leading-none"}, "Meu pedido")
),
e("div", {className: "bg-slate-50/60 rounded-lg border border-slate-200 p-3"},
e("div", {className: "flex items-center gap-2.5"},
e("div", {className: "w-12 h-12 bg-white rounded-md border border-slate-200 p-1.5 flex-shrink-0"},
e("img", { src: PRODUCT_INFO.image, alt: PRODUCT_INFO.name, className: "w-full h-full object-contain", loading: "lazy", decoding: "async", onError: (ev) => { try { const img = ev.target; if(!img.dataset.fallback){ img.dataset.fallback='1'; img.src = "/" + String(PRODUCT_INFO.image || '').replace(/^\/+/, ''); } } catch(e) {} } })
),
e("div", {className: "flex-1 min-w-0"},
e("p", {className: "text-[15px] font-medium text-slate-800 leading-snug line-clamp-2"}, PRODUCT_INFO.name),
e("div", {className: "flex items-center gap-2 mt-1.5"},
e("span", {className: "text-[13px] text-slate-500"}, "Qtd: 1"),
e("span", {className: "text-[13px] font-semibold text-rose-500"}, "R$ " + PRODUCT_INFO.price.toFixed(2).replace('.',','))
)
)
),
e("div", {className: "mt-2.5 pt-2.5 border-t border-slate-200/70 flex items-center justify-between gap-2"},
e("div", {className: "flex items-start gap-2"},
e("div", {className: "text-slate-400 mt-0.5"}, e(Icons.Truck, {className: "w-4 h-4 text-slate-400"})),
e("div", null,
e("p", {className: "text-[11px] text-slate-500 leading-tight"}, "Entrega estimada"),
e("p", {className: "text-sm font-semibold text-slate-800 leading-tight"}, "Entrega de " + shippingRange.min + " a " + shippingRange.max + " dias")
)
),
e("span", {className: "text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 rounded-md px-2.5 py-1 whitespace-nowrap"}, "GRATIS")
)
)
),
e("div", {className: "bg-white rounded-xl border border-slate-100 p-4 mb-3"},
e("button", { type: "button", onClick: toggleQrCode, className: "w-full flex items-center justify-between text-left" },
e("span", {className: "font-bold text-slate-800 text-sm"}, "Prefere pagar com QR Code?"),
e("svg", {className: `w-5 h-5 text-slate-500 transition-transform ${showQrCode ? 'rotate-180' : ''}`, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round"}, e("polyline", {points: "6 9 12 15 18 9"}))
),
showQrCode && e("div", {className: "mt-4 pt-4 border-t border-slate-100"},
e("div", {className: "mx-auto w-[190px] bg-white rounded-2xl border border-slate-200 p-2.5 shadow-sm"},
e("img", { src: qrImageSrc, alt: "QR Code PIX", className: "w-full h-full object-contain", loading: "lazy", decoding: "async", onError: (ev) => { try { const img = ev.target; if (img.dataset.fallback === '1') return; img.dataset.fallback = '1'; if (effectiveQrUrl) img.src = effectiveQrUrl; } catch(e) {} } })
),
e("p", {className: "text-center text-[12px] text-slate-500 mt-3"}, "Aponte a câmera do app do banco")
)
),
e("div", {className: "bg-white rounded-xl border border-slate-100 p-4 mb-3"},
e("h3", {className: "font-bold text-slate-800 text-sm mb-4"}, "Como pagar"),
[
{title: "Copie o código", desc: "Clique no botão acima para copiar o código PIX."},
{title: "Abra o app do banco", desc: "Acesse o aplicativo do seu banco ou fintech."},
{title: "Pix Copia e Cola", desc: "Escolha a opção PIX e cole o código copiado."},
{title: "Confirme o pagamento", desc: "Revise os dados e confirme. A aprovação é automática."}
].map((step, idx) => e("div", {key: idx, className: "flex gap-3 mb-4 last:mb-0"},
e("div", {className: "w-7 h-7 rounded-full text-white flex items-center justify-center flex-shrink-0 font-bold text-xs", style: CHECKOUT_STEP_CIRCLE_STYLE}, idx + 1),
e("div", null,
e("p", {className: "font-bold text-slate-800 text-sm leading-tight"}, step.title),
e("p", {className: "text-[11px] text-slate-400 mt-0.5"}, step.desc)
)
))
),
e("p", {className: "text-center text-[11px] text-slate-300 font-mono mt-3"}, "ID: " + transactionId)
)
),
isPixLoading && e("div", {
className: "bg-slate-50 flex flex-col items-center justify-center text-center font-sans safe-area-padding",
style: {
position: 'fixed',
top: 0,
left: '50%',
transform: 'translateX(-50%)',
width: '100%',
maxWidth: '480px',
height: '100dvh',
minHeight: '100vh',
zIndex: 60
}
},
e("div", { className: "relative w-24 h-24", style: { marginBottom: '48px' } },
e("div", {
style: {
position: 'absolute',
inset: '-8px',
borderRadius: '999px',
background: 'radial-gradient(circle, rgba(34,197,94,0.10) 0%, rgba(34,197,94,0.04) 46%, rgba(255,255,255,0) 74%)',
animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
}
}),
e("div", {
style: {
position: 'absolute',
inset: '0',
borderRadius: '999px',
border: '6px solid #e2e8f0'
}
}),
e("div", {
style: {
position: 'absolute',
inset: '0',
borderRadius: '999px',
border: '6px solid transparent',
borderTopColor: '#22c55e',
borderRightColor: '#86efac',
animation: 'spin 0.9s linear infinite'
}
}),
e("div", {
style: {
position: 'absolute',
inset: '18px',
borderRadius: '999px',
background: '#ffffff'
}
})
),
e("div", { className: "w-full max-w-[360px] px-5" },
e("h2", { className: "text-[21px] font-extrabold text-slate-800 tracking-tight leading-tight text-center whitespace-nowrap" }, loadingTitle),
e("p", { className: "mt-4 text-[13px] text-slate-500 leading-[1.6] text-center max-w-[248px] mx-auto" }, "Estamos preparando a etapa de pagamento. Por favor, não feche esta página.")
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

 
 return screen === 'checkout' ? e(CheckoutScreen, { onSuccess: (data) => { setCustomerData(data); scrollCheckoutViewportToTop('auto'); setScreen('pix'); } }) : e(PixScreen, { customerData: customerData, pixCode: pixConfig.pixCode, qrCodeUrl: pixConfig.qrCodeUrl });
 }
 
 const rootElement = document.getElementById('checkout-root');
 if (rootElement) {
 // ⭐️ CORRE�?�fO 5: Evita race condition se o script for executado duas vezes
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
