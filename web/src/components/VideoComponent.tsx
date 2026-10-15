"use client";
// Portada (hero) de la web. Pinta EXACTAMENTE el mismo HTML que la réplica del
// servidor (components/home/HomePage.astro) con las clases de lib/hero.ts, así
// que al hidratar no hay salto. Lo que sale de fondo lo decide el panel
// (Ajustes → Portada): foto, vídeo de YouTube o ilustración.
//
// Vídeo: el iframe de YouTube (youtube-nocookie) SOLO se carga si la visitante
// aceptó «Vídeos» en el banner de cookies o pulsa «Ver vídeo». Con «menos
// movimiento» o «ahorro de datos» no arranca solo. Antes de eso no se pide nada
// a YouTube ni a Google: se ve el póster guardado en el propio servidor.
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useT } from '../i18n/index';
import { useLangStore } from './stores/lang.store';
import { trStrict } from '../utils/localized';
import { lt, useSite } from '../lib/site';
import { HERO_LABELS, heroArtVars, heroView, prefersStillHero, youtubeEmbedUrl } from '../lib/hero';
import { readConsent, type ConsentChoice } from '../lib/tracking';

/** Primera foto de Imágenes → Portada (la que ya ha cargado el servidor). */
export interface HeroImage {
  image: string;
  title?: string | null;
  title_en?: string;
  subtitle?: string | null;
  subtitle_en?: string;
  translations?: Record<string, Record<string, string>>;
}

interface Props {
  heroImage?: HeroImage | null;
}

export default function HeroWithVideo({ heroImage = null }: Props) {
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const site = useSite();
  const view = useMemo(() => heroView(site, heroImage?.image || ''), [site, heroImage]);
  const L = HERO_LABELS[lang === 'en' ? 'en' : 'es'];

  // Título y subtítulo: los del panel (Ajustes → Textos de la web) mandan; si no
  // hay, los de la foto de la portada (en inglés, su traducción o el titular del diccionario).
  const imgTitle = heroImage
    ? (lang === 'en' ? (trStrict(heroImage, 'title', 'en') || t('home.hero.h1', { studio: site.studio_name })) : (heroImage.title || ''))
    : '';
  const imgSubtitle = heroImage && lang === 'en' ? trStrict(heroImage, 'subtitle', 'en') : '';
  const title = lt(site.content, 'hero_title', lang) || imgTitle;
  const subtitle = lt(site.content, 'hero_subtitle', lang) || imgSubtitle;

  // ── Vídeo ──
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (view.mode !== 'video') return undefined;
    if (readConsent()?.videos && !prefersStillHero()) setPlaying(true);
    const onConsent = (e: Event) => {
      const c = (e as CustomEvent<ConsentChoice>).detail;
      if (c?.videos) {
        if (!prefersStillHero()) setPlaying(true);
      } else {
        setPlaying(false);
        setVisible(false);
      }
    };
    window.addEventListener('cookie-consent', onConsent);
    return () => window.removeEventListener('cookie-consent', onConsent);
  }, [view.mode]);

  const art = view.mode === 'illustration';
  const style = { ...heroArtVars(view.theme) } as CSSProperties;
  // Sin título propio: el lema del estudio o su nombre (siempre hay un h1 visible)
  const heading = title || (lang === 'en' ? site.tagline_en : site.tagline)
    || (lang === 'en' ? 'Pilates, Yoga and movement' : 'Pilates, Yoga y movimiento');
  const seeTimetable = lang === 'en' ? 'See timetable' : 'Ver horario';

  return (
    <section id="menu" className={`hero hero--${art ? 'art' : view.mode}`} style={style}>
      <div className="hero-in">
        <div className="hero-content">
          <h1 className="hero-title">{heading}</h1>
          {subtitle && <p className="hero-sub">{subtitle}</p>}
          <div className="hero-row">
            <a className="hero-cta sk-btn" href="/calendar">{t('nav.cta.book')}</a>
            <a className="hero-ghost sk-btn-ghost" href="#proximas">{seeTimetable}</a>
          </div>
        </div>

        {art ? (
          <div className="hero-art" aria-hidden="true" dangerouslySetInnerHTML={{ __html: view.art }} />
        ) : (
          <div className="hero-media" style={{ background: view.background }}>
            {view.mode === 'video' && playing && (
              <iframe
                className={`hero-video${visible ? ' is-on' : ''}`}
                src={youtubeEmbedUrl(view.videoId)}
                title={`${L.video} · ${site.studio_name}`}
                allow="autoplay; encrypted-media"
                referrerPolicy="strict-origin-when-cross-origin"
                tabIndex={-1}
                onLoad={() => window.setTimeout(() => setVisible(true), 1200)}
              />
            )}
            {view.mode === 'video' && (
              playing ? (
                <button type="button" className="hero-play" onClick={() => { setPlaying(false); setVisible(false); }}>
                  <span aria-hidden="true">❚❚</span> {L.pause}
                </button>
              ) : (
                <button type="button" className="hero-play" onClick={() => setPlaying(true)}>
                  <span aria-hidden="true">▶</span> {L.play} <small>· {L.playHint}</small>
                </button>
              )
            )}
          </div>
        )}
      </div>
    </section>
  );
}
