import type { GuideChapter } from '../../components/charging/chapters';

// ====================================================================
// Visitas guiadas (coach marks) del panel: frases cortas que señalan algo de
// la pantalla. Sustituyen a las tarjetas de ayuda de antes.
//
//   WELCOME_TOUR   6 pasos al publicar la web (y desde «?» → Visita guiada)
//   PAGE_TOURS     «Cómo funciona» de cada pantalla (3 o 4 pasos)
//   FIRST_TIPS     un consejo la primera vez que se entra en una sección,
//                  con «Ver más» → su «Cómo funciona»
//
// `target`: selectores CSS, se usa el primero que esté visible (el primero
// para ordenador y el segundo para el móvil, p. ej. el menú lateral o la
// barra de abajo). Si no hay ninguno, el texto sale en el centro.
// Las pantallas marcan sus piezas con `data-tour="…"` (ver cada página).
// `guide`: botón para abrir un capítulo de «Cómo se cobra» (components/charging).
// ====================================================================

export type Placement = 'right' | 'bottom' | 'top' | 'left';

export interface TourStep {
  target?: string | string[];
  title: string;
  text: string;
  placement?: Placement;
  guide?: { chapter: GuideChapter; label: string };
}

const t = (name: string) => `[data-tour="${name}"]`;
const HEAD = [t('page-head'), 'main h1'];
const ACTIONS = [t('page-actions'), t('page-head'), 'main h1'];

export const WELCOME_TOUR: TourStep[] = [
  { target: [t('nav-today'), t('bnav-today')], title: 'Tu día, en una pantalla', text: 'En Hoy ves solo lo que necesita tu atención.' },
  { target: [t('nav-calendar'), t('bnav-calendar')], title: 'Tus clases de la semana', text: 'Toca una clase para ver quién viene. Horarios y vacaciones, arriba del calendario.' },
  { target: [t('nav-catalog'), t('bnav-more')], title: 'Clases y precios', text: 'Precios, bonos, profesores y salas, en un sitio. Toca un dato y cámbialo.', guide: { chapter: 'cobros', label: 'Cómo se cobra' } },
  { target: [t('new'), t('new-m')], title: 'Crea en un toque', text: 'Una reserva, una clienta, una clase o un bono.' },
  { target: [t('nav-web'), t('bnav-more')], title: 'Tu web, siempre al día', text: 'Cambia fotos y textos y mira el resultado al momento.' },
  { target: [t('nav-settings'), t('bnav-more')], title: 'Tu estilo y tus extras', text: 'Cambia colores o activa los pagos online cuando quieras.' },
];

export const PAGE_TOURS: Record<string, TourStep[]> = {
  // Secciones principales (las páginas nuevas ponen sus data-tour)
  today: [
    { target: [t('today-attention'), ...HEAD], title: 'Lo que necesita tu decisión', text: 'Resuélvelo con un toque. Siempre puedes deshacer.' },
    { target: [t('today-classes')], title: 'Tus clases de hoy', text: 'Cuántas vienen y quién espera plaza. Toca una para ver la lista.' },
    { target: [t('today-quick'), t('new'), t('new-m')], title: 'Accesos rápidos', text: 'Lo que más haces, a un toque.' },
  ],
  calendar: [
    { target: [t('cal-views'), ...HEAD], title: 'Día, semana o mes', text: 'En Día ves tus salas una al lado de otra.' },
    { target: [t('cal-event')], title: 'Toca una clase', text: 'Verás quién viene, la lista de espera y podrás pasar lista.' },
    { target: [t('cal-filters'), t('cal-views')], title: 'Mueve y crea arrastrando', text: 'Arrastra una clase para cambiarla de hora, o arrastra en un hueco libre para crear otra.' },
    { target: [t('cal-options'), ...HEAD], title: 'Horarios y vacaciones', text: 'Tus clases de cada semana, festivos y cierres. En «Más opciones», preparar el mes, imprimir y la lista de espera.', guide: { chapter: 'espera', label: 'Cómo va la lista de espera' } },
  ],
  bookings: [
    { target: [t('bookings-tabs'), ...HEAD], title: 'Próximas, pasadas o canceladas', text: 'Cambia de lista con un toque.' },
    { target: [t('search')], title: 'Busca a cualquiera', text: 'Por nombre o por clase.' },
    { target: ACTIONS, title: 'Reserva por ella', text: 'Si te escribe por WhatsApp, apúntala desde aquí.' },
  ],
  clients: [
    { target: [t('search'), ...HEAD], title: 'Encuentra a una clienta', text: 'Por nombre, móvil o email.' },
    { target: [t('list')], title: 'Su estado de un vistazo', text: 'Toca una ficha para ver su bono, sus clases y sus pagos.' },
    { target: ACTIONS, title: 'Añade clientas', text: 'Dale de alta en un momento, aunque aún no tenga cuenta.' },
  ],
  sales: [
    { target: [t('sales-period'), ...HEAD], title: 'Elige el periodo', text: 'Comparamos con el periodo anterior.' },
    { target: [t('sales-kpis')], title: 'Tus números', text: 'Ingresos, pendientes y bonos vendidos.' },
    { target: [t('sales-export'), ...ACTIONS], title: 'Cierre para la gestoría', text: 'Un Excel con todo, listo para enviar.' },
  ],
  web: [
    { target: [t('web-sections'), ...HEAD], title: 'Elige qué se ve', text: 'Enciende o apaga secciones de tu web.' },
    { target: [t('web-preview')], title: 'Mira el resultado', text: 'Cambia entre ordenador y móvil.' },
    { target: [t('web-publish'), ...ACTIONS], title: 'Publica cuando quieras', text: 'Tus clientas lo ven al momento.' },
  ],
  settings: [
    { target: [t('settings-search'), t('search'), ...HEAD], title: 'Busca un ajuste', text: 'Escribe «festivos», «pagos» o «lista de espera».' },
    { target: [t('settings-review')], title: 'Revisa esto', text: 'Lo que falta para que todo vaya bien.' },
    { target: [t('settings-groups'), t('list')], title: 'Todo agrupado', text: 'Tu estudio, cobros, clientas y tu web.' },
  ],

  catalog: [
    { target: [t('catalog-tabs'), ...HEAD], title: 'Todo en pestañas', text: 'Clases, precios, profesores, categorías y salas.' },
    { target: [t('list')], title: 'Cambia aquí mismo', text: 'Toca un nombre o un número, escríbelo y listo: se guarda solo.' },
    { target: [t('catalog-add'), t('list')], title: 'Añade lo que falte', text: 'Con «+ Añadir». Para fotos y textos, «Editar todo».' },
    { target: [t('catalog-guide'), ...ACTIONS], title: '¿Cómo se cobra?', text: 'Bonos, pagos en mano, cancelaciones y lista de espera, con tus precios.', guide: { chapter: 'cobros', label: 'Abrir la guía' } },
  ],

  // Pantallas de Ajustes, Ventas y Mi web
  rooms: [
    { target: ACTIONS, title: 'Añade una sala', text: 'Basta con el nombre y cuántas personas caben.' },
    { target: [t('list')], title: 'Tus salas', text: 'Toca «Editar» para poner una foto y una descripción: salen en tu web.' },
    { target: [t('search'), ...HEAD], title: 'Las plazas van en cada clase', text: 'Lo de aquí es informativo; el aforo se pone al crear la clase.' },
  ],
  instructors: [
    { target: ACTIONS, title: 'Añade a quien da clases', text: 'Con el nombre basta. La foto y la bio salen en tu web.' },
    { target: [t('list')], title: 'Su ficha', text: 'Toca una tarjeta para cambiar su foto, su bio o sus redes.' },
    { target: [t('search'), ...HEAD], title: 'Búscala rápido', text: 'Por nombre, cuando tengas muchas.' },
  ],
  'class-types': [
    { target: ACTIONS, title: 'Crea una clase', text: 'Empieza de una plantilla: ya trae descripción y duración.' },
    { target: [t('list')], title: 'Tus tipos de clase', text: 'Nombre, duración, nivel y foto. Es lo que ven en tu web.' },
    { target: [t('search'), ...HEAD], title: 'El horario va aparte', text: 'Aquí dices qué clases hay; cuándo se dan, en el Calendario.' },
  ],
  categories: [
    { target: ACTIONS, title: 'Grupos de clases', text: 'Pilates, Yoga… ordenan tus clases en la web.' },
    { target: [t('list')], title: 'Cada clase, en una', text: 'Al crear una clase eliges su categoría.' },
    { target: HEAD, title: 'Pocas y claras', text: 'Con tres o cuatro categorías tus clientas se orientan mejor.' },
  ],
  plans: [
    { target: ACTIONS, title: 'Crea un bono o una cuota', text: 'Clases sueltas, bonos de varias clases o una cuota mensual.', guide: { chapter: 'cobros', label: 'Cómo se cobra' } },
    { target: [t('list')], title: 'Lo que vendes', text: 'Toca uno para cambiar el precio o para cuántos días vale.' },
    { target: [t('search'), ...HEAD], title: 'Se ve al momento', text: 'Lo que cambies aquí sale en tu web en unos minutos.' },
  ],
  'site-images': [
    { target: ACTIONS, title: 'Fotos de tu web', text: 'Portada, galería y apartados generales.' },
    { target: [t('list')], title: 'Cambia una foto', text: 'Toca una tarjeta para subir otra o cambiar su texto.' },
    { target: HEAD, title: 'Cada cosa en su sitio', text: 'Las fotos de clases, profesoras y salas se cambian en sus pantallas.' },
  ],
  'studio-settings': [
    { target: [t('tabs'), ...HEAD], title: 'Todo por pestañas', text: 'Datos, estilo, portada, textos, emails y pagos.' },
    { target: [t('settings-form'), t('list')], title: 'Cambia lo que quieras', text: 'Tu web se actualiza en unos minutos.' },
    { target: [t('save'), ...ACTIONS], title: 'No olvides guardar', text: 'Verás un aviso verde abajo cuando esté guardado.' },
  ],
  payments: [
    { target: [t('search'), ...HEAD], title: 'Lo que has cobrado', text: 'Busca por clienta o por concepto.' },
    { target: [t('list')], title: 'Cada pago', text: 'Toca uno para ver qué compró y cuándo.' },
    { target: ACTIONS, title: 'Solo para mirar', text: 'Aquí no se cobra ni se devuelve nada.' },
  ],
  subscriptions: [
    { target: [t('search'), ...HEAD], title: 'Quién paga cada mes', text: 'Las membresías activas y las que tienen un pago pendiente.' },
    { target: [t('list')], title: 'Su estado', text: 'Toca una para ver los pagos y cancelarla si hace falta.' },
    { target: ACTIONS, title: 'Ofrece membresías', text: 'Se crean en Bonos y precios.' },
  ],
  coupons: [
    { target: ACTIONS, title: 'Crea un cupón', text: 'Un código como VERANO10 con su descuento.' },
    { target: [t('list')], title: 'Tus cupones', text: 'Cuántas veces se han usado y hasta cuándo valen.' },
    { target: HEAD, title: 'Se escribe al pagar', text: 'La clienta lo pone en la web antes de pagar.' },
  ],
  credits: [
    { target: [t('search'), ...HEAD], title: 'Busca a la clienta', text: 'Verás cuántas clases le quedan.' },
    { target: [t('list')], title: 'Añade o quita clases', text: 'Por ejemplo, cuando te paga en mano.', guide: { chapter: 'en-mano', label: 'Pagos en mano' } },
    { target: ACTIONS, title: 'Queda apuntado', text: 'Cada cambio se guarda con su motivo.' },
  ],
  mails: [
    { target: ACTIONS, title: 'Escribe un aviso', text: 'Por email, al móvil o de las dos formas.' },
    { target: [t('list')], title: 'Lo que ya enviaste', text: 'Con la fecha y a cuántas llegó.' },
    { target: HEAD, title: 'Para todas a la vez', text: 'Un cierre por festivo, una clase nueva…' },
  ],
  'membership-candidates': [
    { target: [t('list'), ...HEAD], title: 'Vienen casi cada semana', text: 'Y todavía pagan con bonos.' },
    { target: ACTIONS, title: 'Ofréceles la membresía', text: 'Su plaza se reserva sola y suele salirles mejor.' },
    { target: HEAD, title: 'Marca a quién avisaste', text: 'Así no se lo repites.' },
  ],
  'assign-classes': [
    { target: [t('search'), ...HEAD], title: 'Elige a la clienta', text: 'Búscala por nombre.' },
    { target: [t('list')], title: 'Su clase de cada semana', text: 'Guárdale la plaza sin que tenga que reservar.', guide: { chapter: 'en-mano', label: '¿Clase fija o créditos?' } },
    { target: ACTIONS, title: 'Se reserva sola', text: 'Cada semana, mientras le queden clases.' },
  ],
  admins: [
    { target: ACTIONS, title: 'Da acceso al panel', text: 'Con su email y una contraseña.' },
    { target: [t('list')], title: 'Quién puede entrar', text: 'Quita el acceso cuando alguien deje el estudio.' },
    { target: HEAD, title: 'Más seguro', text: 'Activa el código del móvil en Seguridad.' },
  ],
  security: [
    { target: HEAD, title: 'Un código además de la contraseña', text: 'Cambia cada 30 segundos en tu móvil.' },
    { target: [t('list'), ...ACTIONS], title: 'Actívalo en un minuto', text: 'Escanea el código con una app de autenticación.' },
    { target: ACTIONS, title: 'Guarda los códigos de emergencia', text: 'Por si pierdes el móvil.' },
  ],
};

export const FIRST_TIPS: Record<string, TourStep> = {
  calendar: { target: [t('cal-event'), t('cal-views'), ...HEAD], title: 'Toca una clase', text: 'Verás quién viene. Arrástrala para cambiarla de hora.' },
  bookings: { target: [t('bookings-tabs'), ...HEAD], title: 'Todas tus reservas', text: 'Próximas, pasadas y canceladas, en un sitio.' },
  clients: { target: [t('search'), ...HEAD], title: 'Tus clientas', text: 'Busca a cualquiera por nombre o móvil.' },
  sales: { target: [t('sales-period'), ...HEAD], title: 'Tus cobros', text: 'Quién te debe y lo que ya has cobrado.' },
  web: { target: [t('web-sections'), ...HEAD], title: 'Tu web, a tu manera', text: 'Enciende secciones y mira el resultado.' },
  settings: { target: [t('settings-search'), t('search'), ...HEAD], title: 'Busca un ajuste', text: 'Más rápido que ir menú por menú.' },
  plans: { target: ACTIONS, title: 'Tus bonos y precios', text: 'Lo que vendes en la web, en un sitio.' },
  catalog: { target: [t('list'), ...HEAD], title: 'Toca un dato para cambiarlo', text: 'Precios, créditos, minutos o aforo. Se guarda solo.' },
};

/** Clave de visita guiada de una pantalla (las de PageIntro usan la misma: pageKey). */
export function pageKeyOf(pathname: string): string | null {
  const map: Record<string, string> = {
    '/': 'today', '/calendar': 'calendar', '/bookings': 'bookings', '/clients': 'clients', '/ventas': 'sales',
    '/mi-web': 'web', '/configuracion': 'settings', '/rooms': 'rooms', '/instructors': 'instructors',
    '/classes': 'class-types', '/categories': 'categories', '/plans': 'plans', '/site-images': 'site-images',
    '/ajustes': 'studio-settings', '/payments': 'payments', '/subscriptions': 'subscriptions', '/cuopon': 'coupons',
    '/credits': 'credits', '/mails': 'mails', '/membership-candidates': 'membership-candidates',
    '/assign-classes': 'assign-classes', '/admins': 'admins', '/seguridad': 'security', '/clases-y-precios': 'catalog',
  };
  return map[pathname] ?? null;
}

/** Claves «visto» que se guardan en el servidor por persona. */
export const SEEN = {
  welcome: 'tour:welcome',
  tip: (key: string) => `tip:${key}`,
};
