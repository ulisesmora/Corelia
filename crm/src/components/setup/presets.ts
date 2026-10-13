/** Paletas y parejas de fuentes para elegir con un clic. Todas probadas para
 *  que el texto se lea bien sobre su fondo. */

export interface Palette {
  name: string;
  primary: string;
  secondary: string;
  dark: string;
  background: string;
}

export const PALETTES: Palette[] = [
  { name: 'Arena', primary: '#A0897C', secondary: '#85786B', dark: '#3D3228', background: '#F5F0EA' },
  { name: 'Salvia', primary: '#8A9A7B', secondary: '#6B7D5C', dark: '#2F3A28', background: '#F2F4EE' },
  { name: 'Océano', primary: '#5B8A9A', secondary: '#3F6E7D', dark: '#1F3540', background: '#EEF4F6' },
  { name: 'Lavanda', primary: '#9C8AB4', secondary: '#7A6898', dark: '#352B45', background: '#F4F1F8' },
  { name: 'Terracota', primary: '#C27C5C', secondary: '#A3603F', dark: '#3E2419', background: '#FAF2EC' },
  { name: 'Rosa', primary: '#C98C99', secondary: '#A86B79', dark: '#3F2329', background: '#FBF1F3' },
  { name: 'Carbón', primary: '#6B6B6B', secondary: '#4A4A4A', dark: '#1C1C1C', background: '#F4F4F2' },
];

export interface FontPair {
  name: string;
  heading: string;
  body: string;
  description: string;
}

export const FONT_PAIRS: FontPair[] = [
  { name: 'Elegante', heading: 'Playfair Display', body: 'Jost', description: 'Títulos con serifa, cuerpo limpio' },
  { name: 'Moderna', heading: 'Montserrat', body: 'Inter', description: 'Geométrica y muy legible' },
  { name: 'Suave', heading: 'Quicksand', body: 'Nunito', description: 'Redondeada y cercana' },
  { name: 'Clásica', heading: 'Lora', body: 'Source Sans 3', description: 'Cálida y tradicional' },
  { name: 'Impacto', heading: 'Bebas Neue', body: 'Quicksand', description: 'Títulos altos y llamativos' },
  { name: 'Serena', heading: 'Cormorant Garamond', body: 'Lato', description: 'Fina y delicada' },
];

/** Carga una o varias fuentes de Google en la página (para la vista previa). */
export function loadGoogleFonts(families: string[]) {
  const unique = [...new Set(families.filter(Boolean))];
  unique.forEach((family) => {
    const id = `gf-${family.replace(/\s+/g, '-').toLowerCase()}`;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@400;600;700&display=swap`;
    document.head.appendChild(link);
  });
}
