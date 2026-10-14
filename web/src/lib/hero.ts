// Portada (hero): qué se pinta de fondo según Ajustes → Portada del panel.
//
//  - 'image': la foto elegida (hero_image_url) o, si no hay, la primera de
//    Imágenes → Portada; sin ninguna, el degradado de la marca.
//  - 'video': el póster propio (miniatura guardada en el servidor) y, SOLO con
//    consentimiento («Vídeos» en el banner de cookies o el botón «Ver vídeo»),
//    el vídeo de YouTube en modo de privacidad mejorada, mudo y en bucle.
//  - 'illustration': la ilustración de lib/hero-art.ts con el estilo y los
//    colores de la web; el texto va al lado (escritorio) o debajo (móvil) con
//    la tinta de heroArtTheme() (contraste AA).
//
// Lo usan la réplica SSR (components/home/HomePage.astro) y la isla React
// (components/VideoComponent.tsx): las dos pintan el mismo HTML con las clases
// de HERO_CSS, así no hay salto al hidratar.
import { heroArtTheme, renderHeroArt, type HeroArtTheme } from './hero-art';
import { YOUTUBE_ID, type SiteConfig } from './site';

export interface HeroView {
  mode: 'image' | 'video' | 'illustration';
  /** Fondo CSS (foto, póster o degradado). '' en modo ilustración. */
  background: string;
  /** Imagen principal para precargar (LCP) o ''. */
  preload: string;
  videoId: string;
  /** SVG de la ilustración (modo 'illustration'). */
  art: string;
  /** Colores del texto sobre la ilustración (modo 'illustration'). */
  theme: HeroArtTheme | null;
}

const GRADIENT = 'linear-gradient(135deg, var(--brand-dark) 0%, var(--brand-secondary) 55%, var(--brand-primary) 100%)';
const cssUrl = (url: string) => `center / cover no-repeat url("${url.replace(/["\\\n]/g, '')}")`;

/**
 * Qué se pinta en la portada. `fallbackImage` = la primera foto de la sección
 * «Portada» de Imágenes (la que se usaba antes de poder elegir).
 */
export function heroView(site: SiteConfig, fallbackImage = ''): HeroView {
  const photo = site.hero_image_url || fallbackImage || '';
  if (site.hero_mode === 'illustration') {
    const colors = {
      primary: site.theme.primary, secondary: site.theme.secondary,
      dark: site.theme.dark, background: site.theme.background,
    };
    return {
      mode: 'illustration', background: '', preload: '', videoId: '',
      art: renderHeroArt({ pose: site.hero_illustration, style: site.theme.style, colors, idPrefix: 'hero' }),
      theme: heroArtTheme(site.theme.style, colors),
    };
  }
  if (site.hero_mode === 'video' && YOUTUBE_ID.test(site.hero_video_id)) {
    const poster = site.hero_video_poster_url || photo;
    return {
      mode: 'video', background: poster ? cssUrl(poster) : GRADIENT, preload: poster,
      videoId: site.hero_video_id, art: '', theme: null,
    };
  }
  return { mode: 'image', background: photo ? cssUrl(photo) : GRADIENT, preload: photo, videoId: '', art: '', theme: null };
}

/** iframe de YouTube sin cookies hasta reproducir, mudo, en bucle y sin controles. */
export function youtubeEmbedUrl(id: string): string {
  if (!YOUTUBE_ID.test(id)) return '';
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}`
    + '&controls=0&playsinline=1&rel=0&modestbranding=1';
}

/** Con «menos movimiento» o «ahorro de datos» el vídeo no arranca solo. */
export function prefersStillHero(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
  } catch { /* navegadores antiguos */ }
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !!conn?.saveData;
}

/** Variables CSS del modo ilustración (fondo y tinta) para el `style` del hero. */
export function heroArtVars(theme: HeroArtTheme | null): Record<string, string> {
  if (!theme) return {};
  return { '--hero-bg': theme.background, '--hero-ink': theme.ink, '--hero-muted': theme.muted };
}

export const HERO_LABELS = {
  es: { play: 'Ver vídeo', pause: 'Pausar vídeo', playHint: 'Se carga desde YouTube', video: 'Vídeo de presentación del estudio' },
  en: { play: 'Watch video', pause: 'Pause video', playHint: 'Loads from YouTube', video: 'Studio introduction video' },
} as const;

/**
 * CSS común del hero (va en línea en la portada). Las clases .hero-* las usan
 * igual el HTML del servidor y la isla React.
 */
export const HERO_CSS = `
.hero{position:relative;width:100%;height:100vh;overflow:hidden;font-family:var(--font-body);--hero-ink:#fff;--hero-muted:rgba(255,255,255,.92);--hero-shadow:0 2px 20px rgba(0,0,0,.3)}
.hero-media{position:absolute;inset:0;z-index:0}
.hero-overlay{position:absolute;inset:0;z-index:1;background:rgba(0,0,0,.5)}
.hero-content{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:0 24px;text-align:center}
.hero-video{position:absolute;top:50%;left:50%;width:max(100%,177.78vh);height:max(100%,56.25vw);transform:translate(-50%,-50%);border:0;pointer-events:none;opacity:0;transition:opacity .8s ease}
.hero-video.is-on{opacity:1}
.hero-play{position:absolute;z-index:3;left:24px;bottom:24px;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 18px;border-radius:999px;border:1.5px solid rgba(255,255,255,.6);background:rgba(0,0,0,.45);color:#fff;font:600 .95rem/1 var(--font-body);cursor:pointer}
.hero-play:hover{background:rgba(0,0,0,.62)}
.hero-play:focus-visible{outline:3px solid #fff;outline-offset:3px}
.hero-play small{font-weight:400;opacity:.85;font-size:.78rem}
@media (max-width:767px){.hero-play{bottom:96px;left:50%;transform:translateX(-50%);white-space:nowrap}.hero-play small{display:none}}
/* Ilustración: arte a la derecha (escritorio) o arriba (móvil), texto con tinta AA */
.hero--art{height:auto;min-height:100vh;background:var(--hero-bg);--hero-shadow:none}
.hero--art .hero-art{position:absolute;z-index:0;top:50%;right:max(2vw,(100vw - 1500px)/2);width:min(50vw,88vh);aspect-ratio:1;transform:translateY(-46%)}
.hero--art .hero-art svg{display:block;width:100%;height:100%}
.hero--art .hero-content{min-height:100vh;align-items:flex-start;text-align:left;padding:110px max(54vw,calc(50% + 40px)) 60px max(5vw,(100vw - 1500px)/2 + 24px)}
@media (max-width:899px){
  .hero--art .hero-art{position:relative;top:auto;right:auto;transform:none;width:min(92vw,46vh);margin:76px auto calc(min(92vw,46vh) * -.1)}
  .hero--art .hero-content{min-height:0;height:auto;align-items:center;text-align:center;padding:4px 20px 120px}
}
.hero-logo{width:280px;max-width:70vw;height:auto}
.hero--art .hero-logo{width:240px;max-width:60vw}
.hero-name{color:var(--hero-ink);font-family:var(--font-heading);font-size:clamp(3rem,9vw,4.5rem);line-height:1;letter-spacing:.02em;text-shadow:var(--hero-shadow)}
.hero--art .hero-name{font-size:clamp(2.6rem,6vw,4rem)}
.hero-title{color:var(--hero-ink);font-family:var(--font-heading);font-size:clamp(1.9rem,6vw,3.75rem);font-weight:700;line-height:1.1;letter-spacing:.02em;margin:0;text-shadow:var(--hero-shadow)}
.hero--art .hero-title{font-size:clamp(1.9rem,4.4vw,3.6rem)}
.hero-sub{color:var(--hero-muted);font-size:clamp(1rem,2.4vw,1.25rem);max-width:600px;margin:0;text-shadow:var(--hero-shadow)}
.hero--art .hero-sub{font-size:clamp(1rem,1.6vw,1.2rem);max-width:520px}
.hero-sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
/* Botones: relleno primario (va sobre foto u oscuro); en ilustración, contorno con la tinta */
.hero-cta{display:inline-flex;align-items:center;gap:8px;margin-top:8px;padding:0 40px;height:56px;border-radius:var(--radius-button);color:var(--on-primary);font-size:1.125rem;font-weight:700;text-decoration:none;text-transform:var(--button-text-transform);letter-spacing:var(--button-spacing);background:linear-gradient(135deg,var(--brand-primary),var(--brand-primary-2));border:1px solid rgba(255,255,255,.35);box-shadow:0 8px 30px color-mix(in srgb,var(--brand-primary) 45%,transparent);transition:transform .3s ease,box-shadow .3s ease}
.hero-cta:hover{transform:translateY(-2px);box-shadow:0 12px 40px color-mix(in srgb,var(--brand-primary) 55%,transparent)}
.hero--art .hero-cta{border-color:color-mix(in srgb,var(--hero-ink) 30%,transparent)}
.hero-row{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
.hero--art .hero-row{justify-content:flex-start}
@media (max-width:899px){.hero--art .hero-row{justify-content:center}}
.hero-ghost{display:inline-flex;align-items:center;height:40px;padding:0 24px;border-radius:var(--radius-button);color:var(--hero-ink);font-size:.875rem;font-weight:600;text-decoration:none;text-transform:var(--button-text-transform);letter-spacing:var(--button-spacing);background:rgba(255,255,255,.10);border:1.5px solid rgba(255,255,255,.55);transition:background .3s ease,border-color .3s ease}
.hero-ghost:hover{background:rgba(255,255,255,.18);border-color:#fff}
.hero--art .hero-ghost{background:transparent;border-color:color-mix(in srgb,var(--hero-ink) 55%,transparent)}
.hero--art .hero-ghost:hover{background:color-mix(in srgb,var(--hero-ink) 8%,transparent);border-color:var(--hero-ink)}
.hero a:focus-visible{outline:3px solid var(--hero-ink);outline-offset:3px}
`;
