// Opciones de los formularios de preferencias (alta de leads y «Mis
// preferencias»): los intereses salen de las CLASES REALES del estudio y las
// franjas horarias son genéricas, válidas para cualquier horario.
import { useEffect, useState } from 'react';
import { API_V1 } from '../config';

export interface Option { label: string; value: string }

type T = (key: string) => string;

let cachedClasses: Option[] | null = null;

/** Tipos de clase activos del estudio como opciones de «¿Qué te interesa?». */
export function useInterestOptions(lang: 'es' | 'en' = 'es'): Option[] {
  const [options, setOptions] = useState<Option[]>(cachedClasses || []);
  useEffect(() => {
    if (cachedClasses) return;
    let alive = true;
    fetch(`${API_V1}/class-types/?page_size=200`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list = (Array.isArray(d) ? d : d?.results || []) as Array<{ title: string; title_en?: string; is_active?: boolean }>;
        const seen = new Set<string>();
        const opts = list
          .filter((c) => c.is_active !== false && c.title)
          .map((c) => ({ value: c.title, label: (lang === 'en' && c.title_en) || c.title }))
          .filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)));
        cachedClasses = opts;
        if (alive) setOptions(opts);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [lang]);
  return options;
}

/** Franjas horarias genéricas (sirven para cualquier estudio). */
export function scheduleOptions(t: T): Option[] {
  return [
    { value: 'Mañana', label: t('home.heroVideo.schMorning') },
    { value: 'Mediodía', label: t('home.heroVideo.schMidday') },
    { value: 'Tarde', label: t('home.heroVideo.schAfternoon') },
    { value: 'Noche', label: t('home.heroVideo.schLast') },
  ];
}
