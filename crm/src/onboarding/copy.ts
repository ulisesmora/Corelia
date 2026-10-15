// ====================================================================
// Textos de la guía de puesta en marcha (todos aquí, para traducirlos de una
// vez si el panel llega a tener otros idiomas). El orden y el estado de los
// pasos los decide el API: api/api/setup_guide.py.
// ====================================================================
import type { StudioIconName } from '../site/StudioIcon';

export type StepKey =
  | 'studio' | 'style' | 'rooms' | 'instructors' | 'class_types' | 'schedule' | 'plans'
  | 'payments' | 'content' | 'google' | 'launch';

export interface StepCopy {
  /** Nombre corto (menú, chips, «Siguiente: …») */
  label: string;
  /** Título del paso */
  title: string;
  /** Qué es, en una o dos frases */
  what: string;
  /** Por qué importa / para qué sirve */
  why: string;
  /** Un ejemplo concreto */
  example: string;
  /** Dónde se hace en el panel */
  route: string;
  /** Texto del botón principal que lleva a hacerlo */
  cta: string;
  icon: StudioIconName;
  /** Frase cuando el paso está hecho (puede usar {n}) */
  doneText: string;
}

export const STEP_COPY: Record<StepKey, StepCopy> = {
  studio: {
    label: 'Tu estudio',
    title: 'Tu estudio: nombre, contacto y dirección',
    what: 'El nombre de tu estudio, cómo te pueden contactar, dónde estás y tu logo.',
    why: 'Sale en la web, en los emails y en la app de tus clientas. Google también lo usa para enseñarte en el mapa.',
    example: '«Estudio Luna» · +34 600 000 000 · Calle Mayor 3, Madrid · logo en PNG con fondo transparente.',
    route: '/puesta-en-marcha?paso=studio',
    cta: 'Completar los datos',
    icon: 'studio',
    doneText: 'Tus datos están listos.',
  },
  style: {
    label: 'Tu estilo',
    title: 'Tu estilo: aspecto, letra y colores',
    what: 'Cómo se ve tu web: el estilo (natural, minimal, editorial…), las fuentes de los títulos y del texto, la paleta de colores y los iconos.',
    why: 'Es lo primero que ven tus clientas. Un aspecto que se parezca a tu estudio da confianza y hace que te recuerden.',
    example: 'Estudio de pilates tranquilo: estilo «Natural», letra «Playfair Display» y tonos arena. Estudio de entrenamiento: «Energía» y colores intensos.',
    route: '/puesta-en-marcha?paso=style',
    cta: 'Elegir mi estilo',
    icon: 'style',
    doneText: 'Tu estilo está elegido. Puedes cambiarlo cuando quieras sin perder nada.',
  },
  rooms: {
    label: 'Salas',
    title: 'Las salas de tu estudio',
    what: 'Los espacios donde das las clases. La mayoría de estudios tienen una sola.',
    why: 'Cada clase del horario tiene que estar en una sala, así sabes dónde es y no se pisan dos clases en el mismo sitio.',
    example: '«Sala principal» con 10 plazas, o «Sala Reformer» (6 máquinas) y «Sala Mat» (12 esterillas).',
    route: '/rooms',
    cta: 'Revisar mis salas',
    icon: 'rooms',
    doneText: 'Tienes {n} sala(s).',
  },
  instructors: {
    label: 'Profesores',
    title: 'Quién da las clases',
    what: 'Las personas que dan clase en tu estudio, con su foto y una frase sobre ellas. Si das tú todas las clases, añádete a ti.',
    why: 'Tus clientas quieren saber con quién van a entrenar, y el horario enseña quién da cada clase.',
    example: '«Laura García — Instructora de Pilates desde 2015, especializada en suelo pélvico».',
    route: '/instructors',
    cta: 'Añadir profesores',
    icon: 'instructors',
    doneText: 'Tienes {n} profesor(es).',
  },
  class_types: {
    label: 'Tipos de clase',
    title: 'Las clases que ofreces',
    what: 'Cada tipo de clase con su nombre, descripción, duración y lo que cuesta en créditos. Todavía sin días ni horas.',
    why: 'Es lo que tus clientas leen en la web para elegir. Después, en el horario, solo dirás qué día y a qué hora se da cada una.',
    example: '«Pilates Reformer», 55 minutos, 2 créditos · «Hatha Yoga», 60 minutos, 1 crédito. Usa una plantilla y cámbiala a tu gusto.',
    route: '/classes',
    cta: 'Crear mis clases',
    icon: 'classTypes',
    doneText: 'Tienes {n} tipo(s) de clase.',
  },
  schedule: {
    label: 'Horario semanal',
    title: 'Tu horario semanal',
    what: 'Qué clase se da cada día, a qué hora, en qué sala y con cuántas plazas. Las clases semanales se repiten solas.',
    why: 'Es lo que tus clientas reservan. Sin horario, la web no tiene nada que reservar.',
    example: 'Pilates Reformer · lunes y miércoles · 9:30 a 10:25 · Sala principal · 6 plazas.',
    route: '/calendar',
    cta: 'Montar el horario',
    icon: 'schedule',
    doneText: 'Tu horario tiene {n} clase(s).',
  },
  plans: {
    label: 'Bonos y cuotas',
    title: 'Bonos y cuotas mensuales',
    what: 'Lo que vendes: bonos de clases (se pagan una vez) y membresías (se cobran solas cada mes). Cada uno da créditos para reservar.',
    why: 'Sin precios, tus clientas no saben cuánto cuesta venir ni pueden comprar en la web.',
    example: '«Bono 5 clases» por 60 € (caduca en 2 meses) · «Membresía 8 clases/mes» por 85 € al mes.',
    route: '/plans',
    cta: 'Poner mis precios',
    icon: 'plans',
    doneText: 'Tienes {n} bono(s) o cuota(s) a la venta.',
  },
  payments: {
    label: 'Pagos y emails',
    title: 'Cobrar online y enviar emails (opcional)',
    what: 'Conectar Stripe para que paguen con tarjeta en la web, y tu email para enviar confirmaciones y recordatorios.',
    why: 'Así vendes bonos a cualquier hora y tus clientas reciben avisos. Si prefieres cobrar en el estudio, puedes saltarlo.',
    example: 'Una clienta compra el «Bono 10» a las 23:00 desde el sofá y recibe el email de confirmación al momento.',
    route: '/puesta-en-marcha?paso=payments',
    cta: 'Configurar pagos y emails',
    icon: 'payments',
    doneText: 'Pagos y emails listos.',
  },
  content: {
    label: 'Contenido de la web',
    title: 'Fotos y textos de tu web',
    what: 'La foto o el vídeo de la portada, el texto «quiénes somos», las preguntas frecuentes y las opiniones de tus clientas.',
    why: 'Las fotos reales y tus propias palabras convencen mucho más que los textos de ejemplo. Google y los asistentes de IA también los leen.',
    example: 'Una foto luminosa de tu sala, «Somos un estudio pequeño en el centro de Sevilla…» y 3 opiniones de Google.',
    route: '/puesta-en-marcha?paso=content',
    cta: 'Poner fotos y textos',
    icon: 'photos',
    doneText: 'Tu web tiene tus fotos y tus textos.',
  },
  google: {
    label: 'Que te encuentren en Google',
    title: 'Que te encuentren en Google',
    what: 'Tu ficha de Google (la que sale en Google Maps), avisar a Google de que la web es tuya (Search Console) y, si quieres, tu propio dominio.',
    why: 'Cuando alguien busca «pilates cerca de mí», sale primero la ficha de Google. Unida a tu web, te trae clientas nuevas cada semana.',
    example: 'Ficha «Estudio Luna — Estudio de pilates», con tu dirección, horario, fotos y el enlace a www.estudioluna.com.',
    route: '/puesta-en-marcha?paso=google',
    cta: 'Conectar con Google',
    icon: 'google',
    doneText: 'Tu ficha de Google está conectada.',
  },
  launch: {
    label: 'Prueba y lanzamiento',
    title: 'Prueba y lanzamiento',
    what: 'Haz una reserva de prueba como si fueras una clienta, da de alta a tus clientas y publica tu web para que salga en Google.',
    why: 'Así compruebas que todo funciona antes de que reserve nadie, y empiezas con tus clientas de siempre dentro.',
    example: 'Reserva la clase del lunes desde tu móvil, cancélala, y después comparte el enlace en tu Instagram y por WhatsApp.',
    route: '/puesta-en-marcha?paso=launch',
    cta: 'Probar y publicar',
    icon: 'launch',
    doneText: '¡Tu web está publicada!',
  },
};

/** Qué falta en el paso «Tu estudio» (claves de `missing` del API). */
export const MISSING_TEXT: Record<string, string> = {
  name: 'el nombre de tu estudio',
  contact: 'un teléfono, WhatsApp o email de contacto',
  address: 'la dirección o al menos la ciudad',
};

/** Sub-tareas de cada paso (claves de `items` del API). */
export const ITEM_TEXT: Record<string, { label: string; route: string }> = {
  logo: { label: 'Logo (opcional: si no, se usa el nombre)', route: '/ajustes?tab=estudio' },
  emails: { label: 'Emails a tus clientas', route: '/ajustes?tab=emails' },
  stripe: { label: 'Pagos con tarjeta (Stripe)', route: '/ajustes?tab=pagos' },
  hero: { label: 'Foto, vídeo o ilustración de la portada', route: '/ajustes?tab=portada' },
  texts: { label: 'Titular de la portada y texto «quiénes somos»', route: '/ajustes?tab=textos' },
  faqs: { label: 'Preguntas frecuentes propias', route: '/ajustes?tab=preguntas' },
  testimonials: { label: 'Opiniones de clientas', route: '/ajustes?tab=opiniones' },
  business: { label: 'Ficha de Google (Google Maps) conectada', route: '/ajustes?tab=google' },
  search_console: { label: 'Web verificada en Google Search Console', route: '/ajustes?tab=google' },
  domain: { label: 'Dominio propio (www.tuestudio.com)', route: '/ajustes?tab=dominio' },
  test_booking: { label: 'Una reserva de prueba hecha', route: '/bookings' },
  clients: { label: 'Tus clientas dadas de alta', route: '/clients?accion=nueva' },
  published: { label: 'Web publicada en Google', route: '/puesta-en-marcha?paso=launch' },
};

export const UI = {
  guideTitle: 'Puesta en marcha',
  guideSubtitle:
    'Te llevamos paso a paso, en el orden en que se necesitan las cosas: así, cuando llegues al horario y a los precios, ya tendrás todo lo que hace falta.',
  menuHint: 'Paso a paso, hasta publicar',
  progress: (done: number, total: number) => `${done} de ${total} pasos`,
  stepOf: (n: number, total: number) => `Paso ${n} de ${total}`,
  required: 'Imprescindible para publicar',
  optional: 'Opcional',
  finalStep: 'Último paso',
  readyToPublish: '¡Ya tienes lo imprescindible! Haz una reserva de prueba y publica tu web cuando quieras.',
  testAndPublish: 'Probar y publicar',
  showMore: 'Qué es y por qué',
  statusDone: 'Hecho',
  statusSkipped: 'Saltado',
  statusTodo: 'Pendiente',
  statusBlocked: 'Antes, otro paso',
  next: (label: string) => `Siguiente: ${label}`,
  nextStep: 'Siguiente paso',
  backToGuide: 'Volver a la guía',
  seeAllSteps: 'Ver todos los pasos',
  hideCard: 'Ocultar esta ayuda',
  collapse: 'Encoger',
  expand: 'Ver más',
  why: 'Por qué importa',
  example: 'Ejemplo',
  sampleWarning: 'Tienes datos de ejemplo: cámbialos por los tuyos antes de publicar.',
  blockedBy: (labels: string) => `Primero necesitas: ${labels}.`,
  skip: 'Saltar este paso',
  unskip: 'Volver a ponerlo pendiente',
  markDone: 'Ya lo he hecho',
  likeStyle: 'Me gusta así, siguiente',
  save: 'Guardar',
  saved: 'Guardado ✓',
  publish: 'Publicar mi web',
  published: '¡Tu web está publicada! Google ya puede encontrarla.',
  publishHelp:
    'Mientras no la publiques, tu web funciona (puedes reservar y compartirla) pero Google no la muestra, para que no salgan datos a medio hacer.',
  publishMissing: (labels: string) => `Para publicar te falta: ${labels}.`,
  homeTitle: 'Pon en marcha tu estudio',
  homePublished: (n: number) => `Tu web ya está publicada. ${n === 1 ? 'Te queda 1 paso opcional' : `Te quedan ${n} pasos opcionales`}.`,
  previewTitle: 'Así se ve tu web',
  previewOpen: 'Ver mi web',
  previewNewTab: 'Abrir en otra pestaña',
  previewReload: 'Recargar',
  previewMobile: 'Móvil',
  previewDesktop: 'Ordenador',
  previewUnknown: 'Aún no sabemos la dirección de tu web. Revísala en Ajustes → Tu dominio.',
  previewLive: 'Vista previa de lo que estás eligiendo (aún sin guardar)',
};

/** Textos de los pasos previos que faltan en una pantalla (p. ej. el horario sin clases). */
export const PREREQ = {
  needClassTypeTitle: 'Primero crea un tipo de clase',
  needClassTypeText:
    'El horario dice qué clase se da cada día y a qué hora, así que antes necesitas tener al menos un tipo de clase (por ejemplo «Pilates Mat»). Créalo aquí mismo con una plantilla y vuelves al horario.',
  needClassTypeCta: 'Crear un tipo de clase',
  needRoomTitle: 'Primero crea una sala',
  needRoomText: 'Cada clase del horario se da en una sala. Crea la tuya (basta con un nombre y las plazas) y seguimos.',
  needRoomCta: 'Crear una sala',
  needCategoryText:
    'Para crear una clase a mano necesitas una categoría (Pilates, Yoga…). Lo más fácil: usa una plantilla, que crea la categoría por ti.',
};

/** Textos del selector de plantillas de tipos de clase. */
export const TEMPLATES_UI = {
  title: 'Crear clases desde una plantilla',
  intro:
    'Elige las clases que das. Te las creamos con su descripción (en español y en inglés), duración y créditos; después puedes cambiar lo que quieras.',
  exists: 'Ya la tienes',
  minutes: (n: number) => `${n} min`,
  credits: (n: number) => (n === 1 ? '1 crédito' : `${n} créditos`),
  capacity: (n: number) => `Grupos de unas ${n} personas`,
  customize: 'Cambiar nombre o duración',
  nameLabel: 'Nombre',
  durationLabel: 'Minutos',
  create: (n: number) => (n === 1 ? 'Crear 1 clase' : `Crear ${n} clases`),
  created: (n: number) => (n === 1 ? 'Clase creada ✓' : `${n} clases creadas ✓`),
  none: 'Elige al menos una clase.',
  fromTemplate: 'Desde una plantilla',
  manual: 'Crearla a mano',
};

/** Plantilla de texto con {n}; «sala(s)», «profesor(es)» → singular o plural según n. */
export const fill = (text: string, n: number | null | undefined) => {
  const count = n ?? 0;
  return text.replace('{n}', String(count)).replace(/\((e?s)\)/g, count === 1 ? '' : '$1');
};
