// Ficha de una clase del calendario: panel a la derecha (hoja inferior en el
// móvil) con quién viene («Ha venido»), lista de espera («Dar plaza»),
// apuntar a alguien, avisar, editar y cancelar con devolución.
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Drawer,
  FormControlLabel, IconButton, List, ListItemButton, ListItemText, Menu, MenuItem, Radio, RadioGroup, Stack,
  TextField, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import RepeatIcon from '@mui/icons-material/Repeat';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import BlockIcon from '@mui/icons-material/Block';
import UndoIcon from '@mui/icons-material/Undo';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import { useConfirm } from '../guide';
import GuideLink from '../charging/GuideLink';
import { ApiError, calendarApi, errorText } from './api';
import type { Attendee, Occurrence, OccurrenceDetail, WaitlistItem } from './types';
import type { ClassTone } from './classColors';
import { DAYS, DS, MON, dayNum, initials, monthIdx, weekdayOf } from './dates';

export type Toast = (msg: string, opts?: { undo?: () => Promise<void> | void; severity?: 'success' | 'error' | 'info' | 'warning' }) => void;

interface Props {
  occurrence: Occurrence | null;
  mobile: boolean;
  today: string;
  tone: ClassTone | null;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (o: Occurrence) => void;
  toast: Toast;
  /** Variables --k-* del calendario (el panel se pinta fuera de .kc) */
  vars?: CSSProperties;
}

const whenLine = (o: Occurrence) =>
  `${DAYS[weekdayOf(o.date)]} ${dayNum(o.date)} ${MON[monthIdx(o.date)]} · ${o.start.slice(11)}–${o.end.slice(11)}`;

const credits = (v: string | null) => {
  const n = Number(v || 0);
  return `${n % 1 === 0 ? n : n.toFixed(1)}`;
};

function subtitle(a: Attendee | WaitlistItem) {
  if ('guest' in a && a.guest) return 'Invitado · pagó con tarjeta';
  if (a.plan) return a.plan;
  if ('paid_with' in a && a.paid_with === 'free') return 'Sin coste';
  const n = Number(a.balance || 0);
  return n > 0 ? `Bono · le quedan ${credits(a.balance)}` : 'Sin clases en su bono';
}

export default function ClassDrawer({ occurrence, mobile, today, tone, onClose, onChanged, onEdit, toast, vars }: Props) {
  const open = !!occurrence;
  const o = occurrence;
  const confirm = useConfirm();
  const [detail, setDetail] = useState<OccurrenceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'detail' | 'cancel'>('detail');
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<{ el: HTMLElement; a: Attendee } | null>(null);
  // Cancelar
  const [scope, setScope] = useState<'this' | 'following'>('this');
  const [refund, setRefund] = useState<'credits' | 'money' | 'none'>('credits');
  const [notify, setNotify] = useState(true);
  const [message, setMessage] = useState('');

  const ref = o && o.schedule_id ? { schedule: o.schedule_id, date: o.date } : null;

  const load = useCallback(async () => {
    if (!o || !o.schedule_id) { setDetail(null); return; }
    setLoading(true);
    setError('');
    try {
      setDetail(await calendarApi.detail({ schedule: o.schedule_id, date: o.date }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [o]);

  useEffect(() => {
    setMode('detail');
    setScope('this');
    setRefund('credits');
    setNotify(true);
    setMessage('');
    setDetail(null);
    if (o) load();
  }, [o, load]);

  const refresh = async () => { await load(); onChanged(); };
  const occ = detail?.occurrence || o;
  const canCheck = !!occ && occ.date <= today;
  const presentCount = detail?.attendees.filter((a) => a.status === 'attended').length || 0;

  const toggleCheck = async (a: Attendee) => {
    const next = a.status !== 'attended';
    setDetail((d) => d && { ...d, attendees: d.attendees.map((x) => x.booking_id === a.booking_id ? { ...x, status: next ? 'attended' : 'reserved' } : x) });
    try {
      await calendarApi.checkIn(a.booking_id, next);
      onChanged();
      toast(next ? `${a.name}: ha venido` : `${a.name}: desmarcada`, {
        undo: async () => { await calendarApi.checkIn(a.booking_id, !next); await refresh(); },
      });
    } catch (e) {
      toast(errorText(e), { severity: 'error' });
      load();
    }
  };

  const giveSpot = async (w: WaitlistItem, force = false) => {
    if (!detail) return;
    setBusy(true);
    try {
      try {
        await calendarApi.promote(w.id, 'credits', force);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'insufficient_credits') {
          const ok = await confirm({
            title: `${w.name} no tiene clases en su bono`,
            message: '¿Le damos la plaza igualmente, sin descontar nada?',
            confirmText: 'Sí, dar plaza sin coste',
            cancelText: 'No',
          });
          if (!ok) return;
          await calendarApi.promote(w.id, 'free', force);
        } else throw e;
      }
      toast(`${w.name} tiene plaza. Le avisamos por email y app.`);
      await refresh();
    } catch (e) {
      toast(errorText(e), { severity: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const removeFromWaitlist = async (w: WaitlistItem) => {
    try {
      await calendarApi.removeWaitlist(w.id);
      toast(`${w.name} ya no está en la lista de espera.`);
      await refresh();
    } catch (e) {
      toast(errorText(e), { severity: 'error' });
    }
  };

  const removePerson = async (a: Attendee, how: 'credits' | 'none') => {
    setRowMenu(null);
    const ok = await confirm({
      title: `¿Quitar a ${a.name} de esta clase?`,
      message: how === 'credits' ? 'Le devolvemos la clase a su bono y le avisamos.' : 'No le devolvemos nada. Le avisamos por email.',
      confirmText: 'Sí, quitar de la clase', cancelText: 'No, volver', tone: 'danger',
    });
    if (!ok) return;
    try {
      await calendarApi.removeBooking(a.booking_id, how, true);
      toast(`${a.name} ya no está en esta clase.`);
      await refresh();
    } catch (e) {
      toast(errorText(e), { severity: 'error' });
    }
  };

  const doCancel = async () => {
    if (!ref || !occ) return;
    setBusy(true);
    try {
      const r = await calendarApi.cancel(ref, { scope: occ.recurring ? scope : 'this', refund, notify, message });
      const parts = [`Clase cancelada`];
      if (r.cancelled) parts.push(`${r.cancelled} reserva${r.cancelled === 1 ? '' : 's'} anulada${r.cancelled === 1 ? '' : 's'}`);
      if (r.refunded_credits) parts.push(`${r.refunded_credits} clase${r.refunded_credits === 1 ? '' : 's'} devuelta${r.refunded_credits === 1 ? '' : 's'} al bono`);
      if (r.refunded_card) parts.push(`${r.refunded_card} reembolso${r.refunded_card === 1 ? '' : 's'} a tarjeta`);
      if (r.notified) parts.push(`${r.notified} aviso${r.notified === 1 ? '' : 's'} enviados`);
      toast(parts.join(' · '), scope === 'this' || !occ.recurring ? { undo: async () => { await calendarApi.reactivate(ref, true); onChanged(); } } : undefined);
      onChanged();
      onClose();
    } catch (e) {
      toast(errorText(e), { severity: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const reactivate = async () => {
    if (!ref) return;
    setBusy(true);
    try {
      await calendarApi.reactivate(ref, false);
      toast('Clase reactivada: vuelve a estar en la web para reservar. Las reservas anuladas no se recuperan.');
      await refresh();
    } catch (e) {
      toast(errorText(e), { severity: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const t = tone;
  const booked = detail?.attendees.length ?? occ?.booked ?? 0;
  const pct = occ ? Math.min(100, (occ.booked / Math.max(1, occ.capacity)) * 100) : 0;

  return (
    <Drawer
      anchor={mobile ? 'bottom' : 'right'}
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: mobile
            ? { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92dvh' }
            : { width: 'min(460px, calc(100vw - 24px))', m: 1.5, height: 'calc(100% - 24px)', borderRadius: 4 },
          style: vars,
          className: 'kc',
          'aria-labelledby': 'kc-drawer-title',
        } as object,
      }}
    >
      {occ && (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
          {/* Cabecera */}
          <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ p: 2.25, pb: 1.5 }}>
            <Box sx={{ width: 42, height: 42, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: t?.tint, flex: 'none' }}>
              <LayersOutlinedIcon />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography id="kc-drawer-title" component="h2" sx={{ fontSize: '1.25rem', fontWeight: 700, lineHeight: 1.2 }}>{occ.title}</Typography>
              <Typography color="text.secondary" sx={{ fontSize: '.9rem' }}>{whenLine(occ)}</Typography>
            </Box>
            <IconButton onClick={onClose} aria-label="Cerrar la ficha" sx={{ border: 1, borderColor: 'divider' }}><CloseIcon /></IconButton>
          </Stack>

          <Box sx={{ flex: 1, overflow: 'auto', px: 2.25, pb: 2 }}>
            {mode === 'cancel' ? (
              <Box>
                <Typography component="h3" sx={{ fontSize: '1.1rem', fontWeight: 700 }}>¿Cancelar esta clase?</Typography>
                <Typography color="text.secondary" sx={{ mb: 2 }}>Avisaremos a quien tenga reserva.</Typography>
                {occ.recurring && (
                  <Box component="fieldset" sx={{ border: 0, p: 0, m: 0, mb: 2 }}>
                    <Typography component="legend" sx={{ fontWeight: 600, mb: 1 }}>¿Qué clases?</Typography>
                    <RadioGroup value={scope} onChange={(e) => setScope(e.target.value as 'this' | 'following')}>
                      <OptionRow value="this" label={`Solo esta (${DS[weekdayOf(occ.date)].toLowerCase()} ${dayNum(occ.date)})`} />
                      <OptionRow value="following" label="Esta y las siguientes" hint="La clase deja de estar en el horario desde este día." />
                    </RadioGroup>
                  </Box>
                )}
                <Box component="fieldset" sx={{ border: 0, p: 0, m: 0, mb: 2 }}>
                  <Typography component="legend" sx={{ fontWeight: 600, mb: 1, display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                    ¿Qué devolvemos? <GuideLink chapter="reembolsos">Cómo funcionan las devoluciones</GuideLink>
                  </Typography>
                  <RadioGroup value={refund} onChange={(e) => setRefund(e.target.value as 'credits' | 'money' | 'none')}>
                    <OptionRow value="credits" label="Devolver la clase a su bono" chip="Recomendado" hint="Quien pagó con tarjeta sin cuenta recibe el dinero." />
                    <OptionRow value="money" label="Devolver el dinero" hint="A quien pagó esta clase con tarjeta. Las de bono recuperan la clase." />
                    <OptionRow value="none" label="No devolver nada" />
                  </RadioGroup>
                </Box>
                <FormControlLabel
                  sx={{ border: 1, borderColor: 'divider', borderRadius: 3, m: 0, px: 1, py: 0.5, width: '100%' }}
                  control={<Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)} />}
                  label={`Avisar ${booked === 1 ? 'a la persona apuntada' : `a las ${booked} personas apuntadas`} por email y app`}
                />
                {notify && (
                  <TextField label="Mensaje (opcional)" placeholder="Ej.: Tenemos una baja por enfermedad. ¡Perdona las molestias!"
                    value={message} onChange={(e) => setMessage(e.target.value)} multiline minRows={2} fullWidth sx={{ mt: 2 }} />
                )}
              </Box>
            ) : (
              <>
                <Box sx={{ p: 2, borderRadius: 4, bgcolor: t?.tint, mb: 2 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    {occ.instructor && <span className="kc-av" style={{ background: 'var(--k-surf)' }}>{initials(occ.instructor.name)}</span>}
                    <Typography sx={{ fontWeight: 700 }}>{occ.instructor?.name || 'Sin profesor'}</Typography>
                    <Typography color="text.secondary">·</Typography>
                    <Typography>{occ.room.name}</Typography>
                  </Stack>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                    {occ.recurring ? <><RepeatIcon fontSize="small" /><Typography variant="body2">Cada {DAYS[weekdayOf(occ.date)].toLowerCase()}</Typography></>
                      : <Typography variant="body2">Clase de un solo día</Typography>}
                    {occ.canceled && <Chip size="small" color="error" label="Cancelada" />}
                    {occ.blackout && <Chip size="small" label={occ.blackout.reason || 'Cerrada'} />}
                  </Stack>
                  <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mt: 1.5 }}>
                    <Box sx={{ flex: 1, height: 8, borderRadius: 9, bgcolor: 'background.paper', overflow: 'hidden' }}>
                      <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: t?.dot }} />
                    </Box>
                    <Typography sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{occ.booked} de {occ.capacity}</Typography>
                    {occ.booked >= occ.capacity && !occ.canceled && <Chip size="small" color="warning" label="Llena" />}
                  </Stack>
                </Box>

                {occ.kind === 'event' && (
                  <Alert severity="info">Es un evento especial. Sus reservas se ven en «Reservas».</Alert>
                )}
                {loading && <Box sx={{ py: 3, textAlign: 'center' }}><CircularProgress size={28} /></Box>}
                {error && <Alert severity="error" action={<Button onClick={load}>Reintentar</Button>}>{error}</Alert>}

                {detail && (
                  <>
                    <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mt: 1 }}>
                      <Typography component="h3" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.25 }}>
                        Asistentes · {detail.attendees.length}
                        <GuideLink chapter="en-mano" iconOnly>Pagos en mano y clientes fijos</GuideLink>
                      </Typography>
                      {canCheck && detail.attendees.length > 0 && (
                        <Typography variant="body2" color="text.secondary" aria-live="polite">{presentCount} han venido</Typography>
                      )}
                    </Stack>
                    {detail.attendees.length ? (
                      <Box>
                        {detail.attendees.map((a) => (
                          <div className="kc-person" key={a.booking_id}>
                            <span className="kc-av" aria-hidden="true">{initials(a.name)}</span>
                            <div className="who"><b>{a.name}</b><small>{subtitle(a)}</small></div>
                            {canCheck && (
                              <Button size="small" variant={a.status === 'attended' ? 'contained' : 'outlined'} color={a.status === 'attended' ? 'success' : 'inherit'}
                                startIcon={<CheckIcon />} aria-pressed={a.status === 'attended'} onClick={() => toggleCheck(a)}
                                sx={{ borderRadius: 99, whiteSpace: 'nowrap', minHeight: 40 }}>
                                Ha venido
                              </Button>
                            )}
                            <IconButton aria-label={`Más opciones para ${a.name}`} onClick={(e) => setRowMenu({ el: e.currentTarget, a })}><MoreVertIcon /></IconButton>
                          </div>
                        ))}
                      </Box>
                    ) : (
                      <Typography color="text.secondary" sx={{ py: 1 }}>Aún no hay nadie apuntado.</Typography>
                    )}

                    {detail.waitlist.length > 0 && (
                      <>
                        <Typography component="h3" sx={{ fontWeight: 700, mt: 2.5, display: 'flex', alignItems: 'center', gap: 0.25 }}>
                          Lista de espera · {detail.waitlist.length}
                          <GuideLink chapter="espera" iconOnly>Cómo funciona la lista de espera</GuideLink>
                        </Typography>
                        {detail.waitlist.map((w, i) => (
                          <div className="kc-person" key={w.id}>
                            <Typography sx={{ width: 18, textAlign: 'center', fontWeight: 700, color: 'text.secondary' }}>{w.position}</Typography>
                            <span className="kc-av" aria-hidden="true">{initials(w.name)}</span>
                            <div className="who">
                              <b>{w.name}</b>
                              <small>{w.status === 'offered' && w.offer_alive ? `Plaza ofrecida hasta las ${w.offer_expires_at?.slice(11)}` : i === 0 ? 'Primer puesto en la lista' : 'Esperando'} · {subtitle(w)}</small>
                            </div>
                            {(detail.free_seats > 0 || (w.status === 'offered' && w.offer_alive)) && !occ.canceled ? (
                              <Button size="small" variant="contained" color="secondary" disabled={busy} onClick={() => giveSpot(w)} sx={{ borderRadius: 99, whiteSpace: 'nowrap' }}>Dar plaza</Button>
                            ) : i === 0 && !occ.canceled ? (
                              <Button size="small" variant="text" disabled={busy} onClick={async () => {
                                  const ok = await confirm({ title: `¿Dar plaza a ${w.name}?`, message: 'La clase está llena: tendrá una plaza más de las previstas.', confirmText: 'Sí, dar plaza' });
                                  if (ok) giveSpot(w, true);
                                }}
                                sx={{ whiteSpace: 'nowrap' }}>Dar plaza (+1)</Button>
                            ) : null}
                            <IconButton aria-label={`Quitar a ${w.name} de la lista de espera`} onClick={() => removeFromWaitlist(w)}><CloseIcon fontSize="small" /></IconButton>
                          </div>
                        ))}
                        {detail.free_seats === 0 && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Si alguien cancela, la plaza pasa sola a quien va primero (por email y app).</Typography>}
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </Box>

          {/* Acciones */}
          {occ.kind === 'class' && (
            <Box sx={{ borderTop: 1, borderColor: 'divider', p: 1.75, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', pb: mobile ? 'calc(14px + env(safe-area-inset-bottom))' : 1.75 }}>
              {mode === 'cancel' ? (
                <>
                  <Button onClick={() => setMode('detail')} disabled={busy}>Volver</Button>
                  <Button variant="contained" color="error" startIcon={<BlockIcon />} onClick={doCancel} disabled={busy} sx={{ ml: 'auto' }}>
                    {busy ? 'Cancelando…' : 'Cancelar clase'}
                  </Button>
                </>
              ) : occ.canceled ? (
                <Button variant="contained" startIcon={<UndoIcon />} onClick={reactivate} disabled={busy}>Reactivar clase</Button>
              ) : (
                <>
                  <Button variant="contained" startIcon={<PersonAddAltIcon />} onClick={() => setAddOpen(true)} disabled={occ.past}>Añadir</Button>
                  <Button variant="outlined" startIcon={<SendOutlinedIcon />} onClick={() => setNotifyOpen(true)} disabled={!booked}>Avisar</Button>
                  <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => onEdit(occ)} disabled={occ.started}>Editar</Button>
                  {!occ.started && (
                    <Button color="error" onClick={() => setMode('cancel')} sx={{ ml: 'auto' }}>Cancelar clase</Button>
                  )}
                </>
              )}
            </Box>
          )}
        </Box>
      )}

      <Menu anchorEl={rowMenu?.el} open={!!rowMenu} onClose={() => setRowMenu(null)}>
        <MenuItem onClick={() => rowMenu && removePerson(rowMenu.a, 'credits')}>Quitar y devolver la clase</MenuItem>
        <MenuItem onClick={() => rowMenu && removePerson(rowMenu.a, 'none')}>Quitar sin devolver</MenuItem>
        {rowMenu?.a.phone && <MenuItem component="a" href={`tel:${rowMenu.a.phone}`}>Llamar · {rowMenu.a.phone}</MenuItem>}
      </Menu>

      {ref && occ && (
        <AddClientDialog open={addOpen} onClose={() => setAddOpen(false)} sessionRef={ref} title={occ.title}
          full={!!detail && detail.free_seats <= 0} price={Number(occ.price_credits)}
          onAdded={async (name, bookingId) => {
            setAddOpen(false);
            toast(`${name}: reserva hecha en ${occ.title}.`, { undo: async () => { await calendarApi.removeBooking(bookingId, 'credits'); await refresh(); } });
            await refresh();
          }} />
      )}
      {ref && occ && (
        <NotifyDialog open={notifyOpen} onClose={() => setNotifyOpen(false)} sessionRef={ref} people={booked} title={occ.title}
          onSent={(n) => { setNotifyOpen(false); toast(`Aviso enviado a ${n} persona${n === 1 ? '' : 's'}.`); }} />
      )}
    </Drawer>
  );
}

function OptionRow({ value, label, hint, chip }: { value: string; label: string; hint?: string; chip?: string }) {
  return (
    <FormControlLabel
      value={value}
      control={<Radio />}
      sx={{
        m: 0, mb: 1, px: 1, py: 0.75, border: 1, borderColor: 'divider', borderRadius: 3, alignItems: 'flex-start',
        '&:has(input:checked)': { borderColor: 'primary.main', bgcolor: 'action.selected' },
        '& .MuiFormControlLabel-label': { flex: 1, pt: 1 },
      }}
      label={
        <Box>
          <Stack direction="row" spacing={1} alignItems="center"><b>{label}</b>{chip && <Chip size="small" color="success" variant="outlined" label={chip} />}</Stack>
          {hint && <Typography variant="body2" color="text.secondary">{hint}</Typography>}
        </Box>
      }
    />
  );
}

interface UserHit { id: number; email: string; first_name?: string; last_name?: string; phone?: string }

function AddClientDialog({ open, onClose, sessionRef, title, full, price, onAdded }: {
  open: boolean; onClose: () => void; sessionRef: { schedule: number; date: string }; title: string; full: boolean; price: number;
  onAdded: (name: string, bookingId: number) => void;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<UserHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState<UserHit | null>(null);
  const [charge, setCharge] = useState(true);
  const [force, setForce] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setQ(''); setHits([]); setPick(null); setCharge(price > 0); setForce(false); setError(''); } }, [open, price]);
  useEffect(() => {
    if (!open || q.trim().length < 2) { setHits([]); return; }
    const id = window.setTimeout(async () => {
      setLoading(true);
      try { setHits((await calendarApi.searchUsers(q.trim())).slice(0, 8)); } catch { setHits([]); } finally { setLoading(false); }
    }, 250);
    return () => window.clearTimeout(id);
  }, [q, open]);

  const name = (u: UserHit) => `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email;
  const save = async () => {
    if (!pick) return;
    setSaving(true);
    setError('');
    try {
      const r = await calendarApi.addClient(sessionRef, { user: pick.id, charge: charge ? 'credits' : 'free', force, notify: true });
      onAdded(name(pick), r.booking_id);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'full') setForce(true);
      setError(errorText(e) + (e instanceof ApiError && e.code === 'full' ? ' Marca «Apuntar aunque esté llena» para añadir una plaza más.' : ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="kc-add-title">
      <DialogTitle id="kc-add-title">Apuntar a {title}</DialogTitle>
      <DialogContent>
        <TextField autoFocus fullWidth label="Buscar cliente" placeholder="Nombre, email o teléfono" value={q}
          onChange={(e) => { setQ(e.target.value); setPick(null); }} sx={{ mt: 1 }} />
        {loading && <Box sx={{ py: 1 }}><CircularProgress size={20} /></Box>}
        {!pick && hits.length > 0 && (
          <List dense sx={{ border: 1, borderColor: 'divider', borderRadius: 2, mt: 1, maxHeight: 260, overflow: 'auto' }}>
            {hits.map((u) => (
              <ListItemButton key={u.id} onClick={() => setPick(u)}>
                <ListItemText primary={name(u)} secondary={u.email} />
              </ListItemButton>
            ))}
          </List>
        )}
        {!pick && q.trim().length >= 2 && !loading && !hits.length && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No encontramos a nadie. Puedes crear su ficha en «Clientes».</Typography>
        )}
        {pick && (
          <Stack spacing={1} sx={{ mt: 2 }}>
            <Alert severity="info" icon={false} action={<Button onClick={() => setPick(null)}>Cambiar</Button>}><b>{name(pick)}</b><br />{pick.email}</Alert>
            {price > 0 && <FormControlLabel control={<Checkbox checked={charge} onChange={(e) => setCharge(e.target.checked)} />} label={`Descontar ${price === 1 ? '1 clase' : `${price} clases`} de su bono`} />}
            <GuideLink chapter="en-mano" sx={{ alignSelf: 'flex-start' }}>¿Te paga en mano?</GuideLink>
            {(full || force) && <FormControlLabel control={<Checkbox checked={force} onChange={(e) => setForce(e.target.checked)} />} label="Apuntar aunque esté llena" />}
          </Stack>
        )}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={save} disabled={!pick || saving}>{saving ? 'Apuntando…' : 'Apuntar'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function NotifyDialog({ open, onClose, sessionRef, people, title, onSent }: {
  open: boolean; onClose: () => void; sessionRef: { schedule: number; date: string }; people: number; title: string; onSent: (n: number) => void;
}) {
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setMsg(''); setError(''); } }, [open]);
  const send = async () => {
    setSaving(true);
    setError('');
    try {
      const r = await calendarApi.notify(sessionRef, { message: msg });
      onSent(r.people);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="kc-notify-title">
      <DialogTitle id="kc-notify-title">Avisar {people === 1 ? 'a la persona apuntada' : `a las ${people} personas apuntadas`} de {title}</DialogTitle>
      <DialogContent>
        <TextField autoFocus fullWidth multiline minRows={3} label="Mensaje" placeholder="Ej.: Hoy entramos por la puerta lateral." value={msg}
          onChange={(e) => setMsg(e.target.value)} sx={{ mt: 1 }} helperText="Les llega por email y como aviso en la app." />
        {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" startIcon={<SendOutlinedIcon />} onClick={send} disabled={!msg.trim() || saving}>{saving ? 'Enviando…' : 'Enviar aviso'}</Button>
      </DialogActions>
    </Dialog>
  );
}

