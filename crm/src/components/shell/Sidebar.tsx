import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, ButtonBase, Menu, MenuItem, ListItemIcon, Tooltip, Typography } from '@mui/material';
import StudioIcon from '../../site/StudioIcon';
import { useSite, useStudioWebUrl } from '../../site/SiteProvider';
import { panelLook } from '../../theme';
import { NAV, type SectionKey } from './navigation';
import { useLocks, type Lock } from '../../onboarding/locks';
import LockPopover, { type LockPop } from './LockPopover';
import type { TextSize } from './textSize';

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

/** Menú lateral: tarjeta redondeada con los colores de la paleta. */
export default function Sidebar({ active, guide, userName, userRole, textSize, onTextSize, onLogout }: Props) {
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

  // Con candado (puesta en marcha sin terminar): se ve, se puede enfocar y al
  // tocarlo explica qué paso lo abre («Ir a …»).
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
        display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 1.5, width: '100%', minHeight: 44, px: 1.5,
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
      <StudioIcon name={icon} sx={{ fontSize: 20 }} />
      <Box component="span" sx={{ flex: 1, minWidth: 0 }}>{label}</Box>
      {lock && (
        <>
          <StudioIcon name="lock" aria-hidden sx={{ fontSize: 17, opacity: 0.85 }} />
          <Box component="span" sx={srOnly}>, bloqueado. {lock.why}</Box>
        </>
      )}
      {extra && (
        <Box component="span" sx={{ fontSize: '0.72rem', fontWeight: 700, px: 0.75, py: 0.25, borderRadius: 99, background: 'var(--studio-primary-fill)', color: 'var(--studio-on-primary)' }}>
          {extra}
        </Box>
      )}
    </ButtonBase>
    );
    return lock ? <Tooltip key={key} title={lock.why} placement="right">{btn}</Tooltip> : btn;
  };

  return (
    <Box
      component="aside"
      aria-label="Menú principal"
      sx={{
        position: 'sticky', top: 12, height: 'calc(100dvh - 24px)', p: '18px 14px 14px', display: 'flex', flexDirection: 'column',
        gap: '2px', overflowY: 'auto', ...sideCardSx(look.side, look.style, look.classic),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1, pt: 0.5, pb: 1.75 }}>
        <StudioMark />
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontFamily: 'var(--studio-font-heading)', fontWeight: 'var(--studio-heading-weight)', textTransform: 'var(--studio-heading-transform)', fontSize: '1.02rem', lineHeight: 1.2, color: 'inherit', overflowWrap: 'anywhere' }}>
            {config.studio_name}
          </Typography>
          {(config.contact.city || config.tagline) && (
            <Typography noWrap sx={{ fontSize: '0.78rem', color: 'var(--studio-side-muted)' }}>{config.contact.city || config.tagline}</Typography>
          )}
        </Box>
      </Box>

      <Box component="nav" aria-label="Secciones" sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {guide && item('guide', guide.label, 'launch', guide.path, guide.active, guide.hint)}
        {groups.map((g) => (
          <Box key={g} sx={{ display: 'contents' }}>
            <Typography aria-hidden sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--studio-side-muted)', px: 1.5, pt: 1.75, pb: 0.75 }}>
              {g}
            </Typography>
            {NAV.filter((n) => n.group === g).map((n) => item(n.key, n.label, n.icon, n.path, active === n.key, undefined, locks.section(n.key)))}
          </Box>
        ))}
      </Box>

      <Box sx={{ mt: 'auto', pt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {item(settings.key, settings.label, settings.icon, settings.path, active === 'settings', undefined, locks.section(settings.key))}
        {webUrl && (
          <Box component="a" href={webUrl} target="_blank" rel="noopener"
            sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.82rem', color: 'var(--studio-side-muted)', px: 1.5, minHeight: 36, textDecoration: 'none', '&:hover': { color: 'var(--studio-side-text)' } }}>
            <StudioIcon name="external" sx={{ fontSize: 16 }} />
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{host}</Box>
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: 'var(--studio-radius-md)', background: 'var(--studio-side-hover)' }}>
          <ButtonBase
            onClick={(e) => setUserMenu(e.currentTarget)}
            aria-haspopup="menu"
            aria-expanded={Boolean(userMenu)}
            aria-label={`Tu cuenta: ${userName}`}
            sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flex: 1, minWidth: 0, borderRadius: 'var(--studio-radius-md)', justifyContent: 'flex-start', textAlign: 'left', minHeight: 44 }}
          >
            <Box aria-hidden sx={{ width: 32, height: 32, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', fontSize: '0.72rem', fontWeight: 700, background: 'var(--studio-c-yoga)', color: 'var(--studio-ink)' }}>
              {userName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'A'}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--studio-side-text)', lineHeight: 1.2 }}>{userName.split(/\s+/)[0]}</Typography>
              <Typography noWrap sx={{ fontSize: '0.75rem', color: 'var(--studio-side-muted)' }}>{userRole}</Typography>
            </Box>
          </ButtonBase>
          <TextSizeToggle value={textSize} onChange={onTextSize} />
        </Box>
      </Box>

      <LockPopover pop={lockPop} onClose={() => setLockPop(null)} />
      <Menu anchorEl={userMenu} open={Boolean(userMenu)} onClose={() => setUserMenu(null)} anchorOrigin={{ vertical: 'top', horizontal: 'left' }} transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
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
  position: 'absolute', width: 1, height: 1, p: 0, m: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
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
