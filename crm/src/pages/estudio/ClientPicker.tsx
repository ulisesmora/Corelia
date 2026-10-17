// Elegir al cliente en un toque: buscador grande + recientes y quienes se
// quedan sin clases; o «¿Primera vez? Dar de alta» (ficha sin cuenta, aquí mismo).
// Lo usan «Créditos» y el asistente «Nuevo cliente del estudio».
import { useEffect, useRef, useState } from 'react';
import { Alert, Box, ButtonBase, CircularProgress, InputAdornment, Skeleton, TextField, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PersonAddAlt1OutlinedIcon from '@mui/icons-material/PersonAddAlt1Outlined';
import { isPlaceholderEmail } from '../../site/email';
import { Avatar, Tag } from '../kit/ui';
import NewClientForm from './NewClientForm';
import { clientName, creditsText, studioApi, type ClientLite, type ShortcutClient } from './api';

interface Props {
  onPick: (u: ClientLite, isNew: boolean) => void;
  /** Texto del botón del alta */
  newLabel?: string;
  /** Empieza con el alta abierta (p. ej. «+ Nuevo → Cliente del estudio») */
  startNew?: boolean;
  autoFocus?: boolean;
}

function Row({ u, onClick, balance, low, plan }: {
  u: ClientLite; onClick: () => void; balance?: number; low?: boolean; plan?: ShortcutClient['plan'];
}) {
  const name = clientName(u) || '(Sin nombre)';
  const sub = [u.phone, u.email && !isPlaceholderEmail(u.email) ? u.email : ''].filter(Boolean).join(' · ');
  return (
    <ButtonBase onClick={onClick} aria-label={`Elegir a ${name}`} sx={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 56, px: 1.25, py: 1, textAlign: 'left',
      borderRadius: 'var(--studio-radius-md)', '&:hover, &.Mui-focusVisible': { background: 'var(--studio-surf2)' },
    }}>
      <Avatar name={name} size={36} ring={false} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontWeight: 700, color: 'var(--studio-ink)', fontSize: '0.96rem' }}>{name}</Typography>
        <Typography noWrap sx={{ color: 'var(--studio-muted)', fontSize: '0.84rem' }}>{sub || 'Sin móvil ni email'}</Typography>
      </Box>
      {plan && <Tag tone={plan.overdue ? 'warn' : 'p'} sx={{ display: { xs: plan.overdue ? 'inline-flex' : 'none', sm: 'inline-flex' } }}>{plan.overdue ? 'Toca renovar' : 'Plan del estudio'}</Tag>}
      {balance !== undefined && <Tag tone={low ? 'warn' : 'n'}>{creditsText(balance)}</Tag>}
    </ButtonBase>
  );
}

export default function ClientPicker({ onPick, newLabel = 'Dar de alta y seguir', startNew = false, autoFocus = true }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ClientLite[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [short, setShort] = useState<{ recent: ShortcutClient[]; low: ShortcutClient[] } | null>(null);
  const [creating, setCreating] = useState(startNew);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    studioApi.shortcuts().then(setShort).catch(() => setShort({ recent: [], low: [] }));
  }, []);

  useEffect(() => {
    window.clearTimeout(timer.current);
    const term = q.trim();
    if (term.length < 2) { setResults(null); setSearching(false); return undefined; }
    setSearching(true);
    timer.current = window.setTimeout(() => {
      studioApi.searchClients(term)
        .then((l) => { setResults(l.slice(0, 12)); setError(''); })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setSearching(false));
    }, 280);
    return () => window.clearTimeout(timer.current);
  }, [q]);

  const bal = new Map((short ? [...short.recent, ...short.low] : []).map((s) => [s.id, s]));
  const label = { fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--studio-muted)', px: 1.25, pt: 1.5, pb: 0.5 } as const;

  return (
    <Box>
      {/* Camino 1: buscar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <SearchIcon sx={{ color: 'var(--studio-primary-text)' }} aria-hidden />
        <Typography sx={{ fontWeight: 700, color: 'var(--studio-ink)' }}>¿Ya ha venido? <Box component="span" sx={{ fontWeight: 400, color: 'var(--studio-muted)' }}>Busca su nombre o tócalo abajo.</Box></Typography>
      </Box>
      <TextField
        fullWidth autoFocus={autoFocus && !startNew} value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Nombre, móvil o email" data-tour="search"
        slotProps={{
          input: {
            startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
            endAdornment: searching ? <InputAdornment position="end"><CircularProgress size={18} /></InputAdornment> : undefined,
            sx: { minHeight: 52, fontSize: '1.05rem' },
          },
          htmlInput: { autoComplete: 'off', enterKeyHint: 'search', 'aria-label': 'Buscar cliente' },
        }}
      />
      {error && <Alert severity="error" sx={{ mt: 1 }}>No se ha podido buscar. {error}</Alert>}

      <Box data-tour="list" sx={{ mt: 1 }}>
        {results !== null ? (
          results.length === 0 && !searching ? (
            <Typography sx={{ p: 1.5, color: 'var(--studio-muted)' }}>
              Nadie con «{q.trim()}». ¿Primera vez? Dale de alta aquí abajo.
            </Typography>
          ) : results.map((u) => {
            const s = bal.get(u.id);
            return <Row key={u.id} u={u} onClick={() => onPick(u, false)} balance={s?.balance} low={s?.low} plan={s?.plan} />;
          })
        ) : short === null ? (
          [0, 1, 2].map((i) => <Skeleton key={i} height={56} />)
        ) : (
          <>
            {short.low.length > 0 && (
              <>
                <Typography sx={label}>Se están quedando sin clases</Typography>
                {short.low.map((u) => <Row key={`l${u.id}`} u={u} onClick={() => onPick(u, false)} balance={u.balance} low plan={u.plan} />)}
              </>
            )}
            {short.recent.filter((u) => !short.low.some((l) => l.id === u.id)).length > 0 && (
              <>
                <Typography sx={label}>Recientes</Typography>
                {short.recent.filter((u) => !short.low.some((l) => l.id === u.id))
                  .map((u) => <Row key={`r${u.id}`} u={u} onClick={() => onPick(u, false)} balance={u.balance} low={u.low} plan={u.plan} />)}
              </>
            )}
            {!short.low.length && !short.recent.length && (
              <Typography sx={{ p: 1.5, color: 'var(--studio-muted)', fontSize: '0.92rem' }}>
                Aquí verás a los clientes que tocas más a menudo.
              </Typography>
            )}
          </>
        )}
      </Box>

      {/* Camino 2: dar de alta */}
      <Box data-tour="new-client" sx={{
        mt: 2, p: { xs: 1.5, sm: 2 }, borderRadius: 'var(--studio-radius-md)',
        border: '1.5px dashed var(--studio-border-strong)', background: creating ? 'var(--studio-surf)' : 'transparent',
      }}>
        {creating ? (
          <>
            <Typography sx={{ fontWeight: 700, color: 'var(--studio-ink)', mb: 1.5 }}>Dar de alta a un cliente nuevo</Typography>
            <NewClientForm
              initialName={results !== null && results.length === 0 ? q.trim() : ''}
              submitLabel={newLabel}
              onCreated={(u) => onPick(u, true)}
              onPickExisting={(u) => onPick(u, false)}
              onCancel={() => setCreating(false)}
            />
          </>
        ) : (
          <ButtonBase onClick={() => setCreating(true)} sx={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 52, justifyContent: 'flex-start', textAlign: 'left',
            borderRadius: 'var(--studio-radius-md)',
          }}>
            <Box aria-hidden sx={{ width: 40, height: 40, flex: 'none', borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--studio-p-soft)', color: 'var(--studio-primary-text)' }}>
              <PersonAddAlt1OutlinedIcon />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 700, color: 'var(--studio-ink)' }}>¿Primera vez? Dale de alta</Typography>
              <Typography sx={{ fontSize: '0.86rem', color: 'var(--studio-muted)' }}>Nombre y móvil, y sigues sin salir de aquí.</Typography>
            </Box>
          </ButtonBase>
        )}
      </Box>
    </Box>
  );
}
