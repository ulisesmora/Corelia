import { useMemo } from 'react';
import { Alert, Box, ButtonBase, Stack, TextField, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import YouTubeIcon from '@mui/icons-material/YouTube';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import { PhotoPicker } from '../guide';
import type { StudioSettings } from './api';
import { HERO_POSES, renderHeroArt } from './hero-art';
import { styleById } from './presets';

interface Props {
  value: StudioSettings;
  onChange: (patch: Partial<StudioSettings>) => void;
  onBusyChange?: (busy: boolean) => void;
}

type Mode = StudioSettings['hero_mode'];

const MODES: { id: Mode; title: string; text: string; Icon: typeof YouTubeIcon }[] = [
  { id: 'image', title: 'Foto', text: 'Una foto tuya: el estudio, una clase, el equipo.', Icon: PhotoCameraOutlinedIcon },
  { id: 'video', title: 'Vídeo de YouTube', text: 'Un vídeo en silencio y en bucle de fondo.', Icon: YouTubeIcon },
  { id: 'illustration', title: 'Ilustración', text: 'Un dibujo de yoga, pilates o barre con tus colores.', Icon: BrushOutlinedIcon },
];

/** ID de un enlace de YouTube (watch, youtu.be, shorts, embed, live) o '' (igual que el API). */
function youtubeId(url: string): string {
  let raw = (url || '').trim();
  if (!raw) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw.replace(/^\/+/, '')}`;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return '';
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  if (!['youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) return '';
  const parts = u.pathname.split('/').filter(Boolean);
  let id = '';
  if (host === 'youtu.be') id = parts[0] || '';
  else if (parts[0] === 'watch') id = u.searchParams.get('v') || '';
  else if (parts.length >= 2 && ['shorts', 'embed', 'live', 'v', 'e'].includes(parts[0])) id = parts[1];
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
}

/** Portada de la web: foto, vídeo de YouTube o ilustración. */
export default function HeroSection({ value, onChange, onBusyChange }: Props) {
  const mode: Mode = value.hero_mode || 'image';
  const videoUrl = value.hero_video_url || '';
  const videoId = youtubeId(videoUrl);
  const videoError = videoUrl.trim() !== '' && !videoId;
  const style = styleById(value.style_preset);

  // Las posturas con el estilo y los colores ACTUALES (también los que aún no se han guardado en «Aspecto»)
  const colors = {
    primary: value.color_primary, secondary: value.color_secondary,
    dark: value.color_dark, background: value.color_background,
  };
  const colorKey = `${value.style_preset}|${colors.primary}|${colors.secondary}|${colors.dark}|${colors.background}`;
  const arts = useMemo(
    () => HERO_POSES.map((p) => ({ ...p, svg: renderHeroArt({ pose: p.id, style: value.style_preset, colors, idPrefix: 'panel' }) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colorKey],
  );

  return (
    <Stack spacing={4}>
      <Typography color="text.secondary">
        Es lo primero que se ve al entrar en tu web. El titular y la frase de debajo se cambian en «Textos de la web».
      </Typography>

      <Box role="radiogroup" aria-label="Qué quieres en la portada"
        sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
        {MODES.map(({ id, title, text, Icon }) => {
          const selected = mode === id;
          return (
            <ButtonBase key={id} role="radio" aria-checked={selected} onClick={() => onChange({ hero_mode: id })}
              sx={{
                display: 'flex', flexDirection: { xs: 'row', md: 'column' }, alignItems: { xs: 'center', md: 'flex-start' },
                gap: 2, textAlign: 'left', p: { xs: 2, md: 3 }, minHeight: { md: 168 }, borderRadius: 3,
                border: '2px solid', borderColor: selected ? 'primary.main' : 'divider',
                bgcolor: selected ? 'action.selected' : 'background.paper',
              }}>
              <Box sx={{
                width: 56, height: 56, flex: 'none', borderRadius: 2.5, display: 'grid', placeItems: 'center',
                bgcolor: selected ? 'primary.main' : 'action.hover', color: selected ? 'primary.contrastText' : 'text.primary',
              }}>
                <Icon sx={{ fontSize: 30 }} />
              </Box>
              <Box>
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Typography variant="h6" component="span" fontWeight={700}>{title}</Typography>
                  {selected && <CheckCircleIcon fontSize="small" color="primary" />}
                </Stack>
                <Typography variant="body2" color="text.secondary">{text}</Typography>
              </Box>
            </ButtonBase>
          );
        })}
      </Box>

      {mode === 'image' && (
        <Box>
          <Typography variant="h6" gutterBottom>Foto de la portada</Typography>
          <PhotoPicker value={value.hero_image_url || ''} onChange={(url) => onChange({ hero_image_url: url })}
            onBusyChange={onBusyChange} aspect="16 / 9" previewWidth={420} allowRemove
            shapeHint="Horizontal y con luz. En la web se oscurece un poco para que el texto se lea encima." />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            Si no eliges ninguna, se usa la primera foto de «Fotos de la web → Portada».
          </Typography>
        </Box>
      )}

      {mode === 'video' && (
        <Stack spacing={2.5}>
          <Typography variant="h6">Vídeo de YouTube</Typography>
          <TextField
            label="Enlace del vídeo de YouTube" fullWidth value={videoUrl}
            onChange={(e) => onChange({ hero_video_url: e.target.value })}
            placeholder="https://youtu.be/…"
            error={videoError}
            helperText={videoError
              ? 'Ese enlace no es de un vídeo de YouTube. En YouTube pulsa «Compartir» → «Copiar» y pégalo aquí.'
              : videoId
                ? 'Enlace correcto ✓'
                : 'Abre tu vídeo en YouTube, pulsa «Compartir» → «Copiar» y pégalo aquí.'}
          />
          {videoId && (
            <Box sx={{ position: 'relative', width: '100%', maxWidth: 480, aspectRatio: '16 / 9', borderRadius: 3, overflow: 'hidden', bgcolor: 'grey.900' }}>
              <Box component="img" src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="Miniatura del vídeo elegido"
                sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <Box aria-hidden sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(0,0,0,.25)' }}>
                <Box sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: 'rgba(0,0,0,.6)', display: 'grid', placeItems: 'center', color: '#fff' }}>
                  <PlayArrowRoundedIcon sx={{ fontSize: 40 }} />
                </Box>
              </Box>
            </Box>
          )}
          {videoId && videoUrl === value.hero_video_url && value.hero_video_id === videoId && !value.hero_video_poster_url && (
            <Alert severity="warning">
              No hemos podido copiar la imagen de este vídeo. Mientras tanto la web enseña tu foto de portada; vuelve a pulsar «Guardar cambios» en un rato.
            </Alert>
          )}
          <Alert severity="info">
            <b>Sobre las cookies:</b> YouTube pone sus propias cookies, así que la ley obliga a pedir permiso antes de
            cargar el vídeo. Por eso, al entrar, tus clientes ven una imagen fija del vídeo y el aviso de cookies tiene
            una opción «Vídeos». Si la aceptan, el vídeo empieza solo (en silencio y en bucle); si no, pueden pulsar
            «Ver vídeo». Quien tiene activado «reducir movimiento» o el ahorro de datos solo ve la imagen.
          </Alert>
          <Typography variant="body2" color="text.secondary">
            Consejo: un vídeo horizontal, tranquilo y sin texto, de menos de un minuto. Se reproduce sin sonido.
          </Typography>
        </Stack>
      )}

      {mode === 'illustration' && (
        <Box>
          <Typography variant="h6" gutterBottom>Elige la ilustración</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Se dibujan con tu estilo <b>{style.name}</b> y los colores de tu marca. Si cambias el estilo o los colores en
            «Aspecto», las ilustraciones cambian con ellos.
          </Typography>
          <Box role="radiogroup" aria-label="Ilustración de la portada"
            sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2 }}>
            {arts.map((a) => {
              const selected = (value.hero_illustration || 'reformer') === a.id;
              return (
                <ButtonBase key={a.id} role="radio" aria-checked={selected} onClick={() => onChange({ hero_illustration: a.id })}
                  sx={{
                    display: 'block', textAlign: 'left', borderRadius: 3, overflow: 'hidden',
                    border: '3px solid', borderColor: selected ? 'primary.main' : 'divider',
                    boxShadow: selected ? 4 : 0,
                  }}>
                  <Box aria-hidden sx={{ aspectRatio: '1 / 1', '& svg': { display: 'block', width: '100%', height: '100%' } }}
                    dangerouslySetInnerHTML={{ __html: a.svg }} />
                  <Stack direction="row" alignItems="center" spacing={0.75} sx={{ px: 1.5, py: 1 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography fontWeight={700} noWrap>{a.name}</Typography>
                      <Typography variant="body2" color="text.secondary">{a.discipline}</Typography>
                    </Box>
                    {selected && <CheckCircleIcon color="primary" />}
                  </Stack>
                </ButtonBase>
              );
            })}
          </Box>
        </Box>
      )}
    </Stack>
  );
}
