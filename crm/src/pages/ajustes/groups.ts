// Mapa de Ajustes: cada pantalla de configuración del panel está en un grupo.
// Si añades una pantalla de ajustes, ponla aquí (y sale en el buscador).
import type { StudioIconName } from '../../site/StudioIcon';
import type { Tint } from '../kit/api';

export type SettingAction = 'waitlist' | 'cancellations';

export interface SettingItem {
  key: string;
  label: string;
  hint: string;
  icon: StudioIconName;
  /** Pantalla a la que lleva… */
  path?: string;
  /** …o diálogo que abre aquí mismo */
  action?: SettingAction;
  external?: boolean;
  keywords?: string;
}

export interface SettingGroup {
  key: string;
  title: string;
  icon: StudioIconName;
  tint: Tint;
  items: SettingItem[];
}

export const SETTING_GROUPS: SettingGroup[] = [
  {
    key: 'studio', title: 'Tu estudio', icon: 'studio', tint: 'reformer',
    items: [
      { key: 'datos', label: 'Datos y logo', hint: 'Nombre, contacto, dirección, logo y NIF', icon: 'studio', path: '/ajustes', keywords: 'nombre teléfono whatsapp dirección logo nif cif razón social iva factura recibos instagram' },
      { key: 'moneda', label: 'Moneda y país', hint: 'En qué moneda cobras', icon: 'payments', path: '/ajustes', keywords: 'moneda divisa euro dólar país precios' },
      // Estas cuatro (y «Bonos y cuotas») viven ahora en «Clases y precios» (pages/catalogo)
      { key: 'tipos', label: 'Tipos de clase', hint: 'En Clases y precios', icon: 'classTypes', path: '/clases-y-precios?tab=tipos', keywords: 'clases duración créditos precio' },
      { key: 'profes', label: 'Profesores', hint: 'En Clases y precios', icon: 'instructors', path: '/clases-y-precios?tab=profes', keywords: 'instructores profesoras equipo monitoras' },
      { key: 'categorias', label: 'Categorías', hint: 'En Clases y precios', icon: 'categories', path: '/clases-y-precios?tab=categorias' },
      { key: 'salas', label: 'Salas', hint: 'En Clases y precios', icon: 'rooms', path: '/clases-y-precios?tab=salas', keywords: 'sala aforo capacidad' },
      { key: 'horario', label: 'Horario semanal', hint: 'Las clases de cada semana', icon: 'schedule', path: '/calendar/horarios', keywords: 'horario semana clases fijas recurrentes' },
      { key: 'festivos', label: 'Festivos y cierres', hint: 'Vacaciones y días sin clase', icon: 'holidays', path: '/calendar/horarios?tab=cierres', keywords: 'vacaciones festivo cerrado cierre puente' },
    ],
  },
  {
    key: 'booking', title: 'Reservas y cobros', icon: 'payments', tint: 'mat',
    items: [
      { key: 'bonos', label: 'Bonos y cuotas', hint: 'En Clases y precios', icon: 'plans', path: '/clases-y-precios?tab=precios', keywords: 'bono cuota precio tarifa membresía plan' },
      { key: 'como-cobrar', label: 'Cómo se cobra', hint: 'Bonos, pagos en mano, devoluciones', icon: 'help', path: '/configuracion?guia=cobros', keywords: 'cobrar pagar créditos reembolso devolver efectivo bizum guía ayuda' },
      { key: 'formas-cobro', label: 'Formas de cobro', hint: 'Tarjeta, pagar en el estudio, invitados', icon: 'payments', path: '/ajustes?tab=pagos#formas-de-cobro', keywords: 'pagar en el estudio efectivo bizum datáfono transferencia invitados invitadas sin cuenta clase suelta bonos membresías online clases fijas' },
      { key: 'formas-pago', label: 'Formas de pago en tu web', hint: 'Apple Pay, Google Pay, Bizum, Link…', icon: 'card', path: '/ajustes?tab=pagos#formas-de-pago', keywords: 'apple pay google pay bizum link sepa domiciliación mb way multibanco oxxo klarna paypal ideal bancontact métodos de pago' },
      { key: 'pagos', label: 'Pagos online', hint: 'Conectar Stripe para cobrar con tarjeta', icon: 'card', path: '/ajustes?tab=pagos', keywords: 'stripe tarjeta apple pay google pay cobrar conectar' },
      { key: 'espera', label: 'Lista de espera', hint: 'Cuando una clase está llena', icon: 'agenda', action: 'waitlist', keywords: 'espera llena plaza aviso' },
      { key: 'cancelaciones', label: 'Cancelaciones', hint: 'Hasta cuándo se puede cancelar', icon: 'warning', action: 'cancellations', keywords: 'cancelar anular plazo horas devolver créditos' },
      { key: 'cupones', label: 'Cupones de descuento', hint: 'Códigos con descuento', icon: 'coupons', path: '/cuopon', keywords: 'descuento promoción código' },
      { key: 'creditos', label: 'Créditos de clientes', hint: 'Añadir o quitar clases a alguien', icon: 'credits', path: '/credits', keywords: 'saldo clases pago en mano efectivo' },
      { key: 'fijas', label: 'Clases fijas', hint: 'Plaza guardada cada semana', icon: 'fixedClasses', path: '/assign-classes', keywords: 'apuntar reserva fija recurrente' },
    ],
  },
  {
    key: 'clients', title: 'Clientes', icon: 'clients', tint: 'barre',
    items: [
      { key: 'emails', label: 'Emails', hint: 'Desde qué cuenta salen los emails', icon: 'notices', path: '/ajustes?tab=emails', keywords: 'smtp gmail correo confirmaciones recordatorios' },
      { key: 'avisos', label: 'Avisos a clientes', hint: 'Enviar un mensaje a todo el mundo', icon: 'announce', path: '/mails', keywords: 'email mensaje aviso newsletter' },
      { key: 'push', label: 'Avisos al móvil', hint: 'Notificaciones de la app', icon: 'notices', path: '/ajustes?tab=avisos', keywords: 'push notificaciones app' },
      { key: 'membresias', label: 'Membresías', hint: 'Quién paga cada mes', icon: 'subscriptions', path: '/subscriptions', keywords: 'cuotas mensual suscripción' },
      { key: 'candidatas', label: 'Candidatas a membresía', hint: 'Vienen cada semana sin membresía', icon: 'candidates', path: '/membership-candidates' },
    ],
  },
  {
    key: 'web', title: 'Tu web y tu app', icon: 'web', tint: 'yoga',
    items: [
      { key: 'estilo', label: 'Estilo y colores', hint: 'Estilo, paleta, letra e iconos', icon: 'style', path: '/ajustes?tab=aspecto', keywords: 'paleta tema colores fuente letra iconos oscuro neón' },
      { key: 'miweb', label: 'Mi web', hint: 'Secciones y vista previa', icon: 'web', path: '/mi-web', keywords: 'secciones web página' },
      { key: 'portada', label: 'Portada', hint: 'Foto, vídeo o ilustración de inicio', icon: 'photos', path: '/ajustes?tab=portada', keywords: 'hero vídeo youtube imagen' },
      { key: 'textos', label: 'Textos de la web', hint: 'Títulos, «quiénes somos» e inglés', icon: 'announce', path: '/ajustes?tab=textos', keywords: 'contenido inglés idioma' },
      { key: 'faq', label: 'Preguntas frecuentes', hint: 'Dudas típicas, respondidas', icon: 'help', path: '/ajustes?tab=preguntas', keywords: 'faq' },
      { key: 'opiniones', label: 'Opiniones', hint: 'Lo que dicen tus clientes', icon: 'celebrate', path: '/ajustes?tab=opiniones', keywords: 'reseñas testimonios' },
      { key: 'fotos', label: 'Fotos de la web', hint: 'Imágenes de cada sección', icon: 'photos', path: '/site-images', keywords: 'imágenes galería' },
      { key: 'google', label: 'Google y anuncios', hint: 'Ficha de Google, Analytics y píxeles', icon: 'google', path: '/ajustes?tab=google', keywords: 'seo analytics meta ads facebook búsquedas' },
      { key: 'dominio', label: 'Dominio', hint: 'tuestudio.com', icon: 'web', path: '/ajustes?tab=dominio', keywords: 'dominio url dirección dns' },
    ],
  },
  {
    key: 'account', title: 'Cuenta y seguridad', icon: 'security', tint: 'privada',
    items: [
      { key: 'admins', label: 'Administradores', hint: 'Quién puede entrar en el panel', icon: 'admins', path: '/admins', keywords: 'usuarios equipo acceso permisos' },
      { key: 'seguridad', label: 'Seguridad', hint: 'Código del móvil al entrar', icon: 'security', path: '/seguridad', keywords: '2fa contraseña código verificación' },
      { key: 'google-login', label: 'Acceso con Google', hint: 'Entrar con la cuenta de Google', icon: 'google', path: '/ajustes?tab=acceso-google', keywords: 'login oauth' },
    ],
  },
];

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Ajustes que encajan con lo que se busca (todas las palabras). */
export function searchSettings(groups: SettingGroup[], q: string) {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return groups.flatMap((g) => g.items
    .filter((it) => {
      const hay = fold(`${it.label} ${it.hint} ${it.keywords || ''} ${g.title}`);
      return words.every((w) => hay.includes(w));
    })
    .map((it) => ({ ...it, group: g.title })));
}
