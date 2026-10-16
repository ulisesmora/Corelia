// Pestañas «Profesores», «Categorías» y «Salas» de «Clases y precios».
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import StudioIcon from '../../site/StudioIcon';
import { useClassTypeColor } from '../../design/classColors';
import InstructorManagement from '../InstructorsManagment';
import CategoriesManagement from '../Categories';
import RoomsManagement from '../Rooms';
import type { CatalogHandle } from './embed';
import { catalogApi, type CategoryRow, type ClassTypeRow, type InstructorRow, type RoomRow } from './api';
import { AddTile, Avatar, CardActions, CardList, InlineField, ItemCard, TabStatus } from './ui';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** La fila tal cual la da el API (sin lo que se añade aquí para pintar). */
function strip<T extends object, K extends keyof T>(row: T, key: K): Omit<T, K> {
  const copy = { ...row };
  delete copy[key];
  return copy;
}

function useRows<T>(fetcher: () => Promise<T[]>) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try { setRows(await fetcher()); } catch (e) { setError(e instanceof Error ? e.message : String(e)); setRows((r) => r || []); }
  }, [fetcher]);
  useEffect(() => { load(); }, [load]);
  return { rows, setRows, error, load };
}

const hint = (text: string) => (
  <Typography sx={{ color: 'var(--studio-muted)', fontSize: '0.92rem', mb: 1.5 }}>{text}</Typography>
);

// ── Profesores ───────────────────────────────────────────────────────────

const loadTeam = async () => {
  const [inst, types] = await Promise.all([catalogApi.instructors(), catalogApi.classTypes().catch(() => [] as ClassTypeRow[])]);
  return inst.map((i) => ({ ...i, classes: types.filter((t) => t.instructor?.id === i.id && t.is_active).map((t) => t.title) }));
};

export function TeamTab() {
  const page = useRef<CatalogHandle>(null);
  const { rows, setRows, error, load } = useRows(loadTeam);
  const save = (i: InstructorRow, body: Partial<InstructorRow>) => async () => {
    await catalogApi.patch('instructors', i.id, body);
    setRows((list) => (list || []).map((x) => (x.id === i.id ? { ...x, ...body } : x)));
  };
  return (
    <>
      <InstructorManagement embedded ref={page} onChanged={load} />
      {hint('Su foto, su nombre y su bio salen en tu web. Toca el nombre para cambiarlo.')}
      {rows === null || error ? <TabStatus loading={rows === null} error={error} onRetry={load} /> : (
        <CardList label="Profesores" min={280}>
          {rows.map((i) => (
            <ItemCard
              key={i.id}
              head={(
                <>
                  <Avatar name={i.name} src={i.image} size={52} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <InlineField big type="text" label="Nombre" value={i.name} onSave={(v) => save(i, { name: v })()} />
                    <Typography sx={{ fontSize: '0.84rem', color: 'var(--studio-muted)' }}>
                      {i.classes.length ? i.classes.slice(0, 3).join(' · ') + (i.classes.length > 3 ? ` y ${i.classes.length - 3} más` : '') : 'Aún sin clases'}
                    </Typography>
                  </Box>
                </>
              )}
              footer={<CardActions name={i.name} editLabel="Foto y bio" onEdit={() => page.current?.edit(strip(i, 'classes'))} onRemove={() => page.current?.remove(strip(i, 'classes'))} />}
            />
          ))}
          <AddTile label="Añadir profesor" onClick={() => page.current?.create()} />
        </CardList>
      )}
    </>
  );
}

// ── Categorías ───────────────────────────────────────────────────────────

const loadCategories = async () => {
  const [cats, types] = await Promise.all([catalogApi.categories(), catalogApi.classTypes().catch(() => [] as ClassTypeRow[])]);
  return cats.map((c) => ({ ...c, types: types.filter((t) => t.category?.id === c.id) }));
};

export function CategoriesTab() {
  const page = useRef<CatalogHandle>(null);
  const color = useClassTypeColor();
  const { rows, setRows, error, load } = useRows(loadCategories);
  const save = (c: CategoryRow, body: Partial<CategoryRow>) => async () => {
    await catalogApi.patch('categories', c.id, body);
    setRows((list) => (list || []).map((x) => (x.id === c.id ? { ...x, ...body } : x)));
  };
  return (
    <>
      <CategoriesManagement embedded ref={page} onChanged={load} />
      {hint('Agrupan tus clases en la web (Pilates, Yoga…). Con 3 o 4 basta.')}
      {rows === null || error ? <TabStatus loading={rows === null} error={error} onRetry={load} /> : (
        <CardList label="Categorías" min={280}>
          {rows.map((c) => (
            <ItemCard
              key={c.id}
              stripe={c.color || color(c.types[0]?.id ?? c.id, c.types[0]?.title || c.name).dot}
              head={<InlineField big type="text" label="Nombre de la categoría" value={c.name} onSave={(v) => save(c, { name: v })()} />}
              fields={(
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
                  <StudioIcon name="classTypes" aria-hidden sx={{ fontSize: 18, color: 'var(--studio-muted)' }} />
                  <Typography sx={{ fontSize: '0.86rem', color: 'var(--studio-muted)' }}>
                    {c.types.length ? `${plural(c.types.length, 'clase', 'clases')}: ${c.types.slice(0, 3).map((t) => t.title).join(', ')}${c.types.length > 3 ? '…' : ''}` : 'Sin clases todavía'}
                  </Typography>
                </Box>
              )}
              footer={<CardActions name={c.name} onEdit={() => page.current?.edit(strip(c, 'types'))} onRemove={() => page.current?.remove(strip(c, 'types'))} />}
            />
          ))}
          <AddTile label="Añadir categoría" onClick={() => page.current?.create()} />
        </CardList>
      )}
    </>
  );
}

// ── Salas ────────────────────────────────────────────────────────────────

export function RoomsTab() {
  const page = useRef<CatalogHandle>(null);
  const { rows, setRows, error, load } = useRows(catalogApi.rooms);
  const save = (r: RoomRow, body: Partial<RoomRow>) => async () => {
    await catalogApi.patch('rooms', r.id, body);
    setRows((list) => (list || []).map((x) => (x.id === r.id ? { ...x, ...body } : x)));
  };
  return (
    <>
      <RoomsManagement embedded ref={page} onChanged={load} />
      {hint('Dónde se dan las clases y cuántas personas caben.')}
      {rows === null || error ? <TabStatus loading={rows === null} error={error} onRetry={load} /> : (
        <CardList label="Salas" min={280}>
          {rows.map((r) => (
            <ItemCard
              key={r.id}
              head={<InlineField big type="text" label="Nombre de la sala" value={r.name} onSave={(v) => save(r, { name: v })()} />}
              fields={(
                <>
                  <InlineField label="Caben" value={r.capacity} min={1} size={3} suffix="personas"
                    validate={(v) => (Number.isInteger(Number(v)) ? '' : 'Escribe un número entero.')}
                    onSave={(v) => save(r, { capacity: Number(v) })()} />
                  {r.location && (
                    <Typography sx={{ fontSize: '0.86rem', color: 'var(--studio-muted)', display: 'flex', gap: 0.5, alignItems: 'center', pb: 1.25 }}>
                      <StudioIcon name="rooms" aria-hidden sx={{ fontSize: 16 }} />{r.location}
                    </Typography>
                  )}
                </>
              )}
              footer={<CardActions name={r.name} editLabel="Foto y descripción" onEdit={() => page.current?.edit(r)} onRemove={() => page.current?.remove(r)} />}
            />
          ))}
          <AddTile label="Añadir sala" onClick={() => page.current?.create()} />
        </CardList>
      )}
    </>
  );
}
