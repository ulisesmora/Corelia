// Banner de consentimiento de cookies (RGPD / LSSI / guía de la AEPD).
//
// Solo se carga si el estudio tiene algún ID de analítica o publicidad o un
// vídeo de YouTube en la portada (lo decide SiteHead.astro → CookieConsent.astro):
// sin nada de eso, ni banner ni scripts.
//
//  - «Aceptar» y «Rechazar» igual de visibles (mismo estilo, mismo tamaño) y
//    «Configurar» para elegir por categorías (Analítica / Publicidad / Vídeos).
//  - La elección se guarda en localStorage con versión y fecha (lib/tracking.ts).
//  - Cualquier elemento con `data-cookie-settings` (el enlace «Cookies» del pie
//    de página, el botón de la política de cookies) vuelve a abrirlo.
//  - Idioma: el de la página (<html lang>), y cambia si la usuaria cambia de idioma.
//  - Accesible: role="dialog", título y descripción enlazados, foco al abrirlo
//    desde un enlace (y vuelta al enlace al cerrarlo), Escape para cerrar.
//  - Aspecto: tokens y clases del estilo del estudio (styles/presets.css:
//    .sk-panel, .sk-btn, .sk-btn-ghost), así funciona en los 8 estilos.
//
// Además mide los clics en los enlaces de contacto del estudio (WhatsApp,
// teléfono, email) con track('contact'), que solo envía algo con consentimiento.
import {
  applyConsent, availableCategories, contactMethod, readConsent, saveConsent, track, trackingConfig,
} from './tracking';

type Lang = 'es' | 'en';

const TEXT = {
  es: {
    region: 'Aviso de cookies',
    title: 'Cookies',
    intro: 'Usamos cookies técnicas, necesarias para que la web funcione. Si nos dejas, también usaremos',
    analytics: 'cookies de analítica',
    ads: 'cookies de publicidad',
    and: 'y',
    videos: 'cookies de YouTube',
    analyticsWhy: 'para saber cómo se usa la web y mejorarla',
    adsWhy: 'para medir los resultados de nuestros anuncios',
    videosWhy: 'para ver el vídeo de la portada',
    outro: 'Puedes cambiar tu elección cuando quieras en «Cookies», al pie de la página.',
    policy: 'Política de cookies',
    accept: 'Aceptar',
    reject: 'Rechazar',
    settings: 'Configurar',
    save: 'Guardar selección',
    close: 'Cerrar',
    necessaryLabel: 'Necesarias',
    necessaryDesc: 'Tu sesión, el idioma, el carrito y esta elección. Siempre activas.',
    analyticsLabel: 'Analítica',
    adsLabel: 'Publicidad',
    analyticsDesc: 'Estadísticas de uso para mejorar la web',
    adsDesc: 'Medir los resultados de nuestros anuncios',
    videosLabel: 'Vídeos',
    videosDesc: 'Ver el vídeo de YouTube de la portada (YouTube guarda sus cookies)',
    saved: 'Preferencias de cookies guardadas',
    policyHref: '/cookies',
  },
  en: {
    region: 'Cookie notice',
    title: 'Cookies',
    intro: 'We use technical cookies that the website needs to work. With your permission, we will also use',
    analytics: 'analytics cookies',
    ads: 'advertising cookies',
    and: 'and',
    videos: 'YouTube cookies',
    analyticsWhy: 'to understand how the website is used and improve it',
    adsWhy: 'to measure the results of our ads',
    videosWhy: 'to watch the video on the home page',
    outro: 'You can change your choice at any time from "Cookies" at the bottom of the page.',
    policy: 'Cookie policy',
    accept: 'Accept',
    reject: 'Reject',
    settings: 'Settings',
    save: 'Save choices',
    close: 'Close',
    necessaryLabel: 'Necessary',
    necessaryDesc: 'Your session, language, cart and this choice. Always on.',
    analyticsLabel: 'Analytics',
    adsLabel: 'Advertising',
    analyticsDesc: 'Usage statistics to improve the website',
    adsDesc: 'Measure the results of our ads',
    videosLabel: 'Videos',
    videosDesc: 'Watch the YouTube video on the home page (YouTube sets its own cookies)',
    saved: 'Cookie preferences saved',
    policyHref: '/en/cookies',
  },
} as const;

const CSS = `
.skc{position:fixed;z-index:2147483000;left:0;right:0;bottom:0;display:flex;justify-content:center;
  padding:12px;padding-bottom:calc(12px + env(safe-area-inset-bottom,0px));pointer-events:none;
  font-family:var(--font-body);}
.skc[hidden]{display:none}
.skc-box{pointer-events:auto;box-sizing:border-box;width:100%;max-width:680px;max-height:calc(100vh - 24px);
  max-height:calc(100dvh - 24px);overflow:auto;padding:20px 20px 18px;line-height:1.5;font-size:.95rem;
  text-align:left;}
.skc-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 6px}
.skc-title{margin:0;font-family:var(--font-heading);font-size:1.2rem;line-height:1.2;color:inherit;
  font-weight:var(--heading-weight,600);text-transform:var(--heading-transform,none);letter-spacing:var(--heading-spacing,0)}
.skc-close{flex:none;width:40px;height:40px;display:inline-flex;align-items:center;justify-content:center;
  border-radius:var(--radius-button);background:transparent;color:inherit;border:1px solid var(--border-neutral);
  font:inherit;font-size:1.25rem;line-height:1;cursor:pointer}
.skc-desc{margin:0 0 14px;color:inherit;opacity:.92}
.skc-desc a{color:var(--accent-text);text-decoration:underline;text-underline-offset:2px;font-weight:600;
  font-family:inherit;text-transform:none;letter-spacing:normal}
.skc-prefs{margin:0 0 14px;padding:0;border:0;display:grid;gap:8px}
.skc-prefs[hidden]{display:none}
.skc-opt{display:flex;align-items:flex-start;gap:12px;padding:10px 12px;border-radius:var(--radius-input);
  border:1px solid var(--border-neutral);cursor:pointer}
.skc-opt input{flex:none;width:20px;height:20px;margin:2px 0 0;accent-color:var(--accent);cursor:pointer}
.skc-opt input:disabled{cursor:not-allowed}
.skc-opt strong{display:block;font-weight:700}
.skc-opt span{display:block;font-size:.85rem;opacity:.8}
.skc-actions{display:flex;flex-wrap:wrap;gap:8px}
.skc-actions button{flex:1 1 150px;min-height:46px;padding:10px 18px;font-family:var(--font-body);
  font-size:.95rem;cursor:pointer}
.skc-actions .skc-main{flex-basis:150px}
.skc button:focus-visible,.skc a:focus-visible,.skc input:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.skc-sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:480px){.skc{padding:8px;padding-bottom:calc(8px + env(safe-area-inset-bottom,0px))}
  .skc-box{padding:16px 16px 14px;font-size:.9rem}.skc-actions .skc-main{flex-basis:120px}
  .skc-actions .skc-cfg{flex-basis:100%}}
@media (prefers-reduced-motion:no-preference){.skc-box{animation:skc-in .25s ease-out}}
@keyframes skc-in{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}
`;

const pageLang = (): Lang => {
  if (location.pathname === '/en' || location.pathname.startsWith('/en/')) return 'en';
  return (document.documentElement.lang || '').toLowerCase().startsWith('en') ? 'en' : 'es';
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text != null) node.textContent = text;
  return node;
}

interface UI {
  root: HTMLDivElement;
  title: HTMLElement;
  desc: HTMLElement;
  prefs: HTMLElement;
  analytics: HTMLInputElement | null;
  ads: HTMLInputElement | null;
  videos: HTMLInputElement | null;
  accept: HTMLButtonElement;
  reject: HTMLButtonElement;
  third: HTMLButtonElement;
  close: HTMLButtonElement;
  status: HTMLElement;
}

let ui: UI | null = null;
let showingPrefs = false;
let returnFocus: HTMLElement | null = null;

function build(): UI {
  const cats = availableCategories();
  if (!document.getElementById('skc-style')) {
    const style = el('style', { id: 'skc-style' });
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  const root = el('div', { class: 'skc', id: 'sk-cookies', 'data-nosnippet': '' }) as HTMLDivElement;
  root.hidden = true;
  const box = el('div', {
    class: 'skc-box sk-panel', role: 'dialog', 'aria-modal': 'false',
    'aria-labelledby': 'skc-title', 'aria-describedby': 'skc-desc',
  });
  const head = el('div', { class: 'skc-head' });
  const title = el('h2', { class: 'skc-title', id: 'skc-title' });
  const close = el('button', { type: 'button', class: 'skc-close' }) as HTMLButtonElement;
  head.append(title, close);
  const desc = el('p', { class: 'skc-desc', id: 'skc-desc' });

  const prefs = el('fieldset', { class: 'skc-prefs' });
  prefs.hidden = true;
  const option = (key: 'necessary' | 'analytics' | 'ads' | 'videos') => {
    const label = el('label', { class: 'skc-opt' });
    const input = el('input', { type: 'checkbox', name: `skc-${key}` }) as HTMLInputElement;
    if (key === 'necessary') { input.checked = true; input.disabled = true; }
    const text = el('div');
    text.append(el('strong', { 'data-k': `${key}Label` }), el('span', { 'data-k': `${key}Desc` }));
    label.append(input, text);
    prefs.appendChild(label);
    return input;
  };
  option('necessary');
  const analytics = cats.analytics ? option('analytics') : null;
  const ads = cats.ads ? option('ads') : null;
  const videos = cats.videos ? option('videos') : null;

  const actions = el('div', { class: 'skc-actions' });
  // Rechazar y Aceptar: mismo estilo y tamaño (igual de visibles)
  const reject = el('button', { type: 'button', class: 'sk-btn skc-main', 'data-act': 'reject' }) as HTMLButtonElement;
  const accept = el('button', { type: 'button', class: 'sk-btn skc-main', 'data-act': 'accept' }) as HTMLButtonElement;
  const third = el('button', { type: 'button', class: 'sk-btn-ghost skc-cfg', 'data-act': 'third' }) as HTMLButtonElement;
  actions.append(reject, accept, third);
  const status = el('p', { class: 'skc-sr', role: 'status', 'aria-live': 'polite' });

  box.append(head, desc, prefs, actions);
  root.append(box);
  // Primero del <body>: es lo primero que alcanzan el tabulador y los lectores de pantalla
  document.body.prepend(root);
  document.body.appendChild(status);

  reject.addEventListener('click', () => choose(false, false, false));
  accept.addEventListener('click', () => choose(!!analytics, !!ads, !!videos));
  third.addEventListener('click', () => {
    if (!showingPrefs) {
      setPrefs(true);
      (analytics || ads || videos)?.focus();
    } else {
      choose(!!analytics?.checked, !!ads?.checked, !!videos?.checked);
    }
  });
  close.addEventListener('click', hide);
  root.addEventListener('keydown', (e) => {
    // Escape solo cierra si ya hay una elección guardada (la primera vez hay que elegir)
    if (e.key === 'Escape' && readConsent()) { e.preventDefault(); hide(); }
  });

  return { root, title, desc, prefs, analytics, ads, videos, accept, reject, third, close, status };
}

/** Pinta los textos en el idioma de la página. */
function render() {
  if (!ui) return;
  const t = TEXT[pageLang()];
  const cats = availableCategories();
  ui.root.setAttribute('aria-label', t.region);
  ui.title.textContent = t.title;
  // Descripción: «… también usaremos cookies de analítica (para …) y de publicidad (para …). …»
  ui.desc.textContent = '';
  const parts: string[] = [];
  if (cats.analytics) parts.push(`${t.analytics}, ${t.analyticsWhy}`);
  if (cats.ads) parts.push(`${t.ads}, ${t.adsWhy}`);
  if (cats.videos) parts.push(`${t.videos}, ${t.videosWhy}`);
  ui.desc.append(`${t.intro} ${parts.join(`, ${t.and} `)}. ${t.outro} `);
  const link = el('a', { href: t.policyHref }, t.policy);
  ui.desc.append(link);
  ui.prefs.querySelectorAll<HTMLElement>('[data-k]').forEach((n) => {
    const k = n.dataset.k as keyof typeof t;
    n.textContent = t[k] as string;
  });
  ui.accept.textContent = t.accept;
  ui.reject.textContent = t.reject;
  ui.third.textContent = showingPrefs ? t.save : t.settings;
  ui.close.setAttribute('aria-label', t.close);
  ui.close.textContent = '×';
  ui.close.hidden = !readConsent();
}

function setPrefs(on: boolean) {
  if (!ui) return;
  showingPrefs = on;
  ui.prefs.hidden = !on;
  const c = readConsent();
  if (ui.analytics) ui.analytics.checked = !!c?.analytics;
  if (ui.ads) ui.ads.checked = !!c?.ads;
  if (ui.videos) ui.videos.checked = !!c?.videos;
  render();
}

function show(opts: { prefs?: boolean; trigger?: HTMLElement | null } = {}) {
  if (!ui) ui = build();
  setPrefs(!!opts.prefs);
  ui.root.hidden = false;
  if (opts.trigger) {
    // Abierto por la usuaria: el foco va al panel y vuelve al enlace al cerrar
    returnFocus = opts.trigger;
    (ui.analytics || ui.ads || ui.videos || ui.reject).focus();
  }
}

function hide() {
  if (!ui) return;
  ui.root.hidden = true;
  setPrefs(false);
  const back = returnFocus;
  returnFocus = null;
  back?.focus?.();
}

function choose(analytics: boolean, ads: boolean, videos: boolean) {
  saveConsent(analytics, ads, videos);
  if (ui) ui.status.textContent = TEXT[pageLang()].saved;
  hide();
}

function onDocumentClick(e: MouseEvent) {
  const target = e.target as Element | null;
  const node = target?.closest?.('[data-cookie-settings], a[href]') as HTMLElement | null;
  if (!node) return;
  if (node.hasAttribute('data-cookie-settings')) {
    e.preventDefault();
    show({ prefs: true, trigger: node });
    return;
  }
  const method = contactMethod(node.getAttribute('href') || '');
  if (method) {
    // Email: solo el del estudio (no los enlaces mailto: a otras direcciones)
    const studioEmail = (window.__SITE__?.contact?.email || '').toLowerCase();
    if (method === 'email' && studioEmail) {
      const to = decodeURIComponent((node.getAttribute('href') || '').slice(7).split('?')[0]).toLowerCase();
      if (to !== studioEmail) return;
    }
    track('contact', { method });
  }
}

/** Arranque (una vez por página). */
export function initCookieConsent() {
  if (!trackingConfig() || (window as { __SKC__?: boolean }).__SKC__) return;
  (window as { __SKC__?: boolean }).__SKC__ = true;
  const stored = readConsent();
  if (stored) applyConsent(stored);
  else show();
  document.addEventListener('click', onDocumentClick, true);
  // La usuaria cambia de idioma (lang.store actualiza <html lang>): textos al día
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
}
