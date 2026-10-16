import type { StudioIconName } from '../../site/StudioIcon';

// ====================================================================
// Mapa del panel (la «IA» del rediseño): el menú lateral, la barra de abajo
// del móvil, las páginas índice (Ventas, Mi web, Ajustes) y el buscador ⌘K
// salen de aquí. Toda pantalla del panel tiene que estar en algún sitio.
//
//   Día a día: Hoy · Calendario · Reservas · Clientas
//   Negocio:   Clases y precios · Ventas · Mi web
//   Ajustes (abajo): todo lo que se toca poco
//
// «Clases y precios» (pages/catalogo) reúne lo que se cambia a menudo: tipos
// de clase, precios y bonos, profesores, categorías y salas (antes en Ajustes;
// sus entradas de Ajustes llevan ahora allí).
// ====================================================================

export type SectionKey = 'today' | 'calendar' | 'bookings' | 'clients' | 'catalog' | 'sales' | 'web' | 'settings';

export interface NavItem {
  key: SectionKey;
  label: string;
  icon: StudioIconName;
  path: string;
  group: 'Día a día' | 'Negocio' | null;
}

export const NAV: NavItem[] = [
  { key: 'today', label: 'Hoy', icon: 'sun', path: '/', group: 'Día a día' },
  { key: 'calendar', label: 'Calendario', icon: 'schedule', path: '/calendar', group: 'Día a día' },
  { key: 'bookings', label: 'Reservas', icon: 'booked', path: '/bookings', group: 'Día a día' },
  { key: 'clients', label: 'Clientas', icon: 'clients', path: '/clients', group: 'Día a día' },
  { key: 'catalog', label: 'Clases y precios', icon: 'classTypes', path: '/clases-y-precios', group: 'Negocio' },
  { key: 'sales', label: 'Ventas', icon: 'credits', path: '/ventas', group: 'Negocio' },
  { key: 'web', label: 'Mi web', icon: 'web', path: '/mi-web', group: 'Negocio' },
  { key: 'settings', label: 'Ajustes', icon: 'settings', path: '/configuracion', group: null },
];

/** Barra de abajo del móvil: lo del día a día (+ «Más»). */
export const BOTTOM_KEYS: SectionKey[] = ['today', 'calendar', 'bookings', 'clients'];

export interface HubLink {
  label: string;
  /** Una línea: para qué sirve (se ve en las páginas índice y en ⌘K) */
  hint: string;
  icon: StudioIconName;
  path: string;
  /** Palabras extra para el buscador */
  keywords?: string;
  /** Se abre fuera del panel (la web pública) */
  external?: boolean;
}

export interface HubGroup {
  title: string;
  icon: StudioIconName;
  links: HubLink[];
}

export const SALES_HUB: HubGroup[] = [
  {
    title: 'Cobros',
    icon: 'payments',
    links: [
      { label: 'Pagos', hint: 'Lo que se ha cobrado', icon: 'payments', path: '/payments', keywords: 'cobros tarjeta stripe' },
      { label: 'Membresías', hint: 'Quién paga cada mes', icon: 'subscriptions', path: '/subscriptions', keywords: 'cuotas mensual' },
      { label: 'Candidatas a membresía', hint: 'Vienen cada semana sin membresía', icon: 'candidates', path: '/membership-candidates' },
    ],
  },
  {
    title: 'Lo que vendes',
    icon: 'plans',
    links: [
      { label: 'Bonos y precios', hint: 'Lo que se vende en la web', icon: 'plans', path: '/clases-y-precios?tab=precios', keywords: 'bono cuota precio tarifa membresía' },
      { label: 'Cupones de descuento', hint: 'Códigos con descuento', icon: 'coupons', path: '/cuopon', keywords: 'descuento promoción código' },
      { label: 'Créditos', hint: 'Añadir o quitar clases a alguien', icon: 'credits', path: '/credits', keywords: 'saldo clases pago en mano' },
    ],
  },
];

export const WEB_HUB: HubGroup[] = [
  {
    title: 'Cómo se ve',
    icon: 'style',
    links: [
      { label: 'Estilo y colores', hint: 'Estilo, paleta, letra e iconos', icon: 'style', path: '/ajustes?tab=aspecto', keywords: 'paleta tema colores fuente letra' },
      { label: 'Portada', hint: 'Foto, vídeo o ilustración de inicio', icon: 'photos', path: '/ajustes?tab=portada' },
      { label: 'Fotos de la web', hint: 'Imágenes de cada sección', icon: 'photos', path: '/site-images', keywords: 'imágenes galería' },
    ],
  },
  {
    title: 'Lo que dice',
    icon: 'announce',
    links: [
      { label: 'Textos de la web', hint: 'Títulos, «sobre nosotras» e inglés', icon: 'announce', path: '/ajustes?tab=textos', keywords: 'contenido inglés' },
      { label: 'Preguntas frecuentes', hint: 'Dudas típicas, respondidas', icon: 'help', path: '/ajustes?tab=preguntas', keywords: 'faq' },
      { label: 'Opiniones', hint: 'Lo que dicen tus clientas', icon: 'celebrate', path: '/ajustes?tab=opiniones', keywords: 'reseñas testimonios' },
    ],
  },
  {
    title: 'Para que te encuentren',
    icon: 'google',
    links: [
      { label: 'Google y anuncios', hint: 'Ficha de Google, Analytics y píxeles', icon: 'google', path: '/ajustes?tab=google', keywords: 'seo analytics meta ads' },
      { label: 'Tu dominio', hint: 'tuestudio.com', icon: 'web', path: '/ajustes?tab=dominio', keywords: 'dominio url' },
    ],
  },
];

export const SETTINGS_HUB: HubGroup[] = [
  {
    title: 'Tu estudio',
    icon: 'studio',
    links: [
      { label: 'Datos y logo', hint: 'Nombre, contacto, dirección y logo', icon: 'studio', path: '/ajustes', keywords: 'nombre teléfono dirección logo nif' },
      { label: 'Tipos de clase', hint: 'Duración, créditos y precio', icon: 'classTypes', path: '/clases-y-precios?tab=tipos', keywords: 'clases duración créditos' },
      { label: 'Profesores', hint: 'Quién da las clases', icon: 'instructors', path: '/clases-y-precios?tab=profes', keywords: 'profesoras instructores instructoras equipo' },
      { label: 'Categorías', hint: 'Grupos de clases en la web', icon: 'categories', path: '/clases-y-precios?tab=categorias' },
      { label: 'Salas', hint: 'Espacios y aforo', icon: 'rooms', path: '/clases-y-precios?tab=salas', keywords: 'aforo capacidad' },
      { label: 'Clases fijas de clientas', hint: 'Plaza guardada cada semana', icon: 'fixedClasses', path: '/assign-classes', keywords: 'apuntar reserva fija' },
    ],
  },
  {
    title: 'Tus clientas',
    icon: 'clients',
    links: [
      { label: 'Avisos a clientas', hint: 'Enviar un mensaje a todas', icon: 'notices', path: '/mails', keywords: 'email mensaje aviso' },
      { label: 'Emails', hint: 'Desde qué cuenta salen los emails', icon: 'notices', path: '/ajustes?tab=emails', keywords: 'smtp gmail correo' },
      { label: 'Avisos al móvil', hint: 'Notificaciones de la app', icon: 'notices', path: '/ajustes?tab=avisos', keywords: 'push notificaciones' },
    ],
  },
  {
    title: 'Cobros y acceso',
    icon: 'payments',
    links: [
      { label: 'Pagos online', hint: 'Cobrar con tarjeta al reservar', icon: 'payments', path: '/ajustes?tab=pagos', keywords: 'stripe tarjeta' },
      { label: 'Acceso con Google', hint: 'Entrar con la cuenta de Google', icon: 'google', path: '/ajustes?tab=acceso-google' },
      { label: 'Administradores', hint: 'Quién puede entrar aquí', icon: 'admins', path: '/admins', keywords: 'usuarios equipo' },
      { label: 'Seguridad', hint: 'Código del móvil al entrar', icon: 'security', path: '/seguridad', keywords: '2fa contraseña' },
    ],
  },
];

const WEB_TABS = new Set(['aspecto', 'portada', 'textos', 'preguntas', 'opiniones', 'google', 'dominio']);
/** Pantallas de «Clases y precios» (la nueva y las completas de siempre). */
export const CATALOG_PATHS = new Set(['/clases-y-precios', '/classes', '/plans', '/instructors', '/categories', '/rooms']);
const SALES_PATHS = new Set(SALES_HUB.flatMap((g) => g.links.map((l) => l.path)).concat('/ventas'));

/** Sección del menú a la que pertenece una pantalla (para marcarla como activa). */
export function sectionOf(pathname: string, search = ''): SectionKey | null {
  if (pathname === '/') return 'today';
  if (pathname.startsWith('/calendar')) return 'calendar';
  if (pathname.startsWith('/bookings')) return 'bookings';
  if (pathname.startsWith('/clients') || pathname.startsWith('/clientas')) return 'clients';
  if (CATALOG_PATHS.has(pathname)) return 'catalog';
  if (SALES_PATHS.has(pathname)) return 'sales';
  if (pathname === '/mi-web' || pathname === '/site-images') return 'web';
  if (pathname === '/ajustes') {
    const tab = new URLSearchParams(search).get('tab') || '';
    return WEB_TABS.has(tab) ? 'web' : 'settings';
  }
  if (pathname === '/puesta-en-marcha') return null;
  return 'settings';
}
