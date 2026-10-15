import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogContent, DialogTitle,
  MenuItem, Stack, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { API_BASE_URL } from '../config';
import { useNotify } from '../components/guide';
import {
  createClassTypesFromTemplates, listClassTemplates, type ClassTemplate, type SetupProgress, type TemplateItem,
} from './api';
import { TEMPLATES_UI } from './copy';
import { useSetupProgress } from './progressContext';

interface Choice {
  title: string;
  duration: string;
}

interface PickerProps {
  /** Tras crear las clases (para recargar listas de la pantalla) */
  onCreated?: (created: { id: number; title: string }[], progress: SetupProgress) => void;
  /** Botón de cancelar (en la ventana) */
  onCancel?: () => void;
  /** Dentro de una ventana: el botón se pega abajo de la ventana, no de la pantalla */
  inDialog?: boolean;
}

/**
 * Plantillas de tipos de clase (Reformer, Mat, Barre, Yoga…): se marcan las
 * que da el estudio y se crean con descripción en español e inglés, duración,
 * créditos y categoría (api/api/setup_guide.py).
 */
export function ClassTemplatesPicker({ onCreated, onCancel, inDialog }: PickerProps) {
  const notify = useNotify();
  const { apply } = useSetupProgress();
  const [templates, setTemplates] = useState<ClassTemplate[] | null>(null);
  const [instructors, setInstructors] = useState<{ id: number; name: string }[]>([]);
  const [instructorId, setInstructorId] = useState<number | ''>('');
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<Record<string, Choice>>({});
  const [saving, setSaving] = useState(false);

  const load = () => {
    setError('');
    listClassTemplates().then((d) => setTemplates(d.templates)).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    fetch(`${API_BASE_URL}v1/instructors/`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setInstructors(Array.isArray(d) ? d : d.results || []))
      .catch(() => setInstructors([]));
  };
  useEffect(() => { load(); }, []);

  const toggle = (t: ClassTemplate) => setPicked((p) => {
    const next = { ...p };
    if (next[t.key]) delete next[t.key];
    else next[t.key] = { title: t.title, duration: String(t.duration_minutes) };
    return next;
  });

  const create = async () => {
    const keys = Object.keys(picked);
    if (!keys.length) { notify(TEMPLATES_UI.none, 'warning'); return; }
    const items: TemplateItem[] = keys.map((key) => {
      const t = templates!.find((x) => x.key === key)!;
      const c = picked[key];
      const item: TemplateItem = { key };
      if (c.title.trim() && c.title.trim() !== t.title) item.title = c.title.trim();
      const minutes = Number(c.duration);
      if (minutes && minutes !== t.duration_minutes) item.duration_minutes = minutes;
      if (instructorId) item.instructor_id = instructorId;
      return item;
    });
    setSaving(true);
    try {
      const res = await createClassTypesFromTemplates(items);
      apply(res.progress);
      notify(TEMPLATES_UI.created(res.created.length || res.skipped.length));
      setPicked({});
      load();
      onCreated?.(res.created, res.progress);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (error) return <Alert severity="error" action={<Button color="inherit" onClick={load}>Reintentar</Button>}>{error}</Alert>;
  if (!templates) return <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress aria-label="Cargando plantillas" /></Stack>;

  const count = Object.keys(picked).length;
  return (
    <Stack spacing={2}>
      <Typography color="text.secondary">{TEMPLATES_UI.intro}</Typography>
      <Box
        role="group"
        aria-label={TEMPLATES_UI.title}
        sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' } }}
      >
        {templates.map((t) => {
          const choice = picked[t.key];
          const id = `tpl-${t.key}`;
          return (
            <Box
              key={t.key}
              sx={{
                p: 1.5, borderRadius: 3, border: '2px solid', opacity: t.exists ? 0.65 : 1,
                borderColor: choice ? 'primary.main' : 'divider',
                backgroundColor: choice ? 'rgb(var(--studio-primary-rgb) / 0.06)' : 'transparent',
              }}
            >
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <Checkbox
                  id={id}
                  checked={Boolean(choice)}
                  disabled={t.exists}
                  onChange={() => toggle(t)}
                  sx={{ mt: -0.5, ml: -0.5, width: 44, height: 44 }}
                />
                <Box component="label" htmlFor={id} sx={{ flex: 1, minWidth: 0, cursor: t.exists ? 'default' : 'pointer' }}>
                  <Typography sx={{ fontWeight: 600, color: 'var(--studio-dark)' }}>{t.title}</Typography>
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ my: 0.5 }}>
                    <Chip size="small" label={t.category_name} />
                    <Chip size="small" variant="outlined" label={TEMPLATES_UI.minutes(t.duration_minutes)} />
                    <Chip size="small" variant="outlined" label={TEMPLATES_UI.credits(t.credits)} />
                    {t.exists && <Chip size="small" color="success" label={TEMPLATES_UI.exists} />}
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>{t.description}</Typography>
                  <Typography variant="caption" color="text.secondary">{TEMPLATES_UI.capacity(t.capacity)}</Typography>
                </Box>
              </Stack>
              {choice && (
                <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
                  <TextField
                    size="small" label={TEMPLATES_UI.nameLabel} value={choice.title} fullWidth
                    onChange={(e) => setPicked((p) => ({ ...p, [t.key]: { ...p[t.key], title: e.target.value } }))}
                    inputProps={{ maxLength: 160 }}
                  />
                  <TextField
                    size="small" label={TEMPLATES_UI.durationLabel} value={choice.duration} type="number"
                    onChange={(e) => setPicked((p) => ({ ...p, [t.key]: { ...p[t.key], duration: e.target.value } }))}
                    inputProps={{ min: 15, max: 600, step: 5 }} sx={{ width: 110, flexShrink: 0 }}
                  />
                </Stack>
              )}
            </Box>
          );
        })}
      </Box>
      {instructors.length > 1 && (
        <TextField
          select label="¿Quién las da? (opcional)" value={instructorId}
          onChange={(e) => setInstructorId(e.target.value === '' ? '' : Number(e.target.value))}
          helperText="Puedes cambiarlo en cada clase y en cada hora del horario."
        >
          <MenuItem value="" sx={{ minHeight: 44 }}>Sin decidir todavía</MenuItem>
          {instructors.map((i) => <MenuItem key={i.id} value={i.id} sx={{ minHeight: 44 }}>{i.name}</MenuItem>)}
        </TextField>
      )}
      {/* Siempre a mano, aunque la lista sea larga (móvil) */}
      <Stack
        direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1.25} justifyContent="flex-end"
        sx={{
          position: 'sticky', zIndex: 1,
          // Fuera de una ventana, por encima de la barra de abajo del móvil (MainLayout)
          bottom: inDialog ? 0 : { xs: 'calc(68px + env(safe-area-inset-bottom))', md: 0 }, py: 1.5, mx: -0.5, px: 0.5,
          backgroundColor: 'background.paper', borderTop: '1px solid', borderColor: 'divider',
        }}
      >
        {onCancel && <Button onClick={onCancel} disabled={saving} sx={{ minHeight: 44 }}>Cancelar</Button>}
        <Button
          variant="contained" onClick={create} disabled={saving || !count} sx={{ minHeight: 48 }}
          startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}
        >
          {TEMPLATES_UI.create(count || 1)}
        </Button>
      </Stack>
    </Stack>
  );
}

/** El selector de plantillas en una ventana (horario, tipos de clase). */
export function ClassTemplatesDialog({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated?: PickerProps['onCreated'];
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={fullScreen} aria-labelledby="class-templates-title">
      <DialogTitle id="class-templates-title">{TEMPLATES_UI.title}</DialogTitle>
      <DialogContent dividers>
        <ClassTemplatesPicker
          inDialog
          onCancel={onClose}
          onCreated={(created, progress) => { onCreated?.(created, progress); onClose(); }}
        />
      </DialogContent>
    </Dialog>
  );
}
