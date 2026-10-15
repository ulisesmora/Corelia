import { useCallback, useEffect, useState } from 'react';
import {
  Box, Button, ButtonBase, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, TextField, Tooltip,
} from '@mui/material';
import StudioIcon from '../../site/StudioIcon';
import { useNotify } from '../../components/guide';
import { useClassTypeColor } from '../../design/classColors';
import {
  createClassTypesFromTemplates, deleteClassType, listClassTemplates, loadWeek, updateClassType,
  type ClassTemplate, type WeekData,
} from '../api';
import { useAutosave, useStepGuard } from './autosave';
import { FieldError } from './ui';

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Chip { key: string; id: number | null; title: string; minutes: number; sub: string; credits: number }

/** Paso 5: qué clases ofreces (plantillas; tocar = elegir, el lápiz = cambiar). */
export default function StepClasses({ onChanged }: { onChanged?: (classes: WeekData['class_types']) => void }) {
  const notify = useNotify();
  const { track } = useAutosave();
  const color = useClassTypeColor();
  const [templates, setTemplates] = useState<ClassTemplate[] | null>(null);
  const [own, setOwn] = useState<WeekData['class_types']>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Chip | null>(null);

  const reload = useCallback(async () => {
    const [t, w] = await Promise.all([listClassTemplates(), loadWeek()]);
    setTemplates(t.templates);
    setOwn(w.class_types);
    onChanged?.(w.class_types);
  }, [onChanged]);

  useEffect(() => { reload().catch((e) => setError(errText(e))); }, [reload]);

  const selectedCount = own.length;
  useStepGuard(() => {
    if (!selectedCount) { setError('Elige al menos una clase.'); return false; }
    return true;
  });

  const toggle = async (chip: Chip) => {
    setBusy(chip.key);
    setError('');
    try {
      if (chip.id) await track(deleteClassType(chip.id));
      else await track(createClassTypesFromTemplates([{ key: chip.key }]));
      await reload();
    } catch (e) {
      notify(errText(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (!templates) return error ? <FieldError>{error}</FieldError> : <CircularProgress aria-label="Cargando las clases" />;

  const templateIds = new Set(templates.map((t) => t.id).filter(Boolean));
  const chips: Chip[] = [
    // Las que ya tienes y no salen de una plantilla (o les cambiaste el nombre)
    ...own.filter((c) => !templateIds.has(c.id)).map((c) => ({ key: `own-${c.id}`, id: c.id, title: c.title, minutes: c.duration_minutes, sub: 'Tuya', credits: c.credits })),
    ...templates.map((t) => {
      const mine = t.exists ? own.find((c) => c.id === t.id) : undefined;
      return { key: t.key, id: t.exists ? t.id : null, title: t.title, minutes: mine?.duration_minutes ?? t.duration_minutes, sub: t.category_name, credits: mine?.credits ?? t.credits };
    }),
  ];

  return (
    <Box>
      <Box role="group" aria-label="Tipos de clase" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
        {chips.map((c) => {
          const on = Boolean(c.id);
          const tone = color(c.id ?? c.key);
          return (
            <Box key={c.key} sx={{ position: 'relative' }}>
              <ButtonBase
                onClick={() => toggle(c)}
                disabled={busy !== null}
                aria-pressed={on}
                sx={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 68, p: '12px 14px', pr: on ? 10 : 6, textAlign: 'left',
                  borderRadius: 'var(--studio-radius-md)', background: 'var(--studio-surf)', border: '2px solid var(--studio-border-color)',
                  color: 'var(--studio-ink)', fontFamily: 'var(--studio-font-body)', justifyContent: 'flex-start',
                  transition: 'border-color .2s, background-color .2s',
                  '&[aria-pressed="true"]': { borderColor: 'var(--studio-primary-fill)', background: 'var(--studio-p-soft)' },
                  '[data-panel-style="brutalist"]:not([data-panel-classic]) &[aria-pressed="true"]': { borderColor: 'var(--studio-ink)', boxShadow: '3px 3px 0 var(--studio-ink)' },
                  '&.Mui-focusVisible': { outline: '2px solid var(--studio-primary-fill)', outlineOffset: 2 },
                  '&.Mui-disabled': { opacity: busy === c.key ? 0.7 : 1 },
                }}
              >
                <Box aria-hidden sx={{ width: 36, height: 36, borderRadius: 'min(var(--studio-radius-md), 10px)', display: 'grid', placeItems: 'center', flex: 'none', background: tone.tint }}>
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', background: tone.dot }} />
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Box sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{c.title}</Box>
                  <Box sx={{ fontSize: '0.8rem', color: 'var(--studio-muted)' }}>{c.minutes} min · {c.sub}</Box>
                </Box>
              </ButtonBase>
              <Box aria-hidden sx={{
                position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', width: 26, height: 26, borderRadius: '50%',
                display: 'grid', placeItems: 'center', pointerEvents: 'none',
                ...(on ? { background: 'var(--studio-primary-fill)', color: 'var(--studio-on-primary)' } : { border: '2px solid var(--studio-border-strong)' }),
              }}>
                {busy === c.key ? <CircularProgress size={14} color="inherit" /> : on && <StudioIcon name="done" sx={{ fontSize: 16 }} />}
              </Box>
              {on && (
                <Tooltip title="Cambiar nombre o duración">
                  <IconButton onClick={() => setEditing(c)} aria-label={`Cambiar ${c.title}`} sx={{ position: 'absolute', right: 46, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40 }}>
                    <StudioIcon name="settings" sx={{ fontSize: 19 }} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          );
        })}
      </Box>
      {error && <FieldError>{error}</FieldError>}
      {editing && (
        <EditClassDialog
          chip={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            await track(updateClassType(editing.id!, patch));
            await reload();
            setEditing(null);
          }}
        />
      )}
    </Box>
  );
}

function EditClassDialog({ chip, onClose, onSave }: { chip: Chip; onClose: () => void; onSave: (p: { title: string; duration_minutes: number; default_price_credits: number }) => Promise<void> }) {
  const notify = useNotify();
  const [title, setTitle] = useState(chip.title);
  const [minutes, setMinutes] = useState(String(chip.minutes));
  const [credits, setCredits] = useState(String(chip.credits));
  const [saving, setSaving] = useState(false);
  const m = Number(minutes);
  const c = Number(credits);
  const valid = title.trim() && Number.isInteger(m) && m >= 15 && m <= 600 && c >= 0 && c <= 20;
  return (
    <Dialog open onClose={onClose} aria-labelledby="edit-class-title" fullWidth maxWidth="xs">
      <DialogTitle id="edit-class-title">Cambiar la clase</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Nombre" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus slotProps={{ htmlInput: { maxLength: 160 } }} />
          <Stack direction="row" spacing={2}>
            <TextField label="Minutos" type="number" value={minutes} onChange={(e) => setMinutes(e.target.value)} slotProps={{ htmlInput: { min: 15, max: 600, step: 5, inputMode: 'numeric' } }} />
            <TextField label="Créditos" type="number" value={credits} onChange={(e) => setCredits(e.target.value)} helperText="Clases del bono que gasta" slotProps={{ htmlInput: { min: 0, max: 20, step: 1, inputMode: 'numeric' } }} />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" disabled={!valid || saving} onClick={async () => {
          setSaving(true);
          try { await onSave({ title: title.trim(), duration_minutes: m, default_price_credits: c }); } catch (e) { notify(errText(e), 'error'); } finally { setSaving(false); }
        }}>Guardar</Button>
      </DialogActions>
    </Dialog>
  );
}
