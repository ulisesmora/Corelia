import { useCallback, useEffect, useState } from 'react';
import { useMediaQuery } from '@mui/material';

// Menú lateral del ordenador: completo (264px, con nombres) o comprimido (una
// columna de iconos). Se guarda por persona en su navegador; si nunca lo ha
// elegido, en pantallas medianas (900–1199px) empieza comprimido.

export type SidebarMode = 'full' | 'compact';
export const SIDEBAR_WIDTH: Record<SidebarMode, number> = { full: 264, compact: 76 };

const key = (who: string) => `panel-sidebar:${who || 'anon'}`;

function read(who: string): SidebarMode | null {
  try {
    const v = localStorage.getItem(key(who));
    return v === 'full' || v === 'compact' ? v : null;
  } catch {
    return null;
  }
}

export function useSidebarMode(who: string): [SidebarMode, (m: SidebarMode) => void] {
  const [chosen, setChosen] = useState<SidebarMode | null>(() => read(who));
  useEffect(() => { setChosen(read(who)); }, [who]);
  const medium = useMediaQuery('(max-width:1199.95px)', { noSsr: true });
  const mode: SidebarMode = chosen ?? (medium ? 'compact' : 'full');
  const change = useCallback((m: SidebarMode) => {
    setChosen(m);
    try { localStorage.setItem(key(who), m); } catch { /* sin almacenamiento: vale para esta visita */ }
  }, [who]);
  return [mode, change];
}
