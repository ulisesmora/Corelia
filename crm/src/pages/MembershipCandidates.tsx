import { useCallback, useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
  Button, Chip, Stack, Alert, CircularProgress, useMediaQuery, useTheme,
} from '@mui/material';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import RefreshIcon from '@mui/icons-material/Refresh';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import { PageIntro, HelpTip, EmptyState, useNotify } from '../components/guide';
import { friendlyError } from '../utils/errors';
import { authHeaders } from '../utils/auth';
import { API_BASE_URL } from '../config';
import { STUDIO_TZ } from '../site/timezone';
import { useSite, useStudioWebUrl } from '../site/SiteProvider';
import { money } from '../site/money';

interface Candidate {
  user_id: number;
  name: string;
  first_name: string;
  email: string;
  phone: string | null;
  weeks_active: number;
  window_weeks: number;
  classes_per_month: number;
  segment: 'fixed' | 'flexible' | 'intense';
  fixed_slots: { schedule_id: number; title: string; label: string; weeks: number }[];
  plan: { id: number; name: string; price: number; months: number; monthly_price: number; price_per_class: number };
  current_price_per_class: number;
  saving_per_month: number;
  last_contacted: string | null;
  last_emailed: string | null;
}

/** Precio en la moneda del estudio ("12,50 €", "$549"…). */
const fmt = (n: number) => money(n, { decimals: 'auto' });
const niceDate = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: STUDIO_TZ });

function suggestedMessage(c: Candidate, studioName: string, webUrl: string): string {
  const name = c.first_name || '';
  const slot = c.fixed_slots[0];
  const cheaper = c.plan.price_per_class < c.current_price_per_class;
  const habit = slot
    ? `vemos que vienes siempre ${slot.label} 😊`
    : 'vemos que vienes casi todas las semanas 😊';
  const price = cheaper
    ? ` Con la membresía ${c.plan.name} cada clase te saldría a ${fmt(c.plan.price_per_class)} en vez de ${fmt(c.current_price_per_class)}.`
    : '';
  const link = webUrl ? ` Aquí puedes verla: ${webUrl}/prices` : '';
  return `¡Hola ${name}! Te escribimos de ${studioName}, ${habit} ¿Sabías que con la membresía ${c.plan.name} ${
    slot ? 'tu plaza se reserva sola cada semana' : 'tus clases se reservan solas cada semana'
  } y no tienes que acordarte de reservar?${price} No tiene permanencia y los créditos que tienes se conservan. Si quieres te lo explicamos cuando vengas 💛${link}`;
}

function waLink(phone: string | null, text: string): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 9) digits = `34${digits}`; // móvil español sin prefijo
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/**
 * Clientas que vienen cada semana y no tienen membresía. Pensado para que
 * el estudio les escriba personalmente: con pocas clientas, el trato directo es
 * lo que más convierte. Cada contacto queda registrado para no repetir.
 */
export default function MembershipCandidates() {
  const studioName = useSite().config.studio_name;
  const webUrl = useStudioWebUrl();
  const notify = useNotify();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [rows, setRows] = useState<Candidate[] | null>(null);
  const [error, setError] = useState('');
  const [marking, setMarking] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError('');
    setRows(null);
    try {
      const r = await fetch(`${API_BASE_URL}v1/membership-candidates/`, { headers: authHeaders() });
      if (!r.ok) throw r;
      setRows(await r.json());
    } catch (e) {
      setError(await friendlyError(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const markContacted = async (c: Candidate, viaWhatsApp = false) => {
    setMarking(c.user_id);
    try {
      const r = await fetch(`${API_BASE_URL}v1/membership-candidates/${c.user_id}/contacted/`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ plan_id: c.plan.id }),
      });
      if (!r.ok) throw r;
      setRows((prev) => prev?.map((x) => (x.user_id === c.user_id ? { ...x, last_contacted: new Date().toISOString() } : x)) || null);
      notify(
        viaWhatsApp
          ? `Se ha abierto WhatsApp con el mensaje para ${c.first_name || c.name}. La hemos marcado como contactada ✓`
          : `${c.first_name || c.name} marcada como contactada ✓`,
      );
    } catch (e) {
      notify(`No se ha podido marcar como contactada. ${await friendlyError(e)}`, 'error');
    } finally {
      setMarking(null);
    }
  };

  const copyMessage = async (c: Candidate) => {
    try {
      await navigator.clipboard.writeText(suggestedMessage(c, studioName, webUrl));
      notify('Mensaje copiado ✓ Ahora pégalo donde quieras (mantén pulsado y «Pegar»).');
    } catch {
      notify('No se ha podido copiar. Selecciona el texto a mano o usa el botón WhatsApp.', 'error');
    }
  };

  const pending = rows?.filter((r) => !r.last_contacted).length || 0;

  const howComes = (c: Candidate) => (
    <>
      <Typography sx={{ fontSize: '0.95rem' }}>
        Ha venido {c.weeks_active} de las últimas {c.window_weeks} semanas · unas {c.classes_per_month} clases al mes
      </Typography>
      {c.fixed_slots[0] && (
        <Chip size="small" sx={{ mt: 0.5, fontSize: '0.85rem' }} label={`Suele venir: ${c.fixed_slots[0].title.toLowerCase()} ${c.fixed_slots[0].label}`} />
      )}
    </>
  );

  const suggested = (c: Candidate) => {
    const cheaper = c.plan.price_per_class < c.current_price_per_class;
    return (
      <>
        <Typography sx={{ fontWeight: 600, fontSize: '0.98rem' }}>{c.plan.name}</Typography>
        <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary' }}>
          {fmt(c.plan.price)} {c.plan.months === 1 ? 'al mes' : `cada ${c.plan.months} meses`}
          {' · '}{fmt(c.plan.price_per_class)} por clase (ahora paga {fmt(c.current_price_per_class)})
        </Typography>
        {cheaper && c.saving_per_month >= 5 && (
          <Chip size="small" color="success" variant="outlined" sx={{ mt: 0.5, fontSize: '0.85rem' }}
            label={`Ahorraría unos ${fmt(Math.round(c.saving_per_month))} al mes`} />
        )}
        {!cheaper && (
          <Chip size="small" variant="outlined" sx={{ mt: 0.5, fontSize: '0.85rem' }} label="No ahorra dinero: háblale de la comodidad" />
        )}
      </>
    );
  };

  const status = (c: Candidate) => (
    <Stack spacing={0.5} alignItems="flex-start">
      {c.last_contacted
        ? <Chip size="small" color="success" icon={<CheckIcon />} label={`Le escribiste el ${niceDate(c.last_contacted)}`} sx={{ fontSize: '0.85rem' }} />
        : <Chip size="small" color="warning" variant="outlined" label="Aún no le has escrito" sx={{ fontSize: '0.85rem' }} />}
      {c.last_emailed && (
        <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
          Email automático enviado el {niceDate(c.last_emailed)}
        </Typography>
      )}
    </Stack>
  );

  const actions = (c: Candidate) => {
    const wa = waLink(c.phone, suggestedMessage(c, studioName, webUrl));
    return (
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap" useFlexGap justifyContent={{ md: 'flex-end' }}>
        {wa ? (
          <Button variant="contained" color="success" startIcon={<WhatsAppIcon />}
            href={wa} target="_blank" rel="noopener" onClick={() => markContacted(c, true)}
            sx={{ minHeight: 44 }}>
            Escribir por WhatsApp
          </Button>
        ) : (
          <Button variant="outlined" disabled startIcon={<WhatsAppIcon />} sx={{ minHeight: 44 }}>
            Sin teléfono guardado
          </Button>
        )}
        <Button variant="outlined" startIcon={<ContentCopyIcon />} sx={{ minHeight: 44 }} onClick={() => copyMessage(c)}>
          Copiar mensaje
        </Button>
        {!c.last_contacted && (
          <Button variant="outlined" startIcon={marking === c.user_id ? <CircularProgress size={16} color="inherit" /> : <CheckIcon />}
            disabled={marking === c.user_id} sx={{ minHeight: 44 }} onClick={() => markContacted(c)}>
            {marking === c.user_id ? 'Guardando…' : 'Ya le he escrito'}
          </Button>
        )}
      </Stack>
    );
  };

  return (
    <Box>
      <PageIntro
        pageKey="membership-candidates"
        title="Candidatas a membresía"
        subtitle="Clientas que vienen casi cada semana y todavía pagan con bonos. Con la membresía su plaza se reserva sola y suele salirles más barato."
        actions={<Button variant="outlined" startIcon={<RefreshIcon />} onClick={load}>Actualizar</Button>}
        steps={[
          { title: 'Mira quién sale en la lista', text: 'Te decimos cuánto viene y qué membresía le iría mejor.' },
          { title: 'Pulsa «Escribir por WhatsApp»', text: 'Se abre WhatsApp con un mensaje ya escrito. Puedes cambiarlo antes de enviarlo.' },
          { title: 'Listo', text: 'Al pulsarlo la marcamos como «ya le escribiste» para que no le repitas el mensaje.' },
        ]}
        tips={[
          'Si prefieres escribirle por otro sitio, usa «Copiar mensaje» y luego «Ya le he escrito».',
          'Además, cada clienta ve esta recomendación en su cuenta de la web y recibe como mucho un email automático al mes (3 como máximo en total).',
        ]}
      />

      {rows && rows.length > 0 && (
        <Alert severity={pending > 0 ? 'info' : 'success'} sx={{ mb: 2, fontSize: '0.97rem' }}>
          {pending > 0
            ? `${rows.length} ${rows.length === 1 ? 'clienta' : 'clientas'} en la lista · ${pending} ${pending === 1 ? 'aún sin escribirle' : 'aún sin escribirles'}.`
            : `Ya les has escrito a todas (${rows.length}). ¡Bien hecho!`}
        </Alert>
      )}

      {error && (
        <Alert severity="error" action={<Button color="inherit" onClick={load} startIcon={<RefreshIcon />} sx={{ minHeight: 44 }}>Reintentar</Button>}>
          {error}
        </Alert>
      )}
      {!rows && !error && (
        <Stack alignItems="center" spacing={1.5} sx={{ py: 6 }}>
          <CircularProgress />
          <Typography color="text.secondary">Buscando clientas que vienen cada semana…</Typography>
        </Stack>
      )}

      {rows && rows.length === 0 && (
        <Paper sx={{ borderRadius: 3 }}>
          <EmptyState
            icon={<WorkspacePremiumIcon />}
            title="Ahora mismo no hay candidatas 🎉"
            text="Todas las clientas que vienen cada semana ya tienen membresía. Vuelve a mirar dentro de unas semanas."
          />
        </Paper>
      )}

      {rows && rows.length > 0 && (isMobile ? (
        <Stack spacing={1.5}>
          {rows.map((c) => (
            <Paper key={c.user_id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '1.05rem' }}>{c.name}</Typography>
                  <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary', wordBreak: 'break-word' }}>{c.phone || c.email}</Typography>
                </Box>
              </Stack>
              <Box sx={{ mt: 1 }}>{status(c)}</Box>
              <Box sx={{ mt: 1.5 }}>{howComes(c)}</Box>
              <Box sx={{ mt: 1.5 }}>
                <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>Membresía que le recomendamos</Typography>
                {suggested(c)}
              </Box>
              <Box sx={{ mt: 2 }}>{actions(c)}</Box>
            </Paper>
          ))}
        </Stack>
      ) : (
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Clienta</TableCell>
                <TableCell>Cuánto viene</TableCell>
                <TableCell>
                  Le recomendamos{' '}
                  <HelpTip title="¿Cómo se elige?">
                    Miramos cuántas clases hace al mes y lo que paga ahora con sus bonos, y elegimos la membresía que le sale
                    mejor. Si no ahorra dinero, el argumento es la comodidad: su plaza se reserva sola.
                  </HelpTip>
                </TableCell>
                <TableCell>¿Le has escrito?</TableCell>
                <TableCell align="right">Qué puedes hacer</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.user_id} hover>
                  <TableCell>
                    <Typography fontWeight={700}>{c.name}</Typography>
                    <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary' }}>{c.phone || c.email}</Typography>
                  </TableCell>
                  <TableCell>{howComes(c)}</TableCell>
                  <TableCell>{suggested(c)}</TableCell>
                  <TableCell>{status(c)}</TableCell>
                  <TableCell align="right">{actions(c)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ))}
    </Box>
  );
}
