// ./hooks/useScrollDetection.ts
import { useEffect, useState } from 'react';

export function useScrollDirection(threshold = 10) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (scrolled) return; // ya “enganchó”, no escuchar más

    const onScroll = () => {
      // Si ya pasó el umbral, enganchamos y dejamos de escuchar
      if ((window.scrollY || window.pageYOffset) > threshold) {
        setScrolled(true);
        window.removeEventListener('scroll', onScroll);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // evalúa por si ya está scrolleado al montar

    return () => window.removeEventListener('scroll', onScroll);
  }, [scrolled, threshold]);

  return scrolled;
}
