import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, ButtonBase, Divider, IconButton, Menu, MenuItem, ListItemIcon, Tooltip, Typography } from '@mui/material';
import StudioIcon from '../../site/StudioIcon';
import { useSite, useStudioWebUrl } from '../../site/SiteProvider';
import { panelLook } from '../../theme';
import { NAV, type SectionKey } from './navigation';
import { useLocks, type Lock } from '../../onboarding/locks';
import LockPopover, { type LockPop } from './LockPopover';
import type { TextSize } from './textSize';
import { SIDEBAR_WIDTH } from './sidebarMode';

export interface GuideEntry { label: string; hint: string; path: string; active: boolean }

interface Props {
  active: SectionKey | null;
  /** «Puesta en marcha» mientras la web no está publicada */
  guide: GuideEntry | null;
  userName: string;
  userRole: string;
  textSize: TextSize;
  onTextSize: (s: TextSize) => void;
  onLogout: () => void;
  /** Comprimido: solo iconos (76px) */
  compact?: boolean;
  /** Botón «Comprimir menú» / «Expandir menú» (sin él no se pinta) */
  onToggleCompact?: () => void;
}

/** Logo cuadrado del estudio (su imagen o su inicial sobre el color principal). */
export function StudioMark({ size = 40 }: { size?: number }) {
  const { config } = useSite();
  const [broken, setBroken] = useState(false);
  const src = config.favicon_url && !broken ? config.favicon_url : '';
  return (
    <Box
      aria-hidden
      sx={{
        width: size, height: size, flex: 'none', borderRadius: 'min(var(--studio-radius-md), 14px)', overflow: 'hidden',
        display: 'grid', placeItems: 'center', background: 'var(--studio-primary-fill)', color: 'var(--studio-on-primary)',
        fontFamily: 'var(--studio-font-heading)', fontWeight: 700, fontSize: size * 0.42,
        border: 'var(--studio-border-width) solid transparent',
        '[data-panel-style="brutalist"]:not([data-panel-classic]) &': { borderColor: 'var(--studio-ink)' },
      }}
    >
      {src ? <Box component="img" src={src} alt="" onError={() => setBroken(true)} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : (config.studio_name.trim()[0] || 'E').toUpperCase()}
    </Box>
  );
}

const sideCardSx = (side: string, style: string, classic: boolean) => ({
  background: 'var(--studio-side-bg)',
  color: 'var(--studio-side-text)',
  borderRadius: 'var(--studio-radius-xl)',
  ...(side === 'light' || side === 'darkmode' ? { border: '1px solid var(--studio-border-color)' } : {}),
  ...(side === 'glass' ? {
    background: 'rgb(var(--studio-surf-rgb) / 0.62)',
    backdropFilter: 'blur(22px) saturate(1.4)', WebkitBackdropFilter: 'blur(22px) saturate(1.4)',
    border: '1px solid rgb(255 255 255 / 0.7)', boxShadow: 'var(--studio-shadow-1)',
    '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))': { background: 'var(--studio-surf)' },
    '@media (prefers-reduced-transparency: reduce)': { background: 'var(--studio-surf)', backdropFilter: 'none' },
  } : {}),
  ...(style === 'brutalist' && !classic ? { border: '2px solid var(--studio-ink)', boxShadow: '4px 4px 0 var(--studio-ink)' } : {}),
});

/**
 * Menú lateral: tarjeta redondeada con los colores de la paleta, FIJA a la
 * izquierda (no se mueve al bajar por la pantalla; si sus opciones no caben,
 * se desplaza solo él). Completo (264px) o comprimido (76px: solo iconos, con
 * el nombre en un globo); el botón «Comprimir menú» / «Expandir menú» lo
 * cambia y se recuerda por persona (./sidebarMode.ts).
 */
export default function Sidebar({ active, guide, userName, userRole, textSize, onTextSize, onLogout, compact = false, onToggleCompact }: Props) {
  const navigate = useNavigate();
  const { config } = useSite();
  const look = panelLook(config);
  const webUrl = useStudioWebUrl();
  const [userMenu, setUserMenu] = useState<HTMLElement | null>(null);
  const [lockPop, setLockPop] = useState<LockPop | null>(null);
  const locks = useLocks();
  const groups = ['Día a día', 'Negocio'] as const;
  const settings = NAV.find((n) => n.key === 'settings')!;
  const host = webUrl.replace(/^https?:\/\//, '');
  const toggleLabel = compact ? 'Expandir menú' : 'Comprimir menú';
  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'A';

  // Con candado (puesta en marcha sin terminar): se ve, se puede enfocar y al
  // tocarlo explica qué paso lo abre («Ir a …»). Comprimido: solo el icono (el
  // nombre sigue ahí para los lectores de pantalla y sale en un globo), con el
  // candado y el aviso en pequeño sobre el icono.
  const item = (key: string, label: string, icon: Parameters<typeof StudioIcon>[0]['name'], path: string, current: boolean, extra?: string, lock?: Lock | null) => {
    const btn = (
    <ButtonBase
      key={key}
      onClick={(e) => (lock ? setLockPop({ anchor: e.currentTarget, lock }) : navigate(path))}
      aria-current={current ? 'page' : undefined}
      aria-disabled={lock ? 'true' : undefined}
      aria-haspopup={lock ? 'dialog' : undefined}
      data-tour={`nav-${key}`}
      sx={{
        position: 'relative', display: 'flex', alignItems: 'center', justifyContent: compact ? 'center' : 'flex-start', gap: 1.5,
        width: '100%', minHeight: 44, px: compact ? 0 : 1.5, flex: 'none',
        borderRadius: 'var(--studio-radius-btn)', color: 'var(--studio-side-text)', fontWeight: 600, fontSize: '0.94rem',
        fontFamily: 'var(--studio-font-body)', textAlign: 'left', transition: 'background-color .2s, color .2s',
        '&:hover': { background: 'var(--studio-side-hover)' },
        '&[aria-current="page"]': {
          background: 'var(--studio-side-active)', color: 'var(--studio-side-active-text)',
          ...(look.style === 'neon' && !look.classic ? { boxShadow: 'var(--studio-glow)' } : {}),
          ...(look.style === 'brutalist' && !look.classic ? { outline: '2px solid var(--studio-side-text)', outlineOffset: '-2px' } : {}),
        },
        '&.Mui-focusVisible': { outline: '2px solid var(--studio-side-text)', outlineOffset: 2 },
        '&[aria-disabled="true"]:not([aria-current])': { color: 'var(--studio-side-muted)' },
      }}
    >
      <StudioIcon name={icon} sx={{ fontSize: 20, flex: 'none' }} />
      <Box component="span" sx={compact ? srOnly : { flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</Box>
      {lock && (
        <>
          {compact ? (
            <Box component="span" aria-hidden sx={{ position: 'absolute', top: 3, right: 5, width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--studio-side-bg)', boxShadow: '0 0 0 1px var(--studio-side-hover)' }}>
              <StudioIcon name="lock" sx={{ fontSize: 12, opacity: 0.9 }} />
            </Box>
          ) : <StudioIcon name="lock" aria-hidden sx={{ fontSize: 17, opacity: 0.85 }} />}
          <Box component="span" sx={srOnly}>, bloqueado. {lock.why}</Box>
        </>
      )}
      {extra && (compact ? (
        <Box component="span" sx={{ position: 'absolute', top: 2, right: 2, minWidth: 18, height: 18, px: 0.5, borderRadius: 99, fontSize: '0.64rem', fontWeight: 700, lineHeight: '18px', textAlign: 'center', background: 'var(--studio-primary-fill)', color: 'var(--studio-on-primary)' }}>
          {extra}
        </Box>
      ) : (
        <Box component="span" sx={{ fontSize: '0.72rem', fontWeight: 700, px: 0.75, py: 0.25, borderRadius: 99, background: 'var(--studio-primary-fill)', color: 'var(--studio-on-primary)' }}>
          {extra}
        </Box>
      ))}
    </ButtonBase>
    );
    if (compact) return <Tooltip key={key} title={lock ? `${label} · ${lock.why}` : label} placement="right">{btn}</Tooltip>;
    return lock ? <Tooltip key={key} title={lock.why} placement="right" describeChild>{btn}</Tooltip> : btn;
  };

  const toggle = onToggleCompact && (
    <Tooltip title={toggleLabel} placement="right">
      <IconButton
        onClick={onToggleCompact}
        aria-label={toggleLabel}
        aria-expanded={!compact}
        aria-controls="panel-sidebar"
        data-tour="nav-toggle"
        sx={{
          flex: 'none', width: 36, height: 36, color: 'var(--studio-side-muted)', borderRadius: 'var(--studio-radius-btn)',
          '&:hover': { background: 'var(--studio-side-hover)', color: 'var(--studio-side-text)' },
          '&.Mui-focusVisible': { outline: '2px solid var(--studio-side-text)', outlineOffset: 1 },
          '@media (pointer: coarse)': { width: 44, height: 44 },
        }}
      >
        <StudioIcon name={compact ? 'expand' : 'collapse'} sx={{ fontSize: 20 }} />
      </IconButton>
    </Tooltip>
  );

  return (
    <Box
      component="aside"
      id="panel-sidebar"
      aria-label="Menú principal"
      data-compact={compact ? '' : undefined}
      sx={{
        position: 'fixed', top: 12, left: 12, bottom: 12, zIndex: 40, width: compact ? SIDEBAR_WIDTH.compact : SIDEBAR_WIDTH.full,
        p: compact ? '14px 10px 12px' : '18px 14px 14px', display: 'flex', flexDirection: 'column',
        gap: '2px', overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', scrollbarWidth: 'thin',
        transition: 'width .22s cubic-bezier(.2,.8,.2,1), padding .22s cubic-bezier(.2,.8,.2,1)',
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        ...sideCardSx(look.side, look.style, look.classic),
      }}
    >
      {compact ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, pt: 0.5, pb: 1 }}>
          <Tooltip title={config.studio_name} placement="right"><Box sx={{ display: 'flex' }}><StudioMark /></Box></Tooltip>
          {toggle}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, pl: 1, pt: 0.5, pb: 1.75 }}>
          <StudioMark />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ fontFamily: 'var(--studio-font-heading)', fontWeight: 'var(--studio-heading-weight)', textTransform: 'var(--studio-heading-transform)', fontSize: '1.02rem', lineHeight: 1.2, color: 'inherit', overflowWrap: 'anywhere' }}>
              {config.studio_name}
            </Typography>
            {(config.contact.city || config.tagline) && (
              <Typography noWrap sx={{ fontSize: '0.78rem', color: 'var(--studio-side-muted)' }}>{config.contact.city || config.tagline}</Typography>
            )}
          </Box>
          {toggle}
        </Box>
      )}

      <Box component="nav" aria-label="Secciones" sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {guide && item('guide', guide.label, 'launch', guide.path, guide.active, guide.hint)}
        {groups.map((g) => (
          <Box key={g} sx={{ display: 'contents' }}>
            {compact ? (
              <Box aria-hidden sx={{ flex: 'none', height: '1px', mx: 1, my: 1, background: 'var(--studio-side-muted)', opacity: 0.35 }} />
            ) : (
              <Typography aria-hidden sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--studio-side-muted)', px: 1.5, pt: 1.75, pb: 0.75, whiteSpace: 'nowrap' }}>
                {g}
              </Typography>
            )}
            {NAV.filter((n) => n.group === g).map((n) => item(n.key, n.label, n.icon, n.path, active === n.key, undefined, locks.section(n.key)))}
          </Box>
        ))}
      </Box>

      <Box sx={{ mt: 'auto', pt: 1.5, display: 'flex', flexDirection: 'column', gap: 1, alignItems: compact ? 'center' : 'stretch' }}>
        {item(settings.key, settings.label, settings.icon, settings.path, active === 'settings', undefined, locks.section(settings.key))}
        {webUrl && (compact ? (
          <Tooltip title={`Ver mi web: ${host}`} placement="right">
            <IconButton component="a" href={webUrl} target="_blank" rel="noopener" aria-label={`Ver mi web (${host})`}
              sx={{ width: 44, height: 44, color: 'var(--studio-side-muted)', '&:hover': { color: 'var(--studio-side-text)', background: 'var(--studio-side-hover)' } }}>
              <StudioIcon name="external" sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        ) : (
          <Box component="a" href={webUrl} target="_blank" rel="noopener"
            sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.82rem', color: 'var(--studio-side-muted)', px: 1.5, minHeight: 36, textDecoration: 'none', '&:hover': { color: 'var(--studio-side-text)' } }}>
            <StudioIcon name="external" sx={{ fontSize: 16 }} />
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{host}</Box>
          </Box>
        ))}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: compact ? 0.5 : 1, borderRadius: 'var(--studio-radius-md)', background: 'var(--studio-side-hover)' }}>
          <Tooltip title={compact ? `Tu cuenta: ${userName}` : ''} placement="right">
            <ButtonBase
              onClick={(e) => setUserMenu(e.currentTarget)}
              aria-haspopup="menu"
              aria-expanded={Boolean(userMenu)}
              aria-label={`Tu cuenta: ${userName}`}
              sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flex: 1, minWidth: 44, borderRadius: 'var(--studio-radius-md)', justifyContent: compact ? 'center' : 'flex-start', textAlign: 'left', minHeight: 44 }}
            >
              <Box aria-hidden sx={{ width: 32, height: 32, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', fontSize: '0.72rem', fontWeight: 700, background: 'var(--studio-c-yoga)', color: 'var(--studio-ink)' }}>
                {initials}
              </Box>
              {!compact && (
                <Box sx={{ minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--studio-side-text)', lineHeight: 1.2 }}>{userName.split(/\s+/)[0]}</Typography>
                  <Typography noWrap sx={{ fontSize: '0.75rem', color: 'var(--studio-side-muted)' }}>{userRole}</Typography>
                </Box>
              )}
            </ButtonBase>
          </Tooltip>
          {!compact && <TextSizeToggle value={textSize} onChange={onTextSize} />}
        </Box>
      </Box>

      <LockPopover pop={lockPop} onClose={() => setLockPop(null)} />
      <Menu anchorEl={userMenu} open={Boolean(userMenu)} onClose={() => setUserMenu(null)} anchorOrigin={{ vertical: 'top', horizontal: 'left' }} transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        {/* Comprimido no hay sitio para el A/A: va aquí */}
        {compact && [
          <MenuItem key="tn" selected={textSize === 'normal'} onClick={() => { setUserMenu(null); onTextSize('normal'); }}>
            <ListItemIcon sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'inherit' }}>A</ListItemIcon>Texto normal
          </MenuItem>,
          <MenuItem key="tl" selected={textSize === 'large'} onClick={() => { setUserMenu(null); onTextSize('large'); }}>
            <ListItemIcon sx={{ fontWeight: 700, fontSize: '1.05rem', color: 'inherit' }}>A</ListItemIcon>Texto grande
          </MenuItem>,
          <Divider key="d" />,
        ]}
        <MenuItem onClick={() => { setUserMenu(null); navigate('/seguridad'); }}>
          <ListItemIcon><StudioIcon name="security" fontSize="small" /></ListItemIcon>Seguridad
        </MenuItem>
        <MenuItem onClick={() => { setUserMenu(null); onLogout(); }} sx={{ color: 'var(--studio-bad)' }}>
          <ListItemIcon sx={{ color: 'inherit' }}><StudioIcon name="logout" fontSize="small" /></ListItemIcon>Salir del panel
        </MenuItem>
      </Menu>
    </Box>
  );
}

const srOnly = {
  position: 'absolute', width: '1px', height: '1px', p: 0, m: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
} as const;

/** A / A: tamaño del texto (normal o grande), guardado por persona. */
export function TextSizeToggle({ value, onChange }: { value: TextSize; onChange: (s: TextSize) => void }) {
  const btn = (v: TextSize, label: string, title: string, fs: string) => (
    <ButtonBase
      onClick={() => onChange(v)}
      aria-pressed={value === v}
      title={title}
      aria-label={title}
      sx={{
        minHeight: 30, minWidth: 30, px: 1, borderRadius: 99, fontWeight: 700, fontSize: fs, color: 'var(--studio-side-muted)',
        '&[aria-pressed="true"]': { background: 'var(--studio-side-active)', color: 'var(--studio-side-active-text)' },
        '@media (pointer: coarse)': { minHeight: 44, minWidth: 44 },
      }}
    >
      {label}
    </ButtonBase>
  );
  return (
    <Box role="group" aria-label="Tamaño del texto" sx={{ display: 'flex', gap: '2px', p: '3px', borderRadius: 99, background: 'var(--studio-side-bg)', flex: 'none' }}>
      {btn('normal', 'A', 'Texto normal', '0.85rem')}
      {btn('large', 'A', 'Texto grande', '1.05rem')}
    </Box>
  );
}
