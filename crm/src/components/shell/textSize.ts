import { useCallback, useEffect, useState } from 'react';

// Tamaño del texto del panel (botón A/A del menú): «normal» o «grande».
// Se guarda por persona (cada administradora en su navegador) y agranda todo
// el panel: MUI usa rem, así que basta con cambiar la letra de <html>.

export type TextSize = 'normal' | 'large';
const key = (who: string) => `crmTextSize:${who || 'anon'}`;

function read(who: string): TextSize {
  try {
    return localStorage.getItem(key(who)) === 'large' ? 'large' : 'normal';
  } catch {
    return 'normal';
  }
}

export function useTextSize(who: string): [TextSize, (s: TextSize) => void] {
  const [size, setSize] = useState<TextSize>(() => read(who));
  useEffect(() => { setSize(read(who)); }, [who]);
  useEffect(() => {
    document.documentElement.style.fontSize = size === 'large' ? '112.5%' : '';
    document.documentElement.dataset.textSize = size;
  }, [size]);
  // Al salir del panel (pantalla de entrar) vuelve el tamaño normal
  useEffect(() => () => { document.documentElement.style.fontSize = ''; }, []);
  const change = useCallback((s: TextSize) => {
    setSize(s);
    try { localStorage.setItem(key(who), s); } catch { /* sin almacenamiento */ }
  }, [who]);
  return [size, change];
}
