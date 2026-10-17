import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, IconButton, Paper, Rating, Stack, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { useConfirm, useNotify } from '../guide';
import { deleteTestimonial, listTestimonials, saveTestimonial, type Testimonial } from './api';

const EMPTY: Testimonial = { author: '', text: '', text_en: '', rating: 5, source: '', photo_url: '', order: 0, is_active: true };

/** Opiniones reales de clientes para la portada (siempre con su permiso). */
export default function TestimonialEditor() {
  const notify = useNotify();
  const confirm = useConfirm();
  const [items, setItems] = useState<Testimonial[] | null>(null);
  const [editing, setEditing] = useState<Testimonial | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => listTestimonials().then(setItems).catch((e) => notify(String(e.message || e), 'error'));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (t: Testimonial) => {
    if (!t.author.trim() || !t.text.trim()) {
      notify('Escribe el nombre y la opinión.', 'error');
      return;
    }
    setSaving(true);
    try {
      await saveTestimonial(t);
      setEditing(null);
      await load();
      notify('Opinión guardada ✓');
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: Testimonial) => {
    if (!(await confirm({ title: `¿Borrar la opinión de ${t.author}?`, confirmText: 'Sí, borrar', tone: 'danger' }))) return;
    await deleteTestimonial(t.id!);
    load();
  };

  if (!items) return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 160 }}><CircularProgress /></Box>;

  return (
    <Stack spacing={2}>
      <Typography color="text.secondary">
        Copia aquí opiniones reales (por ejemplo, tus reseñas de Google), siempre con permiso de quien la escribió.
        Si no añades ninguna, la sección no aparece en la web.
      </Typography>
      {items.length === 0 && !editing && <Alert severity="info">Todavía no hay opiniones.</Alert>}
      {items.map((t) => (
        <Paper key={t.id} variant="outlined" sx={{ p: 2, borderRadius: 2, opacity: t.is_active ? 1 : 0.55 }}>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Rating value={t.rating} readOnly size="small" />
              <Typography sx={{ fontStyle: 'italic', whiteSpace: 'pre-line' }}>“{t.text}”</Typography>
              <Typography fontWeight={700} sx={{ mt: 0.5 }}>{t.author}{t.source ? ` · ${t.source}` : ''}</Typography>
            </Box>
            <Tooltip title="Editar"><IconButton onClick={() => setEditing(t)}><EditOutlinedIcon /></IconButton></Tooltip>
            <Tooltip title="Borrar"><IconButton onClick={() => remove(t)}><DeleteOutlineIcon /></IconButton></Tooltip>
          </Stack>
        </Paper>
      ))}
      {editing ? (
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, borderColor: 'primary.main' }}>
          <Stack spacing={2}>
            <Typography variant="h6">{editing.id ? 'Editar opinión' : 'Nueva opinión'}</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Nombre" value={editing.author} onChange={(e) => setEditing({ ...editing, author: e.target.value })}
                fullWidth helperText="Basta el nombre y la inicial: «Marta G.»" />
              <TextField label="Dónde la dejó (opcional)" value={editing.source} onChange={(e) => setEditing({ ...editing, source: e.target.value })}
                fullWidth placeholder="Google" />
            </Stack>
            <TextField label="Opinión" value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} fullWidth multiline minRows={3} />
            <TextField label="Opinión en inglés (opcional)" value={editing.text_en} onChange={(e) => setEditing({ ...editing, text_en: e.target.value })} fullWidth multiline minRows={2} />
            <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap" useFlexGap>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography>Estrellas</Typography>
                <Rating value={editing.rating} onChange={(_, v) => setEditing({ ...editing, rating: v || 5 })} />
              </Stack>
              <Stack direction="row" alignItems="center">
                <Switch checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
                <Typography>{editing.is_active ? 'Visible' : 'Oculta'}</Typography>
              </Stack>
            </Stack>
            <Stack direction="row" spacing={2}>
              <Button variant="contained" onClick={() => save(editing)} disabled={saving}>Guardar</Button>
              <Button onClick={() => setEditing(null)}>Cancelar</Button>
            </Stack>
          </Stack>
        </Paper>
      ) : (
        <Button startIcon={<AddIcon />} variant="outlined" size="large" sx={{ alignSelf: 'flex-start' }}
          onClick={() => setEditing({ ...EMPTY, order: (items[items.length - 1]?.order ?? 0) + 1 })}>
          Añadir una opinión
        </Button>
      )}
    </Stack>
  );
}
