import { useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, IconButton, Stack } from '@mui/material';
import StudioIcon from '../../site/StudioIcon';
import { useNotify } from '../../components/guide';
import { createRoom, deleteRoom, listRooms, updateRoom } from '../api';
import { useAutosave, useDebouncedSave, useStepGuard } from './autosave';
import { inputSx, srOnly } from './styles';
import { AddRow, EditRow, FieldError } from './ui';

interface Room { id: number; name: string; capacity: number }

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Paso 3: las salas y cuántas personas caben (se guarda al momento). */
export default function StepRooms() {
  const notify = useNotify();
  const { track } = useAutosave();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [error, setError] = useState('');
  const creating = useRef<Promise<Room> | null>(null);

  useEffect(() => {
    let alive = true;
    listRooms()
      .then(async (list) => {
        // Sin salas: «Sala principal» para empezar (se puede cambiar)
        if (!list.length) {
          creating.current ??= track(createRoom('Sala principal', 10));
          list = [await creating.current];
        }
        if (alive) setRooms(list);
      })
      .catch((e) => alive && setError(errText(e)));
    return () => { alive = false; };
  }, [track]);

  const save = useDebouncedSave(async (r: Room) => {
    if (!r.name.trim()) return;
    try {
      await updateRoom(r.id, { name: r.name.trim(), capacity: r.capacity });
    } catch (e) {
      notify(errText(e), 'error');
      throw e;
    }
  }, 600);

  useStepGuard(() => {
    if (!rooms?.length) { setError('Añade al menos una sala.'); return false; }
    if (rooms.some((r) => !r.name.trim())) { setError('Ponle nombre a cada sala.'); return false; }
    return true;
  });

  const change = (id: number, patch: Partial<Room>) => {
    const next = (rooms || []).map((r) => (r.id === id ? { ...r, ...patch } : r));
    const room = next.find((r) => r.id === id);
    setRooms(next);
    if (room) save(room, String(id));
    setError('');
  };

  const add = async () => {
    const names = new Set((rooms || []).map((r) => r.name.toLowerCase()));
    let n = (rooms?.length || 0) + 1;
    for (let tries = 0; tries < 6; tries += 1, n += 1) {
      const name = `Sala ${n}`;
      if (names.has(name.toLowerCase())) continue;
      try {
        const room = await track(createRoom(name, 10));
        setRooms((list) => [...(list || []), room]);
        window.setTimeout(() => document.getElementById(`room-${room.id}`)?.focus(), 30);
        return;
      } catch { /* ese nombre ya existía (quizá borrada): probamos otro */ }
    }
    notify('No se ha podido añadir la sala. Prueba otra vez.', 'error');
  };

  const remove = async (room: Room) => {
    try {
      await track(deleteRoom(room.id));
      setRooms((list) => (list || []).filter((r) => r.id !== room.id));
    } catch (e) {
      notify(errText(e), 'error');
    }
  };

  if (!rooms) return error ? <FieldError>{error}</FieldError> : <CircularProgress aria-label="Cargando las salas" />;

  return (
    <Stack spacing={1.25}>
      {rooms.map((r, i) => (
        <EditRow key={r.id}>
          <StudioIcon name="rooms" aria-hidden sx={{ color: 'var(--studio-muted)' }} />
          <Box component="label" htmlFor={`room-${r.id}`} sx={srOnly}>Nombre de la sala {i + 1}</Box>
          <Box
            component="input"
            id={`room-${r.id}`}
            value={r.name}
            maxLength={120}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => change(r.id, { name: e.target.value })}
            sx={inputSx}
          />
          <Box role="group" aria-label={`Plazas de ${r.name || 'la sala'}`} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
            <IconButton onClick={() => change(r.id, { capacity: Math.max(1, r.capacity - 1) })} aria-label="Una plaza menos" disabled={r.capacity <= 1} sx={stepBtn}>
              <Box component="span" aria-hidden sx={{ fontSize: '1.3rem', lineHeight: 1 }}>−</Box>
            </IconButton>
            <Box aria-live="polite" sx={{ minWidth: 64, textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {r.capacity} <Box component="span" sx={{ fontWeight: 500, color: 'var(--studio-muted)', fontSize: '0.85rem' }}>plazas</Box>
            </Box>
            <IconButton onClick={() => change(r.id, { capacity: Math.min(200, r.capacity + 1) })} aria-label="Una plaza más" sx={stepBtn}>
              <StudioIcon name="plus" sx={{ fontSize: 20 }} />
            </IconButton>
          </Box>
          <IconButton onClick={() => remove(r)} aria-label={`Quitar ${r.name || 'la sala'}`} disabled={rooms.length < 2} sx={{ width: 44, height: 44 }}>
            <StudioIcon name="close" sx={{ fontSize: 20 }} />
          </IconButton>
        </EditRow>
      ))}
      <AddRow label="Añadir sala" onClick={add} />
      {error && <FieldError>{error}</FieldError>}
    </Stack>
  );
}

const stepBtn = { width: 44, height: 44, border: '1px solid var(--studio-border-color)', background: 'var(--studio-surf2)', color: 'var(--studio-ink)' } as const;
