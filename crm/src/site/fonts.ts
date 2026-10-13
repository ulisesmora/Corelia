// Carga en la página las fuentes de Google que ha elegido el estudio.

/** Nombre de fuente seguro para meterlo en CSS y en la URL de Google Fonts. */
export function cleanFontName(name: string | undefined | null, fallback: string): string {
  const clean = (name || '').replace(/[^A-Za-z0-9 -]/g, '').trim();
  return clean || fallback;
}

// Algunas fuentes no tienen todos los grosores y Google responde con error a
// la petición entera: se prueba con menos grosores y, al final, sin indicarlos.
const WEIGHT_STEPS = [':wght@300;400;500;600;700', ':wght@400;700', ''];

function fontUrl(family: string, step: number): string {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}${WEIGHT_STEPS[step]}&display=swap`;
}

function ensureFont(family: string, slot: 'heading' | 'body') {
  const id = `studio-font-${slot}`;
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (link && link.dataset.family === family) return;
  if (!link) {
    link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  const el = link;
  let step = 0;
  el.dataset.family = family;
  el.onerror = () => {
    if (el.dataset.family !== family || step >= WEIGHT_STEPS.length - 1) return;
    step += 1;
    el.href = fontUrl(family, step);
  };
  el.href = fontUrl(family, step);
}

let preconnected = false;
function preconnect() {
  if (preconnected) return;
  preconnected = true;
  for (const [href, cross] of [['https://fonts.googleapis.com', false], ['https://fonts.gstatic.com', true]] as const) {
    const l = document.createElement('link');
    l.rel = 'preconnect';
    l.href = href;
    if (cross) l.crossOrigin = '';
    document.head.appendChild(l);
  }
}

/** Inyecta (o cambia) los <link> de las fuentes de títulos y de texto. */
export function loadStudioFonts(heading: string, body: string): void {
  if (typeof document === 'undefined') return;
  preconnect();
  ensureFont(heading, 'heading');
  ensureFont(body, 'body');
}
