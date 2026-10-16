// Mapa interactivo del estudio (solo navegador). Lo importa de forma diferida
// components/sections/StudioMap.astro cuando el mapa entra en pantalla, así
// MapLibre (~280 KB comprimido) nunca va en el JavaScript principal.
//
//  - Librería: MapLibre GL JS (BSD-3), teselas vectoriales de OpenFreeMap
//    (gratis, sin clave ni cookies; datos © OpenStreetMap). Atribución
//    siempre visible (obligatoria).
//  - Aspecto: se parte de «positron» y se recolorea con los tokens del estilo
//    visual de la web (styles/presets.css): fondo de la página como tierra,
//    agua con un toque del color principal, calles neutras, rótulos en el
//    texto secundario. Sin transporte, aeropuertos, fronteras ni escudos de
//    carretera. En los estilos oscuros (energy, neon) sale oscuro solo.
//  - Gestos «cooperativos»: con un dedo (o la rueda) se mueve la PÁGINA; para
//    mover el mapa, dos dedos (o Ctrl/⌘ + rueda). Teclado: flechas y +/-.
//  - prefers-reduced-motion: sin animaciones (MapLibre las salta y aquí se
//    quitan la inercia y los fundidos).
//  - Sin WebGL2 (o si algo falla) se queda la tarjeta estática del servidor
//    con la dirección y los botones «Cómo llegar».
//
// Ojo: no importar aquí lib/site.ts ni lib/map.ts (arrastrarían la config y
// las paletas al chunk del mapa). El servidor pasa todo en data-* del mapa.

type RGB = [number, number, number];

/** ¿Puede este navegador pintar el mapa? (MapLibre 6 necesita WebGL2) */
export function canRenderMap(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

// ── Colores del estilo visual ────────────────────────────────────────────────
// Los tokens son mezclas (color-mix, var()…) que MapLibre no entiende: se
// resuelven pintándolos sobre blanco en un lienzo de 1×1 y leyendo el píxel.
function resolver() {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const read = (token: string, fallback: RGB): RGB => {
    probe.style.color = '';
    probe.style.color = `var(${token})`;
    const css = getComputedStyle(probe).color;
    if (!ctx || !css) return fallback;
    ctx.globalCompositeOperation = 'copy';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1, 1);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  };
  return { read, done: () => probe.remove() };
}

const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => Math.round(v * t + b[i] * (1 - t))) as RGB;
const hex = (c: RGB) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const luminance = ([r, g, b]: RGB) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

export interface MapPalette {
  dark: boolean;
  land: string; water: string; park: string; building: string;
  road: string; roadMinor: string; casing: string; label: string; halo: string;
}

export function studioPalette(): MapPalette {
  const { read, done } = resolver();
  const page = read('--page-bg', [250, 247, 242]);
  const ink = read('--page-text', [34, 34, 34]);
  const muted = read('--text-muted', [110, 110, 110]);
  const primary = read('--accent', [180, 120, 90]);
  const secondary = read('--brand-secondary', [140, 150, 130]);
  done();
  const dark = getComputedStyle(document.documentElement).colorScheme.includes('dark') || luminance(page) < 0.4;
  const white: RGB = [255, 255, 255];
  const black: RGB = [0, 0, 0];
  const land = mix(ink, page, dark ? 0.04 : 0.035);
  return dark
    ? {
        dark,
        land: hex(land),
        water: hex(mix(primary, land, 0.2)),
        park: hex(mix(secondary, land, 0.1)),
        building: hex(mix(white, land, 0.05)),
        road: hex(mix(white, land, 0.16)),
        roadMinor: hex(mix(white, land, 0.09)),
        casing: hex(mix(black, land, 0.25)),
        label: hex(mix(muted, land, 0.85)),
        halo: hex(land),
      }
    : {
        dark,
        land: hex(land),
        water: hex(mix(primary, land, 0.2)),
        park: hex(mix(secondary, land, 0.12)),
        building: hex(mix(ink, land, 0.06)),
        road: hex(mix(white, land, 0.92)),
        roadMinor: hex(mix(white, land, 0.7)),
        casing: hex(mix(ink, land, 0.1)),
        label: hex(mix(muted, land, 0.9)),
        halo: hex(land),
      };
}

// ── Estilo: positron recoloreado ─────────────────────────────────────────────
type Layer = { id: string; type: string; paint?: Record<string, unknown>; layout?: Record<string, unknown> };
type Style = { layers: Layer[]; [k: string]: unknown };

/** Capas que sobran en un mapa de «cómo llegar» (ruido visual). */
const HIDDEN = /^(railway|aeroway|airport|boundary|highway-shield|road_shield|label_country|label_state|tunnel_)/;

/** Aplica la paleta del estudio a las capas de «positron» (exportado para tests visuales). */
export function recolorStyle(style: Style, p: MapPalette): Style {
  const layers: Layer[] = [];
  for (const layer of style.layers) {
    if (HIDDEN.test(layer.id) || layer.type === 'raster') continue;
    const paint = { ...(layer.paint || {}) };
    const layout = { ...(layer.layout || {}) };
    const id = layer.id;
    // Rótulos con el nombre LOCAL (el de las placas de la calle), no el inglés
    if (JSON.stringify(layout['text-field'] || '').includes('name_en')) {
      layout['text-field'] = ['coalesce', ['get', 'name'], ['get', 'name:latin'], ['get', 'name_en']];
    }
    if (layer.type === 'background') paint['background-color'] = p.land;
    else if (layer.type === 'fill') {
      if (id === 'water') paint['fill-color'] = p.water;
      else if (id === 'park' || id === 'landcover_wood') paint['fill-color'] = p.park;
      else if (id === 'building') {
        paint['fill-color'] = p.building;
        paint['fill-outline-color'] = p.building;
      } else if (id.startsWith('landuse') || id.startsWith('landcover')) {
        paint['fill-color'] = p.land;
      } else paint['fill-color'] = p.roadMinor;
    } else if (layer.type === 'line') {
      if (id === 'waterway') paint['line-color'] = p.water;
      else if (id.endsWith('_casing')) paint['line-color'] = p.casing;
      else if (/minor|path|pier/.test(id)) paint['line-color'] = p.roadMinor;
      else paint['line-color'] = p.road;
    } else if (layer.type === 'symbol') {
      paint['text-color'] = p.label;
      paint['text-halo-color'] = p.halo;
      paint['text-halo-width'] = 1.4;
      delete paint['text-halo-blur'];
    }
    layers.push({ ...layer, paint, layout });
  }
  return { ...style, layers };
}

// ── Montaje ──────────────────────────────────────────────────────────────────
const UI = {
  es: {
    'Map.Title': 'Mapa',
    'Marker.Title': 'Ubicación',
    'NavigationControl.ZoomIn': 'Acercar',
    'NavigationControl.ZoomOut': 'Alejar',
    'NavigationControl.ResetBearing': 'Orientar al norte',
    'AttributionControl.ToggleAttribution': 'Mostrar u ocultar la atribución',
    'AttributionControl.MapFeedback': 'Sugerir una corrección del mapa',
    'CooperativeGesturesHandler.WindowsHelpText': 'Usa Ctrl + rueda para acercar el mapa',
    'CooperativeGesturesHandler.MacHelpText': 'Usa ⌘ + rueda para acercar el mapa',
    'CooperativeGesturesHandler.MobileHelpText': 'Usa dos dedos para mover el mapa',
  },
  en: {
    'Map.Title': 'Map',
    'Marker.Title': 'Location',
    'NavigationControl.ZoomIn': 'Zoom in',
    'NavigationControl.ZoomOut': 'Zoom out',
    'NavigationControl.ResetBearing': 'Reset north',
    'AttributionControl.ToggleAttribution': 'Toggle attribution',
    'AttributionControl.MapFeedback': 'Suggest a map fix',
    'CooperativeGesturesHandler.WindowsHelpText': 'Use Ctrl + scroll to zoom the map',
    'CooperativeGesturesHandler.MacHelpText': 'Use ⌘ + scroll to zoom the map',
    'CooperativeGesturesHandler.MobileHelpText': 'Use two fingers to move the map',
  },
} as const;

function fallback(root: HTMLElement) {
  root.classList.add('is-static');
  root.removeAttribute('aria-busy');
}

function loadCss(href: string): Promise<void> {
  if (document.querySelector(`link[data-maplibre-css]`)) return Promise.resolve();
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.maplibreCss = '';
    link.onload = () => resolve();
    link.onerror = () => resolve(); // sin estilos de los controles, pero con mapa
    document.head.appendChild(link);
  });
}

/** Monta el mapa en un `[data-sk-map]` de StudioMap.astro. */
export async function mountStudioMap(root: HTMLElement): Promise<void> {
  const lat = Number(root.dataset.lat);
  const lng = Number(root.dataset.lng);
  const canvasHost = root.querySelector<HTMLElement>('.sk-map-canvas');
  const styleUrl = root.dataset.styleUrl || '';
  if (!canvasHost || !styleUrl || !Number.isFinite(lat) || !Number.isFinite(lng) || !canRenderMap()) {
    return fallback(root);
  }
  const lang = root.dataset.lang === 'en' ? 'en' : 'es';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.setAttribute('aria-busy', 'true');
  try {
    // MapLibre 6 es ESM sin export por defecto: se usa el espacio de nombres
    const [maplibregl, { default: workerUrl }, styleJson] = await Promise.all([
      import('maplibre-gl'),
      import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
      fetch(styleUrl, { credentials: 'omit' }).then((r) => {
        if (!r.ok) throw new Error(`map style ${r.status}`);
        return r.json() as Promise<Style>;
      }),
      // CSS como archivo aparte (?url): así Astro no lo enlaza en el <head> de
      // todas las páginas; se añade aquí, solo cuando hay mapa
      import('maplibre-gl/dist/maplibre-gl.css?url').then(({ default: href }) => loadCss(href)),
    ]);
    maplibregl.setWorkerUrl(workerUrl);
    const palette = studioPalette();
    root.classList.toggle('is-dark', palette.dark);
    const map = new maplibregl.Map({
      container: canvasHost,
      style: recolorStyle(styleJson, palette) as never,
      center: [lng, lat],
      zoom: 15.4,
      minZoom: 4,
      maxZoom: 18.5,
      maxPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      cooperativeGestures: true,
      attributionControl: { compact: false },
      fadeDuration: reduced ? 0 : 200,
      reduceMotion: reduced || undefined,
      locale: {
        ...UI[lang],
        'Map.Title': root.dataset.name
          ? (lang === 'es' ? `Mapa de ${root.dataset.name}. Flechas para moverlo, + y - para acercar` : `Map of ${root.dataset.name}. Arrow keys to pan, + and - to zoom`)
          : UI[lang]['Map.Title'],
        'Marker.Title': root.dataset.name || UI[lang]['Marker.Title'],
      },
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    if (reduced) map.dragPan.enable({ maxSpeed: 0 });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    // Marcador: gota del color principal con la inicial del estudio
    const pin = document.createElement('div');
    pin.className = 'sk-map-pin';
    pin.innerHTML = '<span class="sk-map-drop"><span></span></span>';
    pin.querySelector('.sk-map-drop > span')!.textContent = root.dataset.initial || '';
    new maplibregl.Marker({ element: pin, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map);

    let ready = false;
    map.once('load', () => {
      ready = true;
      root.classList.add('is-ready');
      root.removeAttribute('aria-busy');
    });
    map.on('error', (e) => {
      // Una tesela que falla no rompe el mapa; si no llega a cargar, tarjeta estática
      if (!ready) console.warn('studio-map', e.error?.message || e);
    });
    window.setTimeout(() => { if (!ready) { map.remove(); fallback(root); } }, 20000);
  } catch (e) {
    console.warn('studio-map: sin mapa interactivo', e);
    fallback(root);
  }
}
