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
 *
 * Composición tranquila: texto a la izquierda (título, una línea y dos
 * botones) y la foto / vídeo / ilustración en una tarjeta a la derecha; en
 * móvil el texto primero y la imagen debajo, más baja. El texto va sobre el
 * fondo de la página (tokens del estilo), nunca encima de la foto.
 */
export const HERO_CSS = `
.hero{position:relative;font-family:var(--font-body);color:var(--page-text)}
.hero-in{max-width:var(--w-max,1160px);margin:0 auto;padding:clamp(28px,5vw,72px) var(--w-gutter,20px) clamp(40px,6vw,88px);display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:clamp(24px,5vw,72px);align-items:center;box-sizing:border-box}
.hero-content{display:flex;flex-direction:column;align-items:flex-start;gap:18px;min-width:0}
.hero-title{font-family:var(--font-heading);color:var(--heading-color);font-size:clamp(2.3rem,5.4vw,4.2rem);line-height:1.03;margin:0;text-wrap:balance;text-shadow:var(--heading-shadow)}
.hero-sub{color:var(--text-muted);font-size:clamp(1.02rem,1.5vw,1.2rem);line-height:1.55;max-width:46ch;margin:0}
.hero-row{display:flex;gap:12px;flex-wrap:wrap;margin-top:6px}
.hero-cta,.hero-ghost{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:54px;padding:0 28px;font-size:1.05rem;text-decoration:none;box-sizing:border-box;font-family:var(--font-body)}
.hero-media,.hero-art{position:relative;overflow:hidden;border-radius:var(--radius-card-lg);aspect-ratio:4/4.2;width:100%;box-shadow:var(--shadow-card);border:var(--border-width) solid var(--surface-border)}
.hero-art{background:var(--hero-bg,var(--accent-soft))}
.hero-art svg{display:block;width:100%;height:100%}
.hero-video{position:absolute;top:50%;left:50%;width:max(100%,177.78%);height:max(100%,56.25vw);transform:translate(-50%,-50%);border:0;pointer-events:none;opacity:0;transition:opacity .8s ease}
.hero-video.is-on{opacity:1}
.hero-play{position:absolute;z-index:3;left:16px;bottom:16px;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 18px;border-radius:999px;border:1.5px solid rgba(255,255,255,.6);background:rgba(0,0,0,.5);color:#fff;font:600 .95rem/1 var(--font-body);cursor:pointer}
.hero-play:hover{background:rgba(0,0,0,.66)}
.hero-play:focus-visible{outline:3px solid #fff;outline-offset:3px}
.hero-play small{font-weight:400;opacity:.85;font-size:.78rem}
.hero-sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:859px){
  .hero-in{grid-template-columns:1fr;gap:28px;padding-top:28px}
  .hero-media,.hero-art{aspect-ratio:16/11;max-height:46vh}
  .hero-art svg{object-fit:contain}
  .hero-row{width:100%}
  .hero-cta,.hero-ghost{flex:1 1 180px}
  .hero-play small{display:none}
}
`;
