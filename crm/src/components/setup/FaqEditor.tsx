import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, IconButton, MenuItem, Paper, Stack, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { useConfirm, useNotify } from '../guide';
import { deleteFaq, listFaqs, saveFaq, type FAQItem } from './api';

const EMPTY: FAQItem = { question: '', answer: '', question_en: '', answer_en: '', page: 'both', order: 0, is_active: true };
const PAGE_LABEL = { both: 'Portada y precios', home: 'Portada', prices: 'Precios' };

/**
 * Preguntas frecuentes de la web. Además de ayudar a tus clientas, son lo
 * que más usan Google y los asistentes de IA para recomendar un negocio.
 */
export default function FaqEditor() {
  const notify = useNotify();
  const confirm = useConfirm();
  const [items, setItems] = useState<FAQItem[] | null>(null);
  const [editing, setEditing] = useState<FAQItem | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => listFaqs().then(setItems).catch((e) => notify(String(e.message || e), 'error'));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (item: FAQItem) => {
    if (!item.question.trim() || !item.answer.trim()) {
      notify('Escribe la pregunta y la respuesta.', 'error');
      return;
    }
    setSaving(true);
    try {
      await saveFaq(item);
      setEditing(null);
      await load();
      notify('Pregunta guardada ✓');
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: FAQItem) => {
    if (!(await confirm({ title: `¿Borrar «${item.question}»?`, confirmText: 'Sí, borrar', tone: 'danger' }))) return;
    await deleteFaq(item.id!);
    load();
  };

  const move = async (index: number, dir: -1 | 1) => {
    if (!items) return;
    const other = items[index + dir];
    if (!other) return;
    const current = items[index];
    await Promise.all([saveFaq({ ...current, order: other.order === current.order ? current.order + dir : other.order }),
      saveFaq({ ...other, order: current.order })]);
    load();
  };

  if (!items) return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 160 }}><CircularProgress /></Box>;

  return (
    <Stack spacing={2}>
      <Typography color="text.secondary">
        Responde a lo que más te preguntan: si hace falta experiencia, qué traer, cómo funcionan los bonos, cómo
        cancelar… Aparecen en tu web y Google las puede mostrar directamente en los resultados.
      </Typography>
      {items.length === 0 && <Alert severity="info">Todavía no hay preguntas. Añade la primera.</Alert>}
      {items.map((f, i) => (
        <Paper key={f.id} variant="outlined" sx={{ p: 2, borderRadius: 2, opacity: f.is_active ? 1 : 0.55 }}>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography fontWeight={700}>{f.question}</Typography>
              <Typography color="text.secondary" sx={{ whiteSpace: 'pre-line', mt: 0.5 }}>{f.answer}</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={PAGE_LABEL[f.page]} />
                {!f.question_en && <Chip size="small" variant="outlined" label="Sin inglés" />}
                {!f.is_active && <Chip size="small" color="warning" label="Oculta" />}
                {f.is_sample && (
                  <Tooltip title="Es un texto de ejemplo: edítala con tus palabras para que Google la tenga en cuenta.">
                    <Chip size="small" color="info" variant="outlined" label="Ejemplo: edítala" />
                  </Tooltip>
                )}
              </Stack>
            </Box>
            <Stack>
              <Tooltip title="Subir"><span><IconButton disabled={i === 0} onClick={() => move(i, -1)}><ArrowUpwardIcon /></IconButton></span></Tooltip>
              <Tooltip title="Bajar"><span><IconButton disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDownwardIcon /></IconButton></span></Tooltip>
            </Stack>
            <Stack>
              <Tooltip title="Editar"><IconButton onClick={() => setEditing(f)}><EditOutlinedIcon /></IconButton></Tooltip>
              <Tooltip title="Borrar"><IconButton onClick={() => remove(f)}><DeleteOutlineIcon /></IconButton></Tooltip>
            </Stack>
          </Stack>
        </Paper>
      ))}

      {editing ? (
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, borderColor: 'primary.main' }}>
          <Stack spacing={2}>
            <Typography variant="h6">{editing.id ? 'Editar pregunta' : 'Nueva pregunta'}</Typography>
            <TextField label="Pregunta" value={editing.question} onChange={(e) => setEditing({ ...editing, question: e.target.value })} fullWidth />
            <TextField label="Respuesta" value={editing.answer} onChange={(e) => setEditing({ ...editing, answer: e.target.value })} fullWidth multiline minRows={3} />
            <TextField label="Pregunta en inglés (opcional)" value={editing.question_en} onChange={(e) => setEditing({ ...editing, question_en: e.target.value })} fullWidth />
            <TextField label="Respuesta en inglés (opcional)" value={editing.answer_en} onChange={(e) => setEditing({ ...editing, answer_en: e.target.value })} fullWidth multiline minRows={2} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
              <TextField select label="Dónde se muestra" value={editing.page} sx={{ minWidth: 220 }}
                onChange={(e) => setEditing({ ...editing, page: e.target.value as FAQItem['page'] })}>
                {Object.entries(PAGE_LABEL).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
              </TextField>
              <Stack direction="row" alignItems="center">
                <Switch checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
                <Typography>{editing.is_active ? 'Visible en la web' : 'Oculta'}</Typography>
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
          Añadir una pregunta
        </Button>
      )}
    </Stack>
  );
}
