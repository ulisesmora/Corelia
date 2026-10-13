// Fotos subidas desde el panel: el backend ya las reduce al guardarlas, así que
// se usan tal cual (sin optimizador externo). Se mantiene la firma para no
// tocar los componentes que la usan (y por si en el futuro se añade un
// optimizador de imágenes delante).
export function optimizedImage(url: string | null | undefined, _width?: number, _quality?: number): string {
  return url || '';
}

/**
 * Si la imagen falla, se reintenta con la original (por si la URL procesada
 * fallara) y, si también falla, se llama a `onFail` (p. ej. mostrar un marcador).
 */
export function withOriginalFallback(original: string | null | undefined, onFail?: () => void) {
  // `currentTarget` genérico: también lo usan <Box as="img"> de Chakra
  return (e: { currentTarget: EventTarget }) => {
    const img = e.currentTarget as HTMLImageElement;
    if (original && img.src !== original && !img.dataset.fallback) {
      img.dataset.fallback = '1';
      img.src = original;
      return;
    }
    onFail?.();
  };
}
