import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import StudioIcon from '../../site/StudioIcon';
import { useClassTypeColor } from '../../design/classColors';
import { currencySymbol } from '../../site/money';
import { invalidateChargingFacts } from '../../components/charging';
import ClassTypeManagement from '../Bots';
import type { CatalogHandle } from './embed';
import { catalogApi, num, type ClassTypeRow, type InstructorRow } from './api';
import { AddTile, Avatar, CardActions, CardList, InlineField, ItemCard, TabStatus } from './ui';

/** Pestaña «Tipos de clase»: nombre, minutos, créditos y precio de la clase suelta, aquí mismo. */
export default function TypesTab() {
  const page = useRef<CatalogHandle>(null);
  const color = useClassTypeColor();
  const [rows, setRows] = useState<ClassTypeRow[] | null>(null);
  const [team, setTeam] = useState<InstructorRow[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [types, inst] = await Promise.all([catalogApi.classTypes(), catalogApi.instructors().catch(() => [])]);
      setRows(types.sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.title.localeCompare(b.title)));
      setTeam(inst);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows((r) => r || []);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = (ct: ClassTypeRow, body: Partial<Record<keyof ClassTypeRow, unknown>>) => async () => {
    await catalogApi.patch('class-types', ct.id, body);
    // Solo lo cambiado (la respuesta puede traer la categoría como número)
    setRows((list) => (list || []).map((x) => (x.id === ct.id ? { ...x, ...body } as ClassTypeRow : x)));
    invalidateChargingFacts();
  };
  const photoOf = (id?: number) => team.find((i) => i.id === id)?.image || null;
  const sym = currencySymbol();

  return (
    <>
      <ClassTypeManagement embedded ref={page} onChanged={load} />
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 1.5 }}>
        <Typography sx={{ flex: '1 1 220px', color: 'var(--studio-muted)', fontSize: '0.92rem' }}>
          Toca un dato para cambiarlo. Los créditos son lo que gasta cada clase del bono.
        </Typography>
        <Button variant="outlined" startIcon={<StudioIcon name="categories" />} onClick={() => page.current?.templates?.()} sx={{ minHeight: 44 }}>
          Desde plantillas
        </Button>
      </Box>
      {rows === null || error ? <TabStatus loading={rows === null} error={error} onRetry={load} /> : (
        <CardList label="Tipos de clase">
          {rows.map((ct) => {
            const tone = color(ct.id, ct.title);
            return (
              <ItemCard
                key={ct.id}
                stripe={tone.dot}
                muted={!ct.is_active}
                head={(
                  <>
                    <InlineField big type="text" label="Nombre de la clase" value={ct.title}
                      onSave={(v) => save(ct, { title: v })()} />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                      <Avatar name={ct.instructor?.name || '?'} src={photoOf(ct.instructor?.id)} size={32} />
                      <Typography noWrap sx={{ fontSize: '0.86rem', color: 'var(--studio-muted)', maxWidth: 140 }}>
                        {ct.instructor?.name || 'Sin profesor'}
                      </Typography>
                    </Box>
                    <Box sx={{ flexBasis: '100%', display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: -0.5 }}>
                      {ct.category && <Chip bg={tone.tint}>{ct.category.name}</Chip>}
                      {!ct.is_active && <Chip>Oculta en la web</Chip>}
                    </Box>
                  </>
                )}
                fields={(
                  <>
                    <InlineField label="Minutos" value={ct.duration_minutes} min={15} step={5} size={3} suffix="min"
                      onSave={(v) => save(ct, { duration_minutes: Number(v) })()} />
                    <InlineField label="Créditos" value={num(ct.default_price_credits)} min={0} step={0.5} size={3}
                      onSave={(v) => save(ct, { default_price_credits: Number(v) })()} />
                    <InlineField label="Clase suelta" value={num(ct.default_price_eur)} min={0} step={0.5} size={4} suffix={sym}
                      onSave={(v) => save(ct, { default_price_eur: Number(v) })()} />
                  </>
                )}
                footer={<CardActions name={ct.title} onEdit={() => page.current?.edit(ct)} onRemove={() => page.current?.remove(ct)} />}
              />
            );
          })}
          <AddTile label="Añadir tipo de clase" onClick={() => page.current?.create()} />
        </CardList>
      )}
    </>
  );
}

function Chip({ children, bg }: { children: string; bg?: string }) {
  return (
    <Box component="span" sx={{
      display: 'inline-flex', alignItems: 'center', minHeight: 24, px: 1.1, borderRadius: 'var(--studio-radius-chip)', fontSize: '0.76rem',
      fontWeight: 700, background: bg || 'var(--studio-surf2)', color: 'var(--studio-ink)', whiteSpace: 'nowrap',
    }}>
      {children}
    </Box>
  );
}
