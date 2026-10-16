// «Clases y precios» (/clases-y-precios): lo que se cambia a menudo, en un
// sitio y con pestañas: Tipos de clase · Precios y bonos · Profesores ·
// Categorías · Salas. Cada dato se cambia tocándolo (se guarda solo); para
// lo demás (fotos, textos, inglés) se abren las ventanas de siempre de cada
// pantalla completa (montadas en modo `embedded`, ver ./embed.ts).
// ?tab=tipos|precios|profes|categorias|salas · ?accion=nueva abre «Añadir».
import { useRef, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Button, ButtonBase } from '@mui/material';
import StudioIcon, { type StudioIconName } from '../../site/StudioIcon';
import { useOpenGuide } from '../../components/charging';
import { useLocks } from '../../onboarding/locks';
import { PageHead } from '../kit/ui';
import PricesTab from './PricesTab';
import TypesTab from './TypesTab';
import { CategoriesTab, RoomsTab, TeamTab } from './OtherTabs';

export type CatalogTab = 'tipos' | 'precios' | 'profes' | 'categorias' | 'salas';

const TABS: { key: CatalogTab; label: string; short: string; icon: StudioIconName }[] = [
  { key: 'tipos', label: 'Tipos de clase', short: 'Clases', icon: 'classTypes' },
  { key: 'precios', label: 'Precios y bonos', short: 'Precios', icon: 'plans' },
  { key: 'profes', label: 'Profesores', short: 'Profes', icon: 'instructors' },
  { key: 'categorias', label: 'Categorías', short: 'Categorías', icon: 'categories' },
  { key: 'salas', label: 'Salas', short: 'Salas', icon: 'rooms' },
];

export default function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const openGuide = useOpenGuide();
  const locks = useLocks();
  const tab = TABS.find((t) => t.key === params.get('tab'))?.key || 'tipos';
  const listRef = useRef<HTMLDivElement>(null);

  const select = (key: CatalogTab, focus = false) => {
    setParams((p) => { const n = new URLSearchParams(p); n.set('tab', key); n.delete('accion'); return n; }, { replace: true });
    if (focus) window.setTimeout(() => (listRef.current?.querySelector(`[data-t="${key}"]`) as HTMLElement | null)?.focus(), 0);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.key === tab);
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = TABS.length - 1;
    if (n < 0) return;
    e.preventDefault();
    select(TABS[n].key, true);
  };

  return (
    <Box>
      <PageHead
        icon={<StudioIcon name="classTypes" />}
        title="Clases y precios"
        tint="mat"
        page="catalog"
        sub="Lo que ofreces y cuánto cuesta. Toca un dato para cambiarlo: se guarda solo."
        actions={(
          <Button variant="outlined" data-tour="catalog-guide" startIcon={<StudioIcon name="payments" />} onClick={() => openGuide('cobros')} sx={{ minHeight: 44 }}>
            Cómo se cobra
          </Button>
        )}
      />

      <Box ref={listRef} role="tablist" aria-label="Secciones de clases y precios" data-tour="catalog-tabs" onKeyDown={onKey}
        sx={{
          display: 'grid', gap: 0.75, mb: 2.5, p: 0.5, borderRadius: 'calc(var(--studio-radius-btn) + 4px)',
          background: 'var(--studio-surf2)', border: 'var(--studio-border-width, 1px) solid var(--studio-border-color)',
          gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', sm: 'repeat(5, minmax(0, 1fr))' },
          maxWidth: { sm: 760 },
        }}>
        {TABS.map((t) => {
          const on = t.key === tab;
          const locked = t.key === 'precios' && Boolean(locks.section('sales'));
          return (
            <ButtonBase key={t.key} data-t={t.key} role="tab" id={`cat-tab-${t.key}`} aria-selected={on} aria-controls="cat-panel"
              aria-label={locked ? `${t.label} (bloqueado)` : t.label}
              tabIndex={on ? 0 : -1} onClick={() => select(t.key)}
              sx={{
                display: 'flex', flexDirection: 'column', gap: '2px', minHeight: 52, px: 0.75, py: 0.75, borderRadius: 'var(--studio-radius-btn)',
                fontFamily: 'var(--studio-font-body)', fontWeight: 700, fontSize: '0.84rem', lineHeight: 1.15, textAlign: 'center',
                color: on ? 'var(--studio-ink)' : 'var(--studio-muted)', background: on ? 'var(--studio-surf)' : 'transparent',
                boxShadow: on ? '0 1px 3px rgb(var(--studio-shadow-rgb) / 0.16)' : 'none',
                '&:hover': { color: 'var(--studio-ink)' },
                '&.Mui-focusVisible': { outline: '2px solid var(--studio-primary-text)', outlineOffset: 1 },
                '& .full': { display: { xs: 'none', md: 'inline' } }, '& .short': { display: { xs: 'inline', md: 'none' } },
              }}>
              <StudioIcon name={locked ? 'lock' : t.icon} aria-hidden sx={{ fontSize: 20, color: on ? 'var(--studio-primary-text)' : 'inherit' }} />
              <span className="full">{t.label}</span>
              <span className="short" aria-hidden>{t.short}</span>
            </ButtonBase>
          );
        })}
      </Box>

      <Box id="cat-panel" role="tabpanel" aria-labelledby={`cat-tab-${tab}`} sx={{ minWidth: 0 }}>
        {tab === 'tipos' && <TypesTab />}
        {tab === 'precios' && <PricesTab />}
        {tab === 'profes' && <TeamTab />}
        {tab === 'categorias' && <CategoriesTab />}
        {tab === 'salas' && <RoomsTab />}
      </Box>
    </Box>
  );
}
