// «Hoy en el estudio»: las clases del día en una línea de tiempo, con
// ocupación, iniciales de quién viene y la siguiente clase marcada.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, ButtonBase, IconButton, Skeleton, Typography } from '@mui/material';
import BlockRoundedIcon from '@mui/icons-material/BlockRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import HourglassEmptyRoundedIcon from '@mui/icons-material/HourglassEmptyRounded';
import { useClassTypeColor } from '../../design/classColors';
import { dashApi, type DayTimeline, type TimelineSession } from '../kit/api';
import { addDays, dayLabel } from '../kit/format';
import { AvatarStack, Card, CardHead, IBadge, Meter, Tag } from '../kit/ui';

const RANGE = 14;

function Row({ s, onOpen }: { s: TimelineSession; onOpen: () => void }) {
  const color = useClassTypeColor()(s.class_type_id);
  const full = s.booked >= s.capacity;
  const off = s.canceled || !!s.blackout;
  return (
    <Box component="li" sx={{ display: 'grid', gridTemplateColumns: { xs: '46px 14px minmax(0, 1fr)', sm: '60px 18px minmax(0, 1fr)' }, gap: { xs: 1, sm: 1.25 }, alignItems: 'stretch' }}>
      <Box sx={{ pt: 1.75, textAlign: 'right' }}>
        <Typography component="b" sx={{ display: 'block', fontWeight: 700, fontSize: '0.95rem', color: 'var(--studio-ink)', fontVariantNumeric: 'tabular-nums' }}>{s.start}</Typography>
        <Typography component="small" sx={{ fontSize: '0.76rem', color: 'var(--studio-muted)' }}>{s.duration} min</Typography>
      </Box>
      <Box aria-hidden sx={{ position: 'relative', display: 'flex', justifyContent: 'center', '&::before': { content: '""', position: 'absolute', top: 0, bottom: 0, width: 2, background: 'var(--studio-border-color)' } }}>
        <Box sx={{
          position: 'relative', mt: '21px', width: 12, height: 12, borderRadius: '50%',
          background: s.next ? 'var(--studio-primary-fill)' : s.past ? 'var(--studio-border-strong)' : 'var(--studio-surf)',
          border: '2px solid', borderColor: s.next ? 'var(--studio-primary-fill)' : 'var(--studio-border-strong)',
          boxShadow: s.next ? '0 0 0 5px var(--studio-p-soft)' : 'none',
        }} />
      </Box>
      <ButtonBase onClick={onOpen} aria-label={`${s.title} a las ${s.start}, ${s.booked} de ${s.capacity} plazas${s.next ? ', siguiente clase' : ''}`}
        sx={{
          display: 'flex', alignItems: 'center', gap: { xs: '8px 12px', sm: 1.75 }, flexWrap: { xs: 'wrap', sm: 'nowrap' }, justifyContent: 'flex-start',
          textAlign: 'left', width: '100%', my: 0.6, px: { xs: 1.5, sm: 1.75 }, py: 1.5, borderRadius: 'var(--studio-radius-md)',
          background: color.tint, color: 'var(--studio-ink)', opacity: s.past || off ? 0.72 : 1,
          border: 'var(--studio-border-width) solid transparent', transition: 'box-shadow .2s',
          '&:hover, &.Mui-focusVisible': { boxShadow: `inset 0 0 0 2px ${color.dot}` },
        }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', fontWeight: 700, fontSize: '0.98rem' }}>
            <span>{s.title}</span>
            {s.next && <Tag tone="p">Siguiente</Tag>}
            {s.past && !off && <Tag tone="n">Terminada</Tag>}
            {s.canceled && <Tag tone="bad">Cancelada</Tag>}
            {!s.canceled && s.blackout && <Tag tone="n">Cerrada</Tag>}
          </Box>
          <Typography sx={{ fontSize: '0.83rem', color: 'var(--studio-ink)', opacity: 0.82 }} noWrap>
            {[s.instructor && `con ${s.instructor}`, s.room].filter(Boolean).join(' · ')}
          </Typography>
        </Box>
        <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
          <AvatarStack people={s.people} total={s.people_total} />
        </Box>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'row', sm: 'column' }, alignItems: { xs: 'center', sm: 'flex-end' }, gap: 0.75, minWidth: { sm: 96 }, width: { xs: '100%', sm: 'auto' } }}>
          <Typography component="b" sx={{ fontWeight: 700, fontSize: '0.88rem', display: 'inline-flex', alignItems: 'center', gap: 0.75, fontVariantNumeric: 'tabular-nums', order: { xs: 2, sm: 0 } }}>
            {s.booked}/{s.capacity}
            {s.waitlist > 0 && (
              <Box component="span" title={`${s.waitlist} en lista de espera`} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, px: 0.75, borderRadius: 'var(--studio-radius-chip)', background: 'var(--studio-surf)', color: 'var(--studio-warn)', fontSize: '0.74rem' }}>
                <HourglassEmptyRoundedIcon sx={{ fontSize: 13 }} aria-hidden />+{s.waitlist}
              </Box>
            )}
          </Typography>
          <Box sx={{ flex: { xs: 1, sm: 'none' } }}>
            <Meter value={s.booked} max={s.capacity} full={full} label={`${s.booked} de ${s.capacity} plazas`} width="100%" />
          </Box>
        </Box>
      </ButtonBase>
    </Box>
  );
}

export default function Timeline({ initial, today }: { initial: DayTimeline | null; today: string }) {
  const navigate = useNavigate();
  const [offset, setOffset] = useState(0);
  const [day, setDay] = useState<DayTimeline | null>(initial);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (offset === 0) setDay(initial); }, [initial, offset]);

  useEffect(() => {
    if (offset === 0 || !today) return;
    let alive = true;
    setLoading(true);
    dashApi.day(addDays(today, offset))
      .then((d) => { if (alive) setDay(d); })
      .catch(() => { if (alive) setDay({ date: addDays(today, offset), is_today: false, closed: null, sessions: [] }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [offset, today]);

  const date = today ? addDays(today, offset) : '';
  const sessions = day && day.date === date ? day.sessions : null;

  return (
    <Card labelledBy="tl-h" id="tl-card">
      <CardHead id="tl-h" title={offset === 0 ? 'Hoy en el estudio' : 'En el estudio'} right={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton onClick={() => setOffset((o) => o - 1)} disabled={offset <= -RANGE} aria-label="Día anterior" sx={{ width: 44, height: 44 }}>
            <ChevronLeftRoundedIcon />
          </IconButton>
          <Typography component="b" aria-live="polite" sx={{ minWidth: { xs: 96, sm: 120 }, textAlign: 'center', fontWeight: 700, fontSize: '0.92rem', color: 'var(--studio-ink)' }}>
            {today ? dayLabel(date, today) : ''}
          </Typography>
          <IconButton onClick={() => setOffset((o) => o + 1)} disabled={offset >= RANGE} aria-label="Día siguiente" sx={{ width: 44, height: 44 }}>
            <ChevronRightRoundedIcon />
          </IconButton>
        </Box>
      } />
      {sessions === null || loading ? (
        [0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={64} sx={{ my: 1, borderRadius: 'var(--studio-radius-md)' }} />)
      ) : day?.closed ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 1, py: 2.5 }}>
          <IBadge tone="n" size={52} round><BlockRoundedIcon /></IBadge>
          <Typography sx={{ fontWeight: 700, color: 'var(--studio-ink)' }}>Cerrado{day.closed.reason ? ` · ${day.closed.reason}` : ''}</Typography>
          <Typography sx={{ color: 'var(--studio-muted)', fontSize: '0.92rem' }}>No hay clases este día.</Typography>
        </Box>
      ) : sessions.length === 0 ? (
        <Box sx={{ py: 2, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography sx={{ color: 'var(--studio-muted)', flex: 1 }}>Sin clases este día.</Typography>
          <Button variant="outlined" size="small" onClick={() => navigate('/calendar')}>Ir al calendario</Button>
        </Box>
      ) : (
        <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {sessions.map((s) => <Row key={s.id} s={s} onOpen={() => navigate('/calendar')} />)}
        </Box>
      )}
    </Card>
  );
}
