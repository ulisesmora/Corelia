import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { StudioIconName } from '../../site/StudioIcon';

// ====================================================================
// «Cómo se cobra»: guía corta y visual en 5 capítulos. Se abre desde
// cualquier pantalla del panel con la dirección:
//
//   ?guia=cobros               → primer capítulo («Dos formas de cobrar»)
//   ?guia=cobros#online        → clientes online (Stripe se encarga)
//   ?guia=cobros#en-estudio    → clientes del estudio (los gestionas tú)
//   ?guia=cobros#reembolsos    → un capítulo concreto
//
// #en-mano (enlace antiguo) abre «Clientes del estudio».
//
// (la lee <ChargingGuideHost/>, en MainLayout). Así se puede enlazar desde
// el «?», el buscador ⌘K, las visitas guiadas, Ajustes o cualquier botón.
// ====================================================================

/** Capítulos de la guía. 'en-mano' es el nombre antiguo de 'en-estudio' (sigue valiendo en enlaces). */
export type GuideChapter = 'cobros' | 'online' | 'en-estudio' | 'en-mano' | 'reembolsos' | 'espera';

/** Nombres antiguos → capítulo actual */
const ALIASES: Partial<Record<GuideChapter, GuideChapter>> = { 'en-mano': 'en-estudio' };

export const GUIDE_PARAM = 'guia';
export const GUIDE_VALUE = 'cobros';

export interface ChapterMeta {
  key: GuideChapter;
  /** Título del capítulo */
  title: string;
  /** Etiqueta corta de la pestaña */
  short: string;
  icon: StudioIconName;
}

export const CHAPTERS: ChapterMeta[] = [
  { key: 'cobros', title: 'Dos formas de cobrar', short: 'Resumen', icon: 'payments' },
  { key: 'online', title: 'Clientes online', short: 'Online', icon: 'web' },
  { key: 'en-estudio', title: 'Clientes del estudio', short: 'En el estudio', icon: 'studio' },
  { key: 'reembolsos', title: 'Cancelaciones y devoluciones', short: 'Cancelar', icon: 'undo' },
  { key: 'espera', title: 'Lista de espera', short: 'Espera', icon: 'hourglass' },
];

export const isChapter = (v: string): v is GuideChapter => CHAPTERS.some((c) => c.key === v) || v in ALIASES;

/** Capítulo actual de un nombre (resuelve los antiguos: 'en-mano' → 'en-estudio'). */
export const canonicalChapter = (c: GuideChapter): GuideChapter => ALIASES[c] || c;

/** Capítulo pedido en la dirección (o null si la guía está cerrada). */
export function chapterFromLocation(search: string, hash: string): GuideChapter | null {
  if (new URLSearchParams(search).get(GUIDE_PARAM) !== GUIDE_VALUE) return null;
  const h = decodeURIComponent(hash.replace(/^#/, ''));
  return isChapter(h) ? canonicalChapter(h) : 'cobros';
}

/** Enlace a la guía desde una ruta del panel: guideHref('/credits', 'en-mano'). */
export function guideHref(path: string, chapter: GuideChapter = 'cobros'): string {
  const [p, q = ''] = path.split('?');
  const params = new URLSearchParams(q);
  params.set(GUIDE_PARAM, GUIDE_VALUE);
  return `${p}?${params.toString()}#${chapter}`;
}

/** Abre la guía en la pantalla actual (sin salir de ella). */
export function useOpenGuide() {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback((chapter: GuideChapter = 'cobros') => {
    const params = new URLSearchParams(location.search);
    params.set(GUIDE_PARAM, GUIDE_VALUE);
    navigate({ pathname: location.pathname, search: `?${params.toString()}`, hash: chapter });
  }, [navigate, location.pathname, location.search]);
}
