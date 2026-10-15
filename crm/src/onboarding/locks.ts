import { useMemo } from 'react';
import { useSite } from '../site/SiteProvider';
import type { SectionKey } from '../components/shell/navigation';
import { FLOW, reachedOf, setupUnfinished } from './flow';
import { useSetupProgress } from './progressContext';

// ====================================================================
// Qué partes del panel se abren mientras la puesta en marcha no está
// terminada. Siempre abiertas: Hoy, Clientas, Mi web y Ajustes (y todo lo de
// Ajustes: salas, profesores, tipos de clase…). El resto, al terminar el paso
// del que depende:
//
//   Calendario (y clases fijas de clientas)  → al terminar «Horario» (paso 6)
//   Ventas (pagos, bonos, cupones, créditos…) → al terminar «Bonos» (paso 7)
//   Reservas                                  → al publicar la web (paso 8)
//
// Los estudios con la web publicada lo tienen todo abierto, siempre.
// ====================================================================

export interface Lock {
  /** «Se desbloquea al terminar Horario» */
  why: string;
  /** Paso (1…8) que lo desbloquea */
  step: number;
  /** Nombre del paso: «Horario» */
  stepLabel: string;
}

const UNLOCK_STEP: Partial<Record<SectionKey, number>> = { calendar: 6, sales: 7, bookings: 8 };

const SALES_PATHS = ['/ventas', '/payments', '/subscriptions', '/membership-candidates', '/plans', '/cuopon', '/credits'];

/** Sección (del menú) que «manda» en una ruta a efectos de bloqueo. */
function lockSectionOf(pathname: string): SectionKey | null {
  if (pathname.startsWith('/calendar') || pathname === '/assign-classes') return 'calendar';
  if (pathname.startsWith('/bookings')) return 'bookings';
  if (SALES_PATHS.includes(pathname)) return 'sales';
  return null;
}

function lockFor(section: SectionKey | null, reached: number): Lock | null {
  const step = section ? UNLOCK_STEP[section] : undefined;
  if (!step || reached > step) return null;
  const stepLabel = FLOW[step - 1].label;
  return {
    step,
    stepLabel,
    why: step === 8 ? 'Se desbloquea al publicar tu web' : `Se desbloquea al terminar ${stepLabel}`,
  };
}

export interface Locks {
  /** Falta terminar la puesta en marcha */
  unfinished: boolean;
  /** Paso al que se ha llegado (1…9) */
  reached: number;
  section: (key: SectionKey) => Lock | null;
  route: (pathname: string) => Lock | null;
}

const OPEN: Locks = { unfinished: false, reached: FLOW.length + 1, section: () => null, route: () => null };

/** Bloqueos del panel según la puesta en marcha (todo abierto si la web está publicada). */
export function useLocks(): Locks {
  const { progress } = useSetupProgress();
  const { config } = useSite();
  return useMemo(() => {
    if (!setupUnfinished(progress, config.setup_completed)) return OPEN;
    const reached = reachedOf(progress);
    return {
      unfinished: true,
      reached,
      section: (key) => lockFor(key, reached),
      route: (pathname) => lockFor(lockSectionOf(pathname), reached),
    };
  }, [progress, config.setup_completed]);
}
