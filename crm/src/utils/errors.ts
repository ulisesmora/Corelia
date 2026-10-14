/**
 * Convierte cualquier fallo (de red, de sesión o de validación de la API) en
 * una frase que se entienda sin saber de informática.
 *
 *   } catch (e) { notify(await friendlyError(e), 'error'); }
 *   if (!res.ok) throw await friendlyError(res);   // o: notify(await friendlyError(res), 'error')
 */

const FIELD_NAMES: Record<string, string> = {
  email: 'Email',
  username: 'Email',
  slug: 'Dirección de la página',
  image: 'Foto',
  website: 'Página web',
  instagram: 'Instagram',
  google_business_url: 'Enlace de tu ficha de Google',
  google_review_url: 'Enlace para dejar una reseña',
  facebook_url: 'Facebook',
  tiktok_url: 'TikTok',
  youtube_url: 'YouTube',
  google_site_verification: 'Código de verificación de Google',
  bing_site_verification: 'Código de verificación de Bing',
  ga4_measurement_id: 'ID de Google Analytics',
  google_ads_id: 'ID de Google Ads',
  google_ads_purchase_label: 'Etiqueta de «Compra»',
  google_ads_signup_label: 'Etiqueta de «Registro»',
  meta_pixel_id: 'Píxel de Meta',
  hero_mode: 'Portada',
  hero_image_url: 'Foto de la portada',
  hero_video_url: 'Vídeo de YouTube',
  hero_illustration: 'Ilustración',
  valid_from: 'Desde',
  valid_to: 'Hasta',
  discount_type: 'Tipo de descuento',
  value: 'Valor',
  first_name: 'Nombre',
  last_name: 'Apellidos',
  name: 'Nombre',
  phone: 'Teléfono',
  password: 'Contraseña',
  price: 'Precio',
  credits: 'Créditos',
  amount: 'Cantidad',
  code: 'Código',
  title: 'Título',
  start_time: 'Hora de inicio',
  end_time: 'Hora de fin',
  start_date: 'Fecha de inicio',
  end_date: 'Fecha de fin',
  room: 'Sala',
  instructor: 'Instructor/a',
  class_type: 'Clase',
  capacity_max: 'Plazas',
  user: 'Clienta',
  plan: 'Plan',
  description: 'Descripción',
  non_field_errors: '',
  detail: '',
};

const COMMON: [RegExp, string][] = [
  [/already exists|ya existe|must make a unique set/i, 'ya existe uno igual'],
  [/enter a valid url|url válida|introduzca una url/i, 'la dirección no es válida (debe empezar por https://)'],
  [/valid choice|opción válida/i, 'esa opción no es válida'],
  [/this field is required|este campo es requerido|obligatorio/i, 'falta rellenarlo'],
  [/may not be blank|no puede estar en blanco/i, 'no puede quedar vacío'],
  [/valid email|email válido|correo electrónico válido/i, 'el email no parece correcto (revisa la @ y el punto)'],
  [/valid (integer|number)|número válido/i, 'tiene que ser un número'],
  [/date has wrong format|formato de fecha/i, 'la fecha no es correcta'],
  [/time has wrong format|formato de hora/i, 'la hora no es correcta'],
];

function translate(msg: string): string {
  for (const [re, nice] of COMMON) if (re.test(msg)) return nice;
  return msg;
}

function flatten(data: unknown): string[] {
  if (data == null) return [];
  if (typeof data === 'string') return [translate(data)];
  if (Array.isArray(data)) return data.flatMap(flatten);
  if (typeof data === 'object') {
    return Object.entries(data as Record<string, unknown>).flatMap(([k, v]) => {
      const label = k in FIELD_NAMES ? FIELD_NAMES[k] : k.replace(/_/g, ' ');
      return flatten(v).map((m) => (label ? `${label}: ${m}` : m));
    });
  }
  return [String(data)];
}

export async function friendlyError(e: unknown): Promise<string> {
  if (e instanceof Response) {
    if (e.status === 401) return 'Tu sesión ha caducado. Sal y vuelve a entrar con tu usuario.';
    if (e.status === 403) return 'Tu usuario no tiene permiso para hacer esto.';
    if (e.status === 404) return 'No se ha encontrado. Puede que alguien lo haya borrado: recarga la página.';
    if (e.status >= 500) return 'El servidor ha tenido un problema. Espera un minuto y vuelve a intentarlo.';
    try {
      const data = await e.clone().json();
      if (data && typeof data === 'object' && 'user_errors' in data) {
        const lines = flatten((data as Record<string, unknown>).user_errors).filter(Boolean);
        if (lines.length) return `Revisa esto: ${lines.slice(0, 3).join(' · ')}`;
      }
      const lines = flatten(data).filter(Boolean);
      if (lines.length) return `Revisa esto: ${lines.slice(0, 3).join(' · ')}`;
    } catch { /* respuesta sin JSON */ }
    return 'No se ha podido guardar. Revisa los datos y vuelve a intentarlo.';
  }
  if (e instanceof TypeError) {
    return 'No hay conexión con el servidor. Comprueba el internet y vuelve a intentarlo.';
  }
  if (e instanceof Error && e.message) return e.message;
  return 'Algo no ha ido bien. Vuelve a intentarlo.';
}
