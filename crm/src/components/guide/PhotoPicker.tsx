import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, ButtonBase, CircularProgress, Collapse, Stack, TextField, Typography,
} from '@mui/material';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { friendlyError } from '../../utils/errors';
import { authHeaders } from '../../utils/auth';
import { API_BASE_URL } from '../../config';

// Selector de fotos común: Tipos de clase, Instructores, Salas y Fotos de la web.

const MAX_MB = 10;
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface PhotoPickerProps {
  /** Dirección de la foto actual ('' si no hay) */
  value: string;
  onChange: (url: string) => void;
  /** Avisa al formulario mientras se sube (para desactivar "Guardar") */
  onBusyChange?: (busy: boolean) => void;
  /** Proporción del recorte que se usa en la web, en CSS: '3 / 4', '16 / 9'… */
  aspect?: string;
  /** Qué parte de la foto se conserva al recortar ('center' o 'top') */
  objectPosition?: string;
  /** Explicación de forma y contenido recomendados */
  shapeHint?: ReactNode;
  previewWidth?: number;
  /** Permite dejar el elemento sin foto */
  allowRemove?: boolean;
}

/**
 * Elegir una foto: pulsar o arrastrar, vista previa con el mismo recorte que
 * la web, subida inmediata con "Subiendo foto…" y mensajes claros si la foto
 * pesa demasiado o tiene un formato raro. La foto nueva solo sustituye a la
 * anterior cuando se pulsa "Guardar" en el formulario.
 */
export function PhotoPicker({
  value, onChange, onBusyChange, aspect = '16 / 9', objectPosition = 'center',
  shapeHint, previewWidth = 300, allowRemove,
}: PhotoPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [original] = useState(value);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [broken, setBroken] = useState(false);
  const [showUrl, setShowUrl] = useState(false);

  useEffect(() => () => { if (localPreview) URL.revokeObjectURL(localPreview); }, [localPreview]);

  const shown = localPreview || value;
  useEffect(() => { setBroken(false); }, [shown]);

  const setBusyBoth = (b: boolean) => { setBusy(b); onBusyChange?.(b); };

  const handleFile = async (file?: File | null) => {
    setError('');
    setWarnings([]);
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (/\.(heic|heif)$/.test(lower) || /heic|heif/.test(file.type)) {
      setError('Esta foto está en formato HEIC (el de los iPhone) y muchos navegadores no la muestran. Truco: envíatela por WhatsApp, guarda la que te llega y sube esa.');
      return;
    }
    if (!OK_TYPES.includes(file.type)) {
      setError('Ese archivo no es una foto que la web pueda mostrar. Elige una foto en formato JPG, PNG o WEBP.');
      return;
    }
    const mb = file.size / 1024 / 1024;
    if (mb > MAX_MB) {
      setError(`La foto pesa ${mb.toFixed(1)} MB y el máximo es ${MAX_MB} MB. Truco: envíatela por WhatsApp y guarda la que te llega, que pesa mucho menos.`);
      return;
    }
    const preview = URL.createObjectURL(file);
    setLocalPreview(preview);
    if (mb > 3) setWarnings([`Pesa ${mb.toFixed(1)} MB: se sube bien, pero la web tardará un poco más en cargarla.`]);
    const probe = new Image();
    probe.onload = () => {
      if (Math.max(probe.naturalWidth, probe.naturalHeight) < 800) {
        setWarnings((w) => [...w, 'La foto es pequeña y puede verse borrosa en pantallas grandes. Si tienes una más grande, mejor.']);
      }
    };
    probe.src = preview;

    setBusyBoth(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      // La subida exige sesión de administración. Sin Content-Type: el
      // navegador pone el del multipart con su boundary.
      const res = await fetch(`${API_BASE_URL}upload/`, { method: 'POST', headers: authHeaders(), body: fd });
      if (!res.ok) throw res;
      const data = await res.json();
      const url: string = data.file_url || data.url || data.file || '';
      if (!url) throw new Error('El servidor no ha devuelto la foto. Vuelve a intentarlo.');
      onChange(url);
    } catch (e) {
      setLocalPreview(null);
      setWarnings([]);
      setError(`No se ha podido subir la foto. ${await friendlyError(e)}`);
    } finally {
      setBusyBoth(false);
    }
  };

  const pick = () => inputRef.current?.click();
  const changed = value !== original && Boolean(value);

  return (
    <Box>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept="image/jpeg,image/png,image/webp,image/heic,.heic,.heif"
        onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
        <Box sx={{ width: '100%', maxWidth: previewWidth, flexShrink: 0 }}>
          <Box
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
            sx={{
              position: 'relative', width: '100%', aspectRatio: aspect, borderRadius: 3, overflow: 'hidden',
              border: shown && !broken ? '1px solid rgb(var(--studio-dark-rgb) / 0.12)' : '2px dashed rgb(var(--studio-primary-rgb) / 0.55)',
              backgroundColor: dragOver ? 'rgb(var(--studio-primary-rgb) / 0.15)' : 'rgb(var(--studio-bg-rgb) / 0.7)',
              outline: dragOver ? '3px solid var(--studio-primary)' : 'none',
            }}
          >
            {shown && !broken ? (
              <Box
                component="img"
                src={shown}
                alt="Vista previa de la foto"
                onError={() => setBroken(true)}
                sx={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition, display: 'block' }}
              />
            ) : (
              <ButtonBase
                onClick={pick}
                disabled={busy}
                sx={{ position: 'absolute', inset: 0, flexDirection: 'column', gap: 0.75, p: 2, textAlign: 'center' }}
              >
                <AddPhotoAlternateOutlinedIcon aria-hidden sx={{ fontSize: 40, color: 'var(--studio-primary)' }} />
                <Typography sx={{ fontWeight: 600, color: 'var(--studio-dark)', fontSize: '0.98rem' }}>
                  {broken ? 'No se puede mostrar esta foto' : 'Pulsa aquí para elegir una foto'}
                </Typography>
                <Typography sx={{ fontSize: '0.9rem', color: 'var(--studio-text-body)' }}>
                  {broken ? 'Puede que la dirección no sea correcta. Elige otra.' : 'o arrástrala hasta aquí'}
                </Typography>
              </ButtonBase>
            )}
            {busy && (
              <Stack
                role="status"
                alignItems="center"
                justifyContent="center"
                spacing={1}
                sx={{ position: 'absolute', inset: 0, backgroundColor: 'rgb(var(--studio-bg-light-rgb) / 0.8)' }}
              >
                <CircularProgress size={32} />
                <Typography sx={{ fontWeight: 600, color: 'var(--studio-dark)' }}>Subiendo foto…</Typography>
              </Stack>
            )}
          </Box>
          {shown && !broken && (
            <Typography sx={{ mt: 0.75, fontSize: '0.88rem', color: 'var(--studio-text-body)', textAlign: 'center' }}>
              Así se verá recortada en la web
            </Typography>
          )}
        </Box>

        <Stack spacing={1.25} sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button
              variant={shown ? 'outlined' : 'contained'}
              startIcon={<AddPhotoAlternateOutlinedIcon />}
              onClick={pick}
              disabled={busy}
              sx={{ minHeight: 48 }}
            >
              {shown ? 'Cambiar la foto' : 'Elegir una foto'}
            </Button>
            {allowRemove && shown && (
              <Button
                variant="text"
                color="inherit"
                onClick={() => { setLocalPreview(null); onChange(''); }}
                disabled={busy}
                sx={{ minHeight: 48 }}
              >
                Quitar la foto
              </Button>
            )}
          </Stack>
          {shapeHint && (
            <Typography sx={{ fontSize: '0.92rem', color: 'var(--studio-text-strong)', lineHeight: 1.55 }}>{shapeHint}</Typography>
          )}
          <Typography sx={{ fontSize: '0.9rem', color: 'var(--studio-text-body)' }}>
            Fotos JPG, PNG o WEBP de hasta {MAX_MB} MB.
          </Typography>
          {error && <Alert severity="error" sx={{ fontSize: '0.92rem' }}>{error}</Alert>}
          {warnings.map((w) => <Alert key={w} severity="warning" sx={{ fontSize: '0.92rem' }}>{w}</Alert>)}
          {changed && !busy && (
            <Alert severity="info" sx={{ fontSize: '0.92rem' }}>
              {original
                ? 'Foto nueva lista. La anterior se cambia cuando pulses «Guardar»; si cancelas, se queda la de antes.'
                : 'Foto lista. Se guardará cuando pulses «Guardar».'}
            </Alert>
          )}
          <Box>
            <Button
              variant="text"
              size="small"
              onClick={() => setShowUrl((s) => !s)}
              endIcon={<ExpandMoreIcon sx={{ transform: showUrl ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
              sx={{ minHeight: 44, px: 1 }}
            >
              ¿La foto ya está en internet?
            </Button>
            <Collapse in={showUrl} unmountOnExit>
              <TextField
                label="Dirección de la foto"
                value={value}
                onChange={(e) => { setLocalPreview(null); onChange(e.target.value.trim()); }}
                placeholder="https://…"
                helperText="Pega aquí la dirección completa de la foto (la que empieza por https://)."
                fullWidth
                size="small"
                sx={{ mt: 1 }}
              />
            </Collapse>
          </Box>
        </Stack>
      </Stack>
    </Box>
  );
}
