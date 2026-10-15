// Mi web: las secciones de la web con lo que enseña cada una (y un enlace a su
// editor), interruptores donde se pueden apagar de verdad (opiniones, preguntas
// y galería), la vista previa en ordenador o móvil, el dominio y la app.
// Datos: GET /api/v1/dashboard/web/ (api/utils/dashboard.py).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, IconButton, Skeleton, Switch, Tooltip, Typography,
} from '@mui/material';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import DesktopWindowsOutlinedIcon from '@mui/icons-material/DesktopWindowsOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LanguageRoundedIcon from '@mui/icons-material/LanguageRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import PhoneIphoneOutlinedIcon from '@mui/icons-material/PhoneIphoneOutlined';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { useNotify } from '../../components/guide';
import { useStudioWebUrl } from '../../site/SiteProvider';
import { dashApi, type WebData, type WebSection } from '../kit/api';
import { Card, CardHead, IBadge, KitIcon, PageHead, Seg, Tag, TonalButton } from '../kit/ui';

type Device = 'desktop' | 'mobile';
const DESKTOP_WIDTH = 1280;
const LS_HIDDEN = 'miweb.hidden.'; // ids ocultados con el interruptor (para volver a mostrar justo esos)

function readIds(key: string): number[] | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(LS_HIDDEN + key) || 'null');
    return Array.isArray(v) && v.length ? v : undefined;
  } catch { return undefined; }
}
function writeIds(key: string, ids: number[] | null) {
  try {
    if (ids && ids.length) localStorage.setItem(LS_HIDDEN + key, JSON.stringify(ids));
    else localStorage.removeItem(LS_HIDDEN + key);
  } catch { /* sin almacenamiento */ }
}

function Preview({ url, device, reloadKey }: { url: string; device: Device; reloadKey: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const height = device === 'desktop' ? 640 : 700;
  const scale = device === 'desktop' ? Math.min(1, w / DESKTOP_WIDTH) : 1;
  const host = url.replace(/^https?:\/\//, '');
  return (
    <Box ref={box} sx={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
      <Box sx={{
        width: device === 'mobile' ? 'min(100%, 390px)' : '100%', borderRadius: 'min(16px, var(--studio-radius-lg))', overflow: 'hidden',
        background: 'var(--studio-bg)', border: '1px solid var(--studio-border-color)', boxShadow: '0 18px 50px rgb(var(--studio-shadow-rgb) / 0.14)',
      }}>
        <Box aria-hidden sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 1.1, background: 'var(--studio-surf2)', borderBottom: '1px solid var(--studio-border-color)' }}>
          {[0, 1, 2].map((i) => <Box key={i} component="i" sx={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--studio-border-strong)' }} />)}
          <Box component="span" sx={{ ml: 1.25, fontSize: '0.72rem', color: 'var(--studio-muted)', background: 'var(--studio-surf)', px: 1.25, py: 0.4, borderRadius: 99, flex: 1, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{host}</Box>
        </Box>
        <Box sx={{ height, overflow: 'hidden', display: 'flex', justifyContent: 'center', background: '#fff' }}>
          <Box component="iframe" key={`${reloadKey}-${device}`} src={url} title="Vista previa de tu web" loading="lazy"
            sx={{
              border: 0, flex: 'none', width: device === 'desktop' ? DESKTOP_WIDTH : '100%', height: device === 'desktop' ? height / scale : '100%',
              transform: device === 'desktop' ? `scale(${scale})` : undefined, transformOrigin: 'top center',
            }} />
        </Box>
      </Box>
    </Box>
  );
}

export default function MyWebPage() {
  const navigate = useNavigate();
  const notify = useNotify();
  const siteUrl = useStudioWebUrl();
  const [data, setData] = useState<WebData | null>(null);
  const [error, setError] = useState('');
  const [device, setDevice] = useState<Device>(() => (typeof window !== 'undefined' && window.innerWidth < 900 ? 'mobile' : 'desktop'));
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setError('');
    dashApi.web().then(setData).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  const webUrl = (siteUrl || data?.web_url || '').replace(/\/$/, '');

  const toggle = async (s: WebSection, visible: boolean) => {
    setBusy(s.key);
    try {
      const r = await dashApi.setSection(s.key, visible, visible ? readIds(s.key) : undefined);
      writeIds(s.key, visible ? null : r.ids);
      setData((d) => d && {
        ...d,
        sections: d.sections.map((x) => (x.key === s.key ? { ...x, visible: r.active > 0, count: r.active, total: r.total } : x)),
      });
      setReloadKey((k) => k + 1);
      notify(visible ? `${s.label}: se ven en tu web.` : `${s.label}: ocultas en tu web.`);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const shown = data?.sections.filter((s) => s.visible).length ?? 0;

  return (
    <Box sx={{ pb: 2 }}>
      <PageHead icon={<LanguageRoundedIcon />} title="Mi web" tint="privada"
        actions={webUrl ? (
          <Button variant="contained" component="a" href={webUrl} target="_blank" rel="noopener" startIcon={<OpenInNewRoundedIcon />}>Ver mi web</Button>
        ) : undefined} />

      {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" onClick={load}>Reintentar</Button>}>{error}</Alert>}
      {data && !data.published && (
        <Alert severity="info" sx={{ mb: 2 }} action={<Button color="inherit" onClick={() => navigate('/puesta-en-marcha')}>Publicar</Button>}>
          Tu web aún no está publicada: los buscadores no la ven todavía.
        </Alert>
      )}

      <Box sx={{ display: 'grid', gap: 2.25, alignItems: 'start', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: '370px minmax(0, 1fr)' } }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.25, minWidth: 0 }}>
          <Card labelledBy="sec-h" id="web-secs">
            <CardHead id="sec-h" title="Secciones" right={data ? <Typography sx={{ fontSize: '0.84rem', color: 'var(--studio-muted)' }}>{shown} de {data.sections.length} se ven</Typography> : undefined} />
            {!data ? [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={56} />) : (
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {data.sections.map((s) => (
                  <Box component="li" key={s.key} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 1, minHeight: 60, borderTop: '1px solid var(--studio-border-color)', '&:first-of-type': { borderTop: 0 } }}>
                    <IBadge size={34} tone={s.visible ? 'p' : 'n'}><KitIcon name={s.icon} size={18} /></IBadge>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--studio-ink)' }}>
                        {s.label}{s.count ? <Box component="span" sx={{ fontWeight: 500, color: 'var(--studio-muted)' }}> · {s.count}</Box> : null}
                      </Typography>
                      <Typography sx={{ fontSize: '0.8rem', color: 'var(--studio-muted)' }}>
                        {s.visible ? s.hint : (s.toggle ? 'Oculta en tu web' : s.empty)}
                      </Typography>
                    </Box>
                    <Tooltip title={`Editar ${s.label.toLowerCase()}`}>
                      <IconButton onClick={() => navigate(s.edit)} aria-label={`Editar ${s.label}`} sx={{ width: 40, height: 40 }}><EditOutlinedIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    {s.toggle ? (
                      <Switch checked={s.visible} disabled={busy === s.key} onChange={(e) => toggle(s, e.target.checked)}
                        slotProps={{ input: { 'aria-label': `Mostrar ${s.label} en la web` } }} />
                    ) : s.key === 'hero' ? (
                      <Tag tone="n">Siempre</Tag>
                    ) : (
                      <Tag tone={s.visible ? 'ok' : 'n'}>{s.visible ? 'Se ve' : 'Vacía'}</Tag>
                    )}
                  </Box>
                ))}
              </Box>
            )}
            <Typography sx={{ mt: 1, fontSize: '0.8rem', color: 'var(--studio-muted)' }}>
              Cada sección aparece sola cuando tiene contenido. Opiniones, preguntas y galería se pueden ocultar sin borrarlas.
            </Typography>
          </Card>

          <Card labelledBy="dom-h">
            <CardHead id="dom-h" title="Tu dirección" />
            {!data ? <Skeleton height={64} /> : data.domain ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1.5, borderRadius: 'var(--studio-radius-md)', background: 'var(--studio-ok-soft)', color: 'var(--studio-ok)' }}>
                <CheckCircleOutlineRoundedIcon aria-hidden />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, color: 'var(--studio-ink)', fontSize: '0.92rem', overflowWrap: 'anywhere' }}>{data.domain}</Typography>
                  <Typography sx={{ fontSize: '0.8rem', color: 'var(--studio-ink)', opacity: 0.8 }}>Dominio propio conectado</Typography>
                </Box>
              </Box>
            ) : (
              <Box sx={{ p: 1.5, borderRadius: 'var(--studio-radius-md)', background: 'var(--studio-surf2)' }}>
                <Typography sx={{ fontWeight: 700, color: 'var(--studio-ink)', fontSize: '0.92rem', overflowWrap: 'anywhere' }}>{webUrl.replace(/^https?:\/\//, '')}</Typography>
                <Typography sx={{ fontSize: '0.8rem', color: 'var(--studio-muted)', mb: 1 }}>La dirección que te da el servidor. Puedes usar la tuya (tuestudio.com).</Typography>
                <TonalButton size="small" onClick={() => navigate('/ajustes?tab=dominio')}>Conectar mi dominio</TonalButton>
              </Box>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.75 }}>
              <IBadge size={34}><PhoneIphoneOutlinedIcon sx={{ fontSize: 18 }} /></IBadge>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, color: 'var(--studio-ink)', fontSize: '0.92rem' }}>App para tus clientas</Typography>
                <Typography sx={{ fontSize: '0.8rem', color: 'var(--studio-muted)' }}>
                  Incluida · iPhone y Android{data && data.app.clients ? ` · ${data.app.clients} ${data.app.clients === 1 ? 'clienta la tiene' : 'clientas la tienen'}` : ''}
                </Typography>
              </Box>
              <Tag tone="ok">Activa</Tag>
            </Box>
            <TonalButton fullWidth startIcon={<PaletteOutlinedIcon />} onClick={() => navigate('/ajustes?tab=aspecto')} sx={{ mt: 2 }}>
              Cambiar estilo y colores
            </TonalButton>
          </Card>

          {data && (
            <Card labelledBy="mes-h">
              <CardHead id="mes-h" title={`En ${data.month.label}`} />
              <Box sx={{ display: 'flex', gap: 3 }}>
                {[[data.month.bookings, 'reservas'], [data.month.signups, 'altas desde la web']].map(([n, l]) => (
                  <Box key={String(l)}>
                    <Typography sx={{ fontFamily: 'var(--studio-font-heading)', fontWeight: 'var(--studio-heading-weight)', fontSize: '1.6rem', color: 'var(--studio-ink)', fontVariantNumeric: 'tabular-nums' }}>{n}</Typography>
                    <Typography sx={{ fontSize: '0.82rem', color: 'var(--studio-muted)' }}>{l}</Typography>
                  </Box>
                ))}
              </Box>
            </Card>
          )}
        </Box>

        <Box component="section" aria-label="Vista previa" sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="overline" component="h2" sx={{ color: 'var(--studio-muted)', flex: 1 }}>Vista previa</Typography>
            <Tooltip title="Recargar">
              <IconButton onClick={() => setReloadKey((k) => k + 1)} aria-label="Recargar la vista previa" sx={{ width: 40, height: 40 }}><RefreshRoundedIcon fontSize="small" /></IconButton>
            </Tooltip>
            <Seg mode="toggle" label="Dispositivo" value={device} onChange={setDevice} options={[
              { value: 'desktop', label: <><DesktopWindowsOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />Ordenador</> },
              { value: 'mobile', label: <><PhoneIphoneOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />Móvil</> },
            ]} />
          </Box>
          {webUrl ? <Preview url={webUrl} device={device} reloadKey={reloadKey} /> : <Skeleton variant="rounded" height={480} />}
        </Box>
      </Box>
    </Box>
  );
}
