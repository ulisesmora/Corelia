import { useRef, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, ButtonBase, Divider, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import StudioIcon, { type StudioIconName } from '../../site/StudioIcon';
import { useSite, useStudioWebUrl } from '../../site/SiteProvider';
import { canInstallCrm, openInstallHelp } from '../InstallCrmApp';
import { useCoach } from '../../onboarding/coach/context';
import { setupStepLink } from '../../onboarding/flow';
import { useLocks, type Lock } from '../../onboarding/locks';
import { BOTTOM_KEYS, NAV, type SectionKey } from './navigation';
import { hasTour, startTour, useShell } from './ShellContext';
import { StudioMark } from './Sidebar';
import LockPopover, { type LockPop } from './LockPopover';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

interface MenuEntry { icon: StudioIconName; label: string; hint?: string; onClick: () => void; badge?: boolean; locked?: boolean }

function EntryMenu({ anchor, onClose, entries, label }: { anchor: HTMLElement | null; onClose: () => void; entries: (MenuEntry | 'divider')[]; label: string }) {
  return (
    <Menu
      anchorEl={anchor}
      open={Boolean(anchor)}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{ paper: { sx: { minWidth: 250, mt: 1 } }, list: { 'aria-label': label } }}
    >
      {entries.map((e, i) => (e === 'divider' ? <Divider key={`d${i}`} /> : (
        <MenuItem key={e.label} onClick={() => { onClose(); e.onClick(); }} sx={{ gap: 0.5, py: 1 }}>
          <ListItemIcon>
            {e.badge ? (
              <Box sx={{ width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: 'min(var(--studio-radius-md), 10px)', background: 'var(--studio-p-soft)', color: 'var(--studio-primary-text)' }}>
                <StudioIcon name={e.icon} sx={{ fontSize: 18 }} />
              </Box>
            ) : <StudioIcon name={e.icon} sx={{ color: 'var(--studio-ink)' }} />}
          </ListItemIcon>
          <ListItemText primary={e.label} secondary={e.hint} slotProps={{ primary: { sx: { fontWeight: 600 } }, secondary: { sx: { fontSize: '0.8rem' } } }} />
          {e.locked && <StudioIcon name="lock" aria-label="bloqueado" sx={{ fontSize: 18, color: 'var(--studio-muted)' }} />}
        </MenuItem>
      )))}
    </Menu>
  );
}

/** «+ Nuevo»: reserva, clienta, clase o bono (las ventanas/pantallas de crear de siempre). */
function useNewEntries(): MenuEntry[] {
  const navigate = useNavigate();
  const { openNewClient } = useShell();
  return [
    { icon: 'booked', label: 'Reserva', hint: 'Apuntar a una clienta a una clase', onClick: () => openNewClient('existing'), badge: true },
    { icon: 'addClient', label: 'Clienta', hint: 'Dar de alta una ficha', onClick: () => openNewClient('new'), badge: true },
    { icon: 'add', label: 'Clase', hint: 'Añadir una clase al horario', onClick: () => navigate('/calendar?accion=nueva'), badge: true },
    { icon: 'plans', label: 'Bono', hint: 'Un bono o una cuota para vender', onClick: () => navigate('/plans?accion=nueva'), badge: true },
  ];
}

/** «?»: cómo funciona esta pantalla, visita guiada, buscar, puesta en marcha e instalar. */
function useHelpEntries(): MenuEntry[] {
  const navigate = useNavigate();
  const { openCommand } = useShell();
  const coach = useCoach();
  const locks = useLocks();
  const list: MenuEntry[] = [];
  if (coach.currentPage && coach.hasPageTour(coach.currentPage)) {
    const page = coach.currentPage;
    list.push({ icon: 'play', label: 'Cómo funciona esta pantalla', hint: 'Tres pasos, en un momento', onClick: () => coach.startPage(page) });
  }
  if (hasTour()) list.push({ icon: 'help', label: 'Visita guiada', hint: 'Un repaso rápido del panel', onClick: startTour });
  list.push({ icon: 'search', label: 'Buscar o hacer algo', hint: `Atajo: ${isMac ? '⌘' : 'Ctrl'} + K`, onClick: () => openCommand() });
  if (locks.unfinished) {
    list.push({ icon: 'launch', label: 'Puesta en marcha', hint: 'Seguir donde lo dejaste', onClick: () => navigate(setupStepLink(locks.reached)) });
  } else {
    list.push({ icon: 'tip', label: 'Volver a ver los consejos', hint: 'Al entrar en cada sección', onClick: coach.resetTips });
  }
  if (canInstallCrm()) list.push({ icon: 'install', label: 'Instalar en el móvil', hint: 'Como una app, con su icono', onClick: openInstallHelp });
  return list;
}

const iconBtn = { width: 44, height: 44, color: 'var(--studio-ink)', '&:hover': { background: 'var(--studio-surf2)' } } as const;

/** Barra superior del ordenador: buscador ⌘K, ver la web, ayuda y «+ Nuevo». */
export function TopBar({ style }: { style: string }) {
  const { openCommand } = useShell();
  const webUrl = useStudioWebUrl();
  const newEntries = useNewEntries();
  const helpEntries = useHelpEntries();
  const [newAnchor, setNewAnchor] = useState<HTMLElement | null>(null);
  const [helpAnchor, setHelpAnchor] = useState<HTMLElement | null>(null);
  const transparent = style === 'glass' || style === 'neon' || style === 'classic';
  const squareSearch = ['brutalist', 'editorial', 'minimal'].includes(style);

  return (
    <Box
      component="header"
      sx={{
        position: 'sticky', top: 0, zIndex: 30, display: 'flex', alignItems: 'center', gap: 1, py: 1.5,
        background: transparent ? 'none' : 'linear-gradient(var(--studio-bg) 70%, transparent)',
      }}
    >
      <ButtonBase
        onClick={() => openCommand()}
        aria-label={`Buscar o hacer algo. Atajo ${isMac ? 'Comando' : 'Control'} K`}
        sx={{
          flex: 1, maxWidth: 560, display: 'flex', alignItems: 'center', gap: 1.25, minHeight: 48, pl: 2, pr: 1,
          borderRadius: squareSearch ? 'var(--studio-radius-md)' : 999, background: 'var(--studio-card-bg)',
          border: 'var(--studio-card-border)', boxShadow: 'var(--studio-shadow-1)', color: 'var(--studio-muted)',
          backdropFilter: 'var(--studio-blur)', WebkitBackdropFilter: 'var(--studio-blur)', justifyContent: 'flex-start',
          fontFamily: 'var(--studio-font-body)', fontSize: '0.95rem',
        }}
      >
        <StudioIcon name="search" />
        <Box component="span" sx={{ flex: 1, textAlign: 'left' }}>¿Qué quieres hacer o buscar?</Box>
        <Box component="kbd" sx={{ fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, px: 1, py: 0.4, borderRadius: '8px', background: 'var(--studio-surf2)', color: 'var(--studio-muted)', border: '1px solid var(--studio-border-color)' }}>
          {isMac ? '⌘K' : 'Ctrl K'}
        </Box>
      </ButtonBase>
      <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {webUrl && (
          <Tooltip title="Ver como clienta">
            <IconButton component="a" href={webUrl} target="_blank" rel="noopener" aria-label="Ver mi web como clienta" sx={iconBtn}>
              <StudioIcon name="eye" />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Ayuda">
          <IconButton data-tour="help" onClick={(e: MouseEvent<HTMLElement>) => setHelpAnchor(e.currentTarget)} aria-label="Ayuda" aria-haspopup="menu" aria-expanded={Boolean(helpAnchor)} sx={iconBtn}>
            <StudioIcon name="help" />
          </IconButton>
        </Tooltip>
        <Box aria-hidden sx={{ width: '1px', height: 28, background: 'var(--studio-border-color)', mx: 0.75 }} />
        <Button data-tour="new" variant="contained" startIcon={<StudioIcon name="plus" />} onClick={(e) => setNewAnchor(e.currentTarget)}
          aria-haspopup="menu" aria-expanded={Boolean(newAnchor)} sx={{ minHeight: 44, px: 2.25 }}>
          Nuevo
        </Button>
      </Box>
      <EntryMenu anchor={newAnchor} onClose={() => setNewAnchor(null)} entries={newEntries} label="Crear algo nuevo" />
      <EntryMenu anchor={helpAnchor} onClose={() => setHelpAnchor(null)} entries={helpEntries} label="Ayuda" />
    </Box>
  );
}

/** Barra superior del móvil: estudio, buscar y «+». */
export function MobileTopBar() {
  const { config } = useSite();
  const { openCommand } = useShell();
  const newEntries = useNewEntries();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <Box
      component="header"
      sx={{
        position: 'sticky', top: 0, zIndex: 30, display: 'flex', alignItems: 'center', gap: 0.75, mx: -2, py: 1, pl: 2, pr: 1,
        background: 'rgb(var(--studio-bg-rgb) / 0.92)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      <StudioMark size={36} />
      <Typography noWrap sx={{ flex: 1, minWidth: 0, fontFamily: 'var(--studio-font-heading)', fontWeight: 'var(--studio-heading-weight)', textTransform: 'var(--studio-heading-transform)', fontSize: '1rem', color: 'var(--studio-ink)' }}>
        {config.studio_name}
      </Typography>
      <IconButton onClick={() => openCommand()} aria-label="Buscar o hacer algo" sx={iconBtn}><StudioIcon name="search" /></IconButton>
      <IconButton data-tour="new-m" onClick={(e) => setAnchor(e.currentTarget)} aria-label="Nuevo" aria-haspopup="menu" aria-expanded={Boolean(anchor)}
        sx={{ ...iconBtn, background: 'var(--studio-primary-fill)', color: 'var(--studio-on-primary)', boxShadow: 'var(--studio-btn-shadow)', '&:hover': { background: 'var(--studio-primary-fill)' } }}>
        <StudioIcon name="plus" />
      </IconButton>
      <EntryMenu anchor={anchor} onClose={() => setAnchor(null)} entries={newEntries} label="Crear algo nuevo" />
    </Box>
  );
}

/** Barra de abajo del móvil: Hoy, Calendario, Reservas, Clientas y «Más». */
export function BottomNav({ active }: { active: SectionKey | null }) {
  const navigate = useNavigate();
  const webUrl = useStudioWebUrl();
  const helpEntries = useHelpEntries();
  const locks = useLocks();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [lockPop, setLockPop] = useState<LockPop | null>(null);
  const moreBtn = useRef<HTMLButtonElement>(null);
  const moreActive = active === 'sales' || active === 'web' || active === 'settings';
  const showLock = (el: HTMLElement | null, lock: Lock) => { if (el) setLockPop({ anchor: el, lock }); };
  const more: (MenuEntry | 'divider')[] = [
    ...NAV.filter((n) => !BOTTOM_KEYS.includes(n.key)).map((n) => {
      const lock = locks.section(n.key);
      return {
        icon: n.icon, label: n.label, badge: true, locked: Boolean(lock),
        onClick: () => (lock ? window.setTimeout(() => showLock(moreBtn.current, lock), 0) : navigate(n.path)),
      };
    }),
    'divider',
    ...(webUrl ? [{ icon: 'eye' as const, label: 'Ver mi web', onClick: () => window.open(webUrl, '_blank', 'noopener') }] : []),
    ...helpEntries.slice(0, 2),
  ];
  const tab = (key: string, label: string, icon: StudioIconName, current: boolean, onClick: (e: MouseEvent<HTMLElement>) => void, extra = {}, lock?: Lock | null) => (
    <ButtonBase
      key={key}
      onClick={onClick}
      aria-current={current ? 'page' : undefined}
      aria-disabled={lock ? 'true' : undefined}
      data-tour={`bnav-${key}`}
      {...extra}
      sx={{
        position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', minHeight: 54, fontSize: '0.7rem', fontWeight: 700,
        color: 'var(--studio-muted)', fontFamily: 'var(--studio-font-body)', minWidth: 0,
        '& .pill': { width: 56, height: 30, borderRadius: 99, display: 'grid', placeItems: 'center', transition: 'background-color .2s' },
        '&[aria-current="page"]': { color: 'var(--studio-ink)' },
        '&[aria-current="page"] .pill': { background: 'var(--studio-p-soft)', color: 'var(--studio-primary-text)' },
        '& .lk': { position: 'absolute', top: 2, right: 'calc(50% - 30px)', width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--studio-surf2)' },
        '@media (max-width: 360px)': { fontSize: '0.64rem', '& .pill': { width: 48 }, '& .lk': { right: 'calc(50% - 26px)' } },
      }}
    >
      <span className="pill"><StudioIcon name={icon} sx={{ fontSize: 22 }} /></span>
      {label}
      {lock && (
        <>
          <span className="lk" aria-hidden><StudioIcon name="lock" sx={{ fontSize: 11 }} /></span>
          <Box component="span" sx={srOnly}>, bloqueado. {lock.why}</Box>
        </>
      )}
    </ButtonBase>
  );
  return (
    <Box
      component="nav"
      aria-label="Menú"
      sx={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40, display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
        background: 'rgb(var(--studio-surf-rgb) / 0.96)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        borderTop: 'var(--studio-border-width) solid var(--studio-border-color)', px: 0.5, pt: 0.75,
        pb: 'calc(6px + env(safe-area-inset-bottom))',
        '[data-panel-style="brutalist"]:not([data-panel-classic]) &': { borderTop: '2px solid var(--studio-ink)' },
      }}
    >
      {NAV.filter((n) => BOTTOM_KEYS.includes(n.key)).map((n) => {
        const lock = locks.section(n.key);
        return tab(n.key, n.label, n.icon, active === n.key,
          (e) => (lock ? showLock(e.currentTarget, lock) : navigate(n.path)), lock ? { 'aria-haspopup': 'dialog' } : {}, lock);
      })}
      {tab('more', 'Más', 'more', moreActive, (e) => setAnchor(e.currentTarget), { 'aria-haspopup': 'menu', 'aria-expanded': Boolean(anchor), ref: moreBtn })}
      <EntryMenu anchor={anchor} onClose={() => setAnchor(null)} entries={more} label="Más secciones" />
      <LockPopover pop={lockPop} onClose={() => setLockPop(null)} side="top" />
    </Box>
  );
}

const srOnly = {
  position: 'absolute', width: 1, height: 1, p: 0, m: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
} as const;
