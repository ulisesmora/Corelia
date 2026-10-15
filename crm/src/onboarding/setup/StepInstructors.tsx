import { useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, IconButton, Stack, Switch, Typography } from '@mui/material';
import StudioIcon from '../../site/StudioIcon';
import { useNotify } from '../../components/guide';
import { useAuth } from '../../context/AuthContext';
import { createInstructor, deleteInstructor, listInstructors, renameInstructor } from '../api';
import { useAutosave, useDebouncedSave, useStepGuard } from './autosave';
import { inputSx, srOnly } from './styles';
import { AddRow, EditRow, FieldError } from './ui';

interface Row { key: string; id: number | null; name: string }

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const SAMPLE = '(ejemplo)';
let seq = 0;
const newKey = () => `n${(seq += 1)}`;

/** Paso 4: quién da las clases (con «Doy yo todas las clases»). */
export default function StepInstructors() {
  const notify = useNotify();
  const { user } = useAuth();
  const { track } = useAutosave();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const rowsRef = useRef<Row[]>([]);
  const creating = useRef(new Map<string, Promise<number>>());
  rowsRef.current = rows || [];
  const myName = (user?.name || '').trim() || (user?.email || '').split('@')[0];

  useEffect(() => {
    let alive = true;
    listInstructors()
      .then((list) => {
        if (!alive) return;
        const real = list.filter((i) => !i.name.includes(SAMPLE));
        setRows(real.length ? real.map((i) => ({ key: `i${i.id}`, id: i.id, name: i.name })) : [{ key: newKey(), id: null, name: '' }]);
      })
      .catch((e) => alive && setError(errText(e)));
    return () => { alive = false; };
  }, []);

  // Escribir un nombre: crea la ficha (la primera vez) o la renombra
  const save = useDebouncedSave(async (key: string) => {
    const row = rowsRef.current.find((r) => r.key === key);
    const name = row?.name.trim();
    if (!row || !name) return;
    try {
      // Si aún se está creando (se siguió escribiendo), se espera y se renombra
      const inFlight = creating.current.get(key);
      const id = row.id ?? (inFlight ? await inFlight : null);
      if (id) {
        await renameInstructor(id, name);
      } else {
        const p = createInstructor(name).then((c) => c.id);
        creating.current.set(key, p);
        const newId = await p;
        rowsRef.current = rowsRef.current.map((r) => (r.key === key ? { ...r, id: newId } : r));
        setRows((list) => (list || []).map((r) => (r.key === key ? { ...r, id: newId } : r)));
      }
    } catch (e) {
      notify(errText(e), 'error');
      throw e;
    }
  }, 700);

  const me = (rows || []).find((r) => r.name.trim().toLowerCase() === myName.toLowerCase());

  useStepGuard(() => {
    if (!(rows || []).some((r) => r.name.trim())) { setError('Añade al menos una persona.'); return false; }
    return true;
  });

  const change = (key: string, name: string) => {
    setRows((list) => (list || []).map((r) => (r.key === key ? { ...r, name } : r)));
    save(key, key);
    setError('');
  };

  const remove = async (row: Row) => {
    try {
      const id = row.id ?? (await creating.current.get(row.key)) ?? null;
      if (id) await track(deleteInstructor(id));
      setRows((list) => {
        const next = (list || []).filter((r) => r.key !== row.key);
        return next.length ? next : [{ key: newKey(), id: null, name: '' }];
      });
    } catch (e) {
      notify(errText(e), 'error');
    }
  };

  const toggleMe = async (on: boolean) => {
    if (on && !me) {
      try {
        const created = await track(createInstructor(myName));
        setRows((list) => {
          const rest = (list || []).filter((r) => r.name.trim() || r.id);
          return [{ key: `i${created.id}`, id: created.id, name: created.name }, ...rest];
        });
        setError('');
      } catch (e) { notify(errText(e), 'error'); }
    } else if (!on && me) {
      await remove(me);
    }
  };

  const add = () => {
    const key = newKey();
    setRows((list) => [...(list || []), { key, id: null, name: '' }]);
    window.setTimeout(() => document.getElementById(`inst-${key}`)?.focus(), 30);
  };

  if (!rows) return error ? <FieldError>{error}</FieldError> : <CircularProgress aria-label="Cargando" />;

  return (
    <Stack spacing={1.25}>
      {myName && (
        <EditRow>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography id="me-teach" sx={{ fontWeight: 700, color: 'var(--studio-ink)' }}>Doy yo todas las clases</Typography>
            <Typography sx={{ color: 'var(--studio-muted)', fontSize: '0.88rem' }}>Te añadimos como «{myName}»</Typography>
          </Box>
          <Switch checked={Boolean(me)} onChange={(e) => toggleMe(e.target.checked)} slotProps={{ input: { 'aria-labelledby': 'me-teach' } }} />
        </EditRow>
      )}
      {rows.map((r, i) => (
        <EditRow key={r.key}>
          <Box aria-hidden sx={{ width: 36, height: 36, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: '0.8rem', background: 'var(--studio-c-yoga)', color: 'var(--studio-ink)' }}>
            {(r.name.trim()[0] || '?').toUpperCase()}
          </Box>
          <Box component="label" htmlFor={`inst-${r.key}`} sx={srOnly}>Persona {i + 1}: nombre</Box>
          <Box component="input" id={`inst-${r.key}`} value={r.name} placeholder="Nombre y apellido" maxLength={120} autoComplete="off"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => change(r.key, e.target.value)} sx={inputSx} />
          <IconButton onClick={() => remove(r)} aria-label={`Quitar ${r.name || 'esta fila'}`} sx={{ width: 44, height: 44 }}>
            <StudioIcon name="close" sx={{ fontSize: 20 }} />
          </IconButton>
        </EditRow>
      ))}
      <AddRow label="Añadir otra persona" onClick={add} />
      {error && <FieldError>{error}</FieldError>}
    </Stack>
  );
}
