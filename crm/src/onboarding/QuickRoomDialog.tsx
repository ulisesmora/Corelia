import { useState } from 'react';
import {
  Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography,
} from '@mui/material';
import { useNotify } from '../components/guide';
import { createRoom } from './api';

/** Crear una sala con lo mínimo (nombre y plazas) sin salir de la pantalla. */
export default function QuickRoomDialog({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated?: (room: { id: number; name: string; capacity: number }) => void;
}) {
  const notify = useNotify();
  const [name, setName] = useState('Sala principal');
  const [capacity, setCapacity] = useState('10');
  const [saving, setSaving] = useState(false);
  const cap = Number(capacity);
  const valid = name.trim().length > 0 && Number.isInteger(cap) && cap >= 1;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const room = await createRoom(name.trim(), cap);
      notify(`Sala «${room.name}» creada ✓`);
      onCreated?.(room);
      onClose();
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="xs" aria-labelledby="quick-room-title">
      <DialogTitle id="quick-room-title">Crear una sala</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography color="text.secondary">
            Basta con el nombre y cuántas personas caben. La foto y la descripción las puedes poner después en «Salas».
          </Typography>
          <TextField
            label="Nombre de la sala" value={name} onChange={(e) => setName(e.target.value)} required autoFocus
            inputProps={{ maxLength: 120 }} error={!name.trim()}
          />
          <TextField
            label="Plazas" type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} required
            inputProps={{ min: 1, max: 500 }} error={!(cap >= 1)}
            helperText="Cuántas personas caben a la vez (máquinas o esterillas)."
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving} sx={{ minHeight: 44 }}>Cancelar</Button>
        <Button
          variant="contained" onClick={save} disabled={!valid || saving} sx={{ minHeight: 44 }}
          startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}
        >
          Crear la sala
        </Button>
      </DialogActions>
    </Dialog>
  );
}
