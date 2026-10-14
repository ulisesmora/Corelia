import { useState } from 'react';
import {
  Alert, Box, Button, Chip, Divider, IconButton, InputAdornment, Link, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { LuCopy, LuCheck } from 'react-icons/lu';
import type { StudioSettings } from './api';

interface Props {
  value: StudioSettings;
  onChange: (patch: Partial<StudioSettings>) => void;
}

/** Campos de esta pestaña (StudioSettings.tsx los guarda con el botón común). */
export const MARKETING_FIELDS = [
  'google_business_url', 'google_review_url', 'facebook_url', 'tiktok_url', 'youtube_url',
  'google_site_verification', 'bing_site_verification',
  'ga4_measurement_id', 'google_ads_id', 'google_ads_purchase_label', 'google_ads_signup_label', 'meta_pixel_id',
] as const;

// Mismas reglas que el API (allí se vuelven a comprobar): así el aviso sale al escribir.
const RULES: Record<string, { re: RegExp; hint: string }> = {
  google_site_verification: { re: /^[A-Za-z0-9_-]{10,120}$/, hint: 'Pega el código (o la etiqueta <meta …> entera).' },
  bing_site_verification: { re: /^[A-Za-z0-9]{8,120}$/, hint: 'Pega el código (o la etiqueta <meta …> entera).' },
  ga4_measurement_id: { re: /^G-[A-Z0-9]{4,15}$/, hint: 'Empieza por G-, por ejemplo G-AB12CD34EF.' },
  google_ads_id: { re: /^AW-\d{6,15}$/, hint: 'Empieza por AW-, por ejemplo AW-123456789.' },
  google_ads_purchase_label: { re: /^[A-Za-z0-9_-]{4,60}$/, hint: 'Lo que va después de la barra: AW-123456789/ESTO.' },
  google_ads_signup_label: { re: /^[A-Za-z0-9_-]{4,60}$/, hint: 'Lo que va después de la barra: AW-123456789/ESTO.' },
  meta_pixel_id: { re: /^\d{10,20}$/, hint: 'Solo números (entre 10 y 20).' },
};
const isUrl = (v: string) => !v || /^https?:\/\/\S+\.\S+/.test(v);

/** Si pegan la etiqueta <meta … content="X">, nos quedamos con X. */
const fromMeta = (v: string) => v.match(/content=["']([^"']+)["']/i)?.[1] ?? v;

function CopyField({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <TextField
      label={label} value={value} fullWidth size="small" InputProps={{
        readOnly: true,
        endAdornment: (
          <InputAdornment position="end">
            <Tooltip title={done ? 'Copiado' : 'Copiar'}>
              <IconButton
                aria-label={`Copiar ${label}`}
                onClick={() => { navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }}
              >
                {done ? <LuCheck /> : <LuCopy />}
              </IconButton>
            </Tooltip>
          </InputAdornment>
        ),
      }}
    />
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return <Box component="ol" sx={{ pl: 3, m: 0, '& li': { mb: 1.2, lineHeight: 1.6 } }}>{children}</Box>;
}

function Block({ title, chip, children }: { title: string; chip?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>{title}</Typography>
        {chip}
      </Stack>
      {children}
    </Stack>
  );
}

const ok = (on: boolean, yes: string, no: string) => (
  <Chip size="small" color={on ? 'success' : 'default'} variant={on ? 'filled' : 'outlined'} label={on ? yes : no} />
);

/**
 * Google y anuncios: ficha de Google (Business Profile), redes, Search Console/Bing y
 * publicidad (Google Analytics 4, Google Ads y píxel de Meta). Todo opcional.
 * La web pide permiso de cookies sola cuando hay analítica o publicidad configurada.
 */
export default function MarketingSection({ value, onChange }: Props) {
  const v = (k: keyof StudioSettings) => String(value[k] ?? '');
  const set = (k: keyof StudioSettings, raw: string) => onChange({ [k]: raw } as Partial<StudioSettings>);
  const web = (value.web_url || '').replace(/\/+$/, '');
  const sitemap = web ? `${web}/sitemap-index.xml` : '';
  const err = (k: string) => {
    const val = v(k as keyof StudioSettings).trim();
    return Boolean(val) && RULES[k] ? !RULES[k].re.test(val) : false;
  };
  const urlErr = (k: keyof StudioSettings) => !isUrl(v(k).trim());
  const field = (k: keyof StudioSettings, label: string, placeholder: string, extra: Partial<React.ComponentProps<typeof TextField>> = {}) => (
    <TextField
      label={label} value={v(k)} placeholder={placeholder} fullWidth
      onChange={(e) => set(k, e.target.value)}
      error={err(k as string)}
      helperText={err(k as string) ? RULES[k as string].hint : extra.helperText}
      {...extra}
    />
  );
  const urlField = (k: keyof StudioSettings, label: string, placeholder: string, helper?: string) => (
    <TextField
      label={label} value={v(k)} placeholder={placeholder} fullWidth type="url"
      onChange={(e) => set(k, e.target.value.trim())}
      error={urlErr(k)} helperText={urlErr(k) ? 'Pega el enlace completo, empezando por https://' : helper}
    />
  );

  // Pegar «AW-123456789/AbCdEf» de una vez: se separa en ID + etiqueta
  const onAds = (raw: string) => {
    const m = raw.trim().match(/^(AW-\d{6,15})\/([A-Za-z0-9_-]{4,60})$/i);
    if (m) onChange({ google_ads_id: m[1].toUpperCase(), google_ads_purchase_label: m[2] } as Partial<StudioSettings>);
    else set('google_ads_id', raw.trim().toUpperCase());
  };
  const onLabel = (k: 'google_ads_purchase_label' | 'google_ads_signup_label', raw: string) => {
    const m = raw.trim().match(/^(AW-\d{6,15})\/([A-Za-z0-9_-]{4,60})$/i);
    if (m) onChange({ google_ads_id: m[1].toUpperCase(), [k]: m[2] } as Partial<StudioSettings>);
    else set(k, raw.trim());
  };

  const hasAds = Boolean(v('ga4_measurement_id') || v('google_ads_id') || v('meta_pixel_id'));

  return (
    <Stack spacing={4} divider={<Divider flexItem />}>
      {/* ── Visibilidad en Google ── */}
      <Alert severity={value.setup_completed ? 'success' : 'info'}>
        {value.setup_completed ? (
          <>Tu web <b>ya se puede encontrar en Google</b> y en los asistentes de IA (ChatGPT, Gemini…).</>
        ) : (
          <>Tu web <b>todavía no aparece en Google</b>: se activa sola cuando terminas el asistente de bienvenida,
            para que no se indexen los textos de ejemplo.</>
        )}
      </Alert>

      {/* ── 1. Ficha de Google ── */}
      <Block title="1. Tu ficha de Google" chip={ok(Boolean(v('google_business_url')), 'Conectada', 'Sin conectar')}>
        <Typography color="text.secondary">
          Es lo que más te trae clientas nuevas: aparece cuando alguien busca «pilates cerca de mí» o mira Google Maps,
          y los asistentes de IA la usan para recomendar estudios. Al conectarla, tu web y tu ficha se «reconocen»
          entre sí en Google.
        </Typography>
        <Steps>
          <li>
            Entra en <Link href="https://business.google.com/create" target="_blank" rel="noopener">Google Business Profile</Link>{' '}
            con tu cuenta de Google y crea (o reclama) la ficha de tu estudio. Categoría: «Estudio de pilates» o «Centro de yoga».
          </li>
          <li>
            Usa <b>exactamente</b> el mismo nombre, dirección y teléfono que en tu web
            {value.address || value.phone ? <> (<i>{[value.studio_name, value.address, value.city, value.phone].filter(Boolean).join(' · ')}</i>)</> : ''}.
            Google confía más cuando coinciden.
          </li>
          <li>Como web de la ficha pon: {web ? <code>{web}</code> : 'la dirección de tu web'}.</li>
          <li>
            Cuando Google la verifique, pulsa <b>Compartir perfil</b>, copia el enlace y pégalo abajo. Después pulsa
            {' '}<b>Pedir reseñas</b> y copia ese otro enlace: tu web mostrará el botón «Déjanos tu opinión en Google».
          </li>
        </Steps>
        {urlField('google_business_url', 'Enlace de tu ficha de Google', 'https://maps.app.goo.gl/…')}
        {urlField('google_review_url', 'Enlace para dejar una reseña', 'https://g.page/r/…/review',
          'Las reseñas de Google son lo que más pesa en las búsquedas locales: pídelas al acabar las clases.')}
      </Block>

      {/* ── 2. Redes ── */}
      <Block title="2. Tus redes sociales">
        <Typography color="text.secondary">
          Salen en tu web y le dicen a Google cuáles son tus perfiles oficiales. Instagram se pone en la pestaña
          {' '}«Mi estudio»{value.instagram ? <> (ahora: <b>{value.instagram}</b>)</> : ''}.
        </Typography>
        {urlField('facebook_url', 'Facebook', 'https://facebook.com/tuestudio')}
        {urlField('tiktok_url', 'TikTok', 'https://www.tiktok.com/@tuestudio')}
        {urlField('youtube_url', 'YouTube', 'https://www.youtube.com/@tuestudio')}
      </Block>

      {/* ── 3. Search Console / Bing ── */}
      <Block
        title="3. Google Search Console y Bing"
        chip={ok(Boolean(v('google_site_verification')), 'Google verificado', 'Google sin verificar')}
      >
        <Typography color="text.secondary">
          Para ver con qué búsquedas te encuentran y avisar a Google de cada cambio. Bing alimenta también a ChatGPT y Copilot.
        </Typography>
        <Steps>
          <li>
            Abre <Link href="https://search.google.com/search-console" target="_blank" rel="noopener">Google Search Console</Link>,
            pulsa <b>Añadir propiedad</b> y elige <b>Prefijo de la URL</b> con {web ? <code>{web}</code> : 'la dirección de tu web'}.
          </li>
          <li>En los métodos de verificación elige <b>Etiqueta HTML</b>, cópiala entera y pégala aquí. Guarda y vuelve a Search Console a pulsar <b>Verificar</b>.</li>
          <li>Ya verificada, en <b>Sitemaps</b> envía esta dirección:</li>
        </Steps>
        {sitemap && <CopyField label="Tu sitemap" value={sitemap} />}
        <TextField
          label="Código de verificación de Google" value={v('google_site_verification')} fullWidth
          placeholder='<meta name="google-site-verification" content="…" />'
          onChange={(e) => set('google_site_verification', fromMeta(e.target.value.trim()))}
          error={err('google_site_verification')} helperText={err('google_site_verification') ? RULES.google_site_verification.hint : ''}
        />
        <Typography color="text.secondary">
          <b>Bing:</b> en <Link href="https://www.bing.com/webmasters" target="_blank" rel="noopener">Bing Webmaster Tools</Link>{' '}
          lo más fácil es <b>Importar desde Google Search Console</b> (no hace falta código). Si prefieres la etiqueta, pégala aquí:
        </Typography>
        <TextField
          label="Código de verificación de Bing (opcional)" value={v('bing_site_verification')} fullWidth
          placeholder='<meta name="msvalidate.01" content="…" />'
          onChange={(e) => set('bing_site_verification', fromMeta(e.target.value.trim()))}
          error={err('bing_site_verification')} helperText={err('bing_site_verification') ? RULES.bing_site_verification.hint : ''}
        />
      </Block>

      {/* ── 4. Publicidad y analítica ── */}
      <Block title="4. Publicidad y analítica" chip={ok(hasAds, 'Activa', 'Sin configurar')}>
        <Typography color="text.secondary">
          Si haces anuncios en Google o en Instagram/Facebook, conéctalos aquí para saber cuántas clientas te traen.
          Tu web avisa sola a Google y a Meta cuando alguien <b>se registra</b>, <b>compra un bono</b>,
          {' '}<b>reserva una clase</b> o <b>te escribe</b>.
        </Typography>
        <Alert severity="info">
          Por ley (RGPD), tu web mostrará un aviso de cookies y solo activará esta medición si la visitante acepta.
          Lo hace sola: no tienes que hacer nada.
        </Alert>

        <Typography sx={{ fontWeight: 700 }}>Google Analytics 4</Typography>
        <Typography color="text.secondary" sx={{ mt: '-8px !important' }}>
          En <Link href="https://analytics.google.com" target="_blank" rel="noopener">Google Analytics</Link>: Administrar →
          Flujos de datos → Web → copia el <b>ID de medición</b>.
        </Typography>
        {field('ga4_measurement_id', 'ID de medición (G-…)', 'G-AB12CD34EF', {
          onChange: (e) => set('ga4_measurement_id', e.target.value.trim().toUpperCase()),
        })}

        <Typography sx={{ fontWeight: 700 }}>Google Ads</Typography>
        <Steps>
          <li>
            En <Link href="https://ads.google.com" target="_blank" rel="noopener">Google Ads</Link>: Objetivos → Conversiones →
            {' '}<b>Nueva acción de conversión</b> → Sitio web. Crea una llamada «Compra» (categoría Compra) y, si quieres, otra «Registro».
          </li>
          <li>
            Al terminar elige <b>Instalar la etiqueta tú mismo</b> → <b>Fragmento de evento</b>. Verás algo como
            {' '}<code>send_to: 'AW-123456789/AbC-D_efG'</code>: pega ese texto entero en cada casilla y lo separamos solos.
          </li>
        </Steps>
        <TextField
          label="ID de Google Ads (AW-…)" value={v('google_ads_id')} fullWidth placeholder="AW-123456789"
          onChange={(e) => onAds(e.target.value)}
          error={err('google_ads_id')} helperText={err('google_ads_id') ? RULES.google_ads_id.hint : ''}
        />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Etiqueta de «Compra»" value={v('google_ads_purchase_label')} fullWidth placeholder="AbC-D_efG"
            onChange={(e) => onLabel('google_ads_purchase_label', e.target.value)}
            error={err('google_ads_purchase_label')}
            helperText={err('google_ads_purchase_label') ? RULES.google_ads_purchase_label.hint : 'Bonos y clases pagadas en la web.'}
          />
          <TextField
            label="Etiqueta de «Registro» (opcional)" value={v('google_ads_signup_label')} fullWidth placeholder="XyZ12_ab"
            onChange={(e) => onLabel('google_ads_signup_label', e.target.value)}
            error={err('google_ads_signup_label')}
            helperText={err('google_ads_signup_label') ? RULES.google_ads_signup_label.hint : 'Clientas nuevas que crean su cuenta.'}
          />
        </Stack>

        <Typography sx={{ fontWeight: 700 }}>Meta (Instagram y Facebook)</Typography>
        <Typography color="text.secondary" sx={{ mt: '-8px !important' }}>
          En <Link href="https://business.facebook.com/events_manager2" target="_blank" rel="noopener">Administrador de eventos</Link>:
          Conectar orígenes de datos → Web → crea el píxel y copia su <b>identificador</b> (solo números).
        </Typography>
        {field('meta_pixel_id', 'Identificador del píxel de Meta', '1234567890123456', {
          onChange: (e) => set('meta_pixel_id', e.target.value.replace(/\D/g, '')),
          inputProps: { inputMode: 'numeric' },
        })}
        {hasAds && (
          <Box>
            <Button variant="outlined" component="a" href={web || '#'} target="_blank" rel="noopener" disabled={!web}>
              Abrir mi web para probar
            </Button>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Acepta las cookies en tu web y comprueba en Google Analytics («Tiempo real») o en el Administrador de
              eventos de Meta («Probar eventos») que llegan las visitas.
            </Typography>
          </Box>
        )}
      </Block>
    </Stack>
  );
}
