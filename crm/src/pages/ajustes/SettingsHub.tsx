// Ajustes: todo lo que se configura una vez y se toca poco, agrupado. A la
// izquierda el índice por grupos; a la derecha el buscador, «Revisa esto»
// (lo que falta de verdad, GET /api/v1/dashboard/checklist/) y una tarjeta por
// grupo. Cada enlace lleva a la pantalla de siempre: no se pierde ninguna.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, InputBase, MenuItem,
  Paper, Skeleton, Switch, TextField, Typography,
} from '@mui/material';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import StudioIcon from '../../site/StudioIcon';
import { useAuth } from '../../context/AuthContext';
import { useNotify } from '../../components/guide';
import { canInstallCrm, openInstallHelp } from '../../components/InstallCrmApp';
import { useShell } from '../../components/shell/ShellContext';
import { GUIDE_PATH } from '../../onboarding';
import { dashApi, dashRequest, type Checklist } from '../kit/api';
import { Card, PageHead } from '../kit/ui';
import { visuallyHidden } from '../kit/styles';
import { SETTING_GROUPS, searchSettings, type SettingGroup, type SettingItem } from './groups';

function WaitlistDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const notify = useNotify();
  const [cfg, setCfg] = useState<{ enabled: boolean; auto_offer: boolean; claim_minutes: number } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setCfg(null);
    dashRequest<{ enabled: boolean; auto_offer?: boolean; claim_minutes?: number }>('v1/waitlist/settings/')
      .then((c) => setCfg({ enabled: c.enabled, auto_offer: c.auto_offer ?? true, claim_minutes: c.claim_minutes ?? 120 }))
      .catch((e) => { notify(e instanceof Error ? e.message : String(e), 'error'); onClose(); });
  }, [open, notify, onClose]);
  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      await dashRequest('v1/waitlist/settings/', { method: 'PATCH', body: JSON.stringify(cfg) });
      notify('Guardado ✓');
      onClose();
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setSaving(false);
    }
  };
  const minutes = [30, 60, 120, 240, 720, 1440];
  return (
    <Dialog open={open} onClose={onClose} aria-labelledby="wl-title" fullWidth maxWidth="xs">
      <DialogTitle id="wl-title">Lista de espera</DialogTitle>
      <DialogContent>
        <Typography sx={{ color: 'var(--studio-muted)', mb: 2 }}>
          Cuando una clase se llena, tus clientas pueden apuntarse a la lista. Si alguien cancela, la primera recibe un aviso para quedarse la plaza.
        </Typography>
        {!cfg ? <Skeleton height={120} /> : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <FormControlLabel control={<Switch checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} />}
              label="Usar lista de espera" />
            <FormControlLabel disabled={!cfg.enabled}
              control={<Switch checked={cfg.auto_offer} onChange={(e) => setCfg({ ...cfg, auto_offer: e.target.checked })} />}
              label="Ofrecer la plaza sola al liberarse" />
            <TextField select label="Tiempo para aceptar la plaza" value={cfg.claim_minutes} disabled={!cfg.enabled || !cfg.auto_offer}
              onChange={(e) => setCfg({ ...cfg, claim_minutes: Number(e.target.value) })}>
              {(minutes.includes(cfg.claim_minutes) ? minutes : [...minutes, cfg.claim_minutes].sort((a, b) => a - b)).map((m) => (
                <MenuItem key={m} value={m}>{m < 60 ? `${m} minutos` : m < 1440 ? `${m / 60} ${m === 60 ? 'hora' : 'horas'}` : '1 día'}</MenuItem>
              ))}
            </TextField>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={save} disabled={!cfg || saving}>Guardar</Button>
      </DialogActions>
    </Dialog>
  );
}

function CancelDialog({ open, onClose, hours }: { open: boolean; onClose: () => void; hours: number | null }) {
  return (
    <Dialog open={open} onClose={onClose} aria-labelledby="cn-title" fullWidth maxWidth="xs">
      <DialogTitle id="cn-title">Cancelaciones</DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 1.5 }}>
          Tus clientas pueden cancelar una reserva hasta <b>{hours ?? 8} horas antes</b> de la clase y recuperan la clase en su bono.
          Después ya no se devuelve.
        </Typography>
        <Typography sx={{ color: 'var(--studio-muted)', fontSize: '0.9rem' }}>
          Este plazo lo fija quien instaló el panel (variable <code>BOOKING_CANCEL_MIN_HOURS</code>). Si cancelas tú una clase desde el
          calendario, eliges qué devolver a cada clienta.
        </Typography>
      </DialogContent>
      <DialogActions><Button variant="contained" onClick={onClose}>Entendido</Button></DialogActions>
    </Dialog>
  );
}

function ItemRow({ item, onOpen, group }: { item: SettingItem; onOpen: (i: SettingItem) => void; group?: string }) {
  return (
    <ButtonBase onClick={() => onOpen(item)} sx={{
      display: 'flex', alignItems: 'center', gap: 1.25, width: '100%', minHeight: 48, px: 1, py: 0.5, textAlign: 'left',
      justifyContent: 'flex-start', borderRadius: 'var(--studio-radius-md)', color: 'var(--studio-ink)',
      '&:hover': { background: 'var(--studio-surf2)' }, '&.Mui-focusVisible': { outline: '2px solid var(--studio-primary-text)' },
    }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: 'inherit' }}>{item.label}</Typography>
        <Typography sx={{ fontSize: '0.8rem', color: 'var(--studio-muted)' }} noWrap>{group ? `${group} · ` : ''}{item.hint}</Typography>
      </Box>
      <StudioIcon name={item.external ? 'external' : 'next'} sx={{ fontSize: 18, color: 'var(--studio-muted)' }} aria-hidden />
    </ButtonBase>
  );
}

export default function SettingsHub() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { extraSettings } = useShell();
  const [q, setQ] = useState('');
  const [check, setCheck] = useState<Checklist | null>(null);
  const [dialog, setDialog] = useState<'waitlist' | 'cancellations' | null>(null);
  const closeDialog = useCallback(() => setDialog(null), []);

  useEffect(() => { dashApi.checklist().then(setCheck).catch(() => setCheck(null)); }, []);

  const groups = useMemo<SettingGroup[]>(() => SETTING_GROUPS.map((g) => (g.key !== 'account' ? g : {
    ...g,
    items: [
      ...g.items,
      { key: 'guia', label: 'Puesta en marcha', hint: 'Los pasos para abrir tu estudio', icon: 'launch', path: GUIDE_PATH, keywords: 'guía pasos empezar' },
      ...extraSettings.map((l, i) => ({ key: `x${i}`, label: l.label, hint: l.hint, icon: l.icon, path: l.path, external: l.external, keywords: l.keywords })),
    ],
  })), [extraSettings]);

  const results = useMemo(() => searchSettings(groups, q), [groups, q]);

  const open = (it: SettingItem) => {
    if (it.action) { setDialog(it.action); return; }
    if (!it.path) return;
    if (it.external) window.open(it.path, '_blank', 'noopener');
    else navigate(it.path);
  };

  const review = check?.review || [];

  return (
    <Box>
      <PageHead icon={<TuneRoundedIcon />} title="Ajustes" tint="barre" page="settings" />
      <Box sx={{ display: 'grid', gap: 2.25, alignItems: 'start', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: '240px minmax(0, 1fr)' } }}>
        {/* Índice por grupos (escritorio) */}
        <Paper component="nav" aria-label="Grupos de ajustes" elevation={1}
          sx={{ display: { xs: 'none', lg: 'block' }, p: 1.5, position: 'sticky', top: 84, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
          {groups.map((g) => (
            <Box key={g.key} sx={{ mb: 0.5 }}>
              <Typography variant="overline" component="p" sx={{ color: 'var(--studio-muted)', px: 1.25, pt: 1, display: 'block', lineHeight: 2 }}>{g.title}</Typography>
              {g.items.map((it) => (
                <ButtonBase key={it.key} onClick={() => open(it)} sx={{
                  display: 'flex', width: '100%', justifyContent: 'flex-start', minHeight: 40, px: 1.25, borderRadius: 'var(--studio-radius-md)',
                  fontSize: '0.9rem', fontWeight: 500, color: 'var(--studio-ink)', textAlign: 'left',
                  '&:hover': { background: 'var(--studio-surf2)' }, '&.Mui-focusVisible': { outline: '2px solid var(--studio-primary-text)' },
                }}>{it.label}</ButtonBase>
              ))}
            </Box>
          ))}
        </Paper>

        <Box sx={{ minWidth: 0 }}>
          <Box component="label" data-tour="settings-search" sx={{
            display: 'flex', alignItems: 'center', gap: 1.25, minHeight: 54, px: 2, mb: 2, borderRadius: 'var(--studio-radius-btn)',
            background: 'var(--studio-surf)', border: 'var(--studio-border-width) solid var(--studio-border-strong)',
            '&:focus-within': { boxShadow: '0 0 0 3px var(--studio-p-soft)', borderColor: 'var(--studio-primary-text)' },
          }}>
            <SearchRoundedIcon sx={{ color: 'var(--studio-muted)' }} aria-hidden />
            <Box component="span" sx={visuallyHidden}>Buscar un ajuste</Box>
            <InputBase value={q} onChange={(e) => setQ(e.target.value)} fullWidth type="search"
              placeholder="Busca un ajuste: moneda, cancelaciones, dominio…" inputProps={{ 'aria-describedby': 'set-search-n' }} />
          </Box>

          {q.trim() ? (
            <Card labelledBy="set-res-h">
              <Typography id="set-res-h" component="h2" sx={visuallyHidden}>Resultados</Typography>
              <Typography id="set-search-n" aria-live="polite" sx={{ color: 'var(--studio-muted)', fontSize: '0.88rem', px: 1, mb: 0.5 }}>
                {results.length ? `${results.length} ${results.length === 1 ? 'ajuste' : 'ajustes'}` : `No hay ningún ajuste con «${q.trim()}».`}
              </Typography>
              {results.map((r) => <ItemRow key={r.key} item={r} group={r.group} onOpen={open} />)}
            </Card>
          ) : (
            <>
              {check === null ? <Skeleton variant="rounded" height={110} sx={{ mb: 2, borderRadius: 'var(--studio-radius-lg)' }} /> : review.length > 0 && (
                <Paper elevation={0} component="section" aria-labelledby="rv-h" data-tour="settings-review" sx={{ p: { xs: 2, sm: 2.5 }, mb: 2, background: 'var(--studio-warn-soft)', borderColor: 'transparent' }}>
                  <Typography id="rv-h" component="h2" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 700, color: 'var(--studio-warn)', mb: 0.75, fontSize: '1.02rem' }}>
                    <ErrorOutlineRoundedIcon aria-hidden />Revisa esto
                  </Typography>
                  <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                    {review.map((r) => (
                      <Box component="li" key={r.key} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1, minHeight: 52, borderTop: '1px solid rgb(var(--studio-ink-rgb) / 0.08)', '&:first-of-type': { borderTop: 0 } }}>
                        <Typography sx={{ flex: 1, fontWeight: 600, fontSize: '0.92rem', color: 'var(--studio-ink)' }}>{r.title}</Typography>
                        <Button variant="outlined" size="small" onClick={() => navigate(r.to)} sx={{ flex: 'none', bgcolor: 'var(--studio-surf)' }}
                          aria-label={`${r.action}: ${r.title}`}>{r.action}</Button>
                      </Box>
                    ))}
                  </Box>
                </Paper>
              )}

              <Box data-tour="settings-groups" sx={{ display: 'grid', gap: 2, alignItems: 'start', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))' }}>
                {groups.map((g) => (
                  <Card key={g.key} labelledBy={`grp-${g.key}`}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
                      <Box aria-hidden sx={{ width: 34, height: 34, borderRadius: 'var(--studio-radius-md)', display: 'grid', placeItems: 'center', background: `var(--studio-c-${g.tint})`, color: 'var(--studio-ink)' }}>
                        <StudioIcon name={g.icon} sx={{ fontSize: 18 }} />
                      </Box>
                      <Typography id={`grp-${g.key}`} component="h2" sx={{ fontFamily: 'var(--studio-font-heading)', fontWeight: 'var(--studio-heading-weight)', fontSize: '1.04rem', color: 'var(--studio-ink)' }}>
                        {g.title}
                      </Typography>
                    </Box>
                    {g.items.map((it) => <ItemRow key={it.key} item={it} onOpen={open} />)}
                  </Card>
                ))}
              </Box>

              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 3 }}>
                {canInstallCrm() && (
                  <Button variant="outlined" onClick={openInstallHelp} startIcon={<StudioIcon name="install" />}>Instalar el panel en el móvil</Button>
                )}
                <Button onClick={logout} startIcon={<StudioIcon name="logout" />} sx={{ color: 'var(--studio-bad)', '&:hover': { bgcolor: 'var(--studio-bad-soft)' } }}>
                  Cerrar sesión
                </Button>
              </Box>
            </>
          )}
        </Box>
      </Box>
      <WaitlistDialog open={dialog === 'waitlist'} onClose={closeDialog} />
      <CancelDialog open={dialog === 'cancellations'} onClose={closeDialog} hours={check?.booking_cancel_min_hours ?? null} />
    </Box>
  );
}
