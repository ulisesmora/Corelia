// src/hooks/useColorExtractor.ts
export function useDominantColor() {
  const boostColor = (color: number): number => {
    // Aumentamos la intensidad de los colores
    return Math.min(255, color * 1.5);
  };

  const getDominantColor = async (imageSrc: string): Promise<string> => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return 'rgba(175, 174, 143, 0.8)'; // Color neón por defecto
      
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.src = imageSrc;
      
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let r = 0, g = 0, b = 0, count = 0;

      // Muestreamos algunos píxeles para mejor performance
      for (let i = 0; i < imageData.length; i += 16) {
        r += imageData[i];
        g += imageData[i + 1];
        b += imageData[i + 2];
        count++;
      }

      r = boostColor(r / count);
      g = boostColor(g / count);
      b = boostColor(b / count);

      return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, 0.8)`;
    } catch (e) {
      console.error('Error extracting color:', e);
      return 'rgba(87, 84, 37, 0.8)'; // Color neón por defecto
    }
  };

  return { getDominantColor };
}