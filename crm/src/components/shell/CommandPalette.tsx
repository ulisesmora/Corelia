import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, CircularProgress, Dialog, InputBase, Typography } from '@mui/material';
import { API_BASE_URL } from '../../config';
import { authHeaders } from '../../utils/auth';
import StudioIcon, { type StudioIconName } from '../../site/StudioIcon';
import { useStudioWebUrl } from '../../site/SiteProvider';
import { setupStepLink } from '../../onboarding/flow';
import { useLocks } from '../../onboarding/locks';
import { NAV, SALES_HUB, SETTINGS_HUB, WEB_HUB, type HubLink } from './navigation';
import { useShell } from './ShellContext';
import { CHAPTERS, useOpenGuide } from '../charging/chapters';

// Buscador «¿Qué quieres hacer o buscar?» (⌘K / Ctrl+K): ir a cualquier
// pantalla, acciones rápidas y buscar clientas por nombre, email o teléfono.
// Teclado: ↑ ↓ para moverse, Intro para abrir, Esc para cerrar.

interface Item {
  id: string;
  group: 'Clientas' | 'Acciones' | 'Ir a';
  label: string;
  hint?: string;
  icon?: StudioIconName;
  initials?: string;
  keywords?: string;
  /** Pantalla a la que lleva (para esconderla si aún está cerrada) */
  path?: string;
  run: () => void;
}

interface UserHit { id: number; email: string; first_name?: string; last_name?: string; phone?: string | null }

const CHAPTER_WORDS: Record<string, string> = {
  cobros: 'cobrar dos formas online estudio clientas resumen',
  online: 'clase suelta bono membresía crédito caduca tarjeta online stripe web renovación recibo',
  'en-estudio': 'efectivo bizum en mano datáfono añadir créditos clase fija apuntar corte mensualidad estudio',
  reembolsos: 'cancelar cancelación devolver reembolso devolución plazo horas',
  espera: 'lista de espera llena plaza dar plaza',
};

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const matches = (q: string, ...fields: (string | undefined)[]) => {
  const hay = fold(fields.filter(Boolean).join(' '));
  return fold(q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
};
const nameOf = (u: UserHit) => `${u.first_name || ''} ${u.last_name || ''}`.trim();
const initialsOf = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

export default function CommandPalette({ open, initialQuery = '', onClose }: { open: boolean; initialQuery?: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { openNewClient, extraSettings } = useShell();
  const webUrl = useStudioWebUrl();
  const [q, setQ] = useState(initialQuery);
  const [sel, setSel] = useState(0);
  const [people, setPeople] = useState<UserHit[]>([]);
  const [searching, setSearching] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const locks = useLocks();
  const openGuide = useOpenGuide();

  useEffect(() => { if (open) { setQ(initialQuery); setSel(0); } }, [open, initialQuery]);

  // Clientas: búsqueda en el API (a partir de 2 letras)
  useEffect(() => {
    const term = q.trim();
    if (!open || term.length < 2) { setPeople([]); setSearching(false); return undefined; }
    let alive = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      fetch(`${API_BASE_URL}v1/users/?is_superuser=false&search=${encodeURIComponent(term)}&ordering=email`, { headers: authHeaders() })
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => { if (alive) setPeople(((Array.isArray(d) ? d : d.results || []) as UserHit[]).slice(0, 5)); })
        .catch(() => { if (alive) setPeople([]); })
        .finally(() => { if (alive) setSearching(false); });
    }, 250);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [q, open]);

  const go = (path: string) => () => navigate(path);
  const items = useMemo<Item[]>(() => {
    const actions: Item[] = [
      { id: 'a-client', group: 'Acciones', label: 'Nueva clienta', icon: 'addClient', keywords: 'alta ficha', run: () => openNewClient('new') },
      { id: 'a-studio-client', group: 'Acciones', label: 'Nueva clienta del estudio', hint: 'Te paga en mano: clases sueltas o un mes fijo', icon: 'studio', keywords: 'plan mensual efectivo bizum en mano mensualidad renovar corte alta', path: '/clientas/estudio/nueva', run: go('/clientas/estudio/nueva') },
      { id: 'a-booking', group: 'Acciones', label: 'Nueva reserva', hint: 'Apuntar a una clienta a una clase', icon: 'booked', keywords: 'reservar apuntar', run: () => openNewClient('existing') },
      { id: 'a-fixed', group: 'Acciones', label: 'Darle una clase fija a una clienta', icon: 'fixedClasses', keywords: 'plaza semanal', path: '/assign-classes', run: go('/assign-classes') },
      { id: 'a-class', group: 'Acciones', label: 'Añadir una clase al horario', icon: 'add', keywords: 'nueva clase horario', path: '/calendar', run: go('/calendar?accion=nueva') },
      { id: 'a-plan', group: 'Acciones', label: 'Crear un bono', icon: 'plans', keywords: 'nuevo bono precio cuota', path: '/plans', run: go('/clases-y-precios?tab=precios&accion=nueva') },
      { id: 'a-prices', group: 'Acciones', label: 'Cambiar precios', hint: 'Clases, bonos y membresías', icon: 'payments', keywords: 'precio tarifa créditos bono cuota membresía', path: '/plans', run: go('/clases-y-precios?tab=precios') },
      { id: 'a-guide', group: 'Acciones', label: 'Cómo se cobra', hint: 'Bonos, pagos en mano, cancelaciones y espera', icon: 'help', keywords: 'cobrar pagar ayuda guía explicación', run: () => openGuide() },
      { id: 'a-credits', group: 'Acciones', label: 'Añadir o quitar créditos', icon: 'credits', keywords: 'saldo pago en mano', path: '/credits', run: go('/credits?accion=anadir') },
      { id: 'a-notice', group: 'Acciones', label: 'Avisar a todas las clientas', icon: 'announce', keywords: 'mensaje email aviso', run: go('/mails?accion=nuevo') },
      { id: 'a-closed', group: 'Acciones', label: 'Cerrar el estudio unos días', icon: 'holidays', keywords: 'vacaciones festivo cierre', path: '/calendar', run: go('/calendar?accion=vacaciones') },
      { id: 'a-style', group: 'Acciones', label: 'Cambiar colores y estilo', icon: 'style', keywords: 'paleta tema letra', run: go('/ajustes?tab=aspecto') },
    ];
    if (webUrl) {
      actions.push({ id: 'a-web', group: 'Acciones', label: 'Ver mi web como clienta', icon: 'eye', run: () => window.open(webUrl, '_blank', 'noopener') });
    }
    const link = (l: HubLink, i: string): Item => ({
      id: `g-${i}-${l.path}`, group: 'Ir a', label: l.label, hint: l.hint, icon: l.icon, keywords: l.keywords, path: l.external ? undefined : l.path.split('?')[0],
      run: l.external ? () => window.open(l.path, '_blank', 'noopener') : go(l.path),
    });
    const pages: Item[] = [
      ...NAV.map((n) => ({ id: `n-${n.key}`, group: 'Ir a' as const, label: n.label, icon: n.icon, path: n.path, run: go(n.path) })),
      ...[...SALES_HUB, ...WEB_HUB, ...SETTINGS_HUB].flatMap((g) => g.links.map((l) => link(l, g.title))),
      ...extraSettings.map((l) => link(l, 'extra')),
      // Capítulos de «Cómo se cobra» (salen al buscar: «reembolso», «bizum»…)
      ...CHAPTERS.map((c) => ({
        id: `h-${c.key}`, group: 'Ir a' as const, label: `Cómo se cobra: ${c.title.toLowerCase()}`, icon: 'help' as const,
        keywords: CHAPTER_WORDS[c.key], run: () => openGuide(c.key),
      })),
      ...(locks.unfinished ? [{ id: 'g-guide', group: 'Ir a' as const, label: 'Puesta en marcha', hint: 'Seguir donde lo dejaste', icon: 'launch' as const, run: go(setupStepLink(locks.reached)) }] : []),
    ];
    const term = q.trim();
    // Lo que aún está cerrado (puesta en marcha sin terminar) no se ofrece
    const filt = (list: Item[]) => list.filter((i) => !(i.path && locks.route(i.path)) && (!term || matches(term, i.label, i.hint, i.keywords)));
    const clients: Item[] = people.map((u) => {
      const name = nameOf(u) || u.email;
      return {
        id: `c-${u.id}`, group: 'Clientas', label: name, hint: name === u.email ? u.phone || '' : u.email,
        initials: initialsOf(name), run: go(`/clients?buscar=${encodeURIComponent(name)}`),
      };
    });
    return [...clients, ...filt(actions), ...(term ? filt(pages) : filt(pages.slice(0, NAV.length)))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, people, webUrl, extraSettings, locks, openGuide]);

  useEffect(() => { setSel((s) => Math.min(s, Math.max(0, items.length - 1))); }, [items.length]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const pick = (i: number) => {
    const it = items[i];
    if (!it) return;
    onClose();
    it.run();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => (s + 1) % Math.max(1, items.length)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => (s - 1 + items.length) % Math.max(1, items.length)); }
    else if (e.key === 'Home') { e.preventDefault(); setSel(0); }
    else if (e.key === 'End') { e.preventDefault(); setSel(Math.max(0, items.length - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
  };

  let lastGroup = '';
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth={false}
      aria-label="Buscar y hacer"
      sx={{ '& .MuiDialog-container': { alignItems: 'flex-start' } }}
      PaperProps={{
        sx: {
          width: 'min(620px, calc(100vw - 24px))', m: 0, mt: { xs: 1, sm: '10vh' }, maxHeight: { xs: '84dvh', sm: '76vh' },
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 0.75, borderBottom: '1px solid var(--studio-border-color)' }}>
        <StudioIcon name="search" sx={{ color: 'var(--studio-muted)' }} />
        <InputBase
          autoFocus
          fullWidth
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={onKey}
          placeholder="¿Qué quieres hacer o buscar?"
          inputProps={{
            role: 'combobox', 'aria-expanded': true, 'aria-controls': 'cmd-list', 'aria-autocomplete': 'list',
            'aria-activedescendant': items[sel] ? `cmd-o-${sel}` : undefined, 'aria-label': 'Qué quieres hacer o buscar',
            autoComplete: 'off',
          }}
          sx={{ minHeight: 56, fontSize: '1.05rem' }}
        />
        {searching && <CircularProgress size={18} />}
        <Box component="kbd" sx={kbd}>Esc</Box>
      </Box>
      <Box ref={listRef} id="cmd-list" role="listbox" aria-label="Resultados" sx={{ overflow: 'auto', p: 1 }}>
        {items.length === 0 && (
          <Typography sx={{ p: 2.5, color: 'var(--studio-muted)' }}>
            {searching ? 'Buscando…' : 'Nada por aquí. Prueba con el nombre de una clienta, «bono» o «salas».'}
          </Typography>
        )}
        {items.map((it, i) => {
          const header = it.group !== lastGroup ? it.group : '';
          lastGroup = it.group;
          return (
            <Box key={it.id}>
              {header && (
                <Typography role="presentation" sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--studio-muted)', px: 1.25, pt: 1.25, pb: 0.5 }}>
                  {header}
                </Typography>
              )}
              <Box
                component="button"
                type="button"
                role="option"
                id={`cmd-o-${i}`}
                data-i={i}
                aria-selected={i === sel}
                tabIndex={-1}
                onMouseMove={() => setSel(i)}
                onClick={() => pick(i)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', minHeight: 48, px: 1.25, py: 0.75,
                  border: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'var(--studio-ink)',
                  borderRadius: 'min(var(--studio-radius-md), 12px)', background: 'transparent',
                  '&[aria-selected="true"]': { background: 'var(--studio-p-soft)', color: 'var(--studio-primary-text)' },
                }}
              >
                {it.icon ? (
                  <Box sx={badge}><StudioIcon name={it.icon} sx={{ fontSize: 18 }} /></Box>
                ) : (
                  <Box sx={{ ...badge, borderRadius: '50%', background: 'var(--studio-c-yoga)', color: 'var(--studio-ink)', fontSize: '0.72rem', fontWeight: 700 }}>
                    {it.initials}
                  </Box>
                )}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontWeight: 600, fontSize: '0.94rem', color: 'inherit' }}>{it.label}</Typography>
                  {it.hint && <Typography noWrap sx={{ fontSize: '0.8rem', color: 'var(--studio-muted)' }}>{it.hint}</Typography>}
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Dialog>
  );
}

const kbd = {
  fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700, px: 1, py: 0.25, borderRadius: '8px',
  background: 'var(--studio-surf2)', color: 'var(--studio-muted)', border: '1px solid var(--studio-border-color)',
} as const;

const badge = {
  width: 34, height: 34, flex: 'none', display: 'grid', placeItems: 'center',
  borderRadius: 'min(var(--studio-radius-md), 12px)', background: 'var(--studio-p-soft)', color: 'var(--studio-primary-text)',
} as const;
